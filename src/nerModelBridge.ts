/**
 * NER Model Bridge — connects the ONNX NER model to the existing
 * detectSensitiveData() pipeline in detection.ts.
 *
 * Loads model.onnx and vocab.txt from the extension's bundled files
 * (dist/model/) — no network fetch, no CORS issues.
 */

import { BertWordPieceTokenizer } from './semantic/BertWordPieceTokenizer';
import {
  NER_LABELS,
  ENTITY_DISPLAY_NAMES,
  DEFAULT_CONFIDENCE_THRESHOLD,
  MAX_SEQUENCE_LENGTH,
} from './semantic/modelConfig';
import type { Detection, DetectionType, Severity } from './detection';

const NER_TO_DETECTION_TYPE: Record<string, DetectionType> = {
  SSN: 'ssn', CREDIT_CARD: 'credit_card', EMAIL: 'email',
  AWS_KEY: 'aws_key', AWS_SECRET: 'aws_secret', API_KEY: 'api_key', PRIVATE_KEY: 'private_key',
};

const NER_SEVERITY: Record<string, Severity> = {
  SSN: 'critical', CREDIT_CARD: 'critical', AWS_KEY: 'critical', AWS_SECRET: 'critical',
  PRIVATE_KEY: 'critical', API_KEY: 'high', JWT: 'high', CONNECTION_STR: 'high',
  EMAIL: 'medium', PHONE: 'medium', MED_RECORD: 'high', PERSON: 'medium',
  ORG: 'low', DATE: 'low', ADDRESS: 'medium', FINANCIAL: 'high', ID_DOC: 'critical', IP_ADDR: 'medium',
};

const NER_DISPLAY_NAMES: Record<string, string> = {
  SSN: 'Social Security Number', CREDIT_CARD: 'Credit Card Number', EMAIL: 'Email Address',
  PHONE: 'Phone Number', AWS_KEY: 'AWS Access Key', AWS_SECRET: 'AWS Secret Key',
  API_KEY: 'API Key / Secret', PRIVATE_KEY: 'Private Key', JWT: 'JSON Web Token',
  CONNECTION_STR: 'Database Connection String', PERSON: 'Person Name', ORG: 'Organization Name',
  DATE: 'Date / Date of Birth', ADDRESS: 'Physical Address', MED_RECORD: 'Medical Record', FINANCIAL: 'Financial Information', ID_DOC: 'Identity Document', IP_ADDR: 'IP Address',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _ort: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _session: any = null;
let _tokenizer: BertWordPieceTokenizer | null = null;
let _initPromise: Promise<void> | null = null;
let _initFailed = false;
let _ready = false;

async function _ensureInitialized(): Promise<boolean> {
  if (_ready) return true;
  if (_initFailed) return false;
  if (_initPromise) { await _initPromise; return _ready; }
  _initPromise = _doInit();
  try { await _initPromise; } finally { _initPromise = null; }
  return _ready;
}

async function _doInit(): Promise<void> {
  try {
    console.log('[Obfusca NER Bridge] Initializing NER model pipeline...');

    try {
      // Load ONNX runtime from bundled extension file (not Vite-bundled)
      const ortUrl = chrome.runtime.getURL('ort.all.bundle.min.mjs');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _ort = await import(/* @vite-ignore */ ortUrl);
    } catch (e) {
      console.warn('[Obfusca NER Bridge] onnxruntime-web not available:', e);
      _initFailed = true;
      return;
    }

    // Set WASM paths so ONNX runtime can find the worker files
    const wasmBase = chrome.runtime.getURL('');
    if (_ort.env) {
      _ort.env.wasm.wasmPaths = wasmBase;
    }

    const modelUrl = chrome.runtime.getURL('model/model.onnx');
    console.log('[Obfusca NER Bridge] Loading model from:', modelUrl);
    const modelResponse = await fetch(modelUrl);
    if (!modelResponse.ok) throw new Error(`Failed to load model.onnx: HTTP ${modelResponse.status}`);
    const modelBuffer = await modelResponse.arrayBuffer();
    console.log(`[Obfusca NER Bridge] Model loaded: ${(modelBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`);

    _session = await _ort.InferenceSession.create(modelBuffer, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      logSeverityLevel: 3,
    });
    console.log(`[Obfusca NER Bridge] ONNX session ready. Inputs: [${_session.inputNames}], Outputs: [${_session.outputNames}]`);

    const vocabUrl = chrome.runtime.getURL('model/tokenizer/vocab.txt');
    const vocabResponse = await fetch(vocabUrl);
    if (!vocabResponse.ok) throw new Error(`Failed to load vocab.txt: HTTP ${vocabResponse.status}`);
    const vocabText = await vocabResponse.text();
    _tokenizer = new BertWordPieceTokenizer(vocabText);
    console.log('[Obfusca NER Bridge] Tokenizer ready.');

    _ready = true;
    console.log('[Obfusca NER Bridge] NER model fully initialized.');
  } catch (err) {
    console.warn('[Obfusca NER Bridge] Init failed (falling back to regex-only):', err);
    _initFailed = true;
  }
}

async function _runInference(text: string): Promise<Detection[]> {
  if (!_session || !_ort || !_tokenizer) return [];

  const { input_ids, attention_mask, offset_mapping } = _tokenizer.encode(text, MAX_SEQUENCE_LENGTH);
  const seqLen = input_ids.length;

  const feeds: Record<string, unknown> = {
    input_ids: new _ort.Tensor('int64', new BigInt64Array(input_ids.map(BigInt)), [1, seqLen]),
    attention_mask: new _ort.Tensor('int64', new BigInt64Array(attention_mask.map(BigInt)), [1, seqLen]),
  };
  if (_session.inputNames.includes('token_type_ids')) {
    feeds.token_type_ids = new _ort.Tensor('int64', new BigInt64Array(seqLen), [1, seqLen]);
  }

  const results = await _session.run(feeds);
  const outputKey = _session.outputNames[0] ?? 'logits';
  const outputTensor = results[outputKey];
  if (!outputTensor) return [];

  const logits = outputTensor.data as Float32Array;
  const numLabels = NER_LABELS.length;

  const predictions: Array<{ labelIdx: number; confidence: number }> = [];
  for (let t = 0; t < seqLen; t++) {
    const off = t * numLabels;
    let maxIdx = 0, maxVal = -Infinity;
    for (let l = 0; l < numLabels; l++) {
      const v = logits[off + l] as number;
      if (v > maxVal) { maxVal = v; maxIdx = l; }
    }
    let sumExp = 0;
    for (let l = 0; l < numLabels; l++) sumExp += Math.exp((logits[off + l] as number) - maxVal);
    predictions.push({ labelIdx: maxIdx, confidence: 1.0 / sumExp });
  }

  return _mergeSpans(predictions, offset_mapping);
}

function _mergeSpans(
  predictions: Array<{ labelIdx: number; confidence: number }>,
  offsets: Array<[number, number]>,
): Detection[] {
  const detections: Detection[] = [];
  let currentType: string | null = null;
  let spanStart = -1, spanEnd = -1, confSum = 0, confCount = 0;

  const flush = () => {
    if (currentType && spanStart >= 0 && spanEnd > spanStart) {
      const avgConf = confSum / confCount;
      if (avgConf >= DEFAULT_CONFIDENCE_THRESHOLD) {
        detections.push({
          type: NER_TO_DETECTION_TYPE[currentType] ?? ('custom' as DetectionType),
          displayName: NER_DISPLAY_NAMES[currentType] ?? ENTITY_DISPLAY_NAMES[currentType] ?? currentType,
          severity: NER_SEVERITY[currentType] ?? ('medium' as Severity),
          start: spanStart, end: spanEnd,
          confidence: Math.round(avgConf * 1000) / 1000,
        });
      }
    }
    currentType = null; spanStart = -1; spanEnd = -1; confSum = 0; confCount = 0;
  };

  for (let i = 0; i < predictions.length; i++) {
    const { labelIdx, confidence } = predictions[i];
    const [charStart, charEnd] = offsets[i];
    if (charStart === 0 && charEnd === 0) { if (currentType) flush(); continue; }
    const label = NER_LABELS[labelIdx];
    if (!label || label === 'O') { flush(); continue; }
    const prefix = label.substring(0, 2);
    const entityType = label.substring(2);
    if (prefix === 'B-') {
      flush(); currentType = entityType; spanStart = charStart; spanEnd = charEnd; confSum = confidence; confCount = 1;
    } else if (prefix === 'I-' && currentType === entityType) {
      spanEnd = charEnd; confSum += confidence; confCount += 1;
    } else {
      flush(); currentType = entityType; spanStart = charStart; spanEnd = charEnd; confSum = confidence; confCount = 1;
    }
  }
  flush();
  return detections;
}

export async function detectWithNERModel(text: string): Promise<Detection[]> {
  const ready = await _ensureInitialized();
  if (!ready) return [];
  try { return await _runInference(text); }
  catch (err) { console.warn('[Obfusca NER Bridge] Detection failed:', err); return []; }
}

export function isNERModelReady(): boolean { return _ready; }
export function getNERModelStatus(): string {
  if (_ready) return 'ready';
  if (_initFailed) return 'failed';
  if (_initPromise) return 'loading';
  return 'not_initialized';
}
