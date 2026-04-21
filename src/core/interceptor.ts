/**
 * Core interception logic for Obfusca.
 * Shared across all site adapters - handles event interception, detection, and overlay display.
 */

import type { SiteConfig, SiteState } from '../sites/types';
import {
  detectSensitiveData,
  mightContainSensitiveDataSync,
} from '../detection';
import { analyze } from '../api';
import {
  removeBlockOverlay,
  isBlockOverlayVisible,
  removeRedactOverlay,
  isRedactOverlayVisible,
  removeDetectionPopup,
  isDetectionPopupVisible,
  showMultiItemPopup,
  isMultiItemPopupVisible,
  type FlaggedItem,
  type MappingItem,
} from '../ui';
import { protectFile, type ProtectionChoice } from '../api';
import {
  showAnalysisIndicator,
  removeAnalysisIndicator,
  updateAnalysisIndicatorText,
  showIndicatorSuccess,
} from '../ui/detectionPopup';
import {
  consumePendingFlaggedFiles,
  hasInFlightFileScans,
  hasPendingFlaggedFiles,
  waitForPendingFileScans,
  allowFileTemporarily,
  restoreFilesAndDispatch,
  buildFinalFileList,
  type PendingFlaggedFileEntry,
} from './fileInterception';

/**
 * Resolve the original sensitive value from a mapping item.
 * Uses start/end positions to extract from the source text, with proper
 * bounds checking. Returns null if the value cannot be resolved.
 */
function resolveOriginalValue(mapping: MappingItem, extractedText?: string | null): string | null {
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

// Simple toast function for general notifications
function showToast(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
  // Use monitor toast style for brief notifications
  const toast = document.createElement('div');
  toast.id = 'obfusca-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    animation: obfusca-toast-fade-in 0.3s ease-out;
  `;

  const colors: Record<string, string> = {
    info: '#2563eb',
    success: '#44FF44',
    error: '#FF4444',
  };

  toast.innerHTML = `
    <style>
      @keyframes obfusca-toast-fade-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    </style>
    <div style="
      background: #0A0A0A;
      border: 1px solid #222222;
      border-left: 3px solid ${colors[type]};
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 13px;
      color: #FFFFFF;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
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
import { hideFileOverlay } from '../ui/fileOverlay';

// ---------------------------------------------------------------------------
// File scan pending indicator
// ---------------------------------------------------------------------------

const FILE_SCAN_INDICATOR_ID = 'obfusca-file-scan-indicator';

/**
 * Show a small non-blocking toast indicating that a file scan is still in
 * progress and the submit is being held until it completes.
 */
function showFileScanPendingIndicator(): void {
  document.getElementById(FILE_SCAN_INDICATOR_ID)?.remove();

  const el = document.createElement('div');
  el.id = FILE_SCAN_INDICATOR_ID;
  el.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  `;
  el.innerHTML = `
    <div style="
      background: #0A0A0A;
      border: 1px solid #222222;
      border-left: 3px solid #2563eb;
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 13px;
      color: #FFFFFF;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      gap: 8px;
    ">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;animation:obfusca-spin 1s linear infinite;">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      <style>@keyframes obfusca-spin{to{transform:rotate(360deg)}}</style>
      Scanning attached files...
    </div>
  `;
  document.body.appendChild(el);
}

/**
 * Remove the file scan pending indicator.
 */
function hideFileScanPendingIndicator(): void {
  document.getElementById(FILE_SCAN_INDICATOR_ID)?.remove();
}
import { createDOMObserver, watchURLChanges, type ObserverHandle } from './observer';
import { resetAllowedFiles, cleanupFileState } from './fileInterception';

// ---------------------------------------------------------------------------
// Module-level bypass flag
// ---------------------------------------------------------------------------
// When set, the NEXT submit attempt skips ALL scanning and hash checks.
// Used by the "Send Anyway" -> "Yes, send unprotected" bypass confirmation
// to prevent the re-triggered submit from being intercepted again (infinite loop).
//
// Separate from `allowNextSubmit` (which verifies a content hash) because
// bypass sends the ORIGINAL unprotected text which was never "approved" --
// it was explicitly bypassed by the user.
// ---------------------------------------------------------------------------

let bypassNextSubmit = false;
let bypassTimeoutId: ReturnType<typeof setTimeout> | null = null;

/**
 * Set the bypass flag so the next submit skips all scanning.
 * Automatically clears after 5 seconds if no submit fires (safety timeout).
 * One-time use: cleared immediately when consumed by shouldBlockEventSync.
 */
export function setBypassFlag(): void {
  bypassNextSubmit = true;

  // Clear any existing timeout
  if (bypassTimeoutId) {
    clearTimeout(bypassTimeoutId);
  }

  // Safety timeout: auto-clear after 5s if submit doesn't fire
  bypassTimeoutId = setTimeout(() => {
    if (bypassNextSubmit) {
      console.log('[Obfusca] Safety: auto-clearing bypassNextSubmit after 5s timeout');
      bypassNextSubmit = false;
    }
    bypassTimeoutId = null;
  }, 5_000);

  console.log('[Obfusca] Bypass flag SET — next submit will skip all scanning');

  // Notify the MAIN world (network-interceptor.ts on Claude.ai) via postMessage
  // so that the fetch interceptor also skips scanning on the next request.
  window.postMessage(
    { source: 'obfusca-content', type: 'bypass-next-submit', data: {} },
    '*',
  );
}

/**
 * Check and consume the bypass flag.
 * Returns true if bypass was active (and clears it).
 */
function consumeBypassFlag(): boolean {
  if (!bypassNextSubmit) return false;

  bypassNextSubmit = false;
  if (bypassTimeoutId) {
    clearTimeout(bypassTimeoutId);
    bypassTimeoutId = null;
  }
  console.log('[Obfusca] Bypass flag CONSUMED — this submit skips all scanning');
  return true;
}

/**
 * Peek at the bypass flag without consuming it.
 * Used by handlers that need to check but not consume (e.g., multiple events
 * in a submission chain where only the first should consume, or file
 * interception checking whether to let files through).
 */
export function isBypassActive(): boolean {
  return bypassNextSubmit;
}

// ---------------------------------------------------------------------------
// Unified popup: combine text + file flagged items into one multi-item popup
// ---------------------------------------------------------------------------

/**
 * Text analysis result shape — matches the return of analyze().
 */
interface TextAnalysisResult {
  shouldBlock: boolean;
  action: 'allow' | 'block' | 'redact';
  detections: Array<{
    type: string;
    displayName: string;
    severity: string;
    start: number;
    end: number;
    confidence: number;
  }>;
  source: string;
  obfuscation?: {
    obfuscated_text: string;
    mappings: MappingItem[];
  };
  message?: string;
  simulated?: boolean;
  wouldHaveBlocked?: boolean;
  originalAction?: string;
}

/**
 * Build a FlaggedItem for chat text from a text analysis result.
 */
function buildChatFlaggedItem(
  text: string,
  result: TextAnalysisResult,
): FlaggedItem {
  return {
    id: `chat-${Date.now()}`,
    type: 'chat',
    name: 'Chat Message',
    status: 'pending',
    content: text,
    response: result,
    mappings: result.obfuscation?.mappings || [],
  };
}

/**
 * Show a unified multi-item popup that combines text and file flagged items.
 *
 * @param chatItem - The flagged chat text item (null if text was clean).
 * @param fileEntry - The pending flagged file entry (null if no files flagged).
 * @param callbacks - Functions to call when the user makes a decision.
 */
function showUnifiedPopup(
  chatItem: FlaggedItem | null,
  fileEntry: PendingFlaggedFileEntry | null,
  callbacks: {
    /** Called when user clicks Edit / wants to go back and fix text */
    onEditText: () => void;
    /** Called when user wants to send original text (warn mode) */
    onSendOriginalText: (text: string) => void;
    /** Called when user wants to send obfuscated text (warn/block mode) */
    onSendProtectedText: (obfuscatedText: string) => void;
    /** Called when user dismisses without sending */
    onDismiss: () => void;
    /** Optional: Set textarea content WITHOUT triggering submit.
     *  Used by GitHub Copilot to set text before file restore. */
    onSetContentOnly?: (text: string) => void;
    /** Optional: Trigger submit only (text already set, files already restored).
     *  Used by GitHub Copilot after the text→file sequence completes. */
    onSubmitOnly?: () => void;
    /** Optional: Called when file restore starts (before the wait window).
     *  Used to set a flag preventing stray submit events from triggering analysis. */
    onFileRestoreStart?: () => void;
    /** Optional: Called when file restore wait ends (just before sendChat).
     *  Used to clear the file-restore-in-progress flag. */
    onFileRestoreEnd?: () => void;
  },
  anchorElement?: HTMLElement,
): void {
  const allItems: FlaggedItem[] = [];
  if (chatItem) allItems.push(chatItem);
  if (fileEntry) allItems.push(...fileEntry.flaggedItems);

  if (allItems.length === 0) {
    console.warn('[Obfusca Unified] showUnifiedPopup called with no items');
    return;
  }

  console.log(`[Obfusca Unified] Showing multi-item popup: ${allItems.length} items ` +
    `(${chatItem ? 1 : 0} chat, ${fileEntry?.flaggedItems.length || 0} files)`);

  try {
  showMultiItemPopup(allItems, {
    onProtectItem: async (item: FlaggedItem) => {
      if (item.type === 'chat') {
        // Chat protection is handled entirely by the popup: it computes
        // protectedContent using the user's mode selection. Nothing to do here.
        console.log('[Obfusca Unified] Chat item protected (protectedContent set by popup)');
        return;
      }
      // File protection
      if (!fileEntry) return;
      const meta = fileEntry.flaggedMeta.get(item.id);
      if (!meta) {
        console.error(`[Obfusca Unified] No metadata for file item: ${item.id}`);
        return;
      }
      console.log(`[Obfusca Unified] Protecting file: ${item.name}`);
      // Use mode-aware replacements computed by the popup if available,
      // otherwise fall back to computing from mappings.
      let choices: ProtectionChoice[];
      if (item.protectedReplacements) {
        choices = item.protectedReplacements;
        console.log(`[Obfusca Unified] Using popup-computed replacements (${choices.length} items)`);
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
      const result = await protectFile(meta.file.name, meta.fileBase64, choices);
      if (result) {
        const binary = atob(result.content_base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const protectedFile = new File([bytes], meta.file.name, {
          type: meta.file.type || 'application/octet-stream',
        });
        meta.file = protectedFile;
        meta.fileBase64 = result.content_base64;
        showToast(
          `${item.name}: ${result.replacements_applied} item${result.replacements_applied !== 1 ? 's' : ''} redacted`,
          'success',
        );
      } else {
        showToast(`Failed to protect ${item.name}`, 'error');
        throw new Error('File protection returned null');
      }
    },
    onSkipItem: (item: FlaggedItem) => {
      console.log(`[Obfusca Unified] Skipping: ${item.name}`);
    },
    onBypassItem: (item: FlaggedItem) => {
      if (item.type === 'chat') {
        console.log('[Obfusca Unified] Bypassing chat (send original)');
        return;
      }
      console.log(`[Obfusca Unified] Bypassing file (allow original): ${item.name}`);
      if (item.file) allowFileTemporarily(item.file);
    },
    onAllComplete: (items: FlaggedItem[]) => {
      console.log('[Obfusca Unified] All items reviewed');

      const chatResult = items.find(i => i.type === 'chat');
      const isGitHubCopilot = window.location.hostname.includes('github.com');

      // --- Build final file list ---
      let finalFiles: File[] | null = null;
      if (fileEntry) {
        const fileItems = items.filter(i => i.type === 'file');
        if (fileItems.length > 0) {
          const built = buildFinalFileList(
            fileEntry.allFiles,
            fileItems,
            fileEntry.flaggedMeta,
          );
          if (built.length > 0) {
            finalFiles = built;
          } else {
            console.log('[Obfusca Unified] No files remaining after review');
            if (document.contains(fileEntry.input)) fileEntry.input.value = '';
            showToast('All files removed', 'info');
          }
        }
      }

      // --- Resolve protected text (if any) ---
      let protectedText: string | null = null;
      if (chatResult?.status === 'protected') {
        protectedText = chatResult.protectedContent
          || chatResult.response?.obfuscation?.obfuscated_text
          || null;
      }

      // --- GitHub Copilot special case: TEXT first, then FILE, then SUBMIT ---
      // On Copilot, restoring a file first and then setting text causes React
      // to re-render the input component, which clears the file attachment.
      // Reversing the order (text → file → submit) keeps the attachment.
      if (isGitHubCopilot && finalFiles && fileEntry
          && callbacks.onSetContentOnly && callbacks.onSubmitOnly) {
        console.log('[Obfusca Unified] GitHub Copilot: Setting text BEFORE file restore');

        // Step 1: Set text content (or skip if no text / bypassed)
        if (protectedText) {
          callbacks.onSetContentOnly(protectedText);
          showToast('Sent with sensitive data replaced', 'success');
        } else if (chatResult?.status === 'skipped') {
          callbacks.onEditText();
          return;
        } else if (chatResult) {
          // 'pending' = bypassed — send original text (already in textarea)
        }

        // Step 2: Wait for React to process the text change, then restore files
        setTimeout(() => {
          for (const f of finalFiles!) allowFileTemporarily(f);
          restoreFilesAndDispatch(fileEntry!.input, finalFiles!);

          // Step 3: Wait for file to be processed in React state, then submit
          setTimeout(() => {
            console.log('[Obfusca Unified] GitHub Copilot: File processed, triggering submit');
            callbacks.onSubmitOnly!();
          }, 1000);
        }, 300);

        return;
      }

      // --- Default flow (all other platforms): FILE first, then TEXT+SUBMIT ---
      let hasRestoredFiles = false;
      if (finalFiles && fileEntry) {
        for (const f of finalFiles) allowFileTemporarily(f);
        restoreFilesAndDispatch(fileEntry.input, finalFiles);
        hasRestoredFiles = true;
      }

      // Helper to send the chat text and trigger submission.
      const sendChat = () => {
        if (chatResult) {
          if (chatResult.status === 'protected') {
            if (protectedText) {
              console.log(`[Obfusca Unified] Sending protected text (${chatResult.protectedContent ? 'mode-aware' : 'fallback'})`);
              callbacks.onSendProtectedText(protectedText);
            } else {
              console.warn('[Obfusca Unified] Chat marked protected but no obfuscated text found');
              callbacks.onEditText();
            }
          } else if (chatResult.status === 'skipped') {
            callbacks.onEditText();
          } else {
            // 'pending' = bypassed, send original
            callbacks.onSendOriginalText(chatResult.content);
          }
        } else {
          // Files-only scenario: no chat text to modify, just trigger submission
          // so the restored files are sent with the original (clean) text.
          console.log('[Obfusca Unified] No chat item — triggering submission for file-only scenario');
          callbacks.onSendOriginalText('');
        }
      };

      if (hasRestoredFiles) {
        // Give the platform time to process the restored files before submitting.
        // React/framework change handlers need a tick to update internal state.
        // Signal to the interceptor that file restore is in progress so stray
        // submit button events (from Perplexity re-rendering) are suppressed.
        callbacks.onFileRestoreStart?.();
        console.log('[Obfusca Unified] Waiting 2000ms for file attachment to be processed');
        setTimeout(() => {
          callbacks.onFileRestoreEnd?.();
          sendChat();
        }, 2000);
      } else {
        sendChat();
      }
    },
    onClose: () => {
      console.log('[Obfusca Unified] Multi-item popup closed');
      callbacks.onDismiss();
      // Clear file input if files were pending
      if (fileEntry && document.contains(fileEntry.input)) {
        fileEntry.input.value = '';
      }
    },
  }, anchorElement);
  } catch (err) {
    console.error('[Obfusca Unified] CRITICAL: Failed to render multi-item popup:', err);
    // Ensure dismiss fires so state isn't left dangling
    callbacks.onDismiss();
  }
}

/** State tracking for interception */
interface InterceptorState {
  isAnalyzing: boolean;
  lastAnalyzedText: string;
  allowNextSubmit: boolean;
  /** Hash of the content that was approved — prevents re-scanning the same text
   *  while allowing NEW content to be scanned even within the allow window. */
  allowedContentHash: number;
  pendingObfuscatedText: string | null;
  /**
   * Track if we're in a "block pending analysis" state.
   * When true, all submit attempts are blocked synchronously.
   */
  blockPendingAnalysis: boolean;
  /**
   * Track if we're in the file-restore-then-send-text window.
   * During this window, stray submit button events (pointerdown/click) from
   * Perplexity re-rendering after file restore must be silently ignored —
   * NOT routed through the nuclear handler. The sendChat() callback will
   * handle the actual submission after the window completes.
   */
  fileRestoreInProgress: boolean;
}

/**
 * Simple string hash for content comparison.
 * NOT cryptographic — only used to detect if content changed between events.
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/**
 * Saved editor content for the "nuclear" Claude blocking strategy.
 * Claude's ProseMirror ignores preventDefault(), so we must clear the editor
 * content synchronously to prevent submission.
 */
interface SavedEditorContent {
  html: string;
  text: string;
  editor: HTMLElement;
}

/**
 * Create an interceptor for a specific site configuration.
 * Returns cleanup function to remove all listeners.
 */
export function createSiteInterceptor(config: SiteConfig): SiteState {
  const state: InterceptorState = {
    isAnalyzing: false,
    lastAnalyzedText: '',
    allowNextSubmit: false,
    allowedContentHash: 0,
    pendingObfuscatedText: null,
    blockPendingAnalysis: false,
    fileRestoreInProgress: false,
  };

  /**
   * Set the allowNextSubmit flag with a content hash.
   * Auto-reads current input content to generate the hash, so we only allow
   * through the EXACT content that's in the editor right now.
   * If the user edits the text before resubmitting, it will be re-scanned.
   */
  function setAllowNextSubmit(): void {
    state.allowNextSubmit = true;
    // Get fresh input — React/Lexical may have re-rendered the editor element
    // after setContent, making our closure reference stale.
    const currentInput = config.getInputElement() || inputElement;
    if (currentInput) {
      const currentContent = config.getContent(currentInput);
      state.allowedContentHash = currentContent ? simpleHash(currentContent) : 0;
      console.log(`[Obfusca] Allow next submit set, content hash=${state.allowedContentHash}, length=${currentContent.length}, freshInput=${currentInput !== inputElement}`);
    } else {
      state.allowedContentHash = 0;
    }
  }

  /**
   * Set the allowNextSubmit flag with a content hash computed from a TEXT STRING
   * rather than reading the DOM. Used by the atomic setContentAndSubmit path
   * where the DOM hasn't been updated yet when we need to set the allow hash
   * (the actual update happens async in the page script).
   *
   * Includes a 10s auto-reset timeout (same as triggerSubmit) because the
   * atomic path bypasses triggerSubmit and its built-in reset.
   */
  function setAllowNextSubmitFromText(text: string): void {
    state.allowNextSubmit = true;
    state.allowedContentHash = text ? simpleHash(text) : 0;
    console.log(`[Obfusca] Allow next submit set from text, hash=${state.allowedContentHash}, length=${text.length}`);

    // Safety: auto-reset after 10s (mirrors triggerSubmit's reset)
    setTimeout(() => {
      if (state.allowNextSubmit) {
        console.log('[Obfusca] Auto-resetting allowNextSubmit after atomic submission window (10s)');
      }
      cleanupAfterSubmission();
    }, 10_000);
  }

  /**
   * Set content on the input element and wait for it to settle.
   *
   * SiteConfig.setContent() may return a Promise (e.g. Perplexity's Lexical
   * bridge communicates with an async page script). This helper awaits the
   * result so the caller can compute the content hash AFTER the editor has
   * been updated, not before.
   *
   * For synchronous implementations (ChatGPT, Claude, etc.) this resolves
   * immediately since void is compatible with Promise<void>.
   */
  async function setContentAndWait(element: HTMLElement, content: string): Promise<void> {
    const result = config.setContent(element, content);
    if (result && typeof (result as Promise<void>).then === 'function') {
      await result;
    }
  }

  /**
   * Set content and verify it sticks — handles Perplexity's Lexical editor
   * where file restore events can cause React re-renders that reset the
   * editor state, overwriting the protected text.
   *
   * After the initial setContent succeeds, this polls the editor content
   * up to maxRetries times. If the content has reverted (e.g. because a
   * file restore dispatched change/input events that triggered a React
   * re-render), it re-applies the protected text.
   *
   * Returns the final element reference (may differ from input if React
   * re-rendered the editor DOM node).
   */
  async function setContentAndVerify(
    element: HTMLElement,
    content: string,
    maxRetries: number = 5,
    checkIntervalMs: number = 200,
  ): Promise<HTMLElement> {
    // Initial set
    const freshElement = config.getInputElement() || element;
    await setContentAndWait(freshElement, content);

    // Verification loop: confirm the content hasn't reverted
    let retries = 0;
    while (retries < maxRetries) {
      await new Promise(r => setTimeout(r, checkIntervalMs));
      const currentElement = config.getInputElement() || freshElement;
      const current = config.getContent(currentElement);
      if (current.trim() !== content.trim()) {
        retries++;
        console.log(`[Obfusca] Content reverted after setContent, re-applying (attempt ${retries}/${maxRetries})`);
        await setContentAndWait(currentElement, content);
      } else {
        console.log(`[Obfusca] Content verified stable after ${retries > 0 ? retries + ' retr' + (retries === 1 ? 'y' : 'ies') : 'initial set'}`);
        return currentElement;
      }
    }

    // After all retries, return whatever element we have
    const finalElement = config.getInputElement() || freshElement;
    console.warn(`[Obfusca] Content may not be stable after ${maxRetries} retries`);
    return finalElement;
  }

  /** Safety timeout: auto-reset isAnalyzing after 45s to prevent stuck state.
   * WebLLM model load (5s) + shader compilation (1s) + inference (7s) +
   * NER load (2s) + Layer 3 (1s) + backend round-trip (2s) = ~18s typical.
   * First-ever run with model download can take 60s+. */
  const ANALYSIS_TIMEOUT_MS = 45_000;
  let analysisTimeoutId: ReturnType<typeof setTimeout> | null = null;

  function startAnalysisTimeout(): void {
    if (analysisTimeoutId) clearTimeout(analysisTimeoutId);
    analysisTimeoutId = setTimeout(() => {
      if (state.isAnalyzing) {
        console.warn('[Obfusca] Safety: Auto-resetting stuck isAnalyzing after timeout');
        endAnalysis();
        state.blockPendingAnalysis = false;
        state.lastAnalyzedText = '';
      }
      analysisTimeoutId = null;
    }, ANALYSIS_TIMEOUT_MS);
  }

  function clearAnalysisTimeout(): void {
    if (analysisTimeoutId) {
      clearTimeout(analysisTimeoutId);
      analysisTimeoutId = null;
    }
  }

  /** Safely end the analysis state, clearing timeout and resetting flag. */
  function endAnalysis(): void {
    state.isAnalyzing = false;
    clearAnalysisTimeout();
  }

  /**
   * Clean up all submission-lifecycle state after a submission completes.
   * This allows the next submission to be analyzed fresh.
   *
   * Resets ONLY transient submission state — NOT config, session, listeners,
   * or element references.
   */
  function cleanupAfterSubmission(): void {
    console.log(`[Obfusca ${config.name}] Cleaning up submission state for next cycle`);
    state.isAnalyzing = false;
    state.lastAnalyzedText = '';
    state.allowNextSubmit = false;
    state.allowedContentHash = 0;
    state.blockPendingAnalysis = false;
    state.fileRestoreInProgress = false;
    state.pendingObfuscatedText = null;
    savedEditorContent = null;
    clearAnalysisTimeout();
    cleanupFileState();
  }

  let inputElement: HTMLElement | null = null;
  let submitButton: HTMLElement | null = null;
  let observer: ObserverHandle | null = null;
  let urlWatcherCleanup: (() => void) | null = null;
  let listenersAttached = false;

  /**
   * Saved editor content for the nuclear Claude blocking strategy.
   * When we detect sensitive data, we clear the editor IMMEDIATELY (synchronously)
   * so that Claude's ProseMirror has nothing to send, then restore later if needed.
   */
  let savedEditorContent: SavedEditorContent | null = null;

  // Store references to bound handlers for removal
  const boundHandlers: {
    keydown?: (e: KeyboardEvent) => void;
    documentKeydown?: (e: KeyboardEvent) => void;
    beforeInput?: (e: InputEvent) => void;
    submitClick?: (e: MouseEvent) => void;
    submitMousedown?: (e: MouseEvent) => void;
    submitPointerdown?: (e: PointerEvent) => void;
    submitTouchstart?: (e: TouchEvent) => void;
    formSubmit?: (e: SubmitEvent) => void;
  } = {};

  /**
   * NUCLEAR BLOCKING: Clear the editor content synchronously.
   *
   * Claude's ProseMirror/TipTap editor doesn't respect preventDefault().
   * It reads the editor state directly before the DOM event completes.
   * The ONLY way to block submission is to clear the content BEFORE Claude reads it.
   *
   * This function:
   * 1. Saves the current editor content (HTML and text)
   * 2. Clears the editor immediately
   * 3. Dispatches an input event so Claude sees empty content
   *
   * Call restoreEditorContent() to restore the content later.
   */
  function nuclearClearEditor(editor: HTMLElement, text: string): void {
    console.log('[Obfusca Claude] NUCLEAR BLOCK - clearing editor temporarily');
    console.log(`[Obfusca Claude] Saving content: ${text.length} chars`);

    // Save the current content
    savedEditorContent = {
      html: editor.innerHTML,
      text: text,
      editor: editor,
    };

    // Clear the editor immediately - use the site-specific clearContent if available
    if (config.clearContent) {
      config.clearContent(editor);
    } else {
      // Fallback: clear innerHTML directly
      editor.innerHTML = '';
    }

    // Dispatch input event so Claude sees the content is now empty
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    console.log('[Obfusca Claude] Editor cleared - Claude will see empty content');
  }

  /**
   * Restore the editor content after nuclear blocking.
   * Call this when:
   * - User dismisses the overlay (wants to edit)
   * - Analysis comes back clean (false positive)
   * - User clicks "Send Anyway"
   */
  function restoreEditorContent(): void {
    if (!savedEditorContent) {
      console.log('[Obfusca Claude] No saved content to restore');
      return;
    }

    console.log('[Obfusca Claude] Restoring editor content');
    const { html, editor } = savedEditorContent;

    // Restore the HTML content
    editor.innerHTML = html;

    // Dispatch input event so Claude sees the restored content
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }));

    // Focus the editor
    editor.focus();

    // Clear the saved content
    savedEditorContent = null;
    console.log('[Obfusca Claude] Editor content restored');
  }

  /**
   * Discard the saved editor content permanently.
   * Call this when user confirms they want to block the message.
   */
  function discardSavedContent(): void {
    if (savedEditorContent) {
      console.log('[Obfusca Claude] Discarding saved content permanently');
      savedEditorContent = null;
    }
  }

  /**
   * Check if we need nuclear blocking (clearing the editor).
   * ONLY Claude.ai needs this because its ProseMirror ignores preventDefault().
   * Other sites (Gemini, ChatGPT, etc.) work fine with just preventDefault().
   */
  function needsNuclearBlocking(_editor: HTMLElement): boolean {
    // Nuclear blocking is ONLY for Claude.ai - other sites don't need it
    return config.name === 'Claude';
  }

  /**
   * Check if ANY Obfusca popup or overlay is currently visible.
   */
  function isAnyPopupVisible(): boolean {
    return isDetectionPopupVisible() || isMultiItemPopupVisible() || isBlockOverlayVisible() || isRedactOverlayVisible();
  }

  /**
   * Handle potential submission - run detection and show overlay if needed.
   */
  async function handleSubmissionAttempt(
    input: HTMLElement,
    button: HTMLElement | null,
    originalEvent?: Event
  ): Promise<boolean> {
    console.log(`[Obfusca] Submit intercepted: ${originalEvent?.type || 'programmatic'}`);

    // Bypass flag: skip all scanning entirely (user confirmed "send unprotected")
    if (isBypassActive()) {
      console.log('[Obfusca] Bypass flag active — allowing submission without scanning');
      consumeBypassFlag();
      return true;
    }

    // If user already allowed, let it through.
    // DON'T consume the allow here — the auto-reset timeout in triggerSubmit() handles cleanup.
    // Consuming here would break ChatGPT's submission chain where the form submit event
    // fires before the synthetic Enter keydown, leaving the keydown with no allow state.
    if (state.allowNextSubmit) {
      console.log('[Obfusca] User previously allowed this submission, proceeding (not consuming)');
      return true;
    }

    // Don't re-analyze if any overlay/popup is showing
    if (isAnyPopupVisible()) {
      console.log('[Obfusca] Popup/overlay already visible, blocking submission');
      originalEvent?.preventDefault();
      originalEvent?.stopPropagation();
      return false;
    }

    // If we have pending obfuscated text, use it and submit
    if (state.pendingObfuscatedText !== null) {
      console.log('[Obfusca] Using pending obfuscated text');
      const obfuscatedText = state.pendingObfuscatedText;
      state.pendingObfuscatedText = null;
      await setContentAndWait(input, obfuscatedText);
      return true;
    }

    const text = config.getContent(input);
    console.log(`[Obfusca] Content extracted: ${text.length} chars`);
    console.log(`[Obfusca] Content preview: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);

    // Skip empty messages
    if (!text.trim()) {
      console.log('[Obfusca] Empty content, allowing submission');
      return true;
    }

    // Always run full detection pipeline (local regex + backend AI detection)
    console.log('[Obfusca] Running full detection pipeline (local + backend AI)...');

    // Prevent the submission while we analyze
    originalEvent?.preventDefault();
    originalEvent?.stopPropagation();

    // Apply site-specific prevention if available
    if (config.preventSubmit && originalEvent) {
      config.preventSubmit(originalEvent);
    }

    // Avoid redundant analysis
    if (state.isAnalyzing) {
      console.log('[Obfusca] Already analyzing, blocking duplicate submission');
      return false;
    }

    if (text === state.lastAnalyzedText) {
      console.log('[Obfusca] Same text as last analysis, blocking');
      return false;
    }

    state.isAnalyzing = true;
    state.lastAnalyzedText = text;
    startAnalysisTimeout();
    showAnalysisIndicator(input);

    try {
      // Run local detection first (fast) - THIS ALWAYS RUNS
      // Now includes both built-in patterns AND custom patterns (from storage cache)
      console.log('[Obfusca] Running local detection (built-in + custom patterns)...');
      const localDetections = await detectSensitiveData(text);
      console.log(`[Obfusca] Local detection results: ${localDetections.length} detections found`);
      if (localDetections.length > 0) {
        console.log('[Obfusca] Local detections:', JSON.stringify(localDetections.map(d => ({
          type: d.type,
          displayName: d.displayName,
          severity: d.severity,
          position: `${d.start}-${d.end}`,
        }))));
      }

      // Get full analysis (may include backend results, falls back to local if backend unavailable)
      // Pass the current URL so the backend can log the correct source (chatgpt, claude, gemini)
      console.log('[Obfusca] Running full analysis pipeline (backend + local merge)...');
      const result = await analyze(text, localDetections, window.location.href);
      console.log(`[Obfusca] Analysis complete: source=${result.source}, action=${result.action}, shouldBlock=${result.shouldBlock}`);
      console.log(`[Obfusca] Detection results: ${JSON.stringify(result.detections.map(d => ({
        type: d.type,
        displayName: d.displayName,
        severity: d.severity,
      })))}`);

      // ---------------------------------------------------------------
      // Check for pending flagged files to combine with text results.
      // If a file scan is still in progress, wait for it to finish so
      // text + file detections are merged into a single unified popup.
      // ---------------------------------------------------------------
      let pendingFiles: PendingFlaggedFileEntry | null;
      if (hasInFlightFileScans()) {
        console.log('[Obfusca] File scan in progress — holding submit, showing indicator');
        updateAnalysisIndicatorText('Scanning files');
        showFileScanPendingIndicator();
        pendingFiles = await waitForPendingFileScans(30_000);
        hideFileScanPendingIndicator();
        console.log('[Obfusca] File scan wait complete, pendingFiles=', !!pendingFiles);
      } else {
        pendingFiles = consumePendingFlaggedFiles();
      }

      const textHasDetections = result.detections.length > 0 &&
        !(result.simulated && result.wouldHaveBlocked); // exclude monitor-mode
      const isMonitor = result.simulated && result.wouldHaveBlocked;

      console.log('[Obfusca] Decision state:', {
        textDetections: result.detections.length,
        textHasDetections,
        isMonitor,
        hasPendingFiles: !!pendingFiles,
        pendingFileCount: pendingFiles?.flaggedItems.length || 0,
        action: result.action,
        source: result.source,
      });

      // --- UNIFIED POPUP: text + files both flagged ---
      if (textHasDetections && pendingFiles) {
        console.log('[Obfusca] Both text and files flagged -- showing unified popup');
        removeAnalysisIndicator();
        const chatItem = buildChatFlaggedItem(text, result as TextAnalysisResult);

        showUnifiedPopup(chatItem, pendingFiles, {
          onEditText: () => {
            console.log('[Obfusca Unified] User wants to edit');
            endAnalysis();
            state.lastAnalyzedText = '';
          },
          onSendOriginalText: (_origText: string) => {
            console.log('[Obfusca Unified] User sending original text');
            state.lastAnalyzedText = '';
            if (config.setContentAndSubmit) {
              // Atomic path: compute hash from current DOM text, then submit
              setAllowNextSubmit();
              showToast('Sent original - be careful!', 'info');
              triggerSubmit(button, input);
            } else {
              setAllowNextSubmit();
              showToast('Sent original - be careful!', 'info');
              triggerSubmit(button, input);
            }
          },
          onSendProtectedText: async (obfuscatedText: string) => {
            console.log('[Obfusca Unified] User sending protected text');
            state.lastAnalyzedText = '';
            if (config.setContentAndSubmit) {
              // Atomic path: compute hash from TEXT string (not DOM), then
              // set content + submit in one operation with no React gap.
              const freshInput = config.getInputElement() || input;
              setAllowNextSubmitFromText(obfuscatedText);
              showToast('Sent with sensitive data replaced', 'success');
              await config.setContentAndSubmit(freshInput, obfuscatedText);
            } else {
              const verifiedInput = await setContentAndVerify(input, obfuscatedText);
              setAllowNextSubmit();
              showToast('Sent with sensitive data replaced', 'success');
              triggerSubmit(button, verifiedInput);
            }
          },
          onDismiss: () => {
            console.log('[Obfusca Unified] Dismissed');
            endAnalysis();
            state.lastAnalyzedText = '';
          },
          // GitHub Copilot split callbacks: set text without submitting,
          // then submit separately after file restore completes.
          onSetContentOnly: async (text: string) => {
            const freshInput = config.getInputElement() || input;
            await setContentAndWait(freshInput, text);
          },
          onSubmitOnly: () => {
            console.log('[Obfusca GitHub Copilot] Submitting via synthetic Enter keypress');
            const freshInput = config.getInputElement() || input;
            setAllowNextSubmit();
            setTimeout(() => {
              const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true,
              });
              freshInput.dispatchEvent(enterEvent);
              console.log('[Obfusca GitHub Copilot] Synthetic Enter dispatched on textarea');
            }, 50);
          },
          onFileRestoreStart: () => { state.fileRestoreInProgress = true; },
          onFileRestoreEnd: () => { state.fileRestoreInProgress = false; },
        }, input);

        endAnalysis();
        return false;
      }

      // --- FILES ONLY: text is clean but files are flagged ---
      if (!textHasDetections && pendingFiles) {
        console.log('[Obfusca] Text clean but files flagged -- showing unified file popup');
        removeAnalysisIndicator();

        showUnifiedPopup(null, pendingFiles, {
          onEditText: () => { endAnalysis(); state.lastAnalyzedText = ''; },
          onSendOriginalText: () => {
            // No text action needed; allow submission through
            state.lastAnalyzedText = '';
            setAllowNextSubmit();
            triggerSubmit(button, input);
          },
          onSendProtectedText: () => {
            state.lastAnalyzedText = '';
            setAllowNextSubmit();
            triggerSubmit(button, input);
          },
          onDismiss: () => {
            endAnalysis();
            state.lastAnalyzedText = '';
          },
          onFileRestoreStart: () => { state.fileRestoreInProgress = true; },
          onFileRestoreEnd: () => { state.fileRestoreInProgress = false; },
        }, input);

        endAnalysis();
        return false;
      }

      // --- TEXT ONLY: detections found, no pending files ---
      // Always use the unified multi-item popup (same UI for single items and multi-items).
      if (result.detections.length > 0) {
        // Handle MONITOR MODE - show indicator but allow through
        if (isMonitor) {
          console.log(`[Obfusca] MONITOR MODE: Would have ${result.originalAction} - ${result.detections.length} detections`);
          const detectionTypes = [...new Set(result.detections.map(d => d.displayName))].join(', ');
          console.log(`[Obfusca] MONITOR: Would have blocked/redacted: ${detectionTypes}`);

          // Allow the submission to proceed immediately (monitor = passive)
          endAnalysis();
          showIndicatorSuccess();
          setAllowNextSubmit();
          triggerSubmit(button, input);
          return true;
        }

        // Warn / Block → show unified multi-item popup with chat item only
        console.log(`[Obfusca] Showing unified popup for text-only: ${result.detections.length} detections, action=${result.action}`);
        removeAnalysisIndicator();
        const chatItem = buildChatFlaggedItem(text, result as TextAnalysisResult);

        showUnifiedPopup(chatItem, null, {
          onEditText: () => {
            console.log('[Obfusca] User wants to edit message');
            endAnalysis();
            state.lastAnalyzedText = '';
          },
          onSendOriginalText: (_origText: string) => {
            console.log('[Obfusca] User chose to send original (risky)');
            state.lastAnalyzedText = '';
            if (config.setContentAndSubmit) {
              // Atomic path: original text is already in the editor, just submit
              setAllowNextSubmit();
              showToast('Sent original - be careful!', 'info');
              triggerSubmit(button, input);
            } else {
              setAllowNextSubmit();
              showToast('Sent original - be careful!', 'info');
              triggerSubmit(button, input);
            }
          },
          onSendProtectedText: async (obfuscatedText: string) => {
            console.log('[Obfusca] User chose to send obfuscated version');
            state.lastAnalyzedText = '';
            if (config.setContentAndSubmit) {
              // Atomic path: compute hash from TEXT string (not DOM), then
              // set content + submit in one operation with no React gap.
              const freshInput = config.getInputElement() || input;
              setAllowNextSubmitFromText(obfuscatedText);
              showToast('Sent with sensitive data replaced', 'success');
              await config.setContentAndSubmit(freshInput, obfuscatedText);
            } else {
              const verifiedInput = await setContentAndVerify(input, obfuscatedText);
              setAllowNextSubmit();
              showToast('Sent with sensitive data replaced', 'success');
              triggerSubmit(button, verifiedInput);
            }
          },
          onDismiss: () => {
            console.log('[Obfusca] User dismissed popup');
            endAnalysis();
            state.lastAnalyzedText = '';
          },
          onFileRestoreStart: () => { state.fileRestoreInProgress = true; },
          onFileRestoreEnd: () => { state.fileRestoreInProgress = false; },
        }, input);

        endAnalysis();
        return false;
      }

      // No blocking/redacting needed - allow submission
      console.log('[Obfusca] No blocking/redacting needed, allowing submission');
      endAnalysis();
      showIndicatorSuccess();
      setAllowNextSubmit();
      triggerSubmit(button, input);
      return true;
    } catch (error) {
      console.error(`[Obfusca] Error during analysis:`, error);
      endAnalysis();
      removeAnalysisIndicator();
      // On error, allow submission (fail open for MVP, configurable later)
      console.log('[Obfusca] Error occurred, failing open (allowing submission)');
      return true;
    }
  }

  /**
   * Trigger form submission programmatically.
   * Dispatches the full event sequence (pointerdown → mousedown → click)
   * because some sites (e.g. ChatGPT) handle submission on mousedown/pointerdown.
   */
  function triggerSubmit(button: HTMLElement | null, input: HTMLElement): void {
    // Use site-specific delay — Lexical/ProseMirror need time to reconcile state
    const delay = config.submitDelay || 10;

    // If the site provides a custom triggerSubmit (e.g. Perplexity uses Enter key
    // simulation instead of button click because Lexical may leave the button
    // disabled after programmatic setContent), use it.
    if (config.triggerSubmit) {
      const freshInput = config.getInputElement() || input;
      console.log(`[Obfusca] triggerSubmit: Using site-specific triggerSubmit (${config.name}), delay=${delay}ms`);
      setTimeout(() => {
        config.triggerSubmit!(freshInput);
      }, delay);
    } else {
      // Default: button click with full event sequence
      // Always use a fresh button lookup — the closure reference may be stale
      // (React re-renders can replace the DOM element)
      const freshButton = config.getSubmitButton() || button;

      if (freshButton && freshButton instanceof HTMLButtonElement) {
        console.log(`[Obfusca] triggerSubmit: Using ${freshButton === button ? 'original' : 'FRESH'} button, connected=${document.contains(freshButton)}, delay=${delay}ms`);
        setTimeout(() => {
          // Dispatch full event sequence — ChatGPT may listen on mousedown/pointerdown
          freshButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          freshButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          freshButton.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
          freshButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          freshButton.click();
        }, delay);
      } else {
        // Try to find and submit the form
        const form = input.closest('form');
        if (form) {
          console.log('[Obfusca] triggerSubmit: No button, using form.requestSubmit()');
          setTimeout(() => {
            form.requestSubmit();
          }, delay);
        } else {
          // Last resort: simulate Enter key on the input element
          // Some platforms (e.g. DeepSeek) submit via Enter without a visible button or form
          const freshInput = config.getInputElement() || input;
          console.log('[Obfusca] triggerSubmit: No button/form — simulating Enter key on input');
          setTimeout(() => {
            freshInput.focus();
            const enterDown = new KeyboardEvent('keydown', {
              key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
              bubbles: true, cancelable: true,
            });
            freshInput.dispatchEvent(enterDown);
            const enterUp = new KeyboardEvent('keyup', {
              key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
              bubbles: true, cancelable: true,
            });
            freshInput.dispatchEvent(enterUp);
          }, delay);
        }
      }
    }

    // Safety: auto-reset allowNextSubmit after the submission chain completes.
    // 10s window covers ChatGPT's full async submission chain:
    //   triggerSubmit → pointerdown/mousedown/click → form submit → React re-render
    //   → synthetic Enter keydown → message sent → textarea cleared
    // The content hash check in shouldBlockEventSync prevents NEW content from slipping
    // through during this window. Once the textarea is cleared (hash mismatch or empty),
    // new submissions will be scanned normally even before this timeout fires.
    setTimeout(() => {
      if (state.allowNextSubmit) {
        console.log('[Obfusca] Auto-resetting allowNextSubmit after submission window (10s)');
      }
      cleanupAfterSubmission();
    }, 10_000);
  }

  /**
   * Handle submission attempt with NUCLEAR blocking for Claude/ProseMirror.
   *
   * This is called AFTER the editor content has been cleared (nuclear block).
   * The text parameter contains the ORIGINAL content that was saved before clearing.
   *
   * Key differences from handleSubmissionAttempt:
   * 1. Uses pre-captured text (editor is already cleared)
   * 2. Restores content if analysis comes back clean (false positive)
   * 3. Overlay callbacks handle restore/discard of saved content
   */
  async function handleSubmissionAttemptWithNuclear(
    input: HTMLElement,
    button: HTMLElement | null,
    _originalEvent: Event | undefined,
    capturedText: string
  ): Promise<boolean> {
    console.log(`[Obfusca Claude Nuclear] Submit intercepted with nuclear blocking`);
    console.log(`[Obfusca Claude Nuclear] Using captured text: ${capturedText.length} chars`);

    // Bypass flag: skip all scanning entirely (user confirmed "send unprotected")
    if (isBypassActive()) {
      console.log('[Obfusca Claude Nuclear] Bypass flag active — restoring content and allowing');
      consumeBypassFlag();
      restoreEditorContent();
      return true;
    }

    // If user already allowed, restore and let it through.
    // DON'T consume the allow here — the auto-reset timeout in triggerSubmit() handles cleanup.
    if (state.allowNextSubmit) {
      console.log('[Obfusca Claude Nuclear] User previously allowed, restoring and proceeding (not consuming)');
      restoreEditorContent();
      triggerSubmit(button, input);
      return true;
    }

    // Don't re-analyze if any popup/overlay is showing
    if (isAnyPopupVisible()) {
      console.log('[Obfusca Claude Nuclear] Popup/overlay already visible, keeping content cleared');
      return false;
    }

    // Skip empty messages - restore if we accidentally cleared empty content
    if (!capturedText.trim()) {
      console.log('[Obfusca Claude Nuclear] Empty content, restoring and allowing submission');
      restoreEditorContent();
      return true;
    }

    // Avoid redundant analysis
    if (state.isAnalyzing) {
      console.log('[Obfusca Claude Nuclear] Already analyzing, keeping content cleared');
      return false;
    }

    if (capturedText === state.lastAnalyzedText) {
      console.log('[Obfusca Claude Nuclear] Same text as last analysis, keeping content cleared');
      return false;
    }

    state.isAnalyzing = true;
    state.lastAnalyzedText = capturedText;
    startAnalysisTimeout();
    showAnalysisIndicator(input);

    try {
      // Run local detection first (fast)
      console.log('[Obfusca Claude Nuclear] Running local detection...');
      const localDetections = await detectSensitiveData(capturedText);
      console.log(`[Obfusca Claude Nuclear] Local detection: ${localDetections.length} detections found`);

      // Get full analysis
      console.log('[Obfusca Claude Nuclear] Running full analysis pipeline...');
      const result = await analyze(capturedText, localDetections, window.location.href);
      console.log(`[Obfusca Claude Nuclear] Analysis complete: action=${result.action}, shouldBlock=${result.shouldBlock}`);

      // ---------------------------------------------------------------
      // Check for pending flagged files to combine with text results.
      // If a file scan is still in progress, wait for it to finish so
      // text + file detections are merged into a single unified popup.
      // ---------------------------------------------------------------
      let pendingFiles: PendingFlaggedFileEntry | null;
      if (hasInFlightFileScans()) {
        console.log('[Obfusca Claude Nuclear] File scan in progress — holding submit, showing indicator');
        updateAnalysisIndicatorText('Scanning files');
        showFileScanPendingIndicator();
        pendingFiles = await waitForPendingFileScans(30_000);
        hideFileScanPendingIndicator();
        console.log('[Obfusca Claude Nuclear] File scan wait complete, pendingFiles=', !!pendingFiles);
      } else {
        pendingFiles = consumePendingFlaggedFiles();
      }

      const textHasDetections = result.detections.length > 0 &&
        !(result.simulated && result.wouldHaveBlocked);
      const isMonitor = result.simulated && result.wouldHaveBlocked;

      console.log('[Obfusca Nuclear] Decision state:', {
        textDetections: result.detections.length,
        textHasDetections,
        isMonitor,
        hasPendingFiles: !!pendingFiles,
        pendingFileCount: pendingFiles?.flaggedItems.length || 0,
        action: result.action,
        source: result.source,
      });

      // --- UNIFIED POPUP: text + files both flagged (nuclear-aware) ---
      if (textHasDetections && pendingFiles) {
        console.log('[Obfusca Claude Nuclear] Both text and files flagged -- showing unified popup');
        removeAnalysisIndicator();
        const chatItem = buildChatFlaggedItem(capturedText, result as TextAnalysisResult);

        showUnifiedPopup(chatItem, pendingFiles, {
          onEditText: () => {
            console.log('[Obfusca Claude Nuclear Unified] User wants to edit');
            restoreEditorContent();
            endAnalysis();
            state.lastAnalyzedText = '';
          },
          onSendOriginalText: (_origText: string) => {
            console.log('[Obfusca Claude Nuclear Unified] Sending original text');
            restoreEditorContent();
            state.lastAnalyzedText = '';
            if (config.setContentAndSubmit) {
              setAllowNextSubmit();
              showToast('Sent original - be careful!', 'info');
              triggerSubmit(button, input);
            } else {
              setAllowNextSubmit();
              showToast('Sent original - be careful!', 'info');
              triggerSubmit(button, input);
            }
          },
          onSendProtectedText: async (obfuscatedText: string) => {
            console.log('[Obfusca Claude Nuclear Unified] Sending protected text');
            discardSavedContent();
            state.lastAnalyzedText = '';
            if (config.setContentAndSubmit) {
              const freshInput = config.getInputElement() || input;
              setAllowNextSubmitFromText(obfuscatedText);
              showToast('Sent with sensitive data replaced', 'success');
              await config.setContentAndSubmit(freshInput, obfuscatedText);
            } else {
              const verifiedInput = await setContentAndVerify(input, obfuscatedText);
              setAllowNextSubmit();
              showToast('Sent with sensitive data replaced', 'success');
              triggerSubmit(button, verifiedInput);
            }
          },
          onDismiss: () => {
            console.log('[Obfusca Claude Nuclear Unified] Dismissed');
            restoreEditorContent();
            endAnalysis();
            state.lastAnalyzedText = '';
          },
          // GitHub Copilot split callbacks (nuclear-aware)
          onSetContentOnly: async (text: string) => {
            discardSavedContent();
            const freshInput = config.getInputElement() || input;
            await setContentAndWait(freshInput, text);
          },
          onSubmitOnly: () => {
            console.log('[Obfusca GitHub Copilot Nuclear] Submitting via synthetic Enter keypress');
            const freshInput = config.getInputElement() || input;
            setAllowNextSubmit();
            setTimeout(() => {
              const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true,
              });
              freshInput.dispatchEvent(enterEvent);
              console.log('[Obfusca GitHub Copilot Nuclear] Synthetic Enter dispatched on textarea');
            }, 50);
          },
          onFileRestoreStart: () => { state.fileRestoreInProgress = true; },
          onFileRestoreEnd: () => { state.fileRestoreInProgress = false; },
        }, input);

        endAnalysis();
        return false;
      }

      // --- FILES ONLY: text clean but files flagged (nuclear-aware) ---
      if (!textHasDetections && pendingFiles) {
        console.log('[Obfusca Claude Nuclear] Text clean but files flagged -- showing unified file popup');
        removeAnalysisIndicator();

        showUnifiedPopup(null, pendingFiles, {
          onEditText: () => { endAnalysis(); state.lastAnalyzedText = ''; },
          onSendOriginalText: () => {
            restoreEditorContent();
            state.lastAnalyzedText = '';
            setAllowNextSubmit();
            triggerSubmit(button, input);
          },
          onSendProtectedText: () => {
            restoreEditorContent();
            state.lastAnalyzedText = '';
            setAllowNextSubmit();
            triggerSubmit(button, input);
          },
          onDismiss: () => {
            restoreEditorContent();
            endAnalysis();
            state.lastAnalyzedText = '';
          },
          onFileRestoreStart: () => { state.fileRestoreInProgress = true; },
          onFileRestoreEnd: () => { state.fileRestoreInProgress = false; },
        }, input);

        endAnalysis();
        return false;
      }

      // --- TEXT ONLY: detections found, no pending files (nuclear-aware) ---
      // Always use unified multi-item popup (same UI for single items and multi-items).
      if (result.detections.length > 0) {
        // Handle MONITOR MODE - restore content and allow through
        if (isMonitor) {
          console.log(`[Obfusca Claude Nuclear] MONITOR MODE: Restoring content and allowing`);
          restoreEditorContent();
          endAnalysis();
          showIndicatorSuccess();
          setAllowNextSubmit();
          triggerSubmit(button, input);
          return true;
        }

        // Warn / Block → show unified multi-item popup with chat item only (nuclear-aware)
        console.log(`[Obfusca Claude Nuclear] Showing unified popup for text-only: ${result.detections.length} detections, action=${result.action}`);
        removeAnalysisIndicator();
        const chatItem = buildChatFlaggedItem(capturedText, result as TextAnalysisResult);

        showUnifiedPopup(chatItem, null, {
          onEditText: () => {
            console.log('[Obfusca Claude Nuclear] User wants to edit - restoring content');
            restoreEditorContent();
            endAnalysis();
            state.lastAnalyzedText = '';
          },
          onSendOriginalText: (_origText: string) => {
            console.log('[Obfusca Claude Nuclear] User chose original - restoring and submitting');
            restoreEditorContent();
            state.lastAnalyzedText = '';
            if (config.setContentAndSubmit) {
              setAllowNextSubmit();
              showToast('Sent original - be careful!', 'info');
              triggerSubmit(button, input);
            } else {
              setAllowNextSubmit();
              showToast('Sent original - be careful!', 'info');
              triggerSubmit(button, input);
            }
          },
          onSendProtectedText: async (obfuscatedText: string) => {
            console.log('[Obfusca Claude Nuclear] User chose obfuscated - setting content and submitting');
            discardSavedContent();
            state.lastAnalyzedText = '';
            if (config.setContentAndSubmit) {
              const freshInput = config.getInputElement() || input;
              setAllowNextSubmitFromText(obfuscatedText);
              showToast('Sent with sensitive data replaced', 'success');
              await config.setContentAndSubmit(freshInput, obfuscatedText);
            } else {
              const verifiedInput = await setContentAndVerify(input, obfuscatedText);
              setAllowNextSubmit();
              showToast('Sent with sensitive data replaced', 'success');
              triggerSubmit(button, verifiedInput);
            }
          },
          onDismiss: () => {
            console.log('[Obfusca Claude Nuclear] User dismissed popup');
            restoreEditorContent();
            endAnalysis();
            state.lastAnalyzedText = '';
          },
          onFileRestoreStart: () => { state.fileRestoreInProgress = true; },
          onFileRestoreEnd: () => { state.fileRestoreInProgress = false; },
        }, input);

        endAnalysis();
        return false;
      }

      // No blocking/redacting needed - analysis complete, allow submission
      console.log('[Obfusca Claude Nuclear] No blocking needed, restoring and allowing');
      restoreEditorContent();
      endAnalysis();
      showIndicatorSuccess();
      setAllowNextSubmit();
      triggerSubmit(button, input);
      return true;
    } catch (error) {
      console.error(`[Obfusca Claude Nuclear] Error during analysis:`, error);
      endAnalysis();
      removeAnalysisIndicator();
      // On error, restore content and allow submission (fail open)
      console.log('[Obfusca Claude Nuclear] Error occurred, restoring content and failing open');
      restoreEditorContent();
      return true;
    }
  }

  /**
   * SYNCHRONOUS check: should we block this event immediately?
   * This runs BEFORE any async code to prevent ProseMirror from processing the event.
   */
  function shouldBlockEventSync(input: HTMLElement): boolean {
    console.log(`[Obfusca ${config.name}] SYNC CHECK START`);

    // BYPASS FLAG CHECK — must be FIRST, before any scanning or hash checks.
    // When the user confirmed "Yes, send unprotected", the bypass flag is set
    // so the re-triggered submit goes through without any interception.
    // consumeBypassFlag() is one-time use: it clears the flag on first check.
    if (consumeBypassFlag()) {
      console.log(`[Obfusca ${config.name}] SYNC: ALLOWING - bypass flag active (send unprotected)`);
      return false;
    }

    // Check for Obfusca's own synthetic submit marker (data-obfusca-synthetic-submit).
    // When Obfusca's triggerSubmit dispatches an Enter key (e.g., for Perplexity's
    // Lexical editor), it sets this data attribute on the input element BEFORE
    // dispatching. This prevents Obfusca from intercepting its own synthetic event,
    // which would cause a second popup cycle and block the approved submission.
    if (input.dataset.obfuscaSyntheticSubmit === 'true') {
      console.log(`[Obfusca ${config.name}] SYNC: ALLOWING - Obfusca synthetic submit detected (bypass)`);
      return false;
    }

    // If we're already blocking pending analysis, block this event
    if (state.blockPendingAnalysis) {
      console.log(`[Obfusca ${config.name}] SYNC: BLOCKING - analysis in progress`);
      return true;
    }

    // If user allowed next submit, verify content hasn't changed
    if (state.allowNextSubmit) {
      // If we have a content hash, verify the current content matches what was approved
      if (state.allowedContentHash !== 0) {
        const currentText = config.getContent(input);
        const currentHash = simpleHash(currentText);
        if (currentHash === state.allowedContentHash) {
          console.log(`[Obfusca ${config.name}] SYNC: ALLOWING - user approved, content matches (hash=${currentHash})`);
          return false;
        }
        // Content changed since approval — revoke and re-scan
        console.log(`[Obfusca ${config.name}] SYNC: Content changed since approval (expected=${state.allowedContentHash}, got=${currentHash}), revoking`);
        state.allowNextSubmit = false;
        state.allowedContentHash = 0;
        // Fall through to normal blocking logic
      } else {
        // No hash stored (legacy path or no content to verify)
        console.log(`[Obfusca ${config.name}] SYNC: ALLOWING - user approved (no hash)`);
        return false;
      }
    }

    // If any popup/overlay is visible, block
    if (isAnyPopupVisible()) {
      console.log(`[Obfusca ${config.name}] SYNC: BLOCKING - popup/overlay visible (detection=${isDetectionPopupVisible()}, multi=${isMultiItemPopupVisible()}, block=${isBlockOverlayVisible()}, redact=${isRedactOverlayVisible()})`);
      return true;
    }

    // Quick sync check for content - if empty, allow
    const text = config.getContent(input);
    console.log(`[Obfusca ${config.name}] SYNC: Content length=${text.length}, preview="${text.substring(0, 50)}..."`);

    if (!text.trim()) {
      if (hasPendingFlaggedFiles() || hasInFlightFileScans()) {
        console.log(`[Obfusca ${config.name}] SYNC: BLOCKING - pending/in-flight file scans`);
        return true;
      }
      console.log(`[Obfusca ${config.name}] SYNC: ALLOWING - empty content`);
      return false;
    }

    // For short messages, only check local regex (AI detection needs more context)
    if (text.trim().length < 20) {
      const hasSensitiveData = mightContainSensitiveDataSync(text);
      if (!hasSensitiveData) {
        if (hasPendingFlaggedFiles() || hasInFlightFileScans()) {
          console.log(`[Obfusca ${config.name}] SYNC: BLOCKING - pending/in-flight file scans`);
          return true;
        }
        console.log(`[Obfusca ${config.name}] SYNC: ALLOWING - short message, no local patterns`);
        return false;
      }
    }

    // Always block non-trivial content for full backend analysis (regex + AI detection)
    console.log(`[Obfusca ${config.name}] SYNC: BLOCKING - routing to backend for full analysis`);
    return true;
  }

  /**
   * Aggressively stop an event from propagating.
   * Used for ProseMirror/TipTap which uses aggressive event handling.
   */
  function stopEventCompletely(event: Event): void {
    console.log(`[Obfusca ${config.name}] stopEventCompletely: Blocking ${event.type} event`);
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    console.log(`[Obfusca ${config.name}] stopEventCompletely: Event blocked - defaultPrevented=${event.defaultPrevented}`);

    // For KeyboardEvent, also try to neutralize it
    if (event instanceof KeyboardEvent) {
      // Set a flag on the event that ProseMirror might check
      Object.defineProperty(event, 'defaultPrevented', {
        get: () => true,
        configurable: true,
      });
      console.log(`[Obfusca ${config.name}] stopEventCompletely: KeyboardEvent neutralized`);
    }
  }

  /**
   * Set up keyboard listener for Enter key submission.
   * CRITICAL: For ProseMirror/TipTap editors, we must block SYNCHRONOUSLY first,
   * then run async analysis. The async handler would let ProseMirror process
   * the event before we can block it.
   */
  function setupKeyboardListener(input: HTMLElement): void {
    console.log(`[Obfusca] Attaching keydown listener to input: ${input.tagName}#${input.id || '(no id)'}`);
    console.log(`[Obfusca ${config.name}] Event phase: capture=true for early interception`);

    /**
     * Main keydown handler - MUST be synchronous to block before ProseMirror.
     * Analysis is triggered async but event is blocked sync.
     *
     * NUCLEAR STRATEGY FOR CLAUDE:
     * Claude's ProseMirror ignores preventDefault(). It reads editor state directly.
     * We MUST clear the editor content SYNCHRONOUSLY before Claude can read it.
     */
    const handleKeydown = (event: KeyboardEvent) => {
      console.log(`[Obfusca ${config.name}] Keydown captured, key: ${event.key}, eventPhase: ${event.eventPhase}, inputConnected=${document.contains(input)}`);

      // Check if this key combo should trigger submission
      const shouldSubmit = config.isSubmitKeyCombo
        ? config.isSubmitKeyCombo(event)
        : event.key === 'Enter' && !event.shiftKey;

      if (!shouldSubmit) {
        return; // Not a submit key, let it through
      }

      console.log(`[Obfusca ${config.name}] Submit key combo detected (key=${event.key}, shift=${event.shiftKey}, meta=${event.metaKey}, ctrl=${event.ctrlKey})`);

      // Get the content BEFORE any blocking decision
      const text = config.getContent(input);

      // SYNCHRONOUS DECISION: Block or allow?
      const shouldBlock = shouldBlockEventSync(input);

      if (shouldBlock) {
        // BLOCK THE EVENT IMMEDIATELY - before ProseMirror can process it
        console.log(`[Obfusca ${config.name}] BLOCKING EVENT SYNCHRONOUSLY`);
        stopEventCompletely(event);

        // NUCLEAR: Only for Claude - clear the editor content immediately
        // This is the ONLY reliable way to prevent submission on Claude.ai
        if (needsNuclearBlocking(input)) {
          console.log('[Obfusca Claude] Using nuclear blocking (clear editor)');
          nuclearClearEditor(input, text);
        } else {
          console.log(`[Obfusca ${config.name}] Using standard blocking (preventDefault only)`);
        }

        // Now trigger async analysis (event is already blocked, editor may be cleared)
        if (!state.isAnalyzing && !isAnyPopupVisible()) {
          state.blockPendingAnalysis = true;
          const currentButton = config.getSubmitButton();
          // Fire and forget - the result will show overlay or allow submission
          handleSubmissionAttemptWithNuclear(input, currentButton, event, text).finally(() => {
            state.blockPendingAnalysis = false;
          });
        }
        return;
      }

      // Allow the event - user approved or quick check passed
      console.log(`[Obfusca ${config.name}] Allowing event through`);
      // NOTE: Do NOT reset allowNextSubmit here. The flag must persist through
      // the full event chain (click → form submit) so that async handlers like
      // handleSubmissionAttempt also see it. It's auto-reset by triggerSubmit().
    };

    boundHandlers.keydown = handleKeydown;
    input.addEventListener('keydown', boundHandlers.keydown, { capture: true });
    console.log('[Obfusca] Keydown listener attached to input successfully');

    // For ProseMirror editors (contenteditable), also add document-level listener
    // This catches events that ProseMirror might handle before they reach the input
    if (input.getAttribute('contenteditable') === 'true' || input.classList.contains('ProseMirror')) {
      console.log('[Obfusca] Detected contenteditable/ProseMirror, adding document-level keydown listener');
      console.log(`[Obfusca ${config.name}] Adding beforeinput listener for additional protection`);

      /**
       * Document-level keydown handler - catches events that bubble up.
       * Same synchronous blocking strategy, with nuclear blocking only for Claude.
       */
      boundHandlers.documentKeydown = (event: KeyboardEvent) => {
        // Only intercept if the event target is within our input element
        const target = event.target as HTMLElement;
        if (!input.contains(target) && target !== input) {
          return;
        }

        console.log(`[Obfusca ${config.name}] Document keydown captured, key: ${event.key}, eventPhase: ${event.eventPhase}`);

        // Check if this key combo should trigger submission
        const shouldSubmit = config.isSubmitKeyCombo
          ? config.isSubmitKeyCombo(event)
          : event.key === 'Enter' && !event.shiftKey;

        if (!shouldSubmit) {
          return;
        }

        console.log(`[Obfusca ${config.name}] Document-level submit key detected (key=${event.key})`);

        // Get the content BEFORE any blocking decision
        const text = config.getContent(input);

        // SYNCHRONOUS DECISION: Block or allow?
        const shouldBlock = shouldBlockEventSync(input);

        if (shouldBlock) {
          console.log(`[Obfusca ${config.name}] BLOCKING EVENT (document level) SYNCHRONOUSLY`);
          stopEventCompletely(event);

          // NUCLEAR: Only for Claude - clear the editor content immediately
          if (needsNuclearBlocking(input)) {
            console.log('[Obfusca Claude] Using nuclear blocking (clear editor)');
            nuclearClearEditor(input, text);
          } else {
            console.log(`[Obfusca ${config.name}] Using standard blocking (preventDefault only)`);
          }

          // Trigger async analysis if not already running
          if (!state.isAnalyzing && !isAnyPopupVisible()) {
            state.blockPendingAnalysis = true;
            const currentButton = config.getSubmitButton();
            handleSubmissionAttemptWithNuclear(input, currentButton, event, text).finally(() => {
              state.blockPendingAnalysis = false;
            });
          }
          return;
        }

        console.log(`[Obfusca ${config.name}] Allowing document-level event through`);
        // NOTE: Do NOT reset allowNextSubmit here — same reason as keydown handler.
      };

      window.addEventListener('keydown', boundHandlers.documentKeydown, { capture: true });
      console.log('[Obfusca] Window-level keydown listener attached successfully');

      // Also intercept beforeinput events for ProseMirror
      // This is another entry point where ProseMirror processes "Enter" actions
      const beforeInputHandler = (event: InputEvent) => {
        // insertParagraph or insertLineBreak indicate Enter key was pressed
        if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
          console.log(`[Obfusca ${config.name}] beforeinput captured: ${event.inputType}, eventPhase: ${event.eventPhase}`);

          // Get the content BEFORE any blocking decision
          const text = config.getContent(input);

          const shouldBlock = shouldBlockEventSync(input);

          if (shouldBlock) {
            console.log(`[Obfusca ${config.name}] BLOCKING beforeinput event SYNCHRONOUSLY`);
            stopEventCompletely(event);

            // NUCLEAR: Only for Claude - clear the editor content immediately
            if (needsNuclearBlocking(input)) {
              console.log('[Obfusca Claude] Using nuclear blocking (clear editor)');
              nuclearClearEditor(input, text);
            } else {
              console.log(`[Obfusca ${config.name}] Using standard blocking (preventDefault only)`);
            }

            // CRITICAL: Also trigger async analysis if not already running
            // Without this, the user gets stuck with no feedback
            if (!state.isAnalyzing && !isAnyPopupVisible()) {
              console.log(`[Obfusca ${config.name}] beforeinput: Triggering async analysis`);
              state.blockPendingAnalysis = true;
              const currentButton = config.getSubmitButton();
              handleSubmissionAttemptWithNuclear(input, currentButton, event, text).finally(() => {
                state.blockPendingAnalysis = false;
              });
            }
            return;
          }
        }
      };

      // Store for cleanup
      boundHandlers.beforeInput = beforeInputHandler;
      input.addEventListener('beforeinput', beforeInputHandler, { capture: true });
      window.addEventListener('beforeinput', beforeInputHandler, { capture: true });
      console.log('[Obfusca] beforeinput listeners attached for ProseMirror protection');
    }

    // Escape key: dismiss the analysis indicator if scanning is in progress
    // (i.e. indicator is showing but popup hasn't appeared yet).
    const escapeHandler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (state.blockPendingAnalysis) {
        removeAnalysisIndicator();
      }
    };
    document.addEventListener('keydown', escapeHandler, { capture: false });
    // Store the escape handler for cleanup alongside the other listeners.
    // We reuse the formSubmit slot pattern — store on the input element itself
    // so removeListeners() can reach it.
    (input as any).__obfuscaEscapeHandler = escapeHandler;
  }

  /**
   * Shared handler for all submit button events (mousedown, pointerdown, click, touchstart).
   * ChatGPT fires submission on mousedown/pointerdown BEFORE click — we must intercept early.
   * Uses synchronous blocking strategy like keyboard handler.
   */
  function handleSubmitButtonEvent(event: Event, input: HTMLElement, button: HTMLElement): void {
    console.log(`[Obfusca ${config.name}] Submit button event: ${event.type}, inputConnected=${document.contains(input)}, buttonConnected=${document.contains(button)}`);

    // During the file-restore-then-send-text window, suppress stray submit
    // button events. After restoreFilesAndDispatch(), Perplexity re-renders
    // (the submit button DOM may change), causing pointerdown/click events
    // to fire BEFORE sendChat() injects the protected text. These must be
    // silently killed — not routed to the nuclear handler, which would see
    // stale text and log "Same text as last analysis, keeping content cleared",
    // potentially corrupting state for the real submission that follows.
    if (state.fileRestoreInProgress) {
      console.log(`[Obfusca ${config.name}] SUPPRESSING ${event.type} - file restore in progress`);
      stopEventCompletely(event);
      return;
    }

    // DIAGNOSTIC: If either element is detached from DOM, our closure is stale
    if (!document.contains(input)) {
      console.error(`[Obfusca ${config.name}] STALE INPUT - element detached from DOM, cannot intercept`);
      return; // Don't try to intercept with stale elements
    }

    // Get the content BEFORE any blocking decision
    const text = config.getContent(input);

    // SYNCHRONOUS DECISION: Block or allow?
    const shouldBlock = shouldBlockEventSync(input);

    if (shouldBlock) {
      console.log(`[Obfusca ${config.name}] BLOCKING submit button ${event.type} SYNCHRONOUSLY`);
      stopEventCompletely(event);

      // NUCLEAR: Only for Claude - clear the editor content immediately
      if (needsNuclearBlocking(input)) {
        console.log('[Obfusca Claude] Using nuclear blocking (clear editor)');
        nuclearClearEditor(input, text);
      } else {
        console.log(`[Obfusca ${config.name}] Using standard blocking (preventDefault only)`);
      }

      // Trigger async analysis if not already running
      if (!state.isAnalyzing && !isAnyPopupVisible()) {
        state.blockPendingAnalysis = true;
        handleSubmissionAttemptWithNuclear(input, button, event, text).finally(() => {
          state.blockPendingAnalysis = false;
        });
      }
      return;
    }

    console.log(`[Obfusca ${config.name}] Allowing submit button ${event.type} through`);
    // NOTE: Do NOT reset allowNextSubmit here — same reason as keydown handler.
  }

  /**
   * Set up listeners on submit button.
   * CRITICAL: Intercepts mousedown/pointerdown/touchstart IN ADDITION to click.
   * ChatGPT (and possibly other sites) fire submission on mousedown/pointerdown
   * which happen BEFORE click. Our click-only listener was too late.
   */
  function setupSubmitButtonListener(button: HTMLElement, input: HTMLElement): void {
    console.log(`[Obfusca] Attaching submit button listeners to: ${button.tagName}#${button.id || '(no id)'}`);

    // mousedown fires before click — ChatGPT uses this
    boundHandlers.submitMousedown = (event: MouseEvent) => {
      handleSubmitButtonEvent(event, input, button);
    };
    button.addEventListener('mousedown', boundHandlers.submitMousedown, { capture: true });

    // pointerdown fires before mousedown — some frameworks use this
    boundHandlers.submitPointerdown = (event: PointerEvent) => {
      handleSubmitButtonEvent(event, input, button);
    };
    button.addEventListener('pointerdown', boundHandlers.submitPointerdown, { capture: true });

    // touchstart for mobile
    boundHandlers.submitTouchstart = (event: TouchEvent) => {
      handleSubmitButtonEvent(event, input, button);
    };
    button.addEventListener('touchstart', boundHandlers.submitTouchstart, { capture: true });

    // click as fallback (some submissions may only use click)
    boundHandlers.submitClick = (event: MouseEvent) => {
      handleSubmitButtonEvent(event, input, button);
    };
    button.addEventListener('click', boundHandlers.submitClick, { capture: true });

    console.log('[Obfusca] Submit button listeners attached (mousedown + pointerdown + touchstart + click)');
  }

  /**
   * Set up form submit listener as a fallback.
   */
  function setupFormListener(input: HTMLElement): void {
    const form = input.closest('form');
    if (form) {
      console.log(`[Obfusca] Attaching submit listener to form: ${form.id || '(no id)'}`);

      boundHandlers.formSubmit = async (event: SubmitEvent) => {
        console.log('[Obfusca] Form submit event detected');
        const currentButton = config.getSubmitButton();
        const allowed = await handleSubmissionAttempt(input, currentButton, event);
        if (!allowed) {
          event.preventDefault();
          event.stopPropagation();
        }
      };

      form.addEventListener('submit', boundHandlers.formSubmit, { capture: true });
      console.log('[Obfusca] Form submit listener attached successfully');
    } else {
      console.log('[Obfusca] No form found for input element');
    }
  }

  /**
   * Remove all event listeners.
   */
  function removeListeners(): void {
    if (inputElement && boundHandlers.keydown) {
      inputElement.removeEventListener('keydown', boundHandlers.keydown, { capture: true });
    }

    if (boundHandlers.documentKeydown) {
      window.removeEventListener('keydown', boundHandlers.documentKeydown, { capture: true });
    }

    // Remove beforeinput listeners (added for ProseMirror protection)
    if (boundHandlers.beforeInput) {
      if (inputElement) {
        inputElement.removeEventListener('beforeinput', boundHandlers.beforeInput as EventListener, { capture: true });
      }
      window.removeEventListener('beforeinput', boundHandlers.beforeInput as EventListener, { capture: true });
    }

    // Remove escape handler (added for analysis indicator dismissal)
    if (inputElement) {
      const escapeHandler = (inputElement as any).__obfuscaEscapeHandler as EventListener | undefined;
      if (escapeHandler) {
        document.removeEventListener('keydown', escapeHandler, { capture: false });
        delete (inputElement as any).__obfuscaEscapeHandler;
      }
    }

    if (submitButton) {
      if (boundHandlers.submitMousedown) {
        submitButton.removeEventListener('mousedown', boundHandlers.submitMousedown, { capture: true });
      }
      if (boundHandlers.submitPointerdown) {
        submitButton.removeEventListener('pointerdown', boundHandlers.submitPointerdown, { capture: true });
      }
      if (boundHandlers.submitTouchstart) {
        submitButton.removeEventListener('touchstart', boundHandlers.submitTouchstart, { capture: true });
      }
      if (boundHandlers.submitClick) {
        submitButton.removeEventListener('click', boundHandlers.submitClick, { capture: true });
      }
    }

    if (inputElement && boundHandlers.formSubmit) {
      const form = inputElement.closest('form');
      if (form) {
        form.removeEventListener('submit', boundHandlers.formSubmit, { capture: true });
      }
    }

    boundHandlers.keydown = undefined;
    boundHandlers.documentKeydown = undefined;
    boundHandlers.beforeInput = undefined;
    boundHandlers.submitMousedown = undefined;
    boundHandlers.submitPointerdown = undefined;
    boundHandlers.submitTouchstart = undefined;
    boundHandlers.submitClick = undefined;
    boundHandlers.formSubmit = undefined;
    listenersAttached = false;
  }

  /**
   * Attempt to find and hook the site's input elements.
   */
  function attemptHook(): boolean {
    console.log(`[Obfusca] Attempting to hook input elements for ${config.name}...`);
    const newInput = config.getInputElement();
    if (!newInput) {
      console.log('[Obfusca] Input element not found yet');
      return false;
    }

    // If we have new elements, remove old listeners first
    if (newInput !== inputElement) {
      console.log('[Obfusca] New input element detected, removing old listeners');
      removeListeners();
      inputElement = newInput;
    }

    if (listenersAttached) {
      console.log('[Obfusca] Listeners already attached, skipping (button will be re-checked by observer)');
      return true;
    }

    console.log(`[Obfusca] Input detected: ${inputElement?.tagName}#${inputElement?.id || '(no id)'}, connected=${document.contains(inputElement)}`);

    // Set up listeners
    setupKeyboardListener(inputElement!);
    setupFormListener(inputElement!);

    const newButton = config.getSubmitButton();
    if (newButton) {
      submitButton = newButton;
      console.log(`[Obfusca] Submit button found: ${submitButton.tagName}#${submitButton.id || '(no id)'}, connected=${document.contains(submitButton)}`);
      setupSubmitButtonListener(submitButton, inputElement!);
    } else {
      console.log('[Obfusca] No submit button found yet — observer will attach when it appears');
    }

    // File interception is handled by the universal system in fileInterception.ts

    listenersAttached = true;
    console.log(`[Obfusca] Successfully hooked ${config.name} - all listeners attached`);
    return true;
  }

  /**
   * Initialize the interceptor.
   */
  function init(): void {
    console.log(`Obfusca [${config.name}]: Initializing on`, window.location.hostname);

    // Shared mutation handler: re-hook input if changed, re-hook button if changed
    const handleMutation = () => {
      if (!listenersAttached) {
        attemptHook();
        return;
      }

      // Re-hook if input element changed (React re-render, SPA navigation)
      const currentInput = config.getInputElement();
      if (currentInput && currentInput !== inputElement) {
        console.log('[Obfusca] Input element changed (React re-render?), re-hooking');
        attemptHook();
        return;
      }

      // CRITICAL: Re-hook submit button if it changed.
      // ChatGPT (and other React apps) may re-render the button DOM element,
      // orphaning our event listeners on the old detached node.
      // Also handles the case where button wasn't found during initial hook.
      if (inputElement) {
        const currentButton = config.getSubmitButton();
        if (currentButton && currentButton !== submitButton) {
          console.log(`[Obfusca] Submit button changed (old=${submitButton?.tagName || 'null'}, new=${currentButton.tagName}), re-attaching listeners`);
          // Remove old button listeners
          if (submitButton) {
            if (boundHandlers.submitMousedown) submitButton.removeEventListener('mousedown', boundHandlers.submitMousedown, { capture: true });
            if (boundHandlers.submitPointerdown) submitButton.removeEventListener('pointerdown', boundHandlers.submitPointerdown, { capture: true });
            if (boundHandlers.submitTouchstart) submitButton.removeEventListener('touchstart', boundHandlers.submitTouchstart, { capture: true });
            if (boundHandlers.submitClick) submitButton.removeEventListener('click', boundHandlers.submitClick, { capture: true });
          }
          submitButton = currentButton;
          setupSubmitButtonListener(submitButton, inputElement);
        }
      }
    };

    // Initial attempt to hook
    if (!attemptHook()) {
      // Site loads dynamically, so observe DOM changes
      observer = createDOMObserver({
        onMutation: handleMutation,
        debounceMs: 100,
      });
      observer.start();
    } else {
      // Still observe for SPA navigation / DOM updates
      observer = createDOMObserver({
        onMutation: handleMutation,
        debounceMs: 100,
      });
      observer.start();
    }

    // Watch for URL changes in SPA
    urlWatcherCleanup = watchURLChanges((newURL, oldURL) => {
      console.log(`Obfusca [${config.name}]: URL changed from ${oldURL} to ${newURL}`);
      cleanupAfterSubmission(); // Full state reset on navigation
      resetAllowedFiles(); // Also clear file allowances (cleanupAfterSubmission doesn't)
      removeDetectionPopup();
      removeBlockOverlay();
      removeRedactOverlay();
      hideFileOverlay();
      // Re-attempt hook on navigation
      setTimeout(() => attemptHook(), 100);
    });
  }

  /**
   * Cleanup all resources.
   */
  function cleanup(): void {
    removeListeners();
    observer?.stop();
    observer = null;
    urlWatcherCleanup?.();
    urlWatcherCleanup = null;
    removeDetectionPopup();
    removeBlockOverlay();
    removeRedactOverlay();
    hideFileOverlay();
    discardSavedContent(); // Discard any saved nuclear content
    inputElement = null;
    submitButton = null;
    state.pendingObfuscatedText = null;
  }

  // Auto-initialize
  init();

  return {
    config,
    get inputElement() { return inputElement; },
    get submitButton() { return submitButton; },
    get observer() { return observer as MutationObserver | null; },
    get listenersAttached() { return listenersAttached; },
    cleanup,
  };
}
