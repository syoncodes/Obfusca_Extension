/**
 * Types for the Obfusca local-first semantic detection pipeline.
 *
 * Architecture note (local-semantic-architecture.md §4.2):
 * - Tier 1 (this module): rule/dictionary-based NER — always on, bundled
 * - Tier 2 (ModelLoader + ONNXSemanticDetector): quantized ONNX/WASM model
 *   — opt-in download, lazy init
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

/**
 * Simple readiness state used by Tier 1 (NERDetector) and returned by
 * ISemanticDetector.getModelStatus().
 * Tier 2 uses the richer ModelLoadStatus discriminated union (see below).
 */
export type ModelStatus = 'ready' | 'loading' | 'unavailable' | 'error';

// ---------------------------------------------------------------------------
// Detection result
// ---------------------------------------------------------------------------

/**
 * A single semantic entity detection.
 * Positions are character indices into the original input string.
 * No matched value is stored — only position, type, and confidence.
 *
 * `type` is `string` (superset of SemanticEntityType) so Tier 2 can return
 * arbitrary rule-based entity names without widening SemanticEntityType.
 */
export interface SemanticDetection {
  type: string;
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
// Detector interface (Tier 1 — synchronous)
// ---------------------------------------------------------------------------

/**
 * Shared interface for all semantic detectors (Tier 1 NERDetector,
 * Tier 2 ONNX model wrapper, and the NoOpSemanticDetector fallback).
 *
 * detect() is synchronous for Tier 1 (dictionary lookups are instant).
 * Tier 2 detectors that need async inference implement IAsyncSemanticDetector
 * (exported from ONNXSemanticDetector.ts).
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
   * @returns        Array of SemanticDetection objects sorted by start position.
   */
  detect(text: string, rules?: SemanticRule[]): SemanticDetection[];

  /**
   * Current readiness state of the underlying model/runtime.
   */
  getModelStatus(): ModelStatus;
}

// ---------------------------------------------------------------------------
// Tier 2: model loading types (ModelLoader + ONNXSemanticDetector)
// ---------------------------------------------------------------------------

/** Configuration required to load a specific model version. */
export interface ModelConfig {
  /** Full CDN URL to the ONNX model binary. */
  url: string;
  /** Expected lowercase hex SHA-256 digest of the model binary. */
  expectedSha256: string;
  /** Stable identifier for this model (e.g. "smollm2-360m-dlp"). */
  modelId: string;
  /** Semantic version string (e.g. "1.0.0"). */
  version: string;
}

/**
 * Rich discriminated union for the Tier 2 model download lifecycle.
 * Distinct from ModelStatus (Tier 1 string union) to carry progress / version
 * data without changing the existing Tier 1 interface.
 *
 * Transitions:
 *   not_downloaded → downloading → ready
 *   not_downloaded → error
 *   downloading    → error
 *   ready          → not_downloaded  (after clearCache)
 */
export type ModelLoadStatus =
  | { state: 'not_downloaded' }
  | { state: 'downloading'; progress: number } // 0–1
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string };

/** Progress callback fired during chunked model download. */
export type DownloadProgressCallback = (bytesReceived: number, totalBytes: number) => void;

// ---------------------------------------------------------------------------
// Tokenizer interface (wired in by a future mission when the model ships)
// ---------------------------------------------------------------------------

/**
 * Minimal tokenizer contract.
 * Concrete implementation will be provided with the model bundle.
 */
export interface TextTokenizer {
  encode(text: string): { input_ids: number[]; attention_mask: number[] };
  decode(ids: number[]): string;
}
