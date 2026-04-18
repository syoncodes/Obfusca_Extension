/**
 * LocalFileExtractor — client-side text extraction for common file formats.
 *
 * Uses only the built-in TextDecoder / TextEncoder Web APIs (no npm deps).
 * For each supported format the File is read as an ArrayBuffer and decoded
 * to a UTF-8 string.  JSON / YAML / TOML / XML are left as-is after decoding
 * (the DLP pipeline scans the raw text, not a parsed object tree).
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ FORMAT            │ STRATEGY                                            │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ Text / code / cfg │ TextDecoder UTF-8 → return string                  │
 * │ JSON              │ TextDecoder UTF-8 + JSON.parse validation (warn)    │
 * │ YAML / TOML       │ TextDecoder UTF-8 (returned as raw text)            │
 * │ XML               │ TextDecoder UTF-8 (returned as raw text)            │
 * │ CSV / TSV         │ TextDecoder UTF-8 (simple text, no full CSV parse)  │
 * │ PDF               │ STUB — returns null (requires pdf.js)               │
 * │ DOCX              │ STUB — returns null (requires mammoth.js)           │
 * │ XLSX              │ STUB — returns null (requires SheetJS)              │
 * │ Unsupported       │ returns null                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

// ---------------------------------------------------------------------------
// Extension sets
// ---------------------------------------------------------------------------

/** Extensions handled purely with TextDecoder (UTF-8). */
const TEXT_DECODER_EXTENSIONS = new Set<string>([
  // Plain text
  'txt', 'md', 'log', 'env', 'ini', 'cfg', 'conf',
  // Source code
  'js', 'ts', 'py', 'java', 'sql', 'rb', 'go', 'rs',
  'c', 'cpp', 'h', 'cs', 'php', 'swift', 'kt',
  // Data / config
  'json', 'yaml', 'yml', 'xml', 'toml',
  // Tabular text
  'csv', 'tsv',
]);

/** Extensions that require external libraries (stubbed — return null for now). */
const STUB_EXTENSIONS = new Set<string>(['pdf', 'docx', 'xlsx']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) return '';
  return parts[parts.length - 1].toLowerCase();
}

// ---------------------------------------------------------------------------
// Extractor
// ---------------------------------------------------------------------------

export class LocalFileExtractor {
  /**
   * Extract plain text from a File object.
   *
   * @param file - The File to extract text from.
   * @returns The extracted text string, or `null` if the format is unsupported
   *          or a stub (PDF / DOCX / XLSX).
   */
  static async extract(file: File): Promise<string | null> {
    const ext = getExtension(file.name);

    // --- Stubbed formats (external library required) ---

    if (ext === 'pdf') {
      // TODO: Implement PDF extraction using pdf.js when library is bundled.
      // pdf.js (mozilla/pdf.js) supports in-browser text extraction without a server.
      // Example: pdfjsLib.getDocument({ data: arrayBuffer }).promise → page.getTextContent()
      return null;
    }

    if (ext === 'docx') {
      // TODO: Implement DOCX extraction using mammoth.js when library is bundled.
      // mammoth.extractRawText({ arrayBuffer }) → { value: string }
      return null;
    }

    if (ext === 'xlsx') {
      // TODO: Implement XLSX extraction using SheetJS (xlsx) when library is bundled.
      // XLSX.read(arrayBuffer, { type: 'array' }) → sheet_to_csv / sheet_to_txt
      return null;
    }

    // --- Unsupported format ---
    if (!TEXT_DECODER_EXTENSIONS.has(ext)) {
      return null;
    }

    // --- TextDecoder path for all supported text-based formats ---
    return LocalFileExtractor._decodeAsText(file, ext);
  }

  /**
   * Read the file as an ArrayBuffer and decode with UTF-8.
   * The BOM (U+FEFF) is automatically stripped by TextDecoder when
   * `ignoreBOM` is false (the default).
   *
   * For JSON files, parsing is attempted as a validation step — a parse
   * failure does NOT prevent returning the raw text (the DLP pipeline still
   * scans the raw bytes for secrets that would otherwise be missed).
   */
  private static async _decodeAsText(file: File, ext: string): Promise<string> {
    const buffer = await file.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buffer);

    if (ext === 'json') {
      try {
        JSON.parse(text);
      } catch {
        // Malformed JSON: warn but still return the raw text so the pipeline
        // can still detect secrets in partially-written / corrupted JSON files.
        console.warn(`[LocalFileExtractor] ${file.name}: JSON parse failed — scanning raw text`);
      }
    }

    return text;
  }

  /**
   * Return true if this extractor can handle the given file locally.
   * Does NOT check file size — that is the scanner's responsibility.
   */
  static supportsFormat(filename: string): boolean {
    const ext = getExtension(filename);
    return TEXT_DECODER_EXTENSIONS.has(ext);
  }

  /**
   * Return true if the format is stubbed (known but library not yet bundled).
   */
  static isStubFormat(filename: string): boolean {
    const ext = getExtension(filename);
    return STUB_EXTENSIONS.has(ext);
  }
}
