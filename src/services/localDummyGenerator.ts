/**
 * Local dummy value generator for the Obfusca extension.
 *
 * Ports Categories 1–3 of backend/app/services/dummy_generator.py into pure
 * TypeScript with no external dependencies.  All generation is deterministic:
 * the same (type, originalValue) pair always produces the same output via a
 * seeded xorshift32 PRNG seeded from a FNV-1a hash of the inputs.
 *
 * Category 1 – Built-in structured types (SSN, credit card, AWS keys, etc.)
 * Category 2 – Structured semantic types (address, DOB, money, phone, email…)
 * Category 3 – Names (word-count-preserving, title/suffix-aware)
 * Category 4+ – Placeholder `[EXAMPLE_{TYPE}]` (Phase 2: local model inference)
 *
 * SECURITY: Original sensitive values are used only for format detection and
 * are never logged, stored, or transmitted by this module.
 */

import {
  FIRST_NAMES,
  LAST_NAMES,
  STREET_NAMES,
  STREET_TYPES,
  CITIES,
  EMAIL_DOMAINS,
  EMAIL_LOCAL_PREFIXES,
  BASE64_CHARS,
  BASE64URL_CHARS,
  ALPHANUMERIC,
  PASSPORT_LETTERS,
} from './dummyData.js';
import { detectFormat, type DetectedFormat, type MoneyFormat, type PhoneFormat } from './formatDetector.js';

// ---------------------------------------------------------------------------
// Exported interface
// ---------------------------------------------------------------------------

export interface ILocalDummyGenerator {
  generate(type: string, originalValue: string, displayName?: string): string;
  generateAsync(
    type: string,
    originalValue: string,
    context?: string,
    displayName?: string,
  ): Promise<string>;
}

// ---------------------------------------------------------------------------
// Seeded deterministic PRNG (xorshift32)
// ---------------------------------------------------------------------------

interface Rng {
  /** Returns a float in [0, 1) */
  next(): number;
  /** Returns an integer in [min, max) */
  nextInt(min: number, max: number): number;
  /** Picks a random element from an array */
  pick<T>(arr: readonly T[]): T;
  /** Returns n random characters from the given alphabet */
  randChars(alphabet: string, n: number): string;
  /** Returns random decimal digits as a string, padded to length n */
  randDigits(n: number): string;
}

/** FNV-1a 32-bit hash — deterministic string → uint32 */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

function makeRng(seed: number): Rng {
  // xorshift32 state — must be non-zero
  let s = (seed >>> 0) || 1;

  function next(): number {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s = s >>> 0;
    return s / 0x100000000;
  }

  return {
    next,
    nextInt(min: number, max: number): number {
      return Math.floor(next() * (max - min)) + min;
    },
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(next() * arr.length)];
    },
    randChars(alphabet: string, n: number): string {
      let out = '';
      for (let i = 0; i < n; i++) {
        out += alphabet[Math.floor(next() * alphabet.length)];
      }
      return out;
    },
    randDigits(n: number): string {
      let out = '';
      // First digit must not be 0 (for most contexts) — caller handles if needed
      for (let i = 0; i < n; i++) {
        out += String(Math.floor(next() * 10));
      }
      return out;
    },
  };
}

/** Build a seeded Rng from a detection type + original value string. */
function rngFor(type: string, value: string): Rng {
  return makeRng(fnv1a(`${type}:${value}`));
}

// ---------------------------------------------------------------------------
// Luhn checksum helpers
// ---------------------------------------------------------------------------

/**
 * Given an array of digits (prefix, WITHOUT the check digit), compute the
 * Luhn check digit so that the full number is valid.
 *
 * Standard Luhn: traverse from right to left; double every digit at an odd
 * position from the right (1-indexed); if doubling gives > 9, subtract 9.
 * The check digit at position 0 is not doubled.
 *
 * With the prefix as input:
 *   - prefix[len-1] ends up at position 1 from right → doubled
 *   - prefix[0] ends up at position len from right
 */
function computeLuhnCheckDigit(prefix: readonly number[]): number {
  let sum = 0;
  for (let i = prefix.length - 1; i >= 0; i--) {
    const posFromRight = prefix.length - i; // 1-indexed; prefix[len-1] → 1
    let d = prefix[i];
    if (posFromRight % 2 === 1) {
      // Odd positions from right are doubled
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

/** Validate an array of digit values against the Luhn algorithm. */
function isLuhnValid(digits: readonly number[]): boolean {
  if (digits.length < 2) return false;
  let sum = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    const posFromRight = digits.length - 1 - i; // 0=rightmost (check digit, not doubled)
    let d = digits[i];
    if (posFromRight % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

// ---------------------------------------------------------------------------
// ABA routing number checksum helper
// ---------------------------------------------------------------------------

/**
 * Given digits d0-d7 (8 digits), compute d8 such that the 9-digit ABA routing
 * number satisfies the checksum: 3d0+7d1+d2+3d3+7d4+d5+3d6+7d7+d8 ≡ 0 (mod 10)
 */
function computeABACheckDigit(prefix: readonly number[]): number {
  // weights cycle: 3, 7, 1
  const weights = [3, 7, 1, 3, 7, 1, 3, 7];
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += weights[i] * prefix[i];
  }
  return (10 - (sum % 10)) % 10;
}

// ---------------------------------------------------------------------------
// Number formatting helper
// ---------------------------------------------------------------------------

function formatWithCommas(n: number): string {
  const s = String(Math.round(n));
  const result: string[] = [];
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) result.push(',');
    result.push(s[i]);
  }
  return result.join('');
}

// ---------------------------------------------------------------------------
// Category 1: Built-in structured types
// ---------------------------------------------------------------------------

function generateSSN(original: string, rng: Rng): string {
  // Valid SSN area: 001–899 excluding 666
  let area = rng.nextInt(1, 899); // 1..898
  if (area >= 666) area += 1; // skip 666 → gives 1..665 ∪ 667..899

  const group = rng.nextInt(1, 100); // 01-99
  const serial = rng.nextInt(1, 10000); // 0001-9999

  const a = String(area).padStart(3, '0');
  const g = String(group).padStart(2, '0');
  const s = String(serial).padStart(4, '0');

  // Detect separator from original
  const digits = original.replace(/\d/g, '');
  const nonDigits = original.replace(/[\d\s]/g, '');

  // bare 9 digits
  if (!digits.trim() && !/\D/.test(original)) return a + g + s;

  const sep = nonDigits.includes('-')
    ? '-'
    : nonDigits.includes('.')
      ? '.'
      : ' ';
  return `${a}${sep}${g}${sep}${s}`;
}

function generateCreditCard(
  original: string,
  rng: Rng,
  network: 'visa' | 'mastercard' | 'amex' | 'discover' | 'generic',
  groupSizes: number[],
  separator: string,
): string {
  let prefix: number[];
  let totalLen: number;

  switch (network) {
    case 'visa':
      prefix = [4];
      totalLen = 16;
      break;
    case 'mastercard':
      prefix = [5, rng.nextInt(1, 6)]; // 51–55
      totalLen = 16;
      break;
    case 'amex':
      prefix = [3, rng.nextInt(0, 2) === 0 ? 4 : 7]; // 34 or 37
      totalLen = 15;
      break;
    case 'discover':
      prefix = [6, 0, 1, 1];
      totalLen = 16;
      break;
    default:
      prefix = [4];
      totalLen = 16;
  }

  // Fill to totalLen - 1 with random digits, then compute check digit
  const digits = [...prefix];
  while (digits.length < totalLen - 1) {
    digits.push(rng.nextInt(0, 10));
  }
  digits.push(computeLuhnCheckDigit(digits));

  // Format with original separators and groupings
  const flatDigits = digits.join('');

  const effectiveSeparator =
    separator ||
    (original.includes('-') ? '-' : original.includes(' ') ? ' ' : '');

  if (!effectiveSeparator || groupSizes.length === 0) {
    return flatDigits;
  }

  // Rebuild using detected group sizes
  const groups: string[] = [];
  let pos = 0;
  for (const size of groupSizes) {
    groups.push(flatDigits.slice(pos, pos + size));
    pos += size;
  }
  if (pos < flatDigits.length) groups.push(flatDigits.slice(pos));

  return groups.filter((g) => g.length > 0).join(effectiveSeparator);
}

function generateAWSAccessKey(_original: string, rng: Rng): string {
  // AWS Access Key ID: AKIA + 16 uppercase alphanumeric
  const prefixes = ['AKIA', 'ABIA', 'ACCA', 'ASIA'];
  const prefix = rng.pick(prefixes);
  const UPPER_ALPHA_NUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return prefix + rng.randChars(UPPER_ALPHA_NUM, 16);
}

function generateAPIKey(original: string, rng: Rng): string {
  const trimmed = original.trim();
  const LOWER_ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';

  if (trimmed.startsWith('sk_live_')) {
    return 'sk_test_' + rng.randChars(LOWER_ALNUM, Math.max(trimmed.length - 8, 24));
  }
  if (trimmed.startsWith('sk-')) {
    return 'sk-' + rng.randChars(LOWER_ALNUM, Math.max(trimmed.length - 3, 48));
  }
  if (trimmed.startsWith('ghp_') || trimmed.startsWith('github_pat_')) {
    return generateGitHubToken(original, rng);
  }
  if (trimmed.startsWith('xoxb-') || trimmed.startsWith('xoxp-')) {
    return generateSlackToken(original, rng);
  }
  // Generic api_key=VALUE pattern — preserve prefix up to '='
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    const keyPart = trimmed.slice(0, eqIdx + 1);
    const valLen = Math.max(trimmed.length - eqIdx - 1, 32);
    return keyPart + rng.randChars(ALPHANUMERIC, valLen);
  }
  // Fallback: preserve length, scramble
  const len = Math.max(trimmed.length, 32);
  return 'sk_test_' + rng.randChars(LOWER_ALNUM, Math.max(len - 8, 24));
}

function generatePrivateKey(_original: string, rng: Rng): string {
  // Generate a plausible-looking PEM private key block (fake)
  const keyTypes = ['RSA PRIVATE KEY', 'EC PRIVATE KEY', 'PRIVATE KEY'];
  const keyType = rng.pick(keyTypes);

  // RSA 2048 PEM body is ~1700 base64 chars; EC is ~200
  const bodyLen = keyType.startsWith('RSA') ? 1632 : keyType.startsWith('EC') ? 192 : 1216;
  const lines: string[] = [];
  let remaining = bodyLen;
  while (remaining > 0) {
    const lineLen = Math.min(64, remaining);
    lines.push(rng.randChars(BASE64_CHARS, lineLen));
    remaining -= lineLen;
  }

  return (
    `-----BEGIN ${keyType}-----\n` +
    lines.join('\n') +
    `\n-----END ${keyType}-----`
  );
}

function generateJWT(_original: string, rng: Rng): string {
  // Standard HS256 header (fixed — all real JWTs use this)
  const header = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';

  // Payload: vary sub and iat with PRNG for plausibility
  const userId = String(rng.nextInt(1000000, 9999999));
  const nameIdx = rng.nextInt(0, FIRST_NAMES.length);
  const lastIdx = rng.nextInt(0, LAST_NAMES.length);
  const firstName = FIRST_NAMES[nameIdx];
  const lastName = LAST_NAMES[lastIdx];
  const iat = 1500000000 + rng.nextInt(0, 100000000);

  const payloadObj = `{"sub":"${userId}","name":"${firstName} ${lastName}","iat":${iat}}`;
  // btoa equivalent for ASCII-safe strings
  const payloadB64 = btoa(payloadObj)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  // 32-byte HMAC signature (fake — 43 base64url chars)
  const signature = rng.randChars(BASE64URL_CHARS, 43);

  return `${header}.${payloadB64}.${signature}`;
}

function generateConnectionString(original: string, rng: Rng): string {
  // Detect scheme from original
  let scheme = 'postgresql';
  if (original.includes('://')) {
    scheme = original.split('://')[0].toLowerCase().trim();
  }

  const dbNames = ['app_db', 'production', 'maindb', 'appdata', 'service_db'];
  const ports: Record<string, number> = {
    postgresql: 5432,
    postgres: 5432,
    mysql: 3306,
    mongodb: 27017,
    redis: 6379,
    mssql: 1433,
    oracle: 1521,
    sqlite: 0,
  };

  const port = ports[scheme] ?? 5432;
  const dbName = rng.pick(dbNames);
  const userName = rng.pick(['appuser', 'dbuser', 'service', 'readonly', 'admin']);
  const password = rng.randChars(ALPHANUMERIC, 16);

  if (scheme === 'sqlite') {
    return `sqlite:///path/to/${dbName}.db`;
  }
  if (scheme === 'redis') {
    return `redis://:${password}@localhost:${port}/0`;
  }
  return `${scheme}://${userName}:${password}@localhost:${port}/${dbName}`;
}

function generateGitHubToken(_original: string, rng: Rng): string {
  // ghp_ + 36 alphanumeric characters
  return 'ghp_' + rng.randChars(ALPHANUMERIC, 36);
}

function generateSlackToken(original: string, rng: Rng): string {
  // Detect token type: xoxb (bot) or xoxp (user) or xoxs (service)
  const trimmed = original.trim();
  let prefix = 'xoxb';
  if (trimmed.startsWith('xoxp')) prefix = 'xoxp';
  else if (trimmed.startsWith('xoxs')) prefix = 'xoxs';

  // Format: xoxb-XXXXXXXXXX-XXXXXXXXXX-XXXXXXXXXXXXXXXXXXXXXXXX
  const p1 = rng.randDigits(10);
  const p2 = rng.randDigits(10);
  const p3 = rng.randChars(ALPHANUMERIC, 24);
  return `${prefix}-${p1}-${p2}-${p3}`;
}

// ---------------------------------------------------------------------------
// Category 2: Structured semantic types
// ---------------------------------------------------------------------------

function generateAddress(_original: string, rng: Rng): string {
  const num = rng.nextInt(100, 9999);
  const streetName = rng.pick(STREET_NAMES);
  const streetType = rng.pick(STREET_TYPES);
  const cityData = rng.pick(CITIES);
  const zipSuffix = String(rng.nextInt(0, 100)).padStart(2, '0');
  const zip = cityData.zipPrefix + zipSuffix;

  return `${num} ${streetName} ${streetType}, ${cityData.city}, ${cityData.state} ${zip}`;
}

function generateDateOfBirth(original: string, rng: Rng): string {
  // Use format detection to preserve original date format
  const fmt = detectFormat(original.trim());

  // Realistic DOB: age 20-85, so birth year 1940-2004
  const year = 1940 + rng.nextInt(0, 65);
  const month = rng.nextInt(1, 13);
  const day = rng.nextInt(1, 29); // safe: avoids month-end edge cases

  const MM = String(month).padStart(2, '0');
  const DD = String(day).padStart(2, '0');
  const YY = String(year).slice(2);
  const YYYY = String(year);

  if (fmt?.kind === 'date') {
    switch (fmt.pattern) {
      case 'YYYY-MM-DD': return `${YYYY}-${MM}-${DD}`;
      case 'MM/DD/YYYY': return `${MM}/${DD}/${YYYY}`;
      case 'MM-DD-YYYY': return `${MM}-${DD}-${YYYY}`;
      case 'DD.MM.YYYY': return `${DD}.${MM}.${YYYY}`;
      case 'YYYY/MM/DD': return `${YYYY}/${MM}/${DD}`;
      case 'MM/DD/YY':   return `${MM}/${DD}/${YY}`;
      case 'DD/MM/YYYY': return `${DD}/${MM}/${YYYY}`;
      case 'MMMM D YYYY': {
        const MONTHS = ['January','February','March','April','May','June',
                         'July','August','September','October','November','December'];
        return `${MONTHS[month - 1]} ${day}, ${YYYY}`;
      }
      case 'D MMMM YYYY': {
        const MONTHS = ['January','February','March','April','May','June',
                         'July','August','September','October','November','December'];
        return `${day} ${MONTHS[month - 1]} ${YYYY}`;
      }
    }
  }

  // Default: MM/DD/YYYY
  return `${MM}/${DD}/${YYYY}`;
}

function generateBankAccount(original: string, rng: Rng): string {
  const digits = original.replace(/\D/g, '');
  const len = Math.min(Math.max(digits.length, 8), 12);
  // First digit non-zero
  return String(rng.nextInt(1, 10)) + rng.randDigits(len - 1);
}

function generateRoutingNumber(_original: string, rng: Rng): string {
  // ABA routing: first digit 0 or 1, second digit 1-9 (Fed district), rest random
  // d0: 0 or 1
  const d0 = rng.nextInt(0, 2);
  // d1: 1-9
  const d1 = rng.nextInt(1, 10);
  const rest = Array.from({ length: 6 }, () => rng.nextInt(0, 10));
  const prefix = [d0, d1, ...rest];
  const check = computeABACheckDigit(prefix);
  return [...prefix, check].join('');
}

function generatePassport(original: string, rng: Rng): string {
  const stripped = original.trim();
  let letterPrefix = '';

  // Detect if the original starts with a letter (country code)
  if (stripped.length > 0 && /[A-Za-z]/.test(stripped[0])) {
    letterPrefix = stripped[0].toUpperCase();
  } else {
    letterPrefix = rng.pick(PASSPORT_LETTERS);
  }

  // Rest is digits — typical passport is 7-9 chars total
  const numLen = Math.max(stripped.length - letterPrefix.length, 7);
  return letterPrefix + rng.randDigits(numLen);
}

function generateDriverLicense(original: string, rng: Rng): string {
  const stripped = original.trim();
  if (!stripped) return 'D' + rng.randDigits(8);

  // Preserve structure: letters → D, digits → random, separators preserved
  const result: string[] = [];
  for (const ch of stripped) {
    if (/[A-Za-z]/.test(ch)) {
      result.push('D');
    } else if (/\d/.test(ch)) {
      result.push(String(rng.nextInt(0, 10)));
    } else {
      result.push(ch);
    }
  }
  return result.join('');
}

function generateMedicalRecord(original: string, rng: Rng): string {
  const stripped = original.trim();
  // Match prefix (letters + dashes) followed by digits
  const match = stripped.match(/^([A-Za-z\-]+)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const numLen = match[2].length;
    return prefix + String(rng.nextInt(1, 10)) + rng.randDigits(numLen - 1);
  }
  // Fallback
  return 'MRN-' + String(rng.nextInt(100000, 999999));
}

function generateMoney(original: string, fmt: MoneyFormat, rng: Rng): string {
  const { prefixSymbol, suffixSymbol, currencyCode, magnitudeSuffix, hasDecimal, decimalPlaces, hasCommas } = fmt;

  let numStr: string;

  if (magnitudeSuffix) {
    if (hasDecimal) {
      // $2.4M → $3.7M style (same magnitude, different digits)
      const whole = rng.nextInt(1, 10);
      const frac = rng.nextInt(1, 10);
      numStr = `${whole}.${frac}`;
    } else {
      // $800K → different amount with same suffix
      const choices = [100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 750, 800, 900];
      numStr = String(rng.pick(choices));
    }
  } else if (hasCommas) {
    // $150,000 → same comma-grouping style
    const intLen = fmt.integerDigits;
    let n: number;
    if (intLen <= 3) {
      n = rng.nextInt(100, 999);
    } else if (intLen <= 6) {
      n = rng.nextInt(10000, 999999);
    } else {
      n = rng.nextInt(1000000, 9999999);
    }
    numStr = formatWithCommas(n);
    if (hasDecimal) {
      const frac = rng.randDigits(decimalPlaces);
      numStr += '.' + frac;
    }
  } else if (hasDecimal) {
    // $50.00 style — realistic retail amounts
    const whole = rng.pick([19, 24, 29, 49, 74, 99, 119, 149, 199, 249, 299, 349, 499]);
    if (decimalPlaces === 2) {
      const cents = rng.pick([0, 25, 49, 50, 75, 95, 99]);
      numStr = `${whole}.${String(cents).padStart(2, '0')}`;
    } else {
      numStr = `${whole}.${rng.nextInt(0, 10)}`;
    }
  } else {
    // Bare integer amount
    const choices = [10000, 15000, 20000, 25000, 30000, 50000, 75000, 100000];
    numStr = String(rng.pick(choices));
  }

  const magnitudeStr = magnitudeSuffix;
  const codeStr = currencyCode ? ` ${currencyCode}` : '';

  if (prefixSymbol) {
    return `${prefixSymbol}${numStr}${magnitudeStr}${codeStr}`;
  }
  if (suffixSymbol) {
    return `${numStr}${magnitudeStr} ${suffixSymbol}${codeStr}`;
  }
  return `${numStr}${magnitudeStr}${codeStr}`;
}

function generatePhone(original: string, fmt: PhoneFormat, rng: Rng): string {
  // US 555-01XX range is reserved for fictional use (NANP 555-0100 to 555-0199)
  // Use 555 area code + 555 exchange + 01XX for subscriber
  const subscriberSuffix = String(rng.nextInt(0, 100)).padStart(2, '0');
  const fakeSubscriber = '01' + subscriberSuffix; // 4 digits: 0100-0199

  const { hasParens, separator, intlPrefix, groupSizes } = fmt;

  // Build digit groups based on detected structure
  // Most common US format: [3, 3, 4]
  let groups: string[];

  if (groupSizes.length === 3 && groupSizes[0] === 3 && groupSizes[2] === 4) {
    // Standard US: area-exchange-subscriber
    groups = ['555', '555', fakeSubscriber];
  } else if (groupSizes.length === 2) {
    // Two-part format
    const totalDigits = fmt.digitCount;
    const g1 = String(rng.nextInt(100, 1000)); // 3-digit
    const g2 = rng.randDigits(totalDigits - 3);
    groups = [g1, g2];
  } else if (groupSizes.length >= 4) {
    // International-style: more groups
    groups = ['555', '55', '5', fakeSubscriber];
  } else {
    // Plain digits
    const plainDigits = '555' + '555' + fakeSubscriber;
    if (intlPrefix) {
      return `${intlPrefix} ${plainDigits}`;
    }
    return plainDigits;
  }

  let result: string;
  if (hasParens && groups.length >= 2) {
    const [areaCode, ...rest] = groups;
    result = `(${areaCode})${separator || ' '}${rest.join(separator || '-')}`;
  } else {
    result = groups.join(separator || '-');
  }

  if (intlPrefix) {
    return `${intlPrefix} ${result}`;
  }
  return result;
}

function generateEmail(original: string, rng: Rng): string {
  const hasPlus = original.split('@')[0].includes('+');

  const localPart = rng.pick(EMAIL_LOCAL_PREFIXES);
  const numSuffix = rng.nextInt(0, 2) === 0 ? String(rng.nextInt(10, 999)) : '';
  const domain = rng.pick(EMAIL_DOMAINS);

  if (hasPlus) {
    const tag = rng.pick(['test', 'dev', 'temp', 'noreply', 'work']);
    return `${localPart}+${tag}${numSuffix}@${domain}`;
  }
  return `${localPart}${numSuffix}@${domain}`;
}

function generateIPv4(_original: string, _rng: Rng): string {
  // RFC 5737 TEST-NET-1: 192.0.2.0/24 — reserved for documentation
  return '192.0.2.1';
}

// ---------------------------------------------------------------------------
// Category 3: Names
// ---------------------------------------------------------------------------

const TITLE_PREFIXES: readonly string[] = [
  'Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.', 'Prof.', 'Rev.',
  'Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Rev', 'Sir', 'Lady', 'Lord',
];

const NAME_SUFFIXES: readonly string[] = [
  'Jr.', 'Sr.', 'I', 'II', 'III', 'IV', 'V',
  'PhD', 'MD', 'JD', 'DDS', 'RN', 'CPA', 'Esq.',
];

function generateName(original: string, rng: Rng): string {
  const parts = original.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return 'Jane Doe';

  // Detect leading title
  let title: string | null = null;
  let nameParts = [...parts];

  for (const prefix of TITLE_PREFIXES) {
    if (nameParts[0].replace('.', '') === prefix.replace('.', '')) {
      title = nameParts[0]; // preserve original capitalisation/punctuation
      nameParts = nameParts.slice(1);
      break;
    }
  }

  // Detect trailing suffix
  let suffix: string | null = null;
  if (nameParts.length > 0) {
    const lastPart = nameParts[nameParts.length - 1];
    for (const sfx of NAME_SUFFIXES) {
      if (lastPart.replace('.', '') === sfx.replace('.', '')) {
        suffix = nameParts[nameParts.length - 1];
        nameParts = nameParts.slice(0, -1);
        break;
      }
    }
  }

  const count = nameParts.length;
  let dummyParts: string[];

  if (count === 0) {
    // Just a title (e.g. "Dr.")
    dummyParts = [rng.pick(LAST_NAMES)];
  } else if (count === 1) {
    // Single name → single replacement
    dummyParts = [rng.pick(LAST_NAMES)];
  } else if (count === 2) {
    // First + Last
    dummyParts = [rng.pick(FIRST_NAMES), rng.pick(LAST_NAMES)];
  } else {
    // 3+ parts: First + (count-2) middles + Last
    const first = rng.pick(FIRST_NAMES);
    const last = rng.pick(LAST_NAMES);
    const middles: string[] = [];
    for (let i = 0; i < count - 2; i++) {
      // Middle names: either a first name or a single initial like "Q."
      if (rng.nextInt(0, 3) === 0) {
        // Initial
        middles.push(rng.randChars('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 1) + '.');
      } else {
        middles.push(rng.pick(FIRST_NAMES));
      }
    }
    dummyParts = [first, ...middles, last];
  }

  const assembled = dummyParts.join(' ');
  const withTitle = title ? `${title} ${assembled}` : assembled;
  return suffix ? `${withTitle} ${suffix}` : withTitle;
}

// ---------------------------------------------------------------------------
// Type → handler dispatch
// ---------------------------------------------------------------------------

type SyncHandler = (original: string, rng: Rng) => string;

// Handlers that need format-detector context are handled inline in generate()
const DIRECT_HANDLERS: Record<string, SyncHandler> = {
  ssn:               generateSSN,
  aws_key:           generateAWSAccessKey,
  aws_secret:        (_o, rng) => {
    // Official AWS example secret format: 40 chars, mixed case + /=+
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    return rng.randChars(chars, 40);
  },
  api_key:           generateAPIKey,
  private_key:       generatePrivateKey,
  jwt:               generateJWT,
  connection_string: generateConnectionString,
  github_token:      generateGitHubToken,
  slack_token:       generateSlackToken,
  address:           generateAddress,
  bank_account:      generateBankAccount,
  routing_number:    generateRoutingNumber,
  passport:          generatePassport,
  driver_license:    generateDriverLicense,
  medical_record:    generateMedicalRecord,
  mrn:               generateMedicalRecord,
  ipv4:              generateIPv4,
  ipv6:              (_o, _r) => '2001:db8::1', // RFC 3849 documentation prefix
  name:              generateName,
  person_name:       generateName,
  full_name:         generateName,
  patient_name:      generateName,
  employee_name:     generateName,
  // DOB aliases
  dob:               generateDateOfBirth,
  date_of_birth:     generateDateOfBirth,
};

// Types that need format-based dispatch
const FORMAT_BASED_TYPES = new Set([
  'credit_card', 'credit_card_visa', 'credit_card_mc', 'credit_card_amex', 'credit_card_discover',
  'phone', 'email', 'money', 'monetary', 'amount', 'salary', 'currency',
]);

// ---------------------------------------------------------------------------
// LocalDummyGenerator — main class
// ---------------------------------------------------------------------------

export class LocalDummyGenerator implements ILocalDummyGenerator {
  /**
   * Synchronously generate a dummy replacement for a detected sensitive value.
   *
   * Covers Categories 1–3 deterministically.  Unknown types return the
   * `[EXAMPLE_{TYPE}]` placeholder (Phase 2: local model inference).
   */
  generate(type: string, originalValue: string, _displayName?: string): string {
    const det = type.toLowerCase().trim();
    const rng = rngFor(det, originalValue);

    // 1. Direct handler (no format detection needed)
    const directHandler = DIRECT_HANDLERS[det];
    if (directHandler) {
      return directHandler(originalValue, rng);
    }

    // 2. Format-based dispatch
    if (FORMAT_BASED_TYPES.has(det)) {
      return this._handleFormatBased(det, originalValue, rng);
    }

    // 3. For 'custom' type, try format heuristics on the value
    if (det === 'custom') {
      const fmt = detectFormat(originalValue);
      if (fmt) {
        return this._applyDetectedFormat(fmt, originalValue, rng);
      }
    }

    // 4. Category 4+ placeholder
    return `[EXAMPLE_${type.toUpperCase().replace(/\s+/g, '_')}]`;
  }

  /**
   * Async generation — in Phase 1 this is identical to generate().
   * Phase 2 will add local model inference for unknown types.
   */
  async generateAsync(
    type: string,
    originalValue: string,
    _context?: string,
    displayName?: string,
  ): Promise<string> {
    return this.generate(type, originalValue, displayName);
  }

  // -------------------------------------------------------------------------
  // Private: format-based type dispatch
  // -------------------------------------------------------------------------

  private _handleFormatBased(det: string, original: string, rng: Rng): string {
    if (det === 'email') return generateEmail(original, rng);

    // Money family
    if (['money', 'monetary', 'amount', 'salary', 'currency'].includes(det)) {
      const fmt = detectFormat(original);
      if (fmt?.kind === 'money') return generateMoney(original, fmt.fmt, rng);
      // Fallback: generic
      return `$${String(rng.nextInt(10, 999) * 100).replace(/(\d)(?=(\d{3})+$)/g, '$1,')}`;
    }

    // Phone
    if (det === 'phone') {
      const fmt = detectFormat(original);
      if (fmt?.kind === 'phone') return generatePhone(original, fmt.fmt, rng);
      // Fallback: (555) 555-0100
      return '(555) 555-0100';
    }

    // Credit card family
    if (det.startsWith('credit_card')) {
      const fmt = detectFormat(original);
      let network: 'visa' | 'mastercard' | 'amex' | 'discover' | 'generic' = 'visa';
      if (det === 'credit_card_mc') network = 'mastercard';
      else if (det === 'credit_card_amex') network = 'amex';
      else if (det === 'credit_card_discover') network = 'discover';
      else if (fmt?.kind === 'credit_card') network = fmt.network;

      const separator = fmt?.kind === 'credit_card' ? fmt.separator : '-';
      const groupSizes = fmt?.kind === 'credit_card' ? fmt.groupSizes : [4, 4, 4, 4];
      return generateCreditCard(original, rng, network, groupSizes, separator);
    }

    return `[EXAMPLE_${det.toUpperCase()}]`;
  }

  private _applyDetectedFormat(fmt: DetectedFormat, original: string, rng: Rng): string {
    switch (fmt.kind) {
      case 'ssn':
        return generateSSN(original, rng);
      case 'email':
        return generateEmail(original, rng);
      case 'ipv4':
        return generateIPv4(original, rng);
      case 'date':
        return generateDateOfBirth(original, rng);
      case 'credit_card':
        return generateCreditCard(original, rng, fmt.network, fmt.groupSizes, fmt.separator);
      case 'money':
        return generateMoney(original, fmt.fmt, rng);
      case 'phone':
        return generatePhone(original, fmt.fmt, rng);
      case 'number':
        return String(rng.nextInt(1000, 99999));
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let _defaultInstance: LocalDummyGenerator | null = null;

export function getLocalDummyGenerator(): LocalDummyGenerator {
  if (!_defaultInstance) _defaultInstance = new LocalDummyGenerator();
  return _defaultInstance;
}

// ---------------------------------------------------------------------------
// Exported helpers for testing
// ---------------------------------------------------------------------------

export { computeLuhnCheckDigit, isLuhnValid, computeABACheckDigit, rngFor };
