/**
 * ONNXSemanticDetector — Tier 2 local inference via onnxruntime-web.
 *
 * onnxruntime-web is loaded via a DYNAMIC IMPORT wrapped in try/catch so the
 * extension compiles and runs without the package installed. The actual ONNX
 * runtime (a ~2 MB WASM bundle) is fetched lazily on first initialisation.
 *
 * ONE-LINE SWAP: when onnxruntime-web is installed, replace the body of
 * `_loadOrtRuntime()` with:
 *
 *   return import('onnxruntime-web');
 *
 * and update the inline OrtModule / OrtSession / OrtTensor types below with:
 *
 *   import type { InferenceSession, Tensor } from 'onnxruntime-web';
 *
 * Everything else stays the same.
 *
 * See: /docs/local-semantic-architecture.md §4.3
 */

import type {
  ModelLoadStatus,
  SemanticDetection,
  SemanticRule,
  TextTokenizer,
} from './types';
import type { ModelLoader } from './ModelLoader';

// ---------------------------------------------------------------------------
// Inline ORT type definitions
// Replace these with the real onnxruntime-web types when the package is added.
// ---------------------------------------------------------------------------

/** Subset of onnxruntime-web's Tensor that we actually use. */
interface OrtTensor {
  readonly dims: readonly number[];
  readonly data: ArrayLike<number> | ArrayLike<bigint>;
  readonly type: string;
}

/** Subset of onnxruntime-web's InferenceSession that we actually use. */
interface OrtSession {
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  release(): Promise<void>;
}

/** The exports we consume from the onnxruntime-web module. */
interface OrtModule {
  InferenceSession: {
    create(
      model: ArrayBuffer,
      options?: {
        executionProviders?: string[];
        graphOptimizationLevel?: string;
        logSeverityLevel?: number;
      },
    ): Promise<OrtSession>;
  };
  Tensor: new (
    type: string,
    data: ArrayBufferLike | number[] | Float32Array | Int32Array | BigInt64Array,
    dims?: number[],
  ) => OrtTensor;
}

// ---------------------------------------------------------------------------
// ONE-LINE SWAP lives here.
// ---------------------------------------------------------------------------

/**
 * Dynamically load onnxruntime-web.
 *
 * Returns null (instead of throwing) if:
 *  - The package is not installed (development / test environment).
 *  - WebAssembly is disabled in the browser (enterprise lockdown).
 *  - Any other runtime error during import.
 *
 * ONE-LINE SWAP: replace the function body with `return import('onnxruntime-web');`
 */
async function _loadOrtRuntime(): Promise<OrtModule | null> {
  try {
    // The string indirection prevents TypeScript from trying to resolve the
    // module at compile time when the package is not yet installed.
    const moduleName = 'onnxruntime-web';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await (Function('m', 'return import(m)')(moduleName))) as OrtModule;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Async detector interface (Tier 2)
// ---------------------------------------------------------------------------

/**
 * Async variant of the Tier 1 ISemanticDetector (from types.ts) for Tier 2
 * (ONNX-backed) detectors. detect() returns a Promise because ONNX inference
 * is asynchronous.
 *
 * LocalDetectionPipeline (M9) calls detect() via this interface.
 * NoOpSemanticDetector also implements this interface.
 */
export interface IAsyncSemanticDetector {
  isReady(): boolean;
  detect(text: string, rules?: SemanticRule[]): Promise<SemanticDetection[]>;
  getModelStatus(): ModelLoadStatus;
}

// ---------------------------------------------------------------------------
// Detector configuration
// ---------------------------------------------------------------------------

export interface DetectorConfig {
  /** Maximum milliseconds to wait for a single inference call. Default: 5000. */
  inferenceTimeoutMs?: number;
  /** ONNX execution provider. Default: 'wasm'. */
  executionProvider?: string;
}

const DEFAULT_CONFIG: Required<DetectorConfig> = {
  inferenceTimeoutMs: 5000,
  executionProvider: 'wasm',
};

// ---------------------------------------------------------------------------
// ONNXSemanticDetector
// ---------------------------------------------------------------------------

/**
 * Tier 2 semantic detector backed by onnxruntime-web.
 *
 * Lifecycle:
 *  1. Constructed with a ModelLoader (not yet loaded).
 *  2. First detect() call triggers lazy init (non-blocking — returns [] immediately).
 *  3. Subsequent detect() calls after isReady() === true run real inference.
 *
 * Graceful fallbacks:
 *  - ONNX runtime unavailable → logs warning, returns [] forever.
 *  - Model not yet downloaded → triggers download, returns [] until ready.
 *  - Inference timeout → returns [] for that call, session stays alive.
 *  - Any unhandled error → returns [].
 */
export class ONNXSemanticDetector implements IAsyncSemanticDetector {
  private _session: OrtSession | null = null;
  private _ort: OrtModule | null = null;
  /** Tracks the in-flight init so concurrent detect() calls don't race. */
  private _initPromise: Promise<void> | null = null;
  /** Set to true after the first init attempt (success or failure). */
  private _initAttempted = false;
  /** Set to true if the ONNX runtime is permanently unavailable. */
  private _runtimeUnavailable = false;

  private readonly _cfg: Required<DetectorConfig>;

  /**
   * @param loader    ModelLoader that owns the ONNX model binary.
   * @param config    Optional tuning (timeout, execution provider).
   * @param tokenizer Optional tokenizer. When undefined, detect() returns []
   *                  (inference cannot proceed without tokenization).
   *                  Wire in the tokenizer in a follow-up mission.
   */
  constructor(
    private readonly loader: ModelLoader,
    config: DetectorConfig = {},
    private readonly tokenizer: TextTokenizer | null = null,
  ) {
    this._cfg = { ...DEFAULT_CONFIG, ...config };
  }

  // -------------------------------------------------------------------------
  // IAsyncSemanticDetector
  // -------------------------------------------------------------------------

  /**
   * Returns true only when the InferenceSession is initialised and ready.
   */
  isReady(): boolean {
    return this._session !== null;
  }

  /**
   * Run semantic detection on text against the provided rules.
   *
   * If the model is not yet loaded:
   *  - Triggers lazy init (fire-and-forget).
   *  - Returns [] immediately (non-blocking).
   *
   * If the tokenizer is not yet wired in:
   *  - Returns [] (inference requires tokenization; see constructor jsdoc).
   *
   * Inference is time-bounded to config.inferenceTimeoutMs (default 5 s).
   */
  async detect(text: string, rules?: SemanticRule[]): Promise<SemanticDetection[]> {
    if (this._runtimeUnavailable) return [];

    if (!this._session) {
      this._triggerLazyInit();
      return [];
    }

    if (!this.tokenizer) {
      // Tokenizer not yet wired in — inference cannot proceed.
      // This is expected until the model bundle ships with its tokenizer.
      return [];
    }

    try {
      return await this._runWithTimeout(
        this._infer(text, rules),
        this._cfg.inferenceTimeoutMs,
      );
    } catch (err) {
      console.warn('[Obfusca ONNXSemanticDetector] Inference error:', err);
      return [];
    }
  }

  /** Delegates to the underlying ModelLoader. */
  getModelStatus(): ModelLoadStatus {
    return this.loader.getStatus();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Fire-and-forget: start init if not already started. */
  private _triggerLazyInit(): void {
    if (this._initAttempted || this._initPromise) return;
    this._initPromise = this._init().finally(() => {
      this._initAttempted = true;
      this._initPromise = null;
    });
  }

  /**
   * Full init sequence:
   *  1. Load ONNX runtime.
   *  2. Ensure model is loaded (may trigger download).
   *  3. Create InferenceSession.
   */
  private async _init(): Promise<void> {
    // 1. Load runtime.
    const ort = await _loadOrtRuntime();
    if (!ort) {
      console.warn(
        '[Obfusca ONNXSemanticDetector] onnxruntime-web is unavailable ' +
          '(WASM disabled or package not installed). ' +
          'Falling back to regex + NER-only detection.',
      );
      this._runtimeUnavailable = true;
      return;
    }
    this._ort = ort;

    // 2. Ensure model buffer is available.
    const modelStatus = this.loader.getStatus();
    if (modelStatus.state === 'not_downloaded' || modelStatus.state === 'error') {
      // loadModel() must be called externally with a ModelConfig first.
      // This init will be retried on the next detect() call.
      console.warn(
        '[Obfusca ONNXSemanticDetector] Model is not loaded. ' +
          'Call ModelLoader.loadModel(config) before detect().',
      );
      this._initAttempted = false; // Allow retry once model is loaded.
      return;
    }
    if (modelStatus.state === 'downloading') {
      // Model is in-flight — wait for the next detect() call.
      this._initAttempted = false;
      return;
    }

    // modelStatus.state === 'ready'
    const modelBuffer = await this.loader.loadModel(
      // ModelLoader.loadModel() returns the cached buffer without re-downloading
      // when the model is already 'ready'. We re-use the same config shape here;
      // the loader returns immediately from cache.
      {
        url: '', // Not used — loader is already in 'ready' state.
        expectedSha256: '', // Not re-validated — already validated on first load.
        modelId: '', // Resolved from internal metadata.
        version: modelStatus.version,
      },
    ).catch(() => null);

    if (!modelBuffer) {
      console.warn('[Obfusca ONNXSemanticDetector] Could not retrieve model buffer.');
      return;
    }

    // 3. Create InferenceSession.
    try {
      this._session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: [this._cfg.executionProvider],
        graphOptimizationLevel: 'all',
        logSeverityLevel: 3, // errors only
      });
      console.log(
        `[Obfusca ONNXSemanticDetector] InferenceSession ready (${modelStatus.version}).`,
      );
    } catch (err) {
      console.warn('[Obfusca ONNXSemanticDetector] Failed to create InferenceSession:', err);
    }
  }

  /**
   * Core inference pass.
   *
   * Prompt format (from §4.3 of the architecture doc):
   *   "[RULE: {instruction}] ... [TEXT: {text}]"
   *
   * The model is expected to output a JSON array of detections:
   *   [{"type":"...", "displayName":"...", "start":N, "end":N, "confidence":0.X}]
   *
   * NOTE: Real inference requires a tokenizer to convert the prompt to input_ids
   * and an attention_mask tensor, and a decoder to convert output_ids back to
   * text. The tokenizer is injected via the constructor.
   */
  private async _infer(text: string, rules?: SemanticRule[]): Promise<SemanticDetection[]> {
    if (!this._session || !this._ort || !this.tokenizer) return [];

    const prompt = this._buildPrompt(text, rules);
    const { input_ids, attention_mask } = this.tokenizer.encode(prompt);

    const seqLen = input_ids.length;

    const inputIdsTensor = new this._ort.Tensor(
      'int64',
      new BigInt64Array(input_ids.map(BigInt)),
      [1, seqLen],
    );
    const attentionMaskTensor = new this._ort.Tensor(
      'int64',
      new BigInt64Array(attention_mask.map(BigInt)),
      [1, seqLen],
    );

    const feeds: Record<string, OrtTensor> = {
      input_ids: inputIdsTensor,
      attention_mask: attentionMaskTensor,
    };

    const results = await this._session.run(feeds);

    // The model is expected to produce a 'logits' or 'output' tensor whose
    // first sequence maps to generated token IDs. Decode to JSON and parse.
    const outputKey = this._session.outputNames[0] ?? 'logits';
    const outputTensor = results[outputKey];
    if (!outputTensor) return [];

    return this._parseOutput(outputTensor.data as ArrayLike<number>);
  }

  /**
   * Build the instruction-following prompt fed to the model.
   * All enabled rules are prepended as [RULE: ...] tags.
   */
  private _buildPrompt(text: string, rules?: SemanticRule[]): string {
    const enabledRules = (rules ?? []).filter((r) => r.enabled);
    if (enabledRules.length === 0) {
      return `[TEXT: ${text}]`;
    }
    const rulePart = enabledRules
      .map((r) => `[RULE: ${r.detection_instruction}]`)
      .join(' ');
    return `${rulePart} [TEXT: ${text}]`;
  }

  /**
   * Parse raw output token IDs (decoded to text by the tokenizer) into
   * SemanticDetection[].
   *
   * Expected model output format (JSON string in decoded text):
   * [{"type":"...", "displayName":"...", "start":N, "end":N, "confidence":0.X}]
   *
   * Unknown or malformed output returns [].
   */
  private _parseOutput(rawOutputIds: ArrayLike<number>): SemanticDetection[] {
    if (!this.tokenizer) return [];

    const decoded = this.tokenizer.decode(Array.from(rawOutputIds));

    // Extract JSON array from decoded text (model may emit surrounding prose).
    const match = decoded.match(/\[[\s\S]*\]/);
    if (!match) return [];

    try {
      const parsed = JSON.parse(match[0]) as unknown[];
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter(
          (item): item is Record<string, unknown> =>
            typeof item === 'object' && item !== null,
        )
        .flatMap((item): SemanticDetection[] => {
          if (
            typeof item.type === 'string' &&
            typeof item.start === 'number' &&
            typeof item.end === 'number' &&
            typeof item.confidence === 'number'
          ) {
            return [
              {
                type: item.type,
                displayName:
                  typeof item.displayName === 'string' ? item.displayName : item.type,
                start: item.start,
                end: item.end,
                confidence: Math.min(1, Math.max(0, item.confidence)),
                source: 'local_model',
              },
            ];
          }
          return [];
        });
    } catch {
      return [];
    }
  }

  /** Race a promise against a timeout. Rejects with TimeoutError on expiry. */
  private _runWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Inference timeout after ${ms}ms`)), ms),
    );
    return Promise.race([promise, timeout]);
  }
}
