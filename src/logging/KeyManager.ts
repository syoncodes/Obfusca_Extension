/**
 * KeyManager: fetches and caches the tenant's bypass public key.
 *
 * The tenant's RSA-OAEP-4096 public key is served by GET /settings as a JWK
 * (settings.bypass_public_key field). KeyManager fetches it on demand and
 * caches it in chrome.storage.local for 5 minutes, aligned with the custom
 * pattern sync cadence.
 *
 * The cached JWK is passed directly to ZKBypassLogger, which imports it via
 * crypto.subtle.importKey(). The raw JWK is never used for cryptographic
 * operations outside the logger — only the imported CryptoKey is used.
 *
 * Key *generation* is NOT handled here. That is M17 (dashboard admin setup).
 * This module only reads and caches whatever the backend serves.
 *
 * @see local-semantic-architecture.md §7.2
 */

const STORAGE_KEY = 'bypass_public_key_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedKey {
  jwk: JsonWebKey;
  cachedAt: number;
}

export class KeyManager {
  private readonly apiUrl: string;
  private readonly getToken: () => Promise<string | null>;

  /**
   * @param apiUrl    Backend base URL (no trailing slash).
   * @param getToken  Async function returning the current Bearer JWT or null.
   */
  constructor(apiUrl: string, getToken: () => Promise<string | null>) {
    this.apiUrl = apiUrl;
    this.getToken = getToken;
  }

  /**
   * Get the tenant's bypass public key in JWK format.
   *
   * Returns the cached key if present and not stale (< 5 min old).
   * Otherwise fetches from GET /settings and caches the result.
   *
   * Returns null if:
   *   - No access token is available (user not signed in)
   *   - The settings endpoint does not include bypass_public_key (not yet set up)
   *   - The network request fails
   */
  async getPublicKey(): Promise<JsonWebKey | null> {
    const cached = await this._loadFromStorage();
    if (cached !== null) return cached.jwk;
    return this._fetchAndCache();
  }

  /**
   * Remove the cached public key.
   * Call on logout, tenant switch, or when the admin rotates the key pair.
   */
  async clearKey(): Promise<void> {
    await new Promise<void>((resolve) => {
      chrome.storage.local.remove(STORAGE_KEY, () => resolve());
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _loadFromStorage(): Promise<CachedKey | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        const cached = result[STORAGE_KEY] as CachedKey | undefined;
        if (!cached) return resolve(null);
        if (Date.now() - cached.cachedAt > CACHE_TTL_MS) return resolve(null);
        resolve(cached);
      });
    });
  }

  private async _fetchAndCache(): Promise<JsonWebKey | null> {
    try {
      const token = await this.getToken();
      if (!token) return null;

      const response = await fetch(`${this.apiUrl}/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return null;

      const body = await response.json();

      // bypass_public_key is null until the admin generates a key pair (M17)
      const jwk: JsonWebKey | null = body?.settings?.bypass_public_key ?? null;
      if (jwk === null) return null;

      const cached: CachedKey = { jwk, cachedAt: Date.now() };
      await new Promise<void>((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEY]: cached }, () => resolve());
      });
      return jwk;
    } catch (err: unknown) {
      console.warn('[KeyManager] Failed to fetch bypass public key:', err);
      return null;
    }
  }
}
