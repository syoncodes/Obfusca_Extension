/**
 * Tests for LocalFileScanner and LocalFileExtractor (M11).
 *
 * All file I/O is performed against real in-memory File objects constructed
 * from known byte sequences — no disk access or network calls are made.
 *
 * The chrome.storage mock from tests/setup.ts is loaded by vitest before
 * this module is evaluated, satisfying the top-level initialisation code in
 * detection.ts (chrome.storage.onChanged.addListener / loadCustomPatternsIntoMemory).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LocalFileScanner } from '../LocalFileScanner';
import { LocalFileExtractor } from '../LocalFileExtractor';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a File from a UTF-8 string. */
function makeFile(name: string, content: string, type = 'text/plain'): File {
  const bytes = new TextEncoder().encode(content);
  return new File([bytes], name, { type });
}

/** Create a File from raw bytes (for binary / encoding edge cases). */
function makeBytesFile(name: string, bytes: Uint8Array, type = 'application/octet-stream'): File {
  return new File([bytes], name, { type });
}

/** Create a File larger than 512 KB. */
function makeLargeFile(name: string): File {
  const content = 'a'.repeat(513 * 1024); // 513 KB > 512 KB limit
  return makeFile(name, content);
}

/** Create a File with a UTF-8 BOM prefix. */
function makeFileWithBOM(name: string, content: string): File {
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]); // UTF-8 BOM
  const body = new TextEncoder().encode(content);
  const combined = new Uint8Array(bom.length + body.length);
  combined.set(bom);
  combined.set(body, bom.length);
  return makeBytesFile(name, combined, 'text/plain');
}

/** A Visa card number that passes the Luhn check. */
const VALID_VISA = '4532015112830366';

/** A valid-format SSN (area=123, group=45, serial=6789). */
const VALID_SSN = '123-45-6789';

/** A valid AWS Access Key ID. */
const VALID_AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';

// ---------------------------------------------------------------------------
// LocalFileScanner.canHandleLocally
// ---------------------------------------------------------------------------

describe('LocalFileScanner.canHandleLocally', () => {
  let scanner: LocalFileScanner;

  beforeEach(() => {
    scanner = new LocalFileScanner();
  });

  it('returns true for a small .txt file', () => {
    const file = makeFile('notes.txt', 'hello world');
    expect(scanner.canHandleLocally(file)).toBe(true);
  });

  it('returns true for a small .py file', () => {
    const file = makeFile('script.py', 'print("hello")');
    expect(scanner.canHandleLocally(file)).toBe(true);
  });

  it('returns true for a small .ts file', () => {
    const file = makeFile('app.ts', 'const x = 1;');
    expect(scanner.canHandleLocally(file)).toBe(true);
  });

  it('returns true for a small .json file', () => {
    const file = makeFile('config.json', '{"key":"value"}');
    expect(scanner.canHandleLocally(file)).toBe(true);
  });

  it('returns true for a small .env file', () => {
    const file = makeFile('.env', 'SECRET=abc');
    expect(scanner.canHandleLocally(file)).toBe(true);
  });

  it('returns true for a file exactly at the 512 KB boundary', () => {
    const content = 'x'.repeat(512 * 1024); // exactly 512 KB
    const file = makeFile('boundary.txt', content);
    expect(scanner.canHandleLocally(file)).toBe(true);
  });

  it('returns false for a file one byte over 512 KB', () => {
    const content = 'x'.repeat(512 * 1024 + 1);
    const file = makeFile('toolarge.txt', content);
    expect(scanner.canHandleLocally(file)).toBe(false);
  });

  it('returns false for a large (513 KB) file regardless of extension', () => {
    const file = makeLargeFile('big.txt');
    expect(scanner.canHandleLocally(file)).toBe(false);
  });

  it('returns false for a .pdf file (stub format)', () => {
    const file = makeFile('doc.pdf', '%PDF-1.4');
    expect(scanner.canHandleLocally(file)).toBe(false);
  });

  it('returns false for a .docx file (stub format)', () => {
    const file = makeFile('report.docx', 'PK\x03\x04');
    expect(scanner.canHandleLocally(file)).toBe(false);
  });

  it('returns false for a .xlsx file (stub format)', () => {
    const file = makeFile('sheet.xlsx', 'PK\x03\x04');
    expect(scanner.canHandleLocally(file)).toBe(false);
  });

  it('returns false for a file with no extension', () => {
    const file = makeFile('Makefile', 'all: build');
    expect(scanner.canHandleLocally(file)).toBe(false);
  });

  it('returns false for an unsupported binary extension (.exe)', () => {
    const file = makeFile('app.exe', 'MZ\x90\x00');
    expect(scanner.canHandleLocally(file)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LocalFileExtractor.extract
// ---------------------------------------------------------------------------

describe('LocalFileExtractor.extract', () => {
  it('extracts text from a .txt file', async () => {
    const content = 'Hello, world!';
    const file = makeFile('hello.txt', content);
    const result = await LocalFileExtractor.extract(file);
    expect(result).toBe(content);
  });

  it('extracts text from a .md file', async () => {
    const content = '# Title\n\nSome **markdown** content.';
    const file = makeFile('README.md', content);
    const result = await LocalFileExtractor.extract(file);
    expect(result).toBe(content);
  });

  it('extracts code from a .py file', async () => {
    const content = 'def greet(name):\n    print(f"Hello, {name}")\n';
    const file = makeFile('greet.py', content);
    const result = await LocalFileExtractor.extract(file);
    expect(result).toBe(content);
  });

  it('extracts and returns raw text from a .json file', async () => {
    const content = '{"api_key": "sk-test123", "env": "prod"}';
    const file = makeFile('config.json', content);
    const result = await LocalFileExtractor.extract(file);
    expect(result).toBe(content);
  });

  it('returns raw text from a malformed .json file (still scans for secrets)', async () => {
    const content = '{"broken": "json';
    const file = makeFile('bad.json', content);
    const result = await LocalFileExtractor.extract(file);
    // Should not throw — raw text is still returned
    expect(result).toBe(content);
  });

  it('extracts text from a .csv file', async () => {
    const content = 'name,email,ssn\nAlice,alice@example.com,123-45-6789\n';
    const file = makeFile('data.csv', content);
    const result = await LocalFileExtractor.extract(file);
    expect(result).toBe(content);
  });

  it('extracts text from a .tsv file', async () => {
    const content = 'name\temail\nBob\tbob@example.com\n';
    const file = makeFile('data.tsv', content);
    const result = await LocalFileExtractor.extract(file);
    expect(result).toBe(content);
  });

  it('extracts content from a .env file', async () => {
    const content = 'DATABASE_URL=postgres://user:pass@host/db\nSECRET_KEY=abc123\n';
    const file = makeFile('.env', content);
    const result = await LocalFileExtractor.extract(file);
    expect(result).toBe(content);
  });

  it('extracts text from a .yaml file', async () => {
    const content = 'aws:\n  access_key: AKIAIOSFODNN7EXAMPLE\n';
    const file = makeFile('infra.yaml', content);
    const result = await LocalFileExtractor.extract(file);
    expect(result).toBe(content);
  });

  it('extracts text from a .xml file', async () => {
    const content = '<config><key>sk-test</key></config>';
    const file = makeFile('app.xml', content);
    const result = await LocalFileExtractor.extract(file);
    expect(result).toBe(content);
  });

  it('strips the UTF-8 BOM and returns the clean text', async () => {
    const content = 'API_KEY=mysecret123';
    const file = makeFileWithBOM('settings.env', content);
    const result = await LocalFileExtractor.extract(file);
    // TextDecoder strips the UTF-8 BOM (U+FEFF) by default
    expect(result).not.toBeNull();
    expect(result!.startsWith('\ufeff')).toBe(false);
    expect(result).toContain(content);
  });

  it('handles a binary file gracefully — decodes without throwing', async () => {
    // Random bytes that are not valid UTF-8 sequences
    const bytes = new Uint8Array([0x80, 0x81, 0x82, 0x83, 0xff, 0xfe, 0x00, 0x01]);
    const file = makeBytesFile('data.bin', bytes, 'application/octet-stream');
    // .bin is unsupported — should return null without throwing
    const result = await LocalFileExtractor.extract(file);
    expect(result).toBeNull();
  });

  it('handles a .txt file with non-UTF-8 bytes gracefully', async () => {
    // High bytes that are not valid UTF-8 — TextDecoder replaces them with U+FFFD
    const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x80, 0x90]);
    const file = makeBytesFile('latin.txt', bytes, 'text/plain');
    const result = await LocalFileExtractor.extract(file);
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
  });

  it('returns null for a .pdf file (stub)', async () => {
    const file = makeFile('document.pdf', '%PDF-1.4');
    expect(await LocalFileExtractor.extract(file)).toBeNull();
  });

  it('returns null for a .docx file (stub)', async () => {
    const file = makeFile('report.docx', 'PK\x03\x04');
    expect(await LocalFileExtractor.extract(file)).toBeNull();
  });

  it('returns null for a .xlsx file (stub)', async () => {
    const file = makeFile('sheet.xlsx', 'PK\x03\x04');
    expect(await LocalFileExtractor.extract(file)).toBeNull();
  });

  it('returns null for an unsupported extension', async () => {
    const file = makeFile('image.png', '\x89PNG\r\n');
    expect(await LocalFileExtractor.extract(file)).toBeNull();
  });

  it('returns empty string for an empty .txt file', async () => {
    const file = makeFile('empty.txt', '');
    const result = await LocalFileExtractor.extract(file);
    expect(result).toBe('');
  });
});

// ---------------------------------------------------------------------------
// LocalFileScanner.scan — end-to-end
// ---------------------------------------------------------------------------

describe('LocalFileScanner.scan', () => {
  let scanner: LocalFileScanner;

  beforeEach(() => {
    scanner = new LocalFileScanner();
  });

  it('returns null for an unsupported format (.pdf stub)', async () => {
    const file = makeFile('document.pdf', '%PDF-1.4');
    const result = await scanner.scan(file, 'chatgpt');
    expect(result).toBeNull();
  });

  it('returns null for an unsupported binary extension', async () => {
    const bytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]); // MZ header (PE binary)
    const file = makeBytesFile('app.exe', bytes);
    const result = await scanner.scan(file, 'chatgpt');
    expect(result).toBeNull();
  });

  it('returns action=allow and no detections for an empty file', async () => {
    const file = makeFile('empty.txt', '');
    const result = await scanner.scan(file, 'test');
    expect(result).not.toBeNull();
    expect(result!.action).toBe('allow');
    expect(result!.detections).toHaveLength(0);
    expect(result!.scannedLocally).toBe(true);
  });

  it('returns action=allow for a clean text file', async () => {
    const file = makeFile('notes.txt', 'This is a benign note with no secrets.');
    const result = await scanner.scan(file, 'claude');
    expect(result).not.toBeNull();
    expect(result!.action).toBe('allow');
    expect(result!.detections).toHaveLength(0);
  });

  it('detects an SSN and returns action=block', async () => {
    const file = makeFile('record.txt', `Patient SSN: ${VALID_SSN}\n`);
    const result = await scanner.scan(file, 'chatgpt');
    expect(result).not.toBeNull();
    expect(result!.action).toBe('block');
    expect(result!.detections.some(d => d.type === 'ssn')).toBe(true);
  });

  it('detects an AWS key and returns action=block', async () => {
    const file = makeFile('creds.env', `AWS_ACCESS_KEY_ID=${VALID_AWS_KEY}\n`);
    const result = await scanner.scan(file, 'copilot');
    expect(result).not.toBeNull();
    expect(result!.action).toBe('block');
    expect(result!.detections.some(d => d.type === 'aws_key')).toBe(true);
  });

  it('detects a credit card number in a CSV and returns action=block', async () => {
    const file = makeFile(
      'payments.csv',
      `id,card\n1,${VALID_VISA}\n`
    );
    const result = await scanner.scan(file, 'chatgpt');
    expect(result).not.toBeNull();
    expect(result!.action).toBe('block');
    expect(result!.detections.some(d => d.type === 'credit_card')).toBe(true);
  });

  it('detects an API key in a .py source file', async () => {
    const file = makeFile(
      'deploy.py',
      'import openai\nopenai.api_key = "sk-ABCDEFGHIJKLMNOPQRSTUVWX"\n'
    );
    const result = await scanner.scan(file, 'github-copilot');
    expect(result).not.toBeNull();
    expect(result!.action).toBe('block');
    expect(result!.detections.some(d => d.type === 'api_key')).toBe(true);
  });

  it('detects an API key in a .env file', async () => {
    const content = 'OPENAI_API_KEY=sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ\n';
    const file = makeFile('.env', content);
    const result = await scanner.scan(file, 'claude');
    expect(result).not.toBeNull();
    expect(result!.action).toBe('block');
  });

  it('returns multiple detections for a file with SSN + credit card', async () => {
    const content = `SSN: ${VALID_SSN}\nPayment card: ${VALID_VISA}\n`;
    const file = makeFile('combined.txt', content);
    const result = await scanner.scan(file, 'chatgpt');
    expect(result).not.toBeNull();
    expect(result!.detections.length).toBeGreaterThanOrEqual(2);
    expect(result!.action).toBe('block');
    const types = result!.detections.map(d => d.type);
    expect(types).toContain('ssn');
    expect(types).toContain('credit_card');
  });

  it('populates all metadata fields on a successful scan', async () => {
    const content = 'name=Alice\npassword=hunter2\n';
    const file = makeFile('config.ini', content);
    const result = await scanner.scan(file, 'gemini');
    expect(result).not.toBeNull();
    expect(result!.fileName).toBe('config.ini');
    expect(result!.fileType).toBe('ini');
    expect(result!.fileSize).toBe(file.size);
    expect(result!.extractedLength).toBe(content.length);
    expect(result!.scannedLocally).toBe(true);
  });

  it('scans a .json file and reports detections within it', async () => {
    const content = JSON.stringify({ key: VALID_AWS_KEY, env: 'prod' });
    const file = makeFile('deploy.json', content);
    const result = await scanner.scan(file, 'chatgpt');
    expect(result).not.toBeNull();
    expect(result!.action).toBe('block');
  });

  it('scans a .md file and reports detections', async () => {
    const content = `# Secrets\n\nAWS key: ${VALID_AWS_KEY}\n`;
    const file = makeFile('notes.md', content);
    const result = await scanner.scan(file, 'claude');
    expect(result).not.toBeNull();
    expect(result!.action).toBe('block');
    expect(result!.fileType).toBe('md');
  });

  it('reports scannedLocally=true on every successful result', async () => {
    const file = makeFile('hello.txt', 'safe content only');
    const result = await scanner.scan(file, 'test');
    expect(result).not.toBeNull();
    expect(result!.scannedLocally).toBe(true);
  });

  it('detects a private key header in a .txt file', async () => {
    const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n';
    const file = makeFile('key.txt', content);
    const result = await scanner.scan(file, 'chatgpt');
    expect(result).not.toBeNull();
    expect(result!.action).toBe('block');
    expect(result!.detections.some(d => d.type === 'private_key')).toBe(true);
  });

  it('handles a file with a UTF-8 BOM without crashing', async () => {
    const file = makeFileWithBOM('bom.txt', `AWS_KEY=${VALID_AWS_KEY}`);
    const result = await scanner.scan(file, 'claude');
    expect(result).not.toBeNull();
    // BOM-stripped text must still be scanned
    expect(result!.action).toBe('block');
  });

  it('extractedLength matches the length of the extracted text', async () => {
    const content = 'hello world\n';
    const file = makeFile('simple.txt', content);
    const result = await scanner.scan(file, 'test');
    expect(result).not.toBeNull();
    expect(result!.extractedLength).toBe(content.length);
  });

  it('detects a GitHub personal access token in a .ts config file', async () => {
    const token = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    const content = `const config = { githubToken: '${token}' };\n`;
    const file = makeFile('config.ts', content);
    const result = await scanner.scan(file, 'chatgpt');
    expect(result).not.toBeNull();
    expect(result!.action).toBe('block');
    expect(result!.detections.some(d => d.type === 'api_key')).toBe(true);
  });
});
