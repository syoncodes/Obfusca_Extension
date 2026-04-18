/**
 * LocalFileScanner — orchestrates client-side file analysis.
 *
 * Decision logic (mirrors §9.2 of local-semantic-architecture.md):
 *
 *   file.size ≤ 512 KB AND extension in SUPPORTED_EXTENSIONS
 *     → extract text with LocalFileExtractor
 *     → run detectSensitiveData() (built-in regex + cached custom patterns)
 *     → return FileAnalysisResult (scannedLocally: true)
 *
 *   Otherwise (too large, binary, PDF/DOCX/XLSX stub, unsupported):
 *     → canHandleLocally() returns false / scan() returns null
 *     → caller falls back to the existing backend path (fileScanner.ts)
 *
 * Why detectSensitiveData() rather than the full M9 LocalDetectionPipeline?
 * The M9 pipeline requires NER, semantic, policy, and dummy collaborators to be
 * wired up — that integration is a separate mission.  For file scanning the
 * built-in regex + custom-pattern path is sufficient; NER/semantic integration
 * will be added when those collaborators ship.
 *
 * No network calls are made here.
 */

import { detectSensitiveData } from '../detection';
import type { Detection } from '../detection';
import { LocalFileExtractor } from './LocalFileExtractor';
import type { FileAnalysisResult, SupportedFormat } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum file size for local scanning (512 KB). */
const MAX_LOCAL_BYTES = 512 * 1024;

/**
 * Extensions handled entirely in the browser.
 * Must stay in sync with LocalFileExtractor.TEXT_DECODER_EXTENSIONS.
 */
const SUPPORTED_EXTENSIONS = new Set<SupportedFormat>([
  'txt', 'md', 'log', 'env', 'ini', 'cfg', 'conf',
  'js', 'ts', 'py', 'java', 'sql', 'rb', 'go', 'rs',
  'c', 'cpp', 'h', 'cs', 'php', 'swift', 'kt',
  'json', 'yaml', 'yml', 'xml', 'toml',
  'csv', 'tsv',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) return '';
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Map the highest detection severity to a DLP action.
 *   critical / high → block  (immediate stop)
 *   medium          → redact (offer redaction)
 *   low / none      → allow
 */
function determineAction(detections: Detection[]): 'allow' | 'block' | 'redact' {
  if (detections.length === 0) return 'allow';

  for (const d of detections) {
    if (d.severity === 'critical' || d.severity === 'high') return 'block';
  }

  for (const d of detections) {
    if (d.severity === 'medium') return 'redact';
  }

  return 'allow';
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

export class LocalFileScanner {
  /**
   * Returns true when the file can be fully scanned in the browser:
   *   - size ≤ 512 KB
   *   - extension is in the supported set (text / code / data formats)
   *
   * PDF / DOCX / XLSX are currently excluded because their extraction
   * libraries have not yet been bundled (they are stubbed in LocalFileExtractor).
   */
  canHandleLocally(file: File): boolean {
    if (file.size > MAX_LOCAL_BYTES) return false;
    const ext = getExtension(file.name) as SupportedFormat;
    return SUPPORTED_EXTENSIONS.has(ext);
  }

  /**
   * Extract text from `file` and run the local detection pipeline on it.
   *
   * @param file   - The File object to scan.
   * @param source - The platform / origin string (e.g. 'chatgpt', 'claude').
   *                 Recorded for logging; no network call is made.
   * @returns FileAnalysisResult on success, or `null` if:
   *   - the format is not supported / stubbed (caller falls back to backend)
   *   - text extraction throws unexpectedly
   */
  async scan(file: File, source: string): Promise<FileAnalysisResult | null> {
    console.log(
      `[LocalFileScanner] Scanning ${file.name} (${file.size} bytes) ` +
      `source=${source}`
    );

    let text: string | null;
    try {
      text = await LocalFileExtractor.extract(file);
    } catch (err) {
      console.error(`[LocalFileScanner] Extraction failed for ${file.name}:`, err);
      return null;
    }

    if (text === null) {
      // Unsupported or stubbed format — caller should fall back to backend.
      return null;
    }

    const detections = await detectSensitiveData(text);
    const action = determineAction(detections);
    const ext = getExtension(file.name);

    const result: FileAnalysisResult = {
      detections,
      action,
      fileType: ext,
      fileName: file.name,
      fileSize: file.size,
      extractedLength: text.length,
      scannedLocally: true,
    };

    console.log(
      `[LocalFileScanner] ${file.name}: action=${result.action}, ` +
      `detections=${result.detections.length}, extractedLength=${result.extractedLength}`
    );

    return result;
  }
}
