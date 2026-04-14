/**
 * PolicyCache — persists synced policies in chrome.storage.local.
 *
 * Policies are fetched from GET /policies during the background alarm sync
 * cycle (same 5-minute cadence as custom patterns) and stored here so that
 * LocalPolicyEngine can evaluate them without a network call.
 *
 * Fallback behaviour:
 *   - If no policies have ever been synced (fresh install, pre-login), the
 *     cache returns a safe fallback: personal_protection profile, no rules.
 *     The engine will then use severity-based defaults (critical→block, etc.).
 *   - If the cache is stale (> MAX_AGE_MS), the stale data is still returned
 *     rather than an empty fallback — a known-old policy is safer than no
 *     policy. A warning is logged so operators can tune sync frequency.
 *   - If storage read/write fails (quota exceeded, permission revoked), the
 *     safe fallback is used and the error is logged without throwing.
 */

import type { Policy, PolicyRule, ProtectionProfile, DestinationRule } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'obfusca_policies' as const;

/**
 * Policies older than this are considered stale.
 * Stale data is still returned (better than nothing) but a warning is logged.
 * The background sync cycle should refresh every 5 minutes in normal operation.
 */
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

/**
 * Safe fallback policy for pre-sync / storage-error scenarios.
 *
 * Uses personal_protection profile with no per-type rules, so the engine
 * falls through to severity defaults: critical→block, high→redact,
 * medium→warn, low→allow. This is the most conservative sensible default
 * for a user whose policies haven't loaded yet.
 *
 * lastSyncedAt is 0 to signal "never synced" to callers.
 */
function buildFallbackPolicy(): Policy {
  return {
    profile: 'personal_protection',
    rules: [],
    destinationRules: [],
    lastSyncedAt: 0,
  };
}

// ---------------------------------------------------------------------------
// Cache implementation
// ---------------------------------------------------------------------------

/**
 * PolicyCache wraps chrome.storage.local reads/writes for synced policies.
 *
 * All methods are async and never throw — errors are caught internally and
 * result in the safe fallback being returned.
 */
export class PolicyCache {
  /**
   * Retrieve the cached policy.
   *
   * Returns the fallback policy (personal_protection, no rules) if:
   *   - No policies have been synced (lastSyncedAt === 0).
   *   - The storage entry is missing or malformed.
   *   - A storage read error occurs.
   *
   * Returns stale data (with a warning) if the cache is older than MAX_AGE_MS
   * but a sync has occurred — stale data is preferable to no data.
   */
  get(): Promise<Policy> {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([CACHE_KEY], (result) => {
          if (chrome.runtime.lastError) {
            console.error('[PolicyCache] Storage read error:', chrome.runtime.lastError.message);
            resolve(buildFallbackPolicy());
            return;
          }

          const cached = result[CACHE_KEY] as Policy | undefined;

          if (!cached || typeof cached !== 'object' || !('rules' in cached)) {
            resolve(buildFallbackPolicy());
            return;
          }

          // Warn on stale data (but still return it — stale > empty).
          if (cached.lastSyncedAt > 0) {
            const ageMs = Date.now() - cached.lastSyncedAt;
            if (ageMs > MAX_AGE_MS) {
              console.warn(
                `[PolicyCache] Policies are ${Math.round(ageMs / 1000)}s old ` +
                  `(max ${MAX_AGE_MS / 1000}s). Returning stale data.`,
              );
            }
          }

          resolve(cached);
        });
      } catch (err) {
        console.error('[PolicyCache] Unexpected error reading policies:', err);
        resolve(buildFallbackPolicy());
      }
    });
  }

  /**
   * Persist updated policies from the backend sync.
   *
   * Called by the background alarm handler after fetching from GET /policies.
   * Sets lastSyncedAt to the current timestamp so staleness checks work.
   *
   * @param rules           - Policy rules from the backend.
   * @param profile         - Active protection profile for this tenant.
   * @param destinationRules - Optional destination-specific overrides.
   */
  update(
    rules: PolicyRule[],
    profile: ProtectionProfile = 'personal_protection',
    destinationRules: DestinationRule[] = [],
  ): Promise<void> {
    const policy: Policy = {
      profile,
      rules,
      destinationRules,
      lastSyncedAt: Date.now(),
    };

    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [CACHE_KEY]: policy }, () => {
          if (chrome.runtime.lastError) {
            console.error('[PolicyCache] Storage write error:', chrome.runtime.lastError.message);
          } else {
            console.log(
              `[PolicyCache] Updated: ${rules.length} rule(s), profile=${profile}`,
            );
          }
          resolve();
        });
      } catch (err) {
        console.error('[PolicyCache] Unexpected error writing policies:', err);
        resolve();
      }
    });
  }

  /**
   * Remove cached policies from storage.
   *
   * Called on logout so the next session starts from the safe fallback state
   * rather than a previous user's policy configuration.
   */
  clear(): Promise<void> {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.remove([CACHE_KEY], () => {
          if (chrome.runtime.lastError) {
            console.error('[PolicyCache] Storage clear error:', chrome.runtime.lastError.message);
          } else {
            console.log('[PolicyCache] Cleared.');
          }
          resolve();
        });
      } catch (err) {
        console.error('[PolicyCache] Unexpected error clearing policies:', err);
        resolve();
      }
    });
  }

  /**
   * Returns true if at least one successful sync has occurred
   * (lastSyncedAt > 0). Useful for UI indicators.
   */
  async hasSyncedPolicies(): Promise<boolean> {
    const policy = await this.get();
    return policy.lastSyncedAt > 0;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/**
 * Singleton PolicyCache instance.
 * Import this directly rather than constructing a new instance per call.
 */
export const policyCache = new PolicyCache();
