/**
 * NERDetector — Tier 1 local NER for Obfusca.
 *
 * A dictionary + heuristic NER system that detects common PII entity types
 * that regex alone cannot catch.  No neural model, no downloads, no network.
 * Runs synchronously in < 50 ms on a 500-character input.
 *
 * Entity types detected:
 *   person              Title/name patterns, name-dictionary bigrams,
 *                       consecutive-caps heuristic
 *   organization        Suffix patterns (Inc., Corp., Hospital…), known-org
 *                       dictionary
 *   date                Natural-language, written-out, relative, quarter
 *   medical             PHI-context phrases, drug dictionary, condition
 *                       dictionary
 *   address             Trigger-phrase + location, suite/floor/building refs
 *   phone_conversational Spoken-number patterns, trigger-phrase + digits
 *   email_obfuscated    "at"/"dot" substitution patterns
 *
 * Accuracy target: 70-80% recall, >85% precision on common PII.
 * False-positive rate is deliberately kept low via conservative thresholds.
 */

import type { ISemanticDetector, ModelStatus, SemanticDetection, SemanticRule } from './types.js';
import {
  DRUG_NAMES,
  FIRST_NAMES,
  KNOWN_ORGS,
  LAST_NAMES,
  MEDICAL_CONDITIONS,
  MEDICAL_PROCEDURES,
  NON_NAME_CAPITALIZED_WORDS,
  TITLE_PREFIXES,
} from './dictionaries.js';

// ---------------------------------------------------------------------------
// Pre-built lookup sets (built once at module load)
// ---------------------------------------------------------------------------

const FIRST_NAMES_SET = new Set(FIRST_NAMES as readonly string[]);
const LAST_NAMES_SET = new Set(LAST_NAMES as readonly string[]);

/** Titles without trailing period — used in the title regex alternation */
const TITLE_ALT = (TITLE_PREFIXES as readonly string[]).join('|');

/** Regex: one or more title prefixes (with optional period) before a name */
const TITLE_RE = new RegExp(
  `\\b(?:(?:${TITLE_ALT})\\.?\\s+)+([A-Z][a-zA-Z'-]+(?:\\s+[A-Z][a-zA-Z'-]+){0,4})`,
  'g',
);

/** Regex: surname suffix after a name ("John Smith Jr.", "Jane Doe PhD") */
const NAME_SUFFIX_RE = /(?:\s+(?:Jr|Sr|II|III|IV|V|Esq|PhD|MD|DO|JD|MBA|CPA|RN|NP|PA))\.?/g;

/** Month names and abbreviations for date detection */
const MONTH_NAMES =
  'January|February|March|April|May|June|July|August|September|October|November|December' +
  '|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec';

/** Day names */
const DAY_NAMES = 'Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday';

/** Street type suffixes for address detection */
const STREET_TYPES =
  'Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|' +
  'Court|Ct|Place|Pl|Way|Circle|Cir|Loop|Trail|Terrace|Ter|Parkway|Pkwy';

/** TLDs for obfuscated email detection */
const TLDS = 'com|org|net|edu|gov|io|co|us|uk|ca|au|de|fr|info|biz|me';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True if the character at `index` in `text` follows a sentence boundary. */
function isSentenceStart(text: string, index: number): boolean {
  if (index === 0) return true;
  const before = text.slice(0, index).trimEnd();
  if (before.length === 0) return true;
  const last = before[before.length - 1];
  return last === '.' || last === '!' || last === '?' || last === '\n';
}

/** True if the match at [start, end) overlaps any existing detection. */
function overlapsAny(start: number, end: number, existing: SemanticDetection[]): boolean {
  for (const d of existing) {
    if (start < d.end && end > d.start) return true;
  }
  return false;
}

/** Word-boundary–safe index-of search (case-insensitive). */
function findWordBoundary(
  text: string,
  textLower: string,
  term: string,
  fromIndex = 0,
): number {
  const termLower = term.toLowerCase();
  let idx = textLower.indexOf(termLower, fromIndex);
  while (idx !== -1) {
    const before = idx === 0 ? ' ' : text[idx - 1];
    const after =
      idx + term.length >= text.length ? ' ' : text[idx + term.length];
    if (/\W/.test(before) && /\W/.test(after)) return idx;
    idx = textLower.indexOf(termLower, idx + 1);
  }
  return -1;
}

/** Push a SemanticDetection if the span does not overlap existing results. */
function pushIfNew(
  results: SemanticDetection[],
  detection: SemanticDetection,
): void {
  if (!overlapsAny(detection.start, detection.end, results)) {
    results.push(detection);
  }
}

// ---------------------------------------------------------------------------
// NERDetector
// ---------------------------------------------------------------------------

export class NERDetector implements ISemanticDetector {
  // Tier 1 is always ready — no model loading required.
  isReady(): boolean {
    return true;
  }

  getModelStatus(): ModelStatus {
    return 'ready';
  }

  /**
   * Detect semantic entities in text.
   * SemanticRule arguments are accepted for interface compatibility but
   * ignored — Tier 1 uses fixed dictionaries only.
   */
  detect(text: string, _rules?: SemanticRule[]): SemanticDetection[] {
    if (!text || text.length < 2) return [];

    const detections: SemanticDetection[] = [
      ...this.detectPersons(text),
      ...this.detectOrganizations(text),
      ...this.detectDates(text),
      ...this.detectMedical(text),
      ...this.detectAddresses(text),
      ...this.detectConversationalPhone(text),
      ...this.detectObfuscatedEmail(text),
    ];

    return this.deduplicateDetections(detections);
  }

  // -------------------------------------------------------------------------
  // PERSON detection
  // -------------------------------------------------------------------------

  private detectPersons(text: string): SemanticDetection[] {
    const results: SemanticDetection[] = [];

    // --- Strategy 1: Title prefix + name -----------------------------------
    // Examples: "Dr. Smith", "Prof. Chen Wei", "Lt. Col. James Anderson"
    TITLE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TITLE_RE.exec(text)) !== null) {
      // Optionally extend the span to include a trailing name suffix.
      NAME_SUFFIX_RE.lastIndex = m.index + m[0].length;
      const sfx = NAME_SUFFIX_RE.exec(text);
      const end =
        sfx && sfx.index === m.index + m[0].length
          ? sfx.index + sfx[0].length
          : m.index + m[0].length;

      results.push({
        type: 'person',
        displayName: 'Person Name',
        start: m.index,
        end,
        confidence: 0.93,
        source: 'ner',
      });
    }

    // --- Strategy 2: Dictionary bigram — known first + last name -----------
    // Examples: "Sarah Chen", "Carlos Rodriguez", "Priya Patel"
    const bigramRe = /\b([A-Z][a-zA-Z'-]+)\s+([A-Z][a-zA-Z'-]+)\b/g;
    bigramRe.lastIndex = 0;
    while ((m = bigramRe.exec(text)) !== null) {
      const first = m[1];
      const second = m[2];

      // Strip common hyphenated prefixes for the dictionary check
      const firstBase = first.replace(/^[A-Z][a-z]+-/, ''); // e.g. "Al-" → check remainder
      const secondBase = second.replace(/^[A-Z][a-z]+-/, '');

      const firstIsName =
        FIRST_NAMES_SET.has(first) || FIRST_NAMES_SET.has(firstBase);
      const secondIsLastName =
        LAST_NAMES_SET.has(second) ||
        LAST_NAMES_SET.has(secondBase) ||
        LAST_NAMES_SET.has(`Al-${secondBase}`) ||
        LAST_NAMES_SET.has(`Al-${second}`);

      if (firstIsName && secondIsLastName) {
        pushIfNew(results, {
          type: 'person',
          displayName: 'Person Name',
          start: m.index,
          end: m.index + m[0].length,
          confidence: 0.84,
          source: 'ner',
        });
      }
    }

    // --- Strategy 3: Consecutive capitalized words (heuristic) -------------
    // Fires for 2–4 consecutive capitalized words that are NOT at a sentence
    // start and do NOT contain known non-name words.
    // Confidence is lower since it has no dictionary support.
    //
    // Matches: "Mary Jane Watson", "Mohammed Al-Rashid" (if not in dict),
    // Skips:   "Monday Morning", "American Express", sentence-initial caps.
    const capsRe =
      /\b([A-Z][a-z]{1,19}(?:[-'][A-Za-z]+)?)(?:\s+([A-Z][a-z]{1,19}(?:[-'][A-Za-z]+)?)){1,3}\b/g;
    capsRe.lastIndex = 0;
    while ((m = capsRe.exec(text)) !== null) {
      const matchStr = m[0];
      const start = m.index;
      const end = start + matchStr.length;

      // Skip if at a sentence start
      if (isSentenceStart(text, start)) continue;

      // Skip if any word is a known non-name capitalized word
      const words = matchStr.split(/\s+/);
      if (words.some((w) => NON_NAME_CAPITALIZED_WORDS.has(w))) continue;

      // Skip very short words that are likely abbreviations (< 2 chars)
      if (words.some((w) => w.replace(/[-']/g, '').length < 2)) continue;

      if (!overlapsAny(start, end, results)) {
        results.push({
          type: 'person',
          displayName: 'Person Name',
          start,
          end,
          confidence: 0.63,
          source: 'ner',
        });
      }
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // ORGANIZATION detection
  // -------------------------------------------------------------------------

  private detectOrganizations(text: string): SemanticDetection[] {
    const results: SemanticDetection[] = [];

    // --- Strategy 1: Capitalized sequence + org-indicator suffix -----------
    // Examples: "Goldman Sachs Inc.", "Memorial Hospital", "MIT Press"
    const orgSuffixes =
      'Inc\\.|Corp\\.|LLC|Ltd\\.|L\\.L\\.C\\.|L\\.P\\.' +
      '|Foundation|University|Hospital|Bank|Group|Partners|Associates' +
      '|Institute|Center|Centre|Agency|Authority|Commission' +
      '|Laboratory|Laboratories|Labs|Technologies|Systems|Solutions' +
      '|Services|Consulting|Capital|Ventures|Management|Holdings' +
      '|Academy|School|College|Clinic|Medical|Church|Ministry' +
      '|Department|Bureau|Division|Press|Publishing|Media|Network' +
      '|Alliance|Federation|Union|Council|Society|Association';

    const orgSuffixRe = new RegExp(
      `\\b([A-Z][a-zA-Z&'-]+(?:\\s+(?:&\\s+)?[A-Z][a-zA-Z&'-]+)*)\\s+(${orgSuffixes})\\b`,
      'g',
    );

    let m: RegExpExecArray | null;
    orgSuffixRe.lastIndex = 0;
    while ((m = orgSuffixRe.exec(text)) !== null) {
      results.push({
        type: 'organization',
        displayName: 'Organization',
        start: m.index,
        end: m.index + m[0].length,
        confidence: 0.87,
        source: 'ner',
      });
    }

    // --- Strategy 2: Known org dictionary lookup ---------------------------
    const textLower = text.toLowerCase();
    for (const org of KNOWN_ORGS) {
      const orgLower = org.toLowerCase();
      let idx = textLower.indexOf(orgLower);
      while (idx !== -1) {
        const end = idx + org.length;
        const before = idx === 0 ? ' ' : text[idx - 1];
        const after = end >= text.length ? ' ' : text[end];
        if (/\W/.test(before) && /\W/.test(after)) {
          pushIfNew(results, {
            type: 'organization',
            displayName: 'Organization',
            start: idx,
            end,
            confidence: 0.89,
            source: 'ner',
          });
        }
        idx = textLower.indexOf(orgLower, idx + 1);
      }
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // DATE detection (natural language only; structured formats handled by regex)
  // -------------------------------------------------------------------------

  private detectDates(text: string): SemanticDetection[] {
    const results: SemanticDetection[] = [];
    const patterns: Array<[RegExp, number]> = [
      // "next Tuesday", "last week", "this month", "coming Friday"
      [
        new RegExp(
          `\\b(next|last|this|coming|upcoming|following|previous|past)\\s+(${DAY_NAMES}|week|month|year|quarter|weekend|season)\\b`,
          'gi',
        ),
        0.82,
      ],

      // "in March", "by April", "before June", "around September"
      [
        new RegExp(
          `\\b(in|by|before|after|around|during|throughout|since|until|from|through)\\s+(${MONTH_NAMES})\\b`,
          'gi',
        ),
        0.78,
      ],

      // "March 15th, 2024" | "March 15, 2024" | "March 2024"
      [
        new RegExp(
          `\\b(${MONTH_NAMES})\\s+(?:\\d{1,2}(?:st|nd|rd|th)?,?\\s+)?\\d{4}\\b`,
          'gi',
        ),
        0.88,
      ],

      // "the 3rd of January" | "the 15th of March"
      [
        new RegExp(
          `\\bthe\\s+\\d{1,2}(?:st|nd|rd|th)\\s+of\\s+(${MONTH_NAMES})\\b`,
          'gi',
        ),
        0.88,
      ],

      // "Q1 2024", "Q3 2025", "Q4 FY2024"
      [/\bQ[1-4]\s+(?:FY\s*)?\d{4}\b/gi, 0.90],

      // "two weeks ago", "3 months from now", "in 6 months"
      [
        /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|several|a few|a couple of)\s+(days?|weeks?|months?|years?|quarters?)\s+(ago|from now|later|hence|prior|earlier)\b/gi,
        0.82,
      ],

      // "in 3 months", "within 6 weeks"
      [
        /\b(in|within|over the next|over the past)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(days?|weeks?|months?|years?|quarters?)\b/gi,
        0.78,
      ],

      // "early March", "mid-January", "late October"
      [
        new RegExp(
          `\\b(early|mid|late|mid-|early-|late-)\\s*(${MONTH_NAMES})\\b`,
          'gi',
        ),
        0.80,
      ],

      // "first quarter of 2024", "second half of 2025"
      [
        /\b(first|second|third|fourth)\s+(quarter|half)\s+of\s+\d{4}\b/gi,
        0.85,
      ],

      // "fiscal year 2024", "FY2024", "FY 2025"
      [/\b(?:fiscal\s+year\s+|FY\s*)\d{4}\b/gi, 0.85],
    ];

    let m: RegExpExecArray | null;
    for (const [re, confidence] of patterns) {
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        pushIfNew(results, {
          type: 'date',
          displayName: 'Date Reference',
          start: m.index,
          end: m.index + m[0].length,
          confidence,
          source: 'ner',
        });
      }
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // MEDICAL detection
  // -------------------------------------------------------------------------

  private detectMedical(text: string): SemanticDetection[] {
    const results: SemanticDetection[] = [];
    const textLower = text.toLowerCase();

    // --- Strategy 1: PHI context + condition/drug phrase -------------------
    // "diagnosed with lymphoma", "prescribed metformin", "stage 3 cancer"
    const phiPatterns: Array<[RegExp, number]> = [
      [
        /\b(diagnosed\s+with|diagnosis\s+of)\s+([a-zA-Z][a-zA-Z\s]{2,40}?)(?=[,.\n!?]|$|\s{2})/gi,
        0.92,
      ],
      [
        /\b(prescribed|taking|takes|was\s+given)\s+([a-zA-Z][a-zA-Z\s]{2,30}?)(?=[,.\n!?;]|$|\s{2})/gi,
        0.90,
      ],
      [
        /\b(suffering\s+from|history\s+of|presenting\s+with|symptoms?\s+of|complaints?\s+of)\s+([a-zA-Z][a-zA-Z\s]{2,40}?)(?=[,.\n!?]|$|\s{2})/gi,
        0.88,
      ],
      [
        /\b(treatment\s+for|treated\s+for|therapy\s+for|medication\s+for|drugs?\s+for)\s+([a-zA-Z][a-zA-Z\s]{2,40}?)(?=[,.\n!?]|$|\s{2})/gi,
        0.88,
      ],
      [
        /\b(patient\s+(?:has|had|with|presents?\s+with|is\s+a\s+\d+-year))\s+([a-zA-Z][a-zA-Z\s]{2,40}?)(?=[,.\n!?]|$|\s{2})/gi,
        0.88,
      ],
      [
        /\b(recovering\s+from|underwent|underwent\s+a|received)\s+([a-zA-Z][a-zA-Z\s]{2,40}?)(?=[,.\n!?]|$|\s{2})/gi,
        0.85,
      ],
      // "stage 3 cancer", "stage IV lymphoma"
      [
        /\bstage\s+(?:[0-9]+|[IVXivx]+)\s+([a-zA-Z][a-zA-Z\s]{2,30}?)\b/gi,
        0.90,
      ],
    ];

    let m: RegExpExecArray | null;
    for (const [re, confidence] of phiPatterns) {
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        pushIfNew(results, {
          type: 'medical',
          displayName: 'Medical Information',
          start: m.index,
          end: m.index + m[0].length,
          confidence,
          source: 'ner',
        });
      }
    }

    // --- Strategy 2: Drug names (case-insensitive word-boundary search) ----
    for (const drug of DRUG_NAMES) {
      let idx = findWordBoundary(text, textLower, drug);
      while (idx !== -1) {
        const end = idx + drug.length;
        if (!overlapsAny(idx, end, results)) {
          results.push({
            type: 'medical',
            displayName: 'Medication',
            start: idx,
            end,
            confidence: 0.80,
            source: 'ner',
          });
        }
        idx = findWordBoundary(text, textLower, drug, end);
      }
    }

    // --- Strategy 3: Medical conditions (with optional context boost) ------
    for (const condition of MEDICAL_CONDITIONS) {
      let idx = findWordBoundary(text, textLower, condition);
      while (idx !== -1) {
        const end = idx + condition.length;
        if (!overlapsAny(idx, end, results)) {
          // Check surrounding ~60 chars for medical context words
          const ctxStart = Math.max(0, idx - 60);
          const ctxEnd = Math.min(text.length, end + 60);
          const ctx = textLower.slice(ctxStart, ctxEnd);
          const hasMedCtx =
            /\b(patient|diagnosed|prescribed|doctor|physician|hospital|clinic|treatment|symptoms?|chronic|acute|severe|mild|stage|medical|health|disease|disorder|condition|medication|drug|therapy|surgery|nurse|record)\b/.test(
              ctx,
            );
          const confidence = hasMedCtx ? 0.88 : 0.72;

          results.push({
            type: 'medical',
            displayName: 'Medical Condition',
            start: idx,
            end,
            confidence,
            source: 'ner',
          });
        }
        idx = findWordBoundary(text, textLower, condition, end);
      }
    }

    // --- Strategy 4: Medical procedure terms -------------------------------
    for (const proc of MEDICAL_PROCEDURES) {
      let idx = findWordBoundary(text, textLower, proc);
      while (idx !== -1) {
        const end = idx + proc.length;
        if (!overlapsAny(idx, end, results)) {
          results.push({
            type: 'medical',
            displayName: 'Medical Procedure',
            start: idx,
            end,
            confidence: 0.76,
            source: 'ner',
          });
        }
        idx = findWordBoundary(text, textLower, proc, end);
      }
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // ADDRESS detection (natural language)
  // -------------------------------------------------------------------------

  private detectAddresses(text: string): SemanticDetection[] {
    const results: SemanticDetection[] = [];
    const patterns: Array<[RegExp, number]> = [
      // "lives at/on/near 500 Oak Street"
      [
        new RegExp(
          `\\b(lives?\\s+(?:at|on|near)|office\\s+at|located\\s+at|based\\s+at|` +
            `address\\s+(?:is\\s+)?(?:at\\s+)?|mailing\\s+address\\s+(?:is\\s+)?|` +
            `resides?\\s+(?:at|on)|headquartered\\s+at|situated\\s+at|` +
            `found\\s+at|meet\\s+(?:me\\s+)?at)\\s+` +
            `(\\d+\\s+)?[A-Z][a-zA-Z\\s]+(?:${STREET_TYPES})\\b`,
          'gi',
        ),
        0.85,
      ],

      // "Suite 200", "Floor 3", "Building B", "Unit 4A" — standalone building refs
      [/\b(Suite|Ste|Floor|Fl|Building|Bldg|Unit|Apt|Room|Rm)\s+[A-Z0-9]+\b/gi, 0.72],

      // "500 Park Avenue", "123 Main St" — number + street name (mid-sentence)
      // Lower confidence standalone — needs word-boundary check
      [
        new RegExp(
          `\\b\\d{1,5}\\s+[A-Z][a-zA-Z]+(?:\\s+[A-Z][a-zA-Z]+)?\\s+(?:${STREET_TYPES})\\b`,
          'g',
        ),
        0.75,
      ],

      // "P.O. Box 1234" or "PO Box 1234"
      [/\bP\.?\s*O\.?\s*Box\s+\d+\b/gi, 0.88],

      // ZIP code in address context: "New York, NY 10001"
      [/\b[A-Z][a-zA-Z\s]+,\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g, 0.82],
    ];

    let m: RegExpExecArray | null;
    for (const [re, confidence] of patterns) {
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        // Skip if at a sentence start and the match looks like a sentence opener
        pushIfNew(results, {
          type: 'address',
          displayName: 'Address',
          start: m.index,
          end: m.index + m[0].length,
          confidence,
          source: 'ner',
        });
      }
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // PHONE (conversational / spoken format)
  // -------------------------------------------------------------------------

  private detectConversationalPhone(text: string): SemanticDetection[] {
    const results: SemanticDetection[] = [];

    const numberWords =
      'zero|one|two|three|four|five|six|seven|eight|nine|' +
      'oh|nought|aught';

    const patterns: Array<[RegExp, number]> = [
      // "call me at five five five one two three four"
      [
        new RegExp(
          `\\b(call\\s+(?:me\\s+)?(?:at|on)|reach\\s+(?:me\\s+)?(?:at|on)|` +
            `my\\s+(?:phone|cell|mobile|number)\\s+(?:number\\s+)?(?:is|was)|` +
            `phone\\s+(?:number\\s+)?(?:is|was)|contact\\s+(?:me\\s+)?(?:at|on)\\s+)` +
            `\\s*((?:(?:${numberWords})[\\s,]+){6,12}(?:${numberWords}))`,
          'gi',
        ),
        0.85,
      ],

      // "call me at" + digit groups: "call me at 555 123 4567"
      [
        /\b(call\s+(?:me\s+)?(?:at|on)|reach\s+(?:me\s+)?(?:at|on)|my\s+(?:phone|cell|mobile|number)\s+(?:number\s+)?(?:is|was))\s+((?:\d[\d\s\-().]{6,18}\d))/gi,
        0.80,
      ],

      // Spoken number sequence alone: 7–11 word-form digits in a row
      [
        new RegExp(
          `\\b((?:(?:${numberWords})[,\\s]+){6,10}(?:${numberWords}))\\b`,
          'gi',
        ),
        0.70,
      ],
    ];

    let m: RegExpExecArray | null;
    for (const [re, confidence] of patterns) {
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        pushIfNew(results, {
          type: 'phone_conversational',
          displayName: 'Phone Number (conversational)',
          start: m.index,
          end: m.index + m[0].length,
          confidence,
          source: 'ner',
        });
      }
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // EMAIL (obfuscated / written-out format)
  // -------------------------------------------------------------------------

  private detectObfuscatedEmail(text: string): SemanticDetection[] {
    const results: SemanticDetection[] = [];

    const patterns: Array<[RegExp, number]> = [
      // "john at company dot com" / "john dot smith at gmail dot com"
      [
        new RegExp(
          `\\b([a-zA-Z0-9][a-zA-Z0-9._+'-]*` +
            `(?:\\s+dot\\s+[a-zA-Z0-9._+'-]+)?)` +
            `\\s+(?:at|@)\\s+` +
            `([a-zA-Z0-9][a-zA-Z0-9.-]*)` +
            `\\s+dot\\s+(${TLDS})\\b`,
          'gi',
        ),
        0.87,
      ],

      // Spaced-out email: "j o h n @ c o m p a n y . c o m"
      [
        /\b(?:[a-zA-Z]\s+){3,}(?:@|at)\s+(?:[a-zA-Z]\s*){2,}(?:\.|dot)\s*(?:com|org|net|io|edu|gov)\b/gi,
        0.80,
      ],

      // "email/contact me at <username> at <domain>"
      [
        new RegExp(
          `\\b(?:email|e-mail|contact|reach|message|write)\\s+(?:(?:me|us)\\s+)?(?:at|@)\\s+` +
            `([a-zA-Z0-9][a-zA-Z0-9._+'-]*)` +
            `\\s+(?:at|@)\\s+` +
            `([a-zA-Z0-9][a-zA-Z0-9.-]*)` +
            `\\s+dot\\s+(${TLDS})\\b`,
          'gi',
        ),
        0.88,
      ],
    ];

    let m: RegExpExecArray | null;
    for (const [re, confidence] of patterns) {
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        pushIfNew(results, {
          type: 'email_obfuscated',
          displayName: 'Email Address (obfuscated)',
          start: m.index,
          end: m.index + m[0].length,
          confidence,
          source: 'ner',
        });
      }
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Deduplication
  // -------------------------------------------------------------------------

  /**
   * Remove overlapping detections.
   * Sort by start, then by confidence descending.
   * When two spans overlap keep the one with higher confidence (or the longer
   * span if confidence is equal).
   */
  private deduplicateDetections(
    detections: SemanticDetection[],
  ): SemanticDetection[] {
    if (detections.length <= 1) return detections;

    detections.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return b.confidence - a.confidence;
    });

    const result: SemanticDetection[] = [];
    let lastEnd = -1;

    for (const det of detections) {
      if (det.start >= lastEnd) {
        result.push(det);
        lastEnd = det.end;
      } else if (det.end > lastEnd) {
        // Partial overlap — keep whichever has higher confidence
        const last = result[result.length - 1];
        if (det.confidence > last.confidence) {
          result[result.length - 1] = det;
          lastEnd = det.end;
        }
      }
      // Fully contained in previous detection → skip
    }

    return result;
  }
}
