/**
 * Enterprise-grade toast notification system for Obfusca.
 *
 * Renders stacked, auto-dismissing toasts in the bottom-right corner.
 * Each toast has an icon, title, optional body, and a close button.
 * Uses the shared design system animations (obfusca-toast-enter / exit).
 *
 * Usage:
 *   import { showToast } from './toast';
 *   showToast({ variant: 'success', title: 'Protected', body: '3 items redacted' });
 *   showToast({ variant: 'error', title: 'Detection failed' });
 *   showToast({ variant: 'warning', title: 'Sensitive data detected', body: 'SSN, Email' });
 *   showToast({ variant: 'info', title: 'Monitoring active' });
 */

import {
  OBFUSCA_STYLES,
  escapeHtml,
  injectAnimationStyles,
  ICON_SHIELD_CHECK,
  ICON_SHIELD_ALERT,
  ICON_INFO,
  ICON_X,
} from './styles';

// ── Types ───────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  /** Visual variant determines icon and accent color */
  variant: ToastVariant;
  /** Primary text (required) */
  title: string;
  /** Optional secondary description line */
  body?: string;
  /** Auto-dismiss delay in ms.  0 = no auto-dismiss.  Default: 5000 */
  duration?: number;
  /** Optional callback when dismissed */
  onDismiss?: () => void;
}

// ── Constants ───────────────────────────────────────────────────────────

const S = OBFUSCA_STYLES;
const CONTAINER_ID = 'obfusca-toast-container';
const MAX_VISIBLE = 5;

// Variant configuration map
const VARIANT_CONFIG: Record<ToastVariant, { color: string; icon: string; borderColor: string }> = {
  success: {
    color: S.colors.success,
    icon: ICON_SHIELD_CHECK,
    borderColor: `${S.colors.success}30`,
  },
  error: {
    color: S.colors.destructive,
    icon: ICON_SHIELD_ALERT,
    borderColor: `${S.colors.destructive}30`,
  },
  warning: {
    color: S.colors.warning,
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>`,
    borderColor: `${S.colors.warning}30`,
  },
  info: {
    color: S.colors.info,
    icon: ICON_INFO,
    borderColor: `${S.colors.info}30`,
  },
};

// ── Internal state ──────────────────────────────────────────────────────

/** Active toast elements in order (oldest first) */
const activeToasts: HTMLElement[] = [];

// ── Container management ────────────────────────────────────────────────

/**
 * Get or create the fixed container that holds all toast elements.
 */
function getContainer(): HTMLElement {
  let container = document.getElementById(CONTAINER_ID);
  if (container) return container;

  container = document.createElement('div');
  container.id = CONTAINER_ID;
  container.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    display: flex;
    flex-direction: column-reverse;
    gap: 8px;
    pointer-events: none;
    font-family: ${S.fonts.sans};
  `;
  document.body.appendChild(container);
  return container;
}

// ── Dismiss logic ───────────────────────────────────────────────────────

/**
 * Dismiss a single toast with an exit animation.
 */
function dismissToast(el: HTMLElement, onDismiss?: () => void): void {
  if (!el.parentElement) return;

  el.style.animation = `obfusca-toast-exit 0.2s ease-in forwards`;
  setTimeout(() => {
    el.remove();
    const idx = activeToasts.indexOf(el);
    if (idx !== -1) activeToasts.splice(idx, 1);
    onDismiss?.();
  }, 200);
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Show a toast notification.
 *
 * Returns the toast HTMLElement so callers can dismiss it early if needed.
 */
export function showToast(options: ToastOptions): HTMLElement {
  const {
    variant,
    title,
    body,
    duration = 5000,
    onDismiss,
  } = options;

  // Ensure animations are injected
  injectAnimationStyles();

  const cfg = VARIANT_CONFIG[variant];
  const container = getContainer();

  // Evict oldest toast if we exceed the max
  while (activeToasts.length >= MAX_VISIBLE) {
    const oldest = activeToasts.shift();
    if (oldest) dismissToast(oldest);
  }

  // Build toast element
  const toast = document.createElement('div');
  toast.style.cssText = `
    pointer-events: auto;
    background: ${S.colors.card};
    border: 1px solid ${cfg.borderColor};
    border-radius: ${S.radius.xl};
    box-shadow: ${S.shadows.lg};
    padding: 14px 16px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    max-width: 380px;
    min-width: 280px;
    animation: obfusca-toast-enter 0.25s ease-out;
  `;

  // -- Icon wrapper
  const iconWrapper = document.createElement('div');
  iconWrapper.style.cssText = `
    width: 34px;
    height: 34px;
    background: ${cfg.color}15;
    border-radius: ${S.radius.md};
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: ${cfg.color};
  `;
  iconWrapper.innerHTML = cfg.icon;

  // -- Text content
  const textWrapper = document.createElement('div');
  textWrapper.style.cssText = `
    flex: 1;
    min-width: 0;
  `;

  const titleEl = document.createElement('div');
  titleEl.style.cssText = `
    font-size: 13px;
    font-weight: 500;
    color: ${S.colors.foreground};
    line-height: 1.4;
  `;
  titleEl.textContent = title;
  textWrapper.appendChild(titleEl);

  if (body) {
    const bodyEl = document.createElement('div');
    bodyEl.style.cssText = `
      font-size: 12px;
      color: ${S.colors.mutedForeground};
      margin-top: 2px;
      line-height: 1.4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    bodyEl.textContent = body;
    textWrapper.appendChild(bodyEl);
  }

  // -- Close button
  const closeBtn = document.createElement('button');
  closeBtn.setAttribute('aria-label', 'Dismiss notification');
  closeBtn.style.cssText = `
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: ${S.colors.mutedForeground};
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: ${S.radius.sm};
    transition: all ${S.transitions.fast};
    flex-shrink: 0;
    margin-top: -2px;
  `;
  closeBtn.innerHTML = ICON_X;

  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.color = S.colors.foreground;
    closeBtn.style.background = S.colors.secondary;
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.color = S.colors.mutedForeground;
    closeBtn.style.background = 'none';
  });
  closeBtn.addEventListener('click', () => dismissToast(toast, onDismiss));

  // Assemble
  toast.appendChild(iconWrapper);
  toast.appendChild(textWrapper);
  toast.appendChild(closeBtn);

  // -- Progress bar (only if auto-dismiss)
  if (duration > 0) {
    const progressTrack = document.createElement('div');
    progressTrack.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 12px;
      right: 12px;
      height: 2px;
      background: ${S.colors.border};
      border-radius: 1px;
      overflow: hidden;
    `;

    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
      height: 100%;
      background: ${cfg.color};
      border-radius: 1px;
      animation: obfusca-progress-bar ${duration}ms linear forwards;
      opacity: 0.6;
    `;

    progressTrack.appendChild(progressBar);

    // Toast needs relative positioning for the absolute progress bar
    toast.style.position = 'relative';
    toast.style.overflow = 'hidden';
    toast.appendChild(progressTrack);
  }

  // Add to container and tracking list
  container.appendChild(toast);
  activeToasts.push(toast);

  // Auto-dismiss
  if (duration > 0) {
    setTimeout(() => dismissToast(toast, onDismiss), duration);
  }

  return toast;
}

/**
 * Dismiss all active toasts immediately.
 */
export function dismissAllToasts(): void {
  for (const toast of [...activeToasts]) {
    dismissToast(toast);
  }
}

/**
 * Remove the toast container entirely (cleanup).
 */
export function removeToastContainer(): void {
  activeToasts.length = 0;
  document.getElementById(CONTAINER_ID)?.remove();
}

// Re-export escapeHtml so consumers that only import toast.ts
// don't need a separate import for simple formatting.
export { escapeHtml };
