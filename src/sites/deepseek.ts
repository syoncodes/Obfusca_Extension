/**
 * DeepSeek (chat.deepseek.com) site adapter for Obfusca.
 *
 * DOM notes (as of 2024-2025):
 * - Chinese AI chat interface with English support
 * - Uses a modern React-based UI
 * - The chat input may use textarea or contenteditable div
 * - DOM structure updates frequently, so robust fallback selectors are essential
 * - May have different input states (initial vs conversation)
 */

import type { SiteConfig } from './types';

const SITE_NAME = 'DeepSeek';

/**
 * Input selectors in priority order (data attributes > aria labels > roles > classes).
 */
const INPUT_SELECTORS = [
  // Data-testid selectors (most stable if they exist)
  '[data-testid="chat-input"]',
  '[data-testid="message-input"]',
  '[data-testid="deepseek-input"]',
  '[data-testid="composer-input"]',

  // ID-based selectors
  '#chat-input',
  '#message-input',

  // Role-based selectors
  '[role="textbox"]',
  'textarea[role="textbox"]',

  // Aria-label based selectors
  '[aria-label*="message" i]',
  '[aria-label*="input" i]',
  'textarea[aria-label*="Send" i]',
  'textarea[aria-label*="Ask" i]',
  'textarea[aria-label*="Chat" i]',

  // Placeholder-based selectors
  'textarea[placeholder*="Send" i]',
  'textarea[placeholder*="message" i]',
  'textarea[placeholder*="Ask" i]',
  'textarea[placeholder*="Enter" i]',
  'textarea[placeholder*="Type" i]',

  // Contenteditable divs
  'div[contenteditable="true"][data-placeholder]',
  'div[contenteditable="true"][role="textbox"]',
  'div[contenteditable="true"][aria-label*="message" i]',

  // Class-based selectors (common patterns in React apps)
  '[class*="chat-input" i] textarea',
  '[class*="ChatInput" i] textarea',
  '[class*="message-input" i] textarea',
  '[class*="MessageInput" i] textarea',
  '[class*="input-area" i] textarea',
  '[class*="InputArea" i] textarea',
  '[class*="composer" i] textarea',
  '[class*="Composer" i] textarea',

  // Container-based fallbacks
  '.input-wrapper textarea',
  '.chat-input-container textarea',
  '.message-input textarea',
  'form textarea',

  // Contenteditable fallbacks
  '[class*="chat-input" i] div[contenteditable="true"]',
  '[class*="ChatInput" i] div[contenteditable="true"]',
  '[class*="composer" i] div[contenteditable="true"]',

  // Generic textarea as last resort (within main content area)
  'main textarea',
  '.main-content textarea',
  '[class*="chat" i] textarea',
];

/**
 * Submit button selectors in priority order.
 */
const SUBMIT_SELECTORS = [
  // Data-testid selectors
  '[data-testid="send-button"]',
  '[data-testid="submit-button"]',
  '[data-testid="chat-send"]',

  // ID-based selectors
  '#send-button',

  // Aria-label based selectors
  'button[aria-label*="Send" i]',
  'button[aria-label*="Submit" i]',

  // DeepSeek-specific: the send button is often a div with role="button"
  'div[role="button"][class*="send" i]',
  'div[role="button"][aria-label*="Send" i]',

  // Class-based selectors
  'button[class*="send" i]',
  'button.send-button',
  '[class*="send-btn" i]',
  '[class*="SendButton" i]',

  // SVG-based detection (send icon)
  'button svg[class*="send" i]',

  // Sibling-based: button near textarea
  'textarea ~ button',
  'textarea + button',
  'textarea ~ div > button',

  // Container-based selectors
  '.input-wrapper button',
  '.chat-input-container button',
  '[class*="InputArea" i] button:not([aria-label*="attachment" i])',
  '[class*="ChatInput" i] button:not([aria-label*="attachment" i])',
  '[class*="composer" i] button[type="submit"]',
  '[class*="composer" i] button:last-of-type',

  // Form submit button
  'form button[type="submit"]',
  'form button:last-of-type',
];

/**
 * Find an element using multiple fallback selectors with debug logging.
 */
function findWithFallbacks(selectors: string[], context: Document | Element = document): { element: HTMLElement | null; selector: string | null } {
  for (const selector of selectors) {
    try {
      const element = context.querySelector(selector);
      if (element && element instanceof HTMLElement) {
        // Verify element is visible
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          console.log(`[Obfusca] ${SITE_NAME}: Found element via selector: ${selector}`);
          return { element, selector };
        }
      }
    } catch (e) {
      // Invalid selector, skip
      console.warn(`[Obfusca] ${SITE_NAME}: Invalid selector skipped: ${selector}`);
    }
  }
  return { element: null, selector: null };
}

/**
 * Find all matching elements for a selector to choose the best one.
 */
function findBestInput(): HTMLElement | null {
  // First, try our priority selectors
  const { element } = findWithFallbacks(INPUT_SELECTORS);
  if (element) {
    return element;
  }

  // Fallback: find any textarea that looks like a chat input
  const textareas = document.querySelectorAll('textarea');
  for (const textarea of textareas) {
    const rect = textarea.getBoundingClientRect();
    // Check if textarea is visible and reasonably sized
    if (rect.width > 100 && rect.height > 30) {
      // Verify it's in a chat-like context (not a comment field, etc.)
      const parent = textarea.closest('form, [class*="chat" i], [class*="input" i], main');
      if (parent) {
        console.log(`[Obfusca] ${SITE_NAME}: Found input via textarea fallback`);
        return textarea as HTMLElement;
      }
    }
  }

  // Also check contenteditables
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
 * DeepSeek site configuration.
 */
export const deepseekConfig: SiteConfig = {
  name: SITE_NAME,

  hostPatterns: ['chat.deepseek.com', 'deepseek.com'],

  getInputElement(): HTMLElement | null {
    return findBestInput();
  },

  getSubmitButton(): HTMLElement | null {
    let { element: btn, selector } = findWithFallbacks(SUBMIT_SELECTORS);

    if (btn) {
      // Traverse up to button or clickable element if we found a child (like SVG)
      while (btn && btn.tagName !== 'BUTTON' && btn.getAttribute('role') !== 'button') {
        btn = btn.parentElement;
      }
      if (btn && selector) {
        console.log(`[Obfusca] ${SITE_NAME}: Found submit button via ${selector}`);
      }
      return btn;
    }

    // Fallback: look for the primary action button near input
    const input = this.getInputElement();
    if (input) {
      // Walk up DOM tree progressively to find a container with buttons
      let container: Element | null = null;
      let el: Element | null = input;
      for (let depth = 0; depth < 5 && el; depth++) {
        el = el.parentElement;
        if (el) {
          const buttons = el.querySelectorAll('button:not([disabled]), [role="button"]:not([disabled])');
          if (buttons.length > 0) {
            container = el;
            break;
          }
        }
      }
      if (!container) {
        container = input.closest(
          'form, .input-wrapper, .chat-input-container, [class*="InputArea" i], [class*="ChatInput" i], [class*="composer" i]'
        );
      }
      if (container) {
        const buttons = container.querySelectorAll('button:not([disabled]), [role="button"]:not([disabled])');
        // Find visible buttons that look like send buttons
        for (const button of buttons) {
          const rect = button.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            // Check if button has send-related attributes or content
            const ariaLabel = button.getAttribute('aria-label') || '';
            const className = button.className || '';
            const textContent = button.textContent || '';

            const isSendButton =
              ariaLabel.toLowerCase().includes('send') ||
              className.toLowerCase().includes('send') ||
              textContent.toLowerCase().includes('send') ||
              button.querySelector('svg') !== null;

            if (isSendButton) {
              console.log(`[Obfusca] ${SITE_NAME}: Found submit button via proximity (send-like)`);
              return button as HTMLElement;
            }
          }
        }

        // If no obvious send button, return the last visible button
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
    // For contenteditable, check for paragraphs first (common in rich text editors)
    const paragraphs = element.querySelectorAll('p');
    if (paragraphs.length > 0) {
      return Array.from(paragraphs)
        .map((p) => p.textContent || '')
        .join('\n');
    }
    return element.innerText || element.textContent || '';
  },

  setContent(element: HTMLElement, content: string): void {
    if (element instanceof HTMLTextAreaElement) {
      element.value = content;
      // Dispatch multiple events to ensure React picks up the change
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
    // Standard Enter to submit, Shift+Enter for newline
    return event.key === 'Enter' && !event.shiftKey;
  },

  // Observe for dynamic DOM changes
  observeSelectors: [
    ...INPUT_SELECTORS.slice(0, 20), // Limit to avoid performance issues
    // Watch for common containers that might appear
    '[class*="chat" i]',
    '[class*="input" i]',
    '[class*="composer" i]',
    'main',
    'form',
  ],
};

export default deepseekConfig;
