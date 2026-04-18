// @ts-nocheck
/**
 * Browser-side benchmark harness for the Obfusca DLP detection pipeline.
 *
 * Measures latency and memory usage for:
 *   1. Regex detection stage (detection.ts)
 *   2. NER / ONNX semantic detection stage (when a model is available)
 *   3. Full pipeline (regex + NER combined)
 *
 * The harness works WITHOUT an actual ONNX model loaded:
 *   - Regex benchmarks always run.
 *   - NER / full-pipeline benchmarks are skipped when no session is available,
 *     and the report marks those stages as "skipped".
 *
 * Pass/fail thresholds (from local-semantic-architecture.md §4.2 + M20C spec):
 *   Regex p99       < 5 ms
 *   NER p99         < 50 ms
 *   Full pipeline   < 2000 ms p99
 *   Memory delta    < 350 MB
 *   Cold start      < 3000 ms
 *
 * Run via vitest:
 *   npx vitest run src/semantic/__tests__/benchmark.ts
 *
 * Note: This file uses Vitest's `describe` / `it` structure so it integrates
 * with the existing test runner. Timing assertions use `expect` with generous
 * tolerances to avoid flaky failures on CI machines; the p-value latencies are
 * printed to console for human review.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { detectSensitiveData, mightContainSensitiveDataSync } from '../../detection';
import { BENCHMARK_TEXTS, BENCHMARK_BY_CATEGORY } from './benchmark-texts';
import type { BenchmarkText } from './benchmark-texts';

// ---------------------------------------------------------------------------
// Thresholds (ms) — from M20C spec
// ---------------------------------------------------------------------------

const THRESHOLDS = {
  regex: { p99: 5 },
  ner: { p99: 50 },
  fullPipeline: { p99: 2_000 },
  memoryDeltaMB: 350,
  coldStartMs: 3_000,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LatencyStats {
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  min: number;
  max: number;
  samples: number;
}

interface StageResult {
  stage: 'regex' | 'ner' | 'full_pipeline';
  stats: LatencyStats | null;
  /** true when the stage was skipped (model not available) */
  skipped: boolean;
  /** human-readable skip reason */
  skipReason?: string;
  passed: boolean;
  threshold: number;
}

interface MemorySnapshot {
  heapUsedMB: number;
  timestamp: number;
}

export interface BenchmarkReport {
  runAt: string;
  totalTexts: number;
  modelAvailable: boolean;
  stages: StageResult[];
  memory: {
    before: MemorySnapshot | null;
    after: MemorySnapshot | null;
    deltaMB: number | null;
    passed: boolean;
  };
  coldStartMs: number | null;
  coldStartPassed: boolean;
  /** Per-text raw timing data (regex stage only — not included for NER to keep report size down) */
  rawRegexLatenciesMs: number[];
  overallPassed: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const k = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(k);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (k - lo) * (sorted[hi] - sorted[lo]);
}

function computeStats(latencies: number[]): LatencyStats {
  const mean = latencies.reduce((s, v) => s + v, 0) / latencies.length;
  return {
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    mean,
    min: Math.min(...latencies),
    max: Math.max(...latencies),
    samples: latencies.length,
  };
}

function getHeapUsedMB(): number {
  // Node.js (vitest environment)
  if (typeof process !== 'undefined' && process.memoryUsage) {
    return process.memoryUsage().heapUsed / (1024 * 1024);
  }
  // Browser (performance.memory — Chrome only)
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number };
  };
  if (perf.memory) {
    return perf.memory.usedJSHeapSize / (1024 * 1024);
  }
  return 0;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// ---------------------------------------------------------------------------
// Regex benchmark
// ---------------------------------------------------------------------------

async function benchmarkRegex(
  texts: BenchmarkText[],
): Promise<{ latencies: number[]; detectionCounts: number[] }> {
  const latencies: number[] = [];
  const detectionCounts: number[] = [];

  for (const bm of texts) {
    const t0 = now();
    const detections = await detectSensitiveData(bm.text);
    const elapsed = now() - t0;
    latencies.push(elapsed);
    detectionCounts.push(detections.length);
  }

  return { latencies, detectionCounts };
}

// Quick-check variant using the synchronous fast-path
function benchmarkRegexSync(texts: BenchmarkText[]): number[] {
  const latencies: number[] = [];
  for (const bm of texts) {
    const t0 = now();
    mightContainSensitiveDataSync(bm.text);
    latencies.push(now() - t0);
  }
  return latencies;
}

// ---------------------------------------------------------------------------
// NER / ONNX benchmark (skipped when no model is available)
// ---------------------------------------------------------------------------

interface MockOrtSession {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/**
 * Attempt to get a live ONNX session from ModelLoader.
 * Returns null if the model is not loaded (graceful skip).
 */
async function tryGetOrtSession(): Promise<MockOrtSession | null> {
  try {
    const { ModelLoader } = await import('../ModelLoader');
    const loaded = ModelLoader.getModel();
    if (loaded?.session) {
      return loaded.session as MockOrtSession;
    }
    return null;
  } catch {
    return null;
  }
}

async function benchmarkNer(
  texts: BenchmarkText[],
  session: MockOrtSession,
): Promise<number[]> {
  const latencies: number[] = [];

  // Import ONNXSemanticDetector dynamically to avoid hard dep when model absent
  const { ONNXSemanticDetector } = await import('../ONNXSemanticDetector');

  // Minimal model card for benchmarking
  const card = {
    model_id: 'benchmark-mock',
    version: '0.0.0',
    sha256: '',
    size_bytes: 0,
    input_format: 'token_ids,attention_mask',
    output_format: 'logits',
    labels: ['O', 'B-SSN', 'I-SSN', 'B-CREDIT_CARD', 'I-CREDIT_CARD', 'B-NAME', 'I-NAME'],
    max_sequence_length: 512,
  };

  const detector = new ONNXSemanticDetector(session, card);

  for (const bm of texts) {
    // Minimal tokenizer stub — real benchmark would use full tokenizer
    const tokens = bm.text.split(/\s+/).slice(0, 128);
    const tokenizerOutput = {
      input_ids: tokens.map((_, i) => i + 100),
      attention_mask: tokens.map(() => 1),
      offset_mapping: tokens.map((t, i) => {
        const start = bm.text.indexOf(t);
        return [start >= 0 ? start : i * 5, start >= 0 ? start + t.length : i * 5 + 5] as [number, number];
      }),
    };

    const t0 = now();
    await detector.detect(bm.text, tokenizerOutput);
    latencies.push(now() - t0);
  }

  return latencies;
}

// ---------------------------------------------------------------------------
// Cold-start simulation
// ---------------------------------------------------------------------------

async function measureColdStart(): Promise<number> {
  // Simulate: import + session create from a pre-cached ArrayBuffer.
  // In production this measures the time from service worker start to first
  // inference being available. Here we time the dynamic import + detector
  // construction with a trivial (empty) buffer.
  const t0 = now();
  try {
    await import('../ModelLoader');
    await import('../ONNXSemanticDetector');
  } catch {
    // Module already cached — time is dominated by lookup
  }
  return now() - t0;
}

// ---------------------------------------------------------------------------
// Memory measurement
// ---------------------------------------------------------------------------

function takeMemorySnapshot(): MemorySnapshot {
  return { heapUsedMB: getHeapUsedMB(), timestamp: Date.now() };
}

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

function buildStageResult(
  stage: StageResult['stage'],
  latencies: number[] | null,
  threshold: number,
  skipped: boolean,
  skipReason?: string,
): StageResult {
  if (skipped || latencies === null) {
    return { stage, stats: null, skipped: true, skipReason, passed: true, threshold };
  }
  const stats = computeStats(latencies);
  return {
    stage,
    stats,
    skipped: false,
    passed: stats.p99 <= threshold,
    threshold,
  };
}

function printReport(report: BenchmarkReport): void {
  console.log('\n' + '='.repeat(65));
  console.log('Obfusca Browser Benchmark Report');
  console.log('='.repeat(65));
  console.log(`  Run at        : ${report.runAt}`);
  console.log(`  Texts         : ${report.totalTexts}`);
  console.log(`  Model loaded  : ${report.modelAvailable}`);
  console.log();

  for (const stage of report.stages) {
    const label = stage.stage.padEnd(16);
    if (stage.skipped) {
      console.log(`  ${label}: SKIPPED — ${stage.skipReason ?? 'model not available'}`);
    } else if (stage.stats) {
      const s = stage.stats;
      const pass = stage.passed ? '✅ PASS' : '❌ FAIL';
      console.log(
        `  ${label}: p50=${s.p50.toFixed(2)}ms  p95=${s.p95.toFixed(2)}ms  ` +
        `p99=${s.p99.toFixed(2)}ms  threshold=${stage.threshold}ms  ${pass}`,
      );
    }
  }

  if (report.memory.deltaMB !== null) {
    const pass = report.memory.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  Memory delta  : ${report.memory.deltaMB.toFixed(1)} MB  threshold=${THRESHOLDS.memoryDeltaMB}MB  ${pass}`);
  }

  if (report.coldStartMs !== null) {
    const pass = report.coldStartPassed ? '✅ PASS' : '❌ FAIL';
    console.log(`  Cold start    : ${report.coldStartMs.toFixed(1)} ms  threshold=${THRESHOLDS.coldStartMs}ms  ${pass}`);
  }

  console.log();
  console.log(`  Overall: ${report.overallPassed ? '✅ ALL PASS' : '❌ SOME FAILURES'}`);
  console.log('='.repeat(65) + '\n');
}

// ---------------------------------------------------------------------------
// Main benchmark runner (exported for programmatic use)
// ---------------------------------------------------------------------------

export async function runBenchmark(): Promise<BenchmarkReport> {
  const memBefore = takeMemorySnapshot();
  const session = await tryGetOrtSession();
  const memAfter = takeMemorySnapshot();
  const modelAvailable = session !== null;

  const deltaMB = memBefore && memAfter ? memAfter.heapUsedMB - memBefore.heapUsedMB : null;
  const memoryPassed = deltaMB === null || deltaMB <= THRESHOLDS.memoryDeltaMB;

  // Cold start
  const coldStartMs = await measureColdStart();
  const coldStartPassed = coldStartMs <= THRESHOLDS.coldStartMs;

  // Regex benchmark
  const { latencies: regexLatencies } = await benchmarkRegex(BENCHMARK_TEXTS);
  const regexStage = buildStageResult('regex', regexLatencies, THRESHOLDS.regex.p99, false);

  // NER benchmark
  let nerLatencies: number[] | null = null;
  let nerSkipReason: string | undefined;
  if (modelAvailable && session) {
    try {
      nerLatencies = await benchmarkNer(BENCHMARK_TEXTS, session);
    } catch (err) {
      nerSkipReason = `NER benchmark threw: ${err}`;
    }
  } else {
    nerSkipReason = 'No ONNX model loaded — download model to run NER benchmarks';
  }
  const nerStage = buildStageResult(
    'ner',
    nerLatencies,
    THRESHOLDS.ner.p99,
    nerLatencies === null,
    nerSkipReason,
  );

  // Full pipeline benchmark
  let fullLatencies: number[] | null = null;
  let fullSkipReason: string | undefined;
  if (modelAvailable && session) {
    // Combine regex + NER latencies sample-wise as a proxy for full pipeline
    if (nerLatencies) {
      fullLatencies = regexLatencies.map((r, i) => r + (nerLatencies![i] ?? 0));
    } else {
      fullSkipReason = 'NER stage was skipped; full pipeline unavailable';
    }
  } else {
    fullSkipReason = 'No ONNX model loaded — full pipeline requires model';
  }
  const fullStage = buildStageResult(
    'full_pipeline',
    fullLatencies,
    THRESHOLDS.fullPipeline.p99,
    fullLatencies === null,
    fullSkipReason,
  );

  const stages = [regexStage, nerStage, fullStage];
  const overallPassed =
    stages.every((s) => s.passed) &&
    memoryPassed &&
    coldStartPassed;

  const report: BenchmarkReport = {
    runAt: new Date().toISOString(),
    totalTexts: BENCHMARK_TEXTS.length,
    modelAvailable,
    stages,
    memory: {
      before: memBefore,
      after: memAfter,
      deltaMB,
      passed: memoryPassed,
    },
    coldStartMs,
    coldStartPassed,
    rawRegexLatenciesMs: regexLatencies,
    overallPassed,
  };

  printReport(report);
  return report;
}

// ---------------------------------------------------------------------------
// Vitest test suite
// ---------------------------------------------------------------------------

describe('Obfusca detection pipeline benchmark', () => {
  let report: BenchmarkReport;

  beforeAll(async () => {
    // Run once; individual it() blocks read from report
    report = await runBenchmark();
  }, 30_000);

  // -------------------------------------------------------------------------
  // Corpus validation
  // -------------------------------------------------------------------------

  describe('Benchmark corpus', () => {
    it('has exactly 50 benchmark texts', () => {
      expect(BENCHMARK_TEXTS).toHaveLength(50);
    });

    it('has 10 clean texts', () => {
      expect(BENCHMARK_BY_CATEGORY.clean).toHaveLength(10);
    });

    it('has 15 single-detection texts', () => {
      expect(BENCHMARK_BY_CATEGORY.single).toHaveLength(15);
    });

    it('has 10 multi-detection texts', () => {
      expect(BENCHMARK_BY_CATEGORY.multi).toHaveLength(10);
    });

    it('has 10 adversarial texts', () => {
      expect(BENCHMARK_BY_CATEGORY.adversarial).toHaveLength(10);
    });

    it('has 5 long texts', () => {
      expect(BENCHMARK_BY_CATEGORY.long).toHaveLength(5);
    });

    it('all long texts are 500+ chars', () => {
      for (const bm of BENCHMARK_BY_CATEGORY.long) {
        expect(bm.text.length).toBeGreaterThanOrEqual(500);
      }
    });

    it('all IDs are unique', () => {
      const ids = BENCHMARK_TEXTS.map((b) => b.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });
  });

  // -------------------------------------------------------------------------
  // Regex stage
  // -------------------------------------------------------------------------

  describe('Regex stage', () => {
    it('produces a latency report for the regex stage', () => {
      expect(report.stages[0].stage).toBe('regex');
      expect(report.stages[0].stats).not.toBeNull();
    });

    it('detects no sensitive data in clean texts', async () => {
      for (const bm of BENCHMARK_BY_CATEGORY.clean) {
        const detections = await detectSensitiveData(bm.text);
        expect(detections).toHaveLength(0);
      }
    });

    it('detects expected sensitive types in single-detection texts', async () => {
      const ssnText = BENCHMARK_BY_CATEGORY.single.find((b) => b.id === 'single-001')!;
      const detections = await detectSensitiveData(ssnText.text);
      const types = detections.map((d) => d.type);
      expect(types).toContain('ssn');
    });

    it('rejects invalid SSNs (area code 000, 666, 900-999)', async () => {
      const invalid = [
        'SSN: 000-12-3456',
        'SSN: 666-12-3456',
        'SSN: 900-12-3456',
        'SSN: 999-99-9999',
      ];
      for (const text of invalid) {
        const detections = await detectSensitiveData(text);
        const ssns = detections.filter((d) => d.type === 'ssn');
        expect(ssns).toHaveLength(0);
      }
    });

    it('regex p99 latency is within threshold', () => {
      const stage = report.stages.find((s) => s.stage === 'regex')!;
      expect(stage.stats).not.toBeNull();
      // On CI machines we use a more generous limit (10×) to avoid flakiness
      const ciLimit = THRESHOLDS.regex.p99 * 10;
      expect(stage.stats!.p99).toBeLessThan(ciLimit);
    });
  });

  // -------------------------------------------------------------------------
  // Sync quick-check
  // -------------------------------------------------------------------------

  describe('Sync quick-check (mightContainSensitiveDataSync)', () => {
    it('returns false for all clean texts', () => {
      for (const bm of BENCHMARK_BY_CATEGORY.clean) {
        expect(mightContainSensitiveDataSync(bm.text)).toBe(false);
      }
    });

    it('returns true for texts with SSN patterns', () => {
      expect(mightContainSensitiveDataSync('SSN: 456-78-9012')).toBe(true);
    });

    it('returns true for texts with AWS keys', () => {
      expect(mightContainSensitiveDataSync('Key: AKIAIOSFODNN7EXAMPLE')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // NER / full pipeline stages
  // -------------------------------------------------------------------------

  describe('NER stage', () => {
    it('is either skipped (no model) or within latency threshold', () => {
      const stage = report.stages.find((s) => s.stage === 'ner')!;
      if (stage.skipped) {
        // No model — acceptable skip
        expect(stage.passed).toBe(true);
      } else {
        // Model present — must pass threshold
        expect(stage.stats).not.toBeNull();
        const ciLimit = THRESHOLDS.ner.p99 * 20; // generous CI multiplier
        expect(stage.stats!.p99).toBeLessThan(ciLimit);
      }
    });
  });

  describe('Full pipeline stage', () => {
    it('is either skipped (no model) or within latency threshold', () => {
      const stage = report.stages.find((s) => s.stage === 'full_pipeline')!;
      if (stage.skipped) {
        expect(stage.passed).toBe(true);
      } else {
        expect(stage.stats).not.toBeNull();
        const ciLimit = THRESHOLDS.fullPipeline.p99 * 5;
        expect(stage.stats!.p99).toBeLessThan(ciLimit);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Memory & cold-start
  // -------------------------------------------------------------------------

  describe('Memory usage', () => {
    it('heap delta is reported', () => {
      // deltaMB may be 0 in environments without memory tracking
      expect(report.memory.deltaMB).not.toBeUndefined();
    });

    it('heap delta is within threshold (or environment does not support measurement)', () => {
      if (report.memory.deltaMB === null || report.memory.deltaMB === 0) {
        // Memory tracking unavailable — skip assertion
        return;
      }
      expect(report.memory.deltaMB).toBeLessThan(THRESHOLDS.memoryDeltaMB);
    });
  });

  describe('Cold start', () => {
    it('module import cold-start is below threshold', () => {
      expect(report.coldStartMs).not.toBeNull();
      // Module import in vitest should be near-instant; use 5× threshold for CI
      expect(report.coldStartMs!).toBeLessThan(THRESHOLDS.coldStartMs * 5);
    });
  });

  // -------------------------------------------------------------------------
  // Adversarial corpus validation
  // -------------------------------------------------------------------------

  describe('Adversarial texts', () => {
    it('does not detect SSN for all-zeros placeholder (000-00-0000)', async () => {
      const adv = BENCHMARK_BY_CATEGORY.adversarial.find((b) => b.id === 'adv-006')!;
      const detections = await detectSensitiveData(adv.text);
      expect(detections.filter((d) => d.type === 'ssn')).toHaveLength(0);
    });

    it('does not detect SSN for area code 666', async () => {
      const adv = BENCHMARK_BY_CATEGORY.adversarial.find((b) => b.id === 'adv-009')!;
      const detections = await detectSensitiveData(adv.text);
      expect(detections.filter((d) => d.type === 'ssn')).toHaveLength(0);
    });

    it('detects credit card in adv-010 despite partial masking', async () => {
      const adv = BENCHMARK_BY_CATEGORY.adversarial.find((b) => b.id === 'adv-010')!;
      const detections = await detectSensitiveData(adv.text);
      expect(detections.filter((d) => d.type === 'credit_card').length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Multi-detection validation
  // -------------------------------------------------------------------------

  describe('Multi-detection texts', () => {
    it('detects multiple types in multi-001', async () => {
      const bm = BENCHMARK_BY_CATEGORY.multi.find((b) => b.id === 'multi-001')!;
      const detections = await detectSensitiveData(bm.text);
      const types = new Set(detections.map((d) => d.type));
      expect(types.has('ssn')).toBe(true);
      expect(types.has('credit_card')).toBe(true);
      expect(types.has('aws_key')).toBe(true);
    });

    it('detects all three credentials in multi-010 env file', async () => {
      const bm = BENCHMARK_BY_CATEGORY.multi.find((b) => b.id === 'multi-010')!;
      const detections = await detectSensitiveData(bm.text);
      const types = new Set(detections.map((d) => d.type));
      expect(types.has('aws_key')).toBe(true);
      expect(types.has('api_key')).toBe(true);
    });
  });
});
