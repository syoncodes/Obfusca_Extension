/**
 * Universal file interception for Obfusca.
 *
 * Uses a document-level capture listener on 'change' events to SYNCHRONOUSLY
 * block file input selections before platform handlers fire.
 *
 * Why document-level capture?
 * - Platform handlers (ChatGPT, Claude, etc.) read files in their change handlers.
 * - An async scanner on individual inputs can't stopPropagation() in time — JS
 *   events continue propagating as soon as the handler hits its first `await`.
 * - A document capture listener fires BEFORE any element-level or bubble handler,
 *   letting us block synchronously, scan async, then re-dispatch if clean.
 *
 * Flow:
 * 1. User selects file → 'change' event fires on input
 * 2. Our document capture listener fires first → stopImmediatePropagation()
 * 3. Save File objects, scan them via backend API
 * 4. Clean → restore files to input, re-dispatch change (with bypass flag)
 * 5. Sensitive → show detection popup with protect/allow/remove options
 */

import { scanFile, shouldScanFile, fileToBase64, type FileAnalysisResult, type FileScanError, type ObfuscationData } from '../fileScanner';
import { protectFile, generateDummiesBatch, type ProtectionChoice } from '../api';
import { OBFUSCA_STYLES, showDetectionPopup, showMultiItemPopup, type FlaggedItem } from '../ui';
import { isBypassActive } from './interceptor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the original sensitive value from a mapping item.
 * Uses start/end positions to extract from the source text, with proper
 * bounds checking. Returns null if the value cannot be resolved.
 */
function resolveOriginalValue(
  mapping: { original_value?: string | null; start?: number | null; end?: number | null },
  extractedText?: string | null,
): string | null {
  if (mapping.original_value) return mapping.original_value;

  if (
    extractedText &&
    typeof mapping.start === 'number' &&
    typeof mapping.end === 'number' &&
    mapping.start >= 0 &&
    mapping.end > mapping.start &&
    mapping.end <= extractedText.length
  ) {
    return extractedText.slice(mapping.start, mapping.end);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Toast utility
// ---------------------------------------------------------------------------

function showToast(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
  // Remove any existing toast
  document.getElementById('obfusca-file-toast')?.remove();

  const toast = document.createElement('div');
  toast.id = 'obfusca-file-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    font-family: ${OBFUSCA_STYLES.fonts.sans};
    animation: obfusca-toast-fade-in 0.3s ease-out;
  `;

  const colors: Record<string, string> = {
    info: '#2563eb',
    success: OBFUSCA_STYLES.colors.success,
    error: OBFUSCA_STYLES.colors.destructive,
  };

  toast.innerHTML = `
    <style>
      @keyframes obfusca-toast-fade-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    </style>
    <div style="
      background: ${OBFUSCA_STYLES.colors.card};
      border: 1px solid ${OBFUSCA_STYLES.colors.border};
      border-left: 3px solid ${colors[type]};
      border-radius: ${OBFUSCA_STYLES.radius.lg};
      padding: 12px 16px;
      font-size: 13px;
      color: ${OBFUSCA_STYLES.colors.foreground};
      box-shadow: ${OBFUSCA_STYLES.shadows.lg};
    ">${message}</div>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s';
      setTimeout(() => toast.remove(), 200);
    }
  }, 3000);
}

// ---------------------------------------------------------------------------
// Temporary file allowances — files skip interception only briefly
// ---------------------------------------------------------------------------

const pendingAllowedFiles = new Map<string, number>(); // hash → expiration timestamp

function getFileKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

/**
 * Mark a file to skip interception for the next upload only.
 * Allowance expires after 5 seconds (enough time for the upload to process).
 */
export function allowFileTemporarily(file: File): void {
  const hash = getFileKey(file);
  const expiresAt = Date.now() + 5000;
  pendingAllowedFiles.set(hash, expiresAt);
  console.log('[Obfusca Files] File temporarily allowed:', file.name, 'expires in 5s');

  setTimeout(() => {
    if (pendingAllowedFiles.get(hash) === expiresAt) {
      pendingAllowedFiles.delete(hash);
      console.log('[Obfusca Files] File allowance expired:', file.name);
    }
  }, 5500);
}

/**
 * Check if a file should skip interception.
 * Returns true only if recently allowed AND not expired. Consumes the allowance (one-time use).
 */
function isFileTemporarilyAllowed(file: File): boolean {
  const hash = getFileKey(file);
  const expiresAt = pendingAllowedFiles.get(hash);
  if (!expiresAt) return false;

  if (Date.now() > expiresAt) {
    pendingAllowedFiles.delete(hash);
    return false;
  }

  pendingAllowedFiles.delete(hash);
  console.log('[Obfusca Files] File allowance consumed:', file.name);
  return true;
}

/**
 * Non-consuming peek: check if file is allowed without consuming the allowance.
 * Used by drop handler to check all files before deciding whether to intercept.
 */
function isFileAllowedPeek(file: File): boolean {
  const hash = getFileKey(file);
  const expiresAt = pendingAllowedFiles.get(hash);
  if (!expiresAt) return false;
  return Date.now() <= expiresAt;
}


// ---------------------------------------------------------------------------
// Bypass tracking — events we re-dispatched after scanning clean files
// ---------------------------------------------------------------------------

const bypassedEvents = new WeakSet<Event>();

// ---------------------------------------------------------------------------
// Bypass flag for file restoration — prevents re-interception of restored files
// ---------------------------------------------------------------------------
// When the page script (reactFileRestore.js) dispatches a native change event
// on GitHub Copilot's #image-uploader, our document-level capture listener would
// block it before React can process it. This flag tells the listener to let it through.

let bypassFileInterception = false;

export function setBypassFileInterception(value: boolean): void {
  bypassFileInterception = value;
  console.log(`[Obfusca Files] Bypass file interception: ${value}`);
}

// ---------------------------------------------------------------------------
// Pending flagged files queue — deferred popup mode
// ---------------------------------------------------------------------------
//
// When a file is flagged, instead of showing a popup immediately we store the
// results here and let the text interceptor combine them with any flagged text
// at submit time. A fallback timeout fires the popup if no submit happens.

/** Snapshot of everything needed to display / act on a flagged file later. */
export interface PendingFlaggedFileEntry {
  flaggedItems: FlaggedItem[];
  flaggedMeta: Map<string, { file: File; fileBase64: string; analysis: FileAnalysisResult }>;
  allFiles: File[];
  cleanFiles: File[];
  input: HTMLInputElement;
}

let pendingFlaggedFiles: PendingFlaggedFileEntry | null = null;

// ---------------------------------------------------------------------------
// In-flight scan tracking
// ---------------------------------------------------------------------------
//
// Tracks how many file scans are currently in progress. The submit handler
// can check this and wait for all scans to finish before showing a popup,
// so text + file detections are always merged into a single unified popup.

let inFlightScanCount = 0;

/** Resolvers waiting for all in-flight scans to complete. */
const inFlightWaiters: Array<() => void> = [];

/**
 * Returns true if any file scan is currently in progress.
 */
export function hasInFlightFileScans(): boolean {
  return inFlightScanCount > 0;
}

/**
 * Wait for all in-flight file scans to complete, then return the pending
 * flagged files entry (consuming it). If no scans are in-flight, returns
 * the pending entry immediately. Resolves after `timeoutMs` regardless.
 */
export function waitForPendingFileScans(timeoutMs: number): Promise<PendingFlaggedFileEntry | null> {
  if (inFlightScanCount === 0) {
    return Promise.resolve(consumePendingFlaggedFiles());
  }

  return new Promise<PendingFlaggedFileEntry | null>((resolve) => {
    let settled = false;

    const settle = () => {
      if (settled) return;
      settled = true;
      // Remove this resolver from the waiters list
      const idx = inFlightWaiters.indexOf(onDone);
      if (idx !== -1) inFlightWaiters.splice(idx, 1);
      resolve(consumePendingFlaggedFiles());
    };

    const onDone = settle;
    inFlightWaiters.push(onDone);

    // Timeout fallback — resolve with whatever completed so far
    setTimeout(() => {
      if (!settled) {
        console.warn(`[Obfusca Files] waitForPendingFileScans timed out after ${timeoutMs}ms`);
        settle();
      }
    }, timeoutMs);
  });
}

/**
 * Notify any waiters that in-flight scan count has dropped to zero.
 */
function notifyInFlightWaiters(): void {
  if (inFlightScanCount > 0) return;
  // Drain all waiters — they each call consumePendingFlaggedFiles() on resolve
  const waiters = inFlightWaiters.splice(0);
  for (const fn of waiters) fn();
}

/**
 * Check whether there are flagged files waiting to be shown in a popup.
 */
export function hasPendingFlaggedFiles(): boolean {
  return pendingFlaggedFiles !== null;
}

/**
 * Consume the pending flagged files queue. Returns the entry and clears it.
 * The caller (text interceptor) is responsible for showing the popup.
 */
export function consumePendingFlaggedFiles(): PendingFlaggedFileEntry | null {
  if (!pendingFlaggedFiles) return null;
  const entry = pendingFlaggedFiles;
  pendingFlaggedFiles = null;
  console.log('[Obfusca Files] Pending flagged files consumed by text interceptor');
  return entry;
}

/**
 * Store flagged file results, ready for the submit handler to pick up.
 * The independent 30-second fallback popup has been removed: the submit
 * handler now waits for in-flight scans via waitForPendingFileScans() and
 * always merges file + text detections into one unified popup.
 */
function deferFlaggedFiles(entry: PendingFlaggedFileEntry): void {
  pendingFlaggedFiles = entry;

  console.log(
    `[Obfusca Files] Deferred ${entry.flaggedItems.length} flagged file(s), ` +
    'waiting for submit to merge with text detections'
  );

  // Brief toast so the user knows something was found
  showToast(
    `${entry.flaggedItems.length} file${entry.flaggedItems.length !== 1 ? 's' : ''} flagged — ` +
    'review will appear when you send your message',
    'info'
  );
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let captureListenerAttached = false;
let dropListenerAttached = false;

// ---------------------------------------------------------------------------
// Core interception — document-level capture listener
// ---------------------------------------------------------------------------

/**
 * Document-level capture listener for file input change events.
 * Fires BEFORE any platform handler, allowing synchronous blocking.
 */
function onDocumentFileCapture(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.type !== 'file') return;

  // Skip when bypass is active (file being restored by page script)
  if (bypassFileInterception) {
    console.log('[Obfusca Files] Bypass active — letting restored file through');
    return;
  }

  // Skip when the user confirmed "send unprotected" — the bypass flag means
  // the next submit should pass through entirely without scanning any content,
  // including file attachments.
  if (isBypassActive()) {
    console.log('[Obfusca Files] Submit bypass active — letting files through without scanning');
    return;
  }

  // Skip events we re-dispatched after scanning clean files
  if (bypassedEvents.has(event)) return;

  const files = target.files;
  if (!files || files.length === 0) return;

  const fileArray = Array.from(files);

  console.log(
    `[Obfusca Files] Captured file change: ${fileArray.length} file(s)`,
    fileArray.map(f => ({ name: f.name, size: f.size, type: f.type }))
  );

  // Check which files need scanning (consuming temporary allowances)
  const filesToScan: File[] = [];
  for (const f of fileArray) {
    if (isFileTemporarilyAllowed(f)) {
      console.log('[Obfusca Files] Skipping temporarily allowed file:', f.name);
    } else {
      filesToScan.push(f);
    }
  }

  // All files were temporarily allowed — let event proceed
  if (filesToScan.length === 0) {
    console.log('[Obfusca Files] All files temporarily allowed, passing through');
    return;
  }

  // No remaining files need scanning (all unsupported / too large)
  if (!filesToScan.some(f => shouldScanFile(f))) {
    console.log('[Obfusca Files] No scannable files, passing through');
    return;
  }

  // ========== SYNCHRONOUS BLOCK ==========
  // Must happen before any await — events propagate synchronously.
  event.stopImmediatePropagation();
  event.preventDefault();

  console.log('[Obfusca Files] Event blocked synchronously, starting async scan...');
  showToast('Scanning file for sensitive data...', 'info');

  // Async scanning — event is already blocked, propagation stopped
  processInterceptedFiles(target, fileArray, filesToScan);
}

// ---------------------------------------------------------------------------
// Async scanning pipeline
// ---------------------------------------------------------------------------

/**
 * Scan intercepted files. If all clean, restore to input and re-dispatch.
 * If any have sensitive data, show detection popup.
 *
 * Collects ALL scan results first so that multiple flagged files can be
 * presented in a single multi-item popup instead of one popup per file.
 */
async function processInterceptedFiles(
  input: HTMLInputElement,
  files: File[],
  filesToScan?: File[]
): Promise<void> {
  // Track this scan as in-flight so the submit handler can wait for it
  inFlightScanCount++;
  console.log(`[Obfusca Files] In-flight scan started (count=${inFlightScanCount})`);

  const scanSet = filesToScan ? new Set(filesToScan) : null;

  // Phase 1: Scan ALL files, collect flagged items and clean files
  const flaggedItems: FlaggedItem[] = [];
  const cleanFiles: File[] = [];
  // Map flagged item id -> { file, fileBase64 } for later use in callbacks
  const flaggedMeta = new Map<string, { file: File; fileBase64: string; analysis: FileAnalysisResult }>();

  for (const file of files) {
    // Files not in the scan set pass through as clean
    if (scanSet && !scanSet.has(file)) {
      cleanFiles.push(file);
      continue;
    }
    // Unscannable files pass through as clean
    if (!shouldScanFile(file)) {
      cleanFiles.push(file);
      continue;
    }

    console.log(`[Obfusca Files] Scanning: ${file.name}`);

    try {
      const fileBase64 = await fileToBase64(file);
      const result = await scanFile(file);

      if (!result) {
        console.log(`[Obfusca Files] No result for: ${file.name}`);
        cleanFiles.push(file);
        continue;
      }

      if ('error' in result) {
        const scanError = result as FileScanError;
        console.log(`[Obfusca Files] Scan error for ${file.name}: ${scanError.message}`);
        cleanFiles.push(file);
        continue;
      }

      const analysis = result as FileAnalysisResult;

      // Log type detection info
      if (analysis.typeMismatch) {
        console.warn(`[Obfusca Files] TYPE MISMATCH: ${file.name} — ${analysis.typeMismatchWarning}`);
      }
      if (analysis.isDangerous) {
        console.warn(`[Obfusca Files] DANGEROUS FILE: ${file.name} — ${analysis.dangerWarning}`);
      }

      if (analysis.action === 'block' || analysis.action === 'redact') {
        console.log(
          `[Obfusca Files] SENSITIVE: ${file.name}, action=${analysis.action}, detections=${analysis.detections.length}`
        );

        const itemId = `file-${file.name}-${Date.now()}-${flaggedItems.length}`;
        const extractedTextContent = analysis.extractedText || '';
        if (analysis.extractedLength && extractedTextContent.length < analysis.extractedLength) {
          console.warn(
            `[Obfusca Files] WARNING: extracted_text truncated for ${file.name}: ` +
            `received ${extractedTextContent.length} chars but extractedLength=${analysis.extractedLength}. ` +
            `Detections at positions beyond ${extractedTextContent.length} will fail.`
          );
        }
        flaggedItems.push({
          id: itemId,
          type: 'file',
          name: file.name,
          status: 'pending',
          content: extractedTextContent,
          response: analysis,
          mappings: analysis.obfuscation?.mappings || [],
          file: file,
          fileBase64: fileBase64,
        });
        flaggedMeta.set(itemId, { file, fileBase64, analysis });
      } else {
        // Show mismatch warning even for clean files
        if (analysis.typeMismatch && analysis.typeMismatchWarning) {
          showToast(analysis.typeMismatchWarning, 'info');
        }
        console.log(`[Obfusca Files] Clean: ${file.name}`);
        cleanFiles.push(file);
      }
    } catch (err) {
      console.error(`[Obfusca Files] Error scanning ${file.name}:`, err);
      // Fail open for file scanning — let through on error
      cleanFiles.push(file);
    }
  }

  // Phase 2: No flagged items — all clean, restore and dispatch
  if (flaggedItems.length === 0) {
    console.log('[Obfusca Files] All files passed, restoring to input...');
    for (const file of files) {
      allowFileTemporarily(file);
    }
    inFlightScanCount = Math.max(0, inFlightScanCount - 1);
    console.log(`[Obfusca Files] In-flight scan complete (clean), count=${inFlightScanCount}`);
    notifyInFlightWaiters();
    restoreFilesAndDispatch(input, files);
    return;
  }

  // Fetch AI dummies for all flagged items in parallel
  await Promise.all(
    flaggedItems.map(async (item) => {
      const meta = flaggedMeta.get(item.id);
      if (!meta) return;
      const hasObfuscation = !!meta.analysis.obfuscation && meta.analysis.obfuscation.mappings.length > 0;
      if (hasObfuscation) {
        await fetchAIDummies(meta.analysis.obfuscation, meta.analysis.extractedText);
        // Update mappings in the flagged item after AI dummies are fetched
        item.mappings = meta.analysis.obfuscation?.mappings || [];
      }
    })
  );

  // Phase 3: Defer flagged files — wait for submit to combine with text results.
  // Decrement in-flight count BEFORE calling deferFlaggedFiles so that
  // waitForPendingFileScans() sees count=0 when it resolves and can immediately
  // consume the entry we're about to store.
  inFlightScanCount = Math.max(0, inFlightScanCount - 1);
  console.log(`[Obfusca Files] In-flight scan complete (flagged), count=${inFlightScanCount}`);

  deferFlaggedFiles({
    flaggedItems,
    flaggedMeta,
    allFiles: files,
    cleanFiles,
    input,
  });

  // Notify any submit handler waiting for this scan to finish
  notifyInFlightWaiters();
}

// ---------------------------------------------------------------------------
// File restoration (clean files → re-dispatch change event)
// ---------------------------------------------------------------------------

/**
 * Detect the current platform from hostname for platform-specific file handling.
 */
function detectPlatform(): string {
  const hostname = window.location.hostname;
  if (hostname.includes('gemini.google.com') || hostname.includes('bard.google.com')) return 'gemini';
  if (hostname.includes('github.com')) return 'github-copilot';
  if (hostname.includes('chat.deepseek.com') || hostname.includes('deepseek.com')) return 'deepseek';
  if (hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com')) return 'chatgpt';
  if (hostname.includes('claude.ai')) return 'claude';
  if (hostname.includes('x.com') || hostname.includes('grok')) return 'grok';
  if (hostname.includes('copilot.microsoft.com')) return 'copilot';
  if (hostname.includes('perplexity.ai')) return 'perplexity';
  return 'unknown';
}

/**
 * Restore files to the input and re-dispatch a change event that our
 * capture listener will skip (via the bypassedEvents WeakSet).
 *
 * Uses platform-specific strategies when the generic approach fails:
 * - GitHub Copilot: targets #image-uploader via page script with React onChange
 * - Gemini: uses saved transient file input captured via createElement interception
 * - Others: generic DataTransfer + change/input events
 */
export function restoreFilesAndDispatch(input: HTMLInputElement, files: File[]): void {
  const platform = detectPlatform();
  console.log(`[Obfusca Files] Restoring ${files.length} file(s), platform=${platform}, inputInDOM=${document.contains(input)}`);

  try {
    // --- Platform-specific fast paths ---

    // Gemini: uses saved transient file input from createElement interception.
    // Page script (loaded during init) captured the file input reference.
    if (platform === 'gemini') {
      console.log('[Obfusca Files] Gemini: Using saved file input approach');
      restoreFileForGemini(files);
      return;
    }

    // GitHub Copilot: has a specific hidden #image-uploader with React fiber
    if (platform === 'github-copilot') {
      const imageUploader = document.getElementById('image-uploader') as HTMLInputElement | null;
      if (imageUploader && document.contains(imageUploader)) {
        console.log('[Obfusca Files] GitHub Copilot: Using #image-uploader with React handler');
        restoreFileForGitHubCopilot(imageUploader, files);
        return;
      }
      // Fallback: try generic input search, then drop
      console.warn('[Obfusca Files] GitHub Copilot: #image-uploader not found, trying fallback');
    }

    // --- Generic restoration logic ---

    // Check if the original input is still in the DOM
    if (document.contains(input)) {
      restoreToInput(input, files);
      return;
    }

    // Input detached — React may have replaced it. Search for a fresh one.
    console.warn('[Obfusca Files] Input no longer in DOM, searching for fresh input');
    const freshInput = findFreshFileInput(input);

    if (freshInput) {
      console.log('[Obfusca Files] Found fresh file input, using it instead');
      restoreToInput(freshInput, files);
      return;
    }

    // No file input found anywhere — fall back to drop event simulation
    console.warn('[Obfusca Files] No file input in DOM — attempting drop event fallback');
    if (restoreFilesViaDrop(files)) return;

    // All strategies failed — show download notification
    showFileRestoreNotification(files[0]?.name || 'file', files[0]);
  } catch (err) {
    console.error('[Obfusca Files] Failed to restore files:', err);
    showFileRestoreNotification(files[0]?.name || 'file', files[0]);
  }
}

/**
 * Find a fresh file input in the DOM when the original is detached.
 */
function findFreshFileInput(originalInput: HTMLInputElement): HTMLInputElement | null {
  const freshInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');

  // Strategy 1: Match by accept attribute (most specific)
  for (const fi of freshInputs) {
    if (document.contains(fi) && (fi.accept === originalInput.accept || !originalInput.accept)) {
      return fi;
    }
  }

  // Strategy 2: Match by id (e.g., #image-uploader)
  if (originalInput.id) {
    const byId = document.getElementById(originalInput.id) as HTMLInputElement | null;
    if (byId && document.contains(byId) && byId.type === 'file') {
      return byId;
    }
  }

  // Strategy 3: Any file input in the DOM
  for (const fi of freshInputs) {
    if (document.contains(fi)) {
      return fi;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Page script injection (for GitHub Copilot React integration)
// ---------------------------------------------------------------------------

let pageScriptInjected = false;

/**
 * Inject the web-accessible page script into the page's JS context.
 * Content scripts run in an isolated world — events they dispatch on DOM
 * elements may not be picked up by React's event delegation. The page script
 * reconstructs the File in the page context and dispatches a native change
 * event that React can see.
 *
 * Uses chrome.runtime.getURL() to load from extension origin, which CSP allows.
 * Returns a promise that resolves when the script's onload fires.
 */
function injectPageScript(): Promise<boolean> {
  if (pageScriptInjected) return Promise.resolve(true);

  return new Promise((resolve) => {
    pageScriptInjected = true;

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('pageScripts/reactFileRestore.js');
    script.onload = () => {
      console.log('[Obfusca Files] Page script loaded from extension');
      resolve(true);
    };
    script.onerror = () => {
      console.error('[Obfusca Files] Failed to load page script');
      pageScriptInjected = false; // Allow retry
      resolve(false);
    };

    document.documentElement.appendChild(script);

    // Timeout fallback
    setTimeout(() => resolve(false), 2000);
  });
}

/**
 * Convert a File to a base64 string for passing via CustomEvent.
 */
function fileToBase64ForPageScript(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result is "data:<type>;base64,<data>" — extract just the base64 part
      const result = reader.result as string;
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Restore a file to GitHub Copilot's React-controlled #image-uploader.
 *
 * Content scripts run in an isolated JS world — they share the DOM but NOT
 * JavaScript objects with the page. The page script (reactFileRestore.js)
 * runs in the page's context where it can access React's internal props
 * (__reactProps$) on DOM elements.
 *
 * Approach: Set files on the input via DataTransfer, then call React's
 * onChange handler directly with { target: fileInput, currentTarget: fileInput }.
 * The handler reads e.target.files from the real DOM element, which has our
 * DataTransfer files, triggering React's state update and UI rendering.
 *
 * Native event dispatch does NOT work because React 17+ ignores
 * programmatically dispatched events that don't go through its synthetic
 * event pipeline.
 *
 * Flow:
 * 1. Content script converts file to base64
 * 2. Content script injects page script (if not already loaded)
 * 3. Content script dispatches 'obfusca-restore-file' on window with file data
 * 4. Page script reconstructs File, sets on input via DataTransfer
 * 5. Page script finds __reactProps$.onChange and calls it directly
 * 6. Page script dispatches 'obfusca-restore-result' back
 */
async function restoreFileForGitHubCopilot(fileInput: HTMLInputElement, files: File[]): Promise<void> {
  const file = files[0]; // GitHub Copilot supports single file upload
  if (!file) return;

  // 1. Inject page script if not already done
  const loaded = await injectPageScript();

  if (!loaded) {
    // Fallback: set files directly and dispatch native events
    console.warn('[Obfusca Files] GitHub Copilot: Page script failed, using native event fallback');
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    const changeEvent = new Event('change', { bubbles: true, cancelable: true });
    bypassedEvents.add(changeEvent);
    fileInput.dispatchEvent(changeEvent);
    return;
  }

  // 2. Convert file to base64 for cross-world transfer
  let fileData: string;
  try {
    fileData = await fileToBase64ForPageScript(file);
  } catch {
    console.error('[Obfusca Files] GitHub Copilot: Failed to convert file to base64');
    showFileRestoreNotification(file.name, file);
    return;
  }

  // 3. Set bypass BEFORE triggering restore so our own listener doesn't block it
  setBypassFileInterception(true);

  // Safety timeout to clear bypass if result never comes back
  const bypassTimeout = setTimeout(() => {
    setBypassFileInterception(false);
    console.log('[Obfusca Files] GitHub Copilot: Bypass flag cleared (timeout safety)');
  }, 3000);

  // 4. Listen for result from page script
  const resultPromise = new Promise<void>((resolve) => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      window.removeEventListener('obfusca-restore-result', handler);

      // Clear bypass now that restore is complete
      clearTimeout(bypassTimeout);
      setBypassFileInterception(false);

      if (detail?.success) {
        console.log('[Obfusca Files] GitHub Copilot: File restored via page script');
      } else {
        console.warn(`[Obfusca Files] GitHub Copilot: Page script failed: ${detail?.error}`);
        showFileRestoreNotification(file.name, file);
      }
      resolve();
    };
    window.addEventListener('obfusca-restore-result', handler);

    // Timeout
    setTimeout(() => {
      window.removeEventListener('obfusca-restore-result', handler);
      clearTimeout(bypassTimeout);
      setBypassFileInterception(false);
      console.warn('[Obfusca Files] GitHub Copilot: Timeout waiting for page script');
      resolve();
    }, 3000);
  });

  // 5. Dispatch file data to the page script
  window.dispatchEvent(new CustomEvent('obfusca-restore-file', {
    detail: {
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
      fileData,
    },
  }));

  await resultPromise;
}

/**
 * Restore a file to Gemini's Angular-controlled file upload.
 *
 * Gemini creates a transient file input on-demand when the upload button is
 * clicked (via Angular's xapfileselectortrigger). The input is never in the
 * DOM permanently — it's created via createElement, .click() opens the picker.
 *
 * Approach: The page script (geminiFileRestore.js) intercepts
 * document.createElement to capture file input references as they're created.
 * When we need to restore, we dispatch an event to the page script which
 * reuses the saved input reference, injects the file via DataTransfer, and
 * dispatches a change event that Angular picks up.
 *
 * The page script is injected early during setupUniversalFileInterception()
 * so it captures createElement BEFORE the user's first file upload.
 *
 * Flow:
 * 1. Content script converts file to base64
 * 2. Content script dispatches 'obfusca-gemini-restore-file' (script already loaded)
 * 3. Page script injects file into saved input via DataTransfer
 * 4. Page script dispatches change event on the input
 * 5. Page script dispatches 'obfusca-gemini-restore-result' back
 */
async function restoreFileForGemini(files: File[]): Promise<void> {
  const file = files[0]; // Gemini processes one file at a time
  if (!file) return;

  // 1. Convert file to base64 for cross-world transfer
  let fileData: string;
  try {
    fileData = await fileToBase64ForPageScript(file);
  } catch {
    console.error('[Obfusca Files] Gemini: Failed to convert file to base64');
    showFileRestoreNotification(file.name, file);
    return;
  }

  // 2. Set bypass so our own change listener doesn't re-intercept
  setBypassFileInterception(true);

  const bypassTimeout = setTimeout(() => {
    setBypassFileInterception(false);
    console.log('[Obfusca Files] Gemini: Bypass flag cleared (timeout safety)');
  }, 5000);

  // 3. Listen for result from page script
  const resultPromise = new Promise<void>((resolve) => {
    let settled = false;
    let innerTimeout: ReturnType<typeof setTimeout>;

    const handler = (event: Event) => {
      if (settled) return;
      settled = true;
      const detail = (event as CustomEvent).detail;
      window.removeEventListener('obfusca-gemini-restore-result', handler);

      clearTimeout(bypassTimeout);
      clearTimeout(innerTimeout);
      setBypassFileInterception(false);

      if (detail?.success) {
        console.log('[Obfusca Files] Gemini: File restored via page script');
      } else {
        console.warn(`[Obfusca Files] Gemini: Page script failed: ${detail?.error}`);
        showFileRestoreNotification(file.name, file);
      }
      resolve();
    };
    window.addEventListener('obfusca-gemini-restore-result', handler);

    // Timeout
    innerTimeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener('obfusca-gemini-restore-result', handler);
      clearTimeout(bypassTimeout);
      setBypassFileInterception(false);
      console.warn('[Obfusca Files] Gemini: Timeout waiting for page script');
      showFileRestoreNotification(file.name, file);
      resolve();
    }, 5000);
  });

  // 4. Dispatch file data to the page script (already loaded during init)
  window.dispatchEvent(new CustomEvent('obfusca-gemini-restore-file', {
    detail: {
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
      fileData,
    },
  }));

  await resultPromise;
}

/**
 * Fallback notification: when programmatic file restoration fails,
 * show a toast with a download link so the user can manually re-attach.
 */
function showFileRestoreNotification(filename: string, file?: File): void {
  if (!file) {
    showToast('File is clean — please re-select to upload', 'success');
    return;
  }

  const blobUrl = URL.createObjectURL(file);
  // Remove any existing notification
  document.getElementById('obfusca-file-restore-toast')?.remove();

  const toast = document.createElement('div');
  toast.id = 'obfusca-file-restore-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    z-index: 2147483647;
    font-family: ${OBFUSCA_STYLES.fonts.sans};
    animation: obfusca-toast-fade-in 0.3s ease-out;
    max-width: 340px;
  `;
  toast.innerHTML = `
    <div style="
      background: ${OBFUSCA_STYLES.colors.card};
      border: 1px solid ${OBFUSCA_STYLES.colors.border};
      border-left: 3px solid ${OBFUSCA_STYLES.colors.success};
      border-radius: ${OBFUSCA_STYLES.radius.lg};
      padding: 14px 16px;
      font-size: 13px;
      color: ${OBFUSCA_STYLES.colors.foreground};
      box-shadow: ${OBFUSCA_STYLES.shadows.lg};
      line-height: 1.5;
    ">
      <div style="font-weight: 600; margin-bottom: 6px;">File Protected</div>
      <div style="margin-bottom: 8px;">
        <strong>${filename}</strong> is clean. Re-attach it manually:
      </div>
      <a href="${blobUrl}" download="${filename}" style="
        color: #60a5fa;
        text-decoration: none;
        font-weight: 500;
      ">Download file</a>
    </div>
  `;
  document.body.appendChild(toast);

  // Auto-dismiss after 10s
  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => {
        toast.remove();
        URL.revokeObjectURL(blobUrl);
      }, 300);
    }
  }, 10000);
}

/**
 * Set files on a file input and dispatch events to notify the framework.
 */
function restoreToInput(input: HTMLInputElement, files: File[]): void {
  const dt = new DataTransfer();
  for (const file of files) {
    dt.items.add(file);
  }
  input.files = dt.files;

  console.log(`[Obfusca Files] Set ${files.length} file(s) on input, dispatching events...`);

  // Dispatch 'change' event (used by ChatGPT, Grok, Microsoft Copilot)
  const changeEvent = new Event('change', { bubbles: true, cancelable: true });
  bypassedEvents.add(changeEvent);
  input.dispatchEvent(changeEvent);

  // Dispatch 'input' event (used by Deepseek, Gemini, GitHub Copilot)
  const inputEvent = new Event('input', { bubbles: true, cancelable: true });
  bypassedEvents.add(inputEvent);
  input.dispatchEvent(inputEvent);

  // Also dispatch on the input's parent/form for frameworks that listen higher up
  const form = input.closest('form');
  if (form) {
    const formChangeEvent = new Event('change', { bubbles: true, cancelable: true });
    bypassedEvents.add(formChangeEvent);
    form.dispatchEvent(formChangeEvent);
  }

  console.log('[Obfusca Files] Files restored and events dispatched (change + input)');
}

/**
 * Simulate a drop event on a target element.
 * Dispatches the full dragenter → dragover → drop sequence.
 * Our drop capture listener skips these via bypassedEvents.
 *
 * @param files - Files to include in the drop
 * @param targetSelectors - Optional ordered list of CSS selectors to try
 */
function restoreFilesViaDrop(files: File[], targetSelectors?: string[]): boolean {
  const selectors = targetSelectors || [
    'main',
    '[class*="chat" i]',
    '[class*="conversation" i]',
    '[class*="composer" i]',
    '[class*="input" i]',
    'form',
  ];

  let dropTarget: HTMLElement | null = null;
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el instanceof HTMLElement && document.contains(el)) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 100) {
        dropTarget = el;
        break;
      }
    }
  }

  if (!dropTarget) {
    console.warn('[Obfusca Files] No suitable drop target found');
    return false;
  }

  try {
    const dt = new DataTransfer();
    for (const file of files) {
      dt.items.add(file);
    }

    console.log(`[Obfusca Files] Simulating drop on ${dropTarget.tagName}.${(dropTarget.className || '').substring(0, 30)}`);

    // Full drag event sequence — some frameworks require all three
    const dragEnter = new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt });
    bypassedEvents.add(dragEnter);
    dropTarget.dispatchEvent(dragEnter);

    const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
    bypassedEvents.add(dragOver);
    dropTarget.dispatchEvent(dragOver);

    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
    bypassedEvents.add(drop);
    dropTarget.dispatchEvent(drop);

    console.log('[Obfusca Files] Drop event sequence dispatched');
    return true;
  } catch (err) {
    console.error('[Obfusca Files] Drop simulation failed:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Multi-item popup helpers
// ---------------------------------------------------------------------------

/**
 * Build the final file list after multi-item popup review.
 *
 * - Protected items: the original file is replaced with the protected version
 *   (stored in flaggedMeta after onProtectItem ran).
 * - Bypassed items: the original file is kept as-is.
 * - Skipped items: the file is removed from the list.
 * - Clean files (not flagged) are always included.
 */
export function buildFinalFileList(
  originalFiles: File[],
  reviewedItems: FlaggedItem[],
  flaggedMeta: Map<string, { file: File; fileBase64: string; analysis: FileAnalysisResult }>
): File[] {
  // Build a set of original file keys that were flagged, so we can identify them
  const flaggedOriginalKeys = new Set<string>();
  const itemByOriginalKey = new Map<string, FlaggedItem>();

  for (const item of reviewedItems) {
    if (item.file) {
      flaggedOriginalKeys.add(getFileKey(item.file));
      itemByOriginalKey.set(getFileKey(item.file), item);
    }
  }

  const result: File[] = [];

  for (const file of originalFiles) {
    const key = getFileKey(file);
    const reviewedItem = itemByOriginalKey.get(key);

    if (!reviewedItem) {
      // Not flagged — clean file, include as-is
      result.push(file);
      continue;
    }

    switch (reviewedItem.status) {
      case 'protected': {
        // Use the protected file from flaggedMeta (updated by onProtectItem)
        const meta = flaggedMeta.get(reviewedItem.id);
        if (meta) {
          result.push(meta.file);
        }
        break;
      }
      case 'skipped':
        // File removed — do not include
        console.log(`[Obfusca Files] Removing skipped file: ${file.name}`);
        break;
      default:
        // 'pending' treated as bypassed — include original
        result.push(file);
        break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// AI dummy generation for file mappings
// ---------------------------------------------------------------------------

/**
 * Fetch AI-generated contextual dummies for file obfuscation mappings.
 * Updates mappings in-place with AI dummies where available.
 */
async function fetchAIDummies(
  obfuscation: ObfuscationData | undefined,
  extractedText: string | null | undefined
): Promise<void> {
  if (!obfuscation || obfuscation.mappings.length === 0) return;

  // Check if any mappings need AI dummies (missing or same as mask)
  const needsDummies = obfuscation.mappings.some(
    m => !m.dummy_value || m.dummy_value === m.masked_value
  );
  if (!needsDummies) return;

  const contextText = extractedText || '';
  if (!contextText) {
    console.log('[Obfusca Files] No extracted text available for AI dummies');
    return;
  }

  console.log('[Obfusca Files] Fetching AI-generated dummies for', obfuscation.mappings.length, 'mappings...');

  try {
    const detections = obfuscation.mappings.map((m, i) => ({
      index: i,
      type: m.type,
      original_value: m.original_preview, // Use preview (backend has the real values)
      display_name: m.display_name || undefined,
    }));

    const batchResponse = await generateDummiesBatch(contextText, detections);

    if (batchResponse && batchResponse.success && batchResponse.dummies) {
      console.log('[Obfusca Files] AI dummies received:', batchResponse.dummies.length, 'source:', batchResponse.source);

      for (const item of batchResponse.dummies) {
        if (item.index >= 0 && item.index < obfuscation.mappings.length && item.dummy_value) {
          obfuscation.mappings[item.index].dummy_value = item.dummy_value;
        }
      }
    } else {
      console.warn('[Obfusca Files] AI dummy batch returned no results, using fallbacks');
    }
  } catch (error) {
    console.warn('[Obfusca Files] AI dummy generation failed, using fallbacks:', error);
  }
}

// ---------------------------------------------------------------------------
// Download protected helper
// ---------------------------------------------------------------------------

function triggerFileDownload(filename: string, base64Content: string): void {
  const binary = atob(base64Content);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function handleDownloadProtected(
  filename: string,
  fileBase64: string,
  choices: Array<{ original_value: string; replacement: string }>
): Promise<void> {
  const result = await protectFile(
    filename,
    fileBase64,
    choices as ProtectionChoice[]
  );
  if (result) {
    triggerFileDownload(result.filename, result.content_base64);
    showToast(
      `Downloaded ${result.filename} (${result.replacements_applied} item${result.replacements_applied !== 1 ? 's' : ''} redacted)`,
      'success'
    );
  } else {
    showToast('File protection failed — try again', 'error');
    throw new Error('File protection returned null');
  }
}

// ---------------------------------------------------------------------------
// Drag-and-drop interception
// ---------------------------------------------------------------------------

/**
 * Document-level capture listener for drag-and-drop file events.
 * Catches files dropped anywhere on the page.
 */
function onDocumentDropCapture(event: DragEvent): void {
  // Skip events we dispatched ourselves during file restoration
  if (bypassedEvents.has(event)) return;

  // Skip when bypass is active (file being restored via drag-and-drop by page script)
  if (bypassFileInterception) {
    console.log('[Obfusca Files] Drop bypassed (file restore in progress)');
    return;
  }

  // Skip when the user confirmed "send unprotected" — bypass means no scanning
  if (isBypassActive()) {
    console.log('[Obfusca Files] Drop bypass active — letting files through without scanning');
    return;
  }

  const dataTransfer = event.dataTransfer;
  if (!dataTransfer || !dataTransfer.files || dataTransfer.files.length === 0) return;

  const fileArray = Array.from(dataTransfer.files);

  // Skip files that are already allowed (protected/clean files being re-uploaded)
  // Use non-consuming peek — the change handler will consume the allowance later
  const allAllowed = fileArray.every(f => isFileAllowedPeek(f));
  if (allAllowed) {
    console.log('[Obfusca Files] DROP: All files already allowed, skipping scan');
    return;
  }

  // Only intercept if there are scannable files
  if (!fileArray.some(f => shouldScanFile(f))) return;

  console.log(
    `[Obfusca Files] Captured file drop: ${fileArray.length} file(s)`,
    fileArray.map(f => ({ name: f.name, size: f.size, type: f.type }))
  );

  // We can't fully block a drop event and re-dispatch it (unlike change events),
  // so we scan async and show popup if sensitive data found.
  // The file will be uploaded by the platform, but the popup warns the user.
  processDroppedFiles(fileArray);
}

/**
 * Scan dropped files. Shows popup if sensitive data found.
 */
async function processDroppedFiles(files: File[]): Promise<void> {
  // Phase 1: Scan ALL dropped files, collect flagged items
  const flaggedItems: FlaggedItem[] = [];
  const flaggedDropMeta = new Map<string, { file: File; fileBase64: string; analysis: FileAnalysisResult }>();

  for (const file of files) {
    if (!shouldScanFile(file)) continue;

    console.log(`[Obfusca Files] Scanning dropped: ${file.name}`);

    try {
      const fileBase64 = await fileToBase64(file);
      const result = await scanFile(file);

      if (!result) continue;

      if ('error' in result) {
        console.log(`[Obfusca Files] Drop scan error for ${file.name}: ${(result as FileScanError).message}`);
        continue;
      }

      const analysis = result as FileAnalysisResult;

      if (analysis.typeMismatch) {
        console.warn(`[Obfusca Files] DROP TYPE MISMATCH: ${file.name} — ${analysis.typeMismatchWarning}`);
      }

      if (analysis.action === 'block' || analysis.action === 'redact') {
        console.log(
          `[Obfusca Files] DROPPED SENSITIVE: ${file.name}, action=${analysis.action}, detections=${analysis.detections.length}`
        );

        const itemId = `drop-${file.name}-${Date.now()}-${flaggedItems.length}`;
        const dropExtractedText = analysis.extractedText || '';
        if (analysis.extractedLength && dropExtractedText.length < analysis.extractedLength) {
          console.warn(
            `[Obfusca Files] WARNING: extracted_text truncated for dropped ${file.name}: ` +
            `received ${dropExtractedText.length} chars but extractedLength=${analysis.extractedLength}. ` +
            `Detections at positions beyond ${dropExtractedText.length} will fail.`
          );
        }
        flaggedItems.push({
          id: itemId,
          type: 'file',
          name: file.name,
          status: 'pending',
          content: dropExtractedText,
          response: analysis,
          mappings: analysis.obfuscation?.mappings || [],
          file: file,
          fileBase64: fileBase64,
        });
        flaggedDropMeta.set(itemId, { file, fileBase64, analysis });
      } else {
        if (analysis.typeMismatch && analysis.typeMismatchWarning) {
          showToast(analysis.typeMismatchWarning, 'info');
        }
        console.log(`[Obfusca Files] Dropped clean: ${file.name}`);
      }
    } catch (err) {
      console.error(`[Obfusca Files] Error scanning dropped ${file.name}:`, err);
    }
  }

  // Phase 2: No flagged items — all clean
  if (flaggedItems.length === 0) {
    return;
  }

  // Fetch AI dummies for all flagged items in parallel
  await Promise.all(
    flaggedItems.map(async (item) => {
      const meta = flaggedDropMeta.get(item.id);
      if (!meta) return;
      const hasObfuscation = !!meta.analysis.obfuscation && meta.analysis.obfuscation.mappings.length > 0;
      if (hasObfuscation) {
        await fetchAIDummies(meta.analysis.obfuscation, meta.analysis.extractedText);
        item.mappings = meta.analysis.obfuscation?.mappings || [];
      }
    })
  );

  // Phase 3: Show popup
  if (flaggedItems.length === 1) {
    // Single flagged file — use existing showDroppedFilePopup for backwards compatibility
    const item = flaggedItems[0];
    const meta = flaggedDropMeta.get(item.id)!;
    showDroppedFilePopup(meta.file, meta.fileBase64, meta.analysis);
  } else {
    // Multiple flagged files — use multi-item popup
    console.log(`[Obfusca Files] Showing multi-item popup for ${flaggedItems.length} flagged dropped files`);
    showMultiItemPopup(flaggedItems, {
      onProtectItem: async (item: FlaggedItem) => {
        const meta = flaggedDropMeta.get(item.id);
        if (!meta) {
          console.error(`[Obfusca Files] No metadata for dropped item: ${item.id}`);
          return;
        }
        console.log(`[Obfusca Files] Protecting dropped: ${item.name}`);
        // Use mode-aware replacements computed by the popup if available
        let choices: ProtectionChoice[];
        if (item.protectedReplacements) {
          choices = item.protectedReplacements;
        } else {
          const extractedText = item.content || '';
          choices = item.mappings
            .map(m => {
              const origVal = resolveOriginalValue(m, extractedText);
              if (!origVal) return null;
              return {
                original_value: origVal,
                replacement: m.dummy_value || m.masked_value || `[${m.type.toUpperCase()}_REDACTED]`,
              };
            })
            .filter((c): c is ProtectionChoice => c !== null);
        }
        await handleDownloadProtected(meta.file.name, meta.fileBase64, choices);
      },
      onSkipItem: (item: FlaggedItem) => {
        console.log(`[Obfusca Files] Skipping dropped: ${item.name}`);
      },
      onBypassItem: (item: FlaggedItem) => {
        console.log(`[Obfusca Files] Bypassing dropped (allow original): ${item.name}`);
        if (item.file) allowFileTemporarily(item.file);
      },
      onAllComplete: (items: FlaggedItem[]) => {
        console.log(`[Obfusca Files] All dropped items reviewed`);
        const hasProtected = items.some(i => i.status === 'protected');
        if (hasProtected) {
          showToast('Protected files downloaded — please re-upload them manually', 'info');
        }
      },
      onClose: () => {
        console.log('[Obfusca Files] Multi-item drop popup closed');
        showToast('Please remove the dropped files manually from the chat', 'info');
      },
    });
  }
}

/**
 * Show popup for a dropped file with sensitive data.
 */
async function showDroppedFilePopup(
  file: File,
  fileBase64: string,
  analysis: FileAnalysisResult
): Promise<void> {
  const detectionMap = new Map<string, { type: string; displayName: string; count: number }>();
  for (const d of analysis.detections) {
    const existing = detectionMap.get(d.type);
    if (existing) existing.count++;
    else detectionMap.set(d.type, { type: d.type, displayName: d.type, count: 1 });
  }

  const hasObfuscation = !!analysis.obfuscation && analysis.obfuscation.mappings.length > 0;

  // Fetch AI-generated dummies for better replacements
  if (hasObfuscation) {
    await fetchAIDummies(analysis.obfuscation, analysis.extractedText);
  }

  showDetectionPopup({
    action: analysis.action === 'block' ? 'block' : 'warn',
    detections: [],
    obfuscation: analysis.obfuscation ?? undefined,
    fileDetections: [{
      fileName: file.name,
      detections: Array.from(detectionMap.values()),
      isClean: false,
    }],
    fileProtectionMode: hasObfuscation,
    fileName: file.name,
    fileBase64,
    extractedText: analysis.extractedText ?? undefined,
    onEdit: () => {
      console.log(`[Obfusca Files] Drop edit dismissed: ${file.name}`);
    },
    onSendOriginal: () => {
      console.log(`[Obfusca Files] User allows dropped file: ${file.name}`);
      allowFileTemporarily(file);
    },
    onRemoveFiles: () => {
      console.log(`[Obfusca Files] User wants to remove dropped file: ${file.name}`);
      showToast('Please remove the file manually from the chat', 'info');
    },
    onDownloadProtected: async (choices) => {
      console.log(`[Obfusca Files] Downloading protected dropped: ${file.name}`);
      await handleDownloadProtected(file.name, fileBase64, choices);
    },
    onDismiss: () => {
      console.log(`[Obfusca Files] Drop popup dismissed: ${file.name}`);
    },
    anchorElement: document.body,
  });
}

// ---------------------------------------------------------------------------
// Setup / Cleanup
// ---------------------------------------------------------------------------

/**
 * Set up universal file interception.
 * Attaches document-level capture listeners for file input changes AND drag-and-drop.
 */
export function setupUniversalFileInterception(): void {
  console.log('[Obfusca Files] Setting up universal file interception (document capture)...');

  // Clean up any previous setup
  cleanupFileInterception();

  // Capture listener for file input change events
  document.addEventListener('change', onDocumentFileCapture, { capture: true });
  captureListenerAttached = true;

  // Capture listener for drag-and-drop file events
  document.addEventListener('drop', onDocumentDropCapture, { capture: true });
  dropListenerAttached = true;

  // Gemini: inject page script early so it can intercept createElement
  // and capture transient file input references BEFORE the user's first upload.
  const platform = detectPlatform();
  if (platform === 'gemini') {
    const scriptId = 'obfusca-gemini-file-restore';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = chrome.runtime.getURL('pageScripts/geminiFileRestore.js');
      (document.head || document.documentElement).appendChild(script);
      console.log('[Obfusca Files] Gemini: Injected page script for createElement capture');
    }
  }

  console.log('[Obfusca Files] Document-level capture listeners attached (change + drop)');
}

/**
 * Clean up file interception.
 */
export function cleanupFileInterception(): void {
  if (captureListenerAttached) {
    document.removeEventListener('change', onDocumentFileCapture, { capture: true });
    captureListenerAttached = false;
  }
  if (dropListenerAttached) {
    document.removeEventListener('drop', onDocumentDropCapture, { capture: true });
    dropListenerAttached = false;
  }
  pendingAllowedFiles.clear();
  // Clear any deferred flagged files
  pendingFlaggedFiles = null;
  console.log('[Obfusca Files] File interception listeners removed');
}

/**
 * Reset allowed files list (e.g., on URL change).
 */
export function resetAllowedFiles(): void {
  pendingAllowedFiles.clear();
  // Clear any deferred flagged files
  pendingFlaggedFiles = null;
  console.log('[Obfusca Files] File allowances cleared');
}

/**
 * Clean up file interception state after a submission completes.
 * Clears deferred flagged files and pending allowances so the next submission
 * starts fresh. Does NOT remove event listeners or reset listener-attached flags.
 */
export function cleanupFileState(): void {
  pendingFlaggedFiles = null;
  // Don't clear pendingAllowedFiles — they self-expire via setTimeout
  console.log('[Obfusca Files] File state cleaned up after submission');
}
