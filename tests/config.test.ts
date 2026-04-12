/**
 * Tests for src/config.ts
 *
 * Verifies that configuration constants are defined and have expected values.
 */

import { API_URL } from '../src/config';

describe('config', () => {
  it('API_URL is defined and is a string', () => {
    expect(typeof API_URL).toBe('string');
    expect(API_URL.length).toBeGreaterThan(0);
  });

  it('API_URL is a valid HTTPS URL', () => {
    expect(API_URL).toMatch(/^https:\/\//);
  });

  it('API_URL points to the Obfusca API domain', () => {
    expect(API_URL).toContain('obfusca');
  });

  it('API_URL does not have a trailing slash', () => {
    expect(API_URL.endsWith('/')).toBe(false);
  });
});
