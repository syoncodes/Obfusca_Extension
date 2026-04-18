/**
 * ModelLoader — lazy download, SHA-256 validation, and caching for the
 * Tier 2 ONNX model binary.
 *
 * Storage strategy:
 *  - Model binary → IndexedDB (handles blobs up to ~80 % of available disk;
 *    avoids chrome.storage.local's ~5 MB per-item ceiling).
 *  - Metadata (modelId, version, sha256) → chrome.storage.local (tiny, fast).
 *
 * Cache-hit re-init target: < 3 s (no download required, only IDB read +
 * hash verification).
 *
 * See: /docs/local-semantic-architecture.md §4.3, §11.3
 */

import type { ModelConfig, ModelLoadStatus, DownloadProgressCallback } from './types';

// ---------------------------------------------------------------------------
// Storage adapter — abstracted for testability
// ---------------------------------------------------------------------------

/**
 * Pluggable storage backend for the raw model binary.
 * Production: IndexedDBModelStorage.
 * Tests:       InMemoryModelStorage (injected via constructor).
 */
export interface ModelStorageAdapter {
  save(modelId: string, data: ArrayBuffer): Promise<void>;
  load(modelId: string): Promise<ArrayBuffer | null>;
  remove(modelId: string): Promise<void>;
  has(modelId: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// IndexedDB implementation
// ---------------------------------------------------------------------------

const IDB_NAME = 'obfusca-models';
const IDB_STORE = 'model-blobs';
const IDB_VERSION = 1;

class IndexedDBModelStorage implements ModelStorageAdapter {
  private _db: IDBDatabase | null = null;

  private _open(): Promise<IDBDatabase> {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = (ev) => {
        const db = (ev.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = (ev) => {
        this._db = (ev.target as IDBOpenDBRequest).result;
        resolve(this._db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async save(modelId: string, data: ArrayBuffer): Promise<void> {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_STORE).put(data, modelId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async load(modelId: string): Promise<ArrayBuffer | null> {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(modelId);
      req.onsuccess = () => resolve((req.result as ArrayBuffer) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async remove(modelId: string): Promise<void> {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_STORE).delete(modelId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async has(modelId: string): Promise<boolean> {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).getKey(modelId);
      req.onsuccess = () => resolve(req.result !== undefined);
      req.onerror = () => reject(req.error);
    });
  }
}

// ---------------------------------------------------------------------------
// Chrome storage helpers (metadata only — never the model blob)
// ---------------------------------------------------------------------------

interface ModelMetadata {
  modelId: string;
  version: string;
  sha256: string;
}

const META_KEY = 'obfuscaModelMeta';

function _getMeta(): Promise<ModelMetadata | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([META_KEY], (result) => {
      resolve((result[META_KEY] as ModelMetadata) ?? null);
    });
  });
}

function _saveMeta(meta: ModelMetadata): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [META_KEY]: meta }, () => resolve());
  });
}

function _clearMeta(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(META_KEY, () => resolve());
  });
}

// ---------------------------------------------------------------------------
// SHA-256 helper
// ---------------------------------------------------------------------------

async function computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// ModelLoader
// ---------------------------------------------------------------------------

/**
 * Manages the lifecycle of the Tier 2 ONNX model:
 * download → validate → cache → serve from cache.
 *
 * @example
 * ```ts
 * const loader = new ModelLoader();
 * const buffer = await loader.loadModel({
 *   url: 'https://cdn.obfusca.io/models/smollm2-360m-dlp-int8-v1.onnx',
 *   expectedSha256: 'abcdef...',
 *   modelId: 'smollm2-360m-dlp',
 *   version: '1.0.0',
 * }, (received, total) => console.log(`${received}/${total}`));
 * ```
 */
export class ModelLoader {
  private _status: ModelLoadStatus = { state: 'not_downloaded' };
  /** Deduplicates concurrent loadModel() calls. */
  private _loadPromise: Promise<ArrayBuffer> | null = null;

  constructor(
    private readonly storage: ModelStorageAdapter = new IndexedDBModelStorage(),
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Load the model, preferring the local cache.
   *
   * - Cache hit + valid hash → returns buffer without network access.
   * - Cache miss or hash mismatch → downloads from config.url, validates,
   *   stores, and returns buffer.
   * - Concurrent calls share a single in-flight download.
   *
   * @throws Never — errors are captured into ModelLoadStatus.
   */
  async loadModel(
    config: ModelConfig,
    onProgress?: DownloadProgressCallback,
  ): Promise<ArrayBuffer> {
    // Deduplicate concurrent calls.
    if (this._loadPromise) return this._loadPromise;

    this._loadPromise = this._doLoad(config, onProgress).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this._setStatus({ state: 'error', message });
      this._loadPromise = null;
      throw err;
    });

    return this._loadPromise;
  }

  /** Returns the current model lifecycle state. Synchronous. */
  getStatus(): ModelLoadStatus {
    return this._status;
  }

  /**
   * Remove the cached model binary and metadata.
   * Sets status back to 'not_downloaded'.
   */
  async clearCache(): Promise<void> {
    const meta = await _getMeta();
    if (meta) {
      await this.storage.remove(meta.modelId);
    }
    await _clearMeta();
    this._setStatus({ state: 'not_downloaded' });
    this._loadPromise = null;
  }

  /**
   * Returns true if a model binary is cached AND its stored hash still
   * matches the chrome.storage.local metadata record.
   *
   * Does NOT re-hash the binary (fast path).
   */
  async isModelCached(): Promise<boolean> {
    const meta = await _getMeta();
    if (!meta) return false;
    return this.storage.has(meta.modelId);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async _doLoad(
    config: ModelConfig,
    onProgress?: DownloadProgressCallback,
  ): Promise<ArrayBuffer> {
    // --- Cache check ---
    const meta = await _getMeta();
    const blobExists = meta ? await this.storage.has(meta.modelId) : false;

    if (meta && blobExists && meta.sha256 === config.expectedSha256.toLowerCase()) {
      const cached = await this.storage.load(meta.modelId);
      if (cached) {
        this._setStatus({ state: 'ready', version: meta.version });
        this._loadPromise = null;
        return cached;
      }
    }

    // --- Download ---
    this._setStatus({ state: 'downloading', progress: 0 });
    let buffer: ArrayBuffer;
    try {
      buffer = await this._download(config.url, (received, total) => {
        const progress = total > 0 ? received / total : 0;
        this._setStatus({ state: 'downloading', progress });
        onProgress?.(received, total);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error during model download';
      this._setStatus({ state: 'error', message });
      throw new Error(message);
    }

    // --- Validate ---
    const actualHash = await computeSha256Hex(buffer);
    if (actualHash !== config.expectedSha256.toLowerCase()) {
      const message =
        `SHA-256 mismatch for model "${config.modelId}". ` +
        `Expected ${config.expectedSha256}, got ${actualHash}. ` +
        'Download may be corrupt or tampered with.';
      this._setStatus({ state: 'error', message });
      throw new Error(message);
    }

    // --- Store ---
    try {
      await this.storage.save(config.modelId, buffer);
      await _saveMeta({
        modelId: config.modelId,
        version: config.version,
        sha256: actualHash,
      });
    } catch (err) {
      // Storage full or quota exceeded — still return buffer for this session.
      const message =
        err instanceof Error ? err.message : 'Storage error — model will not be cached';
      console.warn(`[Obfusca ModelLoader] Cache write failed: ${message}`);
      // Don't set error state; the buffer is valid, just not persisted.
    }

    this._setStatus({ state: 'ready', version: config.version });
    this._loadPromise = null;
    return buffer;
  }

  private async _download(
    url: string,
    onProgress?: (received: number, total: number) => void,
  ): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching model from ${url}`);
    }
    if (!response.body) {
      // Fallback: no streaming — read in one shot.
      return response.arrayBuffer();
    }

    const contentLength = response.headers.get('Content-Length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress?.(received, total);
    }

    // Assemble all chunks into a single ArrayBuffer.
    const combined = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return combined.buffer;
  }

  private _setStatus(s: ModelLoadStatus): void {
    this._status = s;
  }
}
