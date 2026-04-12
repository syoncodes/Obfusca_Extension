/**
 * Microsoft Copilot (copilot.microsoft.com) site adapter for Obfusca.
 *
 * DOM notes (as of 2025):
 * - Microsoft Copilot uses a modern React-based UI
 * - May use web components with shadow DOM (cib-serp, cib-action-bar)
 * - The chat input is typically a textarea or contenteditable
 * - DOM structure varies between classic and new Copilot UIs
 */

import type { SiteConfig } from './types';

const SITE_NAME = 'Microsoft Copilot';

/**
 * Input selectors in priority order.
 */
const INPUT_SELECTORS = [
  // Data-testid selectors
  '[data-testid="chat-input"]',
  '[data-testid="composer-input"]',
  '[data-testid="searchbox"]',

  // ID-based selectors
  '#searchbox',
  '#userInput',

  // Name attribute
  'textarea[name="searchbox"]',

  // Aria-label based selectors
  'textarea[aria-label*="message" i]',
  'textarea[aria-label*="ask" i]',
  'textarea[aria-label*="chat" i]',

  // Placeholder-based selectors
  'textarea[placeholder*="message" i]',
  'textarea[placeholder*="Ask" i]',
  'textarea[placeholder*="Type" i]',

  // Role-based selectors
  '[role="textbox"]',
  'div[contenteditable="true"][role="textbox"]',

  // Contenteditable divs
  'div[contenteditable="true"][data-placeholder]',
  'div[contenteditable="true"][aria-label*="message" i]',

  // Class-based selectors
  '[class*="chat-input" i] textarea',
  '[class*="ChatInput" i] textarea',
  '[class*="composer" i] textarea',
  '[class*="input-area" i] textarea',

  // Container-based fallbacks
  'form textarea',
  'main textarea',
];

/**
 * Submit button selectors in priority order.
 */
const SUBMIT_SELECTORS = [
  // Aria-label based selectors
  'button[aria-label="Submit"]',
  'button[aria-label*="Send" i]',
  'button[aria-label*="submit" i]',

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
 * Try to find input inside shadow DOM (Microsoft web components).
 */
function findShadowDOMInput(): HTMLElement | null {
  const cibSerp = document.querySelector('cib-serp');
  if (cibSerp?.shadowRoot) {
    const actionBar = cibSerp.shadowRoot.querySelector('cib-action-bar');
    if (actionBar?.shadowRoot) {
      const textarea = actionBar.shadowRoot.querySelector('textarea');
      if (textarea) {
        console.log(`[Obfusca] ${SITE_NAME}: Found input via shadow DOM`);
        return textarea as HTMLElement;
      }
    }
  }
  return null;
}

/**
 * Find the best input element.
 */
function findBestInput(): HTMLElement | null {
  // First, try standard selectors
  const { element } = findWithFallbacks(INPUT_SELECTORS);
  if (element) return element;

  // Try shadow DOM for Microsoft web components
  const shadowInput = findShadowDOMInput();
  if (shadowInput) return shadowInput;

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

  return null;
}

/**
 * Microsoft Copilot site configuration.
 */
export const copilotConfig: SiteConfig = {
  name: SITE_NAME,

  hostPatterns: ['copilot.microsoft.com'],

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
      }
    }

    return null;
  },

  getContent(element: HTMLElement): string {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      return element.value;
    }
    return element.innerText || element.textContent || '';
  },

  setContent(element: HTMLElement, content: string): void {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
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
    'textarea',
    '[role="textbox"]',
    '[contenteditable="true"]',
    'form',
    'main',
  ],
};

export default copilotConfig;
