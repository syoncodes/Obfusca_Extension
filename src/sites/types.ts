/**
 * Site configuration types for Obfusca multi-site support.
 * Each LLM chat site implements this interface to enable input interception.
 */

/**
 * Configuration for a supported LLM chat site.
 * Adapters implement this interface to handle site-specific DOM structures.
 */
export interface SiteConfig {
  /** Human-readable name for logging and debugging */
  name: string;

  /**
   * Host patterns to match against window.location.hostname.
   * Examples: ['chatgpt.com', 'chat.openai.com']
   */
  hostPatterns: string[];

  /**
   * Find the main text input element on the page.
   * This could be a textarea, contenteditable div, or ProseMirror editor.
   * Returns null if the element is not found (page still loading or DOM changed).
   */
  getInputElement(): HTMLElement | null;

  /**
   * Find the submit/send button.
   * Returns null if not found.
   */
  getSubmitButton(): HTMLElement | null;

  /**
   * Extract text content from the input element.
   * Handles different input types (textarea vs contenteditable).
   */
  getContent(element: HTMLElement): string;

  /**
   * Set content in the input element.
   * Used for redaction or content modification.
   *
   * Implementations MAY return a Promise when the content update is async
   * (e.g. Perplexity's Lexical bridge communicates with a page script).
   * The interceptor will await the promise before computing the content
   * hash for allowNextSubmit, ensuring the hash matches the NEW content
   * rather than the stale pre-update content.
   */
  setContent(element: HTMLElement, content: string): void | Promise<void>;

  /**
   * Clear all content from the input element.
   */
  clearContent(element: HTMLElement): void;

  /**
   * Optional: Get the anchor element for positioning the overlay.
   * Defaults to the submit button if not provided.
   */
  getOverlayAnchor?(): HTMLElement | null;

  /**
   * Optional: Site-specific submit prevention logic.
   * Some sites may need custom handling beyond event.preventDefault().
   */
  preventSubmit?(event: Event): void;

  /**
   * Optional: Check if a keyboard event should trigger submission.
   * Defaults to Enter without Shift if not provided.
   */
  isSubmitKeyCombo?(event: KeyboardEvent): boolean;

  /**
   * Optional: Selectors to watch for dynamic DOM changes.
   * The observer will re-initialize when these elements appear.
   */
  observeSelectors?: string[];

  /**
   * Optional: Find file input elements on the page.
   * Used for intercepting file uploads.
   */
  getFileInputs?(): HTMLInputElement[];

  /**
   * Optional: Find drop zone elements where files can be dropped.
   * Used for intercepting drag-and-drop file uploads.
   */
  getDropZones?(): HTMLElement[];

  /**
   * Optional: Delay in ms before programmatic submit after setContent.
   * Frameworks like Lexical/ProseMirror may need time to reconcile their
   * internal state with DOM changes. Default: 10ms.
   */
  submitDelay?: number;

  /**
   * Optional: Custom submit trigger for sites where button click is unreliable.
   * When provided, this is called instead of the default button-click / form-submit
   * logic in the interceptor's triggerSubmit(). Receives the input element so it
   * can dispatch keyboard events on the correct target.
   */
  triggerSubmit?(input: HTMLElement): void;

  /**
   * Optional: Atomic set-content-and-submit for sites where a gap between
   * setContent and triggerSubmit causes React re-renders that revert content.
   *
   * When provided, the interceptor calls this INSTEAD of the separate
   * setContent() + delay + triggerSubmit() flow. The implementation must
   * set the content AND dispatch the submit event in a single operation
   * with no window for framework re-renders to interfere.
   *
   * Currently used by Perplexity where file attachment events cause React
   * to re-render Lexical's EditorState during the submitDelay window.
   */
  setContentAndSubmit?(element: HTMLElement, content: string): Promise<void>;
}

/**
 * Result of attempting to find and hook a site's input elements.
 */
export interface SiteHookResult {
  /** Whether the input element was found and hooked */
  success: boolean;
  /** The input element if found */
  inputElement: HTMLElement | null;
  /** The submit button if found */
  submitButton: HTMLElement | null;
  /** Error message if hooking failed */
  error?: string;
}

/**
 * State tracked for each active site hook.
 */
export interface SiteState {
  /** The site configuration */
  config: SiteConfig;
  /** Current input element being monitored */
  inputElement: HTMLElement | null;
  /** Current submit button being monitored */
  submitButton: HTMLElement | null;
  /** MutationObserver instance for this site */
  observer: MutationObserver | null;
  /** Whether listeners are currently attached */
  listenersAttached: boolean;
  /** Cleanup function to remove all listeners */
  cleanup: () => void;
}
