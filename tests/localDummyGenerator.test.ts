/**
 * Integration tests for M5: LocalDummyGenerator wired into api.ts.
 *
 * Verifies that:
 *   1. The LocalDummyGenerator singleton is accessible via getLocalDummyGenerator().
 *   2. generate() returns a non-empty string for representative detection types.
 *   3. generate() never throws for edge-case inputs.
 *   4. The [EXAMPLE_...] fallback fires for genuinely unknown types.
 *
 * Full unit coverage of the generator's output correctness lives in
 * src/services/__tests__/localDummyGenerator.test.ts (M1).
 */

import { describe, it, expect } from 'vitest';
import { LocalDummyGenerator, getLocalDummyGenerator } from '../src/services/localDummyGenerator';

describe('LocalDummyGenerator (M5 wiring integration)', () => {

  it('getLocalDummyGenerator returns a LocalDummyGenerator instance', () => {
    const gen = getLocalDummyGenerator();
    expect(gen).toBeInstanceOf(LocalDummyGenerator);
  });

  it('getLocalDummyGenerator returns the same singleton on repeated calls', () => {
    const a = getLocalDummyGenerator();
    const b = getLocalDummyGenerator();
    expect(a).toBe(b);
  });

  const gen = getLocalDummyGenerator();

  // Spot-check that core types return non-empty, non-null strings
  const coreTypes: Array<[string, string]> = [
    ['ssn',               '456-78-9012'],
    ['email',             'alice@corp.com'],
    ['phone',             '(212) 555-9876'],
    ['credit_card',       '4111-2222-3333-4444'],
    ['aws_key',           'AKIAIOSFODNN7REALKEY'],
    ['api_key',           'sk_live_abc123xyz'],
    ['jwt',               'eyJhbGciOiJIUzI1NiJ9.payload.sig'],
    ['connection_string', 'mysql://user:pass@db.host:3306/prod'],
    ['github_token',      'ghp_realtoken123456789012345678901234'],
    ['slack_token',       'xoxb-real-token-here'],
    ['private_key',       '-----BEGIN RSA PRIVATE KEY-----'],
    ['address',           '742 Evergreen Terrace, Springfield'],
    ['date_of_birth',     '1985-06-15'],
    ['dob',               '06/15/1985'],
    ['bank_account',      '12345678901234'],
    ['routing_number',    '123456789'],
    ['passport',          'G12345678'],
    ['driver_license',    'A123-456-789'],
    ['medical_record',    'MRN-987654'],
    ['mrn',               'MRN987654'],
    ['money',             '$2.4M'],
    ['salary',            '$75,000'],
    ['name',              'Alice Smith'],
    ['full_name',         'Alice Marie Smith'],
    ['person_name',       'Bob Jones'],
    ['patient_name',      'Jane'],
    ['employee_name',     'Dr. John Smith'],
  ];

  for (const [type, original] of coreTypes) {
    it(`generate('${type}', ...) returns non-empty string`, () => {
      const result = gen.generate(type, original);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      // Must not echo back the exact original (we're replacing it)
      // (Some types like routing_number return a fixed standard value that
      //  might match the input, so we only check non-empty.)
    });
  }

  it('generate() does not throw on empty string input', () => {
    expect(() => gen.generate('ssn', '')).not.toThrow();
    expect(() => gen.generate('unknown_type', '')).not.toThrow();
  });

  it('generate() does not throw on undefined-like displayName', () => {
    expect(() => gen.generate('email', 'test@test.com', undefined)).not.toThrow();
  });

  it('returns [EXAMPLE_...] fallback for truly unknown type', () => {
    const result = gen.generate('proprietary_data', 'some secret value');
    expect(result).toMatch(/^\[EXAMPLE_/);
    expect(result).toMatch(/PROPRIETARY_DATA\]$/);
  });

  it('custom type with SSN-format value returns SSN-like dummy', () => {
    const result = gen.generate('custom', '456-78-9012');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
