/**
 * Global test setup for Obfusca extension tests.
 *
 * Mocks Chrome extension APIs that are used at module level.
 * This file runs BEFORE any test module imports, so chrome.storage,
 * chrome.runtime, etc. are available when detection.ts (and other modules)
 * execute their top-level code.
 */

// ---------------------------------------------------------------------------
// Chrome Storage mock
// ---------------------------------------------------------------------------

const storageData: Record<string, unknown> = {};
const storageListeners: Array<
  (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, areaName: string) => void
> = [];

const mockStorageLocal = {
  get: vi.fn(
    (keys: string | string[], callback: (result: Record<string, unknown>) => void) => {
      const keyList = typeof keys === 'string' ? [keys] : keys;
      const result: Record<string, unknown> = {};
      for (const key of keyList) {
        if (key in storageData) {
          result[key] = storageData[key];
        }
      }
      callback(result);
    },
  ),
  set: vi.fn(
    (items: Record<string, unknown>, callback?: () => void) => {
      Object.assign(storageData, items);
      if (callback) callback();
    },
  ),
  remove: vi.fn(
    (keys: string | string[], callback?: () => void) => {
      const keyList = typeof keys === 'string' ? [keys] : keys;
      for (const key of keyList) {
        delete storageData[key];
      }
      if (callback) callback();
    },
  ),
};

const mockStorageOnChanged = {
  addListener: vi.fn(
    (
      listener: (
        changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
        areaName: string,
      ) => void,
    ) => {
      storageListeners.push(listener);
    },
  ),
  removeListener: vi.fn(
    (
      listener: (
        changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
        areaName: string,
      ) => void,
    ) => {
      const idx = storageListeners.indexOf(listener);
      if (idx !== -1) storageListeners.splice(idx, 1);
    },
  ),
};

// ---------------------------------------------------------------------------
// Full chrome mock
// ---------------------------------------------------------------------------

const mockChrome = {
  storage: {
    local: mockStorageLocal,
    onChanged: mockStorageOnChanged,
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    getURL: vi.fn((path: string) => `chrome-extension://mock-id/${path}`),
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
  },
};

// Set chrome as global BEFORE any module code executes
(globalThis as Record<string, unknown>).chrome = mockChrome;

// ---------------------------------------------------------------------------
// Exported helpers for tests to manipulate storage
// ---------------------------------------------------------------------------

/**
 * Set a value in the mock chrome.storage.local.
 * Does NOT fire storage change listeners (use triggerStorageChange for that).
 */
export function setStorageData(key: string, value: unknown): void {
  storageData[key] = value;
}

/**
 * Clear all data from the mock chrome.storage.local.
 */
export function clearStorageData(): void {
  for (const key of Object.keys(storageData)) {
    delete storageData[key];
  }
}

/**
 * Fire the chrome.storage.onChanged listeners with a simulated change.
 */
export function triggerStorageChange(
  key: string,
  newValue: unknown,
  oldValue?: unknown,
): void {
  const changes = { [key]: { newValue, oldValue } };
  for (const listener of storageListeners) {
    listener(changes, 'local');
  }
}

/**
 * Get the raw mock storage data for inspection.
 */
export function getStorageData(): Record<string, unknown> {
  return { ...storageData };
}
