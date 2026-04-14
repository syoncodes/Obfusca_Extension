/**
 * Content hashing utilities for Obfusca event logging.
 *
 * Uses HMAC-SHA256 keyed by `tenantId + '|' + userId` for warn events so
 * that two tenants submitting identical text produce different hashes, and
 * hashes are non-correlatable across tenant boundaries.
 *
 * Output format: 'hmac-sha256:<64 hex chars>'
 *
 * Backward-compat note: older extension versions sent 'sha256:<64 hex chars>'.
 * The backend /events/warn endpoint accepts both formats.
 */

/**
 * Compute HMAC-SHA256 of `text` keyed by `tenantId + '|' + userId`.
 *
 * Uses the Web Crypto API (available in MV3 service workers, content scripts,
 * and offscreen documents — no npm dependencies required).
 *
 * @returns 'hmac-sha256:' followed by 64 lowercase hex characters
 */
export async function computeContentHMAC(
  text: string,
  tenantId: string,
  userId: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(`${tenantId}|${userId}`);
  const message = encoder.encode(text);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
  const hashArray = Array.from(new Uint8Array(signature));
  const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `hmac-sha256:${hexHash}`;
}
