/**
 * Block Overlay UI component for Obfusca.
 * Full-screen modal with dark theme when sensitive data is detected.
 */

import type { Detection } from '../detection';
import { OBFUSCA_STYLES, escapeHtml, addHoverEffect, getFooterBrandingHtml } from './styles';

const OVERLAY_ID = 'obfusca-block-overlay';

export interface BlockOverlayOptions {
  onEdit: () => void;
}

/**
 * Create and show the block overlay.
 */
export function showBlockOverlay(
  detections: Detection[],
  options: BlockOverlayOptions
): HTMLElement {
  // Remove any existing overlay first
  removeBlockOverlay();

  const types = [...new Set(detections.map(d => d.displayName))];

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
    font-family: ${OBFUSCA_STYLES.fonts.sans};
  `;

  container.innerHTML = `
    <!-- Backdrop -->
    <div style="
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
    " id="obfusca-backdrop"></div>

    <!-- Card -->
    <div style="
      position: relative;
      background: ${OBFUSCA_STYLES.colors.card};
      border: 1px solid ${OBFUSCA_STYLES.colors.border};
      border-radius: ${OBFUSCA_STYLES.radius['2xl']};
      box-shadow: ${OBFUSCA_STYLES.shadows.xl};
      max-width: 400px;
      width: 90vw;
      overflow: hidden;
    ">
      <!-- Header with red accent -->
      <div style="
        background: linear-gradient(135deg, ${OBFUSCA_STYLES.colors.destructive}15, transparent);
        border-bottom: 1px solid ${OBFUSCA_STYLES.colors.border};
        padding: 24px;
      ">
        <div style="display: flex; align-items: center; gap: 16px;">
          <!-- Shield icon -->
          <div style="
            width: 48px;
            height: 48px;
            background: ${OBFUSCA_STYLES.colors.destructive}20;
            border-radius: ${OBFUSCA_STYLES.radius.lg};
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${OBFUSCA_STYLES.colors.destructive}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div>
            <h2 style="
              margin: 0;
              font-size: 18px;
              font-weight: 600;
              color: ${OBFUSCA_STYLES.colors.foreground};
              letter-spacing: -0.02em;
            ">Message Blocked</h2>
            <p style="
              margin: 4px 0 0 0;
              font-size: 14px;
              color: ${OBFUSCA_STYLES.colors.mutedForeground};
            ">Sensitive data detected in your message</p>
          </div>
        </div>
      </div>

      <!-- Content -->
      <div style="padding: 24px;">
        <!-- Detection badges -->
        <div style="
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 20px;
        ">
          ${types.map(type => `
            <span style="
              display: inline-flex;
              align-items: center;
              gap: 6px;
              padding: 6px 12px;
              background: ${OBFUSCA_STYLES.colors.obscured};
              border-radius: ${OBFUSCA_STYLES.radius.full};
              font-size: 13px;
              color: ${OBFUSCA_STYLES.colors.foreground};
            ">
              <span style="
                width: 6px;
                height: 6px;
                background: ${OBFUSCA_STYLES.colors.destructive};
                border-radius: 50%;
              "></span>
              ${escapeHtml(type)}
            </span>
          `).join('')}
        </div>

        <!-- Info text -->
        <p style="
          margin: 0 0 24px 0;
          font-size: 14px;
          color: ${OBFUSCA_STYLES.colors.mutedForeground};
          line-height: 1.5;
        ">
          Remove or redact the sensitive information above before sending your message.
        </p>

        <!-- Action button -->
        <button id="obfusca-edit-btn" style="
          width: 100%;
          padding: 12px 20px;
          background: ${OBFUSCA_STYLES.colors.foreground};
          color: ${OBFUSCA_STYLES.colors.background};
          border: none;
          border-radius: ${OBFUSCA_STYLES.radius.lg};
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.15s;
        ">
          Edit Message
        </button>
      </div>

      <!-- Footer branding -->
      ${getFooterBrandingHtml()}
    </div>
  `;

  document.body.appendChild(container);

  // Event handlers
  document.getElementById('obfusca-backdrop')?.addEventListener('click', () => {
    removeBlockOverlay();
    options.onEdit();
  });

  document.getElementById('obfusca-edit-btn')?.addEventListener('click', () => {
    removeBlockOverlay();
    options.onEdit();
  });

  // Hover effect for button
  addHoverEffect('obfusca-edit-btn', { opacity: '0.9' });

  // Escape key
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      removeBlockOverlay();
      options.onEdit();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // Focus the edit button
  const editBtn = document.getElementById('obfusca-edit-btn') as HTMLButtonElement;
  editBtn?.focus();

  return container;
}

/**
 * Remove the block overlay.
 */
export function removeBlockOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove();
}

/**
 * Check if the block overlay is currently visible.
 */
export function isBlockOverlayVisible(): boolean {
  return document.getElementById(OVERLAY_ID) !== null;
}
