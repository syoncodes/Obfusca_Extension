/**
 * Comprehensive tests for src/detection.ts
 *
 * Tests all exported functions:
 * - detectSensitiveData(text): async full detection (built-in + custom patterns)
 * - mightContainSensitiveDataSync(text): sync quick check
 * - mightContainSensitiveData(text): async quick check (delegates to sync + custom)
 * - getDetectionSummary(detections): human-readable summary
 * - loadCustomPatternsIntoMemory(): loads patterns from chrome.storage into memory
 *
 * Internal validators (luhnChecksum, isValidSSN, isValidAWSKey) are tested
 * indirectly through the public API since they are not exported.
 */

import {
  detectSensitiveData,
  mightContainSensitiveDataSync,
  mightContainSensitiveData,
  getDetectionSummary,
  loadCustomPatternsIntoMemory,
  type Detection,
} from '../src/detection';
import {
  setStorageData,
  clearStorageData,
  triggerStorageChange,
} from './setup';

// Suppress noisy console.log output from detection module during tests
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  clearStorageData();
});

// =============================================================================
// detectSensitiveData
// =============================================================================

describe('detectSensitiveData', () => {
  // -------------------------------------------------------------------------
  // SSN Detection
  // -------------------------------------------------------------------------

  describe('SSN detection', () => {
    it('detects valid SSN with dashes (123-45-6789)', async () => {
      const detections = await detectSensitiveData('My SSN is 123-45-6789');
      expect(detections.length).toBeGreaterThanOrEqual(1);
      const ssn = detections.find((d) => d.type === 'ssn');
      expect(ssn).toBeDefined();
      expect(ssn!.severity).toBe('critical');
      expect(ssn!.displayName).toBe('US Social Security Number');
    });

    it('detects SSN with dots (123.45.6789)', async () => {
      const detections = await detectSensitiveData('SSN: 123.45.6789');
      const ssn = detections.find((d) => d.type === 'ssn');
      expect(ssn).toBeDefined();
    });

    it('detects SSN with spaces (123 45 6789)', async () => {
      const detections = await detectSensitiveData('SSN: 123 45 6789');
      const ssn = detections.find((d) => d.type === 'ssn');
      expect(ssn).toBeDefined();
    });

    it('rejects SSN starting with 000', async () => {
      const detections = await detectSensitiveData('000-12-3456');
      const ssn = detections.find((d) => d.type === 'ssn');
      expect(ssn).toBeUndefined();
    });

    it('rejects SSN starting with 666', async () => {
      const detections = await detectSensitiveData('666-12-3456');
      const ssn = detections.find((d) => d.type === 'ssn');
      expect(ssn).toBeUndefined();
    });

    it('rejects SSN starting with 900+', async () => {
      const detections = await detectSensitiveData('900-12-3456');
      const ssn = detections.find((d) => d.type === 'ssn');
      expect(ssn).toBeUndefined();

      const detections2 = await detectSensitiveData('999-12-3456');
      const ssn2 = detections2.find((d) => d.type === 'ssn');
      expect(ssn2).toBeUndefined();
    });

    it('rejects SSN with group 00', async () => {
      const detections = await detectSensitiveData('123-00-6789');
      const ssn = detections.find((d) => d.type === 'ssn');
      expect(ssn).toBeUndefined();
    });

    it('rejects SSN with serial 0000', async () => {
      const detections = await detectSensitiveData('123-45-0000');
      const ssn = detections.find((d) => d.type === 'ssn');
      expect(ssn).toBeUndefined();
    });

    it('does not detect phone number as SSN (800-555-1234)', async () => {
      // 800 is valid SSN area, but this is a phone number
      // The regex might match. The validator checks 9 digits.
      // 800-555-1234 has 10 digits so the SSN regex (which matches 9 digit patterns) should not match.
      // However, "800-55-51234" would be different. Test the common phone format.
      const detections = await detectSensitiveData('Call 800-555-1234');
      // The phone has 10 digits. SSN regex expects \b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b
      // which is 9 digits. "800-555-1234" won't match the SSN regex because 555 has 3 digits
      // in the middle group (SSN expects 2). So no false positive here.
      const ssn = detections.find((d) => d.type === 'ssn');
      expect(ssn).toBeUndefined();
    });

    it('detects SSN without separators (123456789)', async () => {
      const detections = await detectSensitiveData('SSN: 123456789 end');
      const ssn = detections.find((d) => d.type === 'ssn');
      expect(ssn).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Credit Card Detection
  // -------------------------------------------------------------------------

  describe('credit card detection', () => {
    it('detects valid Visa card (4111111111111111)', async () => {
      const detections = await detectSensitiveData(
        'Card: 4111111111111111',
      );
      const cc = detections.find((d) => d.type === 'credit_card');
      expect(cc).toBeDefined();
      expect(cc!.severity).toBe('critical');
      expect(cc!.displayName).toBe('Credit Card Number');
    });

    it('detects valid Mastercard (5500000000000004)', async () => {
      const detections = await detectSensitiveData(
        'Card: 5500000000000004',
      );
      const cc = detections.find((d) => d.type === 'credit_card');
      expect(cc).toBeDefined();
    });

    it('detects valid Amex (340000000000009)', async () => {
      const detections = await detectSensitiveData('Amex: 340000000000009');
      const cc = detections.find((d) => d.type === 'credit_card');
      expect(cc).toBeDefined();
    });

    it('detects valid Discover (6011000000000004)', async () => {
      const detections = await detectSensitiveData(
        'Card: 6011000000000004',
      );
      const cc = detections.find((d) => d.type === 'credit_card');
      expect(cc).toBeDefined();
    });

    it('rejects invalid Luhn checksum (4111111111111112)', async () => {
      const detections = await detectSensitiveData(
        'Card: 4111111111111112',
      );
      const cc = detections.find((d) => d.type === 'credit_card');
      expect(cc).toBeUndefined();
    });

    it('rejects invalid prefix (1234567890123456)', async () => {
      // Starts with 1, which is not Visa (4), MC (5), Amex (3), or Discover (6)
      const detections = await detectSensitiveData(
        'Card: 1234567890123456',
      );
      const cc = detections.find((d) => d.type === 'credit_card');
      expect(cc).toBeUndefined();
    });

    it('detects card with spaces (4111 1111 1111 1111)', async () => {
      const detections = await detectSensitiveData(
        'Card: 4111 1111 1111 1111',
      );
      const cc = detections.find((d) => d.type === 'credit_card');
      expect(cc).toBeDefined();
    });

    it('detects card with dashes (4111-1111-1111-1111)', async () => {
      const detections = await detectSensitiveData(
        'Card: 4111-1111-1111-1111',
      );
      const cc = detections.find((d) => d.type === 'credit_card');
      expect(cc).toBeDefined();
    });

    it('detects valid Mastercard with various first digits (5100-5500)', async () => {
      // 5100000000000008 -> valid Mastercard with Luhn
      const detections = await detectSensitiveData(
        'Card: 5105105105105100',
      );
      const cc = detections.find((d) => d.type === 'credit_card');
      expect(cc).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // AWS Key Detection
  // -------------------------------------------------------------------------

  describe('AWS key detection', () => {
    it('detects AKIA prefix key', async () => {
      const detections = await detectSensitiveData(
        'aws_key=AKIAIOSFODNN7EXAMPLE',
      );
      const aws = detections.find((d) => d.type === 'aws_key');
      expect(aws).toBeDefined();
      expect(aws!.severity).toBe('critical');
      expect(aws!.displayName).toBe('AWS Access Key');
    });

    it('detects ASIA prefix key (temporary credentials)', async () => {
      const detections = await detectSensitiveData(
        'key: ASIAIOSFODNN7EXAMPLE',
      );
      const aws = detections.find((d) => d.type === 'aws_key');
      expect(aws).toBeDefined();
    });

    it('detects ABIA prefix key', async () => {
      const detections = await detectSensitiveData(
        'key: ABIAIOSFODNN7EXAMPLE',
      );
      const aws = detections.find((d) => d.type === 'aws_key');
      expect(aws).toBeDefined();
    });

    it('detects ACCA prefix key', async () => {
      const detections = await detectSensitiveData(
        'key: ACCAIOSFODNN7EXAMPLE',
      );
      const aws = detections.find((d) => d.type === 'aws_key');
      expect(aws).toBeDefined();
    });

    it('rejects too-short key', async () => {
      // AKIA followed by only 10 chars (need 16)
      const detections = await detectSensitiveData('key: AKIA12345678');
      const aws = detections.find((d) => d.type === 'aws_key');
      expect(aws).toBeUndefined();
    });

    it('rejects invalid prefix', async () => {
      const detections = await detectSensitiveData(
        'key: AXYZ1234567890123456',
      );
      const aws = detections.find((d) => d.type === 'aws_key');
      expect(aws).toBeUndefined();
    });

    it('rejects key with lowercase chars after prefix', async () => {
      // AWS keys after the prefix must be uppercase alphanumeric
      const detections = await detectSensitiveData(
        'key: AKIAiosfodnn7example',
      );
      const aws = detections.find((d) => d.type === 'aws_key');
      expect(aws).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // API Key Detection
  // -------------------------------------------------------------------------

  describe('API key detection', () => {
    it('detects sk- prefix key (OpenAI/Stripe style)', async () => {
      const detections = await detectSensitiveData(
        'token: sk-abcdefghijklmnopqrstuvwxyz1234',
      );
      const apiKey = detections.find((d) => d.type === 'api_key');
      expect(apiKey).toBeDefined();
      expect(apiKey!.severity).toBe('high');
    });

    it('detects api_key= pattern', async () => {
      const detections = await detectSensitiveData(
        'api_key=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
      );
      const apiKey = detections.find((d) => d.type === 'api_key');
      expect(apiKey).toBeDefined();
    });

    it('detects apikey= pattern', async () => {
      const detections = await detectSensitiveData(
        'apikey=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
      );
      const apiKey = detections.find((d) => d.type === 'api_key');
      expect(apiKey).toBeDefined();
    });

    it('detects api-key= pattern', async () => {
      const detections = await detectSensitiveData(
        'api-key=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
      );
      const apiKey = detections.find((d) => d.type === 'api_key');
      expect(apiKey).toBeDefined();
    });

    it('detects api_secret= pattern', async () => {
      const detections = await detectSensitiveData(
        'api_secret=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
      );
      const apiKey = detections.find((d) => d.type === 'api_key');
      expect(apiKey).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Private Key Detection
  // -------------------------------------------------------------------------

  describe('private key detection', () => {
    it('detects BEGIN RSA PRIVATE KEY', async () => {
      const detections = await detectSensitiveData(
        '-----BEGIN RSA PRIVATE KEY-----\nMIIE...',
      );
      const pk = detections.find((d) => d.type === 'private_key');
      expect(pk).toBeDefined();
      expect(pk!.severity).toBe('critical');
      expect(pk!.displayName).toBe('Private Key');
    });

    it('detects BEGIN PRIVATE KEY (non-RSA)', async () => {
      const detections = await detectSensitiveData(
        '-----BEGIN PRIVATE KEY-----\nMIIE...',
      );
      const pk = detections.find((d) => d.type === 'private_key');
      expect(pk).toBeDefined();
    });

    it('does not detect BEGIN PUBLIC KEY as private key', async () => {
      const detections = await detectSensitiveData(
        '-----BEGIN PUBLIC KEY-----\nMIIBIj...',
      );
      const pk = detections.find((d) => d.type === 'private_key');
      expect(pk).toBeUndefined();
    });

    it('detects private key with extra whitespace in header', async () => {
      const detections = await detectSensitiveData(
        '-----BEGIN  RSA  PRIVATE  KEY-----',
      );
      // The regex uses \s+ between words, so extra spaces should match
      const pk = detections.find((d) => d.type === 'private_key');
      expect(pk).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // GitHub Token Detection
  // -------------------------------------------------------------------------

  describe('GitHub token detection', () => {
    it('detects ghp_ token (personal access token)', async () => {
      const token = 'ghp_' + 'A'.repeat(36);
      const detections = await detectSensitiveData(`token: ${token}`);
      const gh = detections.find(
        (d) => d.type === 'api_key' && d.displayName === 'GitHub Token',
      );
      expect(gh).toBeDefined();
      expect(gh!.severity).toBe('high');
    });

    it('detects github_pat_ token (fine-grained)', async () => {
      const token =
        'github_pat_' + 'A'.repeat(22) + '_' + 'B'.repeat(59);
      const detections = await detectSensitiveData(`token: ${token}`);
      const gh = detections.find(
        (d) => d.type === 'api_key' && d.displayName === 'GitHub Token',
      );
      expect(gh).toBeDefined();
    });

    it('rejects ghp_ token with wrong length', async () => {
      // ghp_ + only 10 chars (needs 36)
      const token = 'ghp_' + 'A'.repeat(10);
      const detections = await detectSensitiveData(`token: ${token}`);
      const gh = detections.find(
        (d) => d.displayName === 'GitHub Token',
      );
      expect(gh).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Multiple detections and ordering
  // -------------------------------------------------------------------------

  describe('multiple detections', () => {
    it('detects multiple different types in same text', async () => {
      const text =
        'My SSN is 123-45-6789 and my card is 4111111111111111';
      const detections = await detectSensitiveData(text);

      const types = new Set(detections.map((d) => d.type));
      expect(types.has('ssn')).toBe(true);
      expect(types.has('credit_card')).toBe(true);
      expect(detections.length).toBeGreaterThanOrEqual(2);
    });

    it('returns detections sorted by start position', async () => {
      const text =
        'Card 4111111111111111 and SSN 123-45-6789 and key AKIAIOSFODNN7EXAMPLE';
      const detections = await detectSensitiveData(text);

      for (let i = 1; i < detections.length; i++) {
        expect(detections[i].start).toBeGreaterThanOrEqual(
          detections[i - 1].start,
        );
      }
    });

    it('detects same pattern type appearing multiple times', async () => {
      const text =
        'SSN1: 123-45-6789 and SSN2: 234-56-7890';
      const detections = await detectSensitiveData(text);
      const ssns = detections.filter((d) => d.type === 'ssn');
      expect(ssns.length).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Clean text (no detections)
  // -------------------------------------------------------------------------

  describe('clean text', () => {
    it('returns empty array for clean text', async () => {
      const detections = await detectSensitiveData(
        'This is a normal message with no sensitive data.',
      );
      expect(detections).toEqual([]);
    });

    it('returns empty array for short text', async () => {
      const detections = await detectSensitiveData('Hi');
      expect(detections).toEqual([]);
    });

    it('returns empty array for empty string', async () => {
      const detections = await detectSensitiveData('');
      expect(detections).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Detection metadata
  // -------------------------------------------------------------------------

  describe('detection metadata', () => {
    it('includes correct start and end positions', async () => {
      const text = 'SSN is 123-45-6789 here';
      const detections = await detectSensitiveData(text);
      const ssn = detections.find((d) => d.type === 'ssn');
      expect(ssn).toBeDefined();
      expect(ssn!.start).toBe(7);
      expect(ssn!.end).toBe(18);
    });

    it('validated matches have boosted confidence', async () => {
      // SSN has a validator, so validated matches get +0.02 confidence
      const detections = await detectSensitiveData('SSN: 123-45-6789');
      const ssn = detections.find((d) => d.type === 'ssn');
      expect(ssn).toBeDefined();
      // Base confidence is 0.95, boosted to 0.97
      expect(ssn!.confidence).toBe(0.97);
    });

    it('unvalidated pattern matches use base confidence', async () => {
      // Private key has no validator (confidence stays at base 0.99)
      const detections = await detectSensitiveData(
        '-----BEGIN RSA PRIVATE KEY-----',
      );
      const pk = detections.find((d) => d.type === 'private_key');
      expect(pk).toBeDefined();
      expect(pk!.confidence).toBe(0.99);
    });
  });
});

// =============================================================================
// mightContainSensitiveDataSync
// =============================================================================

describe('mightContainSensitiveDataSync', () => {
  it('returns false for text shorter than 3 chars', () => {
    expect(mightContainSensitiveDataSync('')).toBe(false);
    expect(mightContainSensitiveDataSync('Hi')).toBe(false);
    expect(mightContainSensitiveDataSync('ab')).toBe(false);
  });

  it('returns false for short text under 8 chars without custom patterns', () => {
    // The function checks text.length >= 8 before running built-in patterns
    expect(mightContainSensitiveDataSync('hello')).toBe(false);
  });

  it('returns true for SSN pattern', () => {
    expect(
      mightContainSensitiveDataSync('My SSN is 123-45-6789'),
    ).toBe(true);
  });

  it('returns true for credit card pattern', () => {
    expect(
      mightContainSensitiveDataSync('Card: 4111 1111 1111 1111'),
    ).toBe(true);
  });

  it('returns true for AWS key prefix AKIA', () => {
    expect(
      mightContainSensitiveDataSync('key: AKIAIOSFODNN7EXAMPLE'),
    ).toBe(true);
  });

  it('returns true for AWS key prefix ASIA', () => {
    expect(
      mightContainSensitiveDataSync('key: ASIAIOSFODNN7EXAMPLE'),
    ).toBe(true);
  });

  it('returns true for sk- prefix', () => {
    expect(
      mightContainSensitiveDataSync(
        'key: sk-abcdefghij1234567890',
      ),
    ).toBe(true);
  });

  it('returns true for PRIVATE KEY marker', () => {
    expect(
      mightContainSensitiveDataSync(
        '-----BEGIN RSA PRIVATE KEY-----',
      ),
    ).toBe(true);
  });

  it('returns true for api_key pattern', () => {
    expect(
      mightContainSensitiveDataSync('api_key=12345678901234567890'),
    ).toBe(true);
  });

  it('returns true for apikey pattern', () => {
    expect(
      mightContainSensitiveDataSync('apikey: somevalue12345'),
    ).toBe(true);
  });

  it('returns false for clean text', () => {
    expect(
      mightContainSensitiveDataSync(
        'This is a normal message about cats and dogs.',
      ),
    ).toBe(false);
  });
});

// =============================================================================
// mightContainSensitiveData (async)
// =============================================================================

describe('mightContainSensitiveData', () => {
  it('returns false for text shorter than 3 chars', async () => {
    expect(await mightContainSensitiveData('')).toBe(false);
    expect(await mightContainSensitiveData('Hi')).toBe(false);
  });

  it('returns true for built-in sensitive patterns', async () => {
    expect(
      await mightContainSensitiveData('My SSN is 123-45-6789'),
    ).toBe(true);
  });

  it('returns false for clean text', async () => {
    expect(
      await mightContainSensitiveData(
        'This is a perfectly normal message about the weather today.',
      ),
    ).toBe(false);
  });

  it('checks custom patterns from storage', async () => {
    // Set up custom patterns in storage
    setStorageData('customPatterns', [
      {
        id: 'cp1',
        name: 'Project Codename',
        pattern_type: 'keyword_list',
        pattern_value: '["project-alpha", "codename-beta"]',
        severity: 'high',
        action: 'block',
        enabled: true,
      },
    ]);

    const result = await mightContainSensitiveData(
      'We are working on project-alpha launch',
    );
    expect(result).toBe(true);
  });

  it('custom patterns respect enabled flag', async () => {
    setStorageData('customPatterns', [
      {
        id: 'cp2',
        name: 'Disabled Pattern',
        pattern_type: 'keyword_list',
        pattern_value: '["secret-word"]',
        severity: 'high',
        action: 'block',
        enabled: false,
      },
    ]);

    const result = await mightContainSensitiveData(
      'This contains secret-word in it',
    );
    // The sync check won't find it because no built-in patterns match
    // The async check loads from storage but the pattern is disabled
    expect(result).toBe(false);
  });
});

// =============================================================================
// getDetectionSummary
// =============================================================================

describe('getDetectionSummary', () => {
  it('returns "No sensitive data detected" for empty array', () => {
    expect(getDetectionSummary([])).toBe('No sensitive data detected');
  });

  it('returns single type name for one detection', () => {
    const detections: Detection[] = [
      {
        type: 'ssn',
        displayName: 'US Social Security Number',
        severity: 'critical',
        start: 0,
        end: 11,
        confidence: 0.95,
      },
    ];
    expect(getDetectionSummary(detections)).toBe(
      'US Social Security Number detected',
    );
  });

  it('returns count and all types for multiple detections of same type', () => {
    const detections: Detection[] = [
      {
        type: 'ssn',
        displayName: 'US Social Security Number',
        severity: 'critical',
        start: 0,
        end: 11,
        confidence: 0.95,
      },
      {
        type: 'ssn',
        displayName: 'US Social Security Number',
        severity: 'critical',
        start: 20,
        end: 31,
        confidence: 0.95,
      },
    ];
    // Both have the same displayName, so unique types = 1
    expect(getDetectionSummary(detections)).toBe(
      'US Social Security Number detected',
    );
  });

  it('returns count and all types for multiple different types', () => {
    const detections: Detection[] = [
      {
        type: 'ssn',
        displayName: 'US Social Security Number',
        severity: 'critical',
        start: 0,
        end: 11,
        confidence: 0.95,
      },
      {
        type: 'credit_card',
        displayName: 'Credit Card Number',
        severity: 'critical',
        start: 20,
        end: 36,
        confidence: 0.9,
      },
      {
        type: 'aws_key',
        displayName: 'AWS Access Key',
        severity: 'critical',
        start: 40,
        end: 60,
        confidence: 0.98,
      },
    ];
    const summary = getDetectionSummary(detections);
    expect(summary).toContain('3 types');
    expect(summary).toContain('US Social Security Number');
    expect(summary).toContain('Credit Card Number');
    expect(summary).toContain('AWS Access Key');
  });
});

// =============================================================================
// Custom pattern detection (via detectSensitiveData)
// =============================================================================

describe('custom pattern detection', () => {
  it('detects keyword_list pattern match', async () => {
    setStorageData('customPatterns', [
      {
        id: 'kw1',
        name: 'Internal Project Names',
        pattern_type: 'keyword_list',
        pattern_value: '["project-phoenix", "operation-aurora"]',
        severity: 'high',
        action: 'block',
        enabled: true,
      },
    ]);

    const detections = await detectSensitiveData(
      'We launched project-phoenix last week',
    );
    const custom = detections.find((d) => d.type === 'custom');
    expect(custom).toBeDefined();
    expect(custom!.displayName).toBe('Internal Project Names');
    expect(custom!.severity).toBe('high');
    expect(custom!.confidence).toBe(0.9);
  });

  it('keyword match is case-insensitive', async () => {
    setStorageData('customPatterns', [
      {
        id: 'kw2',
        name: 'Secret Keywords',
        pattern_type: 'keyword_list',
        pattern_value: '["TopSecret"]',
        severity: 'critical',
        action: 'block',
        enabled: true,
      },
    ]);

    const detections = await detectSensitiveData(
      'This document is TOPSECRET classified',
    );
    const custom = detections.find((d) => d.type === 'custom');
    expect(custom).toBeDefined();
  });

  it('detects regex custom pattern match', async () => {
    setStorageData('customPatterns', [
      {
        id: 'rx1',
        name: 'Internal ID',
        pattern_type: 'regex',
        pattern_value: 'INT-\\d{6}',
        severity: 'medium',
        action: 'warn',
        enabled: true,
      },
    ]);

    const detections = await detectSensitiveData(
      'Reference: INT-123456 was filed',
    );
    const custom = detections.find((d) => d.type === 'custom');
    expect(custom).toBeDefined();
    expect(custom!.displayName).toBe('Internal ID');
    expect(custom!.severity).toBe('medium');
    expect(custom!.confidence).toBe(0.85);
  });

  it('skips disabled custom patterns', async () => {
    setStorageData('customPatterns', [
      {
        id: 'dis1',
        name: 'Disabled Pattern',
        pattern_type: 'keyword_list',
        pattern_value: '["disabled-keyword"]',
        severity: 'high',
        action: 'block',
        enabled: false,
      },
    ]);

    const detections = await detectSensitiveData(
      'This has disabled-keyword in it',
    );
    const custom = detections.find((d) => d.type === 'custom');
    expect(custom).toBeUndefined();
  });

  it('skips invalid regex patterns gracefully', async () => {
    setStorageData('customPatterns', [
      {
        id: 'bad1',
        name: 'Bad Regex',
        pattern_type: 'regex',
        pattern_value: '[invalid(regex',
        severity: 'high',
        action: 'block',
        enabled: true,
      },
    ]);

    // Should not throw, should just skip the invalid pattern
    const detections = await detectSensitiveData('Some text here');
    const custom = detections.find((d) => d.type === 'custom');
    expect(custom).toBeUndefined();
  });

  it('skips invalid JSON in keyword_list gracefully', async () => {
    setStorageData('customPatterns', [
      {
        id: 'bad2',
        name: 'Bad JSON',
        pattern_type: 'keyword_list',
        pattern_value: 'not-valid-json',
        severity: 'high',
        action: 'block',
        enabled: true,
      },
    ]);

    // Should not throw, should just skip the invalid pattern
    const detections = await detectSensitiveData('Some text here');
    const custom = detections.find((d) => d.type === 'custom');
    expect(custom).toBeUndefined();
  });

  it('finds all occurrences of a keyword in text', async () => {
    setStorageData('customPatterns', [
      {
        id: 'multi1',
        name: 'Secret Word',
        pattern_type: 'keyword_list',
        pattern_value: '["secret"]',
        severity: 'high',
        action: 'block',
        enabled: true,
      },
    ]);

    const detections = await detectSensitiveData(
      'secret data and more secret info',
    );
    const customs = detections.filter((d) => d.type === 'custom');
    expect(customs.length).toBe(2);
  });

  it('finds all occurrences of a regex pattern in text', async () => {
    setStorageData('customPatterns', [
      {
        id: 'rx2',
        name: 'ID Pattern',
        pattern_type: 'regex',
        pattern_value: 'ID-\\d{4}',
        severity: 'medium',
        action: 'warn',
        enabled: true,
      },
    ]);

    const detections = await detectSensitiveData(
      'ID-1234 and ID-5678 were flagged',
    );
    const customs = detections.filter((d) => d.type === 'custom');
    expect(customs.length).toBe(2);
  });
});

// =============================================================================
// loadCustomPatternsIntoMemory + sync quick check
// =============================================================================

describe('loadCustomPatternsIntoMemory and sync custom pattern checks', () => {
  it('loads custom patterns from storage into memory for sync checks', () => {
    // Set patterns in storage
    setStorageData('customPatterns', [
      {
        id: 'mem1',
        name: 'Memory Pattern',
        pattern_type: 'keyword_list',
        pattern_value: '["in-memory-secret"]',
        severity: 'high',
        action: 'block',
        enabled: true,
      },
    ]);

    // Load them into memory
    loadCustomPatternsIntoMemory();

    // Now the sync check should find the pattern
    expect(
      mightContainSensitiveDataSync(
        'This contains in-memory-secret data',
      ),
    ).toBe(true);
  });

  it('storage change listener updates in-memory cache', () => {
    // Trigger a storage change as if custom patterns were synced
    triggerStorageChange('customPatterns', [
      {
        id: 'live1',
        name: 'Live Pattern',
        pattern_type: 'keyword_list',
        pattern_value: '["live-update-secret"]',
        severity: 'critical',
        action: 'block',
        enabled: true,
      },
    ]);

    // The sync check should now find this pattern via in-memory cache
    expect(
      mightContainSensitiveDataSync(
        'The live-update-secret is now detected',
      ),
    ).toBe(true);
  });

  it('handles clearing custom patterns from storage', () => {
    // First load some patterns
    triggerStorageChange('customPatterns', [
      {
        id: 'temp1',
        name: 'Temp Pattern',
        pattern_type: 'keyword_list',
        pattern_value: '["temp-keyword"]',
        severity: 'high',
        action: 'block',
        enabled: true,
      },
    ]);

    // Verify they are detected
    expect(
      mightContainSensitiveDataSync('Text with temp-keyword here'),
    ).toBe(true);

    // Now clear patterns (set to non-array)
    triggerStorageChange('customPatterns', null);

    // Should no longer detect the custom pattern
    expect(
      mightContainSensitiveDataSync('Text with temp-keyword here'),
    ).toBe(false);
  });

  it('sync check respects enabled flag on in-memory patterns', () => {
    triggerStorageChange('customPatterns', [
      {
        id: 'disabled1',
        name: 'Disabled In Memory',
        pattern_type: 'keyword_list',
        pattern_value: '["disabled-memory-kw"]',
        severity: 'high',
        action: 'block',
        enabled: false,
      },
    ]);

    expect(
      mightContainSensitiveDataSync(
        'This has disabled-memory-kw in it',
      ),
    ).toBe(false);
  });

  it('sync check handles regex custom patterns in memory', () => {
    triggerStorageChange('customPatterns', [
      {
        id: 'rxmem1',
        name: 'Memory Regex',
        pattern_type: 'regex',
        pattern_value: 'MEM-\\d{4}',
        severity: 'medium',
        action: 'warn',
        enabled: true,
      },
    ]);

    expect(mightContainSensitiveDataSync('Ref: MEM-1234 found')).toBe(
      true,
    );
    expect(
      mightContainSensitiveDataSync('Ref: MEM-ABCD found'),
    ).toBe(false);
  });
});
