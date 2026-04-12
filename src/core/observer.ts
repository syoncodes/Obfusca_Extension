/**
 * MutationObserver utilities for Obfusca.
 * Handles dynamic DOM observation for LLM chat sites that load content asynchronously.
 */

export interface ObserverOptions {
  /** Target element to observe (defaults to document.body) */
  target?: Element;
  /** Callback when relevant mutations occur */
  onMutation: () => void;
  /** Debounce delay in milliseconds (defaults to 100ms) */
  debounceMs?: number;
  /** Only trigger on added nodes (defaults to true) */
  addedNodesOnly?: boolean;
}

export interface ObserverHandle {
  /** Start observing */
  start: () => void;
  /** Stop observing and cleanup */
  stop: () => void;
  /** Check if currently observing */
  isObserving: () => boolean;
}

/**
 * Create a debounced MutationObserver for dynamic DOM changes.
 * LLM chat sites frequently update the DOM, so we debounce to avoid excessive callbacks.
 */
export function createDOMObserver(options: ObserverOptions): ObserverHandle {
  const {
    target = document.body,
    onMutation,
    debounceMs = 100,
    addedNodesOnly = true,
  } = options;

  let observer: MutationObserver | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let isActive = false;

  const debouncedCallback = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      onMutation();
      debounceTimer = null;
    }, debounceMs);
  };

  const mutationCallback: MutationCallback = (mutations) => {
    if (addedNodesOnly) {
      const hasNewNodes = mutations.some((m) => m.addedNodes.length > 0);
      if (!hasNewNodes) {
        return;
      }
    }
    debouncedCallback();
  };

  return {
    start() {
      if (isActive || !target) {
        return;
      }

      observer = new MutationObserver(mutationCallback);
      observer.observe(target, {
        childList: true,
        subtree: true,
      });
      isActive = true;
    },

    stop() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      isActive = false;
    },

    isObserving() {
      return isActive;
    },
  };
}

/**
 * Watch for URL changes in SPA applications.
 * Returns a cleanup function.
 */
export function watchURLChanges(
  onURLChange: (newURL: string, oldURL: string) => void,
  intervalMs: number = 500
): () => void {
  let lastURL = window.location.href;

  const intervalId = setInterval(() => {
    const currentURL = window.location.href;
    if (currentURL !== lastURL) {
      const oldURL = lastURL;
      lastURL = currentURL;
      onURLChange(currentURL, oldURL);
    }
  }, intervalMs);

  // Also listen to popstate for back/forward navigation
  const popstateHandler = () => {
    const currentURL = window.location.href;
    if (currentURL !== lastURL) {
      const oldURL = lastURL;
      lastURL = currentURL;
      onURLChange(currentURL, oldURL);
    }
  };

  window.addEventListener('popstate', popstateHandler);

  return () => {
    clearInterval(intervalId);
    window.removeEventListener('popstate', popstateHandler);
  };
}

/**
 * Wait for an element to appear in the DOM.
 * Uses MutationObserver with a timeout.
 */
export function waitForElement(
  selector: string,
  timeoutMs: number = 10000
): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    // Check if already exists
    const existing = document.querySelector(selector) as HTMLElement;
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector) as HTMLElement;
      if (element) {
        observer.disconnect();
        clearTimeout(timeout);
        resolve(element);
      }
    });

    const timeout = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}

/**
 * Create an observer that watches for specific elements to appear.
 * Useful for re-attaching listeners when elements are recreated.
 */
export function watchForElements(
  selectors: string[],
  callback: (element: HTMLElement, selector: string) => void
): ObserverHandle {
  const seenElements = new WeakSet<Element>();

  const checkElements = () => {
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element) => {
        if (!seenElements.has(element)) {
          seenElements.add(element);
          callback(element as HTMLElement, selector);
        }
      });
    }
  };

  const observer = createDOMObserver({
    onMutation: checkElements,
    debounceMs: 50,
  });

  return {
    start() {
      checkElements(); // Initial check
      observer.start();
    },
    stop: observer.stop,
    isObserving: observer.isObserving,
  };
}
