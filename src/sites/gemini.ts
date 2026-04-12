/**
 * Google Gemini (gemini.google.com) site adapter for Obfusca.
 *
 * DOM notes (as of 2024):
 * - Uses Angular Material components (mat-* prefixes)
 * - Input is a rich text editor or textarea
 * - May use shadow DOM for some components
 * - Send button has specific mat-icon or aria-label
 */

import type { SiteConfig } from './types';

// Gemini input selectors
const INPUT_SELECTORS = [
  // Rich text editor
  'rich-textarea div[contenteditable="true"]',
  'div[data-placeholder][contenteditable="true"]',
  // Fallback textarea
  'textarea[aria-label*="prompt"]',
  'textarea[placeholder*="Enter a prompt"]',
  'textarea.ql-editor',
  // Generic contenteditable in the input area
  '.input-area div[contenteditable="true"]',
  'bard-mode-switcher + div div[contenteditable="true"]',
];

const SUBMIT_SELECTORS = [
  // Send button
  'button[aria-label*="Send"]',
  'button[aria-label*="Submit"]',
  'button.send-button',
  // Material icon button
  'button mat-icon[data-mat-icon-name="send"]',
  'button[mattooltip*="Send"]',
  // Generic button with send icon near input
  '.input-area button:not([aria-label*="Voice"])',
];

/**
 * Find an element using multiple fallback selectors.
 * Also checks inside shadow roots for web components.
 */
function findWithFallbacks(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    // Try regular DOM first
    const element = document.querySelector(selector);
    if (element) {
      return element as HTMLElement;
    }
  }

  // Try to find in common shadow hosts
  const shadowHosts = document.querySelectorAll('rich-textarea, bard-input');
  for (const host of shadowHosts) {
    if (host.shadowRoot) {
      for (const selector of selectors) {
        const element = host.shadowRoot.querySelector(selector);
        if (element) {
          return element as HTMLElement;
        }
      }
    }
  }

  return null;
}

/**
 * Gemini site configuration.
 */
export const geminiConfig: SiteConfig = {
  name: 'Gemini',

  hostPatterns: ['gemini.google.com', 'bard.google.com'],

  getInputElement(): HTMLElement | null {
    return findWithFallbacks(INPUT_SELECTORS);
  },

  getSubmitButton(): HTMLElement | null {
    let btn = findWithFallbacks(SUBMIT_SELECTORS);

    if (btn) {
      // If we found a mat-icon or child element, traverse up to the button
      while (btn && btn.tagName !== 'BUTTON') {
        btn = btn.parentElement;
      }
      return btn;
    }

    // Fallback: look for visible button near the input
    const input = this.getInputElement();
    if (input) {
      const container = input.closest('.input-area, form, [role="form"]');
      if (container) {
        const buttons = container.querySelectorAll('button:not([disabled])');
        for (const button of buttons) {
          const rect = button.getBoundingClientRect();
          // Look for a visible, reasonably sized button (likely send)
          if (rect.width > 20 && rect.height > 20) {
            // Check if it has a send-like icon or is positioned right
            const icon = button.querySelector('mat-icon, svg');
            if (icon) {
              return button as HTMLElement;
            }
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
    // Contenteditable or rich text editor
    return element.innerText || element.textContent || '';
  },

  setContent(element: HTMLElement, content: string): void {
    if (element instanceof HTMLTextAreaElement) {
      element.value = content;
    } else {
      element.innerText = content;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
  },

  clearContent(element: HTMLElement): void {
    this.setContent(element, '');
  },

  // Gemini uses Enter to submit by default
  isSubmitKeyCombo(event: KeyboardEvent): boolean {
    return event.key === 'Enter' && !event.shiftKey;
  },

  observeSelectors: INPUT_SELECTORS,

  getFileInputs(): HTMLInputElement[] {
    // Gemini uses file inputs for image/document uploads
    const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    return Array.from(inputs);
  },

  getDropZones(): HTMLElement[] {
    // Gemini's input area is typically a drop zone
    const zones: HTMLElement[] = [];

    // Main input container
    const inputArea = document.querySelector('.input-area');
    if (inputArea) {
      zones.push(inputArea as HTMLElement);
    }

    // Rich textarea component
    const richTextarea = document.querySelector('rich-textarea');
    if (richTextarea) {
      zones.push(richTextarea as HTMLElement);
    }

    // Main container as fallback
    const mainContainer = document.querySelector('main');
    if (mainContainer) {
      zones.push(mainContainer as HTMLElement);
    }

    return zones;
  },
};

export default geminiConfig;
