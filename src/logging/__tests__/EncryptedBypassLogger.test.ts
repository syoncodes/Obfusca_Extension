/**
 * Tests for EncryptedBypassLogger (Option B — structured evidence).
 *
 * Key invariant: raw sensitive values MUST NOT appear in the outbound payload.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EncryptedBypassLogger,
  inferValueFormat,
  inferReplacementChosen,
  fingerprintValue,
} from '../EncryptedBypassLogger';
import type { BypassEvent } from '../types';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Capture the JSON body sent by fetch so we can inspect it. */
function makeFetchSpy(ok = true): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    text: () => Promise.resolve(''),
  });
}

function makeLogger(fetchSpy: ReturnType<typeof vi.fn>): EncryptedBypassLogger {
  vi.stubGlobal('fetch', fetchSpy);
  return new EncryptedBypassLogger(
    'https://api.obfusca.test',
    async () => 'test-token',
  );
}

/** Parse the JSON body captured by the fetch spy (first call). */
function capturedPayload(fetchSpy: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. Format template — inferValueFormat()
// ──────────────────────────────────────────────────────────────────────────────

describe('inferValueFormat', () => {
  it('SSN produces correct format template XXX-XX-XXXX', () => {
    expect(inferValueFormat('123-45-6789')).toBe('XXX-XX-XXXX');
  });

  it('money with suffix produces format $X.XM', () => {
    expect(inferValueFormat('$1.2M')).toBe('$X.XM');
  });

  it('money with commas produces format $XXX,XXX', () => {
    expect(inferValueFormat('$123,456')).toBe('$XXX,XXX');
  });

  it('credit card produces format XXXX-XXXX-XXXX-XXXX', () => {
    expect(inferValueFormat('4111-1111-1111-1111')).toBe('XXXX-XXXX-XXXX-XXXX');
  });

  it('phone number preserves parentheses and dashes', () => {
    expect(inferValueFormat('(555) 867-5309')).toBe('(XXX) XXX-XXXX');
  });

  it('email without digits is returned structurally unchanged', () => {
    expect(inferValueFormat('john@example.com')).toBe('john@example.com');
  });

  it('value with no special chars returns only Xs', () => {
    expect(inferValueFormat('12345')).toBe('XXXXX');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Replacement inference — inferReplacementChosen()
// ──────────────────────────────────────────────────────────────────────────────

describe('inferReplacementChosen', () => {
  it('returns masked for bracket placeholders like [SSN]', () => {
    expect(inferReplacementChosen('[SSN]')).toBe('masked');
  });

  it('returns masked for multi-word bracket labels', () => {
    expect(inferReplacementChosen('[FULL_LEGAL_NAME]')).toBe('masked');
  });

  it('returns dummy for non-bracket replacement strings', () => {
    expect(inferReplacementChosen('555-12-3456')).toBe('dummy');
  });

  it('returns keep when replacement is undefined', () => {
    expect(inferReplacementChosen(undefined)).toBe('keep');
  });

  it('returns keep when replacement is empty string', () => {
    expect(inferReplacementChosen('')).toBe('keep');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Fingerprint — fingerprintValue()
// ──────────────────────────────────────────────────────────────────────────────

describe('fingerprintValue', () => {
  it('returns exactly 8 hex characters', async () => {
    const fp = await fingerprintValue('123-45-6789');
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is deterministic — same value always produces same fingerprint', async () => {
    const a = await fingerprintValue('456-78-9012');
    const b = await fingerprintValue('456-78-9012');
    expect(a).toBe(b);
  });

  it('differs for distinct values', async () => {
    const a = await fingerprintValue('value-one');
    const b = await fingerprintValue('value-two');
    expect(a).not.toBe(b);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. EncryptedBypassLogger.log() — payload structure
// ──────────────────────────────────────────────────────────────────────────────

describe('EncryptedBypassLogger.log()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── 4a. Raw value absent from payload ────────────────────────────────────

  it('raw value is NOT present anywhere in the serialised payload', async () => {
    const sentinel = 'UNIQUE-SENTINEL-987-65-4321';
    const fetchSpy = makeFetchSpy();
    const logger = makeLogger(fetchSpy);

    const event: BypassEvent = {
      source: 'chatgpt',
      contentHash: 'sha256:abc',
      detections: [
        {
          type: 'ssn',
          label: 'US Social Security Number',
          severity: 'critical',
          confidence: 0.97,
          value: sentinel,
          replacement: '[SSN]',
        },
      ],
    };

    await logger.log(event);

    const body = fetchSpy.mock.calls[0][1].body as string;
    expect(body).not.toContain(sentinel);
  });

  // ── 4b. Fingerprint shape ────────────────────────────────────────────────

  it('value_fingerprint in the payload is 8 hex characters', async () => {
    const fetchSpy = makeFetchSpy();
    const logger = makeLogger(fetchSpy);

    await logger.log({
      source: 'claude',
      contentHash: 'sha256:def',
      detections: [
        { type: 'ssn', severity: 'critical', confidence: 0.95, value: '123-45-6789' },
      ],
    });

    const payload = capturedPayload(fetchSpy);
    const detections = payload.bypassed_detections as Array<Record<string, unknown>>;
    expect(detections[0].value_fingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  // ── 4c. value_length ─────────────────────────────────────────────────────

  it('value_length matches the length of the original value', async () => {
    const value = '123-45-6789'; // length 11
    const fetchSpy = makeFetchSpy();
    const logger = makeLogger(fetchSpy);

    await logger.log({
      source: 'gemini',
      contentHash: 'sha256:ghi',
      detections: [
        { type: 'ssn', severity: 'critical', confidence: 0.95, value },
      ],
    });

    const payload = capturedPayload(fetchSpy);
    const detections = payload.bypassed_detections as Array<Record<string, unknown>>;
    expect(detections[0].value_length).toBe(value.length);
  });

  // ── 4d. replacement_chosen inference ─────────────────────────────────────

  it('replacement_chosen is masked when replacement is bracket placeholder', async () => {
    const fetchSpy = makeFetchSpy();
    const logger = makeLogger(fetchSpy);

    await logger.log({
      source: 'chatgpt',
      contentHash: 'sha256:1',
      detections: [
        {
          type: 'ssn', severity: 'critical', confidence: 0.95,
          value: '123-45-6789', replacement: '[SSN]',
        },
      ],
    });

    const payload = capturedPayload(fetchSpy);
    const detections = payload.bypassed_detections as Array<Record<string, unknown>>;
    expect(detections[0].replacement_chosen).toBe('masked');
  });

  it('replacement_chosen is dummy when replacement is a non-bracket string', async () => {
    const fetchSpy = makeFetchSpy();
    const logger = makeLogger(fetchSpy);

    await logger.log({
      source: 'chatgpt',
      contentHash: 'sha256:2',
      detections: [
        {
          type: 'ssn', severity: 'critical', confidence: 0.95,
          value: '123-45-6789', replacement: '555-12-3456',
        },
      ],
    });

    const payload = capturedPayload(fetchSpy);
    const detections = payload.bypassed_detections as Array<Record<string, unknown>>;
    expect(detections[0].replacement_chosen).toBe('dummy');
  });

  it('replacement_chosen is keep when no replacement provided', async () => {
    const fetchSpy = makeFetchSpy();
    const logger = makeLogger(fetchSpy);

    await logger.log({
      source: 'chatgpt',
      contentHash: 'sha256:3',
      detections: [
        { type: 'api_key', severity: 'high', confidence: 0.9, value: 'sk-abc123' },
      ],
    });

    const payload = capturedPayload(fetchSpy);
    const detections = payload.bypassed_detections as Array<Record<string, unknown>>;
    expect(detections[0].replacement_chosen).toBe('keep');
  });

  it('explicit replacementChosen overrides inference', async () => {
    const fetchSpy = makeFetchSpy();
    const logger = makeLogger(fetchSpy);

    await logger.log({
      source: 'chatgpt',
      contentHash: 'sha256:4',
      detections: [
        {
          type: 'ssn', severity: 'critical', confidence: 0.95,
          value: '123-45-6789',
          replacement: '[SSN]',         // would infer 'masked'
          replacementChosen: 'dummy',   // explicit override
        },
      ],
    });

    const payload = capturedPayload(fetchSpy);
    const detections = payload.bypassed_detections as Array<Record<string, unknown>>;
    expect(detections[0].replacement_chosen).toBe('dummy');
  });

  // ── 4e. Multiple detections ───────────────────────────────────────────────

  it('multiple detections are all present in bypassed_detections', async () => {
    const fetchSpy = makeFetchSpy();
    const logger = makeLogger(fetchSpy);

    const event: BypassEvent = {
      source: 'gemini',
      contentHash: 'sha256:multi',
      detections: [
        { type: 'ssn', severity: 'critical', confidence: 0.97, value: '123-45-6789', replacement: '[SSN]' },
        { type: 'credit_card', severity: 'critical', confidence: 0.99, value: '4111-1111-1111-1111', replacement: '[CREDIT_CARD]' },
        { type: 'email', severity: 'medium', confidence: 0.85, value: 'alice@example.com', replacement: '[EMAIL]' },
      ],
    };

    await logger.log(event);

    const payload = capturedPayload(fetchSpy);
    const detections = payload.bypassed_detections as Array<Record<string, unknown>>;
    expect(detections).toHaveLength(3);
    expect(detections.map((d) => d.type)).toEqual(['ssn', 'credit_card', 'email']);
  });

  it('detections_summary counts are correct for multiple detections', async () => {
    const fetchSpy = makeFetchSpy();
    const logger = makeLogger(fetchSpy);

    await logger.log({
      source: 'claude',
      contentHash: 'sha256:sum',
      detections: [
        { type: 'ssn', severity: 'critical', confidence: 0.97, value: '111-22-3333' },
        { type: 'ssn', severity: 'critical', confidence: 0.95, value: '444-55-6666' },
        { type: 'email', severity: 'medium', confidence: 0.85, value: 'bob@test.com' },
      ],
    });

    const payload = capturedPayload(fetchSpy);
    const summary = payload.detections_summary as Record<string, unknown>;
    expect(summary.total_count).toBe(3);
    expect((summary.by_type as Record<string, number>).ssn).toBe(2);
    expect((summary.by_type as Record<string, number>).email).toBe(1);
  });

  // ── 4f. Unknown types ────────────────────────────────────────────────────

  it('unknown detection type still gets fingerprint, length, and format', async () => {
    const value = 'UNKNOWN-VALUE-X99';
    const fetchSpy = makeFetchSpy();
    const logger = makeLogger(fetchSpy);

    await logger.log({
      source: 'copilot',
      contentHash: 'sha256:unk',
      detections: [
        { type: 'custom', severity: 'low', confidence: 0.7, value },
      ],
    });

    const payload = capturedPayload(fetchSpy);
    const detections = payload.bypassed_detections as Array<Record<string, unknown>>;
    expect(detections[0].value_fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(detections[0].value_length).toBe(value.length);
    expect(detections[0].value_format).toBe(inferValueFormat(value));
  });

  // ── 4g. No access token — does not throw, does not call fetch ─────────────

  it('does not call fetch when access token is unavailable', async () => {
    const fetchSpy = makeFetchSpy();
    vi.stubGlobal('fetch', fetchSpy);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const logger = new EncryptedBypassLogger(
      'https://api.obfusca.test',
      async () => null,
    );

    await logger.log({
      source: 'chatgpt',
      contentHash: 'sha256:tok',
      detections: [
        { type: 'ssn', severity: 'critical', confidence: 0.95, value: '123-45-6789' },
      ],
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // ── 4h. Correct API endpoint ──────────────────────────────────────────────

  it('posts to the correct /events/bypass endpoint', async () => {
    const fetchSpy = makeFetchSpy();
    const logger = makeLogger(fetchSpy);

    await logger.log({
      source: 'chatgpt',
      contentHash: 'sha256:ep',
      detections: [
        { type: 'ssn', severity: 'critical', confidence: 0.95, value: '123-45-6789' },
      ],
    });

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe('https://api.obfusca.test/events/bypass');
  });

  // ── 4i. value_format from real SSN in payload ────────────────────────────

  it('value_format in payload matches XXX-XX-XXXX for SSN', async () => {
    const fetchSpy = makeFetchSpy();
    const logger = makeLogger(fetchSpy);

    await logger.log({
      source: 'chatgpt',
      contentHash: 'sha256:fmt',
      detections: [
        { type: 'ssn', severity: 'critical', confidence: 0.97, value: '987-65-4321' },
      ],
    });

    const payload = capturedPayload(fetchSpy);
    const detections = payload.bypassed_detections as Array<Record<string, unknown>>;
    expect(detections[0].value_format).toBe('XXX-XX-XXXX');
  });
});
