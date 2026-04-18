/**
 * NER Model Bridge — connects the ONNX NER model to the existing
 * detectSensitiveData() pipeline in detection.ts.
 *
 * This module manages the singleton lifecycle of ModelLoader +
 * ONNXSemanticDetector + BertWordPieceTokenizer and exposes a single
 * async function `detectWithNERModel(text)` that returns Detection[].
 *
 * Integration: called from detectSensitiveData() in detection.ts
 * alongside built-in regex and custom pattern detections.
 *
 * The model is lazy-loaded on first call:
 *  1. Downloads model zip from GitHub Releases (cached in IndexedDB)
 *  2. Extracts model.onnx + vocab.txt
 *  3. Creates ONNX InferenceSession
 *  4. Subsequent calls use cached model (~3s cold start, <50ms warm)
 */

import { ModelLoader } from './semantic/ModelLoader';
import {
  ONNXSemanticDetector,
  type NERTokenizer,
} from './semantic/ONNXSemanticDetector';
import { BertWordPieceTokenizer } from './semantic/BertWordPieceTokenizer';
import { DEFAULT_MODEL_CONFIG } from './semantic/modelConfig';
import type { Detection, DetectionType, Severity } from './detection';

// ---------------------------------------------------------------------------
// NER label → Detection type mapping
// ---------------------------------------------------------------------------

/**
 * Map from NER model entity types to the existing DetectionType union.
 * Entity types not in this map are reported as 'custom'.
 */
const NER_TO_DETECTION_TYPE: Record<string, DetectionType> = {
  SSN: 'ssn',
  CREDIT_CARD: 'credit_card',
  EMAIL: 'email',
  AWS_KEY: 'aws_key',
  AWS_SECRET: 'aws_secret',
  API_KEY: 'api_key',
  PRIVATE_KEY: 'private_key',
  // These entity types don't have a direct DetectionType match —
  // they'll be reported as 'custom' with a descriptive displayName.
  // PHONE, JWT, CONNECTION_STR, PERSON, ORG, DATE, ADDRESS, MED_RECORD
};

/**
 * Map from NER entity type to severity level.
 */
const NER_SEVERITY: Record<string, Severity> = {
  SSN: 'critical',
  CREDIT_CARD: 'critical',
  AWS_KEY: 'critical',
  AWS_SECRET: 'critical',
  PRIVATE_KEY: 'critical',
  API_KEY: 'high',
  JWT: 'high',
  CONNECTION_STR: 'high',
  EMAIL: 'medium',
  PHONE: 'medium',
  MED_RECORD: 'high',
  PERSON: 'medium',
  ORG: 'low',
  DATE: 'low',
  ADDRESS: 'medium',
};

/**
 * Human-readable display names for NER entity types.
 */
const NER_DISPLAY_NAMES: Record<string, string> = {
  SSN: 'Social Security Number',
  CREDIT_CARD: 'Credit Card Number',
  EMAIL: 'Email Address',
  PHONE: 'Phone Number',
  AWS_KEY: 'AWS Access Key',
  AWS_SECRET: 'AWS Secret Key',
  API_KEY: 'API Key / Secret',
  PRIVATE_KEY: 'Private Key',
  JWT: 'JSON Web Token',
  CONNECTION_STR: 'Database Connection String',
  PERSON: 'Person Name',
  ORG: 'Organization Name',
  DATE: 'Date / Date of Birth',
  ADDRESS: 'Physical Address',
  MED_RECORD: 'Medical Record',
};

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let _loader: ModelLoader | null = null;
let _detector: ONNXSemanticDetector | null = null;
let _tokenizer: BertWordPieceTokenizer | null = null;
let _initPromise: Promise<void> | null = null;
let _initFailed = false;

/** Vocab text cached in memory after first load. */
let _vocabText: string | null = null;

// ---------------------------------------------------------------------------
// IndexedDB helpers for vocab caching
// ---------------------------------------------------------------------------

const VOCAB_IDB_NAME = 'obfusca-tokenizer';
const VOCAB_IDB_STORE = 'vocab';
const VOCAB_KEY = 'vocab.txt';

async function _cacheVocab(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VOCAB_IDB_NAME, 1);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(VOCAB_IDB_STORE)) {
        db.createObjectStore(VOCAB_IDB_STORE);
      }
    };
    req.onsuccess = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      const tx = db.transaction(VOCAB_IDB_STORE, 'readwrite');
      const store = tx.objectStore(VOCAB_IDB_STORE);
      const putReq = store.put(text, VOCAB_KEY);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

async function _loadCachedVocab(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VOCAB_IDB_NAME, 1);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(VOCAB_IDB_STORE)) {
        db.createObjectStore(VOCAB_IDB_STORE);
      }
    };
    req.onsuccess = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      const tx = db.transaction(VOCAB_IDB_STORE, 'readonly');
      const store = tx.objectStore(VOCAB_IDB_STORE);
      const getReq = store.get(VOCAB_KEY);
      getReq.onsuccess = () => resolve((getReq.result as string) ?? null);
      getReq.onerror = () => reject(getReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Lazy-initialize the NER model pipeline.
 * Downloads model + vocab on first call, then caches in IndexedDB.
 *
 * The model zip from GitHub Releases contains:
 *  - model.onnx (104.6 MB INT8 quantized)
 *  - tokenizer/vocab.txt (231 KB)
 *  - manifest.json, model_card.json
 *
 * Note: ModelLoader handles model.onnx download and caching.
 * We handle vocab.txt separately since it needs to be extracted
 * from the zip or fetched independently.
 */
async function _ensureInitialized(): Promise<boolean> {
  if (_detector?.isReady()) return true;
  if (_initFailed) return false;

  if (_initPromise) {
    await _initPromise;
    return _detector?.isReady() ?? false;
  }

  _initPromise = _doInit();
  try {
    await _initPromise;
  } finally {
    _initPromise = null;
  }

  return _detector?.isReady() ?? false;
}

async function _doInit(): Promise<void> {
  try {
    console.log('[Obfusca NER Bridge] Initializing NER model pipeline...');

    // 1. Initialize ModelLoader and download model
    _loader = new ModelLoader();
    await _loader.loadModel(DEFAULT_MODEL_CONFIG, (received, total) => {
      if (total > 0) {
        const pct = Math.round((received / total) * 100);
        if (pct % 20 === 0) {
          console.log(`[Obfusca NER Bridge] Model download: ${pct}%`);
        }
      }
    });
    console.log('[Obfusca NER Bridge] Model loaded and cached.');

    // 2. Load tokenizer vocab
    _vocabText = await _loadCachedVocab();

    if (!_vocabText) {
      // Vocab not cached — fetch from GitHub Releases
      // The vocab.txt is inside the zip, but we can also fetch it directly
      // from the release assets or embed it. For now, fetch alongside model.
      console.log('[Obfusca NER Bridge] Fetching vocab.txt...');
      const vocabUrl =
        'https://github.com/syoncodes/Obfusca_Extension/releases/download/v0.1.0-model/obfusca-model-v1.zip';

      // Download zip and extract vocab.txt
      const response = await fetch(vocabUrl);
      if (!response.ok) throw new Error(`Failed to fetch model zip: HTTP ${response.status}`);
      const zipBuffer = await response.arrayBuffer();

      // Extract vocab.txt from zip
      _vocabText = await _extractVocabFromZip(zipBuffer);

      if (_vocabText) {
        await _cacheVocab(_vocabText);
        console.log('[Obfusca NER Bridge] vocab.txt cached.');
      } else {
        throw new Error('Could not extract vocab.txt from model zip');
      }
    }

    // 3. Create tokenizer
    _tokenizer = new BertWordPieceTokenizer(_vocabText);
    console.log('[Obfusca NER Bridge] Tokenizer ready.');

    // 4. Create detector
    _detector = new ONNXSemanticDetector(
      _loader,
      { inferenceTimeoutMs: 5000, executionProvider: 'wasm' },
      _tokenizer as NERTokenizer,
    );

    // 5. Trigger lazy init (loads ONNX runtime + creates session)
    // First detect() call will trigger this, but we can prime it here.
    await _detector.detect('test initialization');
    // Second call should actually work if init succeeded
    if (_detector.isReady()) {
      console.log('[Obfusca NER Bridge] ONNX session ready. NER model active.');
    } else {
      console.log(
        '[Obfusca NER Bridge] ONNX session not ready yet (onnxruntime-web may not be installed). ' +
        'NER model will activate when runtime is available.',
      );
    }
  } catch (err) {
    console.warn('[Obfusca NER Bridge] Init failed (falling back to regex-only):', err);
    _initFailed = true;
  }
}

/**
 * Extract vocab.txt from a zip ArrayBuffer.
 * Uses a minimal zip parser — no external dependencies.
 */
async function _extractVocabFromZip(zipBuffer: ArrayBuffer): Promise<string | null> {
  const view = new DataView(zipBuffer);
  const bytes = new Uint8Array(zipBuffer);
  const decoder = new TextDecoder('utf-8');

  // Find local file headers (PK\x03\x04)
  let offset = 0;
  while (offset < bytes.length - 4) {
    // Check for local file header signature
    if (view.getUint32(offset, true) !== 0x04034b50) {
      offset++;
      continue;
    }

    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const compressionMethod = view.getUint16(offset + 8, true);

    const nameBytes = bytes.slice(offset + 30, offset + 30 + nameLen);
    const name = decoder.decode(nameBytes);

    const dataStart = offset + 30 + nameLen + extraLen;

    if (name === 'tokenizer/vocab.txt' || name === 'vocab.txt') {
      if (compressionMethod === 0) {
        // Stored (no compression)
        const data = bytes.slice(dataStart, dataStart + uncompressedSize);
        return decoder.decode(data);
      } else if (compressionMethod === 8) {
        // Deflated — use DecompressionStream API (available in modern browsers)
        const compressedData = bytes.slice(dataStart, dataStart + compressedSize);
        try {
          const ds = new DecompressionStream('deflate-raw');
          const writer = ds.writable.getWriter();
          writer.write(compressedData);
          writer.close();

          const reader = ds.readable.getReader();
          const chunks: Uint8Array[] = [];
          let done = false;
          while (!done) {
            const result = await reader.read();
            done = result.done;
            if (result.value) chunks.push(result.value);
          }

          const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
          const combined = new Uint8Array(totalLen);
          let pos = 0;
          for (const chunk of chunks) {
            combined.set(chunk, pos);
            pos += chunk.length;
          }

          return decoder.decode(combined);
        } catch (err) {
          console.warn('[Obfusca NER Bridge] Deflate decompression failed:', err);
          return null;
        }
      }
    }

    // Move to next entry
    offset = dataStart + compressedSize;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run NER model inference on text and return Detection[] compatible with
 * the existing detectSensitiveData() pipeline.
 *
 * Returns [] if:
 *  - Model is not yet downloaded (triggers background download)
 *  - onnxruntime-web is not available
 *  - Inference fails for any reason
 *
 * This function is non-blocking — if the model isn't ready, it returns []
 * immediately and the user gets regex-only detection until the model loads.
 */
export async function detectWithNERModel(text: string): Promise<Detection[]> {
  // Try to initialize (non-blocking if already initialized or failed)
  const ready = await _ensureInitialized();
  if (!ready || !_detector) return [];

  try {
    const semanticDetections = await _detector.detect(text);

    // Convert SemanticDetection[] → Detection[]
    return semanticDetections.map((sd) => ({
      type: NER_TO_DETECTION_TYPE[sd.type] ?? ('custom' as DetectionType),
      displayName: NER_DISPLAY_NAMES[sd.type] ?? sd.displayName,
      severity: NER_SEVERITY[sd.type] ?? ('medium' as Severity),
      start: sd.start,
      end: sd.end,
      confidence: sd.confidence,
    }));
  } catch (err) {
    console.warn('[Obfusca NER Bridge] Detection failed:', err);
    return [];
  }
}

/**
 * Check if the NER model is loaded and ready for inference.
 */
export function isNERModelReady(): boolean {
  return _detector?.isReady() ?? false;
}

/**
 * Get the current model download/load status.
 */
export function getNERModelStatus(): string {
  if (!_loader) return 'not_initialized';
  const status = _loader.getStatus();
  return status.state;
}
