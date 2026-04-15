/**
 * Types for the LocalDetectionPipeline.
 *
 * These interfaces are the seams between the pipeline orchestrator and its
 * collaborators (NERDetector, ISemanticDetector, LocalPolicyEngine,
 * LocalDummyGenerator). Concrete implementations live in their own modules
 * and are injected at construction time, keeping this module dependency-free.
 */

import type { Severity } from '../detection';

// ---------------------------------------------------------------------------
// Core pipeline types
// ---------------------------------------------------------------------------

/** Which pipeline stage produced a detection. */
export type DetectionSource = 'regex' | 'ner' | 'semantic';

/**
 * The action to take after evaluating all detections against policy.
 * Superset of the backend action enum — includes 'warn' for medium-severity hits.
 */
export type Action = 'allow' | 'block' | 'redact' | 'warn';

/**
 * A single detection produced by the merged, deduplicated pipeline output.
 * Carries the originating source so downstream UI and logging can distinguish
 * regex hits from NER / semantic hits.
 */
export interface MergedDetection {
  /** Canonical type identifier (e.g. 'ssn', 'credit_card', 'PERSON'). */
  type: string;
  /** Human-readable label for UI display. */
  displayName: string;
  /** Inclusive start character offset in the analysed text. */
  start: number;
  /** Exclusive end character offset in the analysed text. */
  end: number;
  /** 0–1 confidence score. */
  confidence: number;
  /** Which pipeline stage produced this detection. */
  source: DetectionSource;
  /** Risk severity used for policy evaluation. */
  severity: Severity;
}

/** Counts and timing information attached to every LocalAnalysisResult. */
export interface DetectionMetadata {
  /** Number of raw regex detections before deduplication. */
  regexCount: number;
  /** Number of raw NER detections before deduplication (0 if NER failed). */
  nerCount: number;
  /** Number of raw semantic detections before deduplication (0 if semantic unavailable/failed). */
  semanticCount: number;
  /** Total wall-clock time for the entire pipeline in milliseconds. */
  totalMs: number;
  /** Semver string identifying this pipeline implementation. */
  pipelineVersion: string;
}

/**
 * The full result returned by LocalDetectionPipeline.analyze().
 * Replaces the AnalyzeResponse that currently comes from POST /analyze.
 */
export interface LocalAnalysisResult {
  /** Merged, deduplicated, position-sorted detections. */
  detections: MergedDetection[];
  /** Policy-evaluated action to take on this text. */
  action: Action;
  /**
   * Dummy replacement values keyed by detection index (position in detections[]).
   * Not every detection is guaranteed to have an entry (generator may fail for some).
   */
  dummyValues: Map<number, string>;
  /** SHA-256 hex hash of the analysed text for audit logging. */
  contentHash: string;
  /** Diagnostic metadata about the pipeline run. */
  metadata: DetectionMetadata;
}

// ---------------------------------------------------------------------------
// Dependency interfaces (implemented by collaborator modules)
// ---------------------------------------------------------------------------

/**
 * A single detection returned by the NER (Tier 1) detector.
 * Shape is intentionally identical to MergedDetection minus the 'source'
 * field — the pipeline stamps that itself.
 */
export interface NERDetection {
  type: string;
  displayName: string;
  start: number;
  end: number;
  confidence: number;
  severity: Severity;
}

/**
 * Interface implemented by NERDetector (src/semantic/NERDetector.ts — future).
 * The pipeline calls detect() and wraps any thrown error for graceful degradation.
 */
export interface INERDetector {
  detect(text: string): Promise<NERDetection[]>;
}

/**
 * A single detection returned by the semantic (Tier 2) detector.
 */
export interface SemanticDetection {
  type: string;
  displayName: string;
  start: number;
  end: number;
  confidence: number;
  severity: Severity;
}

/**
 * Interface implemented by LocalSemanticDetector (src/semantic/ — future).
 * isReady() is checked before calling detect(); if the model is not yet loaded
 * the stage is skipped without error.
 */
export interface ISemanticDetector {
  /** Returns true when the ONNX model is loaded and inference is available. */
  isReady(): boolean;
  detect(text: string): Promise<SemanticDetection[]>;
}

/**
 * Interface implemented by LocalPolicyEngine (src/policies/ — future).
 * Receives the full merged detection list and returns the appropriate action.
 */
export interface IPolicyEngine {
  evaluate(detections: MergedDetection[]): Action;
}

/**
 * Interface implemented by LocalDummyGenerator (src/services/ — future).
 * Receives one detection at a time and the full text for context.
 * Throws on failure; the pipeline catches and continues.
 */
export interface IDummyGenerator {
  generate(detection: MergedDetection, text: string): Promise<string>;
}
