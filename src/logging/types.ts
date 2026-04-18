/**
 * Logging types for the EncryptedBypassLogger (Option B — structured evidence).
 *
 * Assumption: raw sensitive values are NEVER included in the outbound payload.
 * The BypassEvent carries them locally so the logger can derive fingerprint /
 * format / length, then discards them before transmission.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ──────────────────────────────────────────────────────────────────────────────

/** What the user had selected as their replacement preference before bypassing. */
export type ReplacementChosen = 'masked' | 'dummy' | 'keep';

// ──────────────────────────────────────────────────────────────────────────────
// Input types (contain raw values — stay on-device)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * A single detection as seen by the local extension runtime.
 * The `value` field contains the raw sensitive text and must NEVER be sent
 * to the backend — the EncryptedBypassLogger strips it before transmission.
 */
export interface RawBypassDetection {
  type: string;
  label?: string;
  severity: string;
  confidence: number;
  /** Raw sensitive value — used only to derive fingerprint / format / length. */
  value: string;
  /**
   * The replacement string that would have been used (e.g. '[SSN]' or a
   * dummy value). Used to infer replacement_chosen when not explicitly set.
   */
  replacement?: string;
  /**
   * Explicit replacement choice override. When provided, takes precedence
   * over inference from the replacement string.
   */
  replacementChosen?: ReplacementChosen;
}

/**
 * Input event passed to IBypassLogger.log().
 * Carries raw detection data so the logger can compute structured evidence,
 * then builds a privacy-safe payload for the API.
 */
export interface BypassEvent {
  /** Array of local detections with raw values. */
  detections: RawBypassDetection[];
  /** SHA-256 hex hash of the original content (pre-computed by caller). */
  contentHash: string;
  /** Source platform (e.g. 'chatgpt', 'claude', 'gemini'). */
  source: string;
  /** ISO timestamp; defaults to now if omitted. */
  timestamp?: string;
  /** Content type classification; defaults to 'text' if omitted. */
  content_type?: 'text' | 'file' | 'text_and_file';
  /** Files that were sent unprotected alongside the text. */
  files_bypassed?: BypassFileItem[];
}

export interface BypassFileItem {
  filename: string;
  size_bytes?: number;
  detections_count: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Output types (no raw values — safe to transmit)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Structured evidence for a single bypassed detection.
 * Contains enough information for incident review without revealing the value.
 */
export interface StructuredBypassDetection {
  type: string;
  label?: string;
  severity: string;
  confidence: number;
  /**
   * First 8 hex characters of the SHA-256 of the raw value.
   * Useful for correlating with external logs; not reversible.
   */
  value_fingerprint: string;
  /** Character length of the original value. */
  value_length: number;
  /**
   * Format template derived from the value shape.
   * Each digit is replaced with 'X'; non-digit characters are preserved.
   * Examples: '123-45-6789' → 'XXX-XX-XXXX', '$1.2M' → '$X.XM'
   */
  value_format: string;
  /** What the user had selected as their replacement preference. */
  replacement_chosen: ReplacementChosen;
}

/**
 * The privacy-safe payload sent to POST /events/bypass.
 * Mirrors the existing BypassEventPayload shape but replaces raw
 * BypassDetectionItem entries with StructuredBypassDetection.
 */
export interface EncryptedBypassPayload {
  source: string;
  content_type: 'text' | 'file' | 'text_and_file';
  detections_summary: {
    total_count: number;
    by_type: Record<string, number>;
    by_severity: Record<string, number>;
  };
  bypassed_detections: StructuredBypassDetection[];
  files_bypassed: BypassFileItem[];
  content_hash: string;
  timestamp: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Logger interface
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Bypass logger interface.
 * Implementors receive a BypassEvent (with raw values) and are responsible
 * for deriving structured evidence and transmitting the safe payload.
 */
export interface IBypassLogger {
  log(event: BypassEvent): Promise<void>;
}
