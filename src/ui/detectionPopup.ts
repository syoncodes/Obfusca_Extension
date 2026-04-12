/**
 * Unified Detection Popup UI component for Obfusca.
 *
 * Enterprise-grade, shadcn-inspired dark design with zinc-based palette.
 * Renders a contextual popover positioned near the chat input field with
 * a side-by-side CSS Grid layout (detection list | live preview).
 *
 * Simplified action model (3 actions):
 *  - block: Must redact ALL items before sending. Checkboxes locked on.
 *           Buttons: "Send Protected" + "Edit Message"
 *  - warn:  User CAN choose to redact OR send original. Checkboxes toggleable.
 *           Buttons: "Send Protected" + "Edit Message" + "Send Anyway"
 *  - allow: No popup shown. Detection logged silently for admin.
 *
 * Redaction UI is built INTO both block and warn -- it is not a separate mode.
 * File detections still use the legacy block-only display.
 */

import type { Detection } from '../detection';
import {
  OBFUSCA_STYLES,
  escapeHtml,
  ICON_X,
  ICON_CHECK,
  ICON_ENTER,
  ICON_FILE,
  ICON_DOWNLOAD,
  ICON_SPINNER,
  injectAnimationStyles,
} from './styles';
import { generateProtectedText } from './protectedText';
import { setBypassFlag } from '../core/interceptor';
import { generateDummiesBatch, logBypassEvent, logWarnEvent, sha256Hash, getSourceFromUrl } from '../api';
import type { BatchDetectionItem, BypassDetectionItem, BypassFileItem, BypassEventPayload, WarnEventPayload } from '../api';
import { detectFileType, getGenericIcon } from './icons';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POPUP_ID = 'obfusca-detection-popup';
const POPUP_ANIMATION_NAME = 'obfusca-popup-enter';
const POPUP_ANIMATION_OUT_NAME = 'obfusca-popup-exit';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ReplacementMode = 'masked' | 'dummy' | 'custom';

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
  /** Format-preserving X-mask (e.g., '$X.XM', 'Xxxx Xxxxx') */
  masked_value: string;
  /** Realistic fake value (e.g., '$100,000', 'Jane Doe') */
  dummy_value: string;
  original?: string;
  display_name?: string | null;
  replacement?: string | null;
  auto_redact?: boolean;
  /** original_value is excluded from backend serialization for security */
  original_value?: string | null;
}

/** Tracks per-mapping redaction choices in the popup */
export interface RedactionChoice {
  index: number;
  enabled: boolean;
  replacementText: string;
  mode: ReplacementMode;
}

export interface ObfuscationData {
  obfuscated_text: string;
  mappings: MappingItem[];
}

export interface FileDetectionGroup {
  fileName: string;
  detections: Array<{ type: string; displayName: string; count: number }>;
  isClean: boolean;
}

export interface DetectionPopupOptions {
  /**
   * Simplified action model:
   *  - 'block': Must redact everything. No bypass.
   *  - 'warn':  Can redact or send original.
   *  - 'allow': Should not show popup (logged silently).
   *
   * Legacy 'redact' values are treated as 'warn'.
   */
  action: 'block' | 'warn' | 'redact' | 'allow';

  /** Text detections (from interceptor) */
  detections: Detection[];

  /** Obfuscation data -- required for block and warn to show redaction UI */
  obfuscation?: ObfuscationData;

  /** File detections (from file interception) */
  fileDetections?: FileDetectionGroup[];

  /** For monitor/warn mode */
  simulated?: boolean;
  wouldHaveBlocked?: boolean;
  message?: string;

  /** The original message text (used for live preview) */
  originalText?: string;

  // -- File protection mode --
  /** True when showing a file with obfuscation data for download protection */
  fileProtectionMode?: boolean;
  /** Original file name for display */
  fileName?: string;
  /** Original file base64 for sending to /files/protect */
  fileBase64?: string;
  /** Extracted text from file for live preview */
  extractedText?: string;

  // -- Callbacks --
  onEdit: () => void;
  onSendOriginal: () => void;
  onSendProtected?: (text: string) => void;
  onRemoveFiles?: () => void;
  /** Called when user clicks "Download Protected Version" with replacement pairs */
  onDownloadProtected?: (choices: Array<{ original_value: string; replacement: string }>) => Promise<void> | void;
  /** Called when user clicks "Send Protected" in file mode -- injects protected file */
  onSendFileProtected?: (choices: Array<{ original_value: string; replacement: string }>) => Promise<void>;
  onDismiss: () => void;

  /** Element to position the popup above */
  anchorElement: HTMLElement;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Truncate a string to maxLen characters, adding ellipsis */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '\u2026';
}

/** Normalize action: map legacy 'redact' to 'warn' */
function normalizeAction(action: DetectionPopupOptions['action']): 'block' | 'warn' | 'allow' {
  if (action === 'redact') return 'warn';
  return action as 'block' | 'warn' | 'allow';
}

/**
 * Resolve the original sensitive value for a mapping item.
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

/** Map severity to badge variant */
function severityToVariant(severity: string): 'destructive' | 'warning' | 'info' | 'default' {
  switch (severity) {
    case 'critical': case 'high': return 'destructive';
    case 'medium': return 'warning';
    case 'low': return 'info';
    default: return 'default';
  }
}

// ---------------------------------------------------------------------------
// Effective popup mode (block vs warn)
// ---------------------------------------------------------------------------

/**
 * Determine the effective popup mode for a set of items.
 * If ANY item has action 'block', the whole popup behaves as block mode
 * (two-step confirmation, red styling). Otherwise it's warn mode
 * (single-click send-anyway, amber styling).
 */
function getEffectivePopupMode(items: FlaggedItem[]): 'block' | 'warn' {
  for (const item of items) {
    if (item.response && item.response.action === 'block') {
      return 'block';
    }
  }
  return 'warn';
}

// ---------------------------------------------------------------------------
// Bypass confirmation dialog
// ---------------------------------------------------------------------------

const BYPASS_CONFIRM_ID = 'obfusca-bypass-confirm';

/**
 * Build a summary of detections grouped by type and severity for the
 * confirmation dialog. Works for both single-item and multi-item flows.
 */
function buildDetectionSummary(
  detections: Detection[],
  mappings?: MappingItem[],
  fileDetections?: FileDetectionGroup[],
): { byType: Record<string, number>; bySeverity: Record<string, number>; total: number; hasFiles: boolean } {
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  let total = 0;

  // From detections array
  for (const d of detections) {
    const typeName = d.displayName || d.type;
    byType[typeName] = (byType[typeName] || 0) + 1;
    bySeverity[d.severity] = (bySeverity[d.severity] || 0) + 1;
    total++;
  }

  // From mappings (if provided and detections is empty -- multi-item uses mappings)
  if (mappings && total === 0) {
    for (const m of mappings) {
      const typeName = m.display_name || m.type;
      byType[typeName] = (byType[typeName] || 0) + 1;
      bySeverity[m.severity] = (bySeverity[m.severity] || 0) + 1;
      total++;
    }
  }

  // Files
  let hasFiles = false;
  if (fileDetections && fileDetections.length > 0) {
    hasFiles = true;
    for (const fg of fileDetections) {
      if (!fg.isClean) {
        for (const det of fg.detections) {
          byType[det.displayName] = (byType[det.displayName] || 0) + det.count;
          total += det.count;
        }
      }
    }
  }

  return { byType, bySeverity, total, hasFiles };
}

/**
 * Show a two-step bypass confirmation dialog inside the existing popup.
 *
 * The dialog overlays the popup content with a warning and a summary of
 * what will be sent unprotected. Only an explicit click on
 * "Yes, send unprotected" confirms -- Enter key is deliberately ignored
 * and Escape returns to the popup.
 *
 * @returns A promise that resolves to true if confirmed, false if cancelled.
 */
function showBypassConfirmation(
  parentElement: HTMLElement,
  summary: { byType: Record<string, number>; bySeverity: Record<string, number>; total: number; hasFiles: boolean },
): Promise<boolean> {
  return new Promise((resolve) => {
    // Remove any existing confirmation
    parentElement.querySelector('#' + BYPASS_CONFIRM_ID)?.remove();

    const S = OBFUSCA_STYLES;

    // Build detection summary list
    const summaryItems = Object.entries(summary.byType)
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => `
        <div style="
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 0;
          font-size: 13px;
          color: ${S.colors.foreground};
        ">
          <span style="
            width: 6px;
            height: 6px;
            background: ${S.colors.destructive};
            border-radius: 50%;
            flex-shrink: 0;
          "></span>
          ${count} ${escapeHtml(type)}${count > 1 ? 's' : ''}
        </div>
      `).join('');

    const fileWarning = summary.hasFiles ? `
      <div style="
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 0;
        font-size: 13px;
        color: ${S.colors.foreground};
      ">
        <span style="
          width: 6px;
          height: 6px;
          background: ${S.colors.warning};
          border-radius: 50%;
          flex-shrink: 0;
        "></span>
        File(s) with sensitive data
      </div>
    ` : '';

    const overlay = document.createElement('div');
    overlay.id = BYPASS_CONFIRM_ID;
    overlay.style.cssText = `
      position: absolute;
      inset: 0;
      z-index: 100;
      background: ${S.colors.card};
      border-radius: inherit;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    overlay.innerHTML = `
      <!-- Header -->
      <div style="
        padding: 20px 24px 16px;
        border-bottom: 1px solid ${S.colors.border};
        background: linear-gradient(135deg, ${S.colors.destructive}15, transparent);
      ">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="
            width: 40px;
            height: 40px;
            background: ${S.colors.destructive}20;
            border-radius: ${S.radius.lg};
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${S.colors.destructive}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div>
            <h3 style="
              margin: 0;
              font-size: 16px;
              font-weight: 600;
              color: ${S.colors.foreground};
              letter-spacing: -0.02em;
            ">Send without protection?</h3>
          </div>
        </div>
      </div>

      <!-- Body -->
      <div style="padding: 16px 24px; flex: 1; overflow-y: auto;">
        <p style="
          margin: 0 0 16px;
          font-size: 13px;
          color: ${S.colors.mutedForeground};
          line-height: 1.5;
        ">
          This will send your message with all detected sensitive data unprotected.
          This action will be logged for review.
        </p>

        <div style="
          background: ${S.colors.background};
          border: 1px solid ${S.colors.border};
          border-radius: ${S.radius.md};
          padding: 12px 16px;
        ">
          <div style="
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: ${S.colors.mutedForeground};
            margin-bottom: 8px;
          ">Detected</div>
          ${summaryItems}
          ${fileWarning}
        </div>
      </div>

      <!-- Footer -->
      <div style="
        padding: 12px 24px;
        border-top: 1px solid ${S.colors.border};
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
      ">
        <button id="obfusca-bypass-cancel" style="
          padding: 8px 16px;
          background: transparent;
          color: ${S.colors.mutedForeground};
          border: 1px solid ${S.colors.border};
          border-radius: ${S.radius.md};
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: background ${S.transitions.fast}, color ${S.transitions.fast};
          font-family: ${S.fonts.sans};
        ">Cancel</button>
        <button id="obfusca-bypass-confirm-btn" style="
          padding: 8px 16px;
          background: ${S.colors.destructive};
          color: #FFFFFF;
          border: none;
          border-radius: ${S.radius.md};
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity ${S.transitions.fast};
          font-family: ${S.fonts.sans};
        ">Yes, send unprotected</button>
      </div>
    `;

    parentElement.appendChild(overlay);

    // Track whether we've resolved already
    let resolved = false;
    function finish(confirmed: boolean) {
      if (resolved) return;
      resolved = true;
      overlay.remove();
      document.removeEventListener('keydown', keyHandler, true);
      resolve(confirmed);
    }

    // Cancel button
    overlay.querySelector('#obfusca-bypass-cancel')?.addEventListener('click', () => {
      finish(false);
    });

    // Confirm button -- explicit click only
    overlay.querySelector('#obfusca-bypass-confirm-btn')?.addEventListener('click', () => {
      finish(true);
    });

    // Hover effects
    const cancelBtn = overlay.querySelector('#obfusca-bypass-cancel') as HTMLElement;
    if (cancelBtn) {
      cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.background = S.colors.secondary;
        cancelBtn.style.color = S.colors.foreground;
      });
      cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.background = 'transparent';
        cancelBtn.style.color = S.colors.mutedForeground;
      });
    }

    const confirmBtn = overlay.querySelector('#obfusca-bypass-confirm-btn') as HTMLElement;
    if (confirmBtn) {
      confirmBtn.addEventListener('mouseenter', () => {
        confirmBtn.style.opacity = '0.85';
      });
      confirmBtn.addEventListener('mouseleave', () => {
        confirmBtn.style.opacity = '1';
      });
    }

    // Keyboard: Escape cancels, Enter does NOT confirm (explicit click only)
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        finish(false);
      }
      // Block Enter from propagating so it doesn't trigger confirm
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };
    document.addEventListener('keydown', keyHandler, true);

    // Focus the cancel button (safe default)
    cancelBtn?.focus();
  });
}

/**
 * Build and fire the bypass event payload asynchronously.
 * This collects detection details and sends to POST /events/bypass.
 * Fire-and-forget -- does not block the send.
 */
function fireBypassEvent(
  detections: Detection[],
  mappings: MappingItem[] | undefined,
  originalText: string | undefined,
  fileDetections?: FileDetectionGroup[],
): void {
  const source = getSourceFromUrl(window.location.href);

  // Determine content_type
  const hasText = !!originalText;
  const hasFiles = fileDetections ? fileDetections.some(f => !f.isClean) : false;
  const content_type: 'text' | 'file' | 'text_and_file' =
    hasText && hasFiles ? 'text_and_file' :
    hasFiles ? 'file' : 'text';

  // Build by_type and by_severity summaries
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const bypassed: BypassDetectionItem[] = [];

  for (const d of detections) {
    byType[d.type] = (byType[d.type] || 0) + 1;
    bySeverity[d.severity] = (bySeverity[d.severity] || 0) + 1;

    // Extract the raw value from the original text if we have positions
    let value = '';
    let context = '';
    if (originalText && typeof d.start === 'number' && typeof d.end === 'number') {
      value = originalText.slice(d.start, d.end);
      const ctxStart = Math.max(0, d.start - 30);
      const ctxEnd = Math.min(originalText.length, d.end + 30);
      context = originalText.slice(ctxStart, ctxEnd);
    }

    // Find the corresponding mapping to get the replacement value
    const mapping = mappings?.find(
      m => m.type === d.type && m.start === d.start && m.end === d.end
    );

    bypassed.push({
      type: d.type,
      label: d.displayName || d.type,
      value,
      severity: d.severity,
      confidence: d.confidence,
      replacement: mapping?.placeholder || `[${(d.displayName || d.type).toUpperCase()}]`,
      context,
    });
  }

  // Also gather from mappings if detections was empty (multi-item case)
  if (detections.length === 0 && mappings) {
    for (const m of mappings) {
      byType[m.type] = (byType[m.type] || 0) + 1;
      bySeverity[m.severity] = (bySeverity[m.severity] || 0) + 1;

      let value = m.original_value || '';
      if (!value && originalText && typeof m.start === 'number' && typeof m.end === 'number') {
        value = originalText.slice(m.start, m.end);
      }

      bypassed.push({
        type: m.type,
        label: m.display_name || m.type,
        value,
        severity: m.severity,
        confidence: 1.0,
        replacement: m.placeholder || `[${(m.display_name || m.type).toUpperCase()}]`,
        context: '',
      });
    }
  }

  // File detections
  const filesBypassed: BypassFileItem[] = [];
  if (fileDetections) {
    for (const fg of fileDetections) {
      if (!fg.isClean) {
        const detCount = fg.detections.reduce((sum, d) => sum + d.count, 0);
        filesBypassed.push({
          filename: fg.fileName,
          detections_count: detCount,
        });
      }
    }
  }

  const totalCount = bypassed.length + filesBypassed.reduce((s, f) => s + f.detections_count, 0);

  // Compute SHA-256 hash asynchronously and send
  const textToHash = originalText || '';
  sha256Hash(textToHash).then((hash) => {
    const payload: BypassEventPayload = {
      source,
      content_type,
      detections_summary: {
        total_count: totalCount,
        by_type: byType,
        by_severity: bySeverity,
      },
      bypassed_detections: bypassed,
      files_bypassed: filesBypassed,
      content_hash: hash,
      timestamp: new Date().toISOString(),
    };

    // Fire and forget
    logBypassEvent(payload);
  }).catch((err) => {
    console.error('[Obfusca Bypass] Failed to compute hash:', err);
  });
}

/**
 * Show a brief "Sent with warnings" toast after a warn-mode send-anyway.
 * Auto-dismisses after 3 seconds.
 */
function showWarnSentToast(): void {
  const S = OBFUSCA_STYLES;
  const TOAST_ID = 'obfusca-warn-sent-toast';

  // Remove any existing toast
  document.getElementById(TOAST_ID)?.remove();

  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    font-family: ${S.fonts.sans};
    animation: obfusca-popup-enter 0.2s ease-out;
  `;

  toast.innerHTML = `
    <div style="
      background: ${S.colors.card};
      border: 1px solid ${S.colors.warning}40;
      border-left: 3px solid ${S.colors.warning};
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 13px;
      color: ${S.colors.foreground};
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      gap: 8px;
    ">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${S.colors.warning}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      Sent with warnings
    </div>
  `;

  document.body.appendChild(toast);

  // Auto-dismiss after 3 seconds
  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }
  }, 3000);
}

/**
 * Build and fire a warn event payload asynchronously.
 * This collects detection summary counts and sends to POST /events/warn.
 * Unlike bypass events, warn events do NOT include raw sensitive values.
 * Fire-and-forget -- does not block the send.
 */
function fireWarnEvent(
  detections: Detection[],
  mappings: MappingItem[] | undefined,
  originalText: string | undefined,
): void {
  const source = getSourceFromUrl(window.location.href);

  // Build by_type and by_severity summaries
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const d of detections) {
    byType[d.type] = (byType[d.type] || 0) + 1;
    bySeverity[d.severity] = (bySeverity[d.severity] || 0) + 1;
  }

  // Also gather from mappings if detections was empty (multi-item case)
  if (detections.length === 0 && mappings) {
    for (const m of mappings) {
      byType[m.type] = (byType[m.type] || 0) + 1;
      bySeverity[m.severity] = (bySeverity[m.severity] || 0) + 1;
    }
  }

  const totalCount = Object.values(byType).reduce((sum, c) => sum + c, 0);

  // Compute SHA-256 hash asynchronously and send
  const textToHash = originalText || '';
  sha256Hash(textToHash).then((hash) => {
    const payload: WarnEventPayload = {
      source,
      detections_summary: {
        total_count: totalCount,
        by_type: byType,
        by_severity: bySeverity,
      },
      content_hash: hash,
      timestamp: new Date().toISOString(),
    };

    // Fire and forget
    logWarnEvent(payload);
  }).catch((err) => {
    console.error('[Obfusca Warn] Failed to compute hash:', err);
  });
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderHeader(action: 'block' | 'warn' | 'allow', hasFileDetections: boolean): string {
  const S = OBFUSCA_STYLES;
  let title: string;
  let subtitle: string;
  let accentColor: string;
  let headerBg: string;

  if (hasFileDetections && action === 'block') {
    title = 'Sensitive Content Blocked';
    subtitle = 'Protect this file before uploading';
    accentColor = S.colors.destructive;
    headerBg = `${S.colors.destructive}14`; // 8% opacity
  } else if (action === 'block') {
    title = 'Sensitive Content Blocked';
    subtitle = 'This content must be protected before sending';
    accentColor = S.colors.destructive;
    headerBg = `${S.colors.destructive}14`;
  } else if (action === 'warn') {
    title = 'Sensitive Content Detected';
    subtitle = 'Review and choose how to protect detected items';
    accentColor = S.colors.info;
    headerBg = `${S.colors.info}0F`; // 6% opacity
  } else {
    title = 'Content Review';
    subtitle = 'Review detected content before proceeding';
    accentColor = S.colors.info;
    headerBg = `${S.colors.info}0A`;
  }

  const shieldIcon = action === 'block'
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <line x1="8" y1="8" x2="16" y2="16"/><line x1="16" y1="8" x2="8" y2="16"/>
      </svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>`;

  return `
    <div style="
      padding: 10px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: ${headerBg};
      border-bottom: 1px solid ${accentColor}20;
      flex-shrink: 0;
    ">
      <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
        <div style="
          width: 30px;
          height: 30px;
          background: ${accentColor}15;
          border-radius: ${S.radius.md};
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: ${accentColor};
        ">
          ${shieldIcon}
        </div>
        <div style="min-width: 0;">
          <div style="
            font-size: 13px;
            font-weight: 600;
            color: ${S.colors.foreground};
            letter-spacing: -0.01em;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          ">${escapeHtml(title)}</div>
          <div style="
            font-size: 11px;
            color: ${S.colors.mutedForeground};
            margin-top: 1px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          ">${escapeHtml(subtitle)}</div>
        </div>
      </div>
      <button id="obfusca-popup-close" aria-label="Close" style="
        background: transparent;
        border: none;
        border-radius: ${S.radius.sm};
        width: 26px;
        height: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: ${S.colors.mutedForeground};
        flex-shrink: 0;
        transition: all ${S.transitions.fast};
      "
        onmouseover="this.style.background='${S.colors.muted}';this.style.color='${S.colors.foreground}'"
        onmouseout="this.style.background='transparent';this.style.color='${S.colors.mutedForeground}'"
      >
        ${ICON_X}
      </button>
    </div>
  `;
}

/** File info bar shown in file protection mode */
function renderFileInfoBar(fileName: string): string {
  return `
    <div style="
      padding: 6px 14px;
      background: ${OBFUSCA_STYLES.colors.background};
      border-bottom: 1px solid ${OBFUSCA_STYLES.colors.border};
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: ${OBFUSCA_STYLES.colors.mutedForeground};
      flex-shrink: 0;
    ">
      <span style="color: ${OBFUSCA_STYLES.colors.mutedForeground};">${ICON_FILE}</span>
      <span style="
        font-weight: 500;
        color: ${OBFUSCA_STYLES.colors.foreground};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      ">${escapeHtml(truncate(fileName, 40))}</span>
    </div>
  `;
}

/**
 * Render the unified redaction list used by BOTH block and warn actions.
 * Designed for the left panel of the side-by-side layout.
 */
function renderRedactionList(
  obfuscation: ObfuscationData,
  action: 'block' | 'warn',
  originalText?: string
): string {
  if (!obfuscation.mappings || obfuscation.mappings.length === 0) return '';

  const S = OBFUSCA_STYLES;
  const isBlock = action === 'block';

  return `
    <div style="padding: 8px 10px;">
      <div style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
      ">
        <div style="
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: ${S.colors.mutedForeground};
        ">${isBlock ? 'Redactions' : 'Redactions'}</div>
        <div style="display: flex; gap: 2px; background: ${S.colors.secondary}; border-radius: 4px; padding: 2px;">
          <button id="obfusca-all-mask-btn" style="
            padding: 3px 8px;
            border-radius: 3px;
            border: none;
            cursor: pointer;
            font-size: 10px;
            font-weight: 500;
            transition: all 0.15s;
            font-family: ${S.fonts.sans};
            background: ${S.colors.info};
            color: #fff;
          " title="Switch all to masked mode">Mask All</button>
          <button id="obfusca-generate-all-btn" style="
            padding: 3px 8px;
            border-radius: 3px;
            border: none;
            cursor: pointer;
            font-size: 10px;
            font-weight: 500;
            transition: all 0.15s;
            font-family: ${S.fonts.sans};
            background: transparent;
            color: ${S.colors.mutedForeground};
          " title="Switch all to dummy mode">Smart Replace</button>
        </div>
      </div>
      <div style="
        display: flex;
        flex-direction: column;
        gap: 4px;
      ">
        ${obfuscation.mappings.map((m, i) => {
          const isChecked = isBlock ? true : (m.auto_redact !== false);
          const displayReplacement = m.masked_value || m.replacement || m.placeholder;
          const severity = m.severity || 'medium';
          const _variant = severityToVariant(severity);
          void _variant;
          return `
          <div class="obfusca-redact-row" data-row-index="${i}" style="
            display: flex;
            flex-direction: column;
            gap: 3px;
            padding: 6px 8px;
            background: ${S.colors.background};
            border: 1px solid ${S.colors.border};
            border-radius: ${S.radius.sm};
            opacity: ${isChecked ? '1' : '0.5'};
            transition: all ${S.transitions.smooth};
            position: relative;
          ">
            <!-- Top row: checkbox, type, original value, mode toggle -->
            <div style="
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 11px;
            ">
              <input type="checkbox" data-mapping-index="${i}"
                ${isChecked ? 'checked' : ''}
                ${isBlock ? 'disabled' : ''}
                style="
                  width: 14px;
                  height: 14px;
                  accent-color: ${S.colors.info};
                  cursor: ${isBlock ? 'not-allowed' : 'pointer'};
                  flex-shrink: 0;
                  margin: 0;
                "
                class="obfusca-redact-checkbox"
                aria-label="Toggle redaction for ${escapeHtml(m.display_name || m.type)}"
              />
              <span style="
                font-size: 9px;
                font-weight: 600;
                text-transform: uppercase;
                padding: 2px 6px;
                border-radius: 3px;
                background: ${S.colors.info}22;
                color: ${S.colors.info};
                letter-spacing: 0.5px;
                flex-shrink: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 160px;
              ">${escapeHtml(m.display_name || m.type.split('__')[0].replace(/_/g, ' '))}</span>
              <span style="
                color: ${S.colors.mutedForeground};
                opacity: 0.6;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-family: ${S.fonts.mono};
                font-size: 10px;
                flex: 1;
                min-width: 0;
              ">${escapeHtml(
                (m.start != null && m.end != null && originalText)
                  ? originalText.substring(m.start, m.end)
                  : (m.original_preview || m.original || '***')
              )}</span>
              <!-- Mode toggle: Mask | Dummy -->
              <div class="obfusca-mode-toggle" data-row-index="${i}" style="
                display: flex;
                background: ${S.colors.card};
                border-radius: 3px;
                padding: 1px;
                gap: 1px;
                flex-shrink: 0;
                border: 1px solid ${S.colors.border};
              ">
                <button class="obfusca-mode-btn" data-mode="masked" data-row-index="${i}" style="
                  width: 20px; height: 18px;
                  border: none;
                  background: ${S.colors.info};
                  color: #fff;
                  font-size: 9px;
                  font-weight: 600;
                  border-radius: 2px 0 0 2px;
                  cursor: pointer;
                  transition: all ${S.transitions.fast};
                  font-family: ${S.fonts.sans};
                ">M</button>
                <button class="obfusca-mode-btn" data-mode="dummy" data-row-index="${i}" style="
                  width: 20px; height: 18px;
                  border: none;
                  background: ${S.colors.secondary};
                  color: ${S.colors.mutedForeground};
                  font-size: 9px;
                  font-weight: 600;
                  border-radius: 0 2px 2px 0;
                  cursor: pointer;
                  transition: all ${S.transitions.fast};
                  font-family: ${S.fonts.sans};
                ">D</button>
              </div>
            </div>
            <!-- Bottom row: replacement preview -->
            <div class="obfusca-replacement-code" data-row-index="${i}" style="
              margin-left: 22px;
              padding: 3px 8px;
              background: rgba(168, 85, 247, 0.15);
              border: 1px solid rgba(168, 85, 247, 0.3);
              border-radius: 3px;
              font-size: 10px;
              font-family: ${S.fonts.mono};
              color: ${S.colors.foreground};
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              transition: all ${S.transitions.smooth};
            ">&rarr; ${escapeHtml(displayReplacement)}</div>
          </div>
        `}).join('')}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Scrollbar style injection for dark theme
// ---------------------------------------------------------------------------

const SCROLLBAR_STYLE_ID = 'obfusca-codeblock-scrollbar-styles';

function injectScrollbarStyles(): void {
  if (document.getElementById(SCROLLBAR_STYLE_ID)) return;

  const S = OBFUSCA_STYLES;
  const style = document.createElement('style');
  style.id = SCROLLBAR_STYLE_ID;
  style.textContent = `
    .obfusca-code-preview::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .obfusca-code-preview::-webkit-scrollbar-track {
      background: transparent;
    }
    .obfusca-code-preview::-webkit-scrollbar-thumb {
      background: ${S.colors.obscured};
      border-radius: 3px;
    }
    .obfusca-code-preview::-webkit-scrollbar-thumb:hover {
      background: ${S.colors.obscuredText};
    }
    .obfusca-code-preview::-webkit-scrollbar-corner {
      background: transparent;
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Code block preview renderer (VS Code / GitHub style)
// ---------------------------------------------------------------------------

/**
 * Render a VS Code / GitHub style code block preview for the right panel.
 * Used for both text chat previews and file previews.
 *
 * @param content - The text content to display
 * @param fileName - Optional filename for file type detection
 * @param isFileMode - True when rendering a file preview (uses file-preview-content ID)
 */
function renderCodeBlockPreview(
  content: string,
  fileName: string | null,
  isFileMode: boolean
): string {
  const S = OBFUSCA_STYLES;
  const fileType = detectFileType(fileName, !isFileMode && !fileName);
  const previewId = isFileMode ? 'obfusca-file-preview-content' : 'obfusca-preview-text';
  const maxChars = isFileMode ? 3000 : 500;
  const truncatedContent = truncate(content, maxChars);

  // Determine whether to show line numbers:
  // Show for code files with > 1 line and < 500 lines
  const lines = truncatedContent.split('\n');
  const lineCount = lines.length;
  const showLineNumbers = lineCount > 1 && lineCount < 500;

  // Build line-numbered content
  let contentHtml: string;
  if (showLineNumbers) {
    // Calculate gutter width based on digit count
    const digitCount = String(lineCount).length;
    const gutterWidth = Math.max(24, digitCount * 8 + 12);

    const lineRows = lines.map((line, i) => {
      const lineNum = i + 1;
      return `<div style="display: flex; min-height: 18px;">
        <span style="
          display: inline-block;
          width: ${gutterWidth}px;
          min-width: ${gutterWidth}px;
          padding-right: 8px;
          text-align: right;
          color: ${S.colors.obscuredText};
          user-select: none;
          font-size: 10px;
          line-height: 18px;
          opacity: 0.5;
          flex-shrink: 0;
        ">${lineNum}</span>
        <span style="
          flex: 1;
          min-width: 0;
          padding-left: 8px;
          border-left: 1px solid ${S.colors.border};
          line-height: 18px;
        " class="obfusca-code-line" data-line="${lineNum}">${escapeHtml(line) || ' '}</span>
      </div>`;
    }).join('');

    contentHtml = lineRows;
  } else {
    contentHtml = escapeHtml(truncatedContent);
  }

  // Legend dots for masked/dummy highlighting
  const legendHtml = `
    <div style="
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 9px;
      color: ${S.colors.mutedForeground};
    ">
      <span style="display: inline-flex; align-items: center; gap: 3px;">
        <span style="
          width: 6px; height: 6px; border-radius: 1px;
          background: ${S.colors.redactedHighlight};
          border: 1px solid ${S.colors.obscuredText};
          display: inline-block;
        "></span>Masked
      </span>
      <span style="display: inline-flex; align-items: center; gap: 3px;">
        <span style="
          width: 6px; height: 6px; border-radius: 1px;
          background: ${S.colors.dummyHighlight};
          border: 1px solid ${S.colors.magicPrimary};
          display: inline-block;
        "></span>Dummy
      </span>
    </div>
  `;

  // Copy button
  const copyIcon = getGenericIcon('copy');

  return `
    <div style="
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    ">
      <!-- Header bar: icon + filename + language badge + legend + copy -->
      <div style="
        padding: 6px 10px;
        border-bottom: 1px solid ${S.colors.border};
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
        background: ${S.colors.card};
      ">
        <span style="display: flex; align-items: center; flex-shrink: 0;">${fileType.icon}</span>
        <span style="
          font-size: 11px;
          font-weight: 500;
          color: ${S.colors.foreground};
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        ">${escapeHtml(fileName ? (fileName.split('/').pop() || fileName) : fileType.label)}</span>
        <span style="
          padding: 1px 6px;
          font-size: 9px;
          font-weight: 500;
          color: ${S.colors.mutedForeground};
          background: ${S.colors.secondary};
          border-radius: 3px;
          white-space: nowrap;
          flex-shrink: 0;
          letter-spacing: 0.2px;
        ">${escapeHtml(fileType.label)}</span>
        <div style="margin-left: auto; display: flex; align-items: center; gap: 6px;">
          ${legendHtml}
          <button id="obfusca-preview-copy-btn" title="Copy preview content" style="
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border: none;
            background: transparent;
            border-radius: ${S.radius.sm};
            cursor: pointer;
            color: ${S.colors.mutedForeground};
            transition: all ${S.transitions.fast};
            flex-shrink: 0;
          ">${copyIcon}</button>
        </div>
      </div>
      <!-- Code content area -->
      <div id="${previewId}" class="obfusca-code-preview" style="
        flex: 1;
        overflow: auto;
        padding: ${showLineNumbers ? '6px 0' : '8px 12px'};
        font-size: 11px;
        font-family: ${S.fonts.mono};
        color: ${S.colors.mutedForeground};
        white-space: pre-wrap;
        word-break: break-word;
        line-height: ${showLineNumbers ? '18px' : '1.5'};
        transition: opacity ${S.transitions.smooth};
        background: ${S.colors.background};
        tab-size: 4;
      ">${contentHtml}</div>
    </div>
  `;
}

/**
 * Fallback: render detection names when no obfuscation data is available.
 */
function renderFallbackDetections(
  detections: Detection[],
  accentColor: string
): string {
  const S = OBFUSCA_STYLES;
  const grouped = new Map<string, { displayName: string; count: number }>();
  for (const d of detections) {
    const existing = grouped.get(d.displayName);
    if (existing) {
      existing.count++;
    } else {
      grouped.set(d.displayName, { displayName: d.displayName, count: 1 });
    }
  }
  const groups = Array.from(grouped.values()).sort((a, b) => b.count - a.count);

  return `
    <div style="
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 10px;
    ">
      ${groups.map(g => `
        <div style="
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          background: ${S.colors.background};
          border: 1px solid ${S.colors.border};
          border-radius: ${S.radius.sm};
          border-left: 3px solid ${accentColor};
        ">
          <div style="
            font-size: 11px;
            font-weight: 500;
            color: ${S.colors.foreground};
          ">${escapeHtml(g.displayName)}${g.count > 1 ? ` <span style="color: ${S.colors.mutedForeground}; font-weight: 400; font-size: 10px;">(${g.count})</span>` : ''}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderFileDetections(fileDetections: FileDetectionGroup[]): string {
  if (!fileDetections || fileDetections.length === 0) return '';

  const S = OBFUSCA_STYLES;

  return `
    <div style="
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    ">
      ${fileDetections.map(fd => {
        if (fd.isClean) {
          return `
            <div style="
              display: flex;
              align-items: center;
              gap: 6px;
              padding: 6px 8px;
              background: ${S.colors.background};
              border: 1px solid ${S.colors.border};
              border-radius: ${S.radius.sm};
              font-size: 11px;
              color: ${S.colors.mutedForeground};
            ">
              <span style="color: ${S.colors.mutedForeground};">${ICON_FILE}</span>
              <span>${escapeHtml(truncate(fd.fileName, 30))}</span>
              <span style="
                margin-left: auto;
                color: ${S.colors.success};
                font-size: 10px;
                font-weight: 500;
              ">Clean</span>
            </div>
          `;
        }

        const issueCount = fd.detections.reduce((sum, d) => sum + d.count, 0);
        return `
          <div style="
            padding: 6px 8px;
            background: ${S.colors.background};
            border: 1px solid ${S.colors.border};
            border-radius: ${S.radius.sm};
            border-left: 3px solid ${S.colors.destructive};
          ">
            <div style="
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 11px;
              color: ${S.colors.foreground};
              margin-bottom: 4px;
            ">
              <span style="color: ${S.colors.destructive};">${ICON_FILE}</span>
              <span style="font-weight: 500;">${escapeHtml(truncate(fd.fileName, 30))}</span>
              <span style="
                margin-left: auto;
                font-size: 10px;
                color: ${S.colors.destructive};
                font-weight: 500;
              ">${issueCount} issue${issueCount !== 1 ? 's' : ''}</span>
            </div>
            <div style="
              display: flex;
              flex-direction: column;
              gap: 2px;
              padding-left: 20px;
            ">
              ${fd.detections.map(det => `
                <div style="
                  font-size: 10px;
                  color: ${S.colors.mutedForeground};
                  display: flex;
                  align-items: center;
                  gap: 4px;
                ">
                  <span style="color: ${S.colors.obscuredText};">\u2022</span>
                  <span>${escapeHtml(det.displayName)}${det.count > 1 ? ` (${det.count})` : ''}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderFooterActions(
  effectiveAction: 'block' | 'warn' | 'allow',
  hasObfuscation: boolean,
  hasFileDetections: boolean,
  hasTextDetections: boolean,
  fileProtectionMode?: boolean
): string {
  const S = OBFUSCA_STYLES;
  const btnBase = `
    padding: 6px 12px;
    border-radius: ${S.radius.sm};
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all ${S.transitions.base};
    font-family: ${S.fonts.sans};
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    white-space: nowrap;
  `;
  const primaryStyle = `${btnBase}
    background: ${S.colors.foreground};
    color: ${S.colors.background};
    border: none;
  `;
  const secondaryStyle = `${btnBase}
    background: transparent;
    color: ${S.colors.foreground};
    border: 1px solid ${S.colors.border};
  `;
  const dangerOutlineStyle = `${btnBase}
    background: transparent;
    color: ${S.colors.destructive};
    border: 1px solid ${S.colors.destructive}40;
  `;
  const ghostStyle = `${btnBase}
    background: transparent;
    color: ${S.colors.mutedForeground};
    border: none;
  `;
  const disabledPrimaryStyle = `${btnBase}
    background: ${S.colors.foreground};
    color: ${S.colors.background};
    border: none;
    opacity: 0.5;
    cursor: not-allowed;
  `;

  // Build the action buttons based on mode
  let buttonsHtml = '';

  if (fileProtectionMode && hasObfuscation) {
    buttonsHtml = `
      ${effectiveAction !== 'block' ? `<button id="obfusca-popup-send-original" style="${dangerOutlineStyle}">Upload Anyway</button>` : ''}
      <button id="obfusca-popup-remove-files" style="${secondaryStyle}">Remove</button>
      <button id="obfusca-popup-send-file-protected" style="${primaryStyle}">
        ${ICON_ENTER} Send Protected
      </button>
    `;
  } else if (hasFileDetections && !hasTextDetections) {
    buttonsHtml = `
      ${effectiveAction !== 'block' ? `<button id="obfusca-popup-send-original" style="${dangerOutlineStyle}">Upload Anyway</button>` : ''}
      <button id="obfusca-popup-remove-files" style="${primaryStyle}">Remove Flagged</button>
    `;
  } else if (effectiveAction === 'block') {
    buttonsHtml = `
      <button id="obfusca-popup-edit" style="${secondaryStyle}">Edit Message</button>
      <button id="obfusca-popup-send-protected" style="${hasObfuscation ? primaryStyle : disabledPrimaryStyle}"${hasObfuscation ? '' : ' disabled'}>
        ${ICON_ENTER} Send Protected
      </button>
    `;
  } else if (effectiveAction === 'warn') {
    buttonsHtml = `
      <button id="obfusca-popup-send-original" style="${dangerOutlineStyle}">Send Anyway</button>
      <button id="obfusca-popup-edit" style="${secondaryStyle}">Edit Message</button>
      <button id="obfusca-popup-send-protected" style="${hasObfuscation ? primaryStyle : disabledPrimaryStyle}"${hasObfuscation ? '' : ' disabled'}>
        ${ICON_ENTER} Send Protected
      </button>
    `;
  } else {
    buttonsHtml = `
      <button id="obfusca-popup-edit" style="${secondaryStyle}">Edit</button>
      <button id="obfusca-popup-send-original" style="${primaryStyle}">Send Anyway</button>
    `;
  }

  // Save Copy button for file protection
  const saveCopyHtml = fileProtectionMode ? `
    <button id="obfusca-popup-save-copy" style="${ghostStyle}">
      ${ICON_DOWNLOAD} Save Copy
    </button>
  ` : '';

  return `
    <div style="
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px;
      border-top: 1px solid ${S.colors.border};
      flex-shrink: 0;
    ">
      <div style="display: flex; align-items: center; gap: 6px;">
        <div style="
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          color: ${S.colors.mutedForeground};
          letter-spacing: 0.2px;
        ">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Protected by Obfusca
        </div>
        <span style="
          font-size: 9px;
          color: ${S.colors.mutedForeground};
          opacity: 0.5;
          margin-left: 4px;
        ">Enter to protect · Esc to edit</span>
        ${saveCopyHtml}
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        ${buttonsHtml}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Preview update helper
// ---------------------------------------------------------------------------

const _dummyRowFlags: Map<number, boolean> = new Map();
let _tokenMap: Map<number, string> = new Map();

// ---------------------------------------------------------------------------
// Local fallback dummies
// ---------------------------------------------------------------------------

const LOCAL_FALLBACK_DUMMIES: Record<string, string> = {
  ssn: '123-45-6789',
  credit_card: '4111-1111-1111-1111',
  phone: '(555) 123-4567',
  email: 'user@example.com',
  money: '$100,000',
  monetary: '$100,000',
  amount: '$100,000',
  salary: '$100,000',
  name: 'Jane Doe',
  person_name: 'Jane Doe',
  full_name: 'Jane Doe',
  patient_name: 'Jane Doe',
  employee_name: 'Jane Doe',
  address: '123 Example St, Anytown, ST 12345',
  date: '01/01/2000',
  date_of_birth: '01/01/2000',
  aws_key: 'AKIAIOSFODNN7EXAMPLE',
  api_key: 'sk-example1234567890abcdef',
  jwt: 'eyJhbGciOiJIUzI1NiJ9.example',
  private_key: '-----BEGIN EXAMPLE KEY-----',
  connection_string: 'postgresql://user:pass@example.com/db',
};

function getLocalFallbackDummy(mapping: MappingItem): string {
  const type = (mapping.type || '').toLowerCase();
  const name = (mapping.display_name || '').toLowerCase();
  const preview = mapping.original_preview || '';

  if (LOCAL_FALLBACK_DUMMIES[type]) {
    return LOCAL_FALLBACK_DUMMIES[type];
  }

  if (name.includes('amount') || name.includes('settlement') || name.includes('salary')
    || name.includes('wage') || name.includes('price') || name.includes('revenue')
    || name.includes('dollar') || name.includes('money') || name.includes('financial')) {
    return '$100,000';
  }
  if (name.includes('name') || name.includes('witness') || name.includes('client')
    || name.includes('defendant') || name.includes('plaintiff') || name.includes('employee')
    || name.includes('patient') || name.includes('person')) {
    return 'Jane Doe';
  }
  if (name.includes('case') || name.includes('matter') || name.includes('reference')) {
    return '#0000-0000';
  }
  if (name.includes('date') || name.includes('birthday') || name.includes('dob')) {
    return '01/01/2000';
  }
  if (name.includes('address') || name.includes('street') || name.includes('location')) {
    return '123 Example St, Anytown, ST 12345';
  }

  if (/^\$[\d.,]+[KMBTkmbt]?$/i.test(preview)) return '$100,000';
  if (/^\d{3}[-.\s]?\d{2}[-.\s]?\d{4}$/.test(preview)) return '123-45-6789';
  if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(preview)) return 'user@example.com';
  if (/^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/.test(preview)) return '(555) 123-4567';

  return mapping.masked_value || mapping.placeholder || '[REDACTED]';
}

// ---------------------------------------------------------------------------
// Warning banner for dummy generation failures
// ---------------------------------------------------------------------------

function showDummyWarning(popup: HTMLElement, message: string): void {
  popup.querySelector('.obfusca-dummy-warning')?.remove();

  const warning = document.createElement('div');
  warning.className = 'obfusca-dummy-warning';
  warning.style.cssText = `
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: ${OBFUSCA_STYLES.colors.warning}15;
    border: 1px solid ${OBFUSCA_STYLES.colors.warning}40;
    border-radius: 4px;
    margin: 4px 10px;
    font-size: 10px;
    color: ${OBFUSCA_STYLES.colors.warning};
    font-family: ${OBFUSCA_STYLES.fonts.sans};
  `;

  const iconSpan = document.createElement('span');
  iconSpan.textContent = '\u26A0';
  iconSpan.style.fontSize = '12px';
  warning.appendChild(iconSpan);

  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  warning.appendChild(textSpan);

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = '\u00D7';
  dismissBtn.style.cssText = `
    margin-left: auto;
    background: none;
    border: none;
    color: ${OBFUSCA_STYLES.colors.warning};
    cursor: pointer;
    font-size: 14px;
    padding: 0 2px;
    font-family: ${OBFUSCA_STYLES.fonts.sans};
  `;
  dismissBtn.addEventListener('click', () => warning.remove());
  warning.appendChild(dismissBtn);

  const header = popup.querySelector('[style*="border-bottom"]');
  if (header) {
    header.after(warning);
  } else {
    popup.prepend(warning);
  }
}

// ---------------------------------------------------------------------------
// Dummy loading state management
// ---------------------------------------------------------------------------

function setDummyLoadingState(popup: HTMLElement, loading: boolean): void {
  const dummyBtns = popup.querySelectorAll('.obfusca-mode-btn[data-mode="dummy"]') as NodeListOf<HTMLElement>;
  const generateAllBtn = popup.querySelector('#obfusca-generate-all-btn') as HTMLElement | null;

  dummyBtns.forEach((btn) => {
    if (loading) {
      btn.setAttribute('disabled', 'true');
      btn.style.opacity = '0.5';
      btn.style.cursor = 'wait';
    } else {
      btn.removeAttribute('disabled');
      btn.style.opacity = '';
      btn.style.cursor = 'pointer';
    }
  });

  if (generateAllBtn) {
    if (loading) {
      generateAllBtn.setAttribute('disabled', 'true');
      generateAllBtn.style.opacity = '0.5';
      generateAllBtn.style.cursor = 'wait';
      generateAllBtn.textContent = '...';
    } else {
      generateAllBtn.removeAttribute('disabled');
      generateAllBtn.style.opacity = '';
      generateAllBtn.style.cursor = 'pointer';
      generateAllBtn.textContent = 'D';
    }
  }
}

/**
 * Build a map from mapping index to the actual token in obfuscated_text.
 */
function buildTokenMap(obfuscatedText: string, mappings: MappingItem[]): Map<number, string> {
  const map = new Map<number, string>();

  const bracketRegex = /\[[A-Z][A-Z0-9_ ]*\]/g;
  const allBracketTokens: Array<{ token: string; pos: number; idx: number }> = [];
  let regexMatch;
  let tokenIdx = 0;
  while ((regexMatch = bracketRegex.exec(obfuscatedText)) !== null) {
    allBracketTokens.push({ token: regexMatch[0], pos: regexMatch.index, idx: tokenIdx++ });
  }

  const claimedTokenIndices = new Set<number>();

  function claimTokenByString(tokenStr: string): { token: string; pos: number; idx: number } | null {
    for (const bt of allBracketTokens) {
      if (bt.token === tokenStr && !claimedTokenIndices.has(bt.idx)) {
        claimedTokenIndices.add(bt.idx);
        return bt;
      }
    }
    return null;
  }

  // Pass 1: exact placeholder match
  for (let i = 0; i < mappings.length; i++) {
    const token = mappings[i].placeholder;
    if (token) {
      const found = claimTokenByString(token);
      if (found) map.set(i, found.token);
    }
  }

  // Pass 2: replacement text match
  for (let i = 0; i < mappings.length; i++) {
    if (map.has(i)) continue;
    const token = mappings[i].replacement;
    if (token) {
      const found = claimTokenByString(token);
      if (found) map.set(i, found.token);
    }
  }

  // Pass 3: [DISPLAY_NAME] variant
  for (let i = 0; i < mappings.length; i++) {
    if (map.has(i)) continue;
    const dn = mappings[i].display_name;
    if (dn) {
      const variant1 = `[${dn.toUpperCase().replace(/\s+/g, '_')}]`;
      const found1 = claimTokenByString(variant1);
      if (found1) { map.set(i, found1.token); continue; }
      const variant2 = `[${dn.toUpperCase()}]`;
      const found2 = claimTokenByString(variant2);
      if (found2) { map.set(i, found2.token); continue; }
      const firstWord = dn.split(/\s+/)[0].toUpperCase();
      const variant3 = `[${firstWord}]`;
      const found3 = claimTokenByString(variant3);
      if (found3) map.set(i, found3.token);
    }
  }

  // Pass 4: position-based
  const unmappedWithPos: Array<{ idx: number; start: number }> = [];
  for (let i = 0; i < mappings.length; i++) {
    if (map.has(i)) continue;
    const m = mappings[i];
    if (m.start != null && m.start >= 0) {
      unmappedWithPos.push({ idx: i, start: m.start });
    }
  }

  if (unmappedWithPos.length > 0) {
    unmappedWithPos.sort((a, b) => a.start - b.start);
    const unclaimedTokens = allBracketTokens.filter(t => !claimedTokenIndices.has(t.idx));
    for (let j = 0; j < unmappedWithPos.length && j < unclaimedTokens.length; j++) {
      const { idx } = unmappedWithPos[j];
      const bt = unclaimedTokens[j];
      map.set(idx, bt.token);
      claimedTokenIndices.add(bt.idx);
    }
  }

  // Pass 5: legacy fallback
  const stillUnclaimed = allBracketTokens.filter(t => !claimedTokenIndices.has(t.idx));
  let uncIdx = 0;
  for (let i = 0; i < mappings.length; i++) {
    if (map.has(i)) continue;
    if (uncIdx < stillUnclaimed.length) {
      map.set(i, stillUnclaimed[uncIdx].token);
      claimedTokenIndices.add(stillUnclaimed[uncIdx].idx);
      uncIdx++;
    }
  }

  console.log('[Obfusca Preview] Token map built:', Array.from(map.entries()).map(([k, v]) => `[${k}] \u2192 "${v}"`).join(', '));
  return map;
}

/**
 * Update the preview element with current redaction choices.
 */
function updatePreview(
  popup: HTMLElement,
  obfuscation: ObfuscationData,
  choices: RedactionChoice[]
): void {
  const previewEl = popup.querySelector('#obfusca-preview-text');
  if (!previewEl) return;

  let result = obfuscation.obfuscated_text;

  for (let i = 0; i < obfuscation.mappings.length; i++) {
    const choice = choices[i];
    if (!choice || !choice.enabled) continue;

    const newText = choice.replacementText;
    const mapping = obfuscation.mappings[i];

    const token = _tokenMap.get(i);
    if (token && token !== newText && result.includes(token)) {
      result = result.replace(token, newText);
      continue;
    }

    if (newText !== mapping.placeholder && result.includes(mapping.placeholder)) {
      result = result.replace(mapping.placeholder, newText);
      continue;
    }

    if (mapping.replacement && newText !== mapping.replacement && result.includes(mapping.replacement)) {
      result = result.replace(mapping.replacement, newText);
    }
  }

  const truncatedText = truncate(result, 500);
  let html = escapeHtml(truncatedText);

  for (let i = 0; i < obfuscation.mappings.length; i++) {
    const choice = choices[i];
    if (!choice || !choice.enabled) continue;

    const escapedReplacement = escapeHtml(choice.replacementText);
    if (!escapedReplacement || !html.includes(escapedReplacement)) continue;

    const isDummy = _dummyRowFlags.get(i) === true;
    const bgColor = isDummy
      ? OBFUSCA_STYLES.colors.dummyHighlight
      : OBFUSCA_STYLES.colors.redactedHighlight;
    const borderColor = isDummy
      ? OBFUSCA_STYLES.colors.magicPrimary
      : OBFUSCA_STYLES.colors.obscuredText;

    const highlightedSpan = `<mark style="
      background: ${bgColor};
      border-bottom: 1px solid ${borderColor};
      padding: 0 2px;
      border-radius: 2px;
      transition: all 0.3s ease;
      color: inherit;
    ">${escapedReplacement}</mark>`;

    html = html.replace(escapedReplacement, highlightedSpan);
  }

  previewEl.innerHTML = html;
}

/**
 * Update the file preview panel with current redaction choices.
 */
function updateFilePreview(
  popup: HTMLElement,
  extractedText: string,
  obfuscation: ObfuscationData,
  choices: RedactionChoice[]
): void {
  const previewEl = popup.querySelector('#obfusca-file-preview-content');
  if (!previewEl) return;

  let html = escapeHtml(truncate(extractedText, 3000));

  const replacements: Array<{
    index: number;
    original: string;
    replacement: string;
    mode: ReplacementMode;
  }> = [];

  for (let i = 0; i < obfuscation.mappings.length; i++) {
    const m = obfuscation.mappings[i];
    const choice = choices[i];
    if (!choice || !choice.enabled) continue;

    const originalValue = resolveOriginalValue(m, extractedText);
    if (!originalValue) continue;

    replacements.push({
      index: i,
      original: originalValue,
      replacement: choice.replacementText,
      mode: choice.mode,
    });
  }

  replacements.sort((a, b) => b.original.length - a.original.length);

  for (const r of replacements) {
    const escapedOriginal = escapeHtml(r.original);
    if (!html.includes(escapedOriginal)) continue;

    const isDummy = r.mode === 'dummy';
    const bgColor = isDummy
      ? OBFUSCA_STYLES.colors.dummyHighlight
      : OBFUSCA_STYLES.colors.redactedHighlight;
    const borderColor = isDummy
      ? OBFUSCA_STYLES.colors.magicPrimary
      : OBFUSCA_STYLES.colors.obscuredText;

    const highlightedSpan = `<mark style="
      background: ${bgColor};
      border-bottom: 1px solid ${borderColor};
      padding: 0 2px;
      border-radius: 2px;
      transition: all 0.3s ease;
      color: inherit;
    " title="Original: ${escapedOriginal}">${escapeHtml(r.replacement)}</mark>`;

    html = html.replace(escapedOriginal, highlightedSpan);
  }

  previewEl.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Positioning helpers
// ---------------------------------------------------------------------------

/**
 * Walk up the DOM from the input element to find the visible container that
 * visually wraps it (has a background, border, or border-radius and is wide
 * enough). The bubble will be sized and positioned to match this container,
 * so it appears to grow upward out of the input box.
 */
function findVisibleInputContainer(inputElement: HTMLElement): HTMLElement {
  let el: HTMLElement | null = inputElement;
  let best: HTMLElement = inputElement;

  for (let i = 0; i < 6 && el; i++) {
    el = el.parentElement;
    if (!el) break;

    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const hasBg = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
    const hasBorder = style.borderWidth !== '0px' && style.borderStyle !== 'none';
    const hasRadius = parseFloat(style.borderRadius) > 0;
    const isWideEnough = rect.width > 300;

    if (isWideEnough && (hasBg || hasBorder || hasRadius)) {
      best = el;
      break;
    }

    if (rect.width > best.getBoundingClientRect().width) {
      best = el;
    }
  }

  return best;
}

/**
 * Position the bubble flush against the top of the visible input container,
 * matching its width so the popup looks like a natural upward extension of
 * the input box.
 */
function positionBubble(bubble: HTMLElement, anchorElement: HTMLElement): void {
  const container = findVisibleInputContainer(anchorElement);
  const rect = container.getBoundingClientRect();

  const gap = 8;
  const bottomValue = window.innerHeight - rect.top + gap;

  if (rect.width >= 400) {
    // Match the input container exactly
    bubble.style.bottom = `${bottomValue}px`;
    bubble.style.left = `${rect.left}px`;
    bubble.style.width = `${rect.width}px`;
    bubble.style.transform = 'none';
    bubble.style.maxHeight = `${Math.max(100, rect.top - gap - 20)}px`;
    bubble.style.borderRadius = '16px';
    bubble.style.maxWidth = '';
  } else {
    // Fallback: viewport-center
    bubble.style.bottom = `${bottomValue}px`;
    bubble.style.left = '50%';
    bubble.style.transform = 'translateX(-50%)';
    bubble.style.width = '750px';
    bubble.style.maxWidth = 'calc(100vw - 32px)';
    bubble.style.maxHeight = `${Math.max(100, rect.top - gap - 32)}px`;
    bubble.style.borderRadius = '16px';
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Show the unified detection popup.
 * Removes any existing popup first.
 */
export function showDetectionPopup(options: DetectionPopupOptions): HTMLElement {
  removeDetectionPopup();

  // Inject global animations and scrollbar styles once
  injectAnimationStyles();
  injectScrollbarStyles();

  const {
    detections,
    obfuscation,
    fileDetections,
    simulated,
    anchorElement,
  } = options;

  const effectiveAction = normalizeAction(options.action);
  const displayAction = (simulated && effectiveAction === 'allow') ? 'allow' : effectiveAction;

  const hasFileDetections = !!fileDetections && fileDetections.length > 0;
  const hasTextDetections = detections.length > 0;
  const hasObfuscation = !!obfuscation && obfuscation.mappings.length > 0;

  const S = OBFUSCA_STYLES;

  // Determine if we need side-by-side layout
  const needsSideBySide = hasObfuscation && (
    (displayAction === 'block' || displayAction === 'warn') ||
    options.fileProtectionMode
  );

  // Build HTML sections
  const headerHtml = renderHeader(
    hasFileDetections && !hasTextDetections ? 'block' : displayAction,
    hasFileDetections && !hasTextDetections
  );

  // Build body content
  let leftPanelHtml = '';
  let rightPanelHtml = '';
  let fallbackBodyHtml = '';

  if (options.fileProtectionMode && hasObfuscation) {
    leftPanelHtml = renderRedactionList(obfuscation!, effectiveAction === 'block' ? 'block' : 'warn', options.extractedText || options.originalText);
    if (options.extractedText) {
      rightPanelHtml = renderCodeBlockPreview(
        options.extractedText,
        options.fileName || null,
        true
      );
    }
  } else if (hasTextDetections && needsSideBySide) {
    leftPanelHtml = renderRedactionList(obfuscation!, displayAction as 'block' | 'warn', options.originalText);
    rightPanelHtml = renderCodeBlockPreview(
      obfuscation!.obfuscated_text,
      options.fileName || null,
      false
    );
  } else if (hasTextDetections) {
    // Fallback: no obfuscation data, show detection names only
    if (displayAction === 'block') {
      fallbackBodyHtml = renderFallbackDetections(detections, S.colors.destructive);
    } else if (displayAction === 'warn') {
      fallbackBodyHtml = renderFallbackDetections(detections, S.colors.info);
    } else {
      fallbackBodyHtml = renderFallbackDetections(detections, S.colors.info);
    }
  }

  if (hasFileDetections && !options.fileProtectionMode) {
    fallbackBodyHtml += renderFileDetections(fileDetections!);
  }

  // File info bar
  let fileInfoHtml = '';
  if (options.fileProtectionMode && options.fileName) {
    fileInfoHtml = renderFileInfoBar(options.fileName);
  }

  const footerActionsHtml = renderFooterActions(
    displayAction,
    hasObfuscation,
    hasFileDetections,
    hasTextDetections,
    options.fileProtectionMode
  );

  // Create the popup container (inline bubble anchored above the input field)
  const popup = document.createElement('div');
  popup.id = POPUP_ID;

  const maxHeightValue = 480;

  // Initial position will be set by positionBubble() after the element is in the DOM.

  popup.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    transform: none;
    z-index: 2147483647;
    font-family: ${S.fonts.sans};
    width: 750px;
    max-width: calc(100vw - 32px);
    max-height: min(${maxHeightValue}px, 70vh);
    display: flex;
    flex-direction: column;
    background: ${S.colors.card};
    border: 1px solid ${S.colors.border};
    border-radius: 16px;
    box-shadow: 0 -4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08);
    overflow: visible;
    animation: ${POPUP_ANIMATION_NAME} 0.18s ease-out forwards;
  `;

  // Clip inner content
  popup.style.setProperty('--obfusca-card-bg', S.colors.card);

  // Build the body area based on layout mode
  let bodyHtml: string;

  if (needsSideBySide && (leftPanelHtml || rightPanelHtml)) {
    bodyHtml = `
      ${fileInfoHtml}
      <div style="
        flex: 1;
        display: grid;
        grid-template-columns: 320px 1fr;
        min-height: 0;
        overflow: hidden;
      ">
        <!-- Left panel: detection list -->
        <div style="
          overflow-y: auto;
          overflow-x: hidden;
          border-right: 1px solid ${S.colors.border};
          background: ${S.colors.card};
        ">
          ${leftPanelHtml}
        </div>
        <!-- Right panel: preview -->
        <div style="
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-height: 0;
          background: ${S.colors.background};
        ">
          ${rightPanelHtml}
        </div>
      </div>
    `;
  } else {
    bodyHtml = `
      ${fileInfoHtml}
      <div style="
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
      ">
        ${fallbackBodyHtml || leftPanelHtml}
      </div>
    `;
  }

  // Inner wrapper clips content
  const innerWrapper = document.createElement('div');
  innerWrapper.style.cssText = `
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 16px 16px 0 0;
    flex: 1;
    min-height: 0;
    max-height: min(${maxHeightValue}px, 70vh);
  `;
  innerWrapper.innerHTML = `
    ${headerHtml}
    ${bodyHtml}
    ${footerActionsHtml}
  `;

  popup.appendChild(innerWrapper);

  document.body.appendChild(popup);

  // Initial position: run after the element is in the DOM so offsetWidth is measurable.
  positionBubble(popup, anchorElement);

  // Continuously reposition the bubble as the anchor element moves
  // (e.g. fresh chat → centered, after first message → bottom, textarea grows, attachments added).
  const positionInterval = setInterval(() => {
    if (!popup.isConnected || !anchorElement.isConnected) {
      clearInterval(positionInterval);
      return;
    }
    positionBubble(popup, anchorElement);
  }, 100);
  (popup as any).__obfuscaPositionInterval = positionInterval;

  // Outside-click to dismiss (no backdrop -- page remains fully interactive)
  const outsideClickHandler = (e: MouseEvent) => {
    if (!popup.contains(e.target as Node)) {
      removeDetectionPopup();
      options.onDismiss();
    }
  };
  // Defer adding the listener so the current click event (which opened the popup) doesn't immediately close it.
  // Use 150ms (not 0ms) so the send-button click that triggered analysis finishes bubbling before
  // the outside-click listener is registered. A zero-delay setTimeout fires before click bubbling
  // completes on some browsers, causing the popup to dismiss on the same click that showed it.
  setTimeout(() => {
    document.addEventListener('mousedown', outsideClickHandler, { capture: false });
    (popup as any).__obfuscaOutsideClickHandler = outsideClickHandler;
  }, 150);

  // ------------------------------------------------------------------
  // Event handlers
  // ------------------------------------------------------------------

  const closeBtn = popup.querySelector('#obfusca-popup-close') as HTMLElement | null;
  const editBtn = popup.querySelector('#obfusca-popup-edit') as HTMLElement | null;
  const sendOriginalBtn = popup.querySelector('#obfusca-popup-send-original') as HTMLElement | null;
  const sendProtectedBtn = popup.querySelector('#obfusca-popup-send-protected') as HTMLElement | null;
  const removeFilesBtn = popup.querySelector('#obfusca-popup-remove-files') as HTMLElement | null;
  const downloadProtectedBtn = popup.querySelector('#obfusca-popup-download-protected') as HTMLButtonElement | null;
  const sendFileProtectedBtn = popup.querySelector('#obfusca-popup-send-file-protected') as HTMLButtonElement | null;
  const saveCopyBtn = popup.querySelector('#obfusca-popup-save-copy') as HTMLButtonElement | null;

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      removeDetectionPopup();
      options.onDismiss();
    });
  }

  if (editBtn) {
    editBtn.addEventListener('click', () => {
      removeDetectionPopup();
      options.onEdit();
    });
    editBtn.addEventListener('mouseenter', () => {
      editBtn.style.background = S.colors.secondary;
    });
    editBtn.addEventListener('mouseleave', () => {
      editBtn.style.background = 'transparent';
    });
  }

  if (sendOriginalBtn) {
    sendOriginalBtn.addEventListener('click', async () => {
      // Two-step confirmation: show inline confirmation dialog before bypassing
      const summary = buildDetectionSummary(
        options.detections,
        obfuscation?.mappings,
        options.fileDetections,
      );

      // Find the popup card element (the positioned container)
      const popupCard = popup.querySelector('[style*="position: relative"]') as HTMLElement || popup;

      const confirmed = await showBypassConfirmation(popupCard, summary);
      if (!confirmed) return; // User cancelled -- stay on detection popup

      // User confirmed bypass: log the incident asynchronously, then proceed
      fireBypassEvent(
        options.detections,
        obfuscation?.mappings,
        options.originalText,
        options.fileDetections,
      );

      // Set the bypass flag BEFORE closing popup and triggering submit.
      // This ensures the re-triggered submit skips all scanning (no infinite loop).
      setBypassFlag();

      removeDetectionPopup();
      options.onSendOriginal();
    });
    sendOriginalBtn.addEventListener('mouseenter', () => {
      if (sendOriginalBtn.style.color === S.colors.destructive) {
        sendOriginalBtn.style.background = `${S.colors.destructive}15`;
      } else {
        sendOriginalBtn.style.opacity = '0.9';
      }
    });
    sendOriginalBtn.addEventListener('mouseleave', () => {
      sendOriginalBtn.style.opacity = '1';
      if (sendOriginalBtn.style.color === S.colors.destructive) {
        sendOriginalBtn.style.background = 'transparent';
      }
    });
  }

  // Track redaction choices from checkboxes -- default to masked mode
  const redactionChoices: RedactionChoice[] = obfuscation
    ? obfuscation.mappings.map((m, i) => ({
        index: i,
        enabled: effectiveAction === 'block' ? true : (m.auto_redact !== false),
        replacementText: m.masked_value || m.replacement || m.placeholder,
        mode: 'masked' as ReplacementMode,
      }))
    : [];

  // Build token map for reliable preview updates
  _tokenMap.clear();
  if (obfuscation && obfuscation.obfuscated_text) {
    _tokenMap = buildTokenMap(obfuscation.obfuscated_text, obfuscation.mappings);
  }

  // Unified preview refresh
  function refreshPreviews(): void {
    if (obfuscation) {
      updatePreview(popup, obfuscation, redactionChoices);
    }
    if (options.extractedText && obfuscation) {
      updateFilePreview(popup, options.extractedText, obfuscation, redactionChoices);
    }
  }

  // Initial file preview render
  if (options.extractedText && obfuscation) {
    updateFilePreview(popup, options.extractedText, obfuscation, redactionChoices);
  }

  // Wire up checkbox change handlers
  const checkboxes = popup.querySelectorAll('.obfusca-redact-checkbox') as NodeListOf<HTMLInputElement>;
  checkboxes.forEach((cb) => {
    cb.addEventListener('change', () => {
      const idx = parseInt(cb.getAttribute('data-mapping-index') || '0', 10);
      if (redactionChoices[idx]) {
        redactionChoices[idx].enabled = cb.checked;
      }
      const row = cb.closest('.obfusca-redact-row') as HTMLElement | null;
      if (row) {
        row.style.opacity = cb.checked ? '1' : '0.5';
      }
      refreshPreviews();
    });
  });

  // Wire up custom replacement buttons
  const customBtns = popup.querySelectorAll('.obfusca-custom-replacement-btn') as NodeListOf<HTMLElement>;
  customBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-mapping-index') || '0', 10);
      if (!obfuscation || !redactionChoices[idx]) return;

      const mapping = obfuscation.mappings[idx];
      const choice = redactionChoices[idx];

      import('./replacementModal').then(({ showReplacementModal }) => {
        showReplacementModal({
          currentText: choice.replacementText,
          label: mapping.display_name || mapping.type,
          onConfirm: (newText: string) => {
            choice.replacementText = newText;
            choice.mode = 'custom';
            const row = popup.querySelector(`.obfusca-redact-row[data-row-index="${idx}"]`);
            if (row) {
              const codeEl = row.querySelector('.obfusca-replacement-code') as HTMLElement | null;
              if (codeEl) codeEl.textContent = `\u2192 ${newText}`;
              updateModeToggleUI(row, 'custom');
            }
            refreshPreviews();
          },
          onCancel: () => {},
          anchorElement: btn,
        });
      });
    });
    btn.addEventListener('mouseenter', () => {
      btn.style.borderColor = S.colors.mutedForeground;
      btn.style.opacity = '1';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.borderColor = S.colors.border;
      btn.style.opacity = '0.5';
    });
  });

  // ------------------------------------------------------------------
  // Mode toggle (Mask | Dummy) per-row handlers
  // ------------------------------------------------------------------

  function updateModeToggleUI(row: Element, mode: ReplacementMode): void {
    const maskBtn = row.querySelector('.obfusca-mode-btn[data-mode="masked"]') as HTMLElement | null;
    const dummyBtn = row.querySelector('.obfusca-mode-btn[data-mode="dummy"]') as HTMLElement | null;
    if (maskBtn) {
      maskBtn.style.background = mode === 'masked' ? S.colors.info : S.colors.secondary;
      maskBtn.style.color = mode === 'masked' ? '#fff' : S.colors.mutedForeground;
    }
    if (dummyBtn) {
      dummyBtn.style.background = mode === 'dummy' ? '#10b981' : S.colors.secondary;
      dummyBtn.style.color = mode === 'dummy' ? '#000' : S.colors.mutedForeground;
    }
  }

  const modeBtns = popup.querySelectorAll('.obfusca-mode-btn') as NodeListOf<HTMLElement>;
  modeBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-row-index') || '0', 10);
      const mode = btn.getAttribute('data-mode') as 'masked' | 'dummy';
      if (!obfuscation || !redactionChoices[idx]) return;

      const mapping = obfuscation.mappings[idx];
      const choice = redactionChoices[idx];

      console.log(`[Obfusca Toggle] Row ${idx} \u2192 ${mode} | masked_value=${mapping.masked_value} | dummy_value=${mapping.dummy_value}`);

      let newValue: string;
      if (mode === 'masked') {
        newValue = mapping.masked_value || mapping.replacement || mapping.placeholder;
      } else {
        newValue = mapping.dummy_value || mapping.replacement || mapping.placeholder;
      }

      console.log(`[Obfusca Toggle] Row ${idx} \u2192 newValue="${newValue}"`);

      choice.replacementText = newValue;
      choice.mode = mode;

      const row = popup.querySelector(`.obfusca-redact-row[data-row-index="${idx}"]`);
      if (row) {
        const codeEl = row.querySelector('.obfusca-replacement-code') as HTMLElement | null;
        if (codeEl) {
          codeEl.textContent = `\u2192 ${newValue}`;
          if (mode === 'dummy') {
            codeEl.style.background = 'rgba(16, 185, 129, 0.15)';
            codeEl.style.color = '#10b981';
            codeEl.style.border = '1px solid rgba(16, 185, 129, 0.3)';
          } else {
            codeEl.style.background = 'rgba(168, 85, 247, 0.15)';
            codeEl.style.color = '#a855f7';
            codeEl.style.border = '1px solid rgba(168, 85, 247, 0.3)';
          }
        }
        updateModeToggleUI(row, mode);
      }

      _dummyRowFlags.set(idx, mode === 'dummy');
      refreshPreviews();
    });

    btn.addEventListener('mouseenter', () => {
      const btnMode = btn.getAttribute('data-mode');
      const idx = parseInt(btn.getAttribute('data-row-index') || '0', 10);
      const choice = redactionChoices[idx];
      const isActive = choice && choice.mode === btnMode;
      if (!isActive) {
        const hoverColor = btnMode === 'dummy' ? 'rgba(16, 185, 129, 0.3)' : `${S.colors.info}30`;
        btn.style.background = hoverColor;
      }
    });
    btn.addEventListener('mouseleave', () => {
      const idx = parseInt(btn.getAttribute('data-row-index') || '0', 10);
      const choice = redactionChoices[idx];
      const btnMode = btn.getAttribute('data-mode');
      const isActive = choice && choice.mode === btnMode;
      if (!isActive) {
        btn.style.background = S.colors.secondary;
      }
    });
  });

  // ------------------------------------------------------------------
  // "All Mask" / "All Dummy" bulk mode switching
  // ------------------------------------------------------------------

  function switchAllToMode(targetMode: 'masked' | 'dummy'): void {
    if (!obfuscation) return;

    for (let i = 0; i < obfuscation.mappings.length; i++) {
      const choice = redactionChoices[i];
      if (!choice || !choice.enabled) continue;

      const m = obfuscation.mappings[i];
      let newValue: string;
      if (targetMode === 'masked') {
        newValue = m.masked_value || m.replacement || m.placeholder;
      } else {
        newValue = m.dummy_value || m.replacement || m.placeholder;
      }

      choice.replacementText = newValue;
      choice.mode = targetMode;
      _dummyRowFlags.set(i, targetMode === 'dummy');

      const row = popup.querySelector(`.obfusca-redact-row[data-row-index="${i}"]`);
      if (row) {
        const codeEl = row.querySelector('.obfusca-replacement-code') as HTMLElement | null;
        if (codeEl) {
          codeEl.textContent = `\u2192 ${newValue}`;
          if (targetMode === 'dummy') {
            codeEl.style.background = 'rgba(16, 185, 129, 0.15)';
            codeEl.style.color = '#10b981';
            codeEl.style.border = '1px solid rgba(16, 185, 129, 0.3)';
          } else {
            codeEl.style.background = 'rgba(168, 85, 247, 0.15)';
            codeEl.style.color = '#a855f7';
            codeEl.style.border = '1px solid rgba(168, 85, 247, 0.3)';
          }
        }
        updateModeToggleUI(row, targetMode);
      }
    }

    refreshPreviews();
  }

  const allMaskBtn = popup.querySelector('#obfusca-all-mask-btn') as HTMLElement | null;
  const generateAllBtn = popup.querySelector('#obfusca-generate-all-btn') as HTMLElement | null;

  function updateGlobalModeToggle(activeMode: 'masked' | 'dummy'): void {
    if (allMaskBtn) {
      allMaskBtn.style.background = activeMode === 'masked' ? S.colors.info : 'transparent';
      allMaskBtn.style.color = activeMode === 'masked' ? '#fff' : S.colors.mutedForeground;
    }
    if (generateAllBtn) {
      generateAllBtn.style.background = activeMode === 'dummy' ? '#10b981' : 'transparent';
      generateAllBtn.style.color = activeMode === 'dummy' ? '#000' : S.colors.mutedForeground;
    }
  }

  if (allMaskBtn) {
    allMaskBtn.addEventListener('click', () => {
      switchAllToMode('masked');
      updateGlobalModeToggle('masked');
    });
  }

  if (generateAllBtn) {
    generateAllBtn.addEventListener('click', () => {
      switchAllToMode('dummy');
      updateGlobalModeToggle('dummy');
    });
  }

  if (sendProtectedBtn && obfuscation) {
    sendProtectedBtn.addEventListener('click', () => {
      const protectedText = generateProtectedText(
        obfuscation.obfuscated_text,
        obfuscation.mappings,
        redactionChoices,
        _tokenMap
      );
      removeDetectionPopup();
      options.onSendProtected?.(protectedText);
    });
    sendProtectedBtn.addEventListener('mouseenter', () => {
      sendProtectedBtn.style.opacity = '0.9';
      sendProtectedBtn.style.transform = 'translateY(-1px)';
    });
    sendProtectedBtn.addEventListener('mouseleave', () => {
      sendProtectedBtn.style.opacity = '1';
      sendProtectedBtn.style.transform = '';
    });
  }

  if (removeFilesBtn) {
    removeFilesBtn.addEventListener('click', () => {
      removeDetectionPopup();
      options.onRemoveFiles?.();
    });
    removeFilesBtn.addEventListener('mouseenter', () => {
      removeFilesBtn.style.opacity = '0.9';
    });
    removeFilesBtn.addEventListener('mouseleave', () => {
      removeFilesBtn.style.opacity = '1';
    });
  }

  // Download Protected button (file protection mode)
  if (downloadProtectedBtn && obfuscation && options.onDownloadProtected) {
    downloadProtectedBtn.addEventListener('click', async () => {
      const choices: Array<{ original_value: string; replacement: string }> = [];
      for (let i = 0; i < obfuscation.mappings.length; i++) {
        const m = obfuscation.mappings[i];
        const choice = redactionChoices[i];
        if (choice && !choice.enabled) continue;
        const originalValue = resolveOriginalValue(m, options.extractedText);
        if (!originalValue) continue;
        const isDummy = _dummyRowFlags.get(i);
        const replacement = isDummy
          ? (m.dummy_value || m.masked_value || m.placeholder)
          : (m.masked_value || m.placeholder);
        choices.push({ original_value: originalValue, replacement });
      }

      downloadProtectedBtn.disabled = true;
      downloadProtectedBtn.innerHTML = `${ICON_SPINNER} Processing...`;

      try {
        await options.onDownloadProtected!(choices);
        downloadProtectedBtn.innerHTML = `${ICON_CHECK} Downloaded`;
        setTimeout(() => removeDetectionPopup(), 1200);
      } catch {
        downloadProtectedBtn.disabled = false;
        downloadProtectedBtn.innerHTML = `${ICON_DOWNLOAD} Download Protected`;
      }
    });
    downloadProtectedBtn.addEventListener('mouseenter', () => {
      downloadProtectedBtn.style.opacity = '0.9';
    });
    downloadProtectedBtn.addEventListener('mouseleave', () => {
      downloadProtectedBtn.style.opacity = '1';
    });
  }

  // Helper: build file protection choices
  function buildFileProtectionChoices(): Array<{ original_value: string; replacement: string }> {
    if (!obfuscation) return [];
    const choices: Array<{ original_value: string; replacement: string }> = [];
    for (let i = 0; i < obfuscation.mappings.length; i++) {
      const m = obfuscation.mappings[i];
      const choice = redactionChoices[i];
      if (choice && !choice.enabled) continue;
      const originalValue = resolveOriginalValue(m, options.extractedText);
      if (!originalValue) continue;
      choices.push({ original_value: originalValue, replacement: choice?.replacementText || m.masked_value || m.placeholder });
    }
    return choices;
  }

  // Send Protected (file mode)
  if (sendFileProtectedBtn && obfuscation && options.onSendFileProtected) {
    sendFileProtectedBtn.addEventListener('click', async () => {
      const choices = buildFileProtectionChoices();
      sendFileProtectedBtn.disabled = true;
      sendFileProtectedBtn.innerHTML = `${ICON_SPINNER} Processing...`;
      try {
        await options.onSendFileProtected!(choices);
        sendFileProtectedBtn.innerHTML = `${ICON_CHECK} Sent`;
        setTimeout(() => removeDetectionPopup(), 800);
      } catch {
        sendFileProtectedBtn.disabled = false;
        sendFileProtectedBtn.innerHTML = `${ICON_ENTER} Send Protected`;
      }
    });
    sendFileProtectedBtn.addEventListener('mouseenter', () => {
      sendFileProtectedBtn.style.opacity = '0.9';
    });
    sendFileProtectedBtn.addEventListener('mouseleave', () => {
      sendFileProtectedBtn.style.opacity = '1';
    });
  }

  // Save Copy button
  if (saveCopyBtn && obfuscation && options.onDownloadProtected) {
    saveCopyBtn.addEventListener('click', async () => {
      const choices = buildFileProtectionChoices();
      saveCopyBtn.textContent = 'Saving...';
      try {
        await options.onDownloadProtected!(choices);
        saveCopyBtn.textContent = 'Saved!';
        setTimeout(() => { saveCopyBtn.textContent = 'Save Copy'; }, 2000);
      } catch {
        saveCopyBtn.textContent = 'Failed';
        setTimeout(() => { saveCopyBtn.textContent = 'Save Copy'; }, 2000);
      }
    });
    saveCopyBtn.addEventListener('mouseenter', () => {
      saveCopyBtn.style.borderColor = S.colors.mutedForeground;
      saveCopyBtn.style.color = S.colors.foreground;
    });
    saveCopyBtn.addEventListener('mouseleave', () => {
      saveCopyBtn.style.borderColor = S.colors.border;
      saveCopyBtn.style.color = S.colors.mutedForeground;
    });
  }

  // ------------------------------------------------------------------
  // Copy button handler (code block preview)
  // ------------------------------------------------------------------

  const copyBtn = popup.querySelector('#obfusca-preview-copy-btn') as HTMLElement | null;
  if (copyBtn) {
    const checkSvg = getGenericIcon('check');
    const copySvg = getGenericIcon('copy');

    copyBtn.addEventListener('click', () => {
      // Get the visible preview text content
      const previewEl = popup.querySelector('#obfusca-preview-text') || popup.querySelector('#obfusca-file-preview-content');
      if (!previewEl) return;

      const textContent = previewEl.textContent || '';
      navigator.clipboard.writeText(textContent).then(() => {
        // Show checkmark feedback for 2 seconds
        copyBtn.innerHTML = checkSvg;
        copyBtn.style.color = S.colors.success;
        setTimeout(() => {
          copyBtn.innerHTML = copySvg;
          copyBtn.style.color = S.colors.mutedForeground;
        }, 2000);
      }).catch(() => {
        // Fallback: try execCommand
        const textarea = document.createElement('textarea');
        textarea.value = textContent;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);

        copyBtn.innerHTML = checkSvg;
        copyBtn.style.color = S.colors.success;
        setTimeout(() => {
          copyBtn.innerHTML = copySvg;
          copyBtn.style.color = S.colors.mutedForeground;
        }, 2000);
      });
    });

    copyBtn.addEventListener('mouseenter', () => {
      copyBtn.style.background = S.colors.secondary;
      copyBtn.style.color = S.colors.foreground;
    });
    copyBtn.addEventListener('mouseleave', () => {
      copyBtn.style.background = 'transparent';
      // Preserve success state color if still showing check
      if (!copyBtn.innerHTML.includes('polyline points="20 6')) {
        copyBtn.style.color = S.colors.mutedForeground;
      }
    });
  }

  // Steal focus from the chat input so keyboard shortcuts work immediately
  const _prevActiveElement = document.activeElement as HTMLElement | null;
  if (_prevActiveElement instanceof HTMLElement) {
    _prevActiveElement.blur();
  }
  popup.setAttribute('tabindex', '-1');
  popup.focus({ preventScroll: true });

  // Keyboard shortcuts: Escape to dismiss, Enter to protect, Shift+Enter to bypass
  const keyHandler = (e: KeyboardEvent) => {
    // If the bypass confirmation dialog is open, let IT handle keyboard events
    if (document.getElementById(BYPASS_CONFIRM_ID)) return;

    if (e.key === 'Escape') {
      removeDetectionPopup();
      options.onDismiss();
      document.removeEventListener('keydown', keyHandler, true);
      return;
    }

    if (e.key === 'Enter') {
      // Don't intercept if focus is in an OBFUSCA input (e.g. custom replacement modal)
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        const isObfuscaInput = (activeEl as HTMLElement).id?.startsWith('obfusca-') ||
          activeEl.closest('#' + POPUP_ID);
        if (isObfuscaInput) return;
      }
      // Don't intercept if the replacement modal is open
      if (document.getElementById('obfusca-replacement-modal')) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (e.shiftKey) {
        // Shift+Enter → Send Anyway / Upload Anyway
        const bypassBtn = popup.querySelector('#obfusca-popup-send-original') as HTMLElement | null;
        bypassBtn?.click();
      } else {
        // Enter → primary protect action
        const primaryBtn = (
          popup.querySelector('#obfusca-popup-send-protected') ||
          popup.querySelector('#obfusca-popup-send-file-protected') ||
          popup.querySelector('#obfusca-popup-remove-files')
        ) as HTMLElement | null;
        if (primaryBtn && !primaryBtn.hasAttribute('disabled')) primaryBtn.click();
      }
    }
  };
  document.addEventListener('keydown', keyHandler, true); // capture phase to intercept before page

  (popup as any).__obfuscaEscHandler = keyHandler;
  (popup as any).__obfuscaPrevFocus = _prevActiveElement;

  // ------------------------------------------------------------------
  // Batch AI dummy generation
  // ------------------------------------------------------------------

  if (hasObfuscation && obfuscation && options.originalText) {
    const needsDummies = obfuscation.mappings.length > 0;

    if (needsDummies) {
      setDummyLoadingState(popup, true);

      const batchDetections: BatchDetectionItem[] = obfuscation.mappings.map((m, i) => ({
        index: i,
        type: m.type || 'custom',
        original_value: m.original_preview || m.placeholder,
        display_name: m.display_name,
      }));

      console.log('[Obfusca Batch] Fetching AI dummies for', batchDetections.length, 'items');

      generateDummiesBatch(options.originalText, batchDetections)
        .then((response) => {
          if (!document.getElementById(POPUP_ID)) {
            console.log('[Obfusca Batch] Popup dismissed before dummies arrived');
            return;
          }

          if (response && response.success && response.dummies.length > 0) {
            console.log('[Obfusca Batch] AI dummies received:', response.dummies.length, 'items, source:', response.source);

            for (const item of response.dummies) {
              const idx = item.index;
              if (idx >= 0 && idx < obfuscation.mappings.length && item.dummy_value) {
                obfuscation.mappings[idx].dummy_value = item.dummy_value;

                const choice = redactionChoices[idx];
                if (choice && choice.mode === 'dummy') {
                  choice.replacementText = item.dummy_value;

                  const row = popup.querySelector(`.obfusca-redact-row[data-row-index="${idx}"]`);
                  if (row) {
                    const codeEl = row.querySelector('.obfusca-replacement-code') as HTMLElement | null;
                    if (codeEl) codeEl.textContent = item.dummy_value;
                  }
                }
              }
            }

            const hasDummyRows = Array.from(_dummyRowFlags.values()).some(v => v);
            if (hasDummyRows) refreshPreviews();
          } else {
            console.warn('[Obfusca Batch] AI dummies failed, applying local fallbacks');
            showDummyWarning(popup, "Couldn\u2019t generate smart replacements. Using defaults.");

            for (let i = 0; i < obfuscation.mappings.length; i++) {
              const m = obfuscation.mappings[i];
              if (!m.dummy_value || m.dummy_value === m.masked_value) {
                m.dummy_value = getLocalFallbackDummy(m);
              }
            }
          }
        })
        .catch((err) => {
          console.error('[Obfusca Batch] Batch dummy fetch error:', err);
          if (document.getElementById(POPUP_ID)) {
            showDummyWarning(popup, 'Backend error. Using default replacements.');

            for (let i = 0; i < obfuscation.mappings.length; i++) {
              const m = obfuscation.mappings[i];
              if (!m.dummy_value || m.dummy_value === m.masked_value) {
                m.dummy_value = getLocalFallbackDummy(m);
              }
            }
          }
        })
        .finally(() => {
          if (document.getElementById(POPUP_ID)) {
            setDummyLoadingState(popup, false);
          }
        });
    }
  }

  return popup;
}

/**
 * Remove the detection popup with an optional exit animation.
 */
export function removeDetectionPopup(): void {
  const existing = document.getElementById(POPUP_ID);

  if (!existing) return;

  if (existing) {
    const escHandler = (existing as any).__obfuscaEscHandler;
    if (escHandler) {
      document.removeEventListener('keydown', escHandler, true);
    }
    // Clean up outside-click listener
    const outsideClickHandler = (existing as any).__obfuscaOutsideClickHandler;
    if (outsideClickHandler) {
      document.removeEventListener('mousedown', outsideClickHandler, false);
    }
    // Clean up position interval
    const positionInterval = (existing as any).__obfuscaPositionInterval as ReturnType<typeof setInterval> | undefined;
    if (positionInterval !== undefined) {
      clearInterval(positionInterval);
    }
    // Restore focus to the element that was active before the popup opened
    const prevFocus = (existing as any).__obfuscaPrevFocus as HTMLElement | null;
    if (prevFocus && typeof prevFocus.focus === 'function') {
      try { prevFocus.focus({ preventScroll: true }); } catch (_) { /* noop */ }
    }
  }

  _dummyRowFlags.clear();
  _tokenMap.clear();

  if (existing) {
    existing.style.animation = `${POPUP_ANIMATION_OUT_NAME} 0.12s ease-in forwards`;
    setTimeout(() => {
      existing.remove();
    }, 120);
  }
}

/**
 * Check if the detection popup is currently visible.
 */
export function isDetectionPopupVisible(): boolean {
  return document.getElementById(POPUP_ID) !== null;
}

// ===========================================================================
// Multi-Item Popup
// ===========================================================================
//
// Supports reviewing multiple flagged items (files + chat text) with a
// tab navigation system, per-item protection, and progress tracking.
// The existing showDetectionPopup() remains untouched for single-item use.
// ===========================================================================

// ---------------------------------------------------------------------------
// Multi-Item types
// ---------------------------------------------------------------------------

export interface FlaggedItem {
  id: string;
  type: 'file' | 'chat';
  name: string;  // filename or "Chat Message"
  status: 'pending' | 'protected' | 'skipped';
  content: string;
  response: any; // AnalysisResponse from backend
  mappings: MappingItem[];
  /** Protected text computed by the popup using user's mode selection (mask/dummy). */
  protectedContent?: string;
  /** Per-mapping replacement choices computed by the popup using user's mode selection. */
  protectedReplacements?: Array<{ original_value: string; replacement: string }>;
  // For files
  file?: File;
  fileBase64?: string;
}

export interface PopupState {
  items: FlaggedItem[];
  activeItemId: string;
  globalMode: 'mask' | 'dummy';
  redactionChoices?: Map<number, { enabled: boolean; mode: string; customValue?: string }>;
  globalRedactMode?: 'mask' | 'dummy';
  previewViewMode?: 'original' | 'highlighted' | 'protected';
}

export interface MultiItemCallbacks {
  onProtectItem: (item: FlaggedItem) => Promise<void>;
  onSkipItem: (item: FlaggedItem) => void;
  onBypassItem: (item: FlaggedItem) => void;
  onAllComplete: (items: FlaggedItem[]) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Multi-Item constants
// ---------------------------------------------------------------------------

const MULTI_POPUP_ID = 'obfusca-multi-detection-popup';

// ---------------------------------------------------------------------------
// Multi-Item helpers
// ---------------------------------------------------------------------------

/** Status indicator dot/icon for tab items */
function renderStatusIndicator(status: FlaggedItem['status']): string {
  const S = OBFUSCA_STYLES;
  switch (status) {
    case 'protected':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${S.colors.success}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>`;
    case 'skipped':
      return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${S.colors.mutedForeground}" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    default: // pending
      return `<span style="
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: ${S.colors.info};
        flex-shrink: 0;
      "></span>`;
  }
}

/** File or chat icon for tab items */
function renderItemTypeIcon(type: FlaggedItem['type']): string {
  if (type === 'file') {
    return ICON_FILE;
  }
  // Chat icon (message bubble)
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
}

// ---------------------------------------------------------------------------
// Tab Bar
// ---------------------------------------------------------------------------

function renderTabBar(state: PopupState): string {
  if (state.items.length <= 1) return '';

  const S = OBFUSCA_STYLES;
  const protectedCount = state.items.filter(i => i.status === 'protected').length;
  const total = state.items.length;

  const tabsHtml = state.items.map((item, idx) => {
    const isActive = item.id === state.activeItemId;
    return `
      <button class="obfusca-multi-tab" data-item-id="${escapeHtml(item.id)}" style="
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: ${isActive ? S.colors.card : 'transparent'};
        border: ${isActive ? `1px solid ${S.colors.border}` : '1px solid transparent'};
        border-radius: ${S.radius.sm};
        cursor: pointer;
        transition: all ${S.transitions.fast};
        font-family: ${S.fonts.sans};
        font-size: 11px;
        color: ${isActive ? S.colors.foreground : S.colors.mutedForeground};
        white-space: nowrap;
        flex-shrink: 0;
        opacity: ${item.status === 'skipped' ? '0.5' : '1'};
      ">
        ${renderStatusIndicator(item.status)}
        <span style="display: flex; align-items: center; flex-shrink: 0;">${renderItemTypeIcon(item.type)}</span>
        <span style="
          max-width: 100px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: ${isActive ? '500' : '400'};
        ">${escapeHtml(truncate(item.name, 20))}</span>
        <span style="
          font-size: 9px;
          color: ${S.colors.mutedForeground};
          opacity: 0.7;
        ">${idx + 1}/${total}</span>
      </button>
    `;
  }).join('');

  // Shield icon for progress
  const shieldIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${S.colors.success}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`;

  return `
    <div style="
      padding: 8px 16px;
      background: ${S.colors.background};
      border-bottom: 1px solid ${S.colors.border};
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
      overflow: hidden;
    ">
      <div style="
        display: flex;
        align-items: center;
        gap: 4px;
        overflow-x: auto;
        flex: 1;
        min-width: 0;
        scrollbar-width: thin;
      ">
        ${tabsHtml}
      </div>
      <div style="
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        color: ${S.colors.mutedForeground};
        flex-shrink: 0;
        padding-left: 8px;
        border-left: 1px solid ${S.colors.border};
        margin-left: 4px;
      ">
        ${shieldIcon}
        <span style="white-space: nowrap; font-weight: 500; color: ${protectedCount === total ? S.colors.success : S.colors.mutedForeground};">${protectedCount}/${total} protected</span>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Multi-Item Header
// ---------------------------------------------------------------------------

function renderMultiItemHeader(state: PopupState): string {
  const S = OBFUSCA_STYLES;
  const total = state.items.length;
  const effectiveMode = getEffectivePopupMode(state.items);
  const pendingCount = state.items.filter(i => i.status === 'pending').length;
  const isBlockMode = effectiveMode === 'block';

  let title: string;
  let subtitle: string;
  let accentColor: string;
  let headerBg: string;
  let shieldIcon: string;

  if (isBlockMode) {
    const blockedCount = state.items.filter(i => i.response && i.response.action === 'block').length;
    title = 'Sensitive Content Blocked';
    subtitle = `${total} item${total !== 1 ? 's' : ''} \u2022 ${blockedCount} blocked`;
    accentColor = S.colors.destructive;
    headerBg = `${S.colors.destructive}14`;
    // Shield with X (block icon)
    shieldIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <line x1="8" y1="8" x2="16" y2="16"/><line x1="16" y1="8" x2="8" y2="16"/>
    </svg>`;
  } else {
    title = 'Sensitive Content Detected';
    subtitle = `${total} item${total !== 1 ? 's' : ''} \u2022 ${pendingCount} require review`;
    accentColor = S.colors.warning; // amber for warn mode
    headerBg = `${S.colors.warning}14`;
    // Shield with exclamation (warn icon)
    shieldIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>`;
  }

  return `
    <div style="
      padding: 10px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: ${headerBg};
      border-bottom: 1px solid ${accentColor}20;
      flex-shrink: 0;
    ">
      <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
        <div style="
          width: 30px;
          height: 30px;
          background: ${accentColor}15;
          border-radius: ${S.radius.md};
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: ${accentColor};
        ">
          ${shieldIcon}
        </div>
        <div style="min-width: 0;">
          <div style="
            font-size: 13px;
            font-weight: 600;
            color: ${S.colors.foreground};
            letter-spacing: -0.01em;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          ">${escapeHtml(title)}</div>
          <div style="
            font-size: 11px;
            color: ${S.colors.mutedForeground};
            margin-top: 1px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          ">${escapeHtml(subtitle)}</div>
        </div>
      </div>
      <button id="obfusca-multi-popup-close" aria-label="Close" style="
        background: transparent;
        border: none;
        border-radius: ${S.radius.sm};
        width: 26px;
        height: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: ${S.colors.mutedForeground};
        flex-shrink: 0;
        transition: all ${S.transitions.fast};
      "
        onmouseover="this.style.background='${S.colors.muted}';this.style.color='${S.colors.foreground}'"
        onmouseout="this.style.background='transparent';this.style.color='${S.colors.mutedForeground}'"
      >
        ${ICON_X}
      </button>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Multi-Item Content Area
// ---------------------------------------------------------------------------

function renderMultiItemContent(activeItem: FlaggedItem, state: PopupState): string {
  const S = OBFUSCA_STYLES;

  if (!activeItem.mappings || activeItem.mappings.length === 0) {
    return `
      <div style="
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        color: ${S.colors.mutedForeground};
        font-size: 12px;
        font-family: ${S.fonts.sans};
      ">No detections for this item.</div>
    `;
  }

  // Left panel: detection list
  const leftPanelHtml = renderMultiItemDetectionList(activeItem, state);

  // Right panel: content preview
  const rightPanelHtml = renderMultiItemPreview(activeItem, state);

  return `
    <div style="
      flex: 1;
      display: grid;
      grid-template-columns: 320px 1fr;
      min-height: 0;
      overflow: hidden;
    ">
      <!-- Left panel: detection list -->
      <div style="
        overflow-y: auto;
        overflow-x: hidden;
        border-right: 1px solid ${S.colors.border};
        background: ${S.colors.card};
      ">
        ${leftPanelHtml}
      </div>
      <!-- Right panel: preview -->
      <div style="
        display: flex;
        flex-direction: column;
        overflow: hidden;
        min-height: 0;
        background: ${S.colors.background};
      ">
        ${rightPanelHtml}
      </div>
    </div>
  `;
}

/** Render detection list for an active item in the multi-item popup */
function renderMultiItemDetectionList(item: FlaggedItem, state: PopupState): string {
  const mappings = item.mappings || [];

  if (mappings.length === 0) {
    return `<div style="padding: 16px; color: ${OBFUSCA_STYLES.colors.mutedForeground}; text-align: center;">No detections found</div>`;
  }

  // Initialize redaction choices if not set
  if (!state.redactionChoices) {
    state.redactionChoices = new Map();
  }

  const S = OBFUSCA_STYLES;

  // Global mode toggle (Mask All / Smart Replace)
  const currentGlobalMode = state.globalRedactMode || 'mask';

  let html = `
    <div style="display: flex; flex-direction: column; height: 100%;">
      <!-- Detection Header with Global Toggle -->
      <div style="
        padding: 8px 12px;
        border-bottom: 1px solid ${S.colors.border};
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      ">
        <span style="font-size: 11px; font-weight: 600; color: ${S.colors.mutedForeground}; text-transform: uppercase; letter-spacing: 0.5px;">
          ${mappings.length} Detection${mappings.length !== 1 ? 's' : ''}
        </span>
        <div style="display: flex; gap: 2px; background: ${S.colors.secondary}; border-radius: 4px; padding: 2px;">
          <button class="obfusca-global-mode-btn" data-mode="mask" style="
            padding: 3px 8px; border-radius: 3px; border: none; cursor: pointer;
            font-size: 10px; font-weight: 500; transition: all 0.15s;
            font-family: ${S.fonts.sans};
            ${currentGlobalMode === 'mask'
              ? `background: ${S.colors.info}; color: #fff;`
              : `background: transparent; color: ${S.colors.mutedForeground};`}
          ">Mask All</button>
          <button class="obfusca-global-mode-btn" data-mode="dummy" style="
            padding: 3px 8px; border-radius: 3px; border: none; cursor: pointer;
            font-size: 10px; font-weight: 500; transition: all 0.15s;
            font-family: ${S.fonts.sans};
            ${currentGlobalMode === 'dummy'
              ? `background: #10b981; color: #000;`
              : `background: transparent; color: ${S.colors.mutedForeground};`}
          ">Smart Replace</button>
        </div>
      </div>

      <!-- Detection Items -->
      <div style="flex: 1; overflow-y: auto; padding: 4px 0;">
  `;

  mappings.forEach((mapping, index) => {
    const choice = state.redactionChoices?.get(index);
    const isEnabled = choice?.enabled !== false; // default true
    const mode = choice?.mode || currentGlobalMode || 'mask';

    // Get replacement value based on mode
    let replacementValue = '';
    if (mode === 'mask') {
      replacementValue = mapping.masked_value || mapping.placeholder || `[${mapping.type.toUpperCase()}_REDACTED]`;
    } else if (mode === 'dummy') {
      replacementValue = mapping.dummy_value || mapping.original_preview || '***';
    }

    // Override with custom value if set
    if (choice?.customValue) {
      replacementValue = choice.customValue;
    }

    const replacementBg = mode === 'mask' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(16, 185, 129, 0.15)';
    const replacementBorder = mode === 'mask' ? 'rgba(168, 85, 247, 0.3)' : 'rgba(16, 185, 129, 0.3)';

    html += `
      <div class="obfusca-detection-item" data-index="${index}" style="
        padding: 8px 12px;
        border-bottom: 1px solid ${S.colors.border}22;
        display: flex;
        flex-direction: column;
        gap: 4px;
        opacity: ${isEnabled ? '1' : '0.4'};
        transition: all 0.15s;
        cursor: pointer;
        position: relative;
      ">
        <!-- Row 1: Checkbox + Type + Original Preview + Controls -->
        <div style="display: flex; align-items: center; gap: 8px;">
          <!-- Checkbox -->
          <input type="checkbox" class="obfusca-detection-checkbox" data-index="${index}"
            ${isEnabled ? 'checked' : ''}
            style="
              width: 14px; height: 14px; cursor: pointer;
              accent-color: ${S.colors.info};
              flex-shrink: 0;
            "
          />

          <!-- Type Badge (prefer display_name for semantic detections) -->
          <span style="
            font-size: 9px; font-weight: 600; text-transform: uppercase;
            padding: 2px 6px; border-radius: 3px;
            background: ${S.colors.info}22;
            color: ${S.colors.info};
            letter-spacing: 0.5px;
            flex-shrink: 0;
          ">${escapeHtml(mapping.display_name || mapping.type.split('__')[0].replace(/_/g, ' '))}</span>

          <!-- Original Value (extracted from content using positions when available) -->
          <span style="
            font-size: 11px; color: ${S.colors.mutedForeground};
            font-family: ${S.fonts.mono};
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            flex: 1;
          ">${escapeHtml(
            (mapping.start != null && mapping.end != null && item.content)
              ? item.content.substring(mapping.start, mapping.end)
              : (mapping.original_preview || '***')
          )}</span>

          <!-- Per-item Mode Toggle -->
          <div style="display: flex; gap: 1px; flex-shrink: 0;">
            <button class="obfusca-item-mode-btn" data-index="${index}" data-mode="mask" title="Mask" style="
              width: 20px; height: 18px; border: none; cursor: pointer; border-radius: 2px 0 0 2px;
              font-size: 9px; font-weight: 600; transition: all 0.15s;
              font-family: ${S.fonts.sans};
              ${mode === 'mask'
                ? `background: ${S.colors.info}; color: #fff;`
                : `background: ${S.colors.secondary}; color: ${S.colors.mutedForeground};`}
            ">M</button>
            <button class="obfusca-item-mode-btn" data-index="${index}" data-mode="dummy" title="Smart Replace" style="
              width: 20px; height: 18px; border: none; cursor: pointer; border-radius: 0 2px 2px 0;
              font-size: 9px; font-weight: 600; transition: all 0.15s;
              font-family: ${S.fonts.sans};
              ${mode === 'dummy'
                ? `background: #10b981; color: #000;`
                : `background: ${S.colors.secondary}; color: ${S.colors.mutedForeground};`}
            ">D</button>
          </div>

          <!-- Edit Button -->
          <button class="obfusca-edit-btn" data-index="${index}" title="Custom value" style="
            width: 20px; height: 18px; border: none; cursor: pointer; border-radius: 2px;
            background: transparent; color: ${S.colors.mutedForeground};
            font-size: 11px; transition: all 0.15s; flex-shrink: 0;
            font-family: ${S.fonts.sans};
            opacity: 0;
          ">&#x270E;</button>
        </div>

        <!-- Row 2: Replacement Preview -->
        ${isEnabled && replacementValue ? `
          <div style="
            margin-left: 22px;
            padding: 3px 8px;
            background: ${replacementBg};
            border: 1px solid ${replacementBorder};
            border-radius: 3px;
            font-size: 10px;
            font-family: ${S.fonts.mono};
            color: ${S.colors.foreground};
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          ">&rarr; ${escapeHtml(replacementValue)}</div>
        ` : ''}
      </div>
    `;
  });

  html += `
      </div>
    </div>
  `;

  return html;
}

/** Render preview pane for an active item in the multi-item popup */
function renderMultiItemPreview(item: FlaggedItem, state: PopupState): string {
  const S = OBFUSCA_STYLES;
  const content = item.content || '';
  const isFile = item.type === 'file';
  const fileName = isFile ? item.name : 'Untitled';
  const mappings = item.mappings || [];

  // Determine view mode
  const viewMode = state.previewViewMode || 'highlighted';

  // Build preview content based on view mode
  let previewContent = '';
  if (viewMode === 'original') {
    previewContent = escapeHtml(content);
  } else if (viewMode === 'highlighted' && mappings.length > 0) {
    previewContent = renderContentWithHighlights(content, mappings, state);
  } else if (viewMode === 'protected') {
    // Build protected text by applying replacements
    previewContent = escapeHtml(buildProtectedText(content, mappings, state));
  } else {
    previewContent = escapeHtml(content);
  }

  // Get file type info for icon
  const fileTypeInfo = detectFileType(isFile ? fileName : null, !isFile);
  const icon = fileTypeInfo.icon;
  const label = isFile ? fileName : 'AI Text Input';

  // Copy icon
  const copyIcon = getGenericIcon('copy');

  return `
    <div style="display: flex; flex-direction: column; height: 100%; background: ${S.colors.background};">
      <!-- Preview Header -->
      <div style="
        padding: 6px 12px;
        border-bottom: 1px solid ${S.colors.border};
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
        background: ${S.colors.secondary};
      ">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="display: flex; align-items: center;">${icon}</span>
          <span style="font-size: 11px; font-weight: 500; color: ${S.colors.foreground};">${escapeHtml(label)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          <!-- View mode radio toggles -->
          <div style="display: flex; gap: 2px; background: ${S.colors.background}; border-radius: 4px; padding: 2px;">
            <button class="obfusca-view-mode-btn" data-mode="original" style="
              padding: 2px 6px; border-radius: 3px; border: none; cursor: pointer;
              font-size: 9px; transition: all 0.15s;
              font-family: ${S.fonts.sans};
              ${viewMode === 'original'
                ? `background: ${S.colors.mutedForeground}; color: ${S.colors.background};`
                : `background: transparent; color: ${S.colors.mutedForeground};`}
            ">Original</button>
            <button class="obfusca-view-mode-btn" data-mode="highlighted" style="
              padding: 2px 6px; border-radius: 3px; border: none; cursor: pointer;
              font-size: 9px; transition: all 0.15s;
              font-family: ${S.fonts.sans};
              ${viewMode === 'highlighted'
                ? `background: ${S.colors.mutedForeground}; color: ${S.colors.background};`
                : `background: transparent; color: ${S.colors.mutedForeground};`}
            ">Highlighted</button>
            <button class="obfusca-view-mode-btn" data-mode="protected" style="
              padding: 2px 6px; border-radius: 3px; border: none; cursor: pointer;
              font-size: 9px; transition: all 0.15s;
              font-family: ${S.fonts.sans};
              ${viewMode === 'protected'
                ? `background: ${S.colors.mutedForeground}; color: ${S.colors.background};`
                : `background: transparent; color: ${S.colors.mutedForeground};`}
            ">Protected</button>
          </div>

          <!-- Copy Button -->
          <button class="obfusca-preview-copy-btn" title="Copy" style="
            width: 24px; height: 20px; border: none; cursor: pointer; border-radius: 3px;
            background: transparent; color: ${S.colors.mutedForeground};
            font-size: 12px; transition: all 0.15s;
            display: flex; align-items: center; justify-content: center;
          ">${copyIcon}</button>
        </div>
      </div>

      <!-- Preview Content -->
      <div class="obfusca-code-preview" style="
        flex: 1;
        overflow: auto;
        padding: 12px;
        font-family: ${S.fonts.mono};
        font-size: 11px;
        line-height: 1.6;
        color: ${S.colors.foreground};
        white-space: pre-wrap;
        word-break: break-word;
      ">${previewContent}</div>
    </div>
  `;
}

/** Build protected text by applying all enabled replacements */
function buildProtectedText(content: string, mappings: MappingItem[], state: PopupState): string {
  if (!mappings || mappings.length === 0) return content;

  const sortedMappings = mappings
    .map((m, i) => ({ ...m, _idx: i }))
    .filter(m => m.start !== undefined && m.end !== undefined)
    .sort((a, b) => a.start - b.start);

  let result = '';
  let lastEnd = 0;

  for (const mapping of sortedMappings) {
    const choice = state.redactionChoices?.get(mapping._idx);
    const isEnabled = choice?.enabled !== false;
    const mode = choice?.mode || state.globalRedactMode || 'mask';

    if (mapping.start > lastEnd) {
      result += content.substring(lastEnd, mapping.start);
    }

    if (isEnabled) {
      let replacementText = '';
      if (choice?.customValue) {
        replacementText = choice.customValue;
      } else if (mode === 'mask') {
        replacementText = mapping.masked_value || mapping.placeholder || `[${mapping.type.toUpperCase()}_REDACTED]`;
      } else {
        replacementText = mapping.dummy_value || content.substring(mapping.start, mapping.end);
      }
      result += replacementText;
    } else {
      result += content.substring(mapping.start, mapping.end);
    }

    lastEnd = mapping.end;
  }

  if (lastEnd < content.length) {
    result += content.substring(lastEnd);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Content highlighting for preview
// ---------------------------------------------------------------------------

/** Render content with colored highlights showing replacements inline */
function renderContentWithHighlights(
  content: string,
  mappings: MappingItem[],
  state: PopupState
): string {
  if (!mappings || mappings.length === 0) {
    return escapeHtml(content);
  }

  // Sort mappings by start position
  const sortedMappings = mappings
    .map((m, i) => ({ ...m, _idx: i }))
    .filter(m => m.start !== undefined && m.end !== undefined)
    .sort((a, b) => a.start - b.start);

  let result = '';
  let lastEnd = 0;

  for (const mapping of sortedMappings) {
    const choice = state.redactionChoices?.get(mapping._idx);
    const isEnabled = choice?.enabled !== false;
    const mode = choice?.mode || state.globalRedactMode || 'mask';

    // Add text before this detection
    if (mapping.start > lastEnd) {
      result += escapeHtml(content.substring(lastEnd, mapping.start));
    }

    // Add highlighted detection
    const originalText = content.substring(mapping.start, mapping.end);

    if (isEnabled) {
      let replacementText = '';
      if (choice?.customValue) {
        replacementText = choice.customValue;
      } else if (mode === 'mask') {
        replacementText = mapping.masked_value || mapping.placeholder || `[${mapping.type.toUpperCase()}_REDACTED]`;
      } else {
        replacementText = mapping.dummy_value || originalText;
      }

      const highlightColor = mode === 'mask' ? 'rgba(168, 85, 247, 0.25)' : 'rgba(16, 185, 129, 0.25)';
      const borderColor = mode === 'mask' ? 'rgba(168, 85, 247, 0.5)' : 'rgba(16, 185, 129, 0.5)';

      result += `<mark style="
        background: ${highlightColor};
        border-bottom: 2px solid ${borderColor};
        border-radius: 2px;
        padding: 0 2px;
        color: inherit;
      " title="Original: ${escapeHtml(mapping.original_preview || '***')}">${escapeHtml(replacementText)}</mark>`;
    } else {
      // Disabled -- show original with strikethrough style
      result += `<span style="opacity: 0.5; text-decoration: line-through;">${escapeHtml(originalText)}</span>`;
    }

    lastEnd = mapping.end;
  }

  // Add remaining text
  if (lastEnd < content.length) {
    result += escapeHtml(content.substring(lastEnd));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Multi-Item Footer
// ---------------------------------------------------------------------------

function renderMultiItemFooter(state: PopupState): string {
  const S = OBFUSCA_STYLES;
  const activeItem = state.items.find(i => i.id === state.activeItemId);
  const activeIndex = state.items.findIndex(i => i.id === state.activeItemId);
  const total = state.items.length;
  const isFirst = activeIndex <= 0;
  const isLast = activeIndex >= total - 1;
  const pendingItems = state.items.filter(i => i.status === 'pending');
  const isActiveBlocked = activeItem && activeItem.response && activeItem.response.action === 'block';
  const isActiveDone = activeItem && activeItem.status !== 'pending';
  const effectiveMode = getEffectivePopupMode(state.items);
  const isBlockMode = effectiveMode === 'block';

  // Determine the primary button label
  const isLastPending = pendingItems.length <= 1;
  const primaryLabel = isLastPending ? 'Protect & Finish' : 'Protect & Next';

  const btnBase = `
    padding: 6px 12px;
    border-radius: ${S.radius.sm};
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all ${S.transitions.base};
    font-family: ${S.fonts.sans};
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    white-space: nowrap;
  `;
  const primaryStyle = `${btnBase}
    background: ${S.colors.foreground};
    color: ${S.colors.background};
    border: none;
  `;
  const secondaryStyle = `${btnBase}
    background: transparent;
    color: ${S.colors.foreground};
    border: 1px solid ${S.colors.border};
  `;
  const dangerOutlineStyle = `${btnBase}
    background: transparent;
    color: ${S.colors.destructive};
    border: 1px solid ${S.colors.destructive}40;
  `;
  const ghostStyle = `${btnBase}
    background: transparent;
    color: ${S.colors.mutedForeground};
    border: none;
  `;
  const disabledStyle = `${btnBase}
    background: ${S.colors.secondary};
    color: ${S.colors.mutedForeground};
    border: 1px solid ${S.colors.border};
    opacity: 0.4;
    cursor: not-allowed;
  `;

  // Navigation arrows (only for multi-item)
  let navigationHtml = '';
  if (total > 1) {
    const prevArrow = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
    const nextArrow = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

    navigationHtml = `
      <div style="display: flex; align-items: center; gap: 2px;">
        <button id="obfusca-multi-prev" ${isFirst ? 'disabled' : ''} style="
          ${isFirst ? disabledStyle : ghostStyle}
          padding: 4px 6px;
        ">${prevArrow}</button>
        <span style="
          font-size: 10px;
          color: ${S.colors.mutedForeground};
          min-width: 30px;
          text-align: center;
          font-variant-numeric: tabular-nums;
        ">${activeIndex + 1} / ${total}</span>
        <button id="obfusca-multi-next" ${isLast ? 'disabled' : ''} style="
          ${isLast ? disabledStyle : ghostStyle}
          padding: 4px 6px;
        ">${nextArrow}</button>
      </div>
    `;
  }

  // Save Copy button for file items
  const saveCopyHtml = (activeItem && activeItem.type === 'file') ? `
    <button id="obfusca-multi-save-copy" style="${ghostStyle}">
      ${ICON_DOWNLOAD} Save Copy
    </button>
  ` : '';

  // Action buttons on the right
  let actionsHtml = '';
  if (isActiveDone) {
    // Already handled, show status
    const statusText = activeItem!.status === 'protected' ? 'Protected' : 'Skipped';
    const statusColor = activeItem!.status === 'protected' ? S.colors.success : S.colors.mutedForeground;
    actionsHtml = `
      <span style="
        font-size: 11px;
        color: ${statusColor};
        font-weight: 500;
        padding: 6px 12px;
      ">${ICON_CHECK} ${statusText}</span>
    `;
  } else {
    // Skip button
    actionsHtml += `<button id="obfusca-multi-skip" style="${secondaryStyle}">Skip</button>`;

    // Send Anyway button: different styling for block vs warn
    if (!isActiveBlocked) {
      if (isBlockMode) {
        // Block mode: red "Send Anyway" with warning icon (two-step confirmation)
        const warningIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
        actionsHtml += `<button id="obfusca-multi-bypass" style="${dangerOutlineStyle}">${warningIcon} Send Anyway</button>`;
      } else {
        // Warn mode: amber "Send Anyway" (single-click, no confirmation)
        const warnOutlineStyle = `${btnBase}
          background: transparent;
          color: ${S.colors.warning};
          border: 1px solid ${S.colors.warning}40;
        `;
        actionsHtml += `<button id="obfusca-multi-bypass" data-mode="warn" style="${warnOutlineStyle}">Send Anyway</button>`;
      }
    }

    // Primary protect button
    actionsHtml += `<button id="obfusca-multi-protect" style="${primaryStyle}">${ICON_ENTER} ${escapeHtml(primaryLabel)}</button>`;
  }

  return `
    <div style="
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px;
      border-top: 1px solid ${S.colors.border};
      flex-shrink: 0;
    ">
      <div style="display: flex; align-items: center; gap: 6px;">
        <div style="
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          color: ${S.colors.mutedForeground};
          letter-spacing: 0.2px;
        ">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Protected by Obfusca
        </div>
        <span style="
          font-size: 9px;
          color: ${S.colors.mutedForeground};
          opacity: 0.5;
          margin-left: 4px;
        ">${isBlockMode ? 'Enter to protect \u00B7 Esc to edit' : 'Enter to protect \u00B7 Shift+Enter to send \u00B7 Esc to edit'}</span>
        ${saveCopyHtml}
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        ${navigationHtml}
        ${actionsHtml}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// showMultiItemPopup -- main entry point
// ---------------------------------------------------------------------------

/**
 * Show a multi-item detection popup with tab navigation.
 *
 * Supports reviewing multiple flagged items (files + chat) with per-item
 * protection, skip, and bypass actions. The content area reuses the existing
 * detection list and code preview components.
 *
 * @param items - Array of flagged items to review
 * @param callbacks - Callback functions for user actions
 * @returns The popup HTMLElement
 */
export function showMultiItemPopup(
  items: FlaggedItem[],
  callbacks: MultiItemCallbacks,
  anchorElement?: HTMLElement
): HTMLElement {
  // Remove any existing multi-item or single-item popups
  removeMultiItemPopup();
  removeDetectionPopup();

  injectAnimationStyles();
  injectScrollbarStyles();

  const S = OBFUSCA_STYLES;

  // Internal state
  const state: PopupState = {
    items: [...items],
    activeItemId: items.length > 0 ? items[0].id : '',
    globalMode: 'mask',
  };

  // Create popup container (inline bubble anchored above the chat input)
  const popup = document.createElement('div');
  popup.id = MULTI_POPUP_ID;

  const maxHeightValue = 520;

  // Initial position will be applied by positionBubble() after the element is in the DOM.

  popup.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    transform: none;
    z-index: 2147483647;
    font-family: ${S.fonts.sans};
    width: 750px;
    max-width: calc(100vw - 32px);
    max-height: min(${maxHeightValue}px, 70vh);
    display: flex;
    flex-direction: column;
    background: ${S.colors.card};
    border: 1px solid ${S.colors.border};
    border-radius: 16px;
    box-shadow: 0 -4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08);
    overflow: visible;
    animation: ${POPUP_ANIMATION_NAME} 0.18s ease-out forwards;
  `;

  // Inner content wrapper
  const multiInnerWrapper = document.createElement('div');
  multiInnerWrapper.id = 'obfusca-multi-inner';
  multiInnerWrapper.style.cssText = `
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 16px;
    flex: 1;
    min-height: 0;
    max-height: min(${maxHeightValue}px, 70vh);
  `;
  popup.appendChild(multiInnerWrapper);

  document.body.appendChild(popup);

  // If an anchor element was provided, set initial position and continuously reposition
  // the popup so it follows the input as it moves (fresh chat → after first message, grows, etc.).
  if (anchorElement) {
    positionBubble(popup, anchorElement);

    const multiPositionInterval = setInterval(() => {
      if (!popup.isConnected || !anchorElement.isConnected) {
        clearInterval(multiPositionInterval);
        return;
      }
      positionBubble(popup, anchorElement);
    }, 100);
    (popup as any).__obfuscaPositionInterval = multiPositionInterval;
  } else {
    // No anchor: fall back to a sensible fixed position centred in the viewport.
    popup.style.bottom = '92px';
  }

  // Outside-click to dismiss
  const multiOutsideClickHandler = (e: MouseEvent) => {
    if (!popup.contains(e.target as Node)) {
      handleClose();
    }
  };
  // Use 150ms delay (not 0ms) — same reason as single-item popup: prevents the send-button click
  // that triggered analysis from immediately dismissing the popup via the outside-click handler.
  setTimeout(() => {
    document.addEventListener('mousedown', multiOutsideClickHandler, { capture: false });
    (popup as any).__obfuscaOutsideClickHandler = multiOutsideClickHandler;
  }, 150);

  // ------------------------------------------------------------------
  // Render / re-render function
  // ------------------------------------------------------------------

  function render(): void {
    const activeItem = state.items.find(i => i.id === state.activeItemId);
    if (!activeItem && state.items.length > 0) {
      state.activeItemId = state.items[0].id;
    }
    const resolvedItem = state.items.find(i => i.id === state.activeItemId);

    const headerHtml = renderMultiItemHeader(state);
    const tabBarHtml = renderTabBar(state);
    const contentHtml = resolvedItem
      ? renderMultiItemContent(resolvedItem, state)
      : `<div style="flex:1;display:flex;align-items:center;justify-content:center;color:${S.colors.mutedForeground};font-size:12px;">No items to review.</div>`;
    const footerHtml = renderMultiItemFooter(state);

    // Update inner wrapper only so the arrow element at the popup root is preserved
    const innerWrapper = document.getElementById('obfusca-multi-inner') || multiInnerWrapper;
    innerWrapper.innerHTML = `
      ${headerHtml}
      ${tabBarHtml}
      ${contentHtml}
      ${footerHtml}
    `;

    attachEventListeners();
  }

  // ------------------------------------------------------------------
  // Event listener attachment (runs after each render)
  // ------------------------------------------------------------------

  function attachEventListeners(): void {
    // Close button
    const closeBtn = popup.querySelector('#obfusca-multi-popup-close') as HTMLElement | null;
    if (closeBtn) {
      closeBtn.addEventListener('click', handleClose);
    }

    // Tab clicks
    const tabs = popup.querySelectorAll('.obfusca-multi-tab') as NodeListOf<HTMLElement>;
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const itemId = tab.getAttribute('data-item-id');
        if (itemId && itemId !== state.activeItemId) {
          state.activeItemId = itemId;
          render();
        }
      });
      tab.addEventListener('mouseenter', () => {
        const itemId = tab.getAttribute('data-item-id');
        if (itemId !== state.activeItemId) {
          tab.style.background = S.colors.secondary;
        }
      });
      tab.addEventListener('mouseleave', () => {
        const itemId = tab.getAttribute('data-item-id');
        if (itemId !== state.activeItemId) {
          tab.style.background = 'transparent';
        }
      });
    });

    // Prev/Next navigation
    const prevBtn = popup.querySelector('#obfusca-multi-prev') as HTMLElement | null;
    const nextBtn = popup.querySelector('#obfusca-multi-next') as HTMLElement | null;

    if (prevBtn && !prevBtn.hasAttribute('disabled')) {
      prevBtn.addEventListener('click', () => {
        const currentIdx = state.items.findIndex(i => i.id === state.activeItemId);
        if (currentIdx > 0) {
          state.activeItemId = state.items[currentIdx - 1].id;
          render();
        }
      });
    }
    if (nextBtn && !nextBtn.hasAttribute('disabled')) {
      nextBtn.addEventListener('click', () => {
        const currentIdx = state.items.findIndex(i => i.id === state.activeItemId);
        if (currentIdx < state.items.length - 1) {
          state.activeItemId = state.items[currentIdx + 1].id;
          render();
        }
      });
    }

    // Protect button
    const protectBtn = popup.querySelector('#obfusca-multi-protect') as HTMLElement | null;
    if (protectBtn) {
      protectBtn.addEventListener('click', async () => {
        const activeItem = state.items.find(i => i.id === state.activeItemId);
        if (!activeItem) return;

        // Disable button while processing
        protectBtn.style.opacity = '0.5';
        protectBtn.style.cursor = 'wait';
        protectBtn.innerHTML = `${ICON_SPINNER} Protecting...`;

        try {
          // Compute mode-aware replacements BEFORE calling the callback.
          // This ensures the user's mask/dummy choice is actually applied.
          const currentMode = state.globalRedactMode || 'mask';

          if (activeItem.type === 'chat' && activeItem.content && activeItem.mappings.length > 0) {
            // For chat: compute the full protected text using mode selection
            activeItem.protectedContent = buildProtectedText(
              activeItem.content,
              activeItem.mappings,
              state
            );
            console.log('[Obfusca Multi] Chat protected text computed using mode:', currentMode);
          }

          if (activeItem.type === 'file' && activeItem.mappings.length > 0) {
            // For files: compute per-mapping replacements using mode selection.
            // Use resolveOriginalValue() for proper bounds checking.
            // The extracted text comes from the backend's extracted_text field
            // via item.content. If positions exceed content length, the backend
            // may not be sending the full extracted text (check /files/analyze).
            const extractedText = activeItem.content || '';
            const extractedLength = (activeItem.response as any)?.extractedLength;
            if (extractedLength && extractedText.length < extractedLength) {
              console.warn(`[Obfusca Multi] extracted_text truncated: received ${extractedText.length} chars but extractedLength=${extractedLength}. Backend may be truncating the response.`);
            }
            activeItem.protectedReplacements = activeItem.mappings
              .map((m, idx) => {
                const choice = state.redactionChoices?.get(idx);
                const isEnabled = choice?.enabled !== false;
                const mode = choice?.mode || currentMode;

                const origVal = resolveOriginalValue(m, extractedText);
                if (!origVal) {
                  console.warn(`[Obfusca Multi] Cannot resolve original value for mapping ${idx} (start=${m.start}, end=${m.end}, textLen=${extractedText.length}, extractedLength=${extractedLength || 'unknown'})`);
                  return null; // will be filtered out below
                }

                let replacement: string;
                if (!isEnabled) {
                  replacement = origVal; // no-op: keep original
                } else if (choice?.customValue) {
                  replacement = choice.customValue;
                } else if (mode === 'dummy') {
                  replacement = m.dummy_value || m.masked_value || `[${m.type.toUpperCase()}_REDACTED]`;
                } else {
                  replacement = m.masked_value || `[${m.type.toUpperCase()}_REDACTED]`;
                }

                return { original_value: origVal, replacement };
              })
              .filter((c): c is { original_value: string; replacement: string } => c !== null);
            console.log(`[Obfusca Multi] File replacements computed: ${activeItem.protectedReplacements.length}/${activeItem.mappings.length} using mode: ${currentMode}`);
          }

          await callbacks.onProtectItem(activeItem);
          activeItem.status = 'protected';
          advanceToNextPending();
        } catch (_err) {
          // Re-render to restore button state
          render();
        }
      });
      protectBtn.addEventListener('mouseenter', () => {
        protectBtn.style.opacity = '0.9';
        protectBtn.style.transform = 'translateY(-1px)';
      });
      protectBtn.addEventListener('mouseleave', () => {
        protectBtn.style.opacity = '1';
        protectBtn.style.transform = '';
      });
    }

    // Skip button
    const skipBtn = popup.querySelector('#obfusca-multi-skip') as HTMLElement | null;
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        const activeItem = state.items.find(i => i.id === state.activeItemId);
        if (!activeItem) return;

        callbacks.onSkipItem(activeItem);
        activeItem.status = 'skipped';
        advanceToNextPending();
      });
      skipBtn.addEventListener('mouseenter', () => {
        skipBtn.style.background = S.colors.secondary;
      });
      skipBtn.addEventListener('mouseleave', () => {
        skipBtn.style.background = 'transparent';
      });
    }

    // Bypass (Send Anyway) button -- two-step for block, single-click for warn
    const bypassBtn = popup.querySelector('#obfusca-multi-bypass') as HTMLElement | null;
    if (bypassBtn) {
      const isBtnWarnMode = bypassBtn.getAttribute('data-mode') === 'warn';

      bypassBtn.addEventListener('click', async () => {
        const activeItem = state.items.find(i => i.id === state.activeItemId);
        if (!activeItem) return;

        // Build detection summary from the active item's mappings
        const itemDetections: Detection[] = [];
        const itemMappings = activeItem.mappings || [];
        const summary = buildDetectionSummary(itemDetections, itemMappings);

        if (!isBtnWarnMode) {
          // BLOCK MODE: Show two-step confirmation dialog inside the popup
          const popupCard = popup.querySelector('[style*="position: relative"]') as HTMLElement || popup;
          const confirmed = await showBypassConfirmation(popupCard, summary);
          if (!confirmed) return; // User cancelled -- stay on popup

          // User confirmed: log bypass event asynchronously (includes raw values)
          fireBypassEvent(
            itemDetections,
            itemMappings,
            activeItem.content,
          );
        } else {
          // WARN MODE: Single-click send (no confirmation dialog)
          // Log as a warn event (lighter, no raw values)
          fireWarnEvent(
            itemDetections,
            itemMappings,
            activeItem.content,
          );
        }

        // Set the bypass flag BEFORE triggering submit.
        // This ensures the re-triggered submit skips all scanning (no infinite loop).
        setBypassFlag();

        callbacks.onBypassItem(activeItem);
        // Remove the item from the list
        state.items = state.items.filter(i => i.id !== activeItem.id);

        if (state.items.length === 0) {
          // All items handled -- fire onAllComplete so the interceptor
          // triggers the submit with the original (unprotected) content.
          // We pass the item back (status 'pending' = bypassed/warned)
          // so the interceptor's onAllComplete handler sends the original text.
          if (!allCompleteAlreadyFired) {
            allCompleteAlreadyFired = true;
            callbacks.onAllComplete([activeItem]);
          }
          removeMultiItemPopup();

          // Warn mode: show "Sent with warnings" toast that auto-dismisses
          if (isBtnWarnMode) {
            showWarnSentToast();
          }
          return;
        }

        // Move to next item or first
        const currentIdx = Math.min(
          state.items.findIndex(i => i.status === 'pending'),
          state.items.length - 1
        );
        state.activeItemId = state.items[Math.max(0, currentIdx)].id;
        render();
      });

      // Hover effects: amber for warn mode, red for block mode
      const hoverColor = isBtnWarnMode ? S.colors.warning : S.colors.destructive;
      bypassBtn.addEventListener('mouseenter', () => {
        bypassBtn.style.background = `${hoverColor}15`;
      });
      bypassBtn.addEventListener('mouseleave', () => {
        bypassBtn.style.background = 'transparent';
      });
    }

    // Save Copy button
    const saveCopyBtn = popup.querySelector('#obfusca-multi-save-copy') as HTMLElement | null;
    if (saveCopyBtn) {
      saveCopyBtn.addEventListener('click', () => {
        // This is a placeholder -- the actual save logic would need to be
        // supplied via an extended callback. For now we mark it handled.
        saveCopyBtn.textContent = 'Saved!';
        setTimeout(() => { if (saveCopyBtn) saveCopyBtn.textContent = 'Save Copy'; }, 2000);
      });
    }

    // --- Checkbox changes ---
    popup.querySelectorAll('.obfusca-detection-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt((e.target as HTMLInputElement).dataset.index || '0');
        if (!state.redactionChoices) state.redactionChoices = new Map();
        const existing = state.redactionChoices.get(idx) || { enabled: true, mode: state.globalRedactMode || 'mask' };
        existing.enabled = (e.target as HTMLInputElement).checked;
        state.redactionChoices.set(idx, existing);
        render();
      });
    });

    // --- Global mode toggle ---
    popup.querySelectorAll('.obfusca-global-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = (btn as HTMLElement).dataset.mode as 'mask' | 'dummy';
        state.globalRedactMode = mode;
        // Update all items that don't have a per-item override
        if (state.redactionChoices) {
          state.redactionChoices.forEach((choice) => {
            if (!choice.customValue) {
              choice.mode = mode;
            }
          });
        }
        render();
      });
    });

    // --- Per-item mode toggle ---
    popup.querySelectorAll('.obfusca-item-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt((btn as HTMLElement).dataset.index || '0');
        const mode = (btn as HTMLElement).dataset.mode as 'mask' | 'dummy';
        if (!state.redactionChoices) state.redactionChoices = new Map();
        const existing = state.redactionChoices.get(idx) || { enabled: true, mode: 'mask' };
        existing.mode = mode;
        state.redactionChoices.set(idx, existing);
        render();
      });
    });

    // --- Edit button ---
    popup.querySelectorAll('.obfusca-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt((btn as HTMLElement).dataset.index || '0');
        const currentChoice = state.redactionChoices?.get(idx);
        const currentValue = currentChoice?.customValue || '';
        const newValue = prompt('Enter custom replacement value:', currentValue);
        if (newValue !== null) {
          if (!state.redactionChoices) state.redactionChoices = new Map();
          const existing = state.redactionChoices.get(idx) || { enabled: true, mode: state.globalRedactMode || 'mask' };
          existing.customValue = newValue || undefined;
          state.redactionChoices.set(idx, existing);
          render();
        }
      });
    });

    // --- View mode toggle ---
    popup.querySelectorAll('.obfusca-view-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.previewViewMode = (btn as HTMLElement).dataset.mode as 'original' | 'highlighted' | 'protected';
        render();
      });
    });

    // --- Copy button (multi-item preview) ---
    const previewCopyBtn = popup.querySelector('.obfusca-preview-copy-btn');
    if (previewCopyBtn) {
      previewCopyBtn.addEventListener('click', async () => {
        const previewEl = popup.querySelector('.obfusca-code-preview');
        if (previewEl) {
          const text = previewEl.textContent || '';
          const copyIcon = getGenericIcon('copy');
          try {
            await navigator.clipboard.writeText(text);
            (previewCopyBtn as HTMLElement).innerHTML = '\u2713';
            setTimeout(() => { (previewCopyBtn as HTMLElement).innerHTML = copyIcon; }, 2000);
          } catch {
            // fallback
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            (previewCopyBtn as HTMLElement).innerHTML = '\u2713';
            setTimeout(() => { (previewCopyBtn as HTMLElement).innerHTML = copyIcon; }, 2000);
          }
        }
      });
    }

    // --- Hover effects for detection items ---
    popup.querySelectorAll('.obfusca-detection-item').forEach(item => {
      item.addEventListener('mouseenter', () => {
        (item as HTMLElement).style.background = S.colors.secondary;
        const editBtn = item.querySelector('.obfusca-edit-btn') as HTMLElement;
        if (editBtn) editBtn.style.opacity = '1';
      });
      item.addEventListener('mouseleave', () => {
        (item as HTMLElement).style.background = 'transparent';
        const editBtn = item.querySelector('.obfusca-edit-btn') as HTMLElement;
        if (editBtn) editBtn.style.opacity = '0';
      });
    });
  }

  // ------------------------------------------------------------------
  // Navigation helpers
  // ------------------------------------------------------------------

  /** Guard: onAllComplete must only fire once per popup session */
  let allCompleteAlreadyFired = false;

  /** Advance to the next pending item, or finish if all done */
  function advanceToNextPending(): void {
    const pendingItems = state.items.filter(i => i.status === 'pending');

    if (pendingItems.length === 0) {
      if (allCompleteAlreadyFired) {
        console.log('[Obfusca Multi] advanceToNextPending: onAllComplete already fired, skipping');
        return;
      }
      allCompleteAlreadyFired = true;
      // All items handled -- notify completion and close
      callbacks.onAllComplete(state.items);
      removeMultiItemPopup();
      return;
    }

    // Move to first remaining pending item
    state.activeItemId = pendingItems[0].id;
    render();
  }

  // ------------------------------------------------------------------
  // Close handler
  // ------------------------------------------------------------------

  function handleClose(): void {
    removeMultiItemPopup();
    callbacks.onClose();
  }

  // Steal focus from the chat input so keyboard shortcuts work immediately
  const _prevActiveElement = document.activeElement as HTMLElement | null;
  if (_prevActiveElement instanceof HTMLElement) {
    _prevActiveElement.blur();
  }
  popup.setAttribute('tabindex', '-1');
  popup.focus({ preventScroll: true });

  // Keyboard shortcuts: Escape to close, Enter to protect
  // Shift+Enter = Send Anyway ONLY in warn mode (single-click). In block mode, Shift+Enter is ignored.
  const keyHandler = (e: KeyboardEvent) => {
    // If the bypass confirmation dialog is open, let IT handle keyboard events
    if (document.getElementById(BYPASS_CONFIRM_ID)) return;

    if (e.key === 'Escape') {
      handleClose();
      document.removeEventListener('keydown', keyHandler, true);
      return;
    }

    if (e.key === 'Enter') {
      // Don't intercept if focus is in an OBFUSCA input (e.g. custom replacement modal)
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        const isObfuscaInput = (activeEl as HTMLElement).id?.startsWith('obfusca-') ||
          activeEl.closest('#' + MULTI_POPUP_ID);
        if (isObfuscaInput) return;
      }
      // Don't intercept if the replacement modal is open
      if (document.getElementById('obfusca-replacement-modal')) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (e.shiftKey) {
        // Shift+Enter → Send Anyway:
        // - Warn mode: single-click send (allowed)
        // - Block mode: ignored (must click through two-step confirmation)
        const currentEffectiveMode = getEffectivePopupMode(state.items);
        if (currentEffectiveMode === 'warn') {
          const bypassBtn = popup.querySelector('#obfusca-multi-bypass') as HTMLElement | null;
          bypassBtn?.click();
        }
        // In block mode, Shift+Enter is deliberately ignored
      } else {
        // Enter → Protect & Finish / Protect & Next
        const protectBtn = popup.querySelector('#obfusca-multi-protect') as HTMLElement | null;
        if (protectBtn && !protectBtn.hasAttribute('disabled')) protectBtn.click();
      }
    }
  };
  document.addEventListener('keydown', keyHandler, true); // capture phase
  (popup as any).__obfuscaEscHandler = keyHandler;
  (popup as any).__obfuscaPrevFocus = _prevActiveElement;

  // Initial render
  render();

  // ------------------------------------------------------------------
  // Batch AI dummy generation for all items with mappings
  // ------------------------------------------------------------------
  // Collect all items that have original text and mappings needing dummies.
  // We fire one batch request per item since each item has its own original text context.
  for (const item of state.items) {
    if (!item.content || !item.mappings || item.mappings.length === 0) continue;

    const batchDetections: BatchDetectionItem[] = item.mappings.map((m, i) => ({
      index: i,
      type: m.type || 'custom',
      original_value: m.original_preview || m.placeholder,
      display_name: m.display_name,
    }));

    console.log(`[Obfusca Multi Batch] Fetching AI dummies for item "${item.name}": ${batchDetections.length} items`);

    generateDummiesBatch(item.content, batchDetections)
      .then((response) => {
        if (!document.getElementById(MULTI_POPUP_ID)) {
          console.log('[Obfusca Multi Batch] Popup dismissed before dummies arrived');
          return;
        }

        if (response && response.success && response.dummies.length > 0) {
          console.log(`[Obfusca Multi Batch] AI dummies received for "${item.name}": ${response.dummies.length} items, source: ${response.source}`);

          for (const dummy of response.dummies) {
            const idx = dummy.index;
            if (idx >= 0 && idx < item.mappings.length && dummy.dummy_value) {
              item.mappings[idx].dummy_value = dummy.dummy_value;
            }
          }

          // Re-render so any dummy-mode rows show updated values
          render();
        } else {
          console.warn(`[Obfusca Multi Batch] AI dummies failed for "${item.name}", applying local fallbacks`);
          for (const m of item.mappings) {
            if (!m.dummy_value || m.dummy_value === m.masked_value) {
              m.dummy_value = getLocalFallbackDummy(m);
            }
          }
          render();
        }
      })
      .catch((err) => {
        console.error(`[Obfusca Multi Batch] Batch dummy fetch error for "${item.name}":`, err);
        if (document.getElementById(MULTI_POPUP_ID)) {
          for (const m of item.mappings) {
            if (!m.dummy_value || m.dummy_value === m.masked_value) {
              m.dummy_value = getLocalFallbackDummy(m);
            }
          }
          render();
        }
      });
  }

  return popup;
}

/**
 * Remove the multi-item detection popup.
 */
export function removeMultiItemPopup(): void {
  const existing = document.getElementById(MULTI_POPUP_ID);

  if (!existing) return;

  if (existing) {
    const escHandler = (existing as any).__obfuscaEscHandler;
    if (escHandler) {
      document.removeEventListener('keydown', escHandler, true);
    }
    // Clean up outside-click listener
    const outsideClickHandler = (existing as any).__obfuscaOutsideClickHandler;
    if (outsideClickHandler) {
      document.removeEventListener('mousedown', outsideClickHandler, false);
    }
    // Clean up position interval
    const positionInterval = (existing as any).__obfuscaPositionInterval as ReturnType<typeof setInterval> | undefined;
    if (positionInterval !== undefined) {
      clearInterval(positionInterval);
    }
    // Restore focus to the element that was active before the popup opened
    const prevFocus = (existing as any).__obfuscaPrevFocus as HTMLElement | null;
    if (prevFocus && typeof prevFocus.focus === 'function') {
      try { prevFocus.focus({ preventScroll: true }); } catch (_) { /* noop */ }
    }
  }

  if (existing) {
    existing.style.animation = `${POPUP_ANIMATION_OUT_NAME} 0.12s ease-in forwards`;
    setTimeout(() => {
      existing.remove();
    }, 120);
  }
}

/**
 * Check if the multi-item popup is currently visible.
 */
export function isMultiItemPopupVisible(): boolean {
  return document.getElementById(MULTI_POPUP_ID) !== null;
}

// ---------------------------------------------------------------------------
// Analysis indicator — shown immediately on Enter, before analysis completes
// ---------------------------------------------------------------------------

const ANALYSIS_INDICATOR_ID = 'obfusca-analysis-indicator';

/**
 * Show a small loading bar anchored to the bottom of the input container.
 * Appears instantly when the user presses Enter so there is immediate feedback.
 * Call removeAnalysisIndicator() (or showIndicatorSuccess()) to dismiss it.
 */
export function showAnalysisIndicator(anchorElement: HTMLElement): void {
  // Remove any existing indicator first
  removeAnalysisIndicator();

  const container = findVisibleInputContainer(anchorElement);
  const rect = container.getBoundingClientRect();

  const indicator = document.createElement('div');
  indicator.id = ANALYSIS_INDICATOR_ID;
  indicator.style.cssText = `
    position: fixed;
    bottom: ${window.innerHeight - rect.top + 8}px;
    left: ${rect.width >= 400 ? rect.left + 'px' : '50%'};
    width: ${rect.width >= 400 ? rect.width + 'px' : '750px'};
    max-width: calc(100vw - 32px);
    transform: ${rect.width >= 400 ? 'none' : 'translateX(-50%)'};
    background: #0a0a0a;
    border: 1px solid #222222;
    border-radius: 16px;
    padding: 14px 20px;
    z-index: 2147483646;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 -4px 24px rgba(0,0,0,0.3);
    overflow: hidden;
  `;

  // Shield icon
  const icon = document.createElement('div');
  icon.style.cssText = 'flex-shrink: 0; display: flex; align-items: center;';
  icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;

  // Text
  const text = document.createElement('span');
  text.id = 'obfusca-indicator-text';
  text.textContent = 'Scanning for sensitive data';
  text.style.cssText = 'color: #666; font-size: 12px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; flex: 1;';

  // Animated dots
  const dots = document.createElement('span');
  dots.style.cssText = 'color: #666; font-size: 12px; font-family: monospace; min-width: 18px;';
  dots.textContent = '';
  let dotCount = 0;
  const dotInterval = window.setInterval(() => {
    dotCount = (dotCount + 1) % 4;
    dots.textContent = '.'.repeat(dotCount);
  }, 400);
  (indicator as any).__dotInterval = dotInterval;

  // Progress bar
  const progressBar = document.createElement('div');
  progressBar.style.cssText = `
    position: absolute;
    bottom: 0;
    left: -100%;
    height: 2px;
    width: 60%;
    background: linear-gradient(90deg, #6366f1, #8b5cf6);
    animation: obfusca-scan-sweep 1.8s ease-in-out infinite;
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    @keyframes obfusca-scan-sweep {
      0%   { left: -60%; }
      100% { left: 110%; }
    }
  `;

  indicator.appendChild(icon);
  indicator.appendChild(text);
  indicator.appendChild(dots);
  indicator.appendChild(progressBar);
  indicator.appendChild(styleEl);
  document.body.appendChild(indicator);

  // 100ms repositioning to follow input if it moves
  const posInterval = window.setInterval(() => {
    if (!indicator.isConnected) { clearInterval(posInterval); return; }
    const r = container.getBoundingClientRect();
    indicator.style.bottom = `${window.innerHeight - r.top}px`;
    if (r.width >= 400) {
      indicator.style.left = `${r.left}px`;
      indicator.style.width = `${r.width}px`;
    }
  }, 100);
  (indicator as any).__posInterval = posInterval;
}

/**
 * Remove the analysis indicator immediately (with a brief fade).
 * Safe to call when no indicator is present.
 */
export function removeAnalysisIndicator(): void {
  const indicator = document.getElementById(ANALYSIS_INDICATOR_ID);
  if (!indicator) return;
  clearInterval((indicator as any).__dotInterval);
  clearInterval((indicator as any).__posInterval);
  indicator.style.opacity = '0';
  indicator.style.transition = 'opacity 0.12s ease';
  setTimeout(() => { if (indicator.isConnected) indicator.remove(); }, 130);
}

/**
 * Update the text label inside the analysis indicator (e.g. "Scanning files").
 * No-op if the indicator is not present.
 */
export function updateAnalysisIndicatorText(label: string): void {
  const el = document.getElementById('obfusca-indicator-text');
  if (el) el.textContent = label;
}

/**
 * Transition the indicator to a green "clean" success state, then auto-dismiss.
 * Clears the sweep animation and colour, shows a checkmark, then fades out.
 * Call this instead of removeAnalysisIndicator() when analysis finds zero detections.
 */
export function showIndicatorSuccess(): void {
  const indicator = document.getElementById(ANALYSIS_INDICATOR_ID);
  if (!indicator) return;
  clearInterval((indicator as any).__dotInterval);
  clearInterval((indicator as any).__posInterval);
  const textEl = document.getElementById('obfusca-indicator-text') as HTMLElement | null;
  if (textEl) {
    textEl.textContent = 'No sensitive data detected';
    textEl.style.color = '#4ade80';
  }
  // Update the dots span to a checkmark
  const spans = indicator.querySelectorAll('span');
  const dotsSpan = spans[spans.length - 1] as HTMLElement | null;
  if (dotsSpan) dotsSpan.textContent = ' \u2713';
  // Hide sweep bar
  const progressBar = indicator.querySelector('div[style*="animation"]') as HTMLElement | null;
  if (progressBar) progressBar.style.display = 'none';
  // Auto-dismiss after 1s
  setTimeout(() => {
    if (!indicator.isConnected) return;
    indicator.style.opacity = '0';
    indicator.style.transition = 'opacity 0.15s ease';
    setTimeout(() => { if (indicator.isConnected) indicator.remove(); }, 150);
  }, 1000);
}
