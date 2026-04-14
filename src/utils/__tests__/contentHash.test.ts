/**
 * Tests for src/utils/contentHash.ts
 *
 * All assertions use the Web Crypto API (available in Node 18+ via globalThis.crypto).
 */

import { computeContentHMAC } from '../contentHash';

describe('computeContentHMAC', () => {
  it('output starts with "hmac-sha256:" prefix', async () => {
    const result = await computeContentHMAC('hello world', 'tenant-abc', 'user-123');
    expect(result.startsWith('hmac-sha256:')).toBe(true);
  });

  it('output is "hmac-sha256:" followed by exactly 64 hex characters', async () => {
    const result = await computeContentHMAC('hello world', 'tenant-abc', 'user-123');
    const hex = result.slice('hmac-sha256:'.length);
    expect(hex).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hex)).toBe(true);
  });

  it('is deterministic: same input produces same hash', async () => {
    const text = 'my SSN is 123-45-6789';
    const tenantId = 'tenant-xyz';
    const userId = 'user-456';
    const first = await computeContentHMAC(text, tenantId, userId);
    const second = await computeContentHMAC(text, tenantId, userId);
    expect(first).toBe(second);
  });

  it('different tenantId produces different hash for identical text', async () => {
    const text = 'sensitive content';
    const userId = 'user-same';
    const hashA = await computeContentHMAC(text, 'tenant-A', userId);
    const hashB = await computeContentHMAC(text, 'tenant-B', userId);
    expect(hashA).not.toBe(hashB);
  });

  it('different userId produces different hash for identical text', async () => {
    const text = 'sensitive content';
    const tenantId = 'tenant-same';
    const hashA = await computeContentHMAC(text, tenantId, 'user-A');
    const hashB = await computeContentHMAC(text, tenantId, 'user-B');
    expect(hashA).not.toBe(hashB);
  });

  it('different text produces different hash for same tenant+user', async () => {
    const tenantId = 'tenant-abc';
    const userId = 'user-123';
    const hashA = await computeContentHMAC('text one', tenantId, userId);
    const hashB = await computeContentHMAC('text two', tenantId, userId);
    expect(hashA).not.toBe(hashB);
  });

  it('empty string input produces a valid hash', async () => {
    const result = await computeContentHMAC('', 'tenant-abc', 'user-123');
    expect(result.startsWith('hmac-sha256:')).toBe(true);
    const hex = result.slice('hmac-sha256:'.length);
    expect(hex).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hex)).toBe(true);
  });

  it('empty string with different tenant produces different hash', async () => {
    const hashA = await computeContentHMAC('', 'tenant-A', 'user-1');
    const hashB = await computeContentHMAC('', 'tenant-B', 'user-1');
    expect(hashA).not.toBe(hashB);
  });
});
