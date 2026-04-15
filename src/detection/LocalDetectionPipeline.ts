/**
 * LocalDetectionPipeline (M9 prerequisite).
 *
 * Wraps the synchronous/async detection logic in detection.ts and adds an
 * action-determination layer that the LocalFileScanner (M11) consumes.
 *
 * No backend calls are made — all detection is performed locally using the
 * built-in regex patterns + cached custom patterns from chrome.storage.
 */

import { detectSensitiveData } from '../detection';
import type { Detection } from '../detection';
import type { PipelineResult } from './types';

/**
 * Map the highest detection severity to a DLP action.
 *   critical / high → block  (immediate stop)
 *   medium          → redact (offer redaction)
 *   low             → allow  (informational only — not currently surfaced)
 *   none            → allow
 */
function determineAction(detections: Detection[]): 'allow' | 'block' | 'redact' {
  if (detections.length === 0) return 'allow';

  for (const d of detections) {
    if (d.severity === 'critical' || d.severity === 'high') return 'block';
  }

  for (const d of detections) {
    if (d.severity === 'medium') return 'redact';
  }

  return 'allow';
}

export class LocalDetectionPipeline {
  /**
   * Run all local detection patterns against `text` and return a
   * PipelineResult with deduplicated, position-sorted detections.
   *
   * @param text - The plain text to scan (already extracted from the source).
   */
  async run(text: string): Promise<PipelineResult> {
    const detections = await detectSensitiveData(text);
    const action = determineAction(detections);
    return { detections, action, text };
  }
}
