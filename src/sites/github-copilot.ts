/**
 * GitHub Copilot Chat site adapter for Obfusca.
 * Copilot Chat is embedded in GitHub UI as a sidebar/panel.
 *
 * DOM notes (as of 2024-2025):
 * - Accessible at github.com/copilot or in a sidebar on any repo page
 * - The sidebar appears dynamically when clicking the Copilot button
 * - Uses a textarea or contenteditable for input
 * - GitHub uses React and custom elements with specific data attributes
 * - The chat panel may be within a dialog, drawer, or sidebar element
 * - Must use MutationObserver to detect when the Copilot panel opens/closes
 */

import type { SiteConfig } from './types';

const SITE_NAME = 'GitHub Copilot';

/**
 * Input selectors in priority order.
 *
 * Actual DOM (verified 2025):
 * <textarea id="copilot-chat-textarea" aria-label="Ask anything" placeholder="Ask anything"></textarea>
 */
const INPUT_SELECTORS = [
  // Primary: Exact ID from actual DOM
  '#copilot-chat-textarea',

  // Fallback: aria-label from actual DOM
  'textarea[aria-label="Ask anything"]',

  // Additional fallbacks for potential DOM variations
  '[data-testid="copilot-chat-textarea"]',
  '[data-testid="copilot-input"]',
  'copilot-chat textarea',
  '[aria-label="Ask Copilot"]',
  'textarea[placeholder="Ask anything"]',
];

/**
 * Submit button selectors in priority order.
 */
const SUBMIT_SELECTORS = [
  // Aria-label based (common pattern for send buttons)
  'button[aria-label="Send"]',
  'button[aria-label="Send" i]',

  // Data-testid selectors
  '[data-testid="copilot-send-button"]',
  '[data-testid="copilot-chat-send"]',

  // GitHub Copilot custom elements
  'copilot-chat button[type="submit"]',

  // Container-based fallbacks
  '#copilot-chat-textarea ~ button',
  '[aria-label*="Copilot" i] button[type="submit"]',
];

/**
 * Selectors that identify Copilot-specific containers/panels.
 * The Copilot panel opens dynamically - MutationObserver watches for these.
 */
const COPILOT_CONTAINER_SELECTORS = [
  // Container with the chat textarea
  '#copilot-chat-textarea',

  // Custom elements
  'copilot-chat',
  'copilot-chat-input',
  'copilot-workspace-chat',

  // Generic patterns
  '[data-testid*="copilot" i]',
  '[aria-label*="Copilot" i]',
  '[class*="copilot" i]',
];

/**
 * Find an element using multiple fallback selectors with debug logging.
 */
function findWithFallbacks(selectors: string[], context: Document | Element = document): { element: HTMLElement | null; selector: string | null } {
  for (const selector of selectors) {
    try {
      const element = context.querySelector(selector);
      if (element && element instanceof HTMLElement) {
        console.log(`[Obfusca] ${SITE_NAME}: Found element via selector: ${selector}`);
        return { element, selector };
      }
    } catch (e) {
      // Invalid selector, skip
      console.warn(`[Obfusca] ${SITE_NAME}: Invalid selector skipped: ${selector}`);
    }
  }
  return { element: null, selector: null };
}

/**
 * Check if we're on a Copilot-relevant page or if the Copilot panel is open.
 */
function isCopilotContext(): boolean {
  const path = window.location.pathname;

  // Direct Copilot page
  if (path.startsWith('/copilot') || path.includes('/copilot')) {
    console.log(`[Obfusca] ${SITE_NAME}: On Copilot page path`);
    return true;
  }

  // Check if any Copilot container is visible
  for (const selector of COPILOT_CONTAINER_SELECTORS) {
    const container = document.querySelector(selector);
    if (container) {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        console.log(`[Obfusca] ${SITE_NAME}: Copilot panel detected via: ${selector}`);
        return true;
      }
    }
  }

  return false;
}

/**
 * Verify that an input element is within a Copilot context.
 */
function isWithinCopilotContext(element: HTMLElement): boolean {
  // Check if element is within any Copilot container
  for (const selector of COPILOT_CONTAINER_SELECTORS) {
    if (element.closest(selector)) {
      console.log(`[Obfusca] ${SITE_NAME}: Input verified within Copilot context: ${selector}`);
      return true;
    }
  }

  // Also check if we're on the Copilot page path
  const path = window.location.pathname;
  if (path.startsWith('/copilot') || path.includes('/copilot')) {
    console.log(`[Obfusca] ${SITE_NAME}: Input on Copilot page, assuming Copilot context`);
    return true;
  }

  return false;
}

/**
 * GitHub Copilot site configuration.
 */
export const githubCopilotConfig: SiteConfig = {
  name: SITE_NAME,

  hostPatterns: ['github.com'],

  getInputElement(): HTMLElement | null {
    // Only activate when Copilot context is present
    if (!isCopilotContext()) {
      return null;
    }

    // Try to find input in Copilot-specific containers first
    for (const containerSelector of COPILOT_CONTAINER_SELECTORS) {
      const container = document.querySelector(containerSelector);
      if (container) {
        const { element, selector } = findWithFallbacks(INPUT_SELECTORS, container);
        if (element) {
          console.log(`[Obfusca] ${SITE_NAME}: Found input in container ${containerSelector} via ${selector}`);
          return element;
        }
      }
    }

    // Fallback to global search
    const { element } = findWithFallbacks(INPUT_SELECTORS);

    // Verify the element is in Copilot context
    if (element && isWithinCopilotContext(element)) {
      return element;
    }

    // Don't return elements that aren't in Copilot context
    // This prevents intercepting issue/PR comment boxes
    if (element && !isWithinCopilotContext(element)) {
      console.log(`[Obfusca] ${SITE_NAME}: Found input but not in Copilot context, ignoring`);
      return null;
    }

    return element;
  },

  getSubmitButton(): HTMLElement | null {
    // Only activate when Copilot context is present
    if (!isCopilotContext()) {
      return null;
    }

    // Try to find button in Copilot-specific containers first
    for (const containerSelector of COPILOT_CONTAINER_SELECTORS) {
      const container = document.querySelector(containerSelector);
      if (container) {
        const { element, selector } = findWithFallbacks(SUBMIT_SELECTORS, container);
        if (element) {
          let btn: HTMLElement | null = element;
          // Traverse up to button if we found a child element
          while (btn && btn.tagName !== 'BUTTON') {
            btn = btn.parentElement;
          }
          if (btn) {
            console.log(`[Obfusca] ${SITE_NAME}: Found submit button in container ${containerSelector} via ${selector}`);
            return btn;
          }
        }
      }
    }

    // Fallback to global search
    let { element: btn, selector } = findWithFallbacks(SUBMIT_SELECTORS);

    if (btn) {
      // Traverse up to button if we found a child element
      while (btn && btn.tagName !== 'BUTTON') {
        btn = btn.parentElement;
      }
      if (btn && selector) {
        console.log(`[Obfusca] ${SITE_NAME}: Found submit button via ${selector}`);
      }
      return btn;
    }

    // Fallback: find button near input within Copilot context
    const input = this.getInputElement();
    if (input) {
      const container = input.closest(
        'form, copilot-chat, copilot-chat-input, [class*="copilot" i], [data-testid*="copilot" i]'
      );
      if (container) {
        const buttons = container.querySelectorAll('button:not([disabled])');
        for (const button of buttons) {
          const rect = button.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            // Look for buttons that might be send buttons
            const ariaLabel = button.getAttribute('aria-label') || '';
            const isLikelySend = ariaLabel.toLowerCase().includes('send') ||
                                 ariaLabel.toLowerCase().includes('submit') ||
                                 button.querySelector('svg') !== null;
            if (isLikelySend) {
              console.log(`[Obfusca] ${SITE_NAME}: Found submit button via proximity fallback (likely send)`);
              return button as HTMLElement;
            }
          }
        }
        // If no obvious send button, return the last visible button
        for (let i = buttons.length - 1; i >= 0; i--) {
          const button = buttons[i];
          const rect = button.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            console.log(`[Obfusca] ${SITE_NAME}: Found submit button via proximity fallback (last button)`);
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
    // For contenteditable, check for paragraphs first
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
      // Dispatch multiple events for React compatibility
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
    // GitHub Copilot typically uses Enter to submit
    return event.key === 'Enter' && !event.shiftKey;
  },

  // Observe for dynamic Copilot panel appearing
  // The panel opens dynamically - MutationObserver must watch for the textarea appearing
  observeSelectors: [
    '#copilot-chat-textarea',
    'textarea[aria-label="Ask anything"]',
    'copilot-chat',
    '[role="dialog"]',
    '.Overlay',
  ],
};

export default githubCopilotConfig;
