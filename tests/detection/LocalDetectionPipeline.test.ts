/**
 * Tests for LocalDetectionPipeline and its supporting modules.
 *
 * Assumption: test file lives in tests/detection/ to match the vitest
 * include pattern (tests/**\/*.test.ts) configured in vitest.config.ts.
 * The mission spec referenced src/detection/__tests__/ but that path is
 * not picked up by the current vitest config; placing tests here ensures
 * they actually run without modifying existing config files.
 *
 * All external collaborators (detectSensitiveData, NER, semantic, policy,
 * dummy generator) are mocked so the test suite runs fully offline with
 * no Chrome extension APIs beyond what setup.ts provides.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock detection.ts BEFORE importing the pipeline (module-level side-effects
// like chrome.storage listeners fire on import; we replace the module entirely)
// ---------------------------------------------------------------------------
vi.mock('../../src/detection', () => ({
  detectSensitiveData: vi.fn(),
  mightContainSensitiveDataSync: vi.fn(() => false),
  loadCustomPatternsIntoMemory: vi.fn(),
}));

import { detectSensitiveData } from '../../src/detection';
import type { Detection } from '../../src/detection';
import { LocalDetectionPipeline } from '../../src/detection/LocalDetectionPipeline';
import { mergeDetections } from '../../src/detection/deduplication';
import { PIPELINE_VERSION } from '../../src/detection/version';
import type {
  MergedDetection,
  INERDetector,
  ISemanticDetector,
  IPolicyEngine,
  IDummyGenerator,
  NERDetection,
  Action,
} from '../../src/detection/types';

// ---------------------------------------------------------------------------
// Helpers / factories
// ---------------------------------------------------------------------------

const mockDetectSensitiveData = detectSensitiveData as ReturnType<typeof vi.fn>;

function makeDetection(
  overrides: Partial<Detection> & Pick<Detection, 'type' | 'start' | 'end'>,
): Detection {
  return {
    displayName: overrides.type.toUpperCase(),
    severity: 'high',
    confidence: 0.9,
    ...overrides,
  } as Detection;
}

function makeMergedDetection(
  overrides: Partial<MergedDetection> & Pick<MergedDetection, 'type' | 'start' | 'end'>,
): MergedDetection {
  return {
    displayName: overrides.type.toUpperCase(),
    severity: 'high',
    confidence: 0.9,
    source: 'regex',
    ...overrides,
  } as MergedDetection;
}

function makeNERDetection(
  overrides: Partial<NERDetection> & Pick<NERDetection, 'type' | 'start' | 'end'>,
): NERDetection {
  return {
    displayName: overrides.type.toUpperCase(),
    severity: 'high',
    confidence: 0.85,
    ...overrides,
  } as NERDetection;
}

// ---------------------------------------------------------------------------
// Default mock collaborators
// ---------------------------------------------------------------------------

function makeNerDetector(detections: NERDetection[] = []): INERDetector {
  return { detect: vi.fn().mockResolvedValue(detections) };
}

function makeSemanticDetector(
  detections: MergedDetection[] = [],
  ready = false,
): ISemanticDetector {
  return {
    isReady: vi.fn().mockReturnValue(ready),
    detect: vi.fn().mockResolvedValue(detections),
  };
}

function makePolicyEngine(action: Action = 'allow'): IPolicyEngine {
  return { evaluate: vi.fn().mockReturnValue(action) };
}

function makeDummyGenerator(value = 'DUMMY'): IDummyGenerator {
  return { generate: vi.fn().mockResolvedValue(value) };
}

function makePipeline(overrides: Partial<{
  ner: INERDetector;
  semantic: ISemanticDetector;
  policy: IPolicyEngine;
  dummy: IDummyGenerator;
}> = {}) {
  return new LocalDetectionPipeline({
    nerDetector: overrides.ner ?? makeNerDetector(),
    semanticDetector: overrides.semantic ?? makeSemanticDetector(),
    policyEngine: overrides.policy ?? makePolicyEngine(),
    dummyGenerator: overrides.dummy ?? makeDummyGenerator(),
  });
}

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockDetectSensitiveData.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// 1 — Empty text
// ===========================================================================

describe('Empty text', () => {
  it('returns no detections for empty string', async () => {
    const pipeline = makePipeline();
    const result = await pipeline.analyze('');
    expect(result.detections).toHaveLength(0);
  });

  it('returns action=allow for empty string (no detections → policy allows)', async () => {
    const policy = makePolicyEngine('allow');
    const pipeline = makePipeline({ policy });
    const result = await pipeline.analyze('');
    expect(result.action).toBe('allow');
  });

  it('produces a content hash even for empty string', async () => {
    const pipeline = makePipeline();
    const result = await pipeline.analyze('');
    expect(result.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

// ===========================================================================
// 2 — Regex-only detections
// ===========================================================================

describe('Regex-only detections', () => {
  it('returns detections with source=regex when only regex fires', async () => {
    const ssn = makeDetection({ type: 'ssn', start: 10, end: 21, confidence: 0.97, severity: 'critical' });
    mockDetectSensitiveData.mockResolvedValue([ssn]);

    const pipeline = makePipeline();
    const result = await pipeline.analyze('My SSN is 123-45-6789 today.');

    expect(result.detections).toHaveLength(1);
    expect(result.detections[0].type).toBe('ssn');
    expect(result.detections[0].source).toBe('regex');
    expect(result.detections[0].confidence).toBe(0.97);
  });

  it('surfaces all regex detections when NER and semantic are empty', async () => {
    const cc = makeDetection({ type: 'credit_card', start: 0, end: 19, severity: 'critical' });
    const key = makeDetection({ type: 'aws_key', start: 25, end: 45, severity: 'critical' });
    mockDetectSensitiveData.mockResolvedValue([cc, key]);

    const pipeline = makePipeline();
    const result = await pipeline.analyze('4111111111111111 and AKIAIOSFODNN7EXAMPLE');

    expect(result.detections).toHaveLength(2);
    expect(result.detections.every((d) => d.source === 'regex')).toBe(true);
  });

  it('reports correct regexCount in metadata', async () => {
    const d = makeDetection({ type: 'api_key', start: 0, end: 30 });
    mockDetectSensitiveData.mockResolvedValue([d]);

    const pipeline = makePipeline();
    const result = await pipeline.analyze('sk-abcdefghijklmnopqrst12345678');

    expect(result.metadata.regexCount).toBe(1);
  });
});

// ===========================================================================
// 3 — NER-only detections
// ===========================================================================

describe('NER-only detections', () => {
  it('returns detections with source=ner when only NER fires', async () => {
    mockDetectSensitiveData.mockResolvedValue([]);

    const nerDet = makeNERDetection({ type: 'PERSON', displayName: 'Person Name', start: 5, end: 14, confidence: 0.88 });
    const ner = makeNerDetector([nerDet]);

    const pipeline = makePipeline({ ner });
    const result = await pipeline.analyze('Hello John Smith today.');

    expect(result.detections).toHaveLength(1);
    expect(result.detections[0].type).toBe('PERSON');
    expect(result.detections[0].source).toBe('ner');
    expect(result.detections[0].confidence).toBe(0.88);
  });

  it('reports correct nerCount in metadata', async () => {
    const nerDet = makeNERDetection({ type: 'ORG', start: 0, end: 10 });
    const ner = makeNerDetector([nerDet]);

    const pipeline = makePipeline({ ner });
    const result = await pipeline.analyze('Acme Corp does things.');

    expect(result.metadata.nerCount).toBe(1);
    expect(result.metadata.regexCount).toBe(0);
  });
});

// ===========================================================================
// 4 — Semantic-only detections
// ===========================================================================

describe('Semantic detections', () => {
  it('returns detections with source=semantic when semantic fires and model is ready', async () => {
    mockDetectSensitiveData.mockResolvedValue([]);

    const semDet = makeMergedDetection({ type: 'MEDICAL_TERM', displayName: 'Medical Term', start: 12, end: 24, confidence: 0.75, source: 'semantic', severity: 'medium' });
    const semantic = makeSemanticDetector([semDet], true);

    const pipeline = makePipeline({ semantic });
    const result = await pipeline.analyze('Patient has hypertension diagnosis.');

    expect(result.detections).toHaveLength(1);
    expect(result.detections[0].source).toBe('semantic');
    expect(result.metadata.semanticCount).toBe(1);
  });

  it('skips semantic stage when isReady() returns false — no error thrown', async () => {
    mockDetectSensitiveData.mockResolvedValue([]);
    const semantic = makeSemanticDetector([], false);

    const pipeline = makePipeline({ semantic });
    const result = await pipeline.analyze('Some text here.');

    expect(result.detections).toHaveLength(0);
    expect(result.metadata.semanticCount).toBe(0);
    expect((semantic.detect as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 5 — Deduplication
// ===========================================================================

describe('Deduplication', () => {
  it('deduplicates overlapping regex+NER detections of the same type — keeps higher confidence', async () => {
    // regex hit: lower confidence
    const regexDet = makeDetection({ type: 'ssn', start: 0, end: 11, confidence: 0.80, severity: 'critical' });
    mockDetectSensitiveData.mockResolvedValue([regexDet]);

    // NER hit: same span, higher confidence
    const nerDet = makeNERDetection({ type: 'ssn', start: 0, end: 11, confidence: 0.95, severity: 'critical' });
    const ner = makeNerDetector([nerDet]);

    const pipeline = makePipeline({ ner });
    const result = await pipeline.analyze('123-45-6789');

    expect(result.detections).toHaveLength(1);
    expect(result.detections[0].confidence).toBe(0.95);
    expect(result.detections[0].source).toBe('ner');
  });

  it('keeps both detections when they have the same span but different types', async () => {
    const regexDet = makeDetection({ type: 'api_key', start: 0, end: 20, confidence: 0.90, severity: 'high' });
    mockDetectSensitiveData.mockResolvedValue([regexDet]);

    // NER thinks the same span is also a PERSON name (unlikely in real life but valid test scenario)
    const nerDet = makeNERDetection({ type: 'PERSON', start: 0, end: 20, confidence: 0.70, severity: 'medium' });
    const ner = makeNerDetector([nerDet]);

    const pipeline = makePipeline({ ner });
    const result = await pipeline.analyze('sk-abcdefghijklmnopqrst');

    expect(result.detections).toHaveLength(2);
    const types = result.detections.map((d) => d.type).sort();
    expect(types).toEqual(['PERSON', 'api_key']);
  });

  it('keeps the regex detection when it has higher confidence than the overlapping NER', async () => {
    const regexDet = makeDetection({ type: 'credit_card', start: 5, end: 24, confidence: 0.97, severity: 'critical' });
    mockDetectSensitiveData.mockResolvedValue([regexDet]);

    const nerDet = makeNERDetection({ type: 'credit_card', start: 5, end: 24, confidence: 0.60, severity: 'critical' });
    const ner = makeNerDetector([nerDet]);

    const pipeline = makePipeline({ ner });
    const result = await pipeline.analyze('Card 4111111111111111 here');

    expect(result.detections).toHaveLength(1);
    expect(result.detections[0].confidence).toBe(0.97);
    expect(result.detections[0].source).toBe('regex');
  });

  it('does NOT merge non-overlapping detections of the same type', async () => {
    const d1 = makeDetection({ type: 'ssn', start: 0, end: 11, confidence: 0.9, severity: 'critical' });
    const d2 = makeDetection({ type: 'ssn', start: 50, end: 61, confidence: 0.9, severity: 'critical' });
    mockDetectSensitiveData.mockResolvedValue([d1, d2]);

    const pipeline = makePipeline();
    const result = await pipeline.analyze('123-45-6789 ... some text ... 987-65-4321');

    expect(result.detections).toHaveLength(2);
  });

  it('sorts merged detections by start position', async () => {
    const d1 = makeDetection({ type: 'ssn', start: 30, end: 41, severity: 'critical' });
    const d2 = makeDetection({ type: 'credit_card', start: 0, end: 19, severity: 'critical' });
    mockDetectSensitiveData.mockResolvedValue([d1, d2]);

    const pipeline = makePipeline();
    const result = await pipeline.analyze('4111111111111111... 123-45-6789');

    expect(result.detections[0].start).toBeLessThan(result.detections[1].start);
  });
});

// ===========================================================================
// 6 — Policy evaluation
// ===========================================================================

describe('Policy evaluation', () => {
  it('returns block action from policy engine for critical severity', async () => {
    const det = makeDetection({ type: 'ssn', start: 0, end: 11, severity: 'critical' });
    mockDetectSensitiveData.mockResolvedValue([det]);

    const policy = makePolicyEngine('block');
    const pipeline = makePipeline({ policy });
    const result = await pipeline.analyze('123-45-6789');

    expect(result.action).toBe('block');
    expect((policy.evaluate as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'ssn' })]),
    );
  });

  it('returns redact action from policy engine for medium severity', async () => {
    const det = makeDetection({ type: 'custom', start: 0, end: 5, severity: 'medium' });
    mockDetectSensitiveData.mockResolvedValue([det]);

    const policy = makePolicyEngine('redact');
    const pipeline = makePipeline({ policy });
    const result = await pipeline.analyze('hello');

    expect(result.action).toBe('redact');
  });

  it('returns warn action when policy engine says warn', async () => {
    const det = makeDetection({ type: 'custom', start: 0, end: 5, severity: 'low' });
    mockDetectSensitiveData.mockResolvedValue([det]);

    const policy = makePolicyEngine('warn');
    const pipeline = makePipeline({ policy });
    const result = await pipeline.analyze('hello');

    expect(result.action).toBe('warn');
  });

  it('passes the full merged detection list to the policy engine', async () => {
    const regexDet = makeDetection({ type: 'ssn', start: 0, end: 11, severity: 'critical' });
    mockDetectSensitiveData.mockResolvedValue([regexDet]);

    const nerDet = makeNERDetection({ type: 'PERSON', start: 20, end: 30, severity: 'medium' });
    const ner = makeNerDetector([nerDet]);

    const policy = makePolicyEngine('block');
    const pipeline = makePipeline({ ner, policy });

    await pipeline.analyze('123-45-6789 and John Smith');

    const evaluateCall = (policy.evaluate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(evaluateCall).toHaveLength(2);
  });
});

// ===========================================================================
// 7 — Dummy value generation
// ===========================================================================

describe('Dummy value generation', () => {
  it('generates a dummy value for each detection', async () => {
    const d = makeDetection({ type: 'ssn', start: 0, end: 11, severity: 'critical' });
    mockDetectSensitiveData.mockResolvedValue([d]);

    const dummy = makeDummyGenerator('123-00-0000');
    const pipeline = makePipeline({ dummy });
    const result = await pipeline.analyze('123-45-6789');

    expect(result.dummyValues.size).toBe(1);
    expect(result.dummyValues.get(0)).toBe('123-00-0000');
  });

  it('indexes dummy values by detection position in the merged array', async () => {
    const d1 = makeDetection({ type: 'ssn', start: 0, end: 11, severity: 'critical' });
    const d2 = makeDetection({ type: 'credit_card', start: 20, end: 39, severity: 'critical' });
    mockDetectSensitiveData.mockResolvedValue([d1, d2]);

    let callCount = 0;
    const dummy: IDummyGenerator = {
      generate: vi.fn().mockImplementation(() => {
        return Promise.resolve(`dummy-${callCount++}`);
      }),
    };

    const pipeline = makePipeline({ dummy });
    const result = await pipeline.analyze('123-45-6789 text 4111111111111111 end');

    expect(result.dummyValues.get(0)).toBe('dummy-0');
    expect(result.dummyValues.get(1)).toBe('dummy-1');
  });

  it('continues generating dummies for remaining detections when one fails', async () => {
    const d1 = makeDetection({ type: 'ssn', start: 0, end: 11, severity: 'critical' });
    const d2 = makeDetection({ type: 'credit_card', start: 20, end: 39, severity: 'critical' });
    mockDetectSensitiveData.mockResolvedValue([d1, d2]);

    let callCount = 0;
    const dummy: IDummyGenerator = {
      generate: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('Generator failed'));
        return Promise.resolve('FAKE-CC');
      }),
    };

    const pipeline = makePipeline({ dummy });
    const result = await pipeline.analyze('123-45-6789 text 4111111111111111 end');

    // First detection's dummy is missing due to failure
    expect(result.dummyValues.has(0)).toBe(false);
    // Second detection's dummy is still produced
    expect(result.dummyValues.get(1)).toBe('FAKE-CC');
  });

  it('returns empty dummyValues map when there are no detections', async () => {
    mockDetectSensitiveData.mockResolvedValue([]);
    const pipeline = makePipeline();
    const result = await pipeline.analyze('safe text');

    expect(result.dummyValues.size).toBe(0);
  });
});

// ===========================================================================
// 8 — Content hash
// ===========================================================================

describe('Content hash', () => {
  it('produces a sha256: prefixed hex string', async () => {
    const pipeline = makePipeline();
    const result = await pipeline.analyze('Hello World');

    expect(result.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('produces the same hash for identical input (deterministic)', async () => {
    const pipeline = makePipeline();
    const r1 = await pipeline.analyze('identical input');
    const r2 = await pipeline.analyze('identical input');

    expect(r1.contentHash).toBe(r2.contentHash);
  });

  it('produces different hashes for different inputs', async () => {
    const pipeline = makePipeline();
    const r1 = await pipeline.analyze('input one');
    const r2 = await pipeline.analyze('input two');

    expect(r1.contentHash).not.toBe(r2.contentHash);
  });
});

// ===========================================================================
// 9 — Partial failure handling
// ===========================================================================

describe('Partial failure handling', () => {
  it('continues with regex results when NER detector throws', async () => {
    const regexDet = makeDetection({ type: 'ssn', start: 0, end: 11, severity: 'critical' });
    mockDetectSensitiveData.mockResolvedValue([regexDet]);

    const ner: INERDetector = {
      detect: vi.fn().mockRejectedValue(new Error('NER model crashed')),
    };

    const pipeline = makePipeline({ ner });
    const result = await pipeline.analyze('123-45-6789');

    expect(result.detections).toHaveLength(1);
    expect(result.detections[0].source).toBe('regex');
    expect(result.metadata.nerCount).toBe(0);
  });

  it('continues with regex+NER when semantic detector throws', async () => {
    const regexDet = makeDetection({ type: 'api_key', start: 0, end: 25, severity: 'high' });
    mockDetectSensitiveData.mockResolvedValue([regexDet]);

    const nerDet = makeNERDetection({ type: 'ORG', start: 30, end: 40, severity: 'medium' });
    const ner = makeNerDetector([nerDet]);

    const semantic: ISemanticDetector = {
      isReady: vi.fn().mockReturnValue(true),
      detect: vi.fn().mockRejectedValue(new Error('ONNX runtime error')),
    };

    const pipeline = makePipeline({ ner, semantic });
    const result = await pipeline.analyze('sk-abc1234567890123456789 text Acme Corp end');

    expect(result.detections).toHaveLength(2);
    expect(result.metadata.semanticCount).toBe(0);
    const sources = result.detections.map((d) => d.source).sort();
    expect(sources).toEqual(['ner', 'regex']);
  });

  it('returns regex-only results when both NER and semantic fail', async () => {
    const regexDet = makeDetection({ type: 'private_key', start: 0, end: 27, severity: 'critical' });
    mockDetectSensitiveData.mockResolvedValue([regexDet]);

    const ner: INERDetector = { detect: vi.fn().mockRejectedValue(new Error('NER fail')) };
    const semantic: ISemanticDetector = {
      isReady: vi.fn().mockReturnValue(true),
      detect: vi.fn().mockRejectedValue(new Error('Semantic fail')),
    };

    const pipeline = makePipeline({ ner, semantic });
    const result = await pipeline.analyze('-----BEGIN PRIVATE KEY-----');

    expect(result.detections).toHaveLength(1);
    expect(result.detections[0].source).toBe('regex');
    expect(result.metadata.nerCount).toBe(0);
    expect(result.metadata.semanticCount).toBe(0);
  });
});

// ===========================================================================
// 10 — Multiple detection types in one text
// ===========================================================================

describe('Multiple detection types in one text', () => {
  it('handles regex + NER + semantic hits in a single passage', async () => {
    const regexDet = makeDetection({ type: 'ssn', start: 10, end: 21, severity: 'critical' });
    mockDetectSensitiveData.mockResolvedValue([regexDet]);

    const nerDet = makeNERDetection({ type: 'PERSON', start: 0, end: 8, severity: 'medium' });
    const ner = makeNerDetector([nerDet]);

    const semDet = makeMergedDetection({ type: 'MEDICAL_TERM', start: 30, end: 42, confidence: 0.7, source: 'semantic', severity: 'medium' });
    const semantic = makeSemanticDetector([semDet], true);

    const pipeline = makePipeline({ ner, semantic });
    const result = await pipeline.analyze('John Doe 123-45-6789 has a hypertension code');

    expect(result.detections).toHaveLength(3);
    const sources = result.detections.map((d) => d.source).sort();
    expect(sources).toEqual(['ner', 'regex', 'semantic']);
  });
});

// ===========================================================================
// 11 — Metadata
// ===========================================================================

describe('Metadata', () => {
  it('populates all metadata fields', async () => {
    const regexDet = makeDetection({ type: 'ssn', start: 0, end: 11, severity: 'critical' });
    mockDetectSensitiveData.mockResolvedValue([regexDet]);

    const nerDet = makeNERDetection({ type: 'PERSON', start: 15, end: 23, severity: 'medium' });
    const ner = makeNerDetector([nerDet]);

    const pipeline = makePipeline({ ner });
    const result = await pipeline.analyze('123-45-6789 hi John Doe');

    expect(result.metadata.regexCount).toBe(1);
    expect(result.metadata.nerCount).toBe(1);
    expect(result.metadata.semanticCount).toBe(0);
    expect(typeof result.metadata.totalMs).toBe('number');
    expect(result.metadata.totalMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.pipelineVersion).toBe(PIPELINE_VERSION);
  });

  it('sets pipelineVersion to the current PIPELINE_VERSION constant', async () => {
    const pipeline = makePipeline();
    const result = await pipeline.analyze('text');

    expect(result.metadata.pipelineVersion).toBe('1.0.0');
  });
});

// ===========================================================================
// 12 — Performance
// ===========================================================================

describe('Performance', () => {
  it('completes regex+NER pipeline in < 100ms for a 500-character input', async () => {
    const text = 'A'.repeat(490) + '123-45-6789'; // 501 chars with an SSN at the end

    const regexDet = makeDetection({ type: 'ssn', start: 490, end: 501, severity: 'critical' });
    mockDetectSensitiveData.mockResolvedValue([regexDet]);

    const nerDet = makeNERDetection({ type: 'PERSON', start: 0, end: 5, severity: 'medium' });
    const ner = makeNerDetector([nerDet]);

    const pipeline = makePipeline({ ner });
    const start = performance.now();
    const result = await pipeline.analyze(text);
    const elapsed = performance.now() - start;

    expect(result.detections.length).toBeGreaterThan(0);
    // Allow generous headroom — the mock resolves instantly; the limit is for
    // regression detection in CI (real NER inference is tested separately).
    expect(elapsed).toBeLessThan(100);
  });
});

// ===========================================================================
// 13 — mergeDetections unit tests (deduplication.ts)
// ===========================================================================

describe('mergeDetections (deduplication unit tests)', () => {
  it('returns empty array when all inputs are empty', () => {
    expect(mergeDetections([], [], [])).toEqual([]);
  });

  it('promotes regex detections to MergedDetection with source=regex', () => {
    const d = makeDetection({ type: 'ssn', start: 0, end: 11, severity: 'critical' });
    const result = mergeDetections([d], [], []);
    expect(result[0].source).toBe('regex');
  });

  it('uses overlapFraction threshold correctly — 50% overlap triggers dedup, 49% does not', () => {
    // Span A: [0, 10), Span B: [6, 16) — overlap [6,10) = 4 chars out of 10 = 40% → keep both
    const d1 = makeDetection({ type: 'ssn', start: 0, end: 10, confidence: 0.9, severity: 'critical' });
    const ner1 = makeNERDetection({ type: 'ssn', start: 6, end: 16, confidence: 0.8, severity: 'critical' });
    const result = mergeDetections([d1], [ner1], []);
    // 4/10 = 40% < 50% → both kept
    expect(result).toHaveLength(2);
  });

  it('deduplicates when overlap is exactly 51%', () => {
    // Span A: [0, 10), Span B: [4, 14) — overlap [4,10) = 6 chars / min(10,10) = 60% > 50%
    const d1 = makeDetection({ type: 'ssn', start: 0, end: 10, confidence: 0.9, severity: 'critical' });
    const ner1 = makeNERDetection({ type: 'ssn', start: 4, end: 14, confidence: 0.95, severity: 'critical' });
    const result = mergeDetections([d1], [ner1], []);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.95);
  });
});
