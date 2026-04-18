/**
 * Default model configuration for the Obfusca NER model.
 *
 * Model: BERT-base-uncased fine-tuned for DLP entity detection
 * Task:  Token classification (BIO tagging)
 * Size:  ~105 MB (INT8 quantized)
 *
 * The model is hosted as a GitHub Release asset on the Extension repo.
 * In production, migrate to a proper CDN (Cloudflare R2 / S3+CloudFront).
 */

import type { ModelConfig } from './types';

/**
 * BIO label list — must match the order used during training.
 * Index 0 = "O" (non-entity).
 */
export const NER_LABELS: readonly string[] = [
  'O',
  'B-SSN',        'I-SSN',
  'B-CREDIT_CARD','I-CREDIT_CARD',
  'B-EMAIL',      'I-EMAIL',
  'B-PHONE',      'I-PHONE',
  'B-AWS_KEY',    'I-AWS_KEY',
  'B-AWS_SECRET', 'I-AWS_SECRET',
  'B-API_KEY',    'I-API_KEY',
  'B-PRIVATE_KEY','I-PRIVATE_KEY',
  'B-JWT',        'I-JWT',
  'B-CONNECTION_STR','I-CONNECTION_STR',
  'B-PERSON',     'I-PERSON',
  'B-ORG',        'I-ORG',
  'B-DATE',       'I-DATE',
  'B-ADDRESS',    'I-ADDRESS',
  'B-MED_RECORD', 'I-MED_RECORD',
] as const;

/**
 * Map from BIO entity type (without B-/I- prefix) to a human-readable
 * display name for the UI.
 */
export const ENTITY_DISPLAY_NAMES: Record<string, string> = {
  SSN: 'Social Security Number',
  CREDIT_CARD: 'Credit Card',
  EMAIL: 'Email Address',
  PHONE: 'Phone Number',
  AWS_KEY: 'AWS Access Key',
  AWS_SECRET: 'AWS Secret Key',
  API_KEY: 'API Key / Secret',
  PRIVATE_KEY: 'Private Key',
  JWT: 'JSON Web Token',
  CONNECTION_STR: 'Connection String',
  PERSON: 'Person Name',
  ORG: 'Organization',
  DATE: 'Date / DOB',
  ADDRESS: 'Address',
  MED_RECORD: 'Medical Record',
};

/**
 * GitHub Releases download URL for the model zip.
 * The ModelLoader downloads and unzips this, then caches model.onnx
 * in IndexedDB.
 */
export const MODEL_DOWNLOAD_URL =
  'https://github.com/syoncodes/Obfusca_Extension/releases/download/v0.1.0-model/obfusca-model-v1.zip';

/**
 * Default model configuration.
 * SHA-256 is of the model.onnx file inside the zip (not the zip itself).
 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  url: MODEL_DOWNLOAD_URL,
  expectedSha256: '05d95afe7a51f7ed025c73c0f59973a4d87c5d91feec8c130987fb2132a7fac5',
  modelId: 'ner-v5',
  version: '1.0.0',
};

/** Maximum input sequence length the model supports. */
export const MAX_SEQUENCE_LENGTH = 512;

/** Minimum confidence threshold for reporting detections. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;
