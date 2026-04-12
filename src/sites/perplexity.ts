/**
 * Perplexity (perplexity.ai) site adapter for Obfusca.
 *
 * DOM notes (as of 2024-2025):
 * - AI search engine with conversational follow-ups
 * - Has two main input contexts:
 *   1. Homepage: Search box for initial queries
 *   2. Conversation view: Follow-up input after initial search
 * - Uses a modern React-based UI with a Lexical rich-text editor
 * - The input is a contenteditable div (NOT a textarea)
 * - Lexical maintains its own internal EditorState. All DOM-only manipulation
 *   is reverted by Lexical's reconciler. We MUST use a page script that accesses
 *   __lexicalEditor on the DOM element and uses Lexical's internal API.
 */

import type { SiteConfig } from './types';

const SITE_NAME = 'Perplexity';

// ---------------------------------------------------------------------------
// Page script injection for Lexical bridge
// ---------------------------------------------------------------------------

let pageScriptInjected = false;

/**
 * Inject the Perplexity Lexical bridge page script into the page's JS context.
 *
 * Content scripts run in Chrome's isolated world and CANNOT access JavaScript
 * properties on DOM elements (like __lexicalEditor). The page script runs in
 * the PAGE's JS world where these properties are accessible.
 *
 * Communication happens via CustomEvents on window (DOM events cross worlds).
 */
function injectPerplexityPageScript(): Promise<boolean> {
  if (pageScriptInjected) return Promise.resolve(true);

  return new Promise((resolve) => {
    pageScriptInjected = true;

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('pageScripts/perplexityLexicalBridge.js');
    script.onload = () => {
      console.log('[Obfusca Perplexity] Page script loaded (Lexical bridge)');
      resolve(true);
    };
    script.onerror = () => {
      console.error('[Obfusca Perplexity] Failed to load page script');
      pageScriptInjected = false; // Allow retry
      resolve(false);
    };

    document.documentElement.appendChild(script);

    // Timeout fallback
    setTimeout(() => resolve(false), 2000);
  });
}

/**
 * Set content via the Lexical bridge page script.
 * Returns a promise that resolves to true if the page script confirmed success.
 */
function setContentViaPageScript(element: HTMLElement, content: string): Promise<boolean> {
  return new Promise(async (resolve) => {
    const loaded = await injectPerplexityPageScript();
    if (!loaded) {
      console.warn('[Obfusca Perplexity] Page script not loaded, cannot use Lexical bridge');
      resolve(false);
      return;
    }

    // Listen for the result from the page script
    const timeout = setTimeout(() => {
      window.removeEventListener('obfusca-perplexity-set-result', handler);
      console.warn('[Obfusca Perplexity] Page script set-content timed out');
      resolve(false);
    }, 5000);

    const handler = (event: Event) => {
      clearTimeout(timeout);
      window.removeEventListener('obfusca-perplexity-set-result', handler);
      const detail = (event as CustomEvent).detail || {};
      if (detail.success) {
        console.log(`[Obfusca Perplexity] Page script set-content succeeded (strategy ${detail.strategy})`);
        resolve(true);
      } else {
        console.warn(`[Obfusca Perplexity] Page script set-content failed: ${detail.error}`);
        resolve(false);
      }
    };
    window.addEventListener('obfusca-perplexity-set-result', handler);

    // Send the request to the page script
    window.dispatchEvent(new CustomEvent('obfusca-perplexity-set-content', {
      detail: {
        content,
        elementId: element.id || undefined,
      },
    }));
  });
}

/**
 * Trigger submit via the page script (dispatches Enter from page context).
 * The page script's Enter dispatch happens in the page's JS world, so it reaches
 * Lexical's handlers directly. We set a data attribute on the element BEFORE
 * dispatching so Obfusca's interceptor knows to let it through.
 */
function triggerSubmitViaPageScript(element: HTMLElement): void {
  // Mark the element so our interceptor knows the next Enter is synthetic
  element.dataset.obfuscaSyntheticSubmit = 'true';

  injectPerplexityPageScript().then((loaded) => {
    if (!loaded) {
      console.warn('[Obfusca Perplexity] Page script not loaded for submit, falling back');
      // Fallback: dispatch Enter directly (may be intercepted)
      const enterDown = new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true,
      });
      element.dispatchEvent(enterDown);
      // Clean up marker after event is processed
      Promise.resolve().then(() => { delete element.dataset.obfuscaSyntheticSubmit; });
      return;
    }

    window.dispatchEvent(new CustomEvent('obfusca-perplexity-submit', {
      detail: { elementId: element.id || undefined },
    }));

    // Clean up the marker after the event has been processed
    // Use a short timeout to ensure the capture handlers have run
    setTimeout(() => {
      delete element.dataset.obfuscaSyntheticSubmit;
    }, 100);
  });
}

/**
 * Input selectors in priority order.
 *
 * Actual DOM (verified 2025):
 * <div contenteditable="true" id="ask-input" role="textbox" aria-placeholder="Ask anything..." data-lexical-editor="true"></div>
 *
 * This is a Lexical editor (contenteditable div), NOT a textarea.
 * - Get content via .innerText (NOT .value)
 * - Lexical handles its own events - use capture phase for keydown
 */
const INPUT_SELECTORS = [
  // Primary: Exact ID from actual DOM
  '#ask-input',

  // Fallback: Lexical editor attribute
  '[data-lexical-editor="true"]',

  // Additional fallbacks for role-based selection
  'div[contenteditable="true"][role="textbox"]',
  '[aria-placeholder="Ask anything…"]',
  '[aria-placeholder*="Ask anything"]',

  // Legacy fallbacks in case DOM changes
  '[data-testid="ask-input"]',
  'textarea[placeholder*="Ask" i]',
];

/**
 * Submit button selectors in priority order.
 */
const SUBMIT_SELECTORS = [
  // Aria-label based selectors (common pattern)
  'button[aria-label="Submit"]',
  'button[aria-label="Send"]',
  'button[aria-label="Search"]',

  // Data-testid selectors
  '[data-testid="send-button"]',
  '[data-testid="submit-button"]',
  '[data-testid="search-button"]',

  // Near the input element
  '#ask-input ~ button',
  '[data-lexical-editor="true"] ~ button',

  // Form submit fallback
  'form button[type="submit"]',
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
 * Determine the current context (homepage search vs conversation).
 * Useful for debugging and context-aware input selection.
 */
function _getContext(): 'homepage' | 'conversation' | 'unknown' {
  const path = window.location.pathname;

  // Homepage is typically at root
  if (path === '/' || path === '') {
    console.log(`[Obfusca] ${SITE_NAME}: Detected homepage context`);
    return 'homepage';
  }

  // Conversation/search pages have paths like /search/... or /thread/...
  if (path.includes('/search') || path.includes('/thread') || path.includes('/ask')) {
    console.log(`[Obfusca] ${SITE_NAME}: Detected conversation context`);
    return 'conversation';
  }

  // Check for conversation UI elements
  const hasConversation = document.querySelector('[class*="thread" i], [class*="conversation" i], [class*="answer" i]');
  if (hasConversation) {
    console.log(`[Obfusca] ${SITE_NAME}: Detected conversation context from DOM`);
    return 'conversation';
  }

  return 'unknown';
}

// Export for potential future use
export { _getContext as getContext };

/**
 * Find the best input element based on current context.
 * Perplexity uses a Lexical editor (contenteditable div with id="ask-input").
 */
function findBestInput(): HTMLElement | null {
  // Use our priority selectors - #ask-input is the primary target
  const { element } = findWithFallbacks(INPUT_SELECTORS);
  if (element) {
    return element;
  }

  // Fallback: Look for any visible contenteditable with Lexical attributes
  const editables = document.querySelectorAll('div[contenteditable="true"]');
  for (const editable of editables) {
    const rect = editable.getBoundingClientRect();
    if (rect.width > 100 && rect.height > 20) {
      // Check for Lexical editor indicators
      if (editable.hasAttribute('data-lexical-editor') ||
          editable.getAttribute('role') === 'textbox') {
        console.log(`[Obfusca] ${SITE_NAME}: Found input via contenteditable fallback`);
        return editable as HTMLElement;
      }
    }
  }

  return null;
}

/**
 * Perplexity site configuration.
 */
export const perplexityConfig: SiteConfig = {
  name: SITE_NAME,

  hostPatterns: ['perplexity.ai', 'www.perplexity.ai'],

  getInputElement(): HTMLElement | null {
    return findBestInput();
  },

  getSubmitButton(): HTMLElement | null {
    let { element: btn, selector } = findWithFallbacks(SUBMIT_SELECTORS);

    if (btn) {
      // Traverse up to button if we found a child element (like SVG)
      while (btn && btn.tagName !== 'BUTTON' && btn.tagName !== 'INPUT') {
        btn = btn.parentElement;
      }
      if (btn && selector) {
        console.log(`[Obfusca] ${SITE_NAME}: Found submit button via ${selector}`);
      }
      return btn;
    }

    // Fallback: look for the button near input
    const input = this.getInputElement();
    if (input) {
      const container = input.closest(
        'form, [role="search"], .search-container, [class*="search" i], [class*="input" i], [class*="composer" i]'
      );
      if (container) {
        const buttons = container.querySelectorAll('button:not([disabled])');
        // Find visible buttons that look like search/submit buttons
        for (const button of buttons) {
          const rect = button.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            // Check if button has search/submit-related attributes
            const ariaLabel = button.getAttribute('aria-label') || '';
            const className = button.className || '';
            const type = button.getAttribute('type') || '';

            const isSubmitButton =
              type === 'submit' ||
              ariaLabel.toLowerCase().includes('search') ||
              ariaLabel.toLowerCase().includes('submit') ||
              ariaLabel.toLowerCase().includes('send') ||
              ariaLabel.toLowerCase().includes('ask') ||
              className.toLowerCase().includes('submit') ||
              className.toLowerCase().includes('search') ||
              button.querySelector('svg') !== null;

            if (isSubmitButton) {
              console.log(`[Obfusca] ${SITE_NAME}: Found submit button via proximity (submit-like)`);
              return button as HTMLElement;
            }
          }
        }

        // If no obvious submit button, return the last visible button
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
    // Perplexity uses Lexical editor (contenteditable div)
    // For contenteditable, use innerText (NOT .value)
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      return element.value;
    }
    // For Lexical/contenteditable, innerText gives clean text content
    return element.innerText || element.textContent || '';
  },

  setContent(element: HTMLElement, content: string): void | Promise<void> {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      // Native form elements: set value via native prototype setter (bypasses React)
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      )?.set || Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(element, content);
      } else {
        element.value = content;
      }
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return; // synchronous, returns void
    }

    // Lexical editor: use the page script bridge to update content via
    // Lexical's internal API. All DOM-manipulation strategies fail because
    // Lexical's reconciler reverts DOM changes to match its EditorState.
    //
    // The page script accesses __lexicalEditor on the contenteditable element
    // and uses editor.update() with Lexical's node-creation helpers to replace
    // the editor state from within Lexical's own update cycle.
    //
    // Returns a Promise so the interceptor can AWAIT the content being set
    // before computing the allowNextSubmit hash. Without this, the hash is
    // computed from stale (pre-update) content, causing a hash mismatch
    // that makes the submit get re-scanned or blocked.
    console.log(`[Obfusca Perplexity] setContent: requesting page script to set ${content.length} chars`);

    return setContentViaPageScript(element, content).then((success) => {
      if (success) {
        console.log('[Obfusca Perplexity] setContent: page script confirmed success');
      } else {
        console.warn('[Obfusca Perplexity] setContent: page script failed, trying DOM fallback');
        // Fallback: try clipboard paste from content script context.
        // This may work on some Lexical versions that process paste events
        // from the content script's isolated world.
        element.focus();
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(element);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        // Clear via execCommand (may sync with Lexical)
        document.execCommand('delete', false);

        // Try paste
        const dt = new DataTransfer();
        dt.setData('text/plain', content);
        element.dispatchEvent(new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        }));

        const actual = (element.innerText || '').trim();
        console.log(`[Obfusca Perplexity] DOM fallback result: ${actual.length} chars (expected ${content.length})`);
      }
    });
  },

  clearContent(element: HTMLElement): void {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      element.value = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // Lexical: select all and delete via execCommand
      element.focus();
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      if (!document.execCommand('delete', false)) {
        // Fallback
        element.innerHTML = '';
        element.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'deleteContentBackward',
        }));
      }
    }
  },

  isSubmitKeyCombo(event: KeyboardEvent): boolean {
    // Enter to submit, Shift+Enter for newline
    // Note: Lexical has its own event handling, interceptor uses capture phase
    return event.key === 'Enter' && !event.shiftKey;
  },

  // Lexical needs extra time to reconcile EditorState after the page script
  // updates content via editor.update(). 500ms covers the full cycle:
  //   page script receives event -> editor.update() -> Lexical reconciles DOM
  submitDelay: 500,

  /**
   * Custom submit trigger for Perplexity.
   *
   * Perplexity's submit button is only enabled when Lexical's internal
   * EditorState has content. After programmatic setContent(), Lexical may
   * not have reconciled yet, leaving the button disabled. Clicking a
   * disabled button does nothing.
   *
   * We dispatch Enter from the PAGE SCRIPT context so that:
   * 1. Lexical's own keydown handler processes it for submission
   * 2. The Enter is dispatched in the page's JS world, matching how real
   *    user keypresses work
   *
   * Before dispatching, we set a data attribute on the element
   * (data-obfusca-synthetic-submit="true") so that Obfusca's interceptor
   * knows to let this event through without re-scanning.
   */
  triggerSubmit(input: HTMLElement): void {
    console.log('[Obfusca Perplexity] triggerSubmit: using page script bridge');
    triggerSubmitViaPageScript(input);
  },

  /**
   * Atomic set-content-and-submit for Perplexity.
   *
   * Combines setContent + triggerSubmit into a single page-script operation
   * with NO gap for React to interfere. This prevents the bug where file
   * attachment events trigger React re-renders that reset Lexical's
   * EditorState during the 500ms submitDelay window.
   *
   * The page script sets content via editor.update(), then dispatches Enter
   * on the next requestAnimationFrame — after Lexical reconciles the DOM
   * but before React's batched state updates from file events.
   */
  async setContentAndSubmit(element: HTMLElement, content: string): Promise<void> {
    const loaded = await injectPerplexityPageScript();
    if (!loaded) {
      console.warn('[Obfusca Perplexity] Page script not loaded, cannot use atomic set-and-submit');
      throw new Error('Perplexity page script not loaded');
    }

    // Mark the element so our interceptor knows the next Enter is synthetic
    element.dataset.obfuscaSyntheticSubmit = 'true';

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('obfusca-perplexity-set-and-submit-result', handler);
        delete element.dataset.obfuscaSyntheticSubmit;
        console.warn('[Obfusca Perplexity] Atomic set-and-submit timed out');
        reject(new Error('Atomic set-and-submit timed out'));
      }, 8000);

      const handler = (event: Event) => {
        clearTimeout(timeout);
        window.removeEventListener('obfusca-perplexity-set-and-submit-result', handler);

        const detail = (event as CustomEvent).detail || {};
        if (detail.success) {
          console.log('[Obfusca Perplexity] Atomic set-and-submit succeeded');
          // Clean up the marker after the event has been processed
          setTimeout(() => {
            delete element.dataset.obfuscaSyntheticSubmit;
          }, 100);
          resolve();
        } else {
          delete element.dataset.obfuscaSyntheticSubmit;
          console.warn(`[Obfusca Perplexity] Atomic set-and-submit failed: ${detail.error}`);
          reject(new Error(detail.error || 'Atomic set-and-submit failed'));
        }
      };
      window.addEventListener('obfusca-perplexity-set-and-submit-result', handler);

      // Send the request to the page script
      window.dispatchEvent(new CustomEvent('obfusca-perplexity-set-and-submit', {
        detail: {
          content,
          elementId: element.id || undefined,
        },
      }));
    });
  },

  // Observe for dynamic DOM changes (SPA navigation between homepage and conversations)
  observeSelectors: [
    '#ask-input',
    '[data-lexical-editor="true"]',
    '[role="textbox"]',
    'form',
    'main',
  ],

  getFileInputs(): HTMLInputElement[] {
    // Perplexity uses file inputs for document uploads (typically hidden)
    const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    return Array.from(inputs);
  },

  getDropZones(): HTMLElement[] {
    // The main chat area and input container can be drop zones
    const zones: HTMLElement[] = [];

    // Main content area
    const mainContainer = document.querySelector('main');
    if (mainContainer) {
      zones.push(mainContainer as HTMLElement);
    }

    // Input container
    const inputContainer = document.querySelector('#ask-input')?.closest('form, div');
    if (inputContainer) {
      zones.push(inputContainer as HTMLElement);
    }

    return zones;
  },
};

export default perplexityConfig;
