/**
 * Tests for ZKBypassLogger (Option A: Zero-Knowledge RSA-OAEP encrypted bypass logging)
 * and KeyManager.
 *
 * Uses the real WebCrypto API available in Node 22 (globalThis.crypto.subtle).
 * Some tests additionally spy on specific crypto methods to verify algorithm
 * parameters and to simulate failure paths.
 *
 * Test inventory (14 cases):
 *  1.  ZKBypassLogger.encrypt() produces a non-empty base64 string
 *  2.  Encrypted output does not contain raw sensitive value in plaintext
 *  3.  Two encryptions of the same data produce different ciphertexts (random nonce)
 *  4.  crypto.subtle.importKey called with RSA-OAEP + SHA-256 params (spy)
 *  5.  crypto.subtle.encrypt called with RSA-OAEP for session key wrapping (spy)
 *  6.  log() sends encrypted_bypass_details as a non-empty base64 string
 *  7.  log() sends detections_summary (type counts only) in plaintext
 *  8.  log() sends empty bypassed_detections (raw values are in the encrypted blob)
 *  9.  log() does NOT include raw sensitive values anywhere in the request body
 * 10.  log() falls back to EncryptedBypassLogger when publicKeyJwk is null
 * 11.  log() falls back to EncryptedBypassLogger when crypto.subtle.importKey throws
 * 12.  Fallback logger receives the original event (including raw values)
 * 13.  KeyManager.getPublicKey() returns null when nothing is cached & settings has none
 * 14.  KeyManager.clearKey() removes the cached key from storage
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZKBypassLogger } from '../ZKBypassLogger';
import { KeyManager } from '../KeyManager';
import type { IBypassLogger, BypassEvent } from '../types';
import { clearStorageData, setStorageData, getStorageData } from '../../../tests/setup';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a real RSA-OAEP key pair (2048-bit in tests for speed). */
async function generateTestKeypair(): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicJwk: JsonWebKey;
}> {
  const keypair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048, // 2048 for test speed; wire format identical to 4096
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', keypair.publicKey);
  return { publicKey: keypair.publicKey, privateKey: keypair.privateKey, publicJwk };
}

/** Check whether bytes contain a UTF-8 string as a sub-sequence. */
function bytesContainString(bytes: Uint8Array, str: string): boolean {
  const needle = new TextEncoder().encode(str);
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

const MOCK_API = 'https://api.obfusca.test';
const MOCK_TOKEN = 'mock-access-token';
const getToken = async (): Promise<string | null> => MOCK_TOKEN;

/** Build a minimal BypassEvent (using M14 types: event.detections, event.contentHash). */
function makeSampleEvent(): BypassEvent {
  return {
    source: 'chatgpt',
    content_type: 'text',
    detections: [
      {
        type: 'ssn',
        label: 'US Social Security Number',
        value: '456-78-9012',
        severity: 'critical',
        confidence: 0.99,
        replacement: '[SSN]',
      },
    ],
    files_bypassed: [],
    contentHash: 'sha256:abcdef1234567890',
    timestamp: '2026-04-15T12:00:00.000Z',
  };
}

/** Mock fetch to capture the sent body. Returns array of parsed payloads. */
function mockFetchCapture(): {
  payloads: Record<string, unknown>[];
  bodies: string[];
} {
  const payloads: Record<string, unknown>[] = [];
  const bodies: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const body = (init?.body as string) ?? '';
    bodies.push(body);
    payloads.push(JSON.parse(body));
    return new Response(JSON.stringify({ event_id: 'test-evt-id' }), { status: 201 });
  });
  return { payloads, bodies };
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let testPublicJwk: JsonWebKey;

beforeAll(async () => {
  const kp = await generateTestKeypair();
  testPublicJwk = kp.publicJwk;
});

beforeEach(() => {
  clearStorageData();
  vi.restoreAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =============================================================================
// Suite 1 — ZKBypassLogger.encrypt()
// =============================================================================

describe('ZKBypassLogger.encrypt()', () => {

  // Test 1
  it('produces a non-empty base64 string', async () => {
    const logger = new ZKBypassLogger(testPublicJwk, MOCK_API, getToken);
    const result = await logger.encrypt({ foo: 'bar' });

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(() => atob(result)).not.toThrow();
  });

  // Test 2
  it('encrypted output does not contain raw sensitive value', async () => {
    const logger = new ZKBypassLogger(testPublicJwk, MOCK_API, getToken);
    const sensitiveValue = '456-78-9012';
    const result = await logger.encrypt({ value: sensitiveValue });

    expect(result).not.toContain(sensitiveValue);
    const bytes = Uint8Array.from(atob(result), (c) => c.charCodeAt(0));
    expect(bytesContainString(bytes, sensitiveValue)).toBe(false);
  });

  // Test 3
  it('produces different ciphertext on each call (non-deterministic nonce)', async () => {
    const logger = new ZKBypassLogger(testPublicJwk, MOCK_API, getToken);
    const payload = { ssn: '123-45-6789' };
    const [ct1, ct2] = await Promise.all([
      logger.encrypt(payload),
      logger.encrypt(payload),
    ]);
    expect(ct1).not.toBe(ct2);
  });

  // Test 4
  it('calls crypto.subtle.importKey with RSA-OAEP SHA-256 algorithm', async () => {
    const importKeySpy = vi.spyOn(crypto.subtle, 'importKey');

    const logger = new ZKBypassLogger(testPublicJwk, MOCK_API, getToken);
    await logger.encrypt({});

    expect(importKeySpy).toHaveBeenCalledWith(
      'jwk',
      testPublicJwk,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt'],
    );
  });

  // Test 5
  it('calls crypto.subtle.encrypt with RSA-OAEP for session key wrapping', async () => {
    const encryptSpy = vi.spyOn(crypto.subtle, 'encrypt');

    const logger = new ZKBypassLogger(testPublicJwk, MOCK_API, getToken);
    await logger.encrypt({ test: true });

    const rsaOaepCalls = encryptSpy.mock.calls.filter((args) => {
      const algo = args[0] as { name?: string };
      return algo?.name === 'RSA-OAEP';
    });
    expect(rsaOaepCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// Suite 2 — ZKBypassLogger.log() payload shape
// =============================================================================

describe('ZKBypassLogger.log()', () => {

  // Test 6
  it('sends encrypted_bypass_details as a non-empty base64 string', async () => {
    const { payloads } = mockFetchCapture();

    const logger = new ZKBypassLogger(testPublicJwk, MOCK_API, getToken);
    await logger.log(makeSampleEvent());

    expect(payloads).toHaveLength(1);
    const payload = payloads[0];
    expect(typeof payload.encrypted_bypass_details).toBe('string');
    expect((payload.encrypted_bypass_details as string).length).toBeGreaterThan(0);
    expect(() => atob(payload.encrypted_bypass_details as string)).not.toThrow();
  });

  // Test 7
  it('sends detections_summary (type counts only) in plaintext alongside encrypted blob', async () => {
    const { payloads } = mockFetchCapture();

    const logger = new ZKBypassLogger(testPublicJwk, MOCK_API, getToken);
    await logger.log(makeSampleEvent());

    expect(payloads).toHaveLength(1);
    const summary = payloads[0].detections_summary as Record<string, unknown>;
    expect(summary).toBeDefined();
    expect(summary.total_count).toBe(1);
    expect((summary.by_type as Record<string, number>).ssn).toBe(1);
    expect((summary.by_severity as Record<string, number>).critical).toBe(1);
  });

  // Test 8
  it('sends empty bypassed_detections array (raw values are in the encrypted blob)', async () => {
    const { payloads } = mockFetchCapture();

    const logger = new ZKBypassLogger(testPublicJwk, MOCK_API, getToken);
    await logger.log(makeSampleEvent());

    expect(payloads).toHaveLength(1);
    const bpd = payloads[0].bypassed_detections as unknown[];
    expect(Array.isArray(bpd)).toBe(true);
    expect(bpd.length).toBe(0);
  });

  // Test 9
  it('does NOT include raw sensitive values anywhere in the plaintext request body', async () => {
    const { bodies } = mockFetchCapture();

    const logger = new ZKBypassLogger(testPublicJwk, MOCK_API, getToken);
    const event = makeSampleEvent();
    const rawValue = event.detections[0].value; // '456-78-9012'
    await logger.log(event);

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toContain(rawValue);
  });

  // Test 10
  it('falls back to EncryptedBypassLogger when publicKeyJwk is null', async () => {
    const fallback: IBypassLogger = { log: vi.fn().mockResolvedValue(undefined) };
    const logger = new ZKBypassLogger(null, MOCK_API, getToken, fallback);

    await logger.log(makeSampleEvent());

    expect(fallback.log).toHaveBeenCalledOnce();
  });

  // Test 11
  it('falls back to EncryptedBypassLogger when crypto.subtle.importKey throws', async () => {
    vi.spyOn(crypto.subtle, 'importKey').mockRejectedValueOnce(
      new DOMException('Unsupported format', 'DataError'),
    );

    const fallback: IBypassLogger = { log: vi.fn().mockResolvedValue(undefined) };
    const logger = new ZKBypassLogger(testPublicJwk, MOCK_API, getToken, fallback);

    await logger.log(makeSampleEvent());

    expect(fallback.log).toHaveBeenCalledOnce();
  });

  // Test 12
  it('passes the original event (with raw values) to the fallback logger', async () => {
    const fallback: IBypassLogger = { log: vi.fn().mockResolvedValue(undefined) };
    const logger = new ZKBypassLogger(null, MOCK_API, getToken, fallback);

    const event = makeSampleEvent();
    await logger.log(event);

    expect(vi.mocked(fallback.log)).toHaveBeenCalledWith(event);
    const receivedEvent = vi.mocked(fallback.log).mock.calls[0][0] as BypassEvent;
    expect(receivedEvent.detections[0].value).toBe('456-78-9012');
  });
});

// =============================================================================
// Suite 3 — KeyManager
// =============================================================================

describe('KeyManager', () => {
  beforeEach(() => {
    clearStorageData();
  });

  // Test 13
  it('getPublicKey() returns null when nothing is cached and settings has no key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ settings: { bypass_public_key: null } }),
        { status: 200 },
      ),
    );

    const km = new KeyManager(MOCK_API, getToken);
    const result = await km.getPublicKey();

    expect(result).toBeNull();
  });

  // Test 14
  it('clearKey() removes the cached entry from chrome.storage.local', async () => {
    const fakeJwk: JsonWebKey = {
      kty: 'RSA',
      alg: 'RSA-OAEP-256',
      use: 'enc',
      n: 'abc',
      e: 'AQAB',
    };
    setStorageData('bypass_public_key_cache', { jwk: fakeJwk, cachedAt: Date.now() });

    const km = new KeyManager(MOCK_API, getToken);
    await km.clearKey();

    const storage = getStorageData();
    expect(storage['bypass_public_key_cache']).toBeUndefined();
  });
});
