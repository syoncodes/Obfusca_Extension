/**
 * Types for the Obfusca local-first semantic detection pipeline.
 *
 * Architecture note (local-semantic-architecture.md §4.2):
 * - Tier 1 (this module): rule/dictionary-based NER — always on, bundled
 * - Tier 2 (future): quantized ONNX/WASM model — opt-in download
 *
 * Source field distinguishes which tier produced each detection so the
 * pipeline can weight and deduplicate across tiers.
 */

// ---------------------------------------------------------------------------
// Core detection types
// ---------------------------------------------------------------------------

export type SemanticEntityType =
  | 'person'
  | 'organization'
  | 'date'
  | 'medical'
  | 'address'
  | 'phone_conversational'
  | 'email_obfuscated';

export type SemanticSource = 'ner' | 'local_model' | 'regex';

export type ModelStatus = 'ready' | 'loading' | 'unavailable' | 'error';

// ---------------------------------------------------------------------------
// Detection result
// ---------------------------------------------------------------------------

/**
 * A single semantic entity detection.
 * Positions are character indices into the original input string.
 * No matched value is stored — only position, type, and confidence.
 */
export interface SemanticDetection {
  type: SemanticEntityType;
  displayName: string;
  start: number;
  end: number;
  confidence: number;
  source: SemanticSource;
}

// ---------------------------------------------------------------------------
// Semantic rules (for Tier 2 — custom rule instructions)
// ---------------------------------------------------------------------------

/**
 * A tenant-defined semantic detection rule.
 * Synced from backend GET /semantic-rules (control plane, no user content).
 * Used by Tier 2 (local model) to detect novel entity types via natural
 * language instructions. Tier 1 NERDetector ignores rules — it uses fixed
 * dictionaries and heuristics.
 */
export interface SemanticRule {
  id: string;
  name: string;
  detection_instruction: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  action: 'block' | 'redact' | 'warn' | 'allow';
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Detector interface
// ---------------------------------------------------------------------------

/**
 * Shared interface for all semantic detectors (Tier 1 NERDetector,
 * future Tier 2 ONNX model wrapper).
 */
export interface ISemanticDetector {
  /**
   * True when the detector can accept detect() calls.
   * For NERDetector (Tier 1) this is always true — no model loading needed.
   * For Tier 2 this reflects whether the ONNX session has initialized.
   */
  isReady(): boolean;

  /**
   * Detect semantic entities in text.
   * @param text     Input to scan. Matched values are NOT stored in results.
   * @param rules    Optional semantic rules (Tier 2 only — NERDetector ignores).
   * @returns        Array of non-overlapping SemanticDetection objects,
   *                 sorted by start position.
   */
  detect(text: string, rules?: SemanticRule[]): SemanticDetection[];

  /**
   * Current readiness state of the underlying model/runtime.
   */
  getModelStatus(): ModelStatus;
}
