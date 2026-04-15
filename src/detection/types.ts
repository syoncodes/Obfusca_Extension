/**
 * Shared types for the LocalDetectionPipeline (M9).
 *
 * Re-exports the core detection primitives from detection.ts and adds the
 * PipelineResult envelope returned by LocalDetectionPipeline.run().
 */

// Re-export core detection types so callers can import from one place.
export type { Detection, DetectionType, Severity } from '../detection';

import type { Detection } from '../detection';

/**
 * The result envelope returned by LocalDetectionPipeline.run().
 */
export interface PipelineResult {
  /** Every detection found in the text (position + type, no raw value). */
  detections: Detection[];
  /**
   * Recommended action based on the highest-severity detection.
   *   critical / high → block
   *   medium          → redact
   *   low / none      → allow
   */
  action: 'allow' | 'block' | 'redact';
  /** The original text that was scanned. */
  text: string;
}
