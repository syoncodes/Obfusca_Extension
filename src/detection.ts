import { detectWithNERModel } from "./nerModelBridge";
import { detectWithWebLLM, isWebGPUAvailable } from "./webllmDetector";
import { applyContextProximityScoring } from "./contextProximityScorer";
import { applyContextClassification } from "./contextClassifier";
/**
 * Fast local detection patterns for sensitive data.
 * Ported from backend/app/detection/patterns.py
 *
 * SECURITY PRINCIPLES:
 * 1. Detection results never contain the actual matched value
 * 2. Only position, type, and confidence are returned
 *
 * CUSTOM PATTERN SUPPORT:
 * Custom patterns are synced from the backend and cached in chrome.storage.local.
 * An in-memory cache is maintained for synchronous quick checks.
 * Both mightContainSensitiveData() and detectSensitiveData() check custom patterns.
 */

export type DetectionType =
  | 'ssn'
  | 'credit_card'
  | 'aws_key'
  | 'aws_secret'
  | 'api_key'
  | 'private_key'
  | 'email'
  | 'phone'
  | 'jwt'
  | 'connection_string'
  | 'person_name'
  | 'organization'
  | 'date'
  | 'address'
  | 'medical_record'
  | 'financial'
  | 'identity_document'
  | 'ip_address'
  | 'custom'; // For custom tenant patterns

export type Severity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Custom pattern from the backend (cached in storage).
 */
interface CachedCustomPattern {
  id: string;
  name: string;
  pattern_type: 'regex' | 'keyword_list' | 'semantic';
  pattern_value: string;
  severity: Severity;
  action: 'block' | 'redact' | 'warn' | 'allow';
  enabled: boolean;
  category?: string;
}

// =============================================================================
// In-Memory Custom Pattern Cache (for synchronous quick checks)
// =============================================================================

/**
 * In-memory cache of custom patterns for synchronous access.
 * Populated from chrome.storage.local and updated when patterns sync.
 */
let inMemoryCustomPatterns: CachedCustomPattern[] = [];

/**
 * Load custom patterns from storage into memory.
 * Call this on content script initialization and after pattern syncs.
 */
export function loadCustomPatternsIntoMemory(): void {
  chrome.storage.local.get(['customPatterns'], (result) => {
    const patterns = result.customPatterns;
    if (Array.isArray(patterns)) {
      inMemoryCustomPatterns = patterns;
      console.log(`[Obfusca Detection] Loaded ${patterns.length} custom patterns into memory`);
    } else {
      inMemoryCustomPatterns = [];
      console.log('[Obfusca Detection] No custom patterns found in storage');
    }
  });
}

/**
 * Listen for storage changes to keep in-memory cache in sync.
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.customPatterns) {
    const newPatterns = changes.customPatterns.newValue;
    if (Array.isArray(newPatterns)) {
      inMemoryCustomPatterns = newPatterns;
      console.log(`[Obfusca Detection] Custom patterns updated in memory: ${newPatterns.length} patterns`);
    } else {
      inMemoryCustomPatterns = [];
      console.log('[Obfusca Detection] Custom patterns cleared from memory');
    }
  }
});

// Load patterns on module initialization
loadCustomPatternsIntoMemory();

export interface Detection {
  type: DetectionType;
  displayName: string;
  severity: Severity;
  start: number;
  end: number;
  confidence: number;
}

interface Pattern {
  name: string;
  type: DetectionType;
  severity: Severity;
  regex: RegExp;
  confidence: number;
  validator?: (match: string) => boolean;
}

/**
 * Luhn checksum validation for credit card numbers.
 */
function luhnChecksum(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '').split('').map(Number);

  if (digits.length < 13) {
    return false;
  }

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = digits[i];

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * Additional SSN validation beyond regex.
 * SSN cannot start with 000, 666, or 900-999.
 */
function isValidSSN(ssn: string): boolean {
  const digits = ssn.replace(/\D/g, '');

  if (digits.length !== 9) {
    return false;
  }

  const area = parseInt(digits.substring(0, 3), 10);
  const group = parseInt(digits.substring(3, 5), 10);
  const serial = parseInt(digits.substring(5), 10);

  // Invalid area numbers
  if (area === 0 || area === 666 || (area >= 900 && area <= 999)) {
    return false;
  }

  // Group number cannot be 00
  if (group === 0) {
    return false;
  }

  // Serial number cannot be 0000
  if (serial === 0) {
    return false;
  }

  return true;
}

/**
 * Validate AWS Access Key ID format.
 */
function isValidAWSKey(key: string): boolean {
  const trimmed = key.trim();

  if (trimmed.length !== 20) {
    return false;
  }

  const prefixes = ['AKIA', 'ABIA', 'ACCA', 'ASIA'];
  if (!prefixes.some((p) => trimmed.startsWith(p))) {
    return false;
  }

  // Rest must be uppercase alphanumeric
  return /^[A-Z0-9]{16}$/.test(trimmed.substring(4));
}

/**
 * Detection patterns - subset for fast local checks.
 * Prioritized for MVP: SSN, credit cards, AWS keys, generic API keys.
 */
const PATTERNS: Pattern[] = [
  // SSN: XXX-XX-XXXX format (with various separators)
  {
    name: 'US Social Security Number',
    type: 'ssn',
    severity: 'critical',
    regex: /\b(\d{3}[-.\s]?\d{2}[-.\s]?\d{4})\b/g,
    confidence: 0.95,
    validator: isValidSSN,
  },

  // Credit Card Numbers - Visa, Mastercard, Amex, Discover
  {
    name: 'Credit Card Number',
    type: 'credit_card',
    severity: 'critical',
    regex: new RegExp(
      '\\b(' +
        '4[0-9]{3}[-\\s]?[0-9]{4}[-\\s]?[0-9]{4}[-\\s]?[0-9]{4}|' + // Visa
        '5[1-5][0-9]{2}[-\\s]?[0-9]{4}[-\\s]?[0-9]{4}[-\\s]?[0-9]{4}|' + // Mastercard
        '3[47][0-9]{2}[-\\s]?[0-9]{6}[-\\s]?[0-9]{5}|' + // Amex
        '6(?:011|5[0-9]{2})[-\\s]?[0-9]{4}[-\\s]?[0-9]{4}[-\\s]?[0-9]{4}' + // Discover
        ')\\b',
      'g'
    ),
    confidence: 0.9,
    validator: luhnChecksum,
  },

  // AWS Access Key ID
  {
    name: 'AWS Access Key',
    type: 'aws_key',
    severity: 'critical',
    regex: /\b((?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16})\b/g,
    confidence: 0.98,
    validator: isValidAWSKey,
  },

  // Generic API Keys - sk-... (OpenAI style, hyphen separator).
  // Stripe-style keys (sk_live_/sk_test_) use underscores and are covered by
  // the dedicated Stripe pattern below.  The negative lookahead makes the
  // exclusion explicit even though sk- (hyphen) can never match sk_ (underscore).
  {
    name: 'API Key (sk- prefix)',
    type: 'api_key',
    severity: 'high',
    regex: /\b(sk-(?!live_|test_)[A-Za-z0-9]{20,})\b/g,
    confidence: 0.95,
  },

  // Generic api_key= or apikey= patterns
  {
    name: 'API Key (generic)',
    type: 'api_key',
    severity: 'high',
    regex:
      /(?:api[_-]?key|apikey|api[_-]?secret|apisecret)[\s]*[=:"'][\s]*([A-Za-z0-9_\-]{20,64})/gi,
    confidence: 0.8,
  },

  // Private Keys (PEM format)
  // Matches RSA, EC, DSA, OPENSSH, ENCRYPTED, PGP, and generic PKCS#8 private keys
  {
    name: 'Private Key',
    type: 'private_key',
    severity: 'critical',
    regex: /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+|ENCRYPTED\s+|PGP\s+)?PRIVATE\s+KEY(?:\s+BLOCK)?-----/g,
    confidence: 0.99,
  },

  // GitHub Personal Access Token
  {
    name: 'GitHub Token',
    type: 'api_key',
    severity: 'high',
    regex: /\b(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59})\b/g,
    confidence: 0.99,
  },

  // Email addresses
  {
    name: 'Email Address',
    type: 'email',
    severity: 'low',
    regex: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    confidence: 0.99,
  },

  // AWS Secret Access Key (value after common key-name prefixes)
  {
    name: 'AWS Secret Access Key',
    type: 'aws_secret',
    severity: 'critical',
    regex: /(?:aws_secret_access_key|secret_access_key|SecretAccessKey)[\s]*[=:"'][\s]*["']*([A-Za-z0-9\/+=]{20,50})/gi,
    confidence: 0.85,
  },

  // Stripe secret/publishable/restricted keys: sk_live_*, sk_test_*, pk_live_*, pk_test_*, rk_live_*, rk_test_*
  {
    name: 'Stripe API Key',
    type: 'api_key',
    severity: 'high',
    regex: /\b((?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,})\b/g,
    confidence: 0.99,
  },

  // Bearer tokens
  {
    name: 'Bearer Token',
    type: 'api_key',
    severity: 'high',
    regex: /[Bb]earer[\s]+([A-Za-z0-9_\-.]{20,})/g,
    confidence: 0.85,
  },

  // Slack tokens (xoxb- bot, xoxp- user, xoxa- app, xoxr- refresh, xoxs- service)
  {
    name: 'Slack Token',
    type: 'api_key',
    severity: 'high',
    regex: /\b(xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9\-]*)\b/g,
    confidence: 0.98,
  },
  // Phone numbers (US formats)
  {
    name: 'Phone Number',
    type: 'phone',
    severity: 'medium',
    regex: /\b(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b/g,
    confidence: 0.85,
  },
  // IP addresses (IPv4)
  {
    name: 'IP Address',
    type: 'ip_address',
    severity: 'medium',
    regex: /\b((?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))\b/g,
    confidence: 0.90,
  },
  // Database connection strings
  {
    name: 'Database Connection String',
    type: 'connection_string',
    severity: 'critical',
    regex: /(?:(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|mssql):\/\/[^\s'"]+)/gi,
    confidence: 0.95,
  },
  // JWT tokens
  {
    name: 'JWT Token',
    type: 'jwt',
    severity: 'high',
    regex: /\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
    confidence: 0.98,
  },
  // Generic secrets in key=value format
  {
    name: 'Secret in Config',
    type: 'api_key',
    severity: 'high',
    regex: /(?:password|passwd|secret|token|auth)[\s]*[=:][\s]*["']?([^\s"']{8,64})["']?/gi,
    confidence: 0.75,
  },
];

/**
 * Run built-in patterns against the given text (synchronous).
 * Used internally - call detectSensitiveData() for full detection including custom patterns.
 */
function detectBuiltInPatterns(text: string): Detection[] {
  const detections: Detection[] = [];

  for (const pattern of PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(text)) !== null) {
      const matchedText = match[0];
      console.log(`[Obfusca Detection] Pattern "${pattern.name}" matched at position ${match.index}`);

      // Apply validator if present
      if (pattern.validator && !pattern.validator(matchedText)) {
        console.log(`[Obfusca Detection] Pattern "${pattern.name}" failed validation, skipping`);
        continue;
      }

      // Calculate confidence boost for validated matches
      const confidence = pattern.validator
        ? Math.min(1.0, pattern.confidence + 0.02)
        : pattern.confidence;

      const detection: Detection = {
        type: pattern.type,
        displayName: pattern.name,
        severity: pattern.severity,
        start: match.index,
        end: match.index + matchedText.length,
        confidence,
      };

      console.log(`[Obfusca Detection] Detection added:`, {
        type: detection.type,
        displayName: detection.displayName,
        severity: detection.severity,
        position: `${detection.start}-${detection.end}`,
        confidence: detection.confidence,
      });

      detections.push(detection);
    }
  }

  return detections;
}

/**
 * Run custom patterns against the given text.
 * Returns detections for all matching custom patterns.
 */
function detectCustomPatterns(text: string, customPatterns: CachedCustomPattern[]): Detection[] {
  const detections: Detection[] = [];
  const textLower = text.toLowerCase();

  for (const cp of customPatterns) {
    if (!cp.enabled) {
      continue;
    }

    try {
      if (cp.pattern_type === 'keyword_list') {
        // Parse JSON array of keywords and find all matches
        const keywords: string[] = JSON.parse(cp.pattern_value);

        for (const keyword of keywords) {
          const keywordLower = keyword.toLowerCase();
          let searchIndex = 0;

          // Find all occurrences of this keyword
          while (true) {
            const foundIndex = textLower.indexOf(keywordLower, searchIndex);
            if (foundIndex === -1) break;

            const detection: Detection = {
              type: 'custom',
              displayName: cp.name,
              severity: cp.severity,
              start: foundIndex,
              end: foundIndex + keyword.length,
              confidence: 0.9, // Keyword matches have high confidence
            };

            console.log(`[Obfusca Detection] Custom keyword pattern "${cp.name}" matched at position ${foundIndex}`);
            detections.push(detection);

            // Move past this match to find more
            searchIndex = foundIndex + 1;
          }
        }
      } else if (cp.pattern_type === 'regex') {
        // Compile regex and find all matches
        const regex = new RegExp(cp.pattern_value, 'gi'); // Global + case-insensitive
        let match: RegExpExecArray | null;

        while ((match = regex.exec(text)) !== null) {
          const detection: Detection = {
            type: 'custom',
            displayName: cp.name,
            severity: cp.severity,
            start: match.index,
            end: match.index + match[0].length,
            confidence: 0.85, // Regex matches slightly lower confidence
          };

          console.log(`[Obfusca Detection] Custom regex pattern "${cp.name}" matched at position ${match.index}`);
          detections.push(detection);

          // Prevent infinite loop for zero-length matches
          if (match[0].length === 0) {
            regex.lastIndex++;
          }
        }
      }
    } catch (e) {
      // Skip invalid patterns (bad JSON or invalid regex)
      console.warn(`[Obfusca Detection] Invalid custom pattern "${cp.name}":`, e);
    }
  }

  return detections;
}

/**
 * Run all patterns (built-in + custom) against the given text.
 * Returns an array of detections with positions and types.
 *
 * ASYNC: This function is async because it needs to access chrome.storage
 * to get cached custom patterns.
 *
 * SECURITY NOTE: Matched values are NOT included in results.
 */
export async function detectSensitiveData(text: string): Promise<Detection[]> {
  console.log('[Obfusca Detection] detectSensitiveData: Scanning', text.length, 'characters');

  // Run built-in patterns (synchronous, fast)
  const builtInDetections = detectBuiltInPatterns(text);
  console.log(`[Obfusca Detection] Built-in patterns found ${builtInDetections.length} detections`);

  // Run custom patterns (requires storage access)
  let customDetections: Detection[] = [];
  try {
    const customPatterns = await getCachedCustomPatterns();
    if (customPatterns.length > 0) {
      console.log(`[Obfusca Detection] Checking ${customPatterns.length} custom patterns`);
      customDetections = detectCustomPatterns(text, customPatterns);
      console.log(`[Obfusca Detection] Custom patterns found ${customDetections.length} detections`);
    }
  } catch (err) {
    console.error('[Obfusca Detection] Error detecting custom patterns:', err);
    // Continue without custom pattern detections on error
  }

  // Always run Layer 2 context scoring (regex + proximity patterns)
  // This catches: salary amounts, addresses, medical phrases, person names with titles
  const allLocal = [...builtInDetections, ...customDetections];

  // Try WebLLM for contextual detection (names, ambiguous PII)
  let webllmAvailable = false;
  try {
    webllmAvailable = await isWebGPUAvailable();
  } catch { }

  if (webllmAvailable) {
    console.log('[Obfusca Detection] Using WebLLM + Layer 2 hybrid');
    try {
      const webllmDetections = await detectWithWebLLM(text);
      if (webllmDetections.length > 0) {
        console.log(`[Obfusca Detection] WebLLM found ${webllmDetections.length} detections`);
      }

      // Also run NER + Layer 2 for structured patterns WebLLM might miss
      let nerDetections: Detection[] = [];
      try {
        nerDetections = await detectWithNERModel(text);
      } catch { }
      const nerAndL2 = applyContextProximityScoring(text, [...allLocal, ...nerDetections]);

      // Merge WebLLM + NER/L2, deduplicate by position overlap
      const merged = [...nerAndL2];
      for (const wd of webllmDetections) {
        const overlaps = merged.some(
          (d) => (wd.start >= d.start && wd.start < d.end) ||
                 (wd.end > d.start && wd.end <= d.end) ||
                 (wd.start <= d.start && wd.end >= d.end),
        );
        if (!overlaps) merged.push(wd);
      }

      // Run Layer 3 on ambiguous detections
      const finalDetections = await applyContextClassification(text, merged);
      finalDetections.sort((a, b) => a.start - b.start);
      console.log(`[Obfusca Detection] detectSensitiveData: Found ${finalDetections.length} total detections (WebLLM hybrid path)`);
      return finalDetections;
    } catch (err) {
      console.log('[Obfusca Detection] WebLLM failed, falling back to NER pipeline:', err);
    }
  }

  // Fallback: NER + Layer 2 + Layer 3 (for systems without WebGPU)
  console.log('[Obfusca Detection] Using NER fallback pipeline');
  let nerDetections: Detection[] = [];
  try {
    nerDetections = await detectWithNERModel(text);
    if (nerDetections.length > 0) {
      console.log(`[Obfusca Detection] NER model found ${nerDetections.length} detections`);
    }
  } catch (err) {
    console.log("[Obfusca Detection] NER model skipped:", err);
  }
  const allDetections = [...builtInDetections, ...customDetections, ...nerDetections];
  const scoredDetections = applyContextProximityScoring(text, allDetections);
  const finalDetections = await applyContextClassification(text, scoredDetections);
  console.log(`[Obfusca Detection] detectSensitiveData: Found ${finalDetections.length} total detections (NER fallback path)`);
  return finalDetections;
}

/**
 * Quick SYNCHRONOUS check for built-in patterns AND in-memory custom patterns.
 * Used by the interceptor for immediate blocking decisions.
 *
 * Uses the in-memory cache of custom patterns (loaded from storage on init
 * and kept in sync via storage change listener).
 */
export function mightContainSensitiveDataSync(text: string): boolean {
  // Quick heuristics before running full regex
  if (text.length < 3) {
    return false;
  }

  // Check built-in patterns first (very fast)
  if (text.length >= 8) {
    // Check for number sequences that might be SSN or credit card
    if (/\d{3}[-.\s]?\d{2}[-.\s]?\d{4}/.test(text)) {
      return true;
    }

    // Check for credit card patterns (starts with 3, 4, 5, 6)
    if (/[3456]\d{3}[-\s]?\d{4}/.test(text)) {
      return true;
    }

    // Check for AWS key prefix
    if (/AKIA|ABIA|ACCA|ASIA/.test(text)) {
      return true;
    }

    // Check for sk- prefix (OpenAI, Stripe)
    if (/sk-[A-Za-z0-9]{10,}/.test(text)) {
      return true;
    }

    // Check for private key marker
    if (text.includes('BEGIN') && text.includes('PRIVATE KEY')) {
      return true;
    }

    // Check for api_key patterns
    if (/api[_-]?key|apikey/i.test(text)) {
      return true;
    }

    // Check for email address (@domain.tld pattern)
    if (/\b[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(text)) {
      return true;
    }

    // Check for Stripe key prefixes (sk_live_, sk_test_, pk_live_, pk_test_, etc.)
    if (/(?:sk|pk|rk)_(?:live|test)_/.test(text)) {
      return true;
    }

    // Check for Slack token prefixes (xoxb-, xoxp-, etc.)
    if (/xox[baprs]-/.test(text)) {
      return true;
    }

    // Check for AWS secret access key keywords
    if (/aws_secret_access_key|secret_access_key|SecretAccessKey/i.test(text)) {
      return true;
    }

    // Check for Bearer token pattern
    if (/[Bb]earer\s+[A-Za-z0-9_\-.]{20,}/.test(text)) {
      return true;
    }
  }

  // Check in-memory custom patterns (loaded from storage, kept in sync)
  if (inMemoryCustomPatterns.length > 0) {
    for (const cp of inMemoryCustomPatterns) {
      if (!cp.enabled) continue;

      if (matchesCustomPatternSync(text, cp)) {
        console.log(`[Obfusca Detection] SYNC: Custom pattern "${cp.name}" matched`);
        return true;
      }
    }
  }

  return false;
}

/**
 * Synchronous check if text matches a custom pattern.
 * Used by mightContainSensitiveDataSync for quick in-memory checks.
 */
function matchesCustomPatternSync(text: string, pattern: CachedCustomPattern): boolean {
  try {
    if (pattern.pattern_type === 'keyword_list') {
      // Parse JSON array of keywords
      const keywords: string[] = JSON.parse(pattern.pattern_value);
      const textLower = text.toLowerCase();
      return keywords.some((kw) => textLower.includes(kw.toLowerCase()));
    } else if (pattern.pattern_type === 'regex') {
      // Test regex pattern (case-insensitive)
      const regex = new RegExp(pattern.pattern_value, 'i');
      return regex.test(text);
    }
  } catch (e) {
    // Skip invalid patterns (bad JSON or invalid regex)
    // Don't log here to avoid spam during sync checks
  }

  return false;
}

/**
 * Get cached custom patterns from chrome.storage.local.
 */
async function getCachedCustomPatterns(): Promise<CachedCustomPattern[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['customPatterns'], (result) => {
      const patterns = result.customPatterns;
      if (Array.isArray(patterns)) {
        resolve(patterns);
      } else {
        resolve([]);
      }
    });
  });
}

/**
 * Check if text matches any custom pattern.
 * Returns true if any enabled custom pattern matches.
 */
function matchesCustomPattern(text: string, pattern: CachedCustomPattern): boolean {
  if (!pattern.enabled) {
    return false;
  }

  try {
    if (pattern.pattern_type === 'keyword_list') {
      // Parse JSON array of keywords
      const keywords: string[] = JSON.parse(pattern.pattern_value);
      const textLower = text.toLowerCase();
      return keywords.some((kw) => textLower.includes(kw.toLowerCase()));
    } else if (pattern.pattern_type === 'regex') {
      // Test regex pattern (case-insensitive)
      const regex = new RegExp(pattern.pattern_value, 'i');
      return regex.test(text);
    }
  } catch (e) {
    // Skip invalid patterns (bad JSON or invalid regex)
    console.warn(`[Obfusca Detection] Invalid custom pattern "${pattern.name}":`, e);
  }

  return false;
}

/**
 * Quick check if text might contain sensitive data.
 * Checks both built-in patterns AND cached custom patterns.
 *
 * ASYNC: This function is async because it needs to access chrome.storage
 * to get cached custom patterns.
 */
export async function mightContainSensitiveData(text: string): Promise<boolean> {
  console.log('[Obfusca Detection] mightContainSensitiveData: Quick scan of', text.length, 'chars');

  // Quick heuristics before running full regex
  if (text.length < 3) {
    console.log('[Obfusca Detection] mightContainSensitiveData: Text too short (<3 chars), returning false');
    return false;
  }

  // Check built-in patterns first (fast, synchronous)
  if (mightContainSensitiveDataSync(text)) {
    console.log('[Obfusca Detection] mightContainSensitiveData: Built-in pattern matched');
    return true;
  }

  // Check cached custom patterns
  try {
    const customPatterns = await getCachedCustomPatterns();
    if (customPatterns.length > 0) {
      console.log(`[Obfusca Detection] mightContainSensitiveData: Checking ${customPatterns.length} custom patterns`);

      for (const cp of customPatterns) {
        if (matchesCustomPattern(text, cp)) {
          console.log(`[Obfusca Detection] mightContainSensitiveData: Custom pattern "${cp.name}" matched`);
          return true;
        }
      }
    }
  } catch (err) {
    console.error('[Obfusca Detection] mightContainSensitiveData: Error checking custom patterns:', err);
    // Continue without custom patterns on error
  }

  console.log('[Obfusca Detection] mightContainSensitiveData: No sensitive patterns found');
  return false;
}

/**
 * Get a human-readable summary of detections.
 */
export function getDetectionSummary(detections: Detection[]): string {
  if (detections.length === 0) {
    return 'No sensitive data detected';
  }

  const types = [...new Set(detections.map((d) => d.displayName))];

  if (types.length === 1) {
    return `${types[0]} detected`;
  }

  return `${types.length} types of sensitive data detected: ${types.join(', ')}`;
}
