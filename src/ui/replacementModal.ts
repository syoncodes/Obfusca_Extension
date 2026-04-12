/**
 * Small modal for editing custom replacement text for a single detection.
 *
 * Opens inline within the popup, allowing the user to type custom
 * replacement text or pick from suggestion buttons.
 */

import { OBFUSCA_STYLES, escapeHtml } from './styles';

const MODAL_ID = 'obfusca-replacement-modal';

/** Common replacement text suggestions */
const SUGGESTIONS = [
  '[REDACTED]',
  '[CONFIDENTIAL]',
  '[REMOVED]',
  '[PRIVATE]',
  '[HIDDEN]',
  '***',
];

export interface ReplacementModalOptions {
  /** Current replacement text */
  currentText: string;
  /** Detection type label */
  label: string;
  /** Callback when user confirms a new replacement */
  onConfirm: (newText: string) => void;
  /** Callback when user cancels */
  onCancel: () => void;
  /** Element to position near */
  anchorElement: HTMLElement;
}

/**
 * Show a small inline modal for editing replacement text.
 */
export function showReplacementModal(options: ReplacementModalOptions): HTMLElement {
  removeReplacementModal();

  const { currentText, label, anchorElement } = options;

  const modal = document.createElement('div');
  modal.id = MODAL_ID;
  modal.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    font-family: ${OBFUSCA_STYLES.fonts.sans};
    width: 280px;
    background: ${OBFUSCA_STYLES.colors.card};
    border: 1px solid ${OBFUSCA_STYLES.colors.border};
    border-radius: ${OBFUSCA_STYLES.radius.xl};
    box-shadow: ${OBFUSCA_STYLES.shadows.xl};
    overflow: hidden;
    padding: 12px;
  `;

  modal.innerHTML = `
    <div style="margin-bottom: 8px;">
      <div style="
        font-size: 12px;
        font-weight: 600;
        color: ${OBFUSCA_STYLES.colors.foreground};
        margin-bottom: 4px;
      ">Custom Replacement</div>
      <div style="
        font-size: 11px;
        color: ${OBFUSCA_STYLES.colors.mutedForeground};
      ">for ${escapeHtml(label)}</div>
    </div>
    <input
      id="obfusca-replacement-input"
      type="text"
      value="${escapeHtml(currentText)}"
      style="
        width: 100%;
        box-sizing: border-box;
        padding: 6px 10px;
        font-size: 12px;
        font-family: ${OBFUSCA_STYLES.fonts.mono};
        background: ${OBFUSCA_STYLES.colors.secondary};
        color: ${OBFUSCA_STYLES.colors.foreground};
        border: 1px solid ${OBFUSCA_STYLES.colors.border};
        border-radius: ${OBFUSCA_STYLES.radius.sm};
        outline: none;
        margin-bottom: 8px;
      "
      placeholder="Enter replacement text"
    />
    <div style="
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 10px;
    ">
      ${SUGGESTIONS.map(s => `
        <button class="obfusca-suggestion-btn" data-suggestion="${escapeHtml(s)}" style="
          padding: 3px 8px;
          font-size: 10px;
          font-family: ${OBFUSCA_STYLES.fonts.mono};
          background: ${OBFUSCA_STYLES.colors.secondary};
          color: ${OBFUSCA_STYLES.colors.mutedForeground};
          border: 1px solid ${OBFUSCA_STYLES.colors.border};
          border-radius: ${OBFUSCA_STYLES.radius.sm};
          cursor: pointer;
          transition: background 0.15s;
        ">${escapeHtml(s)}</button>
      `).join('')}
    </div>
    <div style="display: flex; gap: 6px; justify-content: flex-end;">
      <button id="obfusca-replacement-cancel" style="
        padding: 5px 12px;
        font-size: 12px;
        background: ${OBFUSCA_STYLES.colors.secondary};
        color: ${OBFUSCA_STYLES.colors.mutedForeground};
        border: 1px solid ${OBFUSCA_STYLES.colors.border};
        border-radius: ${OBFUSCA_STYLES.radius.sm};
        cursor: pointer;
      ">Cancel</button>
      <button id="obfusca-replacement-confirm" style="
        padding: 5px 12px;
        font-size: 12px;
        background: ${OBFUSCA_STYLES.colors.foreground};
        color: ${OBFUSCA_STYLES.colors.background};
        border: none;
        border-radius: ${OBFUSCA_STYLES.radius.sm};
        cursor: pointer;
        font-weight: 500;
      ">Apply</button>
    </div>
  `;

  document.body.appendChild(modal);

  // Position near the anchor
  const anchorRect = anchorElement.getBoundingClientRect();
  const modalRect = modal.getBoundingClientRect();
  let top = anchorRect.top - modalRect.height - 4;
  if (top < 8) top = anchorRect.bottom + 4;
  let left = anchorRect.left;
  if (left + modalRect.width > window.innerWidth - 8) {
    left = window.innerWidth - modalRect.width - 8;
  }
  modal.style.top = `${Math.max(8, top)}px`;
  modal.style.left = `${Math.max(8, left)}px`;

  // Event handlers
  const input = modal.querySelector('#obfusca-replacement-input') as HTMLInputElement;
  const cancelBtn = modal.querySelector('#obfusca-replacement-cancel') as HTMLElement;
  const confirmBtn = modal.querySelector('#obfusca-replacement-confirm') as HTMLElement;
  const suggestionBtns = modal.querySelectorAll('.obfusca-suggestion-btn') as NodeListOf<HTMLElement>;

  input?.focus();
  input?.select();

  suggestionBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const suggestion = btn.getAttribute('data-suggestion') || '';
      if (input) input.value = suggestion;
    });
    btn.addEventListener('mouseenter', () => {
      btn.style.background = OBFUSCA_STYLES.colors.border;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = OBFUSCA_STYLES.colors.secondary;
    });
  });

  cancelBtn?.addEventListener('click', () => {
    removeReplacementModal();
    options.onCancel();
  });

  confirmBtn?.addEventListener('click', () => {
    const newText = input?.value?.trim() || currentText;
    removeReplacementModal();
    options.onConfirm(newText);
  });

  // Enter key to confirm
  input?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      const newText = input.value?.trim() || currentText;
      removeReplacementModal();
      options.onConfirm(newText);
    } else if (e.key === 'Escape') {
      removeReplacementModal();
      options.onCancel();
    }
  });

  return modal;
}

/**
 * Remove the replacement modal.
 */
export function removeReplacementModal(): void {
  const existing = document.getElementById(MODAL_ID);
  existing?.remove();
}
