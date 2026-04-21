/**
 * Context Proximity Scorer — Layer 2 of the three-layer detection cascade.
 *
 * For every entity detected by regex or NER, scans a ±150 character window
 * for contextual keywords. Assigns confidence boosts or penalties based on
 * keyword proximity. Also performs a standalone context scan to catch
 * sensitive data that NER and regex both miss (euphemisms, indirect language).
 *
 * This is pure TypeScript — zero ML, <1ms execution, no dependencies.
 */

import type { Detection, DetectionType, Severity } from './detection';

const BOOST_KEYWORDS: Record<string, string[]> = {
  financial: [
    'salary', 'compensation', 'comp', 'annual', 'base pay', 'bonus',
    'equity', 'rsu', 'stock option', 'income', 'wages', 'earnings',
    'take-home', 'gross pay', 'net pay', 'w-2', 'w2', '1099', 'tax bracket',
    'total comp', 'tc is', 'my tc', 'offer letter', 'pay stub', 'payroll',
    'pay rate', 'hourly rate', 'per year', 'per annum', 'k a year',
    'k per year', 'annually', 'biweekly', 'direct deposit', 'severance',
    'golden parachute', 'signing bonus', 'retention bonus', 'vesting',
    'strike price', 'exercise price', 'ote', 'on-target earnings',
    'i make', 'i earn', 'they offered', 'package is', 'package was',
    'raise to', 'promoted to', 'new role pays', 'current comp',
  ],
  medical_record: [
    'diagnosed', 'prescribed', 'patient', 'symptoms', 'treatment',
    'surgery', 'condition', 'chronic', 'acute', 'prognosis', 'lab results',
    'vitals', 'medication', 'dosage', 'mg', 'twice daily', 'once daily',
    'medical record', 'mrn', 'chart', 'clinical', 'pathology',
    'biopsy', 'radiology', 'oncology', 'referral', 'discharge',
    'admission', 'emergency room', 'icu', 'nicu', 'hospice',
    'therapist', 'psychiatrist', 'counselor', 'diagnosis code',
    'icd-', 'cpt-', 'hipaa', 'phi', 'protected health',
    'blood pressure', 'heart rate', 'bmi', 'glucose', 'cholesterol',
    'hemoglobin', 'white blood cell', 'platelet', 'creatinine',
  ],
  legal_amount: [
    'settlement', 'plaintiff', 'defendant', 'confidential', 'privileged',
    'attorney-client', 'under seal', 'nda', 'non-disclosure',
    'litigation', 'arbitration', 'mediation', 'damages', 'liability',
    'indemnification', 'breach', 'clause', 'stipulation', 'deposition',
    'discovery', 'subpoena', 'court order', 'judgment', 'verdict',
  ],
  person_name: [
    'patient', 'client', 'employee', 'applicant', 'candidate',
    'resident', 'beneficiary', 'dependent', 'spouse', 'minor',
    'subscriber', 'policyholder', 'account holder', 'cardholder',
    'user', 'member', 'contact', 'next of kin', 'guardian',
    'emergency contact', 'primary care', 'referred by', 'ssn',
    'date of birth', 'dob', 'social security', 'passport', 'license',
  ],
  address: [
    'lives at', 'resides at', 'home address', 'mailing address',
    'shipping address', 'billing address', 'residence', 'apartment',
    'suite', 'unit', 'floor', 'zip code', 'postal code', 'zip',
    'deliver to', 'ship to', 'send to', 'located at', 'office at',
    'street address', 'physical address',
  ],
  identity_document: [
    'passport', 'passport number', 'driver license', 'drivers license',
    'license number', 'dl number', 'state id', 'national id',
    'government id', 'identity card', 'id number', 'document number',
    'issued by', 'expiration date', 'date of issue', 'country of issue',
    'travel document', 'visa number', 'green card', 'work permit',
  ],
};

const SUPPRESS_KEYWORDS: Record<string, string[]> = {
  financial: [
    'product price', 'costs', 'revenue', 'market cap', 'stock price',
    'fundraise', 'raised', 'investment round', 'list price', 'msrp',
    'retail price', 'wholesale', 'budget', 'forecast', 'projection',
    'quarterly revenue', 'annual revenue', 'total revenue',
    'operating cost', 'overhead', 'price tag', 'discount', 'coupon',
    'valuation', 'series a', 'series b', 'seed round', 'ipo',
    'market value', 'enterprise value', 'gdp', 'inflation',
  ],
  person_name: [
    'character', 'fictional', 'protagonist', 'antagonist', 'author',
    'wrote', 'novel', 'movie', 'film', 'tv show', 'series',
    'played by', 'starring', 'directed by', 'produced by',
    'example', 'placeholder', 'test data', 'sample', 'demo',
  ],
  medical_record: [
    'in the show', 'fictional', 'character', 'plot', 'storyline',
    'article about', 'research on', 'study finds', 'according to',
    'wikipedia', 'webmd', 'general information',
  ],
};

// -- Standalone context patterns for things NER and regex both miss --

interface ContextPattern {
  valuePattern: RegExp;
  contextKeywords: string[];
  maxDistance: number;
  type: DetectionType;
  displayName: string;
  severity: Severity;
  confidence: number;
}

const CONTEXT_PATTERNS: ContextPattern[] = [
  {
    valuePattern: /\$?\d{2,3}[,.]?\d{0,3}\s*[kK]\b|\$\d{1,3}(?:,\d{3})+|\$\d{4,}/g,
    contextKeywords: [
      'salary', 'compensation', 'comp', 'make', 'earn', 'offer',
      'package', 'tc', 'total comp', 'base', 'pay', 'income',
      'annually', 'per year', 'a year', 'raise', 'promoted',
    ],
    maxDistance: 120,
    type: 'financial' as DetectionType,
    displayName: 'Financial Information',
    severity: 'high' as Severity,
    confidence: 0.85,
  },
  {
    valuePattern: /(?:diagnosed with|suffers from|treated for|presenting with|history of|positive for|tested positive for|confirmed case of)\s+[\w\s]{3,50}(?=\.|,|;|\n|$)/gi,
    contextKeywords: [
      'patient', 'medical', 'clinical', 'hospital', 'doctor',
      'physician', 'nurse', 'chart', 'record', 'treatment',
    ],
    maxDistance: 200,
    type: 'medical_record' as DetectionType,
    displayName: 'Medical Record',
    severity: 'high' as Severity,
    confidence: 0.90,
  },
  {
    valuePattern: /\$\d[\d,.]*\s*(?:million|billion|[mMbB]\b)/g,
    contextKeywords: [
      'settlement', 'awarded', 'damages', 'judgment', 'verdict',
      'plaintiff', 'defendant', 'lawsuit', 'litigation', 'court',
      'confidential', 'sealed', 'nda',
    ],
    maxDistance: 150,
    type: 'financial' as DetectionType,
    displayName: 'Financial Information',
    severity: 'high' as Severity,
    confidence: 0.88,
  },
  {
    valuePattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    contextKeywords: [
      'server', 'internal', 'vpn', 'firewall', 'ssh', 'database',
      'production', 'staging', 'private', 'intranet', 'network',
      'connect to', 'host', 'endpoint', 'api server',
    ],
    maxDistance: 100,
    type: 'ip_address' as DetectionType,
    displayName: 'IP Address',
    severity: 'medium' as Severity,
    confidence: 0.82,
  },
  {
    valuePattern: /\b(?:Dr|Mr|Mrs|Ms|Prof|Rev|Sr|Jr)\.?\s+[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){1,2}\b/g,
    contextKeywords: [
      'patient', 'client', 'employee', 'applicant', 'meeting',
      'schedule', 'appointment', 'referred', 'contact', 'resident',
      'beneficiary', 'spouse', 'guardian', 'account holder',
      'policyholder', 'subscriber', 'cardholder', 'dependent',
      'diagnosed', 'prescribed', 'treatment', 'record', 'dob',
      'ssn', 'passport', 'license', 'address', 'phone',
    ],
    maxDistance: 200,
    type: 'person_name' as DetectionType,
    displayName: 'Person Name',
    severity: 'medium' as Severity,
    confidence: 0.90,
  },
  {
    valuePattern: /\b[A-Z][a-z]{1,20}\s+[A-Z][a-z]{1,20}\b/g,
    contextKeywords: [
      'patient', 'client', 'employee', 'applicant', 'meeting with',
      'schedule', 'appointment', 'referred by', 'emergency contact',
      'next of kin', 'guardian', 'beneficiary', 'diagnosed',
      'prescribed', 'treatment', 'dob', 'date of birth', 'ssn',
      'social security', 'passport', 'mrn', 'medical record',
      'account holder', 'policyholder', 'her patient', 'his patient',
    ],
    maxDistance: 150,
    type: 'person_name' as DetectionType,
    displayName: 'Person Name',
    severity: 'medium' as Severity,
    confidence: 0.85,
  },
];

// -- Core scoring functions --

const CONTEXT_WINDOW = 150;

function proximityScore(distance: number, maxWindow: number): number {
  if (distance <= 0) return 1.0;
  if (distance >= maxWindow) return 0.0;
  return 1.0 - (distance / maxWindow);
}

function minKeywordDistance(
  text: string, keyword: string,
  detStart: number, detEnd: number, windowSize: number,
): number {
  const searchStart = Math.max(0, detStart - windowSize);
  const searchEnd = Math.min(text.length, detEnd + windowSize);
  const window = text.slice(searchStart, searchEnd).toLowerCase();
  const kwLower = keyword.toLowerCase();
  let minDist = Infinity;
  let idx = window.indexOf(kwLower);
  while (idx !== -1) {
    const absPos = searchStart + idx;
    const dist = absPos < detStart
      ? detStart - (absPos + kwLower.length)
      : absPos > detEnd ? absPos - detEnd : 0;
    if (Math.max(0, dist) < minDist) minDist = Math.max(0, dist);
    idx = window.indexOf(kwLower, idx + 1);
  }
  return minDist;
}

// -- Public API --

export function scoreDetectionContext(text: string, detections: Detection[]): Detection[] {
  for (const det of detections) {
    const typeKey = det.type as string;
    const boostKws = BOOST_KEYWORDS[typeKey] || [];
    let bestBoost = 0;
    for (const kw of boostKws) {
      const dist = minKeywordDistance(text, kw, det.start, det.end, CONTEXT_WINDOW);
      if (dist < Infinity) {
        const score = proximityScore(dist, CONTEXT_WINDOW);
        if (score > bestBoost) bestBoost = score;
      }
    }
    const suppressKws = SUPPRESS_KEYWORDS[typeKey] || [];
    let bestSuppress = 0;
    for (const kw of suppressKws) {
      const dist = minKeywordDistance(text, kw, det.start, det.end, CONTEXT_WINDOW);
      if (dist < Infinity) {
        const score = proximityScore(dist, CONTEXT_WINDOW);
        if (score > bestSuppress) bestSuppress = score;
      }
    }
    let adjusted = det.confidence;
    if (bestBoost > 0) {
      adjusted = Math.min(1.0, adjusted + (1.0 - adjusted) * bestBoost * 0.4);
    }
    if (bestSuppress > 0) {
      adjusted = Math.max(0.0, adjusted - adjusted * bestSuppress * 0.5);
    }
    det.confidence = Math.round(adjusted * 1000) / 1000;
  }
  return detections;
}

export function scanForContextualDetections(
  text: string, existingDetections: Detection[],
): Detection[] {
  const newDetections: Detection[] = [];
  for (const pattern of CONTEXT_PATTERNS) {
    pattern.valuePattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.valuePattern.exec(text)) !== null) {
      const matchStart = match.index;
      const matchEnd = match.index + match[0].length;
      const alreadyCovered = existingDetections.some(
        (d) => d.start <= matchStart && d.end >= matchEnd,
      );
      if (alreadyCovered) continue;
      let bestContextScore = 0;
      for (const kw of pattern.contextKeywords) {
        const dist = minKeywordDistance(text, kw, matchStart, matchEnd, pattern.maxDistance);
        if (dist < Infinity) {
          const score = proximityScore(dist, pattern.maxDistance);
          if (score > bestContextScore) bestContextScore = score;
        }
      }
      if (bestContextScore >= 0.3) {
        const adjustedConfidence = Math.round(pattern.confidence * bestContextScore * 1000) / 1000;
        if (adjustedConfidence >= 0.5) {
          newDetections.push({
            type: pattern.type,
            displayName: pattern.displayName,
            severity: pattern.severity,
            start: matchStart,
            end: matchEnd,
            confidence: adjustedConfidence,
          });
        }
      }
    }
  }
  return newDetections;
}

export function applyContextProximityScoring(text: string, detections: Detection[]): Detection[] {
  scoreDetectionContext(text, detections);
  const contextDetections = scanForContextualDetections(text, detections);
  if (contextDetections.length > 0) {
    console.log(`[Obfusca Context] Found ${contextDetections.length} new context-based detections`);
  }
  const merged = [...detections];
  for (const cd of contextDetections) {
    const overlaps = merged.some(
      (d) => (cd.start >= d.start && cd.start < d.end) ||
             (cd.end > d.start && cd.end <= d.end) ||
             (cd.start <= d.start && cd.end >= d.end),
    );
    if (!overlaps) merged.push(cd);
  }
  const filtered = merged.filter((d) => d.confidence >= 0.3);
  filtered.sort((a, b) => a.start - b.start);
  return filtered;
}
