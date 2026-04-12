/**
 * Redact Overlay UI component for Obfusca.
 * Full-screen modal with side-by-side comparison of original vs protected text.
 *
 * Enterprise-grade design using the shared Obfusca design system.
 */

import type { Detection } from '../detection';
import {
  OBFUSCA_STYLES,
  escapeHtml,
  escapeRegExp,
  addHoverEffect,
  maskValue,
  injectAnimationStyles,
  ICON_SHIELD_CHECK,
  ICON_X,
  ICON_CHECK,
  ICON_ARROW_RIGHT,
  getFooterBrandingHtml,
} from './styles';

const OVERLAY_ID = 'obfusca-redact-overlay';

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
  original?: string;
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

export interface RedactOverlayOptions {
  onSendObfuscated: (obfuscatedText: string) => void;
  onSendOriginal: () => void;
  onEdit: () => void;
}

// ── Shared style fragments ─────────────────────────────────────────────

const S = OBFUSCA_STYLES;

const labelStyle = `
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 500;
  color: ${S.colors.mutedForeground};
  margin-bottom: 8px;
`;

const textPaneBase = `
  background: ${S.colors.background};
  border-radius: ${S.radius.lg};
  padding: 16px;
  font-size: 13px;
  line-height: 1.7;
  color: ${S.colors.foreground};
  max-height: 160px;
  overflow-y: auto;
  word-break: break-word;
`;

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Highlight sensitive data in text for display.
 */
function highlightSensitiveText(text: string, mappings: MappingItem[]): string {
  let result = escapeHtml(text);

  // Sort by length descending to replace longer matches first
  const sorted = [...mappings]
    .filter(m => m.original || m.original_preview)
    .sort((a, b) => {
      const aLen = (a.original || a.original_preview).length;
      const bLen = (b.original || b.original_preview).length;
      return bLen - aLen;
    });

  for (const m of sorted) {
    const original = m.original || m.original_preview;
    const escaped = escapeHtml(original);
    const highlighted = `<span style="
      background: ${S.colors.destructive}20;
      color: ${S.colors.destructive};
      padding: 1px 5px;
      border-radius: 4px;
      font-weight: 500;
    ">${escaped}</span>`;
    result = result.replace(new RegExp(escapeRegExp(escaped), 'g'), highlighted);
  }

  return result;
}

/**
 * Highlight placeholder tokens in the protected text for clarity.
 */
function highlightProtectedText(text: string, mappings: MappingItem[]): string {
  let result = escapeHtml(text);

  const sorted = [...mappings]
    .filter(m => m.placeholder)
    .sort((a, b) => b.placeholder.length - a.placeholder.length);

  for (const m of sorted) {
    const escaped = escapeHtml(m.placeholder);
    const highlighted = `<span style="
      background: ${S.colors.success}18;
      color: ${S.colors.success};
      padding: 1px 5px;
      border-radius: 4px;
      font-weight: 500;
    ">${escaped}</span>`;
    result = result.replace(new RegExp(escapeRegExp(escaped), 'g'), highlighted);
  }

  return result;
}

/**
 * Map severity string to badge variant color.
 */
function severityColor(severity: string): string {
  switch (severity) {
    case 'critical': return S.colors.destructive;
    case 'high': return S.colors.destructive;
    case 'medium': return S.colors.warning;
    case 'low': return S.colors.info;
    default: return S.colors.mutedForeground;
  }
}

// ── Main function ───────────────────────────────────────────────────────

/**
 * Create and show the redact overlay.
 */
export function showRedactOverlay(
  originalText: string,
  _detections: Detection[],
  obfuscation: ObfuscationData,
  options: RedactOverlayOptions
): HTMLElement {
  // Suppress unused parameter lint
  void _detections;

  // Ensure global animations are available
  injectAnimationStyles();

  // Remove any existing overlay first
  removeRedactOverlay();

  const container = document.createElement('div');
  container.id = OVERLAY_ID;
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
    font-family: ${S.fonts.sans};
  `;

  const highlightedOriginal = highlightSensitiveText(originalText, obfuscation.mappings);
  const highlightedProtected = highlightProtectedText(obfuscation.obfuscated_text, obfuscation.mappings);
  const mappingCount = obfuscation.mappings.length;

  container.innerHTML = `
    <!-- Backdrop -->
    <div style="
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(8px);
    " id="obfusca-redact-backdrop"></div>

    <!-- Card -->
    <div style="
      position: relative;
      background: ${S.colors.card};
      border: 1px solid ${S.colors.border};
      border-radius: ${S.radius['2xl']};
      box-shadow: ${S.shadows.xl};
      max-width: 640px;
      width: 95vw;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: obfusca-popup-enter 0.2s ease-out;
    ">
      <!-- Header -->
      <div style="
        padding: 20px 24px;
        border-bottom: 1px solid ${S.colors.border};
        display: flex;
        align-items: center;
        justify-content: space-between;
      ">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="
            width: 38px;
            height: 38px;
            background: ${S.colors.success}15;
            border-radius: ${S.radius.lg};
            display: flex;
            align-items: center;
            justify-content: center;
            color: ${S.colors.success};
          ">
            ${ICON_SHIELD_CHECK}
          </div>
          <div>
            <h2 style="
              margin: 0;
              font-size: 15px;
              font-weight: 600;
              color: ${S.colors.foreground};
              letter-spacing: -0.01em;
            ">Smart Obfuscation</h2>
            <p style="
              margin: 2px 0 0 0;
              font-size: 13px;
              color: ${S.colors.mutedForeground};
            ">Review the protected version of your message</p>
          </div>
        </div>
        <button id="obfusca-close-btn" aria-label="Close overlay" style="
          background: none;
          border: none;
          padding: 8px;
          cursor: pointer;
          color: ${S.colors.mutedForeground};
          border-radius: ${S.radius.md};
          transition: all ${S.transitions.base};
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          ${ICON_X}
        </button>
      </div>

      <!-- Content - Scrollable -->
      <div style="
        flex: 1;
        overflow-y: auto;
        padding: 24px;
      ">
        <!-- Comparison Grid -->
        <div style="
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 20px;
        ">
          <!-- Original -->
          <div>
            <div style="${labelStyle}">
              <span style="
                display: inline-flex;
                align-items: center;
                gap: 4px;
                color: ${S.colors.destructive};
              ">
                <span style="
                  width: 6px;
                  height: 6px;
                  background: ${S.colors.destructive};
                  border-radius: 50%;
                  display: inline-block;
                "></span>
                Original
              </span>
            </div>
            <div style="
              ${textPaneBase}
              border: 1px solid ${S.colors.destructive}25;
            ">${highlightedOriginal}</div>
          </div>

          <!-- Protected -->
          <div>
            <div style="${labelStyle}">
              <span style="
                display: inline-flex;
                align-items: center;
                gap: 4px;
                color: ${S.colors.success};
              ">
                <span style="
                  width: 6px;
                  height: 6px;
                  background: ${S.colors.success};
                  border-radius: 50%;
                  display: inline-block;
                "></span>
                Protected
              </span>
            </div>
            <div style="
              ${textPaneBase}
              border: 1px solid ${S.colors.success}25;
            ">${highlightedProtected}</div>
          </div>
        </div>

        <!-- Mappings Table -->
        <div style="
          background: ${S.colors.secondary};
          border-radius: ${S.radius.lg};
          border: 1px solid ${S.colors.border};
          overflow: hidden;
        ">
          <!-- Mappings header -->
          <div style="
            padding: 12px 16px;
            border-bottom: 1px solid ${S.colors.border};
            display: flex;
            align-items: center;
            justify-content: space-between;
          ">
            <span style="
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              font-weight: 500;
              color: ${S.colors.mutedForeground};
            ">Replacements</span>
            <span style="
              font-size: 11px;
              font-weight: 500;
              color: ${S.colors.mutedForeground};
              background: ${S.colors.obscured};
              padding: 2px 8px;
              border-radius: ${S.radius.full};
            ">${mappingCount}</span>
          </div>

          <!-- Mapping rows -->
          <div style="
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 2px;
            max-height: 200px;
            overflow-y: auto;
          ">
            ${obfuscation.mappings.map((m, i) => `
              <div style="
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 10px;
                border-radius: ${S.radius.md};
                transition: background ${S.transitions.fast};
                ${i % 2 === 0 ? '' : `background: ${S.colors.background}40;`}
              ">
                <!-- Original (masked) -->
                <span style="
                  color: ${S.colors.destructive};
                  font-size: 12px;
                  font-family: ${S.fonts.mono};
                  text-decoration: line-through;
                  opacity: 0.85;
                  min-width: 60px;
                ">${escapeHtml(maskValue(m.original_preview || m.original || '', m.type))}</span>

                <!-- Arrow -->
                <span style="
                  color: ${S.colors.mutedForeground};
                  display: flex;
                  align-items: center;
                  flex-shrink: 0;
                ">${ICON_ARROW_RIGHT}</span>

                <!-- Placeholder (what will be sent) -->
                <code style="
                  background: ${S.colors.success}15;
                  color: ${S.colors.success};
                  padding: 3px 8px;
                  border-radius: ${S.radius.sm};
                  font-family: ${S.fonts.mono};
                  font-size: 12px;
                  font-weight: 500;
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  max-width: 200px;
                ">${escapeHtml(m.placeholder)}</code>

                <!-- Type badge -->
                <span style="
                  margin-left: auto;
                  font-size: 10px;
                  font-weight: 500;
                  padding: 2px 8px;
                  border-radius: ${S.radius.full};
                  background: ${severityColor(m.severity)}15;
                  color: ${severityColor(m.severity)};
                  text-transform: ${m.display_name ? 'none' : 'uppercase'};
                  letter-spacing: 0.3px;
                  white-space: nowrap;
                ">${escapeHtml(m.display_name || m.type)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Footer Actions -->
      <div style="
        padding: 16px 24px;
        border-top: 1px solid ${S.colors.border};
        display: flex;
        gap: 10px;
        align-items: center;
      ">
        <button id="obfusca-send-protected" style="
          flex: 1;
          padding: 10px 20px;
          background: ${S.colors.foreground};
          color: ${S.colors.background};
          border: none;
          border-radius: ${S.radius.md};
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all ${S.transitions.base};
          font-family: ${S.fonts.sans};
        ">
          ${ICON_CHECK}
          Send Protected
        </button>

        <button id="obfusca-edit-message" style="
          padding: 10px 20px;
          background: ${S.colors.secondary};
          color: ${S.colors.foreground};
          border: 1px solid ${S.colors.border};
          border-radius: ${S.radius.md};
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all ${S.transitions.base};
          font-family: ${S.fonts.sans};
        ">Edit</button>

        <button id="obfusca-send-original" style="
          padding: 10px 20px;
          background: transparent;
          color: ${S.colors.destructive};
          border: 1px solid ${S.colors.destructive}35;
          border-radius: ${S.radius.md};
          font-size: 13px;
          cursor: pointer;
          transition: all ${S.transitions.base};
          font-family: ${S.fonts.sans};
        ">Send Original</button>
      </div>

      <!-- Footer branding -->
      ${getFooterBrandingHtml()}
    </div>
  `;

  document.body.appendChild(container);

  // ── Event handlers ──────────────────────────────────────────────────

  const closeOverlay = () => {
    removeRedactOverlay();
    options.onEdit();
  };

  document.getElementById('obfusca-redact-backdrop')?.addEventListener('click', closeOverlay);
  document.getElementById('obfusca-close-btn')?.addEventListener('click', closeOverlay);
  document.getElementById('obfusca-edit-message')?.addEventListener('click', closeOverlay);

  document.getElementById('obfusca-send-protected')?.addEventListener('click', () => {
    removeRedactOverlay();
    options.onSendObfuscated(obfuscation.obfuscated_text);
  });

  document.getElementById('obfusca-send-original')?.addEventListener('click', () => {
    if (confirm('Are you sure? This will send your message with sensitive data exposed.')) {
      removeRedactOverlay();
      options.onSendOriginal();
    }
  });

  // ── Hover effects ───────────────────────────────────────────────────

  addHoverEffect('obfusca-send-protected', { opacity: '0.9', transform: 'translateY(-1px)' });
  addHoverEffect('obfusca-edit-message', { background: S.colors.obscured });
  addHoverEffect('obfusca-send-original', { background: `${S.colors.destructive}10` });
  addHoverEffect('obfusca-close-btn', { background: S.colors.secondary, color: S.colors.foreground });

  // ── Keyboard ────────────────────────────────────────────────────────

  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeOverlay();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // Focus the primary button
  const primaryBtn = document.getElementById('obfusca-send-protected') as HTMLButtonElement;
  primaryBtn?.focus();

  return container;
}

/**
 * Remove the redact overlay.
 */
export function removeRedactOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove();
}

/**
 * Check if the redact overlay is currently visible.
 */
export function isRedactOverlayVisible(): boolean {
  return document.getElementById(OVERLAY_ID) !== null;
}
