/**
 * Claude (claude.ai) site adapter for Obfusca.
 *
 * DOM notes (as of 2024):
 * - Uses a ProseMirror editor (contenteditable div with class "ProseMirror")
 * - The editor is wrapped in a fieldset with data-testid
 * - Send button typically has an aria-label or specific class
 * - Supports Cmd/Ctrl+Enter for submission
 */

import type { SiteConfig } from './types';

// Claude uses ProseMirror editor
const INPUT_SELECTORS = [
  'div.ProseMirror[contenteditable="true"]',
  'fieldset div[contenteditable="true"]',
  'div[data-placeholder][contenteditable="true"]',
  '[data-testid="composer-input"] div[contenteditable="true"]',
];

const SUBMIT_SELECTORS = [
  'button[aria-label*="Send"]',
  'button[aria-label*="send"]',
  'fieldset button[type="button"]:not([aria-label*="Stop"])',
  'button[data-testid="composer-send-button"]',
  // Look for button with send icon (arrow)
  'fieldset button svg',
];

/**
 * Find an element using multiple fallback selectors.
 */
function findWithFallbacks(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element as HTMLElement;
    }
  }
  return null;
}

/**
 * Claude site configuration.
 */
export const claudeConfig: SiteConfig = {
  name: 'Claude',

  hostPatterns: ['claude.ai'],

  getInputElement(): HTMLElement | null {
    return findWithFallbacks(INPUT_SELECTORS);
  },

  getSubmitButton(): HTMLElement | null {
    let btn = findWithFallbacks(SUBMIT_SELECTORS);

    if (btn) {
      // If we found an SVG or child element, traverse up to the button
      while (btn && btn.tagName !== 'BUTTON') {
        btn = btn.parentElement;
      }
      return btn;
    }

    // Fallback: look for the last enabled button in the fieldset
    const input = this.getInputElement();
    if (input) {
      const fieldset = input.closest('fieldset');
      if (fieldset) {
        const buttons = fieldset.querySelectorAll('button:not([disabled])');
        // Usually the send button is the last one
        if (buttons.length > 0) {
          return buttons[buttons.length - 1] as HTMLElement;
        }
      }
    }

    return null;
  },

  getContent(element: HTMLElement): string {
    // ProseMirror stores content as paragraphs
    const paragraphs = element.querySelectorAll('p');
    if (paragraphs.length > 0) {
      return Array.from(paragraphs)
        .map((p) => p.textContent || '')
        .join('\n');
    }
    return element.innerText || element.textContent || '';
  },

  setContent(element: HTMLElement, content: string): void {
    // For ProseMirror, we need to be careful about how we set content
    // The simplest approach is to use innerText and dispatch an input event
    element.innerText = content;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  },

  clearContent(element: HTMLElement): void {
    // Clear all content from ProseMirror
    element.innerHTML = '<p><br></p>';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  },

  // Claude supports both Enter and Cmd/Ctrl+Enter depending on settings
  isSubmitKeyCombo(event: KeyboardEvent): boolean {
    // Enter without Shift is the default submit behavior
    // Some users may have Cmd/Ctrl+Enter configured
    if (event.key === 'Enter') {
      // Shift+Enter is always newline
      if (event.shiftKey) {
        return false;
      }
      // Cmd/Ctrl+Enter always submits
      if (event.metaKey || event.ctrlKey) {
        return true;
      }
      // Plain Enter - depends on user settings, assume it submits
      return true;
    }
    return false;
  },

  // ProseMirror needs aggressive event prevention
  preventSubmit(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    // ProseMirror may have already queued the submit, try to stop it
    if (event instanceof KeyboardEvent) {
      // Dispatch a synthetic escape to potentially cancel ProseMirror's action
      const input = this.getInputElement();
      if (input) {
        // Focus the input to keep ProseMirror in edit mode
        input.focus();
      }
    }
  },

  observeSelectors: INPUT_SELECTORS,

  getFileInputs(): HTMLInputElement[] {
    // Claude uses file inputs for document uploads
    const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    return Array.from(inputs);
  },

  getDropZones(): HTMLElement[] {
    // The main chat area and composer are drop zones
    const zones: HTMLElement[] = [];

    // Main content area
    const mainContainer = document.querySelector('main');
    if (mainContainer) {
      zones.push(mainContainer as HTMLElement);
    }

    // Composer fieldset
    const fieldset = document.querySelector('fieldset');
    if (fieldset) {
      zones.push(fieldset as HTMLElement);
    }

    return zones;
  },
};

export default claudeConfig;
