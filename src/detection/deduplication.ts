/**
 * Detection merging and deduplication for the LocalDetectionPipeline.
 *
 * Rules:
 *  1. Same type + overlap > 50%  → keep the higher-confidence detection only.
 *  2. Different type + any overlap → keep both (a span can be a name AND a
 *     medical term; dropping either would be a false negative).
 *  3. Output is sorted ascending by start position.
 *
 * "Overlap fraction" is computed relative to the *shorter* span so that a
 * detection fully contained inside another registers as 100% overlap.
 */

import type { Detection } from '../detection';
import type {
  MergedDetection,
  NERDetection,
  SemanticDetection,
} from './types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns the fraction of the shorter span that overlaps with the other span.
 * Range: [0, 1]. Returns 0 for non-overlapping or zero-length spans.
 */
function overlapFraction(
  a: { start: number; end: number },
  b: { start: number; end: number },
): number {
  const overlapStart = Math.max(a.start, b.start);
  const overlapEnd = Math.min(a.end, b.end);

  if (overlapEnd <= overlapStart) return 0;

  const overlapLen = overlapEnd - overlapStart;
  const minSpanLen = Math.min(a.end - a.start, b.end - b.start);

  return minSpanLen === 0 ? 0 : overlapLen / minSpanLen;
}

/** Lift a regex Detection into a MergedDetection with source='regex'. */
function fromRegex(d: Detection): MergedDetection {
  return {
    type: d.type,
    displayName: d.displayName,
    start: d.start,
    end: d.end,
    confidence: d.confidence,
    severity: d.severity,
    source: 'regex',
  };
}

/** Lift a NERDetection into a MergedDetection with source='ner'. */
function fromNER(d: NERDetection): MergedDetection {
  return { ...d, source: 'ner' };
}

/** Lift a SemanticDetection into a MergedDetection with source='semantic'. */
function fromSemantic(d: SemanticDetection): MergedDetection {
  return { ...d, source: 'semantic' };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Merge and deduplicate detections from all three pipeline stages.
 *
 * Processing order: regex → NER → semantic. Later-stage detections that
 * represent the same typed span as an earlier-stage detection replace the
 * earlier one only if they have strictly higher confidence. Detections of
 * *different* types are never suppressed against each other, even when their
 * spans fully overlap.
 *
 * @param regexDetections  - Raw output from detectSensitiveData()
 * @param nerDetections    - Raw output from INERDetector.detect()
 * @param semanticDetections - Raw output from ISemanticDetector.detect()
 * @returns Merged, deduplicated array sorted by start position.
 */
export function mergeDetections(
  regexDetections: Detection[],
  nerDetections: NERDetection[],
  semanticDetections: SemanticDetection[],
): MergedDetection[] {
  const candidates: MergedDetection[] = [
    ...regexDetections.map(fromRegex),
    ...nerDetections.map(fromNER),
    ...semanticDetections.map(fromSemantic),
  ];

  const result: MergedDetection[] = [];

  for (const candidate of candidates) {
    let dominated = false;

    for (let i = 0; i < result.length; i++) {
      const existing = result[i];

      // Only apply overlap-based deduplication when types match.
      if (candidate.type !== existing.type) continue;

      const overlap = overlapFraction(candidate, existing);
      if (overlap <= 0.5) continue;

      // Same type, >50% overlap: keep whichever has higher confidence.
      if (candidate.confidence > existing.confidence) {
        result[i] = candidate;
      }
      // Regardless of which won, the candidate is now "handled".
      dominated = true;
      break;
    }

    if (!dominated) {
      result.push(candidate);
    }
  }

  return result.sort((a, b) => a.start - b.start);
}
