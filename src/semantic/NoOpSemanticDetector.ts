/**
 * NoOpSemanticDetector — always-ready implementation of IAsyncSemanticDetector
 * that returns empty detections.
 *
 * Used when:
 *  - WebAssembly is disabled in the host environment (enterprise lockdown).
 *  - The user has not yet downloaded the Tier 2 ONNX model.
 *  - A safe fallback is needed during unit tests.
 *
 * isReady() returns true unconditionally — the no-op detector is immediately
 * usable and never blocks the detection pipeline.
 *
 * See: /docs/local-semantic-architecture.md §3 (P6 — Degrade gracefully),
 *       §11.5 (WebAssembly availability).
 */

import type {
  ModelLoadStatus,
  SemanticDetection,
  SemanticRule,
} from './types';
import type { IAsyncSemanticDetector } from './ONNXSemanticDetector';

export class NoOpSemanticDetector implements IAsyncSemanticDetector {
  /**
   * Always returns true.
   * The no-op detector is ready immediately — it just never finds anything.
   */
  isReady(): boolean {
    return true;
  }

  /**
   * Always resolves with an empty array.
   * Never throws; safe to await unconditionally.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async detect(_text: string, _rules?: SemanticRule[]): Promise<SemanticDetection[]> {
    return [];
  }

  /**
   * Returns 'not_downloaded' — the no-op detector has no model.
   * Callers can use this to show a "download the AI model" prompt in the UI.
   */
  getModelStatus(): ModelLoadStatus {
    return { state: 'not_downloaded' };
  }
}
