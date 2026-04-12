/**
 * Tests for src/fileScanner.ts
 *
 * Tests the pure utility functions that do NOT require network/DOM access:
 * - isSupportedFile(file): checks extension against supported list
 * - shouldScanFile(file): checks support + size limit
 * - hasBlockingFiles(results): checks if any result has action=block
 * - getFilesNeedingAttention(results): filters for block/redact results
 *
 * NOT tested (require network/fetch mocking):
 * - scanFile(file): makes HTTP request to backend
 * - scanFiles(files): delegates to scanFile
 * - fileToBase64(file): requires FileReader (DOM API)
 *
 * Note: fileScanner.ts imports from ./auth and ./config which use chrome APIs.
 * The chrome mock in setup.ts handles this.
 */

import {
  isSupportedFile,
  shouldScanFile,
  hasBlockingFiles,
  getFilesNeedingAttention,
  type FileAnalysisResult,
  type FileScanError,
} from '../src/fileScanner';

// Suppress console output from the module
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

// =============================================================================
// Helper: create mock File objects
// =============================================================================

function createMockFile(
  name: string,
  size: number = 1024,
  type: string = 'text/plain',
): File {
  // Create a minimal File-like object that satisfies the File interface
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

// =============================================================================
// isSupportedFile
// =============================================================================

describe('isSupportedFile', () => {
  describe('text files', () => {
    it('supports .txt files', () => {
      expect(isSupportedFile(createMockFile('readme.txt'))).toBe(true);
    });

    it('supports .md files', () => {
      expect(isSupportedFile(createMockFile('README.md'))).toBe(true);
    });

    it('supports .log files', () => {
      expect(isSupportedFile(createMockFile('app.log'))).toBe(true);
    });
  });

  describe('config files', () => {
    it('supports .json files', () => {
      expect(isSupportedFile(createMockFile('config.json'))).toBe(true);
    });

    it('supports .yaml files', () => {
      expect(isSupportedFile(createMockFile('config.yaml'))).toBe(true);
    });

    it('supports .yml files', () => {
      expect(isSupportedFile(createMockFile('docker-compose.yml'))).toBe(true);
    });

    it('supports .env files', () => {
      expect(isSupportedFile(createMockFile('.env'))).toBe(true);
    });

    it('supports .toml files', () => {
      expect(isSupportedFile(createMockFile('Cargo.toml'))).toBe(true);
    });

    it('supports .xml files', () => {
      expect(isSupportedFile(createMockFile('pom.xml'))).toBe(true);
    });

    it('supports .ini files', () => {
      expect(isSupportedFile(createMockFile('settings.ini'))).toBe(true);
    });

    it('supports .dockerfile files', () => {
      expect(isSupportedFile(createMockFile('project.dockerfile'))).toBe(true);
    });
  });

  describe('document files', () => {
    it('supports .pdf files', () => {
      expect(isSupportedFile(createMockFile('report.pdf'))).toBe(true);
    });

    it('supports .docx files', () => {
      expect(isSupportedFile(createMockFile('doc.docx'))).toBe(true);
    });

    it('supports .pptx files', () => {
      expect(isSupportedFile(createMockFile('slides.pptx'))).toBe(true);
    });
  });

  describe('spreadsheet files', () => {
    it('supports .xlsx files', () => {
      expect(isSupportedFile(createMockFile('data.xlsx'))).toBe(true);
    });

    it('supports .csv files', () => {
      expect(isSupportedFile(createMockFile('export.csv'))).toBe(true);
    });

    it('supports .xls files', () => {
      expect(isSupportedFile(createMockFile('old.xls'))).toBe(true);
    });
  });

  describe('code files', () => {
    it('supports .py files', () => {
      expect(isSupportedFile(createMockFile('script.py'))).toBe(true);
    });

    it('supports .js files', () => {
      expect(isSupportedFile(createMockFile('app.js'))).toBe(true);
    });

    it('supports .ts files', () => {
      expect(isSupportedFile(createMockFile('index.ts'))).toBe(true);
    });

    it('supports .tsx files', () => {
      expect(isSupportedFile(createMockFile('App.tsx'))).toBe(true);
    });

    it('supports .java files', () => {
      expect(isSupportedFile(createMockFile('Main.java'))).toBe(true);
    });

    it('supports .sql files', () => {
      expect(isSupportedFile(createMockFile('migration.sql'))).toBe(true);
    });

    it('supports .go files', () => {
      expect(isSupportedFile(createMockFile('main.go'))).toBe(true);
    });

    it('supports .rs files', () => {
      expect(isSupportedFile(createMockFile('lib.rs'))).toBe(true);
    });

    it('supports .sh files', () => {
      expect(isSupportedFile(createMockFile('deploy.sh'))).toBe(true);
    });

    it('supports .ipynb files', () => {
      expect(isSupportedFile(createMockFile('notebook.ipynb'))).toBe(true);
    });
  });

  describe('unsupported files', () => {
    it('rejects .exe files', () => {
      expect(isSupportedFile(createMockFile('app.exe'))).toBe(false);
    });

    it('rejects .png files', () => {
      expect(isSupportedFile(createMockFile('image.png'))).toBe(false);
    });

    it('rejects .jpg files', () => {
      expect(isSupportedFile(createMockFile('photo.jpg'))).toBe(false);
    });

    it('rejects .mp4 files', () => {
      expect(isSupportedFile(createMockFile('video.mp4'))).toBe(false);
    });

    it('rejects .zip files', () => {
      expect(isSupportedFile(createMockFile('archive.zip'))).toBe(false);
    });

    it('rejects files with no extension', () => {
      expect(isSupportedFile(createMockFile('Makefile'))).toBe(false);
    });

    it('rejects .dll files', () => {
      expect(isSupportedFile(createMockFile('library.dll'))).toBe(false);
    });
  });

  describe('case sensitivity', () => {
    it('extension check is case-insensitive (uppercase)', () => {
      // getFileExtension converts to lowercase before checking
      expect(isSupportedFile(createMockFile('README.TXT'))).toBe(true);
    });

    it('extension check is case-insensitive (mixed case)', () => {
      expect(isSupportedFile(createMockFile('data.Json'))).toBe(true);
    });
  });
});

// =============================================================================
// shouldScanFile
// =============================================================================

describe('shouldScanFile', () => {
  it('returns true for supported file within size limit', () => {
    expect(shouldScanFile(createMockFile('test.py', 1024))).toBe(true);
  });

  it('returns false for unsupported file type', () => {
    expect(shouldScanFile(createMockFile('image.png', 1024))).toBe(false);
  });

  it('returns false for file exceeding 10MB limit', () => {
    const elevenMB = 11 * 1024 * 1024;
    expect(shouldScanFile(createMockFile('huge.csv', elevenMB))).toBe(false);
  });

  it('returns true for file exactly at 10MB limit', () => {
    const tenMB = 10 * 1024 * 1024;
    expect(shouldScanFile(createMockFile('big.csv', tenMB))).toBe(true);
  });

  it('returns true for very small supported file', () => {
    expect(shouldScanFile(createMockFile('tiny.json', 1))).toBe(true);
  });
});

// =============================================================================
// hasBlockingFiles
// =============================================================================

describe('hasBlockingFiles', () => {
  it('returns false for empty results', () => {
    const results = new Map<string, FileAnalysisResult | FileScanError | null>();
    expect(hasBlockingFiles(results)).toBe(false);
  });

  it('returns true when a file has action=block', () => {
    const results = new Map<string, FileAnalysisResult | FileScanError | null>();
    results.set('secret.csv', {
      requestId: '1',
      filename: 'secret.csv',
      fileType: 'csv',
      extractedLength: 100,
      action: 'block',
      detections: [],
      message: 'Sensitive data found',
    });
    expect(hasBlockingFiles(results)).toBe(true);
  });

  it('returns false when all files have action=allow', () => {
    const results = new Map<string, FileAnalysisResult | FileScanError | null>();
    results.set('clean.csv', {
      requestId: '1',
      filename: 'clean.csv',
      fileType: 'csv',
      extractedLength: 100,
      action: 'allow',
      detections: [],
      message: 'No issues found',
    });
    expect(hasBlockingFiles(results)).toBe(false);
  });

  it('returns false when results contain only errors', () => {
    const results = new Map<string, FileAnalysisResult | FileScanError | null>();
    results.set('broken.csv', {
      error: true,
      message: 'Failed to scan',
      code: 'network',
    });
    expect(hasBlockingFiles(results)).toBe(false);
  });

  it('returns false when results contain nulls', () => {
    const results = new Map<string, FileAnalysisResult | FileScanError | null>();
    results.set('skipped.csv', null);
    expect(hasBlockingFiles(results)).toBe(false);
  });

  it('returns true when mixed results include a blocked file', () => {
    const results = new Map<string, FileAnalysisResult | FileScanError | null>();
    results.set('clean.txt', {
      requestId: '1',
      filename: 'clean.txt',
      fileType: 'txt',
      extractedLength: 50,
      action: 'allow',
      detections: [],
      message: 'OK',
    });
    results.set('secret.csv', {
      requestId: '2',
      filename: 'secret.csv',
      fileType: 'csv',
      extractedLength: 100,
      action: 'block',
      detections: [],
      message: 'Blocked',
    });
    results.set('error.pdf', {
      error: true,
      message: 'Failed',
      code: 'unknown',
    });
    expect(hasBlockingFiles(results)).toBe(true);
  });

  it('returns false for redact action (not block)', () => {
    const results = new Map<string, FileAnalysisResult | FileScanError | null>();
    results.set('redact.csv', {
      requestId: '1',
      filename: 'redact.csv',
      fileType: 'csv',
      extractedLength: 100,
      action: 'redact',
      detections: [],
      message: 'Redaction available',
    });
    expect(hasBlockingFiles(results)).toBe(false);
  });
});

// =============================================================================
// getFilesNeedingAttention
// =============================================================================

describe('getFilesNeedingAttention', () => {
  it('returns empty array for empty results', () => {
    const results = new Map<string, FileAnalysisResult | FileScanError | null>();
    expect(getFilesNeedingAttention(results)).toEqual([]);
  });

  it('returns files with block action', () => {
    const results = new Map<string, FileAnalysisResult | FileScanError | null>();
    const blockedFile: FileAnalysisResult = {
      requestId: '1',
      filename: 'secret.csv',
      fileType: 'csv',
      extractedLength: 100,
      action: 'block',
      detections: [],
      message: 'Blocked',
    };
    results.set('secret.csv', blockedFile);
    const attention = getFilesNeedingAttention(results);
    expect(attention).toEqual([blockedFile]);
  });

  it('returns files with redact action', () => {
    const results = new Map<string, FileAnalysisResult | FileScanError | null>();
    const redactFile: FileAnalysisResult = {
      requestId: '1',
      filename: 'pii.docx',
      fileType: 'docx',
      extractedLength: 200,
      action: 'redact',
      detections: [],
      message: 'Redaction needed',
    };
    results.set('pii.docx', redactFile);
    const attention = getFilesNeedingAttention(results);
    expect(attention).toEqual([redactFile]);
  });

  it('does not return files with allow action', () => {
    const results = new Map<string, FileAnalysisResult | FileScanError | null>();
    results.set('clean.txt', {
      requestId: '1',
      filename: 'clean.txt',
      fileType: 'txt',
      extractedLength: 50,
      action: 'allow',
      detections: [],
      message: 'Clean',
    });
    expect(getFilesNeedingAttention(results)).toEqual([]);
  });

  it('does not return error results', () => {
    const results = new Map<string, FileAnalysisResult | FileScanError | null>();
    results.set('error.pdf', {
      error: true,
      message: 'Failed',
      code: 'unknown',
    });
    expect(getFilesNeedingAttention(results)).toEqual([]);
  });

  it('does not return null results', () => {
    const results = new Map<string, FileAnalysisResult | FileScanError | null>();
    results.set('skipped.txt', null);
    expect(getFilesNeedingAttention(results)).toEqual([]);
  });

  it('returns only block and redact from mixed results', () => {
    const results = new Map<string, FileAnalysisResult | FileScanError | null>();
    results.set('clean.txt', {
      requestId: '1',
      filename: 'clean.txt',
      fileType: 'txt',
      extractedLength: 50,
      action: 'allow',
      detections: [],
      message: 'OK',
    });
    const blocked: FileAnalysisResult = {
      requestId: '2',
      filename: 'secret.csv',
      fileType: 'csv',
      extractedLength: 100,
      action: 'block',
      detections: [],
      message: 'Blocked',
    };
    results.set('secret.csv', blocked);
    const redacted: FileAnalysisResult = {
      requestId: '3',
      filename: 'pii.docx',
      fileType: 'docx',
      extractedLength: 200,
      action: 'redact',
      detections: [],
      message: 'Redact',
    };
    results.set('pii.docx', redacted);
    results.set('error.pdf', {
      error: true,
      message: 'Failed',
      code: 'network',
    });

    const attention = getFilesNeedingAttention(results);
    expect(attention.length).toBe(2);
    expect(attention).toContain(blocked);
    expect(attention).toContain(redacted);
  });
});
