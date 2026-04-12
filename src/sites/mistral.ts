/**
 * Mistral (chat.mistral.ai) site adapter for Obfusca.
 *
 * DOM notes (as of 2025):
 * - Mistral's Le Chat is a modern React-based chat UI
 * - Uses a textarea or contenteditable div for input
 * - Standard chat interface with send button
 */

import type { SiteConfig } from './types';

const SITE_NAME = 'Mistral';

/**
 * Input selectors in priority order.
 */
const INPUT_SELECTORS = [
  // Data-testid selectors
  '[data-testid="chat-input"]',
  '[data-testid="composer-input"]',
  '[data-testid="message-input"]',

  // ID-based selectors
  '#chat-input',

  // Role-based selectors
  '[role="textbox"]',
  'textarea[role="textbox"]',

  // Aria-label based selectors
  'textarea[aria-label*="message" i]',
  'textarea[aria-label*="chat" i]',
  'textarea[aria-label*="send" i]',

  // Placeholder-based selectors
  'textarea[placeholder*="message" i]',
  'textarea[placeholder*="Message" i]',
  'textarea[placeholder*="Ask" i]',
  'textarea[placeholder*="Type" i]',

  // Contenteditable divs
  'div[contenteditable="true"][role="textbox"]',
  'div[contenteditable="true"][data-placeholder]',
  'div[contenteditable="true"][aria-label*="message" i]',

  // Class-based selectors
  '[class*="chat-input" i] textarea',
  '[class*="ChatInput" i] textarea',
  '[class*="composer" i] textarea',
  '[class*="message-input" i] textarea',

  // Container-based fallbacks
  'form textarea',
  'main textarea',
];

/**
 * Submit button selectors in priority order.
 */
const SUBMIT_SELECTORS = [
  // Aria-label based selectors
  'button[aria-label*="Send" i]',
  'button[aria-label*="Submit" i]',

  // Data-testid selectors
  '[data-testid="send-button"]',
  '[data-testid="submit-button"]',
  '[data-testid="chat-send"]',

  // Type submit
  'button[type="submit"]',

  // Class-based selectors
  'button[class*="send" i]',
  'button[class*="submit" i]',

  // Form submit fallback
  'form button[type="submit"]',
  'form button:last-of-type',
];

/**
 * Find an element using multiple fallback selectors with debug logging.
 */
function findWithFallbacks(
  selectors: string[],
  context: Document | Element = document
): { element: HTMLElement | null; selector: string | null } {
  for (const selector of selectors) {
    try {
      const element = context.querySelector(selector);
      if (element && element instanceof HTMLElement) {
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          console.log(`[Obfusca] ${SITE_NAME}: Found element via selector: ${selector}`);
          return { element, selector };
        }
      }
    } catch (e) {
      console.warn(`[Obfusca] ${SITE_NAME}: Invalid selector skipped: ${selector}`);
    }
  }
  return { element: null, selector: null };
}

/**
 * Find the best input element.
 */
function findBestInput(): HTMLElement | null {
  const { element } = findWithFallbacks(INPUT_SELECTORS);
  if (element) return element;

  // Fallback: find any visible textarea in chat context
  const textareas = document.querySelectorAll('textarea');
  for (const textarea of textareas) {
    const rect = textarea.getBoundingClientRect();
    if (rect.width > 100 && rect.height > 30) {
      const parent = textarea.closest('form, [class*="chat" i], [class*="input" i], main');
      if (parent) {
        console.log(`[Obfusca] ${SITE_NAME}: Found input via textarea fallback`);
        return textarea as HTMLElement;
      }
    }
  }

  // Check contenteditables
  const editables = document.querySelectorAll('div[contenteditable="true"]');
  for (const editable of editables) {
    const rect = editable.getBoundingClientRect();
    if (rect.width > 100 && rect.height > 20) {
      const parent = editable.closest('[class*="chat" i], [class*="input" i], form, main');
      if (parent) {
        console.log(`[Obfusca] ${SITE_NAME}: Found input via contenteditable fallback`);
        return editable as HTMLElement;
      }
    }
  }

  return null;
}

/**
 * Mistral site configuration.
 */
export const mistralConfig: SiteConfig = {
  name: SITE_NAME,

  hostPatterns: ['chat.mistral.ai'],

  getInputElement(): HTMLElement | null {
    return findBestInput();
  },

  getSubmitButton(): HTMLElement | null {
    let { element: btn, selector } = findWithFallbacks(SUBMIT_SELECTORS);

    if (btn) {
      while (btn && btn.tagName !== 'BUTTON') {
        btn = btn.parentElement;
      }
      if (btn && selector) {
        console.log(`[Obfusca] ${SITE_NAME}: Found submit button via ${selector}`);
      }
      return btn;
    }

    // Fallback: look for button near the input
    const input = this.getInputElement();
    if (input) {
      const container = input.closest(
        'form, [class*="chat" i], [class*="input" i], [class*="composer" i]'
      );
      if (container) {
        const buttons = container.querySelectorAll('button:not([disabled])');
        for (const button of buttons) {
          const rect = button.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const ariaLabel = button.getAttribute('aria-label') || '';
            const className = button.className || '';

            const isSendButton =
              ariaLabel.toLowerCase().includes('send') ||
              ariaLabel.toLowerCase().includes('submit') ||
              className.toLowerCase().includes('send') ||
              button.querySelector('svg') !== null;

            if (isSendButton) {
              console.log(`[Obfusca] ${SITE_NAME}: Found submit button via proximity`);
              return button as HTMLElement;
            }
          }
        }

        // Last visible button fallback
        for (let i = buttons.length - 1; i >= 0; i--) {
          const button = buttons[i];
          const rect = button.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            console.log(`[Obfusca] ${SITE_NAME}: Found submit button via proximity (last button)`);
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
    return element.innerText || element.textContent || '';
  },

  setContent(element: HTMLElement, content: string): void {
    if (element instanceof HTMLTextAreaElement) {
      element.value = content;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      element.innerText = content;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
  },

  clearContent(element: HTMLElement): void {
    this.setContent(element, '');
  },

  isSubmitKeyCombo(event: KeyboardEvent): boolean {
    return event.key === 'Enter' && !event.shiftKey;
  },

  observeSelectors: [
    '[data-testid="chat-input"]',
    'textarea',
    '[role="textbox"]',
    '[contenteditable="true"]',
    'form',
    'main',
  ],
};

export default mistralConfig;
