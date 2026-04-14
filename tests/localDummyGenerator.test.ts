/**
 * Unit tests for LocalDummyGenerator (src/services/localDummyGenerator.ts).
 * Verifies deterministic output for Categories 1-3 and the format heuristic path.
 */

import { describe, it, expect } from 'vitest';
import { LocalDummyGenerator, localDummyGenerator } from '../src/services/localDummyGenerator';

describe('LocalDummyGenerator', () => {
  const gen = localDummyGenerator;

  // ── Singleton ──────────────────────────────────────────────────────────────
  it('exports a singleton instance', () => {
    expect(gen).toBeInstanceOf(LocalDummyGenerator);
  });

  // ── Category 1: SSN ────────────────────────────────────────────────────────
  it('generates hyphen SSN', () => {
    expect(gen.generate('ssn', '456-78-9012')).toBe('123-45-6789');
  });

  it('generates space-separated SSN', () => {
    expect(gen.generate('ssn', '456 78 9012')).toBe('123 45 6789');
  });

  it('generates dot-separated SSN', () => {
    expect(gen.generate('ssn', '456.78.9012')).toBe('123.45.6789');
  });

  it('generates plain-digits SSN', () => {
    expect(gen.generate('ssn', '456789012')).toBe('123456789');
  });

  // ── Category 1: Email ──────────────────────────────────────────────────────
  it('generates email dummy', () => {
    expect(gen.generate('email', 'alice@corp.com')).toBe('user@example.com');
  });

  it('preserves plus-addressing style', () => {
    expect(gen.generate('email', 'alice+work@corp.com')).toBe('user+test@example.com');
  });

  // ── Category 1: Phone ──────────────────────────────────────────────────────
  it('preserves phone format (US dashes)', () => {
    const result = gen.generate('phone', '212-555-9876');
    expect(result).toMatch(/^\d{3}-\d{3}-\d{4}$/);
    expect(result).toContain('555');
  });

  it('preserves phone format (parens)', () => {
    const result = gen.generate('phone', '(212) 555-9876');
    expect(result).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/);
  });

  // ── Category 1: Credit card ────────────────────────────────────────────────
  it('generates Visa dummy with dashes', () => {
    const result = gen.generate('credit_card', '4111-2222-3333-4444');
    expect(result).toBe('4111-1111-1111-1111');
  });

  it('generates Amex dummy', () => {
    const result = gen.generate('credit_card', '3782-822463-10005');
    expect(result).toContain('3400');
  });

  // ── Category 1: AWS/API keys ───────────────────────────────────────────────
  it('generates AWS key dummy', () => {
    expect(gen.generate('aws_key', 'AKIAIOSFODNN7REALKEY')).toBe('AKIAIOSFODNN7EXAMPLE');
  });

  it('generates sk_live prefix API key as sk_test', () => {
    const result = gen.generate('api_key', 'sk_live_abc123xyz');
    expect(result).toMatch(/^sk_test_x+$/);
  });

  it('generates ghp_ token dummy', () => {
    const result = gen.generate('api_key', 'ghp_realtoken123456789012345678901234');
    expect(result).toMatch(/^ghp_x{36}$/);
  });

  it('generates JWT dummy', () => {
    const result = gen.generate('jwt', 'eyJhbGciOiJIUzI1NiJ9.payload.sig');
    expect(result).toContain('eyJhbGci');
    expect(result.split('.').length).toBe(3);
  });

  it('preserves connection string scheme', () => {
    const result = gen.generate('connection_string', 'mysql://user:pass@db.host:3306/prod');
    expect(result).toMatch(/^mysql:\/\//);
    expect(result).toContain('localhost');
  });

  // ── Category 2: Structured ─────────────────────────────────────────────────
  it('generates address dummy', () => {
    expect(gen.generate('address', '742 Evergreen Terrace')).toBe(
      '123 Example Street, Anytown, ST 12345',
    );
  });

  it('preserves ISO date format', () => {
    expect(gen.generate('date_of_birth', '1985-06-15')).toBe('1990-01-01');
  });

  it('preserves MM/DD/YYYY date format', () => {
    expect(gen.generate('dob', '06/15/1985')).toBe('01/01/1990');
  });

  it('generates length-preserving bank account', () => {
    const result = gen.generate('bank_account', '12345678901234');
    expect(result).toMatch(/^0+$/);
    expect(result.length).toBe(14);
  });

  it('generates routing number dummy', () => {
    expect(gen.generate('routing_number', '123456789')).toBe('021000021');
  });

  it('generates letter-prefixed passport dummy', () => {
    const result = gen.generate('passport', 'G12345678');
    expect(result).toMatch(/^G0+$/);
    expect(result.length).toBe(9);
  });

  it('generates driver license preserving structure', () => {
    const result = gen.generate('driver_license', 'A123-456-789');
    expect(result).toBe('D000-000-000');
  });

  it('generates MRN preserving prefix', () => {
    expect(gen.generate('medical_record', 'MRN-987654')).toBe('MRN-000000');
  });

  it('generates mrn alias', () => {
    expect(gen.generate('mrn', 'MRN987654')).toMatch(/^MRN0+$/);
  });

  // ── Money ──────────────────────────────────────────────────────────────────
  it('generates $M suffix money dummy', () => {
    expect(gen.generate('money', '$2.4M')).toBe('$2.5M');
  });

  it('generates $K suffix money dummy', () => {
    expect(gen.generate('money', '$800K')).toBe('$500K');
  });

  it('generates comma money dummy', () => {
    expect(gen.generate('money', '$1,200,000')).toBe('$100,000');
  });

  it('maps salary type to money', () => {
    expect(gen.generate('salary', '$75,000')).toBe('$100,000');
  });

  // ── Category 3: Names ──────────────────────────────────────────────────────
  it('generates single-word name dummy', () => {
    expect(gen.generate('name', 'Smith')).toBe('Doe');
  });

  it('generates two-word name dummy', () => {
    expect(gen.generate('name', 'Alice Smith')).toBe('Jane Doe');
  });

  it('generates three-word name dummy', () => {
    const result = gen.generate('full_name', 'Alice Marie Smith');
    expect(result.split(' ').length).toBe(3);
    expect(result).toContain('Jane');
    expect(result.endsWith('Doe')).toBe(true);
  });

  it('preserves title in name', () => {
    expect(gen.generate('person_name', 'Dr. John Smith')).toBe('Dr. Jane Doe');
  });

  it('handles patient_name alias', () => {
    expect(gen.generate('patient_name', 'Jane')).toBe('Doe');
  });

  // ── Format heuristics (custom type) ───────────────────────────────────────
  it('detects SSN format for custom type', () => {
    expect(gen.generate('custom', '123-45-6789')).toBe('123-45-6789');
  });

  it('detects email format for custom type', () => {
    expect(gen.generate('custom', 'bob@example.org')).toBe('user@example.com');
  });

  it('detects money format for custom type', () => {
    expect(gen.generate('custom', '$1,000,000')).toBe('$100,000');
  });

  // ── Display-name hints (unknown type) ─────────────────────────────────────
  it('uses display name hint for settlement amount', () => {
    const result = gen.generate('semantic', '$2.4M', 'Settlement Amount');
    expect(result).toBe('$2.5M');
  });

  it('uses display name hint for person name', () => {
    const result = gen.generate('semantic', 'Bob Jones', 'Employee Name');
    expect(result).toBe('Jane Doe');
  });

  // ── Fallback ───────────────────────────────────────────────────────────────
  it('returns bracketed placeholder for truly unknown type', () => {
    const result = gen.generate('proprietary_data', 'some secret value');
    expect(result).toBe('[EXAMPLE_PROPRIETARY_DATA]');
  });

  it('never throws on empty input', () => {
    expect(() => gen.generate('ssn', '')).not.toThrow();
    expect(() => gen.generate('unknown', '')).not.toThrow();
  });
});
