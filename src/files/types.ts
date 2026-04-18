/**
 * Types for the local file scanning pipeline (M11).
 */

import type { Detection } from '../detection';

// ---------------------------------------------------------------------------
// Supported formats
// ---------------------------------------------------------------------------

/**
 * File extensions that LocalFileScanner can handle entirely in the browser.
 * PDF / DOCX / XLSX are excluded here — they require external libraries and
 * are handled by stub methods in LocalFileExtractor until those libraries
 * are added (future mission).
 */
export type SupportedFormat =
  // Plain text & markup
  | 'txt'
  | 'md'
  | 'log'
  | 'env'
  | 'ini'
  | 'cfg'
  | 'conf'
  // Source code (TextDecoder UTF-8)
  | 'js'
  | 'ts'
  | 'py'
  | 'java'
  | 'sql'
  | 'rb'
  | 'go'
  | 'rs'
  | 'c'
  | 'cpp'
  | 'h'
  | 'cs'
  | 'php'
  | 'swift'
  | 'kt'
  // Data / config (TextDecoder UTF-8 + optional parse validation)
  | 'json'
  | 'yaml'
  | 'yml'
  | 'xml'
  | 'toml'
  // Tabular text (TextDecoder UTF-8 — no full CSV parse required)
  | 'csv'
  | 'tsv';

// ---------------------------------------------------------------------------
// File analysis result
// ---------------------------------------------------------------------------

/**
 * Result returned by LocalFileScanner.scan().
 *
 * Mirrors the shape used by the backend FileAnalysisResult but is produced
 * entirely client-side — `scannedLocally: true` distinguishes it from
 * results that came from a backend API call.
 */
export interface FileAnalysisResult {
  /** All detections found (type + position, no raw matched value). */
  detections: Detection[];
  /** Recommended action based on highest-severity detection. */
  action: 'allow' | 'block' | 'redact';
  /** Lowercased file extension (e.g. 'py', 'json'). */
  fileType: string;
  /** Original filename as supplied by the File object. */
  fileName: string;
  /** File size in bytes. */
  fileSize: number;
  /** Number of characters in the extracted text. */
  extractedLength: number;
  /** Always true for results produced by LocalFileScanner. */
  scannedLocally: boolean;
}
