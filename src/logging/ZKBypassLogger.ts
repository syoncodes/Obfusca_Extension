/**
 * ZKBypassLogger — Option A: Zero-Knowledge RSA-OAEP + AES-256-GCM bypass logger.
 *
 * The full bypass details (including raw sensitive values) are encrypted
 * client-side with the tenant's RSA-OAEP-4096 public key before transmission.
 * The backend stores an opaque base64 blob it cannot decrypt. Only the tenant
 * admin holding the corresponding private key can read the plaintext.
 *
 * Hybrid encryption is used because RSA-OAEP-4096 with SHA-256 can only
 * directly encrypt ~446 bytes. A bypass event with multiple detections easily
 * exceeds this. The hybrid scheme has no size limit:
 *   1. Generate a fresh random AES-256-GCM session key per message.
 *   2. Encrypt the payload (JSON) with AES-256-GCM.
 *   3. Wrap the session key with the tenant's RSA-OAEP public key.
 *   4. Pack into a deterministic wire format and base64-encode.
 *
 * Wire format (big-endian, compatible with bypass_crypto.py):
 *   [4 bytes]  uint32: byte-length of RSA-encrypted session key (N)
 *   [N bytes]  RSA-OAEP encrypted AES-256 session key
 *   [12 bytes] AES-GCM nonce (random per message)
 *   [M bytes]  AES-GCM ciphertext + 16-byte authentication tag
 *
 * The Python decrypt_bypass_details() in bypass_crypto.py can decrypt blobs
 * produced by this class.
 *
 * Fallback behaviour:
 *   When the tenant public key is unavailable (not yet configured, fetch failed,
 *   or key import error), falls back to EncryptedBypassLogger (Option B).
 *
 * @see local-semantic-architecture.md §7.2
 */

import type { IBypassLogger, BypassEvent, RawBypassDetection, BypassFileItem } from './types';
import { EncryptedBypassLogger } from './EncryptedBypassLogger';

// ---------------------------------------------------------------------------
// Hybrid encryption helpers
// ---------------------------------------------------------------------------

/**
 * Encode a Uint8Array to a base64 string.
 * Uses chunked processing to avoid stack overflow on large arrays.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Hybrid-encrypt data with an RSA-OAEP public key.
 *
 * Produces the wire format documented in the module header, base64-encoded.
 * Compatible with bypass_crypto.py:decrypt_bypass_details().
 */
async function hybridEncrypt(data: Uint8Array, publicKey: CryptoKey): Promise<string> {
  // 1. Generate ephemeral AES-256-GCM session key
  const sessionKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,        // extractable so we can export the raw bytes
    ['encrypt'],
  );

  // 2. Encrypt payload with AES-256-GCM (16-byte auth tag appended by WebCrypto)
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    sessionKey,
    data,
  );

  // 3. Export session key bytes, then wrap with RSA-OAEP
  const sessionKeyBytes = await crypto.subtle.exportKey('raw', sessionKey);
  const encryptedKeyBuf = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    sessionKeyBytes,
  );

  // 4. Pack wire format: [4-byte key-len BE][encrypted key][nonce][ciphertext+tag]
  const encKeyBytes = new Uint8Array(encryptedKeyBuf);
  const ctBytes = new Uint8Array(ciphertextBuf);

  const combined = new Uint8Array(4 + encKeyBytes.length + 12 + ctBytes.length);
  const view = new DataView(combined.buffer);
  view.setUint32(0, encKeyBytes.length, false /* big-endian */);
  combined.set(encKeyBytes, 4);
  combined.set(nonce, 4 + encKeyBytes.length);
  combined.set(ctBytes, 4 + encKeyBytes.length + 12);

  return bytesToBase64(combined);
}

// ---------------------------------------------------------------------------
// ZKBypassLogger
// ---------------------------------------------------------------------------

export class ZKBypassLogger implements IBypassLogger {
  private publicKey: CryptoKey | null = null;

  /**
   * Promise that resolves once key import completes (or fails gracefully).
   * log() awaits this before attempting encryption.
   */
  private readonly _keyReady: Promise<void>;

  private readonly fallback: IBypassLogger;
  private readonly apiUrl: string;
  private readonly getToken: () => Promise<string | null>;

  /**
   * @param publicKeyJwk  Tenant RSA-OAEP-4096 public key in JWK format.
   *                      Pass null to force immediate fallback to Option B.
   * @param apiUrl        Backend base URL (no trailing slash).
   * @param getToken      Async function returning the current Bearer JWT or null.
   * @param fallback      Logger used when the public key is unavailable or
   *                      encryption fails. Defaults to EncryptedBypassLogger.
   */
  constructor(
    publicKeyJwk: JsonWebKey | null,
    apiUrl: string,
    getToken: () => Promise<string | null>,
    fallback?: IBypassLogger,
  ) {
    this.apiUrl = apiUrl;
    this.getToken = getToken;
    this.fallback = fallback ?? new EncryptedBypassLogger(apiUrl, getToken);

    if (publicKeyJwk !== null) {
      this._keyReady = crypto.subtle
        .importKey(
          'jwk',
          publicKeyJwk,
          { name: 'RSA-OAEP', hash: 'SHA-256' },
          false,       // not extractable — key stays in the WebCrypto keystore
          ['encrypt'],
        )
        .then((key) => {
          this.publicKey = key;
        })
        .catch((err: unknown) => {
          console.warn('[ZKBypassLogger] Failed to import public key — will fall back:', err);
        });
    } else {
      this._keyReady = Promise.resolve();
    }
  }

  /**
   * Log a bypass event using zero-knowledge encryption.
   *
   * The full bypass_details (with raw sensitive values) are encrypted into an
   * opaque base64 blob. Only detections_summary (type counts) is sent in
   * plaintext, preserving event metadata without Obfusca infrastructure being
   * able to read the actual sensitive values.
   *
   * Falls back to EncryptedBypassLogger if:
   *   - No public key was provided to the constructor
   *   - Key import failed (bad JWK format, browser policy, etc.)
   *   - Encryption throws for any reason
   */
  async log(event: BypassEvent): Promise<void> {
    await this._keyReady;

    if (this.publicKey === null) {
      console.warn('[ZKBypassLogger] No public key — falling back to EncryptedBypassLogger');
      return this.fallback.log(event);
    }

    const token = await this.getToken();
    if (!token) {
      console.warn('[ZKBypassLogger] No access token — bypass event not logged');
      return;
    }

    let encryptedBlob: string;
    try {
      const bypassDetails = {
        detections: event.detections,
        files_bypassed: event.files_bypassed ?? [],
      };
      const plaintext = new TextEncoder().encode(JSON.stringify(bypassDetails));
      encryptedBlob = await hybridEncrypt(plaintext, this.publicKey);
    } catch (err: unknown) {
      console.warn('[ZKBypassLogger] Encryption failed — falling back:', err);
      return this.fallback.log(event);
    }

    // Build detections_summary from the raw detections (type counts in plaintext)
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    for (const d of event.detections) {
      byType[d.type] = (byType[d.type] ?? 0) + 1;
      bySeverity[d.severity] = (bySeverity[d.severity] ?? 0) + 1;
    }
    const filesBypassed: BypassFileItem[] = event.files_bypassed ?? [];
    const fileDetectionCount = filesBypassed.reduce((s, f) => s + f.detections_count, 0);

    // detections_summary (type counts only) is always plaintext alongside the blob.
    // bypassed_detections is empty — the raw values are inside the encrypted blob.
    const payload = {
      source: event.source,
      content_type: event.content_type ?? 'text',
      detections_summary: {
        total_count: event.detections.length + fileDetectionCount,
        by_type: byType,
        by_severity: bySeverity,
      },
      encrypted_bypass_details: encryptedBlob,
      bypassed_detections: [],    // empty: raw values are in the encrypted blob
      files_bypassed: [],          // empty: in the encrypted blob
      content_hash: event.contentHash,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };

    try {
      const response = await fetch(`${this.apiUrl}/events/bypass`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.error(
          '[ZKBypassLogger] Failed to log bypass event:',
          response.status,
          text.slice(0, 200),
        );
      } else {
        const result = await response.json();
        console.log('[ZKBypassLogger] Bypass event logged (ZK encrypted):', result.event_id);
      }
    } catch (err: unknown) {
      // Fire-and-forget: never block the user's send
      console.error('[ZKBypassLogger] Network error:', err);
    }
  }

  /**
   * Encrypt arbitrary data with the tenant public key.
   *
   * Exposed for testing and for the dashboard decryption preview flow.
   * Awaits key import completion before encrypting.
   *
   * @throws Error if the public key is not available.
   */
  async encrypt(data: unknown): Promise<string> {
    await this._keyReady;
    if (!this.publicKey) {
      throw new Error('[ZKBypassLogger] Public key not available');
    }
    const plaintext = new TextEncoder().encode(JSON.stringify(data));
    return hybridEncrypt(plaintext, this.publicKey);
  }
}
