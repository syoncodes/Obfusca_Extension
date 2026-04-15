/**
 * Tests for src/semantic/ModelLoader.ts
 *
 * Covers:
 *  - Cache hit: returns model without re-downloading
 *  - Cache miss: triggers download
 *  - SHA-256 validation (accept correct hash, reject bad hash)
 *  - ModelLoadStatus transitions (not_downloaded -> downloading -> ready / error)
 *  - clearCache removes binary and metadata
 *  - isModelCached reflects storage state
 *  - Download progress callbacks
 *  - Network failures handled gracefully
 *  - Storage-full errors handled gracefully (model still returned in-session)
 *  - Concurrent loadModel() calls share one download
 *
 * NOTE: This file lives in src/semantic/__tests__/ per M8 spec.
 * To run it with the project test runner:
 *   npx vitest run --config /dev/null src/semantic/__tests__/ModelLoader.test.ts
 * To include in the main suite, extend the include pattern in vitest.config.ts.
 *
 * Chrome mock and fetch mock are set up inline — no dependency on tests/setup.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ModelLoader } from '../ModelLoader';
import type { ModelStorageAdapter } from '../ModelLoader';
import type { ModelConfig } from '../types';

// ---------------------------------------------------------------------------
// In-memory ModelStorageAdapter (injected into ModelLoader for all tests)
// ---------------------------------------------------------------------------

class InMemoryStorage implements ModelStorageAdapter {
  readonly store = new Map<string, ArrayBuffer>();
  readonly callCounts = { save: 0, load: 0, remove: 0, has: 0 };
  shouldThrowOnSave = false;

  async save(modelId: string, data: ArrayBuffer): Promise<void> {
    this.callCounts.save++;
    if (this.shouldThrowOnSave) throw new Error('QuotaExceededError: storage full');
    this.store.set(modelId, data);
  }

  async load(modelId: string): Promise<ArrayBuffer | null> {
    this.callCounts.load++;
    return this.store.get(modelId) ?? null;
  }

  async remove(modelId: string): Promise<void> {
    this.callCounts.remove++;
    this.store.delete(modelId);
  }

  async has(modelId: string): Promise<boolean> {
    this.callCounts.has++;
    return this.store.has(modelId);
  }
}

// ---------------------------------------------------------------------------
// Chrome storage mock
// ---------------------------------------------------------------------------

const chromeStorageData: Record<string, unknown> = {};

const mockChrome = {
  storage: {
    local: {
      get: vi.fn((keys: string | string[], cb: (r: Record<string, unknown>) => void) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        const result: Record<string, unknown> = {};
        for (const k of keyList) {
          if (k in chromeStorageData) result[k] = chromeStorageData[k];
        }
        cb(result);
      }),
      set: vi.fn((items: Record<string, unknown>, cb?: () => void) => {
        Object.assign(chromeStorageData, items);
        cb?.();
      }),
      remove: vi.fn((keys: string | string[], cb?: () => void) => {
        for (const k of Array.isArray(keys) ? keys : [keys]) {
          delete chromeStorageData[k];
        }
        cb?.();
      }),
    },
    onChanged: { addListener: vi.fn() },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute real SHA-256 hex (Node 18+ / browser crypto). */
async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Build a small test model ArrayBuffer from a string. */
function makeModelBuffer(content = 'fake-onnx-model-data'): ArrayBuffer {
  return new TextEncoder().encode(content).buffer;
}

/** Build a ModelConfig with a correct SHA-256 for the given buffer. */
async function makeConfig(
  buffer: ArrayBuffer,
  overrides: Partial<ModelConfig> = {},
): Promise<ModelConfig> {
  return {
    url: 'https://cdn.example.com/model.onnx',
    expectedSha256: await sha256Hex(buffer),
    modelId: 'test-model',
    version: '1.0.0',
    ...overrides,
  };
}

/** Create a mock fetch that returns the given buffer. */
function makeFetch(
  buffer: ArrayBuffer,
  opts: { status?: number; contentLength?: number; streamable?: boolean } = {},
) {
  const { status = 200, contentLength, streamable = false } = opts;
  return vi.fn(async (_url: string) => {
    if (status !== 200) {
      return { ok: false, status, body: null, headers: new Headers() } as unknown as Response;
    }

    const headers = new Headers();
    if (contentLength !== undefined) {
      headers.set('Content-Length', String(contentLength));
    }

    if (streamable) {
      // Simulate a ReadableStream to exercise the chunked path.
      const bytes = new Uint8Array(buffer);
      const chunkSize = Math.ceil(bytes.length / 3);
      let offset = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset >= bytes.length) {
            controller.close();
            return;
          }
          controller.enqueue(bytes.slice(offset, offset + chunkSize));
          offset += chunkSize;
        },
      });
      return { ok: true, status: 200, body: stream, headers } as unknown as Response;
    }

    return {
      ok: true,
      status: 200,
      body: null,
      headers,
      arrayBuffer: async () => buffer,
    } as unknown as Response;
  });
}

// ---------------------------------------------------------------------------
// Test setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Install chrome mock.
  (globalThis as Record<string, unknown>).chrome = mockChrome;

  // Clear chrome storage data.
  for (const key of Object.keys(chromeStorageData)) {
    delete chromeStorageData[key];
  }

  // Reset vi mocks on chrome storage.
  vi.clearAllMocks();
  (globalThis as Record<string, unknown>).chrome = mockChrome;

  // Suppress console output.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  // Remove the global fetch stub if set.
  if ('fetch' in globalThis && typeof (globalThis as Record<string, unknown>).fetch === 'function') {
    delete (globalThis as Record<string, unknown>).fetch;
  }
});

// ===========================================================================
// 1. getStatus() — initial state
// ===========================================================================

describe('getStatus()', () => {
  it('returns not_downloaded before any loadModel() call', () => {
    const loader = new ModelLoader(new InMemoryStorage());
    expect(loader.getStatus()).toEqual({ state: 'not_downloaded' });
  });
});

// ===========================================================================
// 2. isModelCached()
// ===========================================================================

describe('isModelCached()', () => {
  it('returns false when storage is empty', async () => {
    const loader = new ModelLoader(new InMemoryStorage());
    expect(await loader.isModelCached()).toBe(false);
  });

  it('returns false when metadata exists but binary is missing from storage', async () => {
    // Inject metadata without putting anything in the binary store.
    chromeStorageData['obfuscaModelMeta'] = {
      modelId: 'test-model',
      version: '1.0.0',
      sha256: 'abc',
    };
    const store = new InMemoryStorage(); // empty binary store
    const loader = new ModelLoader(store);
    expect(await loader.isModelCached()).toBe(false);
  });

  it('returns true when both metadata and binary are present', async () => {
    const buffer = makeModelBuffer();
    const store = new InMemoryStorage();
    store.store.set('test-model', buffer);
    chromeStorageData['obfuscaModelMeta'] = {
      modelId: 'test-model',
      version: '1.0.0',
      sha256: await sha256Hex(buffer),
    };
    const loader = new ModelLoader(store);
    expect(await loader.isModelCached()).toBe(true);
  });
});

// ===========================================================================
// 3. Cache hit path
// ===========================================================================

describe('loadModel() — cache hit', () => {
  it('returns the cached buffer without calling fetch', async () => {
    const buffer = makeModelBuffer('cached-model');
    const store = new InMemoryStorage();
    store.store.set('test-model', buffer);
    const hash = await sha256Hex(buffer);
    chromeStorageData['obfuscaModelMeta'] = {
      modelId: 'test-model',
      version: '1.0.0',
      sha256: hash,
    };

    const fetchSpy = vi.fn();
    (globalThis as Record<string, unknown>).fetch = fetchSpy;

    const loader = new ModelLoader(store);
    const config = await makeConfig(buffer);
    const result = await loader.loadModel(config);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(new Uint8Array(result)).toEqual(new Uint8Array(buffer));
  });

  it('sets status to ready after cache hit', async () => {
    const buffer = makeModelBuffer('cached-model');
    const store = new InMemoryStorage();
    store.store.set('test-model', buffer);
    chromeStorageData['obfuscaModelMeta'] = {
      modelId: 'test-model',
      version: '1.0.0',
      sha256: await sha256Hex(buffer),
    };

    const loader = new ModelLoader(store);
    const config = await makeConfig(buffer);
    await loader.loadModel(config);

    expect(loader.getStatus()).toEqual({ state: 'ready', version: '1.0.0' });
  });

  it('does NOT call storage.save() on a cache hit', async () => {
    const buffer = makeModelBuffer('cached-model');
    const store = new InMemoryStorage();
    store.store.set('test-model', buffer);
    chromeStorageData['obfuscaModelMeta'] = {
      modelId: 'test-model',
      version: '1.0.0',
      sha256: await sha256Hex(buffer),
    };

    const loader = new ModelLoader(store);
    const config = await makeConfig(buffer);
    await loader.loadModel(config);

    expect(store.callCounts.save).toBe(0);
  });
});

// ===========================================================================
// 4. Cache miss path (download)
// ===========================================================================

describe('loadModel() — cache miss (download)', () => {
  it('calls fetch when no cache exists', async () => {
    const buffer = makeModelBuffer('downloaded-model');
    const store = new InMemoryStorage();
    const mockFetch = makeFetch(buffer);
    (globalThis as Record<string, unknown>).fetch = mockFetch;

    const loader = new ModelLoader(store);
    const config = await makeConfig(buffer);
    await loader.loadModel(config);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(config.url);
  });

  it('returns the downloaded buffer', async () => {
    const buffer = makeModelBuffer('downloaded-model');
    const store = new InMemoryStorage();
    (globalThis as Record<string, unknown>).fetch = makeFetch(buffer);

    const loader = new ModelLoader(store);
    const result = await loader.loadModel(await makeConfig(buffer));

    expect(new Uint8Array(result)).toEqual(new Uint8Array(buffer));
  });

  it('saves the model to storage after a successful download', async () => {
    const buffer = makeModelBuffer('downloaded-model');
    const store = new InMemoryStorage();
    (globalThis as Record<string, unknown>).fetch = makeFetch(buffer);

    const loader = new ModelLoader(store);
    await loader.loadModel(await makeConfig(buffer));

    expect(store.callCounts.save).toBe(1);
    expect(store.store.has('test-model')).toBe(true);
  });

  it('sets status to ready after a successful download', async () => {
    const buffer = makeModelBuffer('downloaded-model');
    const store = new InMemoryStorage();
    (globalThis as Record<string, unknown>).fetch = makeFetch(buffer);

    const loader = new ModelLoader(store);
    await loader.loadModel(await makeConfig(buffer));

    expect(loader.getStatus()).toEqual({ state: 'ready', version: '1.0.0' });
  });

  it('handles chunked (streaming) downloads correctly', async () => {
    const buffer = makeModelBuffer('streaming-model-data-long-enough-to-chunk');
    const store = new InMemoryStorage();
    (globalThis as Record<string, unknown>).fetch = makeFetch(buffer, {
      contentLength: buffer.byteLength,
      streamable: true,
    });

    const loader = new ModelLoader(store);
    const result = await loader.loadModel(await makeConfig(buffer));

    expect(new Uint8Array(result)).toEqual(new Uint8Array(buffer));
  });

  it('invokes the progress callback during download', async () => {
    const buffer = makeModelBuffer('progress-test-model-data');
    const store = new InMemoryStorage();
    (globalThis as Record<string, unknown>).fetch = makeFetch(buffer, {
      contentLength: buffer.byteLength,
      streamable: true,
    });

    const loader = new ModelLoader(store);
    const progressCalls: Array<[number, number]> = [];
    await loader.loadModel(await makeConfig(buffer), (received, total) => {
      progressCalls.push([received, total]);
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    // Each call should have received > 0 and total === buffer.byteLength.
    for (const [received, total] of progressCalls) {
      expect(received).toBeGreaterThan(0);
      expect(total).toBe(buffer.byteLength);
    }
  });
});

// ===========================================================================
// 5. SHA-256 validation
// ===========================================================================

describe('SHA-256 validation', () => {
  it('accepts a model whose hash matches expectedSha256', async () => {
    const buffer = makeModelBuffer('valid-model');
    const store = new InMemoryStorage();
    (globalThis as Record<string, unknown>).fetch = makeFetch(buffer);

    const loader = new ModelLoader(store);
    const config = await makeConfig(buffer);
    // Should resolve without error.
    await expect(loader.loadModel(config)).resolves.toBeDefined();
  });

  it('rejects a model whose hash does not match expectedSha256', async () => {
    const buffer = makeModelBuffer('valid-model');
    const store = new InMemoryStorage();
    (globalThis as Record<string, unknown>).fetch = makeFetch(buffer);

    const loader = new ModelLoader(store);
    const config: ModelConfig = {
      url: 'https://cdn.example.com/model.onnx',
      expectedSha256: 'deadbeef'.repeat(8), // wrong hash (32 bytes of deadbeef)
      modelId: 'test-model',
      version: '1.0.0',
    };

    await expect(loader.loadModel(config)).rejects.toThrow(/SHA-256 mismatch/);
  });

  it('sets status to error on hash mismatch', async () => {
    const buffer = makeModelBuffer('tampered-model');
    const store = new InMemoryStorage();
    (globalThis as Record<string, unknown>).fetch = makeFetch(buffer);

    const loader = new ModelLoader(store);
    const config: ModelConfig = {
      url: 'https://cdn.example.com/model.onnx',
      expectedSha256: 'aaaa'.repeat(16), // wrong hash
      modelId: 'test-model',
      version: '1.0.0',
    };

    try {
      await loader.loadModel(config);
    } catch {
      // expected
    }

    expect(loader.getStatus()).toMatchObject({ state: 'error' });
  });

  it('does NOT save a model with a bad hash to storage', async () => {
    const buffer = makeModelBuffer('bad-hash-model');
    const store = new InMemoryStorage();
    (globalThis as Record<string, unknown>).fetch = makeFetch(buffer);

    const loader = new ModelLoader(store);
    const config: ModelConfig = {
      url: 'https://cdn.example.com/model.onnx',
      expectedSha256: 'cafe'.repeat(16),
      modelId: 'test-model',
      version: '1.0.0',
    };

    try {
      await loader.loadModel(config);
    } catch {
      // expected
    }

    expect(store.callCounts.save).toBe(0);
    expect(store.store.has('test-model')).toBe(false);
  });

  it('re-downloads when cached hash does not match config expectedSha256', async () => {
    // Simulate a cache entry with an old/wrong hash.
    const staleBuffer = makeModelBuffer('stale-model');
    const freshBuffer = makeModelBuffer('fresh-updated-model');
    const store = new InMemoryStorage();
    store.store.set('test-model', staleBuffer);
    const freshHash = await sha256Hex(freshBuffer);
    chromeStorageData['obfuscaModelMeta'] = {
      modelId: 'test-model',
      version: '0.9.0',
      sha256: 'old-hash-that-does-not-match-anything',
    };

    const mockFetch = makeFetch(freshBuffer);
    (globalThis as Record<string, unknown>).fetch = mockFetch;

    const loader = new ModelLoader(store);
    const config: ModelConfig = {
      url: 'https://cdn.example.com/model.onnx',
      expectedSha256: freshHash,
      modelId: 'test-model',
      version: '1.1.0',
    };

    await loader.loadModel(config);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(loader.getStatus()).toEqual({ state: 'ready', version: '1.1.0' });
  });
});

// ===========================================================================
// 6. getStatus() transitions
// ===========================================================================

describe('getStatus() transitions', () => {
  it('transitions to downloading during fetch', async () => {
    const buffer = makeModelBuffer('status-test');
    const downloadingStatuses: string[] = [];

    // Use a streamable fetch so we get intermediate status updates.
    (globalThis as Record<string, unknown>).fetch = makeFetch(buffer, {
      contentLength: buffer.byteLength,
      streamable: true,
    });

    const store = new InMemoryStorage();
    const loader = new ModelLoader(store);
    const config = await makeConfig(buffer);

    const loadPromise = loader.loadModel(config, () => {
      downloadingStatuses.push(loader.getStatus().state);
    });

    await loadPromise;

    expect(downloadingStatuses).toContain('downloading');
  });

  it('ends with state ready after a successful load', async () => {
    const buffer = makeModelBuffer('success-status');
    (globalThis as Record<string, unknown>).fetch = makeFetch(buffer);

    const loader = new ModelLoader(new InMemoryStorage());
    await loader.loadModel(await makeConfig(buffer));

    expect(loader.getStatus().state).toBe('ready');
  });

  it('sets status to error on network failure', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn().mockRejectedValue(
      new Error('NetworkError: failed to fetch'),
    );

    const loader = new ModelLoader(new InMemoryStorage());
    const config: ModelConfig = {
      url: 'https://cdn.example.com/model.onnx',
      expectedSha256: 'a'.repeat(64),
      modelId: 'test-model',
      version: '1.0.0',
    };

    try {
      await loader.loadModel(config);
    } catch {
      // expected
    }

    expect(loader.getStatus()).toMatchObject({ state: 'error' });
    expect((loader.getStatus() as { state: string; message: string }).message).toMatch(
      /NetworkError|failed to fetch/i,
    );
  });

  it('sets status to error on HTTP 404', async () => {
    (globalThis as Record<string, unknown>).fetch = makeFetch(new ArrayBuffer(0), {
      status: 404,
    });

    const loader = new ModelLoader(new InMemoryStorage());
    const config: ModelConfig = {
      url: 'https://cdn.example.com/missing.onnx',
      expectedSha256: 'a'.repeat(64),
      modelId: 'test-model',
      version: '1.0.0',
    };

    try {
      await loader.loadModel(config);
    } catch {
      // expected
    }

    const status = loader.getStatus();
    expect(status.state).toBe('error');
  });
});

// ===========================================================================
// 7. clearCache()
// ===========================================================================

describe('clearCache()', () => {
  it('removes the model binary from storage', async () => {
    const buffer = makeModelBuffer('model-to-clear');
    const store = new InMemoryStorage();
    store.store.set('test-model', buffer);
    chromeStorageData['obfuscaModelMeta'] = {
      modelId: 'test-model',
      version: '1.0.0',
      sha256: await sha256Hex(buffer),
    };

    const loader = new ModelLoader(store);
    await loader.clearCache();

    expect(store.store.has('test-model')).toBe(false);
    expect(store.callCounts.remove).toBe(1);
  });

  it('removes metadata from chrome.storage.local', async () => {
    const buffer = makeModelBuffer('model-meta-clear');
    const store = new InMemoryStorage();
    store.store.set('test-model', buffer);
    chromeStorageData['obfuscaModelMeta'] = {
      modelId: 'test-model',
      version: '1.0.0',
      sha256: await sha256Hex(buffer),
    };

    const loader = new ModelLoader(store);
    await loader.clearCache();

    expect(chromeStorageData['obfuscaModelMeta']).toBeUndefined();
  });

  it('resets status to not_downloaded after clearCache()', async () => {
    const buffer = makeModelBuffer('ready-model');
    const store = new InMemoryStorage();
    (globalThis as Record<string, unknown>).fetch = makeFetch(buffer);

    const loader = new ModelLoader(store);
    await loader.loadModel(await makeConfig(buffer));
    expect(loader.getStatus().state).toBe('ready');

    await loader.clearCache();
    expect(loader.getStatus()).toEqual({ state: 'not_downloaded' });
  });

  it('isModelCached() returns false after clearCache()', async () => {
    const buffer = makeModelBuffer('cached-for-clear');
    const store = new InMemoryStorage();
    store.store.set('test-model', buffer);
    chromeStorageData['obfuscaModelMeta'] = {
      modelId: 'test-model',
      version: '1.0.0',
      sha256: await sha256Hex(buffer),
    };

    const loader = new ModelLoader(store);
    expect(await loader.isModelCached()).toBe(true);
    await loader.clearCache();
    expect(await loader.isModelCached()).toBe(false);
  });

  it('clearCache() on an empty cache does not throw', async () => {
    const loader = new ModelLoader(new InMemoryStorage());
    await expect(loader.clearCache()).resolves.toBeUndefined();
  });
});

// ===========================================================================
// 8. Storage failure (quota exceeded)
// ===========================================================================

describe('storage failure (quota exceeded)', () => {
  it('returns the model buffer even when storage.save() throws', async () => {
    const buffer = makeModelBuffer('quota-test-model');
    const store = new InMemoryStorage();
    store.shouldThrowOnSave = true;
    (globalThis as Record<string, unknown>).fetch = makeFetch(buffer);

    const loader = new ModelLoader(store);
    const config = await makeConfig(buffer);
    // Should NOT throw — logs a warning and returns the in-session buffer.
    const result = await loader.loadModel(config);
    expect(new Uint8Array(result)).toEqual(new Uint8Array(buffer));
  });

  it('sets status to ready even when caching fails', async () => {
    const buffer = makeModelBuffer('quota-status-test');
    const store = new InMemoryStorage();
    store.shouldThrowOnSave = true;
    (globalThis as Record<string, unknown>).fetch = makeFetch(buffer);

    const loader = new ModelLoader(store);
    await loader.loadModel(await makeConfig(buffer));

    // Model is valid and usable in-session, even without persistent cache.
    expect(loader.getStatus().state).toBe('ready');
  });
});

// ===========================================================================
// 9. Concurrent loadModel() calls
// ===========================================================================

describe('concurrent loadModel() calls', () => {
  it('issues only one fetch for concurrent calls', async () => {
    const buffer = makeModelBuffer('concurrent-model');
    const mockFetch = makeFetch(buffer);
    (globalThis as Record<string, unknown>).fetch = mockFetch;

    const store = new InMemoryStorage();
    const loader = new ModelLoader(store);
    const config = await makeConfig(buffer);

    const [r1, r2, r3] = await Promise.all([
      loader.loadModel(config),
      loader.loadModel(config),
      loader.loadModel(config),
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(new Uint8Array(r1)).toEqual(new Uint8Array(buffer));
    expect(new Uint8Array(r2)).toEqual(new Uint8Array(buffer));
    expect(new Uint8Array(r3)).toEqual(new Uint8Array(buffer));
  });
});
