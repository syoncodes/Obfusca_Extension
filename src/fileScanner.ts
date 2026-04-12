/**
 * File upload scanner for Obfusca.
 * Intercepts file uploads on LLM chat sites and scans for sensitive data.
 */

import { getAccessToken } from './auth';
import { API_URL } from './config';

const BACKEND_URL = API_URL;
const FILE_ANALYZE_ENDPOINT = `${BACKEND_URL}/files/analyze`;
const TIMEOUT_MS = 10000; // 10 seconds for file analysis (larger files)

// Maximum file size to scan (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Supported file extensions — must match backend HANDLERS keys
const SUPPORTED_EXTENSIONS = new Set([
  // Text
  'txt', 'md', 'log', 'rtf',
  // Config
  'json', 'xml', 'yaml', 'yml', 'env', 'ini', 'toml', 'conf', 'cfg',
  'config', 'plist', 'dockerfile', 'gradle',
  // Documents
  'pdf', 'docx', 'pptx', 'odt',
  // Spreadsheets
  'xlsx', 'xls', 'csv',
  // Code
  'py', 'js', 'ts', 'jsx', 'tsx', 'java', 'sql', 'go', 'rb', 'php',
  'cs', 'cpp', 'c', 'h', 'hpp', 'sh', 'bash', 'zsh', 'ps1', 'swift',
  'kt', 'kts', 'rs', 'scala', 'r', 'm', 'mm', 'pl', 'pm', 'lua',
  'dart', 'coffee', 'less', 'scss', 'sass', 'html', 'htm', 'tex',
  'latex', 'ipynb',
]);

export interface FileDetection {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  start: number;
  end: number;
  confidence: number;
  /** Human-readable label returned by the backend (e.g. "AWS Secret Key"). */
  display_name?: string | null;
}

export interface MappingItem {
  /** Zero-based index of this detection in the sorted list */
  index: number;
  original_preview: string;
  placeholder: string;
  type: string;
  /** Severity level (critical/high/medium/low) */
  severity: string;
  /** Start character position in the original text */
  start: number;
  /** End character position in the original text */
  end: number;
  /** Format-preserving X-mask */
  masked_value: string;
  /** Realistic fake value */
  dummy_value: string;
  display_name?: string | null;
  replacement?: string | null;
  auto_redact?: boolean;
  /** original_value is excluded from backend serialization for security */
  original_value?: string | null;
}

export interface ObfuscationData {
  obfuscated_text: string;
  mappings: MappingItem[];
}

export interface FileAnalysisResult {
  requestId: string;
  filename: string;
  fileType: string;
  extractedLength: number;
  action: 'allow' | 'block' | 'redact';
  detections: FileDetection[];
  obfuscation?: ObfuscationData;
  message: string;
  // Type detection fields
  typeMismatch?: boolean;
  typeMismatchWarning?: string | null;
  detectedType?: string | null;
  isDangerous?: boolean;
  dangerWarning?: string | null;
  // Extracted text for AI dummy generation
  extractedText?: string | null;
}

export interface FileScanError {
  error: true;
  message: string;
  code: 'unsupported' | 'too_large' | 'network' | 'extraction' | 'unknown';
}

/**
 * Get file extension from filename.
 */
function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) return '';
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Check if a file is supported for scanning.
 */
export function isSupportedFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  return SUPPORTED_EXTENSIONS.has(ext);
}

/**
 * Check if a file should be scanned (supported and within size limit).
 */
export function shouldScanFile(file: File): boolean {
  if (!isSupportedFile(file)) {
    console.log(`[Obfusca FileScanner] Skipping unsupported file: ${file.name}`);
    return false;
  }

  if (file.size > MAX_FILE_SIZE) {
    console.log(`[Obfusca FileScanner] Skipping large file: ${file.name} (${file.size} bytes)`);
    return false;
  }

  return true;
}

/**
 * Convert File to base64 string.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:application/pdf;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Scan a file for sensitive data using the backend API.
 *
 * @param file - The File object to scan
 * @returns FileAnalysisResult on success, FileScanError on failure, or null if skipped
 */
export async function scanFile(file: File): Promise<FileAnalysisResult | FileScanError | null> {
  console.log(`[Obfusca FileScanner] Scanning file: ${file.name} (${file.size} bytes)`);

  // Check if file should be scanned
  if (!isSupportedFile(file)) {
    return {
      error: true,
      message: `Unsupported file type: ${file.name}`,
      code: 'unsupported',
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      error: true,
      message: `File too large: ${file.name} (max ${MAX_FILE_SIZE / (1024 * 1024)}MB)`,
      code: 'too_large',
    };
  }

  try {
    // Convert file to base64
    console.log(`[Obfusca FileScanner] Converting file to base64...`);
    const contentBase64 = await fileToBase64(file);
    console.log(`[Obfusca FileScanner] Base64 length: ${contentBase64.length}`);

    // Prepare request
    const body = {
      filename: file.name,
      content_base64: contentBase64,
    };

    // Build headers
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // Add auth token if available
    const accessToken = await getAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      console.log('[Obfusca FileScanner] Using authenticated request');
    }

    // Send to backend
    console.log(`[Obfusca FileScanner] Sending to backend: ${FILE_ANALYZE_ENDPOINT}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(FILE_ANALYZE_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Obfusca FileScanner] Backend error: ${response.status}`, errorText);

      if (response.status === 413) {
        return {
          error: true,
          message: 'File too large for server',
          code: 'too_large',
        };
      }

      if (response.status === 415) {
        return {
          error: true,
          message: 'Unsupported file type',
          code: 'unsupported',
        };
      }

      return {
        error: true,
        message: `Server error: ${response.status}`,
        code: 'unknown',
      };
    }

    const result = await response.json();
    console.log(`[Obfusca FileScanner] Analysis complete:`, {
      action: result.action,
      detections: result.detections?.length || 0,
      fileType: result.file_type,
      typeMismatch: result.type_mismatch || false,
      isDangerous: result.is_dangerous || false,
    });

    return {
      requestId: result.request_id,
      filename: result.filename,
      fileType: result.file_type,
      extractedLength: result.extracted_length,
      action: result.action,
      detections: result.detections || [],
      obfuscation: result.obfuscation,
      message: result.message,
      typeMismatch: result.type_mismatch || false,
      typeMismatchWarning: result.type_mismatch_warning || null,
      detectedType: result.detected_type || null,
      isDangerous: result.is_dangerous || false,
      dangerWarning: result.danger_warning || null,
      extractedText: result.extracted_text || null,
    };

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[Obfusca FileScanner] Request timed out`);
      return {
        error: true,
        message: 'File analysis timed out',
        code: 'network',
      };
    }

    console.error(`[Obfusca FileScanner] Error scanning file:`, error);
    return {
      error: true,
      message: error instanceof Error ? error.message : 'Unknown error',
      code: 'unknown',
    };
  }
}

/**
 * Scan multiple files and return results for each.
 */
export async function scanFiles(files: File[]): Promise<Map<string, FileAnalysisResult | FileScanError | null>> {
  const results = new Map<string, FileAnalysisResult | FileScanError | null>();

  for (const file of files) {
    const result = await scanFile(file);
    results.set(file.name, result);
  }

  return results;
}

/**
 * Check if any file in a list has blocking detections.
 */
export function hasBlockingFiles(results: Map<string, FileAnalysisResult | FileScanError | null>): boolean {
  for (const result of results.values()) {
    if (result && !('error' in result) && result.action === 'block') {
      return true;
    }
  }
  return false;
}

/**
 * Get files that need user attention (block or redact action).
 */
export function getFilesNeedingAttention(
  results: Map<string, FileAnalysisResult | FileScanError | null>
): FileAnalysisResult[] {
  const attention: FileAnalysisResult[] = [];

  for (const result of results.values()) {
    if (result && !('error' in result) && (result.action === 'block' || result.action === 'redact')) {
      attention.push(result);
    }
  }

  return attention;
}
