/**
 * Grok site adapter for Obfusca.
 * Supports both grok.com (standalone) and x.com/i/grok (embedded in Twitter/X).
 *
 * DOM notes (as of 2024-2025):
 * - grok.com: Standalone Grok interface with textarea in a chat panel
 * - x.com/i/grok: Grok is embedded in a modal/panel that appears dynamically
 * - Both use contenteditable divs or textarea elements for input
 * - x.com loads Grok panel dynamically when clicking Grok button or navigating to x.com/i/grok
 * - Must use MutationObserver to detect when Grok panel appears
 */

import type { SiteConfig } from './types';

const SITE_NAME = 'Grok';

/**
 * Input selectors in priority order.
 *
 * Actual DOM (verified 2025):
 * <div contenteditable="true" class="tiptap ProseMirror" data-placeholder="How can Grok help?"></div>
 *
 * This is a TipTap/ProseMirror editor (contenteditable div), NOT a textarea.
 * - Get content via .innerText (NOT .value)
 * - TipTap/ProseMirror handles its own keyboard events - use capture phase
 * - On x.com/i/grok: panel opens dynamically, MutationObserver needed
 * - On grok.com: same selector should work
 */
const INPUT_SELECTORS = [
  // Primary: TipTap/ProseMirror editor from actual DOM
  'div.tiptap.ProseMirror[contenteditable="true"]',

  // Fallback: data-placeholder from actual DOM
  '[data-placeholder="How can Grok help?"]',

  // Generic TipTap/ProseMirror selectors
  'div.ProseMirror[contenteditable="true"]',
  'div.tiptap[contenteditable="true"]',

  // X.com embedded Grok panel selectors (fallback)
  '[data-testid="grokModal"] div[contenteditable="true"]',
  '[data-testid="grok-drawer"] div[contenteditable="true"]',

  // Legacy fallbacks
  '[data-testid="grok-composer-input"]',
  'textarea[aria-label*="Grok"]',
];

/**
 * Submit button selectors in priority order.
 */
const SUBMIT_SELECTORS = [
  // Aria-label based (common pattern)
  'button[aria-label="Send"]',
  'button[aria-label="Send message"]',

  // Data-testid selectors
  '[data-testid="grok-send-button"]',
  '[data-testid="grokSendButton"]',

  // X.com embedded Grok panel
  '[data-testid="grokModal"] button[aria-label*="Send" i]',
  '[data-testid="grok-drawer"] button[aria-label*="Send" i]',

  // Near the TipTap editor
  '.tiptap ~ button',
  '.ProseMirror ~ button',

  // Form submit fallback
  'form button[type="submit"]',
];

/**
 * Selectors that identify Grok-specific containers/panels.
 * Used to verify we're targeting Grok UI and not tweet composer.
 * On x.com/i/grok: panel opens dynamically, MutationObserver watches for these.
 */
const GROK_CONTAINER_SELECTORS = [
  // TipTap/ProseMirror editor itself
  'div.tiptap.ProseMirror',
  '[data-placeholder="How can Grok help?"]',

  // X.com specific containers
  '[data-testid="grokModal"]',
  '[data-testid="grok-drawer"]',
  '[data-testid="grok-panel"]',

  // Generic Grok indicators
  '[aria-label*="Grok"]',
  '[class*="grok" i]',
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
 * Check if we're on the X.com embedded Grok interface.
 */
function isEmbeddedGrok(): boolean {
  const hostname = window.location.hostname;
  return hostname.includes('x.com') || hostname.includes('twitter.com');
}

/**
 * Check if the current page/path is Grok-related on x.com.
 */
function isGrokPath(): boolean {
  return window.location.pathname.includes('/i/grok') || window.location.pathname.includes('/grok');
}

/**
 * Check if a Grok panel/modal is currently visible in the DOM.
 */
function isGrokPanelOpen(): boolean {
  for (const selector of GROK_CONTAINER_SELECTORS) {
    const container = document.querySelector(selector);
    if (container) {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        console.log(`[Obfusca] ${SITE_NAME}: Grok panel detected via: ${selector}`);
        return true;
      }
    }
  }
  return false;
}

/**
 * Verify that an input element is within a Grok context (not tweet composer).
 */
function isWithinGrokContext(element: HTMLElement): boolean {
  // On grok.com, everything is Grok context
  if (!isEmbeddedGrok()) {
    return true;
  }

  // On x.com, verify the element is within a Grok container
  for (const selector of GROK_CONTAINER_SELECTORS) {
    if (element.closest(selector)) {
      console.log(`[Obfusca] ${SITE_NAME}: Input verified within Grok context: ${selector}`);
      return true;
    }
  }

  // Also check if we're on the Grok path
  if (isGrokPath()) {
    // Even without explicit container, being on /i/grok path suggests Grok context
    console.log(`[Obfusca] ${SITE_NAME}: Input on Grok path, assuming Grok context`);
    return true;
  }

  return false;
}

/**
 * Grok site configuration.
 */
export const grokConfig: SiteConfig = {
  name: SITE_NAME,

  // Both standalone and embedded
  hostPatterns: ['grok.com', 'x.com', 'twitter.com'],

  getInputElement(): HTMLElement | null {
    // On x.com, only activate if Grok panel is visible or we're on Grok path
    if (isEmbeddedGrok() && !isGrokPanelOpen() && !isGrokPath()) {
      return null;
    }

    // Try to find input in Grok-specific containers first (for x.com)
    if (isEmbeddedGrok()) {
      for (const containerSelector of GROK_CONTAINER_SELECTORS) {
        const container = document.querySelector(containerSelector);
        if (container) {
          const { element, selector } = findWithFallbacks(INPUT_SELECTORS, container);
          if (element) {
            console.log(`[Obfusca] ${SITE_NAME}: Found input in container ${containerSelector} via ${selector}`);
            return element;
          }
        }
      }
    }

    // Fallback to global search
    const { element } = findWithFallbacks(INPUT_SELECTORS);

    // Verify the element is in Grok context (not tweet composer)
    if (element && isWithinGrokContext(element)) {
      return element;
    }

    // If we're on x.com and didn't find a valid Grok input, return null
    // This prevents accidentally intercepting tweet composer
    if (isEmbeddedGrok() && element && !isWithinGrokContext(element)) {
      console.log(`[Obfusca] ${SITE_NAME}: Found input but not in Grok context, ignoring`);
      return null;
    }

    return element;
  },

  getSubmitButton(): HTMLElement | null {
    // On x.com, only look for submit button if Grok is active
    if (isEmbeddedGrok() && !isGrokPanelOpen() && !isGrokPath()) {
      return null;
    }

    // Try to find button in Grok-specific containers first
    if (isEmbeddedGrok()) {
      for (const containerSelector of GROK_CONTAINER_SELECTORS) {
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

    // Fallback: find button near input
    const input = this.getInputElement();
    if (input) {
      const container = input.closest('form, [role="form"], [data-testid*="grok" i], [class*="grok" i]');
      if (container) {
        const buttons = container.querySelectorAll('button:not([disabled])');
        for (const button of buttons) {
          const rect = button.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            console.log(`[Obfusca] ${SITE_NAME}: Found submit button via proximity fallback`);
            return button as HTMLElement;
          }
        }
      }
    }

    return null;
  },

  getContent(element: HTMLElement): string {
    // Grok uses TipTap/ProseMirror editor (contenteditable div)
    // For contenteditable, use innerText (NOT .value)
    if (element instanceof HTMLTextAreaElement) {
      return element.value;
    }
    // For TipTap/ProseMirror, innerText gives clean text content
    return element.innerText || element.textContent || '';
  },

  setContent(element: HTMLElement, content: string): void {
    if (element instanceof HTMLTextAreaElement) {
      element.value = content;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // For contenteditable/TipTap
      element.innerText = content;
      // Dispatch input event to notify the editor
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
  },

  clearContent(element: HTMLElement): void {
    if (element instanceof HTMLTextAreaElement) {
      element.value = '';
    } else {
      // For contenteditable, clear innerHTML and dispatch input event
      element.innerHTML = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
  },

  isSubmitKeyCombo(event: KeyboardEvent): boolean {
    // Enter to submit, Shift+Enter for newline
    // Note: TipTap/ProseMirror handles its own events, interceptor uses capture phase
    return event.key === 'Enter' && !event.shiftKey;
  },

  // Observe for dynamic Grok panel appearing
  // On x.com/i/grok: panel opens dynamically, MutationObserver must watch for the editor appearing
  observeSelectors: [
    'div.tiptap.ProseMirror',
    '[data-placeholder="How can Grok help?"]',
    '[data-testid="grokModal"]',
    '[data-testid="grok-drawer"]',
    '[role="dialog"]',
  ],

  getFileInputs(): HTMLInputElement[] {
    // Grok uses file inputs for attachments (may be within modals/panels)
    const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');

    // On x.com, filter to only those within Grok context
    if (isEmbeddedGrok()) {
      return Array.from(inputs).filter(input => {
        for (const selector of GROK_CONTAINER_SELECTORS) {
          if (input.closest(selector)) {
            return true;
          }
        }
        return isGrokPath();
      });
    }

    return Array.from(inputs);
  },

  getDropZones(): HTMLElement[] {
    const zones: HTMLElement[] = [];

    // Find Grok-specific containers
    for (const selector of GROK_CONTAINER_SELECTORS) {
      const container = document.querySelector(selector);
      if (container && container instanceof HTMLElement) {
        zones.push(container);
      }
    }

    // On grok.com, also include main content area
    if (!isEmbeddedGrok()) {
      const mainContainer = document.querySelector('main');
      if (mainContainer) {
        zones.push(mainContainer as HTMLElement);
      }
    }

    return zones;
  },
};

export default grokConfig;
