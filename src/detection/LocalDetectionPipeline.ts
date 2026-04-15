/**
 * LocalDetectionPipeline — orchestrates the full local DLP detection flow.
 *
 * This module is the intended REPLACEMENT for the POST /analyze backend call
 * described in docs/local-semantic-architecture.md §4.1. It is deliberately
 * NOT wired into interceptor.ts yet; integration is a separate mission.
 *
 * Six stages:
 *  1. Regex detection    — detectSensitiveData() from detection.ts
 *  2. NER Tier 1         — INERDetector (e.g. NERDetector.ts, future)
 *  3. Semantic Tier 2    — ISemanticDetector (model may not be loaded → NoOp)
 *  4. Merge & deduplicate — mergeDetections() from deduplication.ts
 *  5. Policy evaluation  — IPolicyEngine (e.g. LocalPolicyEngine.ts, future)
 *  6. Dummy generation   — IDummyGenerator (e.g. LocalDummyGenerator.ts, future)
 *
 * Partial-failure semantics:
 *  - If NER throws, the pipeline logs a warning and continues with regex only.
 *  - If semantic detection throws, the pipeline continues with regex + NER.
 *  - If dummy generation fails for an individual detection, that slot is
 *    omitted from dummyValues (the rest still proceed).
 *
 * All collaborators are injected via constructor so they can be mocked in
 * tests and swapped for real implementations without touching this file.
 */

import { detectSensitiveData } from '../detection';
import type { Detection } from '../detection';
import { mergeDetections } from './deduplication';
import type {
  MergedDetection,
  LocalAnalysisResult,
  DetectionMetadata,
  NERDetection,
  SemanticDetection,
  INERDetector,
  ISemanticDetector,
  IPolicyEngine,
  IDummyGenerator,
} from './types';

import { PIPELINE_VERSION } from './version';
export { PIPELINE_VERSION };

// ---------------------------------------------------------------------------
// Public constructor options
// ---------------------------------------------------------------------------

export interface LocalDetectionPipelineOptions {
  /** Tier 1 NER detector. Required but failures are handled gracefully. */
  nerDetector: INERDetector;
  /**
   * Tier 2 semantic detector. Must expose isReady() so the pipeline can skip
   * inference entirely when the model has not finished loading.
   */
  semanticDetector: ISemanticDetector;
  /** Policy engine that maps a detection list to an action. */
  policyEngine: IPolicyEngine;
  /** Dummy-value generator called per detection. */
  dummyGenerator: IDummyGenerator;
}

// ---------------------------------------------------------------------------
// Pipeline class
// ---------------------------------------------------------------------------

export class LocalDetectionPipeline {
  private readonly nerDetector: INERDetector;
  private readonly semanticDetector: ISemanticDetector;
  private readonly policyEngine: IPolicyEngine;
  private readonly dummyGenerator: IDummyGenerator;

  constructor(options: LocalDetectionPipelineOptions) {
    this.nerDetector = options.nerDetector;
    this.semanticDetector = options.semanticDetector;
    this.policyEngine = options.policyEngine;
    this.dummyGenerator = options.dummyGenerator;
  }

  /**
   * Run the full detection pipeline on the provided text.
   *
   * @param text - The user's plaintext input. Never transmitted to any
   *               external service by this module.
   * @returns LocalAnalysisResult containing merged detections, the policy
   *          action, dummy replacement values, a content hash, and metadata.
   */
  async analyze(text: string): Promise<LocalAnalysisResult> {
    const startTime = performance.now();

    // ------------------------------------------------------------------
    // Stage 1: Regex detection
    // ------------------------------------------------------------------
    let regexDetections: Detection[] = [];
    try {
      regexDetections = await detectSensitiveData(text);
    } catch (err) {
      // Regex detection should never throw in production, but guard defensively.
      console.warn('[LocalDetectionPipeline] Regex detection failed:', err);
    }

    // ------------------------------------------------------------------
    // Stage 2: NER Tier 1
    // ------------------------------------------------------------------
    let nerDetections: NERDetection[] = [];
    let nerCount = 0;
    try {
      nerDetections = await this.nerDetector.detect(text);
      nerCount = nerDetections.length;
    } catch (err) {
      console.warn(
        '[LocalDetectionPipeline] NER detection failed — continuing with regex-only:',
        err,
      );
    }

    // ------------------------------------------------------------------
    // Stage 3: Semantic Tier 2
    // ------------------------------------------------------------------
    let semanticDetections: SemanticDetection[] = [];
    let semanticCount = 0;
    try {
      if (this.semanticDetector.isReady()) {
        semanticDetections = await this.semanticDetector.detect(text);
        semanticCount = semanticDetections.length;
      }
    } catch (err) {
      console.warn(
        '[LocalDetectionPipeline] Semantic detection failed — continuing with regex+NER:',
        err,
      );
    }

    // ------------------------------------------------------------------
    // Stage 4: Merge and deduplicate
    // ------------------------------------------------------------------
    const detections: MergedDetection[] = mergeDetections(
      regexDetections,
      nerDetections,
      semanticDetections,
    );

    // ------------------------------------------------------------------
    // Stage 5: Policy evaluation
    // ------------------------------------------------------------------
    const action = this.policyEngine.evaluate(detections);

    // ------------------------------------------------------------------
    // Stage 6: Dummy value generation
    // ------------------------------------------------------------------
    const dummyValues = new Map<number, string>();
    for (let i = 0; i < detections.length; i++) {
      try {
        const dummy = await this.dummyGenerator.generate(detections[i], text);
        dummyValues.set(i, dummy);
      } catch (err) {
        console.warn(
          `[LocalDetectionPipeline] Dummy generation failed for detection[${i}] — skipping:`,
          err,
        );
      }
    }

    // ------------------------------------------------------------------
    // Content hash (for audit logging only — no content is transmitted)
    // ------------------------------------------------------------------
    const contentHash = await computeContentHash(text);

    const totalMs = performance.now() - startTime;

    const metadata: DetectionMetadata = {
      regexCount: regexDetections.length,
      nerCount,
      semanticCount,
      totalMs,
      pipelineVersion: PIPELINE_VERSION,
    };

    return { detections, action, dummyValues, contentHash, metadata };
  }
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

/**
 * SHA-256 hex digest of the input text, prefixed with 'sha256:'.
 * Uses the SubtleCrypto API available in both browser extension contexts
 * and modern Node.js (≥ 15) test environments.
 */
async function computeContentHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return 'sha256:' + hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
