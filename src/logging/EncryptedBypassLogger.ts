/**
 * EncryptedBypassLogger — Option B (Structured Evidence Without Raw Values)
 *
 * Replaces raw sensitive values in bypass log payloads with structured
 * evidence fields: value_fingerprint, value_format, value_length, and
 * replacement_chosen.  No raw value is ever transmitted to the backend.
 *
 * See: /workspace/backend/docs/local-semantic-architecture.md §7.3
 */

import type {
  IBypassLogger,
  BypassEvent,
  StructuredBypassDetection,
  EncryptedBypassPayload,
  ReplacementChosen,
  RawBypassDetection,
} from './types';

// ──────────────────────────────────────────────────────────────────────────────
// Format inference (reused from M1 formatDetector pattern)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Derive a format template from a sensitive value.
 *
 * Rule: replace each decimal digit with 'X'; preserve every other character
 * (punctuation, letters, symbols) so that structural separators remain visible.
 *
 * Examples:
 *   '123-45-6789'        → 'XXX-XX-XXXX'   (SSN)
 *   '$1.2M'              → '$X.XM'          (money with suffix)
 *   '$123,456'           → '$XXX,XXX'       (money with commas)
 *   '4111-1111-1111-1111'→ 'XXXX-XXXX-XXXX-XXXX'  (credit card)
 *   '(555) 867-5309'     → '(XXX) XXX-XXXX'         (phone)
 *   'foo@bar.com'        → 'foo@bar.com'             (email — no digits, shape preserved)
 */
export function inferValueFormat(value: string): string {
  return value.replace(/\d/g, 'X');
}

// ──────────────────────────────────────────────────────────────────────────────
// SHA-256 fingerprint (Web Crypto API)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Compute the first 8 hex characters of the SHA-256 hash of the input string.
 *
 * Uses the Web Crypto API (crypto.subtle.digest) available in both Chrome
 * extension service workers (MV3) and modern Node.js (v15+).
 *
 * The truncated fingerprint is NOT reversible and NOT a full cryptographic
 * commitment — it is only a lightweight correlation aid for admins comparing
 * bypass events against external logs.
 */
export async function fingerprintValue(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexFull = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hexFull.slice(0, 8);
}

// ──────────────────────────────────────────────────────────────────────────────
// Replacement-choice inference
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Infer replacement_chosen from the replacement placeholder string.
 *
 * Heuristic:
 * - No replacement provided            → 'keep'   (user had no replacement selected)
 * - Replacement matches `[LABEL]`      → 'masked' (standard masked placeholder)
 * - Anything else                      → 'dummy'  (generated dummy value)
 */
export function inferReplacementChosen(replacement?: string): ReplacementChosen {
  if (!replacement || replacement.trim() === '') return 'keep';
  if (/^\[.+\]$/.test(replacement.trim())) return 'masked';
  return 'dummy';
}

// ──────────────────────────────────────────────────────────────────────────────
// Core logger
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Builds a structured, privacy-safe bypass event payload and POSTs it to
 * the Obfusca backend.  The raw sensitive value in each detection is used
 * only locally to compute fingerprint / format / length and is then discarded.
 */
export class EncryptedBypassLogger implements IBypassLogger {
  private readonly apiUrl: string;
  private readonly getAccessToken: () => Promise<string | null>;

  /**
   * @param apiUrl          Base URL of the Obfusca backend (no trailing slash).
   * @param getAccessToken  Async function that returns the current JWT or null.
   */
  constructor(apiUrl: string, getAccessToken: () => Promise<string | null>) {
    this.apiUrl = apiUrl;
    this.getAccessToken = getAccessToken;
  }

  /**
   * Transform a BypassEvent into a structured payload and send it.
   *
   * Steps:
   *   1. For each detection, compute fingerprint / format / length from the raw value.
   *   2. Build EncryptedBypassPayload — no raw value field present.
   *   3. Obtain the access token; bail out (with warning) if unavailable.
   *   4. POST to /events/bypass.
   */
  async log(event: BypassEvent): Promise<void> {
    const structuredDetections: StructuredBypassDetection[] = await Promise.all(
      event.detections.map((d: RawBypassDetection) => this._structureDetection(d)),
    );

    const payload = this._buildPayload(event, structuredDetections);

    const token = await this.getAccessToken();
    if (!token) {
      console.warn('[EncryptedBypassLogger] No access token — bypass event not logged');
      return;
    }

    try {
      const response = await fetch(`${this.apiUrl}/events/bypass`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        console.error(
          '[EncryptedBypassLogger] Failed to log bypass event:',
          response.status,
          detail,
        );
      }
    } catch (err) {
      console.error('[EncryptedBypassLogger] Error sending bypass event:', err);
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async _structureDetection(
    d: RawBypassDetection,
  ): Promise<StructuredBypassDetection> {
    const fingerprint = await fingerprintValue(d.value);
    const structured: StructuredBypassDetection = {
      type: d.type,
      severity: d.severity,
      confidence: d.confidence,
      value_fingerprint: fingerprint,
      value_length: d.value.length,
      value_format: inferValueFormat(d.value),
      replacement_chosen: d.replacementChosen ?? inferReplacementChosen(d.replacement),
    };
    // Only include label if defined (avoids spurious undefined keys in JSON)
    if (d.label !== undefined) {
      structured.label = d.label;
    }
    return structured;
  }

  private _buildPayload(
    event: BypassEvent,
    structuredDetections: StructuredBypassDetection[],
  ): EncryptedBypassPayload {
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const d of structuredDetections) {
      byType[d.type] = (byType[d.type] ?? 0) + 1;
      bySeverity[d.severity] = (bySeverity[d.severity] ?? 0) + 1;
    }

    const filesBypassed = event.files_bypassed ?? [];
    const fileDetectionCount = filesBypassed.reduce(
      (sum, f) => sum + f.detections_count,
      0,
    );

    return {
      source: event.source,
      content_type: event.content_type ?? 'text',
      detections_summary: {
        total_count: structuredDetections.length + fileDetectionCount,
        by_type: byType,
        by_severity: bySeverity,
      },
      bypassed_detections: structuredDetections,
      files_bypassed: filesBypassed,
      content_hash: event.contentHash,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };
  }
}
