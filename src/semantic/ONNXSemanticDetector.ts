/**
 * ONNXSemanticDetector — Tier 1 local NER inference via onnxruntime-web.
 *
 * This detector runs a BERT-base token classification model that outputs
 * per-token BIO logits. The pipeline:
 *
 *   1. Tokenize text → input_ids + attention_mask (via tokenizer.json)
 *   2. Run ONNX inference → logits tensor [1, seq_len, num_labels]
 *   3. Argmax per token → BIO label sequence
 *   4. Merge consecutive B-/I- spans → SemanticDetection[]
 *   5. Map token offsets back to character positions in original text
 *
 * The model is a BERT-base-uncased fine-tuned on 14,436 synthetic DLP
 * examples across 15 entity categories (SSN, CREDIT_CARD, EMAIL, PHONE,
 * API_KEY, AWS_KEY, AWS_SECRET, PRIVATE_KEY, JWT, CONNECTION_STR, PERSON,
 * ORG, DATE, ADDRESS, MED_RECORD).
 *
 * Test F1: 0.79 strict / 0.83 partial.
 *
 * See: /docs/local-semantic-architecture.md §4.2–4.3
 */

import type {
  ModelLoadStatus,
  SemanticDetection,
  SemanticRule,
} from './types';
import type { ModelLoader } from './ModelLoader';
import {
  NER_LABELS,
  ENTITY_DISPLAY_NAMES,
  DEFAULT_CONFIDENCE_THRESHOLD,
  MAX_SEQUENCE_LENGTH,
} from './modelConfig';

// ---------------------------------------------------------------------------
// Inline ORT type definitions (replaced when onnxruntime-web is installed)
// ---------------------------------------------------------------------------

interface OrtTensor {
  readonly dims: readonly number[];
  readonly data: Float32Array | BigInt64Array | Int32Array | ArrayLike<number>;
  readonly type: string;
}

interface OrtSession {
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  release(): Promise<void>;
}

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
// Tokenizer types (loaded from tokenizer.json via @huggingface/transformers
// or a bundled WordPiece implementation)
// ---------------------------------------------------------------------------

/**
 * Tokenizer output with offset mapping for character-level span recovery.
 * offset_mapping[i] = [char_start, char_end] for token i in the original text.
 * Special tokens (CLS, SEP, PAD) have offset [0, 0].
 */
interface TokenizerOutput {
  input_ids: number[];
  attention_mask: number[];
  /** Character offsets for each token: [start, end) pairs. */
  offset_mapping: Array<[number, number]>;
}

/**
 * Minimal tokenizer interface for NER.
 * Must support offset mapping for span recovery.
 */
export interface NERTokenizer {
  /**
   * Tokenize text and return token IDs, attention mask, and character offsets.
   * Must add [CLS] at start and [SEP] at end.
   * Must truncate to maxLength if needed.
   */
  encode(text: string, maxLength?: number): TokenizerOutput;
}

// ---------------------------------------------------------------------------
// Dynamic ORT import
// ---------------------------------------------------------------------------

async function _loadOrtRuntime(): Promise<OrtModule | null> {
  try {
    const moduleName = 'onnxruntime-web';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await (Function('m', 'return import(m)')(moduleName))) as OrtModule;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Async detector interface
// ---------------------------------------------------------------------------

export interface IAsyncSemanticDetector {
  isReady(): boolean;
  detect(text: string, rules?: SemanticRule[]): Promise<SemanticDetection[]>;
  getModelStatus(): ModelLoadStatus;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface DetectorConfig {
  /** Maximum milliseconds for a single inference call. Default: 5000. */
  inferenceTimeoutMs?: number;
  /** ONNX execution provider. Default: 'wasm'. */
  executionProvider?: string;
  /** Minimum softmax probability to report a detection. Default: 0.5. */
  confidenceThreshold?: number;
}

const DEFAULT_CONFIG: Required<DetectorConfig> = {
  inferenceTimeoutMs: 5000,
  executionProvider: 'wasm',
  confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
};

// ---------------------------------------------------------------------------
// ONNXSemanticDetector (NER token classification)
// ---------------------------------------------------------------------------

export class ONNXSemanticDetector implements IAsyncSemanticDetector {
  private _session: OrtSession | null = null;
  private _ort: OrtModule | null = null;
  private _initPromise: Promise<void> | null = null;
  private _initAttempted = false;
  private _runtimeUnavailable = false;
  private readonly _cfg: Required<DetectorConfig>;

  constructor(
    private readonly loader: ModelLoader,
    config: DetectorConfig = {},
    private readonly tokenizer: NERTokenizer | null = null,
  ) {
    this._cfg = { ...DEFAULT_CONFIG, ...config };
  }

  // -----------------------------------------------------------------------
  // IAsyncSemanticDetector
  // -----------------------------------------------------------------------

  isReady(): boolean {
    return this._session !== null && this.tokenizer !== null;
  }

  async detect(text: string, _rules?: SemanticRule[]): Promise<SemanticDetection[]> {
    if (this._runtimeUnavailable) return [];

    if (!this._session) {
      this._triggerLazyInit();
      return [];
    }

    if (!this.tokenizer) return [];

    try {
      return await this._runWithTimeout(
        this._infer(text),
        this._cfg.inferenceTimeoutMs,
      );
    } catch (err) {
      console.warn('[Obfusca ONNXSemanticDetector] Inference error:', err);
      return [];
    }
  }

  getModelStatus(): ModelLoadStatus {
    return this.loader.getStatus();
  }

  // -----------------------------------------------------------------------
  // Private: init
  // -----------------------------------------------------------------------

  private _triggerLazyInit(): void {
    if (this._initAttempted || this._initPromise) return;
    this._initPromise = this._init().finally(() => {
      this._initAttempted = true;
      this._initPromise = null;
    });
  }

  private async _init(): Promise<void> {
    const ort = await _loadOrtRuntime();
    if (!ort) {
      console.warn(
        '[Obfusca ONNXSemanticDetector] onnxruntime-web unavailable. ' +
        'Falling back to regex-only detection.',
      );
      this._runtimeUnavailable = true;
      return;
    }
    this._ort = ort;

    const modelStatus = this.loader.getStatus();
    if (modelStatus.state !== 'ready') {
      console.warn(
        '[Obfusca ONNXSemanticDetector] Model not loaded. ' +
        'Call ModelLoader.loadModel(config) first.',
      );
      this._initAttempted = false;
      return;
    }

    const modelBuffer = await this.loader.loadModel({
      url: '',
      expectedSha256: '',
      modelId: '',
      version: modelStatus.version,
    }).catch(() => null);

    if (!modelBuffer) {
      console.warn('[Obfusca ONNXSemanticDetector] Could not retrieve model buffer.');
      return;
    }

    try {
      this._session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: [this._cfg.executionProvider],
        graphOptimizationLevel: 'all',
        logSeverityLevel: 3,
      });
      console.log(
        `[Obfusca ONNXSemanticDetector] Session ready (${modelStatus.version}). ` +
        `Inputs: [${this._session.inputNames}], Outputs: [${this._session.outputNames}]`,
      );
    } catch (err) {
      console.warn('[Obfusca ONNXSemanticDetector] Failed to create session:', err);
    }
  }

  // -----------------------------------------------------------------------
  // Private: NER inference
  // -----------------------------------------------------------------------

  /**
   * Core NER inference pipeline:
   * 1. Tokenize → input_ids, attention_mask, offset_mapping
   * 2. Build ONNX tensors (int64)
   * 3. Run session → logits [1, seq_len, 31]
   * 4. Argmax + softmax per token → predicted BIO labels + confidences
   * 5. Merge B-/I- spans → SemanticDetection[]
   */
  private async _infer(text: string): Promise<SemanticDetection[]> {
    if (!this._session || !this._ort || !this.tokenizer) return [];

    // 1. Tokenize
    const { input_ids, attention_mask, offset_mapping } =
      this.tokenizer.encode(text, MAX_SEQUENCE_LENGTH);

    const seqLen = input_ids.length;

    // 2. Build tensors
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

    // Some BERT ONNX exports also require token_type_ids
    const tokenTypeIdsTensor = new this._ort.Tensor(
      'int64',
      new BigInt64Array(seqLen), // all zeros for single-sentence
      [1, seqLen],
    );

    const feeds: Record<string, OrtTensor> = {
      input_ids: inputIdsTensor,
      attention_mask: attentionMaskTensor,
    };

    // Add token_type_ids only if the model expects it
    if (this._session.inputNames.includes('token_type_ids')) {
      feeds.token_type_ids = tokenTypeIdsTensor;
    }

    // 3. Run inference
    const results = await this._session.run(feeds);

    const outputKey = this._session.outputNames[0] ?? 'logits';
    const outputTensor = results[outputKey];
    if (!outputTensor) return [];

    const logits = outputTensor.data as Float32Array;
    const numLabels = NER_LABELS.length; // 31

    // 4. Argmax + softmax per token
    const predictions: Array<{ labelIdx: number; confidence: number }> = [];
    for (let t = 0; t < seqLen; t++) {
      const offset = t * numLabels;
      let maxIdx = 0;
      let maxVal = -Infinity;

      // Find argmax
      for (let l = 0; l < numLabels; l++) {
        const val = logits[offset + l] as number;
        if (val > maxVal) {
          maxVal = val;
          maxIdx = l;
        }
      }

      // Compute softmax probability for the predicted class
      let sumExp = 0;
      for (let l = 0; l < numLabels; l++) {
        sumExp += Math.exp((logits[offset + l] as number) - maxVal);
      }
      const confidence = 1.0 / sumExp; // exp(maxVal - maxVal) / sumExp

      predictions.push({ labelIdx: maxIdx, confidence });
    }

    // 5. Merge B-/I- spans into detections
    return this._mergeSpans(predictions, offset_mapping, text);
  }

  /**
   * Merge per-token BIO predictions into character-level entity spans.
   *
   * Rules:
   *  - B-X starts a new entity of type X
   *  - I-X continues the current entity (only if same type X)
   *  - O ends any current entity
   *  - Special tokens (offset [0,0]) are skipped
   *  - Confidence = average softmax probability across all tokens in the span
   */
  private _mergeSpans(
    predictions: Array<{ labelIdx: number; confidence: number }>,
    offsets: Array<[number, number]>,
    text: string,
  ): SemanticDetection[] {
    const detections: SemanticDetection[] = [];

    let currentType: string | null = null;
    let spanStart = -1;
    let spanEnd = -1;
    let confSum = 0;
    let confCount = 0;

    const flush = () => {
      if (currentType && spanStart >= 0 && spanEnd > spanStart) {
        const avgConf = confSum / confCount;
        if (avgConf >= this._cfg.confidenceThreshold) {
          detections.push({
            type: currentType,
            displayName: ENTITY_DISPLAY_NAMES[currentType] ?? currentType,
            start: spanStart,
            end: spanEnd,
            confidence: Math.round(avgConf * 1000) / 1000,
            source: 'local_model',
          });
        }
      }
      currentType = null;
      spanStart = -1;
      spanEnd = -1;
      confSum = 0;
      confCount = 0;
    };

    for (let i = 0; i < predictions.length; i++) {
      const { labelIdx, confidence } = predictions[i];
      const [charStart, charEnd] = offsets[i];

      // Skip special tokens (CLS, SEP, PAD)
      if (charStart === 0 && charEnd === 0) {
        // Special token — flush any open span
        if (currentType) flush();
        continue;
      }

      const label = NER_LABELS[labelIdx];
      if (!label || label === 'O') {
        // Non-entity token
        flush();
        continue;
      }

      const prefix = label.substring(0, 2); // "B-" or "I-"
      const entityType = label.substring(2); // e.g. "SSN", "EMAIL"

      if (prefix === 'B-') {
        // Start of a new entity — flush any existing
        flush();
        currentType = entityType;
        spanStart = charStart;
        spanEnd = charEnd;
        confSum = confidence;
        confCount = 1;
      } else if (prefix === 'I-' && currentType === entityType) {
        // Continuation of the same entity type
        spanEnd = charEnd;
        confSum += confidence;
        confCount += 1;
      } else {
        // I- tag with mismatched type, or unexpected label — flush and start new
        flush();
        // Treat orphan I- as B- (common in NER post-processing)
        currentType = entityType;
        spanStart = charStart;
        spanEnd = charEnd;
        confSum = confidence;
        confCount = 1;
      }
    }

    // Flush final span
    flush();

    return detections;
  }

  // -----------------------------------------------------------------------
  // Timeout helper
  // -----------------------------------------------------------------------

  private _runWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Inference timeout after ${ms}ms`)), ms),
    );
    return Promise.race([promise, timeout]);
  }
}
