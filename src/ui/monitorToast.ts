/**
 * Monitor Toast UI component for Obfusca.
 * Subtle bottom toast for monitor mode - logs only, no intervention.
 */

import { OBFUSCA_STYLES, escapeHtml } from './styles';

const TOAST_ID = 'obfusca-monitor-toast';

/**
 * Show a monitor mode toast notification.
 */
export function showMonitorToast(detections: Array<{ displayName: string }>): void {
  // Remove existing
  removeMonitorToast();

  const types = [...new Set(detections.map(d => d.displayName))].slice(0, 2);

  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    font-family: ${OBFUSCA_STYLES.fonts.sans};
    animation: obfusca-fade-in 0.3s ease-out;
  `;

  toast.innerHTML = `
    <style>
      @keyframes obfusca-fade-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    </style>
    <div style="
      background: ${OBFUSCA_STYLES.colors.secondary};
      border: 1px solid ${OBFUSCA_STYLES.colors.border};
      border-radius: ${OBFUSCA_STYLES.radius.lg};
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      color: ${OBFUSCA_STYLES.colors.mutedForeground};
    ">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
      <span>Monitoring: ${types.map(t => escapeHtml(t)).join(', ')} detected</span>
    </div>
  `;

  document.body.appendChild(toast);

  // Auto-dismiss after 3 seconds
  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s';
      setTimeout(() => toast.remove(), 200);
    }
  }, 3000);
}

/**
 * Remove the monitor toast immediately.
 */
export function removeMonitorToast(): void {
  document.getElementById(TOAST_ID)?.remove();
}
