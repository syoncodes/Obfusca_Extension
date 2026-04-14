/**
 * LocalDummyGenerator — client-side dummy value generation for Obfusca.
 *
 * Synchronous TypeScript port of backend services/dummy_generator.py Categories 1–3.
 * Eliminates Groq/AI round-trips for the vast majority of production detections.
 * Category 4 (semantic AI) falls back to a bracketed placeholder until Phase 2
 * adds a local model.
 *
 * Exports: `LocalDummyGenerator` class, `localDummyGenerator` singleton.
 *
 * Usage:
 *   import { localDummyGenerator } from './localDummyGenerator';
 *   const dummy = localDummyGenerator.generate('ssn', '456-78-9012');
 *   // → "123-45-6789"
 */

// ===========================================================================
// Category 1: Built-in Patterns (Deterministic)
// ===========================================================================

const BUILTIN_DUMMIES: Record<string, string> = {
  ssn: '123-45-6789',
  credit_card: '4111-1111-1111-1111',
  credit_card_visa: '4111-1111-1111-1111',
  credit_card_mc: '5500-0000-0000-0004',
  credit_card_amex: '3400-0000-0000-009',
  credit_card_discover: '6011-0000-0000-0004',
  phone: '(555) 123-4567',
  email: 'user@example.com',
  ipv4: '192.0.2.1',
  ipv6: '2001:db8::1',
  aws_key: 'AKIAIOSFODNN7EXAMPLE',
  aws_secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  api_key: 'sk_test_xxxxxxxxxxxxxxxxxxxx',
  private_key: '-----BEGIN EXAMPLE PRIVATE KEY-----',
  jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.signature',
  connection_string: 'postgresql://user:pass@localhost:5432/example_db',
  github_token: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  slack_token: 'xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx',
};

function detectCreditCardNetwork(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return 'credit_card';
  const first = digits[0];
  const firstTwo = digits.slice(0, 2);
  if (first === '4') return 'credit_card_visa';
  if (first === '5' && '12345'.includes(firstTwo[1] ?? '')) return 'credit_card_mc';
  if (firstTwo === '34' || firstTwo === '37') return 'credit_card_amex';
  if (digits.startsWith('6011') || digits.startsWith('65')) return 'credit_card_discover';
  return 'credit_card';
}

// ===========================================================================
// Category 2: Structured Data
// ===========================================================================

const STRUCTURED_DUMMIES: Record<string, string> = {
  address: '123 Example Street, Anytown, ST 12345',
  date_of_birth: '01/01/1990',
  dob: '01/01/1990',
  bank_account: '000000000000',
  routing_number: '021000021',
  passport: 'X00000000',
  driver_license: 'D000-0000-0000',
  medical_record: 'MRN-000000',
  mrn: 'MRN-000000',
};

const DATE_PATTERNS: Array<[RegExp, string]> = [
  [/^\d{4}-\d{2}-\d{2}$/, '1990-01-01'],
  [/^\d{2}\/\d{2}\/\d{4}$/, '01/01/1990'],
  [/^\d{2}-\d{2}-\d{4}$/, '01-01-1990'],
  [/^\d{2}\.\d{2}\.\d{4}$/, '01.01.1990'],
  [/^\d{4}\/\d{2}\/\d{2}$/, '1990/01/01'],
  [/^\d{2}\/\d{2}\/\d{2}$/, '01/01/90'],
];

function formatPreserveDate(original: string): string | null {
  const s = original.trim();
  for (const [pattern, dummy] of DATE_PATTERNS) {
    if (pattern.test(s)) return dummy;
  }
  return null;
}

function formatPreservePhone(original: string): string {
  const digitsOnly = original.replace(/\D/g, '');
  let dummyDigits = '5551234567';
  if (digitsOnly.length > 10) {
    dummyDigits = '1'.repeat(digitsOnly.length - 10) + dummyDigits;
  } else if (digitsOnly.length < 10) {
    dummyDigits = dummyDigits.slice(0, digitsOnly.length);
  }
  const result: string[] = [];
  let di = 0;
  for (const ch of original) {
    if (/\d/.test(ch) && di < dummyDigits.length) {
      result.push(dummyDigits[di++]);
    } else {
      result.push(ch);
    }
  }
  return result.join('');
}

function formatPreserveCreditCard(original: string): string {
  const network = detectCreditCardNetwork(original);
  const baseDummy = BUILTIN_DUMMIES[network] ?? BUILTIN_DUMMIES['credit_card'];
  const dummyDigits = baseDummy.replace(/\D/g, '');
  const separators = original.match(/[\s\-]/g);
  if (!separators) return dummyDigits;
  const sepChar = separators[0];
  const groups = original.trim().split(/[\s\-]+/);
  const groupSizes = groups.map(g => g.replace(/\D/g, '').length);
  const resultGroups: string[] = [];
  let pos = 0;
  for (const size of groupSizes) {
    const chunk = dummyDigits.slice(pos, pos + size);
    if (chunk) resultGroups.push(chunk);
    pos += size;
  }
  if (pos < dummyDigits.length) resultGroups.push(dummyDigits.slice(pos));
  return resultGroups.join(sepChar);
}

function formatPreserveSsn(original: string): string {
  const digitsOnly = original.replace(/\D/g, '');
  if (digitsOnly.length === 9) {
    const nonDigit = original.replace(/\d/g, '')[0];
    if (nonDigit === ' ') return '123 45 6789';
    if (nonDigit === '.') return '123.45.6789';
    if (!nonDigit) return '123456789';
    return '123-45-6789';
  }
  return '123-45-6789';
}

function formatPreserveBankAccount(original: string): string {
  const len = Math.max(original.replace(/\D/g, '').length, 8);
  return '0'.repeat(len);
}

function formatPreserveEmail(original: string): string {
  return original.split('@')[0].includes('+') ? 'user+test@example.com' : 'user@example.com';
}

// ===========================================================================
// Category 3: Names
// ===========================================================================

const FIRST_NAMES = ['Jane', 'John', 'Alice', 'Bob', 'Test', 'Sample', 'Example'];
const TITLE_PREFIXES = [
  'Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.', 'Prof.', 'Rev.',
  'Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Rev', 'Sir', 'Lady', 'Lord',
];

function generateNameDummy(original: string): string {
  const parts = original.trim().split(/\s+/);
  if (!parts.length || (parts.length === 1 && !parts[0])) return 'Jane Doe';

  let title: string | null = null;
  let nameParts = [...parts];
  for (const prefix of TITLE_PREFIXES) {
    if (nameParts[0].replace(/\.$/, '') === prefix.replace(/\.$/, '')) {
      title = nameParts[0];
      nameParts = nameParts.slice(1);
      break;
    }
  }

  const count = nameParts.length;
  let dummyParts: string[];
  if (count === 0) {
    dummyParts = ['Doe'];
  } else if (count === 1) {
    dummyParts = ['Doe'];
  } else if (count === 2) {
    dummyParts = ['Jane', 'Doe'];
  } else {
    const middles = FIRST_NAMES.slice(2, 2 + (count - 2));
    while (middles.length < count - 2) middles.push('A.');
    dummyParts = ['Jane', ...middles, 'Doe'];
  }

  return title ? `${title} ${dummyParts.join(' ')}` : dummyParts.join(' ');
}

// ===========================================================================
// Category 5: Format heuristics (for custom/unknown types)
// ===========================================================================

const FORMAT_HEURISTICS: Array<[RegExp, string]> = [
  [/^\d{3}[-.\s]\d{2}[-.\s]\d{4}$/, 'ssn'],
  [/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/, 'email'],
  [/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, 'ipv4'],
  [/^\d{2,4}[-/.]\d{2}[-/.]\d{2,4}$/, 'date'],
  [/^\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{1,7}$/, 'credit_card'],
  [/^[(\+]?\d[\d\s\-()\s]{7,15}$/, 'phone'],
  [/^\$[\d,]+(\.\d{1,2})?[KMBTkmbt]?$/, 'money'],
  [/^[\d,]+(\.\d{1,2})?\s*(USD|EUR|GBP|CAD|AUD)$/i, 'money'],
];

function detectFormatHeuristic(value: string): string | null {
  const s = value.trim();
  for (const [pattern, fmt] of FORMAT_HEURISTICS) {
    if (pattern.test(s)) return fmt;
  }
  return null;
}

// ===========================================================================
// Handler map and main class
// ===========================================================================

type HandlerName = keyof LocalDummyGenerator & `generate${string}`;

/**
 * Synchronous local dummy value generator.
 * Covers Categories 1–3 deterministically; falls back to a bracketed
 * placeholder for semantic/custom types that require AI (Phase 2).
 */
export class LocalDummyGenerator {
  // ----- Category 1 -----

  generateSsnDummy(original: string): string {
    return formatPreserveSsn(original);
  }

  generateCreditCardDummy(original: string): string {
    return formatPreserveCreditCard(original);
  }

  generatePhoneDummy(original: string): string {
    return formatPreservePhone(original);
  }

  generateEmailDummy(original: string): string {
    return formatPreserveEmail(original);
  }

  generateAwsKeyDummy(_original: string): string {
    return BUILTIN_DUMMIES['aws_key'];
  }

  generateAwsSecretDummy(_original: string): string {
    return BUILTIN_DUMMIES['aws_secret'];
  }

  generateApiKeyDummy(original: string): string {
    if (original.startsWith('sk_live_')) return 'sk_test_' + 'x'.repeat(Math.max(original.length - 8, 20));
    if (original.startsWith('sk-')) return 'sk-' + 'x'.repeat(Math.max(original.length - 3, 20));
    if (original.startsWith('ghp_')) return 'ghp_' + 'x'.repeat(36);
    if (original.startsWith('xoxb-')) return BUILTIN_DUMMIES['slack_token'];
    return 'sk_test_' + 'x'.repeat(Math.max(original.length - 8, 20));
  }

  generatePrivateKeyDummy(_original: string): string {
    return BUILTIN_DUMMIES['private_key'];
  }

  generateJwtDummy(_original: string): string {
    return BUILTIN_DUMMIES['jwt'];
  }

  generateConnectionStringDummy(original: string): string {
    if (original.includes('://')) {
      const scheme = original.split('://')[0];
      return `${scheme}://user:pass@localhost:5432/example_db`;
    }
    return BUILTIN_DUMMIES['connection_string'];
  }

  generateGithubTokenDummy(_original: string): string {
    return BUILTIN_DUMMIES['github_token'];
  }

  generateSlackTokenDummy(_original: string): string {
    return BUILTIN_DUMMIES['slack_token'];
  }

  // ----- Category 2 -----

  generateAddressDummy(_original: string): string {
    return STRUCTURED_DUMMIES['address'];
  }

  generateDateOfBirthDummy(original: string): string {
    return formatPreserveDate(original) ?? STRUCTURED_DUMMIES['date_of_birth'];
  }

  generateBankAccountDummy(original: string): string {
    return formatPreserveBankAccount(original);
  }

  generateRoutingNumberDummy(_original: string): string {
    return STRUCTURED_DUMMIES['routing_number'];
  }

  generatePassportDummy(original: string): string {
    const s = original.trim();
    if (s && /^[A-Za-z]/.test(s)) return s[0].toUpperCase() + '0'.repeat(s.length - 1);
    return STRUCTURED_DUMMIES['passport'];
  }

  generateDriverLicenseDummy(original: string): string {
    const s = original.trim();
    if (!s) return STRUCTURED_DUMMIES['driver_license'];
    return s.split('').map(ch => {
      if (/[A-Za-z]/.test(ch)) return 'D';
      if (/\d/.test(ch)) return '0';
      return ch;
    }).join('');
  }

  generateMedicalRecordDummy(original: string): string {
    const m = original.trim().match(/^([A-Za-z\-]+)(\d+)$/);
    if (m) return m[1] + '0'.repeat(m[2].length);
    return STRUCTURED_DUMMIES['medical_record'];
  }

  generateMoneyDummy(original: string): string {
    const s = original.trim();
    const lastChar = s.slice(-1).toLowerCase();
    const suffixMap: Record<string, string> = { k: 'K', m: 'M', b: 'B', t: 'T' };
    if (lastChar in suffixMap) {
      const suffix = suffixMap[lastChar];
      return s.includes('.') ? `$2.5${suffix}` : `$500${suffix}`;
    }
    if (s.includes(',')) return '$100,000';
    if (s.includes('.')) return '$100.00';
    return '$100,000';
  }

  // ----- Category 3 -----

  generateNameDummy(original: string): string {
    return generateNameDummy(original);
  }

  // ----- Handler dispatch map -----

  private static readonly HANDLER_MAP: Record<string, HandlerName> = {
    ssn: 'generateSsnDummy',
    credit_card: 'generateCreditCardDummy',
    phone: 'generatePhoneDummy',
    email: 'generateEmailDummy',
    aws_key: 'generateAwsKeyDummy',
    aws_secret: 'generateAwsSecretDummy',
    api_key: 'generateApiKeyDummy',
    private_key: 'generatePrivateKeyDummy',
    jwt: 'generateJwtDummy',
    connection_string: 'generateConnectionStringDummy',
    github_token: 'generateGithubTokenDummy',
    slack_token: 'generateSlackTokenDummy',
    // Structured
    address: 'generateAddressDummy',
    date_of_birth: 'generateDateOfBirthDummy',
    dob: 'generateDateOfBirthDummy',
    bank_account: 'generateBankAccountDummy',
    routing_number: 'generateRoutingNumberDummy',
    passport: 'generatePassportDummy',
    driver_license: 'generateDriverLicenseDummy',
    medical_record: 'generateMedicalRecordDummy',
    mrn: 'generateMedicalRecordDummy',
    // Money
    money: 'generateMoneyDummy',
    monetary: 'generateMoneyDummy',
    amount: 'generateMoneyDummy',
    salary: 'generateMoneyDummy',
    currency: 'generateMoneyDummy',
    // Names
    name: 'generateNameDummy',
    person_name: 'generateNameDummy',
    full_name: 'generateNameDummy',
    patient_name: 'generateNameDummy',
    employee_name: 'generateNameDummy',
  };

  /**
   * Generate a dummy replacement for a detected sensitive value.
   *
   * @param type         Detection type (e.g. 'ssn', 'credit_card', 'custom').
   * @param originalValue  The original sensitive value (or a preview/mask as fallback).
   * @param displayName  Optional human-readable label for the detection.
   * @returns            Obvious fake replacement string, never throws.
   */
  generate(type: string, originalValue: string, displayName?: string | null): string {
    const detType = type.toLowerCase().trim();
    const value = originalValue ?? '';

    // 1. Known deterministic handler.
    const handlerName = LocalDummyGenerator.HANDLER_MAP[detType];
    if (handlerName) {
      return (this[handlerName] as (v: string) => string)(value);
    }

    // 2. For custom/unknown types, try format heuristics.
    const heuristicType = detectFormatHeuristic(value);
    if (heuristicType) {
      const hHandler = LocalDummyGenerator.HANDLER_MAP[heuristicType];
      if (hHandler) return (this[hHandler] as (v: string) => string)(value);
    }

    // 3. Display-name hint: if the label mentions "name", generate a name dummy.
    const label = (displayName ?? detType).toLowerCase();
    if (label.includes('name')) return generateNameDummy(value);
    if (label.includes('address')) return STRUCTURED_DUMMIES['address'];
    if (label.includes('phone') || label.includes('mobile') || label.includes('cell')) {
      return formatPreservePhone(value || '(555) 123-4567');
    }
    if (label.includes('email')) return formatPreserveEmail(value || 'user@example.com');
    if (label.includes('date') || label.includes('dob') || label.includes('birth')) {
      return formatPreserveDate(value) ?? STRUCTURED_DUMMIES['date_of_birth'];
    }
    if (label.includes('salary') || label.includes('amount') || label.includes('revenue') ||
        label.includes('cost') || label.includes('price') || label.includes('fund') ||
        label.includes('settlement') || label.includes('payment') || label.includes('deal')) {
      return this.generateMoneyDummy(value || '$100,000');
    }

    // 4. Fallback: bracketed placeholder (Phase 2 will replace this with local model).
    const label2 = (displayName || type).toUpperCase().replace(/\s+/g, '_');
    return `[EXAMPLE_${label2}]`;
  }
}

/** Module-level singleton — import this for normal use. */
export const localDummyGenerator = new LocalDummyGenerator();
