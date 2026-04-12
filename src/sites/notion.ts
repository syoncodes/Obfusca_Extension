/**
 * Notion AI (notion.so) site adapter for Obfusca.
 *
 * DOM notes (as of 2025):
 * - Notion AI is a feature within Notion, not a standalone chat
 * - AI is triggered via slash commands, highlighting, or dedicated AI blocks
 * - The AI input appears in a modal/popover when triggered
 * - Regular Notion editing should NOT be intercepted — only AI prompts
 * - Need special care to distinguish AI input from normal editing
 */

import type { SiteConfig } from './types';

const SITE_NAME = 'Notion AI';

/**
 * Input selectors specifically for Notion AI prompts (not general editing).
 * These target the AI-specific input that appears in modals/popovers.
 */
const INPUT_SELECTORS = [
  // AI-specific data-testid selectors
  '[data-testid="ai-prompt-input"]',
  '[data-testid="ai-input"]',
  '[data-testid="ai-composer"]',

  // AI-specific placeholders
  '[placeholder*="Ask AI" i]',
  '[placeholder*="Tell AI" i]',
  '[aria-placeholder*="Ask AI" i]',
  '[aria-placeholder*="Tell AI" i]',

  // AI-specific class selectors
  '[class*="notion-ai" i] textarea',
  '[class*="notion-ai" i] [contenteditable="true"]',
  '[class*="ai-input" i] textarea',
  '[class*="ai-input" i] [contenteditable="true"]',
  '[class*="ai-prompt" i] textarea',
  '[class*="ai-prompt" i] [contenteditable="true"]',

  // AI modal/popover context
  '[class*="ai-modal" i] textarea',
  '[class*="ai-modal" i] [contenteditable="true"]',
  '[class*="ai-popover" i] textarea',
  '[class*="ai-popover" i] [contenteditable="true"]',

  // Role-based within AI context
  '[role="dialog"] [placeholder*="AI" i]',
  '[role="dialog"] textarea[class*="ai" i]',
];

/**
 * Submit button selectors for the Notion AI prompt.
 */
const SUBMIT_SELECTORS = [
  // AI-specific buttons
  '[data-testid="ai-submit-button"]',
  '[data-testid="ai-generate-button"]',

  // Aria-label based
  'button[aria-label*="Generate" i]',
  'button[aria-label*="Ask AI" i]',
  'button[aria-label*="Submit" i]',

  // Class-based
  '[class*="notion-ai" i] button[type="submit"]',
  '[class*="ai-submit" i]',
  '[class*="ai-generate" i]',

  // Within AI modal/popover
  '[class*="ai-modal" i] button[type="submit"]',
  '[class*="ai-popover" i] button[type="submit"]',
  '[role="dialog"] button[type="submit"]',
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
 * Check if the Notion AI feature is currently active (modal/popover open).
 */
function isAIFeatureActive(): boolean {
  const aiIndicators = [
    '[data-testid="ai-modal"]',
    '[data-testid="ai-popover"]',
    '[class*="notion-ai" i]',
    '[class*="ai-modal" i]',
    '[class*="ai-popover" i]',
    '[aria-label*="AI" i][role="dialog"]',
  ];

  for (const selector of aiIndicators) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return true;
        }
      }
    } catch (e) {
      // skip invalid selector
    }
  }

  return false;
}

/**
 * Find the best input element — only when AI feature is active.
 */
function findBestInput(): HTMLElement | null {
  // Only intercept when Notion AI is active
  if (!isAIFeatureActive()) {
    return null;
  }

  const { element } = findWithFallbacks(INPUT_SELECTORS);
  if (element) return element;

  // Fallback: look for input within any visible dialog/modal
  const dialogs = document.querySelectorAll('[role="dialog"], [class*="modal" i], [class*="popover" i]');
  for (const dialog of dialogs) {
    const rect = dialog.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      // Check for textarea within dialog
      const textarea = dialog.querySelector('textarea');
      if (textarea) {
        const tRect = textarea.getBoundingClientRect();
        if (tRect.width > 0 && tRect.height > 0) {
          console.log(`[Obfusca] ${SITE_NAME}: Found input via dialog textarea fallback`);
          return textarea as HTMLElement;
        }
      }

      // Check for contenteditable within dialog
      const editable = dialog.querySelector('[contenteditable="true"]');
      if (editable) {
        const eRect = editable.getBoundingClientRect();
        if (eRect.width > 0 && eRect.height > 0) {
          console.log(`[Obfusca] ${SITE_NAME}: Found input via dialog contenteditable fallback`);
          return editable as HTMLElement;
        }
      }
    }
  }

  return null;
}

/**
 * Notion AI site configuration.
 */
export const notionConfig: SiteConfig = {
  name: SITE_NAME,

  hostPatterns: ['notion.so', 'www.notion.so'],

  getInputElement(): HTMLElement | null {
    return findBestInput();
  },

  getSubmitButton(): HTMLElement | null {
    // Only look for submit when AI is active
    if (!isAIFeatureActive()) {
      return null;
    }

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

    // Fallback: look for primary button in AI dialog
    const dialogs = document.querySelectorAll('[role="dialog"], [class*="ai-modal" i], [class*="ai-popover" i]');
    for (const dialog of dialogs) {
      const rect = dialog.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const buttons = dialog.querySelectorAll('button:not([disabled])');
        for (const button of buttons) {
          const bRect = button.getBoundingClientRect();
          if (bRect.width > 0 && bRect.height > 0) {
            const text = button.textContent?.toLowerCase() || '';
            const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';

            if (text.includes('generate') || text.includes('submit') || text.includes('ask') ||
                ariaLabel.includes('generate') || ariaLabel.includes('submit')) {
              console.log(`[Obfusca] ${SITE_NAME}: Found submit button via dialog fallback`);
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
    '[data-testid*="ai" i]',
    '[class*="notion-ai" i]',
    '[class*="ai-modal" i]',
    '[role="dialog"]',
    'main',
  ],
};

export default notionConfig;
