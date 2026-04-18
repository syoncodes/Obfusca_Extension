/**
 * Obfusca bypass logging module.
 *
 * Exports all public types and implementations for ZK bypass logging (M14–M16).
 *
 * M14: EncryptedBypassLogger — Option B (structured evidence, no raw values)
 * M16: ZKBypassLogger        — Option A (RSA-OAEP + AES-256-GCM, zero-knowledge)
 * M16: KeyManager            — fetch + cache tenant public key from /settings
 */

export type {
  IBypassLogger,
  BypassEvent,
  RawBypassDetection,
  BypassFileItem,
  StructuredBypassDetection,
  EncryptedBypassPayload,
  ReplacementChosen,
} from './types';

export {
  EncryptedBypassLogger,
  inferValueFormat,
  fingerprintValue,
  inferReplacementChosen,
} from './EncryptedBypassLogger';

export { ZKBypassLogger } from './ZKBypassLogger';
export { KeyManager } from './KeyManager';
