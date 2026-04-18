/**
 * Format detection for format-preserving dummy value generation.
 *
 * Ports and extends _FORMAT_HEURISTICS from backend/app/services/dummy_generator.py.
 * Returns rich format descriptors that localDummyGenerator uses to produce
 * format-preserving replacements for money, phone, date, and other structured values.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DatePattern =
  | 'YYYY-MM-DD'
  | 'MM/DD/YYYY'
  | 'MM-DD-YYYY'
  | 'DD.MM.YYYY'
  | 'YYYY/MM/DD'
  | 'MM/DD/YY'
  | 'DD/MM/YYYY'
  | 'MMMM D YYYY'     // "January 1 1990"
  | 'D MMMM YYYY';    // "1 January 1990"

export interface MoneyFormat {
  /** Currency symbol if present before the digits, e.g. '$', '€', '£', '¥' */
  prefixSymbol: string;
  /** Currency symbol if present after the digits, e.g. 'kr', 'zł' */
  suffixSymbol: string;
  /** ISO currency code if present, e.g. 'USD', 'EUR' */
  currencyCode: string;
  /** Suffix magnitude letter: 'K', 'M', 'B', 'T' or '' */
  magnitudeSuffix: string;
  /** Whether the numeric part contains a decimal point */
  hasDecimal: boolean;
  /** Number of decimal places (0-4) */
  decimalPlaces: number;
  /** Whether the numeric part uses comma thousands-separators */
  hasCommas: boolean;
  /** Number of integer digits before the decimal / end */
  integerDigits: number;
}

export interface PhoneFormat {
  /** Whether area code is wrapped in parentheses */
  hasParens: boolean;
  /** Primary separator between groups: '-', '.', ' ', or '' */
  separator: string;
  /** International prefix present, e.g. '+1', '+44' */
  intlPrefix: string;
  /** Total digit count (excluding +) */
  digitCount: number;
  /** Digit-group sizes, e.g. [3, 3, 4] for (555) 123-4567 */
  groupSizes: number[];
}

export type DetectedFormat =
  | { kind: 'ssn'; separator: string }
  | { kind: 'email'; hasPlus: boolean }
  | { kind: 'ipv4' }
  | { kind: 'date'; pattern: DatePattern }
  | { kind: 'credit_card'; network: 'visa' | 'mastercard' | 'amex' | 'discover' | 'generic'; separator: string; groupSizes: number[] }
  | { kind: 'phone'; fmt: PhoneFormat }
  | { kind: 'money'; fmt: MoneyFormat }
  | { kind: 'number' };

// ---------------------------------------------------------------------------
// Money format detection
// ---------------------------------------------------------------------------

const CURRENCY_PREFIX_RE = /^([€£¥₹₩₪₺₽฿₴₦$])/;
const CURRENCY_SUFFIX_RE = /(kr|zł|lei|din|лв)$/i;
const CURRENCY_CODE_RE = /\b(USD|EUR|GBP|CAD|AUD|CHF|JPY|CNY|INR|MXN|BRL|KRW|SGD|HKD|NOK|SEK|DKK)\b/i;
const MAGNITUDE_SUFFIX_RE = /([KMBTkmbt])$/;

function detectMoneyFormat(value: string): MoneyFormat | null {
  const stripped = value.trim();

  // Must start or end with a currency indicator, or end with a code
  const hasPrefixSymbol = CURRENCY_PREFIX_RE.test(stripped);
  const hasSuffixSymbol = CURRENCY_SUFFIX_RE.test(stripped);
  const hasCurrencyCode = CURRENCY_CODE_RE.test(stripped);

  if (!hasPrefixSymbol && !hasSuffixSymbol && !hasCurrencyCode) {
    // Also allow plain patterns like "$1,234.56" which already captured by hasPrefixSymbol
    return null;
  }

  const prefixSymbolMatch = stripped.match(CURRENCY_PREFIX_RE);
  const prefixSymbol = prefixSymbolMatch ? prefixSymbolMatch[1] : '';

  const suffixSymbolMatch = stripped.match(CURRENCY_SUFFIX_RE);
  const suffixSymbol = suffixSymbolMatch ? suffixSymbolMatch[1] : '';

  const codeMatch = stripped.match(CURRENCY_CODE_RE);
  const currencyCode = codeMatch ? codeMatch[1].toUpperCase() : '';

  // Strip currency markers to isolate the numeric part
  let numeric = stripped;
  if (prefixSymbol) numeric = numeric.slice(prefixSymbol.length);
  if (suffixSymbol) numeric = numeric.slice(0, numeric.length - suffixSymbol.length);
  if (currencyCode) numeric = numeric.replace(new RegExp(`\\s*${currencyCode}\\s*`, 'i'), '');
  numeric = numeric.trim();

  // Magnitude suffix (K/M/B/T) at the end of the numeric part
  const magnitudeMatch = numeric.match(MAGNITUDE_SUFFIX_RE);
  const magnitudeSuffix = magnitudeMatch ? magnitudeMatch[1].toUpperCase() : '';
  if (magnitudeSuffix) numeric = numeric.slice(0, numeric.length - 1).trim();

  // Must be numeric-ish at this point
  if (!/^[\d,.\s]+$/.test(numeric)) return null;

  const hasCommas = numeric.includes(',');
  const hasDecimal = numeric.includes('.');

  let decimalPlaces = 0;
  if (hasDecimal) {
    const parts = numeric.split('.');
    decimalPlaces = parts[parts.length - 1].length;
  }

  const integerPart = hasDecimal ? numeric.split('.')[0] : numeric;
  const integerDigits = integerPart.replace(/[,\s]/g, '').length;

  return {
    prefixSymbol,
    suffixSymbol,
    currencyCode,
    magnitudeSuffix,
    hasDecimal,
    decimalPlaces,
    hasCommas,
    integerDigits,
  };
}

// ---------------------------------------------------------------------------
// Phone format detection
// ---------------------------------------------------------------------------

function detectPhoneFormat(value: string): PhoneFormat | null {
  const stripped = value.trim();

  // Extract international prefix if present
  let rest = stripped;
  let intlPrefix = '';
  const intlMatch = rest.match(/^(\+\d{1,3})\s*/);
  if (intlMatch) {
    intlPrefix = intlMatch[1];
    rest = rest.slice(intlMatch[0].length);
  }

  // Must have at least 7 digits
  const allDigits = stripped.replace(/\D/g, '');
  if (allDigits.length < 7 || allDigits.length > 15) return null;

  // Check for leading open paren (area code in parens)
  const hasParens = rest.startsWith('(');

  // Detect separator: prefer dash, then dot, then space
  let separator = '';
  if (!hasParens) {
    if (rest.includes('-')) separator = '-';
    else if (rest.includes('.')) separator = '.';
    else if (rest.includes(' ')) separator = ' ';
  } else {
    // After closing paren
    const afterParen = rest.replace(/^\(\d+\)/, '').trim();
    if (afterParen.startsWith('-')) separator = '-';
    else if (afterParen.startsWith('.')) separator = '.';
    else if (afterParen.startsWith(' ') || afterParen.length === 0) separator = ' ';
  }

  // Compute group sizes by splitting on separator / parens
  let groupSizes: number[] = [];
  if (hasParens) {
    const parenMatch = rest.match(/^\((\d+)\)([\s\-.]?)(\d+)([\s\-.]?)(\d+)?/);
    if (parenMatch) {
      groupSizes.push(parenMatch[1].length);
      groupSizes.push(parenMatch[3].length);
      if (parenMatch[5]) groupSizes.push(parenMatch[5].length);
    }
  } else if (separator) {
    const parts = rest.split(separator);
    groupSizes = parts.map((p) => p.replace(/\D/g, '').length).filter((n) => n > 0);
  }

  if (groupSizes.length === 0) {
    // No separators — plain digit string
    const digits = rest.replace(/\D/g, '');
    groupSizes = [digits.length];
  }

  const intlDigitCount = intlPrefix.replace(/\D/g, '').length;
  const digitCount = allDigits.length - intlDigitCount;

  return { hasParens, separator, intlPrefix, digitCount, groupSizes };
}

// ---------------------------------------------------------------------------
// Date format detection
// ---------------------------------------------------------------------------

const DATE_PATTERNS: Array<{ re: RegExp; pattern: DatePattern }> = [
  { re: /^\d{4}-\d{2}-\d{2}$/, pattern: 'YYYY-MM-DD' },
  { re: /^\d{2}\/\d{2}\/\d{4}$/, pattern: 'MM/DD/YYYY' },
  { re: /^\d{2}-\d{2}-\d{4}$/, pattern: 'MM-DD-YYYY' },
  { re: /^\d{2}\.\d{2}\.\d{4}$/, pattern: 'DD.MM.YYYY' },
  { re: /^\d{4}\/\d{2}\/\d{2}$/, pattern: 'YYYY/MM/DD' },
  { re: /^\d{2}\/\d{2}\/\d{2}$/, pattern: 'MM/DD/YY' },
  { re: /^\d{1,2}\/\d{2}\/\d{4}$/, pattern: 'DD/MM/YYYY' },
  {
    re: /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}$/i,
    pattern: 'MMMM D YYYY',
  },
  {
    re: /^\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i,
    pattern: 'D MMMM YYYY',
  },
];

function detectDateFormat(value: string): DatePattern | null {
  const stripped = value.trim();
  for (const { re, pattern } of DATE_PATTERNS) {
    if (re.test(stripped)) return pattern;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Credit card network detection
// ---------------------------------------------------------------------------

function detectCCNetwork(
  digits: string,
): 'visa' | 'mastercard' | 'amex' | 'discover' | 'generic' {
  if (!digits) return 'generic';
  if (digits[0] === '4') return 'visa';
  if (digits[0] === '5' && '12345'.includes(digits[1] ?? '')) return 'mastercard';
  if (digits.startsWith('34') || digits.startsWith('37')) return 'amex';
  if (digits.startsWith('6011') || digits.startsWith('65')) return 'discover';
  return 'generic';
}

function detectCCGroupSizes(value: string): number[] {
  const parts = value.trim().split(/[\s\-]/);
  if (parts.length <= 1) return [];
  return parts.map((p) => p.replace(/\D/g, '').length).filter((n) => n > 0);
}

// ---------------------------------------------------------------------------
// SSN separator detection
// ---------------------------------------------------------------------------

function detectSSNSeparator(value: string): string {
  const stripped = value.trim();
  const nonDigits = stripped.replace(/\d/g, '');
  if (!nonDigits) return '';
  if (nonDigits.includes('-')) return '-';
  if (nonDigits.includes('.')) return '.';
  if (nonDigits.includes(' ')) return ' ';
  return nonDigits[0];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Attempt to classify a raw value string into a known format.
 * Returns a DetectedFormat descriptor, or null if no pattern matches.
 *
 * Order matches Python _FORMAT_HEURISTICS: specific before broad.
 */
export function detectFormat(value: string): DetectedFormat | null {
  const stripped = value.trim();
  if (!stripped) return null;

  // SSN: 3-2-4 with any of dash / dot / space separators, or 9 bare digits
  if (/^\d{3}[-.\s]\d{2}[-.\s]\d{4}$/.test(stripped)) {
    return { kind: 'ssn', separator: detectSSNSeparator(stripped) };
  }
  if (/^\d{9}$/.test(stripped)) {
    return { kind: 'ssn', separator: '' };
  }

  // Email
  if (/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(stripped)) {
    return { kind: 'email', hasPlus: stripped.split('@')[0].includes('+') };
  }

  // IPv4 — must come before phone to avoid false matches
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(stripped)) {
    return { kind: 'ipv4' };
  }

  // Date — before phone/number
  const datePat = detectDateFormat(stripped);
  if (datePat) return { kind: 'date', pattern: datePat };

  // Credit card: 13–19 digits with optional spaces/dashes
  if (/^\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{1,7}$/.test(stripped)) {
    const digits = stripped.replace(/\D/g, '');
    const network = detectCCNetwork(digits);
    const separator = stripped.includes('-') ? '-' : stripped.includes(' ') ? ' ' : '';
    const groupSizes = detectCCGroupSizes(stripped);
    return { kind: 'credit_card', network, separator, groupSizes };
  }

  // Money — before generic phone/number
  const moneyFmt = detectMoneyFormat(stripped);
  if (moneyFmt) return { kind: 'money', fmt: moneyFmt };

  // Phone: optional ( or +, then digit, then 7-15 digits with allowed chars
  if (/^[\(\+]?\d[\d\s\-\(\)\.]{6,17}$/.test(stripped)) {
    const phoneFmt = detectPhoneFormat(stripped);
    if (phoneFmt) return { kind: 'phone', fmt: phoneFmt };
  }

  // Bare number
  if (/^[\d,]+(\.\d+)?$/.test(stripped)) {
    return { kind: 'number' };
  }

  return null;
}

/**
 * Convenience re-export so callers can import everything from one place.
 */
export { detectCCNetwork, detectSSNSeparator };
