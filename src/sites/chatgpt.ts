/**
 * ChatGPT site adapter for Obfusca.
 * Supports chatgpt.com and chat.openai.com
 *
 * DOM notes (as of 2024):
 * - Uses a contenteditable div or textarea for input
 * - Submit button has data-testid="send-button" or similar
 * - The form structure changes frequently, so we use robust selectors
 */

import type { SiteConfig } from './types';

// Multiple fallback selectors due to frequent DOM changes
const INPUT_SELECTORS = [
  '#prompt-textarea',
  'textarea[data-id="root"]',
  'div[contenteditable="true"][data-placeholder]',
  'div[contenteditable="true"]',
  'textarea[placeholder*="Message"]',
  'textarea[placeholder*="Send a message"]',
];

const SUBMIT_SELECTORS = [
  'button[data-testid="send-button"]',
  'button[data-testid="fruitjuice-send-button"]',
  'form button[type="submit"]',
  'button[aria-label*="Send"]',
];

const FORM_SELECTORS = ['form', 'div[role="presentation"]'];

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
 * ChatGPT site configuration.
 */
export const chatgptConfig: SiteConfig = {
  name: 'ChatGPT',

  hostPatterns: ['chatgpt.com', 'chat.openai.com'],

  getInputElement(): HTMLElement | null {
    return findWithFallbacks(INPUT_SELECTORS);
  },

  getSubmitButton(): HTMLElement | null {
    // Try direct selectors first
    let btn = findWithFallbacks(SUBMIT_SELECTORS);

    if (btn) {
      // If we found a child element, traverse up to the button
      while (btn && btn.tagName !== 'BUTTON') {
        btn = btn.parentElement;
      }
      return btn;
    }

    // Fallback: find button near textarea with send-like icon
    const input = this.getInputElement();
    if (input) {
      const form = input.closest(FORM_SELECTORS.join(', '));
      if (form) {
        const buttons = form.querySelectorAll('button');
        for (const button of buttons) {
          // Skip disabled buttons
          if ((button as HTMLButtonElement).disabled) continue;
          // Look for buttons that are visible
          const rect = button.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            return button as HTMLElement;
          }
        }
      }
    }

    return null;
  },

  getContent(element: HTMLElement): string {
    if (element instanceof HTMLTextAreaElement) {
      return element.value;
    }
    // Contenteditable div
    return element.innerText || element.textContent || '';
  },

  setContent(element: HTMLElement, content: string): void {
    if (element instanceof HTMLTextAreaElement) {
      element.value = content;
      // Dispatch input event to trigger any listeners
      element.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // Contenteditable div
      element.innerText = content;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
  },

  clearContent(element: HTMLElement): void {
    this.setContent(element, '');
  },

  // Default Enter behavior without Shift
  isSubmitKeyCombo(event: KeyboardEvent): boolean {
    return event.key === 'Enter' && !event.shiftKey;
  },

  observeSelectors: INPUT_SELECTORS,

  getFileInputs(): HTMLInputElement[] {
    // ChatGPT uses file inputs for attachments
    const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    return Array.from(inputs);
  },

  getDropZones(): HTMLElement[] {
    // The main chat area can be a drop zone
    const zones: HTMLElement[] = [];

    // Main chat container
    const mainContainer = document.querySelector('main');
    if (mainContainer) {
      zones.push(mainContainer as HTMLElement);
    }

    // Form container
    const form = document.querySelector('form');
    if (form) {
      zones.push(form as HTMLElement);
    }

    return zones;
  },
};

export default chatgptConfig;
