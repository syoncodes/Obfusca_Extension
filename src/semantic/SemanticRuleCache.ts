/**
 * SemanticRuleCache — local cache for tenant-defined semantic detection rules.
 *
 * Rules are synced from the backend (GET /semantic-rules) on a 5-minute cadence
 * by the existing background alarm that also syncs custom patterns.
 * The rules themselves contain only detection *instructions* (no user content),
 * so syncing them is privacy-safe.
 *
 * Storage: chrome.storage.local (rules are small JSON; no binary blobs).
 *
 * See: /docs/local-semantic-architecture.md §4.4
 */

import type { SemanticRule } from './types';

const RULES_KEY = 'semanticRules';
const LAST_SYNC_KEY = 'semanticRulesLastSync';

// ---------------------------------------------------------------------------
// Chrome storage helpers
// ---------------------------------------------------------------------------

function _getStorageItem<T>(key: string): Promise<T | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve((result[key] as T) ?? null);
    });
  });
}

function _setStorageItems(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  });
}

// ---------------------------------------------------------------------------
// SemanticRuleCache
// ---------------------------------------------------------------------------

/**
 * Reads and writes the synced semantic rule set in chrome.storage.local.
 *
 * @example
 * ```ts
 * const cache = new SemanticRuleCache();
 *
 * // Background alarm (every 5 min):
 * const fresh = await fetchSemanticRulesFromBackend();
 * await cache.update(fresh);
 *
 * // Detection pipeline:
 * const rules = await cache.get();
 * const detections = await semanticDetector.detect(text, rules);
 * ```
 */
export class SemanticRuleCache {
  /**
   * Returns all cached semantic rules, filtered to enabled ones.
   * Returns an empty array if no rules have been synced yet.
   */
  async get(): Promise<SemanticRule[]> {
    const rules = await _getStorageItem<SemanticRule[]>(RULES_KEY);
    if (!Array.isArray(rules)) return [];
    return rules.filter((r) => r.enabled);
  }

  /**
   * Returns ALL rules (including disabled), as stored — for admin/debug use.
   */
  async getAll(): Promise<SemanticRule[]> {
    const rules = await _getStorageItem<SemanticRule[]>(RULES_KEY);
    return Array.isArray(rules) ? rules : [];
  }

  /**
   * Persist a fresh set of rules and update the last-sync timestamp.
   * Called by the background alarm after a successful GET /semantic-rules.
   *
   * @param rules Full rule list as returned by the backend.
   */
  async update(rules: SemanticRule[]): Promise<void> {
    await _setStorageItems({
      [RULES_KEY]: rules,
      [LAST_SYNC_KEY]: Date.now(),
    });
  }

  /**
   * Returns the Unix timestamp (ms) of the last successful sync,
   * or null if rules have never been synced.
   */
  async getLastSyncTime(): Promise<number | null> {
    return _getStorageItem<number>(LAST_SYNC_KEY);
  }

  /**
   * Returns true if the cache is stale (older than maxAgeMs) or empty.
   * Default stale threshold: 6 minutes (one missed 5-min alarm cycle).
   */
  async isStale(maxAgeMs = 6 * 60 * 1000): Promise<boolean> {
    const lastSync = await this.getLastSyncTime();
    if (lastSync === null) return true;
    return Date.now() - lastSync > maxAgeMs;
  }
}
