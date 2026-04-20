/**
 * ContextClassifier — Layer 3 of the three-layer detection cascade.
 *
 * Runs a DistilBERT multi-label classifier in the browser via ONNX Runtime WASM.
 * Takes detection + surrounding context, outputs sensitivity category probabilities.
 *
 * Only runs on AMBIGUOUS detections (confidence 0.4–0.8 after Layer 2).
 * Model: DistilBERT-base INT8 (~64MB ONNX), ~3ms per chunk on WASM.
 */

import type { Detection, DetectionType, Severity } from './detection';
import { BertWordPieceTokenizer } from './semantic/BertWordPieceTokenizer';

const CATEGORIES = [
  'person_name', 'financial', 'medical', 'identity_document',
  'address', 'contact', 'date_pii', 'credentials',
  'organization', 'customer_data',
] as const;

type Category = typeof CATEGORIES[number];

const CATEGORY_TO_TYPE: Record<Category, DetectionType> = {
  person_name: 'person_name' as DetectionType,
  financial: 'financial' as DetectionType,
  medical: 'medical_record' as DetectionType,
  identity_document: 'identity_document' as DetectionType,
  address: 'address' as DetectionType,
  contact: 'email' as DetectionType,
  date_pii: 'date' as DetectionType,
  credentials: 'api_key' as DetectionType,
  organization: 'organization' as DetectionType,
  customer_data: 'financial' as DetectionType,
};

const CATEGORY_DISPLAY: Record<Category, string> = {
  person_name: 'Person Name',
  financial: 'Financial Information',
  medical: 'Medical Record',
  identity_document: 'Identity Document',
  address: 'Physical Address',
  contact: 'Contact Information',
  date_pii: 'Date / Date of Birth',
  credentials: 'Credential / Secret',
  organization: 'Organization Name',
  customer_data: 'Customer Data',
};

const CATEGORY_SEVERITY: Record<Category, Severity> = {
  person_name: 'medium' as Severity,
  financial: 'high' as Severity,
  medical: 'high' as Severity,
  identity_document: 'critical' as Severity,
  address: 'medium' as Severity,
  contact: 'low' as Severity,
  date_pii: 'medium' as Severity,
  credentials: 'critical' as Severity,
  organization: 'low' as Severity,
  customer_data: 'medium' as Severity,
};

const CONTEXT_WINDOW = 128;
const THRESHOLD = 0.5;
const AMBIGUOUS_LOW = 0.4;
const AMBIGUOUS_HIGH = 0.8;
const MAX_SEQ_LEN = 256;

// Shared state — reuses the same ONNX runtime as the NER model
let _ort: any = null;
let _session: any = null;
let _tokenizer: BertWordPieceTokenizer | null = null;
let _initialized = false;
let _initFailed = false;

async function _init(): Promise<boolean> {
  if (_initialized) return true;
  if (_initFailed) return false;

  try {
    // Load ONNX runtime (same approach as nerModelBridge.ts)
    const ortUrl = chrome.runtime.getURL('ort.all.bundle.min.mjs');
    try {
      _ort = await import(/* @vite-ignore */ ortUrl);
    } catch {
      _ort = await import(/* @vite-ignore */ 'onnxruntime-web');
    }

    const wasmBase = chrome.runtime.getURL('');
    if (_ort.env) {
      _ort.env.wasm.wasmPaths = wasmBase;
    }

    // Load context classifier model
    const modelUrl = chrome.runtime.getURL('model/context_classifier.onnx');
    console.log('[Obfusca L3] Loading context classifier...');
    const modelResponse = await fetch(modelUrl);
    if (!modelResponse.ok) throw new Error(`HTTP ${modelResponse.status}`);
    const modelBuffer = await modelResponse.arrayBuffer();
    const modelMB = (modelBuffer.byteLength / (1024 * 1024)).toFixed(1);

    _session = await _ort.InferenceSession.create(modelBuffer, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    console.log(`[Obfusca L3] Context classifier loaded: ${modelMB} MB`);
    console.log(`[Obfusca L3] Inputs: [${_session.inputNames}], Outputs: [${_session.outputNames}]`);

    // Load tokenizer (reuse same vocab as NER model)
    const vocabUrl = chrome.runtime.getURL('model/tokenizer/vocab.txt');
    const vocabResponse = await fetch(vocabUrl);
    if (!vocabResponse.ok) throw new Error(`Failed to load vocab: HTTP ${vocabResponse.status}`);
    const vocabText = await vocabResponse.text();
    _tokenizer = new BertWordPieceTokenizer(vocabText);
    console.log('[Obfusca L3] Tokenizer ready.');

    _initialized = true;
    return true;
  } catch (err) {
    console.log('[Obfusca L3] Context classifier not available:', err);
    _initFailed = true;
    return false;
  }
}

async function _classify(text: string): Promise<number[]> {
  if (!_session || !_ort || !_tokenizer) return new Array(CATEGORIES.length).fill(0);

  const encoded = _tokenizer.encode(text, MAX_SEQ_LEN);

  // Pad/truncate to exactly MAX_SEQ_LEN — the ONNX model has fixed input shape
  const inputIds = new Array(MAX_SEQ_LEN).fill(0);
  const attMask = new Array(MAX_SEQ_LEN).fill(0);
  for (let i = 0; i < Math.min(encoded.input_ids.length, MAX_SEQ_LEN); i++) {
    inputIds[i] = encoded.input_ids[i];
    attMask[i] = encoded.attention_mask[i];
  }

  const feeds: Record<string, any> = {
    input_ids: new _ort.Tensor('int64', new BigInt64Array(inputIds.map(BigInt)), [1, MAX_SEQ_LEN]),
    attention_mask: new _ort.Tensor('int64', new BigInt64Array(attMask.map(BigInt)), [1, MAX_SEQ_LEN]),
  };

  const results = await _session.run(feeds);
  const outputName = _session.outputNames[0];
  const logits: Float32Array = results[outputName].data;

  // Sigmoid
  const probs: number[] = [];
  for (let i = 0; i < CATEGORIES.length; i++) {
    probs.push(1 / (1 + Math.exp(-Number(logits[i]))));
  }
  return probs;
}

/**
 * Apply Layer 3 context classification to ambiguous detections.
 * Only processes detections with confidence between 0.4 and 0.8.
 * Can boost, reclassify, or suppress detections based on classifier output.
 */
export async function applyContextClassification(
  text: string,
  detections: Detection[],
): Promise<Detection[]> {
  if (!_initialized) {
    const ok = await _init();
    if (!ok) return detections;
  }

  const result = [...detections];
  let classified = 0;

  for (const det of result) {
    // Only classify ambiguous detections
    if (det.confidence < AMBIGUOUS_LOW || det.confidence > AMBIGUOUS_HIGH) continue;

    const ctxStart = Math.max(0, det.start - CONTEXT_WINDOW);
    const ctxEnd = Math.min(text.length, det.end + CONTEXT_WINDOW);
    const chunk = text.slice(ctxStart, ctxEnd);

    const probs = await _classify(chunk);
    classified++;

    // Find best category
    let bestIdx = 0;
    let bestProb = 0;
    for (let i = 0; i < probs.length; i++) {
      if (probs[i] > bestProb) {
        bestProb = probs[i];
        bestIdx = i;
      }
    }

    const bestCat = CATEGORIES[bestIdx];

    if (bestProb > THRESHOLD) {
      // Classifier confirms sensitivity — boost confidence
      det.confidence = Math.min(0.95, det.confidence + (bestProb - 0.5) * 0.6);

      // Reclassify if classifier strongly disagrees with current type
      if (bestProb > 0.8 && det.type !== CATEGORY_TO_TYPE[bestCat]) {
        det.type = CATEGORY_TO_TYPE[bestCat];
        det.displayName = CATEGORY_DISPLAY[bestCat];
        det.severity = CATEGORY_SEVERITY[bestCat];
      }
    } else {
      // Classifier says not sensitive — lower confidence
      det.confidence = Math.max(0.1, det.confidence * 0.5);
    }
  }

  if (classified > 0) {
    console.log(`[Obfusca L3] Classified ${classified} ambiguous detections`);
  }

  return result.filter(d => d.confidence >= 0.3);
}
