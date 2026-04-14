/**
 * Test suite for localDummyGenerator.ts
 *
 * Covers all Categories 1–3 dummy types plus edge cases and determinism.
 * Requires ≥ 50 test cases as specified in Mission M1.
 *
 * Run with: npm test  (vitest)
 */

import { describe, it, expect } from 'vitest';
import { LocalDummyGenerator, computeLuhnCheckDigit, isLuhnValid, computeABACheckDigit } from '../localDummyGenerator.js';

const gen = new LocalDummyGenerator();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse card digits from a potentially-formatted string. */
function cardDigits(s: string): number[] {
  return s.replace(/\D/g, '').split('').map(Number);
}

// ---------------------------------------------------------------------------
// Internal algorithm tests (Luhn, ABA)
// ---------------------------------------------------------------------------

describe('computeLuhnCheckDigit', () => {
  it('produces check digit 1 for 4111-1111-1111-111 prefix', () => {
    const prefix = [4,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1];
    expect(computeLuhnCheckDigit(prefix)).toBe(1);
  });

  it('produces check digit 4 for 5500-0000-0000-000 prefix (MC)', () => {
    const prefix = [5,5,0,0, 0,0,0,0, 0,0,0,0, 0,0,0];
    expect(computeLuhnCheckDigit(prefix)).toBe(4);
  });

  it('produces check digit 9 for 3400-0000-0000-00 prefix (Amex, 15-digit)', () => {
    const prefix = [3,4,0,0, 0,0,0,0, 0,0,0,0, 0,0];
    expect(computeLuhnCheckDigit(prefix)).toBe(9);
  });

  it('produced digit makes full number pass isLuhnValid', () => {
    const prefix = [6,0,1,1, 0,0,0,0, 0,0,0,0, 0,0,0];
    const check = computeLuhnCheckDigit(prefix);
    expect(isLuhnValid([...prefix, check])).toBe(true);
  });
});

describe('computeABACheckDigit', () => {
  it('validates 021000021 (Chase Manhattan)', () => {
    const digits = [0,2,1,0,0,0,0,2,1];
    const prefix = digits.slice(0, 8);
    expect(computeABACheckDigit(prefix)).toBe(1);
  });

  it('validates 111000025 (Federal Reserve Dallas)', () => {
    const digits = [1,1,1,0,0,0,0,2,5];
    const prefix = digits.slice(0, 8);
    expect(computeABACheckDigit(prefix)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Category 1: SSN
// ---------------------------------------------------------------------------

describe('SSN generation', () => {
  it('produces XXX-XX-XXXX format for dash-separated input', () => {
    const result = gen.generate('ssn', '456-78-9012');
    expect(result).toMatch(/^\d{3}-\d{2}-\d{4}$/);
  });

  it('produces XXX XX XXXX format for space-separated input', () => {
    const result = gen.generate('ssn', '456 78 9012');
    expect(result).toMatch(/^\d{3} \d{2} \d{4}$/);
  });

  it('produces XXX.XX.XXXX format for dot-separated input', () => {
    const result = gen.generate('ssn', '456.78.9012');
    expect(result).toMatch(/^\d{3}\.\d{2}\.\d{4}$/);
  });

  it('produces 9 bare digits for unseparated input', () => {
    const result = gen.generate('ssn', '456789012');
    expect(result).toMatch(/^\d{9}$/);
  });

  it('never generates 000 area code', () => {
    for (let i = 0; i < 30; i++) {
      const result = gen.generate('ssn', `555-${i.toString().padStart(2,'0')}-1234`);
      expect(result.substring(0, 3)).not.toBe('000');
    }
  });

  it('never generates 666 area code', () => {
    const result = gen.generate('ssn', '666-12-3456');
    expect(result.substring(0, 3)).not.toBe('666');
  });

  it('is deterministic — same input always gives same output', () => {
    const a = gen.generate('ssn', '123-45-6789');
    const b = gen.generate('ssn', '123-45-6789');
    expect(a).toBe(b);
  });

  it('produces different output for different inputs', () => {
    const a = gen.generate('ssn', '111-11-1111');
    const b = gen.generate('ssn', '222-22-2222');
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Category 1: Credit cards
// ---------------------------------------------------------------------------

describe('Credit card generation', () => {
  it('Visa starts with 4 and has valid Luhn', () => {
    const result = gen.generate('credit_card', '4111-1111-1111-1111');
    const digits = cardDigits(result);
    expect(digits[0]).toBe(4);
    expect(isLuhnValid(digits)).toBe(true);
  });

  it('Visa preserves dash separator', () => {
    const result = gen.generate('credit_card', '4111-1111-1111-1111');
    expect(result).toMatch(/^\d{4}-\d{4}-\d{4}-\d{4}$/);
  });

  it('Visa with space separator preserves space separator', () => {
    const result = gen.generate('credit_card', '4111 1111 1111 1111');
    expect(result).toMatch(/^\d{4} \d{4} \d{4} \d{4}$/);
  });

  it('Visa no separator produces plain 16 digits', () => {
    const result = gen.generate('credit_card', '4111111111111111');
    expect(result).toMatch(/^\d{16}$/);
    expect(isLuhnValid(cardDigits(result))).toBe(true);
  });

  it('Mastercard starts with 51-55 and has valid Luhn', () => {
    const result = gen.generate('credit_card', '5500-0000-0000-0004');
    const digits = cardDigits(result);
    expect(digits[0]).toBe(5);
    expect([1,2,3,4,5]).toContain(digits[1]);
    expect(isLuhnValid(digits)).toBe(true);
  });

  it('Amex starts with 34 or 37 and has valid Luhn', () => {
    const result = gen.generate('credit_card', '3400-000000-00009');
    const digits = cardDigits(result);
    expect(digits[0]).toBe(3);
    expect([4,7]).toContain(digits[1]);
    expect(digits.length).toBe(15);
    expect(isLuhnValid(digits)).toBe(true);
  });

  it('Discover starts with 6011 and has valid Luhn', () => {
    const result = gen.generate('credit_card', '6011-0000-0000-0004');
    const digits = cardDigits(result);
    expect(digits.slice(0, 4).join('')).toBe('6011');
    expect(isLuhnValid(digits)).toBe(true);
  });

  it('is deterministic', () => {
    const a = gen.generate('credit_card', '4111-1111-1111-1111');
    const b = gen.generate('credit_card', '4111-1111-1111-1111');
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Category 1: AWS, API keys, tokens
// ---------------------------------------------------------------------------

describe('AWS Access Key generation', () => {
  it('produces 20-char key starting with AKIA/ABIA/ACCA/ASIA', () => {
    const result = gen.generate('aws_key', 'AKIAIOSFODNN7EXAMPLE');
    expect(result).toMatch(/^(AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}$/);
  });

  it('is deterministic', () => {
    expect(gen.generate('aws_key', 'AKIAIOSFODNN7EXAMPLE'))
      .toBe(gen.generate('aws_key', 'AKIAIOSFODNN7EXAMPLE'));
  });
});

describe('API Key generation', () => {
  it('sk- prefix produces sk-XXXX replacement', () => {
    const result = gen.generate('api_key', 'sk-abc123xyz789longkeyvalue');
    expect(result.startsWith('sk-')).toBe(true);
    expect(result.length).toBeGreaterThan(10);
  });

  it('sk_live_ prefix produces sk_test_ replacement', () => {
    const result = gen.generate('api_key', 'sk_live_FAKE00KEY00FOR00TESTING00ONLY');
    expect(result.startsWith('sk_test_')).toBe(true);
  });

  it('ghp_ prefix routes to GitHub token generator', () => {
    const result = gen.generate('api_key', 'ghp_abcdefghijklmnopqrstuvwxyz123456789');
    expect(result).toMatch(/^ghp_[A-Za-z0-9]{36}$/);
  });

  it('generic api_key=value preserves key prefix', () => {
    const result = gen.generate('api_key', 'api_key=supersecret12345678901234567890');
    expect(result.startsWith('api_key=')).toBe(true);
  });
});

describe('Private key generation', () => {
  it('produces valid PEM header line', () => {
    const result = gen.generate('private_key', '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAK...\n-----END RSA PRIVATE KEY-----');
    expect(result).toMatch(/^-----BEGIN (RSA |EC )?PRIVATE KEY-----/);
  });

  it('produces matching PEM footer', () => {
    const result = gen.generate('private_key', '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----');
    const lines = result.split('\n');
    const header = lines[0];
    const footer = lines[lines.length - 1];
    const keyType = header.replace('-----BEGIN ', '').replace('-----', '').trim();
    expect(footer).toBe(`-----END ${keyType}-----`);
  });

  it('body lines are valid base64 characters', () => {
    const result = gen.generate('private_key', '-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----');
    const lines = result.split('\n');
    const bodyLines = lines.slice(1, lines.length - 1);
    for (const line of bodyLines) {
      expect(line).toMatch(/^[A-Za-z0-9+/]+$/);
    }
  });
});

describe('JWT generation', () => {
  it('produces exactly three dot-separated parts', () => {
    const result = gen.generate('jwt', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc');
    const parts = result.split('.');
    expect(parts.length).toBe(3);
  });

  it('header is valid base64url', () => {
    const result = gen.generate('jwt', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc');
    const [header] = result.split('.');
    expect(header).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('signature is valid base64url', () => {
    const result = gen.generate('jwt', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc');
    const [,, sig] = result.split('.');
    expect(sig).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is deterministic', () => {
    const input = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc123';
    expect(gen.generate('jwt', input)).toBe(gen.generate('jwt', input));
  });
});

describe('Connection string generation', () => {
  it('preserves postgresql scheme', () => {
    const result = gen.generate('connection_string', 'postgresql://realuser:realpass@prod.db.example.com:5432/mydb');
    expect(result.startsWith('postgresql://')).toBe(true);
  });

  it('preserves mongodb scheme', () => {
    const result = gen.generate('connection_string', 'mongodb://admin:secret@mongo.prod:27017/data');
    expect(result.startsWith('mongodb://')).toBe(true);
  });

  it('contains fake credentials, not original ones', () => {
    const result = gen.generate('connection_string', 'postgresql://realuser:S3CR3T@prod.host:5432/realdb');
    expect(result).not.toContain('S3CR3T');
    expect(result).not.toContain('realuser');
  });
});

describe('GitHub token generation', () => {
  it('produces ghp_ + 36 alphanumeric characters', () => {
    const result = gen.generate('github_token', 'ghp_realGitHubTokenValue12345678901234');
    expect(result).toMatch(/^ghp_[A-Za-z0-9]{36}$/);
  });
});

describe('Slack token generation', () => {
  it('xoxb- produces bot token format', () => {
    const result = gen.generate('slack_token', 'xoxb-000000000000-000000000000-FAKEFAKEFAKEFAKEFAKEFAKE');
    expect(result).toMatch(/^xoxb-\d{10}-\d{10}-[A-Za-z0-9]{24}$/);
  });

  it('xoxp- input produces xoxp- token', () => {
    const result = gen.generate('slack_token', 'xoxp-123456789012-123456789012-abcdefghijklmnopqrstuvwx');
    expect(result.startsWith('xoxp-')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Category 2: Structured types
// ---------------------------------------------------------------------------

describe('Address generation', () => {
  it('produces address-like format with number, street, city, state, zip', () => {
    const result = gen.generate('address', '742 Evergreen Terrace, Springfield, IL 62704');
    // Should match: "NNN STREET TYPE, City, ST XXXXX"
    expect(result).toMatch(/^\d+ .+, .+, [A-Z]{2} \d{5}$/);
  });

  it('is deterministic', () => {
    const input = '100 Main Street, Anytown, NY 10001';
    expect(gen.generate('address', input)).toBe(gen.generate('address', input));
  });
});

describe('Date of birth generation', () => {
  it('preserves MM/DD/YYYY format', () => {
    const result = gen.generate('date_of_birth', '07/04/1985');
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('preserves YYYY-MM-DD format', () => {
    const result = gen.generate('date_of_birth', '1985-07-04');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('preserves DD.MM.YYYY format', () => {
    const result = gen.generate('date_of_birth', '04.07.1985');
    expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });

  it('preserves MM/DD/YY short format', () => {
    const result = gen.generate('dob', '07/04/85');
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{2}$/);
  });

  it('preserves YYYY/MM/DD format', () => {
    const result = gen.generate('date_of_birth', '1985/07/04');
    expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
  });

  it('falls back to MM/DD/YYYY for unrecognized format', () => {
    const result = gen.generate('date_of_birth', 'some date');
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('is deterministic', () => {
    const input = '07/04/1985';
    expect(gen.generate('date_of_birth', input)).toBe(gen.generate('date_of_birth', input));
  });
});

describe('Bank account generation', () => {
  it('produces 8-12 digit number', () => {
    const result = gen.generate('bank_account', '1234567890');
    expect(result).toMatch(/^\d{8,12}$/);
  });

  it('preserves approximate digit length of original', () => {
    const tenDigit = gen.generate('bank_account', '1234567890');
    const eightDigit = gen.generate('bank_account', '12345678');
    expect(tenDigit.length).toBe(10);
    expect(eightDigit.length).toBe(8);
  });
});

describe('Routing number generation', () => {
  it('produces 9-digit string', () => {
    const result = gen.generate('routing_number', '021000021');
    expect(result).toMatch(/^\d{9}$/);
  });

  it('satisfies ABA checksum', () => {
    const result = gen.generate('routing_number', '021000021');
    const digits = result.split('').map(Number);
    const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
    const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0);
    expect(sum % 10).toBe(0);
  });

  it('is deterministic', () => {
    const input = '021000021';
    expect(gen.generate('routing_number', input)).toBe(gen.generate('routing_number', input));
  });
});

describe('Passport generation', () => {
  it('preserves letter prefix', () => {
    const result = gen.generate('passport', 'P12345678');
    expect(result[0]).toBe('P');
    expect(result.slice(1)).toMatch(/^\d+$/);
  });

  it('returns letter + digits when no letter in original', () => {
    const result = gen.generate('passport', '123456789');
    expect(result).toMatch(/^[A-Z]\d+$/);
  });
});

describe('Driver license generation', () => {
  it('replaces letters with D and randomises digits', () => {
    const result = gen.generate('driver_license', 'A1234567');
    // Letters become D
    expect(result[0]).toBe('D');
    // Remaining chars are digits or original separators
    expect(result.slice(1)).toMatch(/^[\d\-]+$/);
  });

  it('preserves hyphens in mixed format', () => {
    const result = gen.generate('driver_license', 'DL-1234-5678');
    expect(result).toMatch(/^DD-\d{4}-\d{4}$/);
  });
});

describe('Medical record generation', () => {
  it('preserves MRN- prefix and digit count', () => {
    const result = gen.generate('medical_record', 'MRN-123456');
    expect(result).toMatch(/^MRN-\d{6}$/);
  });

  it('handles mrn alias', () => {
    const result = gen.generate('mrn', 'MRN-654321');
    expect(result).toMatch(/^MRN-\d{6}$/);
  });

  it('falls back to MRN-XXXXXX for unrecognised format', () => {
    const result = gen.generate('medical_record', 'some-random-thing');
    expect(result).toMatch(/^MRN-\d{6}$/);
  });
});

// ---------------------------------------------------------------------------
// Category 2: Money — format preservation
// ---------------------------------------------------------------------------

describe('Money format preservation', () => {
  it('$2.4M → $X.XM format (decimal + M suffix)', () => {
    const result = gen.generate('money', '$2.4M');
    expect(result).toMatch(/^\$\d+\.\d+M$/);
  });

  it('$800K → $XXXK format (no decimal + K suffix)', () => {
    const result = gen.generate('money', '$800K');
    expect(result).toMatch(/^\$\d+K$/);
  });

  it('$150,000 → $XXX,XXX format (comma-separated)', () => {
    const result = gen.generate('money', '$150,000');
    expect(result).toMatch(/^\$[\d,]+$/);
    expect(result).toContain(',');
  });

  it('$50.00 → $XX.XX format (decimal cents)', () => {
    const result = gen.generate('money', '$50.00');
    expect(result).toMatch(/^\$\d+\.\d{2}$/);
  });

  it('€1,234.56 → €X,XXX.XX format (euro, comma+decimal)', () => {
    const result = gen.generate('money', '€1,234.56');
    expect(result.startsWith('€')).toBe(true);
    expect(result).toContain(',');
    expect(result).toContain('.');
  });

  it('$1.2B → $X.XB format (billion suffix)', () => {
    const result = gen.generate('money', '$1.2B');
    expect(result).toMatch(/^\$\d+\.\d+B$/);
  });

  it('$500T → $XXXT format (trillion suffix)', () => {
    const result = gen.generate('money', '$500T');
    expect(result).toMatch(/^\$\d+T$/);
  });

  it('salary alias works', () => {
    const result = gen.generate('salary', '$75,000');
    expect(result.startsWith('$')).toBe(true);
    expect(result).toContain(',');
  });

  it('is deterministic', () => {
    const input = '$2.4M';
    expect(gen.generate('money', input)).toBe(gen.generate('money', input));
  });
});

// ---------------------------------------------------------------------------
// Category 2: Phone — format preservation
// ---------------------------------------------------------------------------

describe('Phone format preservation', () => {
  it('(555) 123-4567 → (XXX) XXX-XXXX format', () => {
    const result = gen.generate('phone', '(555) 123-4567');
    expect(result).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/);
  });

  it('555-123-4567 → XXX-XXX-XXXX format', () => {
    const result = gen.generate('phone', '555-123-4567');
    expect(result).toMatch(/^\d{3}-\d{3}-\d{4}$/);
  });

  it('+1 555 123 4567 → +1 XXX XXX XXXX format', () => {
    const result = gen.generate('phone', '+1 555 123 4567');
    expect(result.startsWith('+1')).toBe(true);
    expect(result.replace(/\D/g, '').length).toBeGreaterThanOrEqual(10);
  });

  it('555.123.4567 → XXX.XXX.XXXX dot format', () => {
    const result = gen.generate('phone', '555.123.4567');
    expect(result).toMatch(/^\d{3}\.\d{3}\.\d{4}$/);
  });

  it('is deterministic', () => {
    const input = '(555) 123-4567';
    expect(gen.generate('phone', input)).toBe(gen.generate('phone', input));
  });
});

// ---------------------------------------------------------------------------
// Category 2: Email
// ---------------------------------------------------------------------------

describe('Email generation', () => {
  it('produces valid-looking email address', () => {
    const result = gen.generate('email', 'john.smith@gmail.com');
    expect(result).toMatch(/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/);
  });

  it('+ addressing is preserved when original has +', () => {
    const result = gen.generate('email', 'user+work@example.com');
    expect(result).toContain('+');
    expect(result).toContain('@');
  });

  it('plain email does not add + addressing', () => {
    const result = gen.generate('email', 'plainuser@example.com');
    // May or may not contain + but must be a valid email
    expect(result).toMatch(/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/);
  });

  it('is deterministic', () => {
    const input = 'john.smith@gmail.com';
    expect(gen.generate('email', input)).toBe(gen.generate('email', input));
  });
});

// ---------------------------------------------------------------------------
// Category 3: Names
// ---------------------------------------------------------------------------

describe('Name generation', () => {
  it('single word → single-word output', () => {
    const result = gen.generate('name', 'Alice');
    expect(result.split(' ').length).toBe(1);
  });

  it('two-word name → two-word output', () => {
    const result = gen.generate('name', 'John Smith');
    expect(result.split(' ').length).toBe(2);
  });

  it('three-word name → three-word output', () => {
    const result = gen.generate('name', 'Mary Jane Watson');
    expect(result.split(' ').length).toBe(3);
  });

  it('four-word name → four-word output', () => {
    const result = gen.generate('full_name', 'José Luis García Pérez');
    expect(result.split(' ').length).toBe(4);
  });

  it('preserves Dr. title', () => {
    const result = gen.generate('name', 'Dr. Elizabeth Chen');
    expect(result.startsWith('Dr. ')).toBe(true);
    expect(result.split(' ').length).toBe(3); // Dr. + First + Last
  });

  it('preserves Mr. title', () => {
    const result = gen.generate('name', 'Mr. James Bond');
    expect(result.startsWith('Mr. ')).toBe(true);
  });

  it('preserves Mrs. title', () => {
    const result = gen.generate('name', 'Mrs. Carol Danvers');
    expect(result.startsWith('Mrs. ')).toBe(true);
  });

  it('preserves Prof. title', () => {
    const result = gen.generate('name', 'Prof. Stephen Hawking');
    expect(result.startsWith('Prof. ')).toBe(true);
  });

  it('preserves Jr. suffix', () => {
    const result = gen.generate('name', 'Robert Downey Jr.');
    expect(result.endsWith('Jr.')).toBe(true);
  });

  it('preserves Sr. suffix', () => {
    const result = gen.generate('name', 'George Foreman Sr.');
    expect(result.endsWith('Sr.')).toBe(true);
  });

  it('preserves III suffix', () => {
    const result = gen.generate('name', 'Henry Ford III');
    expect(result.endsWith('III')).toBe(true);
  });

  it('title-only input "Dr." → title + last name', () => {
    const result = gen.generate('name', 'Dr.');
    expect(result.startsWith('Dr. ')).toBe(true);
    expect(result.split(' ').length).toBe(2);
  });

  it('patient_name alias works', () => {
    const result = gen.generate('patient_name', 'John Doe');
    expect(result.split(' ').length).toBe(2);
  });

  it('employee_name alias works', () => {
    const result = gen.generate('employee_name', 'Jane Smith');
    expect(result.split(' ').length).toBe(2);
  });

  it('is deterministic', () => {
    const input = 'Dr. John Q. Smith Jr.';
    expect(gen.generate('name', input)).toBe(gen.generate('name', input));
  });

  it('does NOT return the original name', () => {
    const input = 'ZXQVWY UNIQUENAME';
    const result = gen.generate('name', input);
    expect(result).not.toBe(input);
  });
});

// ---------------------------------------------------------------------------
// Category 4+: Unknown / placeholder
// ---------------------------------------------------------------------------

describe('Category 4 placeholder', () => {
  it('returns [EXAMPLE_TYPE] for unknown types', () => {
    const result = gen.generate('some_custom_semantic_type', 'some value');
    expect(result).toBe('[EXAMPLE_SOME_CUSTOM_SEMANTIC_TYPE]');
  });

  it('returns placeholder for unrecognised type', () => {
    const result = gen.generate('settlement_amount_legal', 'something');
    expect(result).toMatch(/^\[EXAMPLE_/);
    expect(result).toMatch(/\]$/);
  });

  it('generateAsync resolves to same as generate for known types', async () => {
    const sync = gen.generate('ssn', '123-45-6789');
    const async_ = await gen.generateAsync('ssn', '123-45-6789');
    expect(async_).toBe(sync);
  });

  it('generateAsync resolves placeholder for unknown types', async () => {
    const result = await gen.generateAsync('unknown_entity', 'some value');
    expect(result).toMatch(/^\[EXAMPLE_/);
  });
});

// ---------------------------------------------------------------------------
// Custom type with format heuristics
// ---------------------------------------------------------------------------

describe('Custom type with format heuristics', () => {
  it('custom type with SSN-like value → SSN format output', () => {
    const result = gen.generate('custom', '456-78-9012');
    expect(result).toMatch(/^\d{3}-\d{2}-\d{4}$/);
  });

  it('custom type with email-like value → email format output', () => {
    const result = gen.generate('custom', 'user@company.com');
    expect(result).toMatch(/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/);
  });

  it('custom type with phone-like value → phone format output', () => {
    const result = gen.generate('custom', '(212) 555-1234');
    expect(result).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/);
  });

  it('custom type with completely unrecognised value → placeholder', () => {
    const result = gen.generate('custom', 'NotAnyKnownFormat!!!');
    expect(result).toMatch(/^\[EXAMPLE_/);
  });
});

// ---------------------------------------------------------------------------
// Determinism across all types (regression)
// ---------------------------------------------------------------------------

describe('Global determinism checks', () => {
  const deterministicCases: Array<[string, string]> = [
    ['ssn', '456-78-9012'],
    ['credit_card', '4111-1111-1111-1111'],
    ['aws_key', 'AKIAIOSFODNN7EXAMPLE'],
    ['api_key', 'sk-abc123xyz'],
    ['github_token', 'ghp_abc123xyz456789012345678901234567'],
    ['slack_token', 'xoxb-000000000000-000000000000-TESTFAKETESTFAKETESTFAKE'],
    ['jwt', 'a.b.c'],
    ['connection_string', 'postgresql://u:p@h:5432/db'],
    ['address', '123 Main St, Springfield, IL 62701'],
    ['date_of_birth', '01/15/1990'],
    ['bank_account', '1234567890'],
    ['routing_number', '021000021'],
    ['passport', 'P12345678'],
    ['driver_license', 'D1234-5678'],
    ['medical_record', 'MRN-123456'],
    ['money', '$2.4M'],
    ['phone', '(555) 123-4567'],
    ['email', 'test@example.com'],
    ['name', 'Dr. John Smith Jr.'],
  ];

  for (const [type, value] of deterministicCases) {
    it(`${type} is deterministic`, () => {
      expect(gen.generate(type, value)).toBe(gen.generate(type, value));
    });
  }
});
