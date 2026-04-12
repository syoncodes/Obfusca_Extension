/**
 * Warning Toast UI component for Obfusca.
 * Minimal, non-blocking slide-in notification for warning mode.
 */

import { OBFUSCA_STYLES, escapeHtml } from './styles';

const TOAST_ID = 'obfusca-warning-toast';

/**
 * Show a warning toast notification.
 */
export function showWarningToast(detections: Array<{ displayName: string }>): void {
  // Remove existing
  removeWarningToast();

  const types = [...new Set(detections.map(d => d.displayName))].slice(0, 3);

  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    font-family: ${OBFUSCA_STYLES.fonts.sans};
    animation: obfusca-slide-in 0.3s ease-out;
  `;

  toast.innerHTML = `
    <style>
      @keyframes obfusca-slide-in {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes obfusca-slide-out {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    </style>
    <div style="
      background: ${OBFUSCA_STYLES.colors.card};
      border: 1px solid ${OBFUSCA_STYLES.colors.border};
      border-radius: ${OBFUSCA_STYLES.radius.xl};
      box-shadow: ${OBFUSCA_STYLES.shadows.lg};
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: 360px;
    ">
      <!-- Warning icon -->
      <div style="
        width: 36px;
        height: 36px;
        background: ${OBFUSCA_STYLES.colors.warning}20;
        border-radius: ${OBFUSCA_STYLES.radius.md};
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${OBFUSCA_STYLES.colors.warning}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>

      <div style="flex: 1; min-width: 0;">
        <div style="
          font-size: 14px;
          font-weight: 500;
          color: ${OBFUSCA_STYLES.colors.foreground};
          margin-bottom: 2px;
        ">Sensitive data detected</div>
        <div style="
          font-size: 13px;
          color: ${OBFUSCA_STYLES.colors.mutedForeground};
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        ">${types.map(t => escapeHtml(t)).join(', ')}</div>
      </div>

      <button id="obfusca-toast-close" style="
        background: none;
        border: none;
        padding: 4px;
        cursor: pointer;
        color: ${OBFUSCA_STYLES.colors.mutedForeground};
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s;
      ">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  `;

  document.body.appendChild(toast);

  // Close button hover
  const closeBtn = document.getElementById('obfusca-toast-close');
  if (closeBtn) {
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.color = OBFUSCA_STYLES.colors.foreground;
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.color = OBFUSCA_STYLES.colors.mutedForeground;
    });
    closeBtn.addEventListener('click', () => {
      dismissToast(toast);
    });
  }

  // Auto-dismiss after 5 seconds
  setTimeout(() => dismissToast(toast), 5000);
}

/**
 * Dismiss the toast with animation.
 */
function dismissToast(toast: HTMLElement): void {
  if (!document.body.contains(toast)) return;

  toast.style.animation = 'obfusca-slide-out 0.2s ease-in forwards';
  setTimeout(() => toast.remove(), 200);
}

/**
 * Remove the warning toast immediately.
 */
export function removeWarningToast(): void {
  document.getElementById(TOAST_ID)?.remove();
}
