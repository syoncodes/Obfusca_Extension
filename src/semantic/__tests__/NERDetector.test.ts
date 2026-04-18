/**
 * NERDetector — Tier 1 NER test suite
 *
 * 50+ test cases covering:
 *   - Person names (titled, bigram dict, consecutive caps, diverse names)
 *   - Organization names (suffix-based, known-org dictionary)
 *   - Dates (NL, relative, written-out, quarter)
 *   - Medical (PHI context, drug names, conditions, procedures)
 *   - Addresses (trigger phrase, building refs, street number)
 *   - Phone (conversational / spoken format)
 *   - Email (obfuscated with "at"/"dot" substitution)
 *   - Negative cases (capitalized non-names, non-medical medical words)
 *   - Mixed-entity sentences
 *   - Edge cases (empty / short text)
 */

import { describe, it, expect } from 'vitest';
import { NERDetector } from '../NERDetector.js';
import type { SemanticDetection, SemanticEntityType } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detector(): NERDetector {
  return new NERDetector();
}

/** Filter results by entity type */
function ofType(
  detections: SemanticDetection[],
  type: SemanticEntityType,
): SemanticDetection[] {
  return detections.filter((d) => d.type === type);
}

/** Assert that the detection list contains at least one span covering `needle`
 *  somewhere in `haystack`. */
function containsSpanFor(
  detections: SemanticDetection[],
  haystack: string,
  needle: string,
): boolean {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return false;
  return detections.some((d) => d.start <= idx && d.end >= idx + needle.length);
}

// ---------------------------------------------------------------------------
// Detector lifecycle
// ---------------------------------------------------------------------------

describe('NERDetector — lifecycle', () => {
  it('isReady() returns true immediately (no model download required)', () => {
    const ner = detector();
    expect(ner.isReady()).toBe(true);
  });

  it('getModelStatus() returns "ready"', () => {
    expect(detector().getModelStatus()).toBe('ready');
  });

  it('detect() on empty string returns []', () => {
    expect(detector().detect('')).toEqual([]);
  });

  it('detect() on single-char string returns []', () => {
    expect(detector().detect('A')).toEqual([]);
  });

  it('detect() on plain text with no entities returns []', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';
    expect(detector().detect(text)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// PERSON detection
// ---------------------------------------------------------------------------

describe('NERDetector — PERSON', () => {
  it('detects "Dr. John Smith" via title prefix', () => {
    const text = 'Please contact Dr. John Smith for more information.';
    const hits = ofType(detector().detect(text), 'person');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'Dr. John Smith')).toBe(true);
  });

  it('detects "Mr. Garcia" (title + surname only)', () => {
    const text = 'The report was filed by Mr. Garcia yesterday.';
    const hits = ofType(detector().detect(text), 'person');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'Mr. Garcia')).toBe(true);
  });

  it('detects "Prof. Chen" (academic title)', () => {
    const text = 'The lecture was delivered by Prof. Chen on Thursday.';
    const hits = ofType(detector().detect(text), 'person');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'Prof. Chen')).toBe(true);
  });

  it('detects "Dr. Sarah Chen" (title + first + last)', () => {
    const text = 'Dr. Sarah Chen reviewed the patient charts this morning.';
    const hits = ofType(detector().detect(text), 'person');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'Dr. Sarah Chen')).toBe(true);
  });

  it('detects "Sarah Chen" via name-dictionary bigram (no title)', () => {
    const text = 'I spoke with Sarah Chen about the proposal.';
    const hits = ofType(detector().detect(text), 'person');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'Sarah Chen')).toBe(true);
  });

  it('detects "Carlos Rodriguez" (Hispanic name, dictionary bigram)', () => {
    const text = 'Carlos Rodriguez signed the contract on behalf of the firm.';
    const hits = ofType(detector().detect(text), 'person');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'Carlos Rodriguez')).toBe(true);
  });

  it('detects "Priya Patel" (South Asian name)', () => {
    const text = 'Priya Patel will be leading the next sprint.';
    const hits = ofType(detector().detect(text), 'person');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'Priya Patel')).toBe(true);
  });

  it('detects "Emeka Okonkwo" (West African name)', () => {
    const text = 'The award was presented to Emeka Okonkwo.';
    const hits = ofType(detector().detect(text), 'person');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'Emeka Okonkwo')).toBe(true);
  });

  it('detects "Dr. Hiroshi Tanaka" (Japanese name with title)', () => {
    const text = 'Dr. Hiroshi Tanaka published the findings last year.';
    const hits = ofType(detector().detect(text), 'person');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'Dr. Hiroshi Tanaka')).toBe(true);
  });

  it('detects "Mohammed Al-Rashid" (Middle Eastern hyphenated surname)', () => {
    // Al-Rashid is in the LAST_NAMES dictionary
    const text = 'Mohammed Al-Rashid chaired the committee meeting.';
    const hits = ofType(detector().detect(text), 'person');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('detects "Mary Jane Watson" via consecutive-caps heuristic (mid-sentence)', () => {
    const text = 'The account belongs to Mary Jane Watson from Queens.';
    const hits = ofType(detector().detect(text), 'person');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'Mary Jane Watson')).toBe(true);
  });

  it('does NOT detect "Monday" as a person name', () => {
    const text = 'The meeting is scheduled for Monday afternoon.';
    const hits = ofType(detector().detect(text), 'person');
    // Ensure no span solely covering "Monday" is returned
    const mondayHit = hits.some((d) => text.slice(d.start, d.end) === 'Monday');
    expect(mondayHit).toBe(false);
  });

  it('does NOT detect "January" as a person name', () => {
    const text = 'The fiscal year starts in January each year.';
    const hits = ofType(detector().detect(text), 'person');
    const janHit = hits.some((d) => text.slice(d.start, d.end) === 'January');
    expect(janHit).toBe(false);
  });

  it('does NOT detect "America" as a person name', () => {
    const text = 'They moved to America two decades ago.';
    const hits = ofType(detector().detect(text), 'person');
    const americaHit = hits.some((d) => text.slice(d.start, d.end) === 'America');
    expect(americaHit).toBe(false);
  });

  it('all person detections carry source = "ner"', () => {
    const text = 'Dr. Sarah Johnson attended the conference.';
    const hits = ofType(detector().detect(text), 'person');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.source === 'ner')).toBe(true);
  });

  it('person confidence for title-prefixed name is >= 0.85', () => {
    const text = 'Please reach out to Mrs. Linda Davis.';
    const hits = ofType(detector().detect(text), 'person');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].confidence).toBeGreaterThanOrEqual(0.85);
  });
});

// ---------------------------------------------------------------------------
// ORGANIZATION detection
// ---------------------------------------------------------------------------

describe('NERDetector — ORGANIZATION', () => {
  it('detects "Goldman Sachs Inc." via org suffix', () => {
    const text = 'The deal was underwritten by Goldman Sachs Inc.';
    const hits = ofType(detector().detect(text), 'organization');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'Goldman Sachs Inc.')).toBe(true);
  });

  it('detects "Memorial Hospital" via org suffix', () => {
    const text = 'She was admitted to Memorial Hospital last night.';
    const hits = ofType(detector().detect(text), 'organization');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'Memorial Hospital')).toBe(true);
  });

  it('detects "Harvard University" via org suffix', () => {
    const text = 'He received his degree from Harvard University.';
    const hits = ofType(detector().detect(text), 'organization');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'Harvard University')).toBe(true);
  });

  it('detects "MIT" via known-org dictionary', () => {
    const text = 'The research was conducted at MIT in Cambridge.';
    const hits = ofType(detector().detect(text), 'organization');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'MIT')).toBe(true);
  });

  it('detects "Goldman Sachs" (no suffix) via known-org dictionary', () => {
    const text = 'Analysts at Goldman Sachs raised their price target.';
    const hits = ofType(detector().detect(text), 'organization');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'Goldman Sachs')).toBe(true);
  });

  it('detects "Mayo Clinic" via known-org dictionary', () => {
    const text = 'He was referred to Mayo Clinic for a second opinion.';
    const hits = ofType(detector().detect(text), 'organization');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'Mayo Clinic')).toBe(true);
  });

  it('detects "Deloitte" via known-org dictionary', () => {
    const text = 'The audit was conducted by Deloitte last quarter.';
    const hits = ofType(detector().detect(text), 'organization');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'Deloitte')).toBe(true);
  });

  it('detects "Acme Solutions LLC" via org suffix', () => {
    const text = 'The vendor, Acme Solutions LLC, delivered late.';
    const hits = ofType(detector().detect(text), 'organization');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'Acme Solutions LLC')).toBe(true);
  });

  it('detects "OpenAI" via known-org dictionary', () => {
    const text = 'Data shared with OpenAI may be used for training.';
    const hits = ofType(detector().detect(text), 'organization');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'OpenAI')).toBe(true);
  });

  it('all org detections carry source = "ner"', () => {
    const text = 'The CDC issued new guidelines today.';
    const hits = ofType(detector().detect(text), 'organization');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.source === 'ner')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DATE detection
// ---------------------------------------------------------------------------

describe('NERDetector — DATE', () => {
  it('detects "next Tuesday"', () => {
    const text = 'The review is scheduled for next Tuesday.';
    const hits = ofType(detector().detect(text), 'date');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'next Tuesday')).toBe(true);
  });

  it('detects "last week"', () => {
    const text = 'The incident occurred last week.';
    const hits = ofType(detector().detect(text), 'date');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'last week')).toBe(true);
  });

  it('detects "March 15th, 2024" (written-out date)', () => {
    const text = 'The agreement was signed on March 15th, 2024.';
    const hits = ofType(detector().detect(text), 'date');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'March 15th, 2024')).toBe(true);
  });

  it('detects "the 3rd of January" (ordinal format)', () => {
    const text = 'She was born on the 3rd of January in that small town.';
    const hits = ofType(detector().detect(text), 'date');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'the 3rd of January')).toBe(true);
  });

  it('detects "Q3 2024" (quarter notation)', () => {
    const text = 'Revenue targets for Q3 2024 were exceeded.';
    const hits = ofType(detector().detect(text), 'date');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'Q3 2024')).toBe(true);
  });

  it('detects "two weeks ago" (relative date)', () => {
    const text = 'The document was submitted two weeks ago.';
    const hits = ofType(detector().detect(text), 'date');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'two weeks ago')).toBe(true);
  });

  it('detects "in March" (month reference)', () => {
    const text = 'The new policy takes effect in March.';
    const hits = ofType(detector().detect(text), 'date');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'in March')).toBe(true);
  });

  it('detects "early October" (early/mid/late modifier)', () => {
    const text = 'The project will wrap up in early October.';
    const hits = ofType(detector().detect(text), 'date');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'early October')).toBe(true);
  });

  it('detects "fiscal year 2025"', () => {
    const text = 'Targets for fiscal year 2025 have been approved.';
    const hits = ofType(detector().detect(text), 'date');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'fiscal year 2025')).toBe(true);
  });

  it('all date detections carry source = "ner"', () => {
    const text = 'Delivery is expected next Monday.';
    const hits = ofType(detector().detect(text), 'date');
    expect(hits.every((h) => h.source === 'ner')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MEDICAL detection
// ---------------------------------------------------------------------------

describe('NERDetector — MEDICAL', () => {
  it('detects "diagnosed with lymphoma" (PHI context)', () => {
    const text = 'The pathology report confirmed he was diagnosed with lymphoma.';
    const hits = ofType(detector().detect(text), 'medical');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'diagnosed with lymphoma')).toBe(true);
  });

  it('detects "prescribed metformin" (PHI context + drug)', () => {
    const text = 'Her doctor prescribed metformin for glucose control.';
    const hits = ofType(detector().detect(text), 'medical');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('detects "stage 3 cancer" (stage notation)', () => {
    const text = 'The biopsy revealed stage 3 cancer in the lymph nodes.';
    const hits = ofType(detector().detect(text), 'medical');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'stage 3 cancer')).toBe(true);
  });

  it('detects "patient has diabetes" (PHI context + condition)', () => {
    const text = 'The patient has diabetes and hypertension.';
    const hits = ofType(detector().detect(text), 'medical');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('detects "treatment for hypertension" (treatment context)', () => {
    const text = 'He is currently on treatment for hypertension.';
    const hits = ofType(detector().detect(text), 'medical');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'treatment for hypertension')).toBe(true);
  });

  it('detects standalone drug name "lisinopril" (medication dictionary)', () => {
    const text = 'She takes lisinopril every morning.';
    const hits = ofType(detector().detect(text), 'medical');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'lisinopril')).toBe(true);
  });

  it('detects "history of asthma" (PHI history context)', () => {
    const text = 'The form listed a history of asthma since childhood.';
    const hits = ofType(detector().detect(text), 'medical');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'history of asthma')).toBe(true);
  });

  it('detects standalone condition "diabetes" in medical context', () => {
    const text = 'The clinic specialises in treating diabetes and related conditions.';
    const hits = ofType(detector().detect(text), 'medical');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'diabetes')).toBe(true);
  });

  it('detects drug "atorvastatin" by name', () => {
    const text = 'The cardiologist added atorvastatin to the regimen.';
    const hits = ofType(detector().detect(text), 'medical');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'atorvastatin')).toBe(true);
  });

  it('detects "suffering from depression" (PHI context)', () => {
    const text = 'He disclosed he has been suffering from depression for years.';
    const hits = ofType(detector().detect(text), 'medical');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'suffering from depression')).toBe(true);
  });

  it('does NOT flag "treatment plant" as a medical entity', () => {
    const text = 'The treatment plant processes 50 million litres per day.';
    const hits = ofType(detector().detect(text), 'medical');
    // "treatment plant" should not trigger — "treatment for <drug/condition>" pattern
    // would not match here since "plant" is not a drug or condition
    const hasTreatmentPlant = hits.some((d) =>
      text.slice(d.start, d.end).toLowerCase().includes('plant'),
    );
    expect(hasTreatmentPlant).toBe(false);
  });

  it('does NOT flag "cancer researcher" as a medical entity without context', () => {
    // "cancer" standalone at low confidence is acceptable; but no PHI context → lower conf
    // The test ensures no false-positive PHI pattern fires
    const text = 'She is a cancer researcher at the university.';
    const hits = ofType(detector().detect(text), 'medical');
    // If cancer is detected, it must be via condition dictionary (not PHI context phrase)
    const phiHit = hits.some((d) => d.confidence >= 0.88);
    expect(phiHit).toBe(false);
  });

  it('all medical detections carry source = "ner"', () => {
    const text = 'The patient was prescribed warfarin after surgery.';
    const hits = ofType(detector().detect(text), 'medical');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.source === 'ner')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ADDRESS detection
// ---------------------------------------------------------------------------

describe('NERDetector — ADDRESS', () => {
  it('detects "lives at 500 Oak Street" (trigger phrase)', () => {
    const text = 'She lives at 500 Oak Street in the suburb.';
    const hits = ofType(detector().detect(text), 'address');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('detects "office at Suite 200" (suite reference)', () => {
    const text = 'Please visit our office at Suite 200 on the second floor.';
    const hits = ofType(detector().detect(text), 'address');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'Suite 200')).toBe(true);
  });

  it('detects "located at 123 Main Avenue" (trigger phrase + street number)', () => {
    const text = 'The branch is located at 123 Main Avenue downtown.';
    const hits = ofType(detector().detect(text), 'address');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('detects "P.O. Box 4521" (PO Box)', () => {
    const text = 'Payments should be mailed to P.O. Box 4521.';
    const hits = ofType(detector().detect(text), 'address');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'P.O. Box 4521')).toBe(true);
  });

  it('detects city-state-ZIP pattern "Brooklyn, NY 11201"', () => {
    const text = 'Ship the package to Brooklyn, NY 11201.';
    const hits = ofType(detector().detect(text), 'address');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'Brooklyn, NY 11201')).toBe(true);
  });

  it('all address detections carry source = "ner"', () => {
    const text = 'Our headquarters is located at 1 Infinite Loop, Cupertino, CA 95014.';
    const hits = ofType(detector().detect(text), 'address');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.source === 'ner')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PHONE (conversational)
// ---------------------------------------------------------------------------

describe('NERDetector — PHONE (conversational)', () => {
  it('detects spoken number sequence after trigger phrase', () => {
    const text = 'Call me at five five five one two three four.';
    const hits = ofType(detector().detect(text), 'phone_conversational');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('detects "my number is 555 867 5309"', () => {
    const text = 'My number is 555 867 5309, call any time.';
    const hits = ofType(detector().detect(text), 'phone_conversational');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('detects "reach me on" + digit sequence', () => {
    const text = 'You can reach me on 020 7946 0958 during business hours.';
    const hits = ofType(detector().detect(text), 'phone_conversational');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('all phone detections carry source = "ner"', () => {
    const text = 'Call me at five five five nine eight seven.';
    const hits = ofType(detector().detect(text), 'phone_conversational');
    if (hits.length > 0) {
      expect(hits.every((h) => h.source === 'ner')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// EMAIL (obfuscated)
// ---------------------------------------------------------------------------

describe('NERDetector — EMAIL (obfuscated)', () => {
  it('detects "john at company dot com"', () => {
    const text = 'Email me at john at company dot com for details.';
    const hits = ofType(detector().detect(text), 'email_obfuscated');
    expect(hits.length).toBeGreaterThan(0);
    expect(containsSpanFor(hits, text, 'john at company dot com')).toBe(true);
  });

  it('detects "sarah dot chen at gmail dot com"', () => {
    const text = 'Contact sarah dot chen at gmail dot com directly.';
    const hits = ofType(detector().detect(text), 'email_obfuscated');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('all email detections carry source = "ner"', () => {
    const text = 'Reach out to info at obfusca dot io.';
    const hits = ofType(detector().detect(text), 'email_obfuscated');
    if (hits.length > 0) {
      expect(hits.every((h) => h.source === 'ner')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Output contract
// ---------------------------------------------------------------------------

describe('NERDetector — output contract', () => {
  it('returned detections are sorted by start position', () => {
    const text =
      'Dr. Sarah Johnson was diagnosed with diabetes. She works at Memorial Hospital in Brooklyn, NY 11201.';
    const hits = detector().detect(text);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i].start).toBeGreaterThanOrEqual(hits[i - 1].start);
    }
  });

  it('no two returned detections overlap', () => {
    const text =
      'Carlos Rodriguez at Goldman Sachs prescribed metformin. Next Tuesday call him at five five five one two three four.';
    const hits = detector().detect(text);
    for (let i = 0; i < hits.length; i++) {
      for (let j = i + 1; j < hits.length; j++) {
        const overlap = hits[i].start < hits[j].end && hits[i].end > hits[j].start;
        expect(overlap).toBe(false);
      }
    }
  });

  it('all detections have start < end', () => {
    const text =
      'The patient, Priya Patel, lives at 100 Park Avenue. She was prescribed atorvastatin last March.';
    const hits = detector().detect(text);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(h.start).toBeLessThan(h.end);
    }
  });

  it('all confidences are in the range (0, 1]', () => {
    const text =
      'Mr. Ahmed Al-Hassan works at the CDC. He was diagnosed with hypertension in Q2 2023.';
    const hits = detector().detect(text);
    for (const h of hits) {
      expect(h.confidence).toBeGreaterThan(0);
      expect(h.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Mixed-entity sentences
// ---------------------------------------------------------------------------

describe('NERDetector — mixed entities', () => {
  it('detects multiple entity types in one sentence', () => {
    const text =
      'Dr. Sarah Johnson prescribed metformin for her patient at Memorial Hospital on March 15th, 2024.';
    const hits = detector().detect(text);
    const types = new Set(hits.map((h) => h.type));
    // Should detect at least person + medical + organization + date
    expect(types.has('person')).toBe(true);
    expect(types.has('medical')).toBe(true);
    expect(types.has('organization')).toBe(true);
    expect(types.has('date')).toBe(true);
  });

  it('detects person + org + phone in one sentence', () => {
    const text =
      'Contact John Smith at Goldman Sachs — his number is 555 867 1234.';
    const hits = detector().detect(text);
    const types = new Set(hits.map((h) => h.type));
    expect(types.has('person')).toBe(true);
    expect(types.has('organization')).toBe(true);
    // Phone with trigger phrase
    expect(types.has('phone_conversational')).toBe(true);
  });

  it('detects address + date in one sentence', () => {
    const text = 'The team will be located at Suite 400 starting next Monday.';
    const hits = detector().detect(text);
    const types = new Set(hits.map((h) => h.type));
    expect(types.has('address')).toBe(true);
    expect(types.has('date')).toBe(true);
  });

  it('detects person + email in one sentence', () => {
    const text = 'Reach out to Carlos Rodriguez at carlos at acme dot com.';
    const hits = detector().detect(text);
    const types = new Set(hits.map((h) => h.type));
    expect(types.has('person')).toBe(true);
    expect(types.has('email_obfuscated')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Performance (< 50ms on 500-char input)
// ---------------------------------------------------------------------------

describe('NERDetector — performance', () => {
  it('processes a 500-char input in under 50ms', () => {
    const text = (
      'Dr. Sarah Johnson, a cardiologist at Mayo Clinic, diagnosed the patient with ' +
      'hypertension and prescribed lisinopril. The patient, Carlos Rodriguez, lives at ' +
      '500 Oak Street, Brooklyn, NY 11201. His email is carlos at health dot com and ' +
      'his number is 555 123 4567. The follow-up is scheduled for next Tuesday, March 15th, 2024.'
    ).slice(0, 500);

    const ner = detector();
    const t0 = performance.now();
    ner.detect(text);
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(50);
  });
});
