/**
 * Tests for patterns added in M2: extension ↔ backend pattern parity.
 *
 * Covers every pattern that was present in backend/app/detection/patterns.py
 * but absent (or incomplete) in the extension before this mission:
 *   - Email Address
 *   - AWS Secret Access Key
 *   - Stripe API Key  (sk_live_, sk_test_, pk_live_, pk_test_, rk_live_, rk_test_)
 *   - Bearer Token
 *   - Slack Token     (xoxb-, xoxp-, xoxa-, xoxr-, xoxs-)
 *   - Private Key PEM — expanded to EC, DSA, OPENSSH, ENCRYPTED, PGP + BLOCK suffix
 *   - sk- prefix      — negative lookahead confirming no overlap with Stripe
 *
 * TEST VALUE POLICY:
 *   All secret-like values are obviously fake (short, sequential, or
 *   non-random) so they cannot trigger GitHub's secret-scanning heuristics.
 *
 * SETUP:
 *   Chrome APIs are mocked globally by tests/setup.ts (via vitest setupFiles).
 */

import {
  detectSensitiveData,
  mightContainSensitiveDataSync,
} from '../detection';

// Suppress detection module console output during tests
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

// =============================================================================
// Email Address
// =============================================================================

describe('Email Address detection', () => {
  // --- Positive matches ---

  it('detects a simple email address', async () => {
    const detections = await detectSensitiveData(
      'Contact me at user@example.com for details',
    );
    const email = detections.find((d) => d.type === 'email');
    expect(email).toBeDefined();
    expect(email!.displayName).toBe('Email Address');
    expect(email!.severity).toBe('low');
    expect(email!.confidence).toBe(0.99);
  });

  it('detects email with plus-addressing and subdomain', async () => {
    const detections = await detectSensitiveData(
      'Reply to john.doe+work@mail.company.org',
    );
    const email = detections.find((d) => d.type === 'email');
    expect(email).toBeDefined();
  });

  it('detects email with hyphens and numbers in local part', async () => {
    const detections = await detectSensitiveData(
      'Send to test-user-123@sub.domain.io please',
    );
    const email = detections.find((d) => d.type === 'email');
    expect(email).toBeDefined();
  });

  it('returns correct start/end positions for email', async () => {
    const text = 'Email: alice@example.com here';
    //            0123456789...
    //            'Email: ' = 7 chars
    const detections = await detectSensitiveData(text);
    const email = detections.find((d) => d.type === 'email');
    expect(email).toBeDefined();
    expect(text.substring(email!.start, email!.end)).toBe('alice@example.com');
  });

  // --- Negative matches ---

  it('does not detect a bare @ symbol', async () => {
    const detections = await detectSensitiveData('use @ symbol here');
    const email = detections.find((d) => d.type === 'email');
    expect(email).toBeUndefined();
  });

  it('does not detect a string with @ but no TLD', async () => {
    const detections = await detectSensitiveData(
      'username@hostname with no tld suffix',
    );
    const email = detections.find((d) => d.type === 'email');
    expect(email).toBeUndefined();
  });

  it('does not detect text with no @ at all', async () => {
    const detections = await detectSensitiveData(
      'no at-sign in this text whatsoever',
    );
    const email = detections.find((d) => d.type === 'email');
    expect(email).toBeUndefined();
  });
});

// =============================================================================
// AWS Secret Access Key
// =============================================================================

describe('AWS Secret Access Key detection', () => {
  // --- Positive matches ---

  it('detects aws_secret_access_key= assignment (lowercase keyword)', async () => {
    const detections = await detectSensitiveData(
      'aws_secret_access_key=aaaabbbbccccddddeeee',
    );
    const secret = detections.find((d) => d.type === 'aws_secret');
    expect(secret).toBeDefined();
    expect(secret!.displayName).toBe('AWS Secret Access Key');
    expect(secret!.severity).toBe('critical');
    expect(secret!.confidence).toBe(0.85);
  });

  it('detects secret_access_key: with colon separator', async () => {
    const detections = await detectSensitiveData(
      'secret_access_key: ZZZZYYYYXXXXWWWWVVVV',
    );
    const secret = detections.find((d) => d.type === 'aws_secret');
    expect(secret).toBeDefined();
  });

  it('detects SecretAccessKey= in PascalCase (config file style)', async () => {
    const detections = await detectSensitiveData(
      'SecretAccessKey="MMMMNNNNOOOOPPPPQQQQ"',
    );
    const secret = detections.find((d) => d.type === 'aws_secret');
    expect(secret).toBeDefined();
  });

  it('detects AWS_SECRET_ACCESS_KEY in uppercase env var style', async () => {
    const detections = await detectSensitiveData(
      'AWS_SECRET_ACCESS_KEY=aaaabbbbccccddddeeee',
    );
    const secret = detections.find((d) => d.type === 'aws_secret');
    expect(secret).toBeDefined();
  });

  // --- Negative matches ---

  it('does not detect aws_secret_access_key with value shorter than 20 chars', async () => {
    const detections = await detectSensitiveData(
      'aws_secret_access_key=tooshort',
    );
    const secret = detections.find((d) => d.type === 'aws_secret');
    expect(secret).toBeUndefined();
  });

  it('does not detect an unrelated key name before a long value', async () => {
    const detections = await detectSensitiveData(
      'other_key=aaaabbbbccccddddeeeefffff',
    );
    const secret = detections.find((d) => d.type === 'aws_secret');
    expect(secret).toBeUndefined();
  });

  it('does not flag aws_access_key_id (key ID, not secret)', async () => {
    // AWS key IDs are caught by the aws_key pattern, not aws_secret
    const detections = await detectSensitiveData(
      'aws_access_key_id=AKIAIOSFODNN7EXAMPLE',
    );
    const secret = detections.find((d) => d.type === 'aws_secret');
    expect(secret).toBeUndefined();
  });
});

// =============================================================================
// Stripe API Key
// =============================================================================

describe('Stripe API Key detection', () => {
  // --- Positive matches ---

  it('detects sk_test_ key (test secret key)', async () => {
    const detections = await detectSensitiveData(
      'stripe_key=sk_test_abcdefghij',
    );
    const stripe = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Stripe API Key',
    );
    expect(stripe).toBeDefined();
    expect(stripe!.severity).toBe('high');
    expect(stripe!.confidence).toBe(0.99);
  });

  it('detects pk_live_ key (live publishable key)', async () => {
    const detections = await detectSensitiveData(
      'publishable: pk_live_0123456789',
    );
    const stripe = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Stripe API Key',
    );
    expect(stripe).toBeDefined();
  });

  it('detects rk_test_ key (restricted key)', async () => {
    const detections = await detectSensitiveData(
      'restricted_key=rk_test_zyxwvutsrq',
    );
    const stripe = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Stripe API Key',
    );
    expect(stripe).toBeDefined();
  });

  it('detects sk_live_ key (live secret key)', async () => {
    const detections = await detectSensitiveData(
      'key: sk_live_abcdefghij',
    );
    const stripe = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Stripe API Key',
    );
    expect(stripe).toBeDefined();
  });

  // --- Negative matches ---

  it('does not detect sk_test_ key with fewer than 10 chars after prefix', async () => {
    // 'shortval' = 8 chars (< 10)
    const detections = await detectSensitiveData('key=sk_test_shortval');
    const stripe = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Stripe API Key',
    );
    expect(stripe).toBeUndefined();
  });

  it('does not detect a key with an unrecognized prefix variant', async () => {
    const detections = await detectSensitiveData(
      'key=ak_test_abcdefghij',
    );
    const stripe = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Stripe API Key',
    );
    expect(stripe).toBeUndefined();
  });

  it('does not detect a key with an unrecognized env (live/test only)', async () => {
    const detections = await detectSensitiveData(
      'key=sk_staging_abcdefghij',
    );
    const stripe = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Stripe API Key',
    );
    expect(stripe).toBeUndefined();
  });

  it('sk- (hyphen) keys do NOT fire as Stripe keys (no overlap)', async () => {
    // sk- with hyphen is OpenAI-style, NOT Stripe (which uses sk_)
    const detections = await detectSensitiveData(
      'key: sk-abcdefghijklmnopqrstuvwxyz1234',
    );
    const stripe = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Stripe API Key',
    );
    expect(stripe).toBeUndefined();
    // But it SHOULD fire as a generic API key
    const apiKey = detections.find((d) => d.displayName === 'API Key (sk- prefix)');
    expect(apiKey).toBeDefined();
  });
});

// =============================================================================
// Bearer Token
// =============================================================================

describe('Bearer Token detection', () => {
  // --- Positive matches ---

  it('detects Bearer token in Authorization header (capital B)', async () => {
    const detections = await detectSensitiveData(
      'Authorization: Bearer abcdefghijklmnopqrst',
    );
    const bearer = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Bearer Token',
    );
    expect(bearer).toBeDefined();
    expect(bearer!.severity).toBe('high');
    expect(bearer!.confidence).toBe(0.85);
  });

  it('detects bearer token with lowercase b', async () => {
    const detections = await detectSensitiveData(
      'bearer AAAAAAAAAAAAAAAAAAAAAA',
    );
    const bearer = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Bearer Token',
    );
    expect(bearer).toBeDefined();
  });

  it('detects Bearer token with underscores and hyphens in value', async () => {
    const detections = await detectSensitiveData(
      'Bearer token_1234567890abcdefghijkl',
    );
    const bearer = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Bearer Token',
    );
    expect(bearer).toBeDefined();
  });

  // --- Negative matches ---

  it('does not detect Bearer with a token shorter than 20 chars', async () => {
    const detections = await detectSensitiveData(
      'Authorization: Bearer shorttoken',
    );
    // 'shorttoken' = 10 chars < 20
    const bearer = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Bearer Token',
    );
    expect(bearer).toBeUndefined();
  });

  it('does not detect a non-Bearer keyword before a long token', async () => {
    const detections = await detectSensitiveData(
      'Token abcdefghijklmnopqrstuvwxyz1234',
    );
    const bearer = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Bearer Token',
    );
    expect(bearer).toBeUndefined();
  });
});

// =============================================================================
// Slack Token
// =============================================================================

describe('Slack Token detection', () => {
  // --- Positive matches ---

  it('detects xoxb- bot token', async () => {
    const detections = await detectSensitiveData(
      'slack_token=xoxb-11111111111-22222222222',
    );
    const slack = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Slack Token',
    );
    expect(slack).toBeDefined();
    expect(slack!.severity).toBe('high');
    expect(slack!.confidence).toBe(0.98);
  });

  it('detects xoxp- user token', async () => {
    const detections = await detectSensitiveData(
      'token: xoxp-11111111111-22222222222-ABCDEFGH',
    );
    const slack = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Slack Token',
    );
    expect(slack).toBeDefined();
  });

  it('detects xoxa- app token', async () => {
    const detections = await detectSensitiveData(
      'xoxa-11111111111-22222222222',
    );
    const slack = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Slack Token',
    );
    expect(slack).toBeDefined();
  });

  it('detects xoxs- service token', async () => {
    const detections = await detectSensitiveData(
      'service_token=xoxs-11111111111-22222222222',
    );
    const slack = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Slack Token',
    );
    expect(slack).toBeDefined();
  });

  it('detects xoxr- refresh token', async () => {
    const detections = await detectSensitiveData(
      'refresh: xoxr-11111111111-22222222222',
    );
    const slack = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Slack Token',
    );
    expect(slack).toBeDefined();
  });

  // --- Negative matches ---

  it('does not detect xoxz- (invalid token type letter)', async () => {
    const detections = await detectSensitiveData(
      'xoxz-11111111111-22222222222',
    );
    const slack = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Slack Token',
    );
    expect(slack).toBeUndefined();
  });

  it('does not detect xoxb- when digit groups are too short (< 10 digits)', async () => {
    const detections = await detectSensitiveData(
      'xoxb-12345-67890',
    );
    // 5 and 5 digits — both groups are < 10 digits required
    const slack = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Slack Token',
    );
    expect(slack).toBeUndefined();
  });

  it('does not detect a plain string with xox but no separator structure', async () => {
    const detections = await detectSensitiveData(
      'xoxb111111111112222222222',
    );
    // No hyphens between segments — does not match pattern
    const slack = detections.find(
      (d) => d.type === 'api_key' && d.displayName === 'Slack Token',
    );
    expect(slack).toBeUndefined();
  });
});

// =============================================================================
// Private Key — expanded PEM types (EC, DSA, OPENSSH, ENCRYPTED, PGP + BLOCK)
// =============================================================================

describe('Private Key — expanded PEM header detection', () => {
  // Existing RSA and generic types are covered in tests/detection.test.ts.
  // This suite covers the types added by M2.

  it('detects EC PRIVATE KEY', async () => {
    const detections = await detectSensitiveData(
      '-----BEGIN EC PRIVATE KEY-----\nMHQCAQEE...',
    );
    const pk = detections.find((d) => d.type === 'private_key');
    expect(pk).toBeDefined();
    expect(pk!.displayName).toBe('Private Key');
    expect(pk!.severity).toBe('critical');
    expect(pk!.confidence).toBe(0.99);
  });

  it('detects DSA PRIVATE KEY', async () => {
    const detections = await detectSensitiveData(
      '-----BEGIN DSA PRIVATE KEY-----\nMIIBugIB...',
    );
    const pk = detections.find((d) => d.type === 'private_key');
    expect(pk).toBeDefined();
  });

  it('detects OPENSSH PRIVATE KEY', async () => {
    const detections = await detectSensitiveData(
      '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNz...',
    );
    const pk = detections.find((d) => d.type === 'private_key');
    expect(pk).toBeDefined();
  });

  it('detects ENCRYPTED PRIVATE KEY', async () => {
    const detections = await detectSensitiveData(
      '-----BEGIN ENCRYPTED PRIVATE KEY-----\nMIIFHDBOBg...',
    );
    const pk = detections.find((d) => d.type === 'private_key');
    expect(pk).toBeDefined();
  });

  it('detects PGP PRIVATE KEY BLOCK', async () => {
    const detections = await detectSensitiveData(
      '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: GnuPG',
    );
    const pk = detections.find((d) => d.type === 'private_key');
    expect(pk).toBeDefined();
  });

  it('does not detect BEGIN PUBLIC KEY as a private key', async () => {
    const detections = await detectSensitiveData(
      '-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...',
    );
    const pk = detections.find((d) => d.type === 'private_key');
    expect(pk).toBeUndefined();
  });

  it('does not detect BEGIN CERTIFICATE as a private key', async () => {
    const detections = await detectSensitiveData(
      '-----BEGIN CERTIFICATE-----\nMIIDXTCC...',
    );
    const pk = detections.find((d) => d.type === 'private_key');
    expect(pk).toBeUndefined();
  });
});

// =============================================================================
// mightContainSensitiveDataSync — quick-check coverage for new patterns
// =============================================================================

describe('mightContainSensitiveDataSync — new pattern quick checks', () => {
  it('returns true for text containing an email address', () => {
    expect(mightContainSensitiveDataSync('Contact user@example.com now')).toBe(
      true,
    );
  });

  it('returns true for text containing a Stripe sk_test_ key', () => {
    expect(
      mightContainSensitiveDataSync('key=sk_test_abcdefghij'),
    ).toBe(true);
  });

  it('returns true for text containing a Stripe pk_live_ key', () => {
    expect(
      mightContainSensitiveDataSync('publishable=pk_live_abcdefghij'),
    ).toBe(true);
  });

  it('returns true for text containing a Slack xoxb- token', () => {
    expect(
      mightContainSensitiveDataSync('xoxb-11111111111-22222222222'),
    ).toBe(true);
  });

  it('returns true for text containing a Slack xoxp- token', () => {
    expect(
      mightContainSensitiveDataSync('xoxp-11111111111-22222222222'),
    ).toBe(true);
  });

  it('returns true for text containing aws_secret_access_key keyword', () => {
    expect(
      mightContainSensitiveDataSync(
        'aws_secret_access_key=aaaabbbbccccddddeeee',
      ),
    ).toBe(true);
  });

  it('returns true for text containing SecretAccessKey keyword', () => {
    expect(
      mightContainSensitiveDataSync(
        'SecretAccessKey=aaaabbbbccccddddeeee',
      ),
    ).toBe(true);
  });

  it('returns true for text containing a Bearer token (20+ char value)', () => {
    expect(
      mightContainSensitiveDataSync(
        'Authorization: Bearer abcdefghijklmnopqrst',
      ),
    ).toBe(true);
  });

  it('returns false for Bearer with a short value (< 20 chars)', () => {
    // The sync check uses the same 20-char minimum as the full pattern
    expect(
      mightContainSensitiveDataSync('Authorization: Bearer shortval'),
    ).toBe(false);
  });

  it('returns false for clean text with no new-pattern signals', () => {
    expect(
      mightContainSensitiveDataSync(
        'This is a perfectly normal sentence about the weather.',
      ),
    ).toBe(false);
  });
});

// =============================================================================
// DetectionType — verify new types exist and map correctly
// =============================================================================

describe('New DetectionType values', () => {
  it('email detections carry type "email"', async () => {
    const detections = await detectSensitiveData('me@example.com');
    const email = detections.find((d) => d.type === 'email');
    expect(email).toBeDefined();
    expect(email!.type).toBe('email');
  });

  it('aws_secret detections carry type "aws_secret"', async () => {
    const detections = await detectSensitiveData(
      'aws_secret_access_key=aaaabbbbccccddddeeee',
    );
    const secret = detections.find((d) => d.type === 'aws_secret');
    expect(secret).toBeDefined();
    expect(secret!.type).toBe('aws_secret');
  });
});
