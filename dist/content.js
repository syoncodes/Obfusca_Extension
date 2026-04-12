(function() {
  "use strict";
  const INPUT_SELECTORS$a = [
    "#prompt-textarea",
    'textarea[data-id="root"]',
    'div[contenteditable="true"][data-placeholder]',
    'div[contenteditable="true"]',
    'textarea[placeholder*="Message"]',
    'textarea[placeholder*="Send a message"]'
  ];
  const SUBMIT_SELECTORS$a = [
    'button[data-testid="send-button"]',
    'button[data-testid="fruitjuice-send-button"]',
    'form button[type="submit"]',
    'button[aria-label*="Send"]'
  ];
  const FORM_SELECTORS = ["form", 'div[role="presentation"]'];
  function findWithFallbacks$a(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }
    return null;
  }
  const chatgptConfig = {
    name: "ChatGPT",
    hostPatterns: ["chatgpt.com", "chat.openai.com"],
    getInputElement() {
      return findWithFallbacks$a(INPUT_SELECTORS$a);
    },
    getSubmitButton() {
      let btn = findWithFallbacks$a(SUBMIT_SELECTORS$a);
      if (btn) {
        while (btn && btn.tagName !== "BUTTON") {
          btn = btn.parentElement;
        }
        return btn;
      }
      const input = this.getInputElement();
      if (input) {
        const form = input.closest(FORM_SELECTORS.join(", "));
        if (form) {
          const buttons = form.querySelectorAll("button");
          for (const button of buttons) {
            if (button.disabled) continue;
            const rect = button.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              return button;
            }
          }
        }
      }
      return null;
    },
    getContent(element) {
      if (element instanceof HTMLTextAreaElement) {
        return element.value;
      }
      return element.innerText || element.textContent || "";
    },
    setContent(element, content) {
      if (element instanceof HTMLTextAreaElement) {
        element.value = content;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        element.innerText = content;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
    clearContent(element) {
      this.setContent(element, "");
    },
    // Default Enter behavior without Shift
    isSubmitKeyCombo(event) {
      return event.key === "Enter" && !event.shiftKey;
    },
    observeSelectors: INPUT_SELECTORS$a,
    getFileInputs() {
      const inputs = document.querySelectorAll('input[type="file"]');
      return Array.from(inputs);
    },
    getDropZones() {
      const zones = [];
      const mainContainer = document.querySelector("main");
      if (mainContainer) {
        zones.push(mainContainer);
      }
      const form = document.querySelector("form");
      if (form) {
        zones.push(form);
      }
      return zones;
    }
  };
  const INPUT_SELECTORS$9 = [
    'div.ProseMirror[contenteditable="true"]',
    'fieldset div[contenteditable="true"]',
    'div[data-placeholder][contenteditable="true"]',
    '[data-testid="composer-input"] div[contenteditable="true"]'
  ];
  const SUBMIT_SELECTORS$9 = [
    'button[aria-label*="Send"]',
    'button[aria-label*="send"]',
    'fieldset button[type="button"]:not([aria-label*="Stop"])',
    'button[data-testid="composer-send-button"]',
    // Look for button with send icon (arrow)
    "fieldset button svg"
  ];
  function findWithFallbacks$9(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }
    return null;
  }
  const claudeConfig = {
    name: "Claude",
    hostPatterns: ["claude.ai"],
    getInputElement() {
      return findWithFallbacks$9(INPUT_SELECTORS$9);
    },
    getSubmitButton() {
      let btn = findWithFallbacks$9(SUBMIT_SELECTORS$9);
      if (btn) {
        while (btn && btn.tagName !== "BUTTON") {
          btn = btn.parentElement;
        }
        return btn;
      }
      const input = this.getInputElement();
      if (input) {
        const fieldset = input.closest("fieldset");
        if (fieldset) {
          const buttons = fieldset.querySelectorAll("button:not([disabled])");
          if (buttons.length > 0) {
            return buttons[buttons.length - 1];
          }
        }
      }
      return null;
    },
    getContent(element) {
      const paragraphs = element.querySelectorAll("p");
      if (paragraphs.length > 0) {
        return Array.from(paragraphs).map((p) => p.textContent || "").join("\n");
      }
      return element.innerText || element.textContent || "";
    },
    setContent(element, content) {
      element.innerText = content;
      element.dispatchEvent(new Event("input", { bubbles: true }));
    },
    clearContent(element) {
      element.innerHTML = "<p><br></p>";
      element.dispatchEvent(new Event("input", { bubbles: true }));
    },
    // Claude supports both Enter and Cmd/Ctrl+Enter depending on settings
    isSubmitKeyCombo(event) {
      if (event.key === "Enter") {
        if (event.shiftKey) {
          return false;
        }
        if (event.metaKey || event.ctrlKey) {
          return true;
        }
        return true;
      }
      return false;
    },
    // ProseMirror needs aggressive event prevention
    preventSubmit(event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event instanceof KeyboardEvent) {
        const input = this.getInputElement();
        if (input) {
          input.focus();
        }
      }
    },
    observeSelectors: INPUT_SELECTORS$9,
    getFileInputs() {
      const inputs = document.querySelectorAll('input[type="file"]');
      return Array.from(inputs);
    },
    getDropZones() {
      const zones = [];
      const mainContainer = document.querySelector("main");
      if (mainContainer) {
        zones.push(mainContainer);
      }
      const fieldset = document.querySelector("fieldset");
      if (fieldset) {
        zones.push(fieldset);
      }
      return zones;
    }
  };
  const INPUT_SELECTORS$8 = [
    // Rich text editor
    'rich-textarea div[contenteditable="true"]',
    'div[data-placeholder][contenteditable="true"]',
    // Fallback textarea
    'textarea[aria-label*="prompt"]',
    'textarea[placeholder*="Enter a prompt"]',
    "textarea.ql-editor",
    // Generic contenteditable in the input area
    '.input-area div[contenteditable="true"]',
    'bard-mode-switcher + div div[contenteditable="true"]'
  ];
  const SUBMIT_SELECTORS$8 = [
    // Send button
    'button[aria-label*="Send"]',
    'button[aria-label*="Submit"]',
    "button.send-button",
    // Material icon button
    'button mat-icon[data-mat-icon-name="send"]',
    'button[mattooltip*="Send"]',
    // Generic button with send icon near input
    '.input-area button:not([aria-label*="Voice"])'
  ];
  function findWithFallbacks$8(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }
    const shadowHosts = document.querySelectorAll("rich-textarea, bard-input");
    for (const host of shadowHosts) {
      if (host.shadowRoot) {
        for (const selector of selectors) {
          const element = host.shadowRoot.querySelector(selector);
          if (element) {
            return element;
          }
        }
      }
    }
    return null;
  }
  const geminiConfig = {
    name: "Gemini",
    hostPatterns: ["gemini.google.com", "bard.google.com"],
    getInputElement() {
      return findWithFallbacks$8(INPUT_SELECTORS$8);
    },
    getSubmitButton() {
      let btn = findWithFallbacks$8(SUBMIT_SELECTORS$8);
      if (btn) {
        while (btn && btn.tagName !== "BUTTON") {
          btn = btn.parentElement;
        }
        return btn;
      }
      const input = this.getInputElement();
      if (input) {
        const container = input.closest('.input-area, form, [role="form"]');
        if (container) {
          const buttons = container.querySelectorAll("button:not([disabled])");
          for (const button of buttons) {
            const rect = button.getBoundingClientRect();
            if (rect.width > 20 && rect.height > 20) {
              const icon = button.querySelector("mat-icon, svg");
              if (icon) {
                return button;
              }
            }
          }
        }
      }
      return null;
    },
    getContent(element) {
      if (element instanceof HTMLTextAreaElement) {
        return element.value;
      }
      return element.innerText || element.textContent || "";
    },
    setContent(element, content) {
      if (element instanceof HTMLTextAreaElement) {
        element.value = content;
      } else {
        element.innerText = content;
      }
      element.dispatchEvent(new Event("input", { bubbles: true }));
    },
    clearContent(element) {
      this.setContent(element, "");
    },
    // Gemini uses Enter to submit by default
    isSubmitKeyCombo(event) {
      return event.key === "Enter" && !event.shiftKey;
    },
    observeSelectors: INPUT_SELECTORS$8,
    getFileInputs() {
      const inputs = document.querySelectorAll('input[type="file"]');
      return Array.from(inputs);
    },
    getDropZones() {
      const zones = [];
      const inputArea = document.querySelector(".input-area");
      if (inputArea) {
        zones.push(inputArea);
      }
      const richTextarea = document.querySelector("rich-textarea");
      if (richTextarea) {
        zones.push(richTextarea);
      }
      const mainContainer = document.querySelector("main");
      if (mainContainer) {
        zones.push(mainContainer);
      }
      return zones;
    }
  };
  const SITE_NAME$7 = "Grok";
  const INPUT_SELECTORS$7 = [
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
    'textarea[aria-label*="Grok"]'
  ];
  const SUBMIT_SELECTORS$7 = [
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
    ".tiptap ~ button",
    ".ProseMirror ~ button",
    // Form submit fallback
    'form button[type="submit"]'
  ];
  const GROK_CONTAINER_SELECTORS = [
    // TipTap/ProseMirror editor itself
    "div.tiptap.ProseMirror",
    '[data-placeholder="How can Grok help?"]',
    // X.com specific containers
    '[data-testid="grokModal"]',
    '[data-testid="grok-drawer"]',
    '[data-testid="grok-panel"]',
    // Generic Grok indicators
    '[aria-label*="Grok"]',
    '[class*="grok" i]'
  ];
  function findWithFallbacks$7(selectors, context = document) {
    for (const selector of selectors) {
      try {
        const element = context.querySelector(selector);
        if (element && element instanceof HTMLElement) {
          console.log(`[Obfusca] ${SITE_NAME$7}: Found element via selector: ${selector}`);
          return { element, selector };
        }
      } catch (e) {
        console.warn(`[Obfusca] ${SITE_NAME$7}: Invalid selector skipped: ${selector}`);
      }
    }
    return { element: null, selector: null };
  }
  function isEmbeddedGrok() {
    const hostname = window.location.hostname;
    return hostname.includes("x.com") || hostname.includes("twitter.com");
  }
  function isGrokPath() {
    return window.location.pathname.includes("/i/grok") || window.location.pathname.includes("/grok");
  }
  function isGrokPanelOpen() {
    for (const selector of GROK_CONTAINER_SELECTORS) {
      const container = document.querySelector(selector);
      if (container) {
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          console.log(`[Obfusca] ${SITE_NAME$7}: Grok panel detected via: ${selector}`);
          return true;
        }
      }
    }
    return false;
  }
  function isWithinGrokContext(element) {
    if (!isEmbeddedGrok()) {
      return true;
    }
    for (const selector of GROK_CONTAINER_SELECTORS) {
      if (element.closest(selector)) {
        console.log(`[Obfusca] ${SITE_NAME$7}: Input verified within Grok context: ${selector}`);
        return true;
      }
    }
    if (isGrokPath()) {
      console.log(`[Obfusca] ${SITE_NAME$7}: Input on Grok path, assuming Grok context`);
      return true;
    }
    return false;
  }
  const grokConfig = {
    name: SITE_NAME$7,
    // Both standalone and embedded
    hostPatterns: ["grok.com", "x.com", "twitter.com"],
    getInputElement() {
      if (isEmbeddedGrok() && !isGrokPanelOpen() && !isGrokPath()) {
        return null;
      }
      if (isEmbeddedGrok()) {
        for (const containerSelector of GROK_CONTAINER_SELECTORS) {
          const container = document.querySelector(containerSelector);
          if (container) {
            const { element: element2, selector } = findWithFallbacks$7(INPUT_SELECTORS$7, container);
            if (element2) {
              console.log(`[Obfusca] ${SITE_NAME$7}: Found input in container ${containerSelector} via ${selector}`);
              return element2;
            }
          }
        }
      }
      const { element } = findWithFallbacks$7(INPUT_SELECTORS$7);
      if (element && isWithinGrokContext(element)) {
        return element;
      }
      if (isEmbeddedGrok() && element && !isWithinGrokContext(element)) {
        console.log(`[Obfusca] ${SITE_NAME$7}: Found input but not in Grok context, ignoring`);
        return null;
      }
      return element;
    },
    getSubmitButton() {
      if (isEmbeddedGrok() && !isGrokPanelOpen() && !isGrokPath()) {
        return null;
      }
      if (isEmbeddedGrok()) {
        for (const containerSelector of GROK_CONTAINER_SELECTORS) {
          const container = document.querySelector(containerSelector);
          if (container) {
            const { element, selector: selector2 } = findWithFallbacks$7(SUBMIT_SELECTORS$7, container);
            if (element) {
              let btn2 = element;
              while (btn2 && btn2.tagName !== "BUTTON") {
                btn2 = btn2.parentElement;
              }
              if (btn2) {
                console.log(`[Obfusca] ${SITE_NAME$7}: Found submit button in container ${containerSelector} via ${selector2}`);
                return btn2;
              }
            }
          }
        }
      }
      let { element: btn, selector } = findWithFallbacks$7(SUBMIT_SELECTORS$7);
      if (btn) {
        while (btn && btn.tagName !== "BUTTON") {
          btn = btn.parentElement;
        }
        if (btn && selector) {
          console.log(`[Obfusca] ${SITE_NAME$7}: Found submit button via ${selector}`);
        }
        return btn;
      }
      const input = this.getInputElement();
      if (input) {
        const container = input.closest('form, [role="form"], [data-testid*="grok" i], [class*="grok" i]');
        if (container) {
          const buttons = container.querySelectorAll("button:not([disabled])");
          for (const button of buttons) {
            const rect = button.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              console.log(`[Obfusca] ${SITE_NAME$7}: Found submit button via proximity fallback`);
              return button;
            }
          }
        }
      }
      return null;
    },
    getContent(element) {
      if (element instanceof HTMLTextAreaElement) {
        return element.value;
      }
      return element.innerText || element.textContent || "";
    },
    setContent(element, content) {
      if (element instanceof HTMLTextAreaElement) {
        element.value = content;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        element.innerText = content;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
    clearContent(element) {
      if (element instanceof HTMLTextAreaElement) {
        element.value = "";
      } else {
        element.innerHTML = "";
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
    isSubmitKeyCombo(event) {
      return event.key === "Enter" && !event.shiftKey;
    },
    // Observe for dynamic Grok panel appearing
    // On x.com/i/grok: panel opens dynamically, MutationObserver must watch for the editor appearing
    observeSelectors: [
      "div.tiptap.ProseMirror",
      '[data-placeholder="How can Grok help?"]',
      '[data-testid="grokModal"]',
      '[data-testid="grok-drawer"]',
      '[role="dialog"]'
    ],
    getFileInputs() {
      const inputs = document.querySelectorAll('input[type="file"]');
      if (isEmbeddedGrok()) {
        return Array.from(inputs).filter((input) => {
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
    getDropZones() {
      const zones = [];
      for (const selector of GROK_CONTAINER_SELECTORS) {
        const container = document.querySelector(selector);
        if (container && container instanceof HTMLElement) {
          zones.push(container);
        }
      }
      if (!isEmbeddedGrok()) {
        const mainContainer = document.querySelector("main");
        if (mainContainer) {
          zones.push(mainContainer);
        }
      }
      return zones;
    }
  };
  const SITE_NAME$6 = "DeepSeek";
  const INPUT_SELECTORS$6 = [
    // Data-testid selectors (most stable if they exist)
    '[data-testid="chat-input"]',
    '[data-testid="message-input"]',
    '[data-testid="deepseek-input"]',
    '[data-testid="composer-input"]',
    // ID-based selectors
    "#chat-input",
    "#message-input",
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
    ".input-wrapper textarea",
    ".chat-input-container textarea",
    ".message-input textarea",
    "form textarea",
    // Contenteditable fallbacks
    '[class*="chat-input" i] div[contenteditable="true"]',
    '[class*="ChatInput" i] div[contenteditable="true"]',
    '[class*="composer" i] div[contenteditable="true"]',
    // Generic textarea as last resort (within main content area)
    "main textarea",
    ".main-content textarea",
    '[class*="chat" i] textarea'
  ];
  const SUBMIT_SELECTORS$6 = [
    // Data-testid selectors
    '[data-testid="send-button"]',
    '[data-testid="submit-button"]',
    '[data-testid="chat-send"]',
    // ID-based selectors
    "#send-button",
    // Aria-label based selectors
    'button[aria-label*="Send" i]',
    'button[aria-label*="Submit" i]',
    // DeepSeek-specific: the send button is often a div with role="button"
    'div[role="button"][class*="send" i]',
    'div[role="button"][aria-label*="Send" i]',
    // Class-based selectors
    'button[class*="send" i]',
    "button.send-button",
    '[class*="send-btn" i]',
    '[class*="SendButton" i]',
    // SVG-based detection (send icon)
    'button svg[class*="send" i]',
    // Sibling-based: button near textarea
    "textarea ~ button",
    "textarea + button",
    "textarea ~ div > button",
    // Container-based selectors
    ".input-wrapper button",
    ".chat-input-container button",
    '[class*="InputArea" i] button:not([aria-label*="attachment" i])',
    '[class*="ChatInput" i] button:not([aria-label*="attachment" i])',
    '[class*="composer" i] button[type="submit"]',
    '[class*="composer" i] button:last-of-type',
    // Form submit button
    'form button[type="submit"]',
    "form button:last-of-type"
  ];
  function findWithFallbacks$6(selectors, context = document) {
    for (const selector of selectors) {
      try {
        const element = context.querySelector(selector);
        if (element && element instanceof HTMLElement) {
          const rect = element.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            console.log(`[Obfusca] ${SITE_NAME$6}: Found element via selector: ${selector}`);
            return { element, selector };
          }
        }
      } catch (e) {
        console.warn(`[Obfusca] ${SITE_NAME$6}: Invalid selector skipped: ${selector}`);
      }
    }
    return { element: null, selector: null };
  }
  function findBestInput$5() {
    const { element } = findWithFallbacks$6(INPUT_SELECTORS$6);
    if (element) {
      return element;
    }
    const textareas = document.querySelectorAll("textarea");
    for (const textarea of textareas) {
      const rect = textarea.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 30) {
        const parent = textarea.closest('form, [class*="chat" i], [class*="input" i], main');
        if (parent) {
          console.log(`[Obfusca] ${SITE_NAME$6}: Found input via textarea fallback`);
          return textarea;
        }
      }
    }
    const editables = document.querySelectorAll('div[contenteditable="true"]');
    for (const editable of editables) {
      const rect = editable.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 20) {
        const parent = editable.closest('[class*="chat" i], [class*="input" i], form, main');
        if (parent) {
          console.log(`[Obfusca] ${SITE_NAME$6}: Found input via contenteditable fallback`);
          return editable;
        }
      }
    }
    return null;
  }
  const deepseekConfig = {
    name: SITE_NAME$6,
    hostPatterns: ["chat.deepseek.com", "deepseek.com"],
    getInputElement() {
      return findBestInput$5();
    },
    getSubmitButton() {
      let { element: btn, selector } = findWithFallbacks$6(SUBMIT_SELECTORS$6);
      if (btn) {
        while (btn && btn.tagName !== "BUTTON" && btn.getAttribute("role") !== "button") {
          btn = btn.parentElement;
        }
        if (btn && selector) {
          console.log(`[Obfusca] ${SITE_NAME$6}: Found submit button via ${selector}`);
        }
        return btn;
      }
      const input = this.getInputElement();
      if (input) {
        let container = null;
        let el = input;
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
          for (const button of buttons) {
            const rect = button.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const ariaLabel = button.getAttribute("aria-label") || "";
              const className = button.className || "";
              const textContent = button.textContent || "";
              const isSendButton = ariaLabel.toLowerCase().includes("send") || className.toLowerCase().includes("send") || textContent.toLowerCase().includes("send") || button.querySelector("svg") !== null;
              if (isSendButton) {
                console.log(`[Obfusca] ${SITE_NAME$6}: Found submit button via proximity (send-like)`);
                return button;
              }
            }
          }
          for (let i = buttons.length - 1; i >= 0; i--) {
            const button = buttons[i];
            const rect = button.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              console.log(`[Obfusca] ${SITE_NAME$6}: Found submit button via proximity (last button)`);
              return button;
            }
          }
        }
      }
      return null;
    },
    getContent(element) {
      if (element instanceof HTMLTextAreaElement) {
        return element.value;
      }
      const paragraphs = element.querySelectorAll("p");
      if (paragraphs.length > 0) {
        return Array.from(paragraphs).map((p) => p.textContent || "").join("\n");
      }
      return element.innerText || element.textContent || "";
    },
    setContent(element, content) {
      if (element instanceof HTMLTextAreaElement) {
        element.value = content;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        element.innerText = content;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
    clearContent(element) {
      this.setContent(element, "");
    },
    isSubmitKeyCombo(event) {
      return event.key === "Enter" && !event.shiftKey;
    },
    // Observe for dynamic DOM changes
    observeSelectors: [
      ...INPUT_SELECTORS$6.slice(0, 20),
      // Limit to avoid performance issues
      // Watch for common containers that might appear
      '[class*="chat" i]',
      '[class*="input" i]',
      '[class*="composer" i]',
      "main",
      "form"
    ]
  };
  const SITE_NAME$5 = "GitHub Copilot";
  const INPUT_SELECTORS$5 = [
    // Primary: Exact ID from actual DOM
    "#copilot-chat-textarea",
    // Fallback: aria-label from actual DOM
    'textarea[aria-label="Ask anything"]',
    // Additional fallbacks for potential DOM variations
    '[data-testid="copilot-chat-textarea"]',
    '[data-testid="copilot-input"]',
    "copilot-chat textarea",
    '[aria-label="Ask Copilot"]',
    'textarea[placeholder="Ask anything"]'
  ];
  const SUBMIT_SELECTORS$5 = [
    // Aria-label based (common pattern for send buttons)
    'button[aria-label="Send"]',
    'button[aria-label="Send" i]',
    // Data-testid selectors
    '[data-testid="copilot-send-button"]',
    '[data-testid="copilot-chat-send"]',
    // GitHub Copilot custom elements
    'copilot-chat button[type="submit"]',
    // Container-based fallbacks
    "#copilot-chat-textarea ~ button",
    '[aria-label*="Copilot" i] button[type="submit"]'
  ];
  const COPILOT_CONTAINER_SELECTORS = [
    // Container with the chat textarea
    "#copilot-chat-textarea",
    // Custom elements
    "copilot-chat",
    "copilot-chat-input",
    "copilot-workspace-chat",
    // Generic patterns
    '[data-testid*="copilot" i]',
    '[aria-label*="Copilot" i]',
    '[class*="copilot" i]'
  ];
  function findWithFallbacks$5(selectors, context = document) {
    for (const selector of selectors) {
      try {
        const element = context.querySelector(selector);
        if (element && element instanceof HTMLElement) {
          console.log(`[Obfusca] ${SITE_NAME$5}: Found element via selector: ${selector}`);
          return { element, selector };
        }
      } catch (e) {
        console.warn(`[Obfusca] ${SITE_NAME$5}: Invalid selector skipped: ${selector}`);
      }
    }
    return { element: null, selector: null };
  }
  function isCopilotContext() {
    const path = window.location.pathname;
    if (path.startsWith("/copilot") || path.includes("/copilot")) {
      console.log(`[Obfusca] ${SITE_NAME$5}: On Copilot page path`);
      return true;
    }
    for (const selector of COPILOT_CONTAINER_SELECTORS) {
      const container = document.querySelector(selector);
      if (container) {
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          console.log(`[Obfusca] ${SITE_NAME$5}: Copilot panel detected via: ${selector}`);
          return true;
        }
      }
    }
    return false;
  }
  function isWithinCopilotContext(element) {
    for (const selector of COPILOT_CONTAINER_SELECTORS) {
      if (element.closest(selector)) {
        console.log(`[Obfusca] ${SITE_NAME$5}: Input verified within Copilot context: ${selector}`);
        return true;
      }
    }
    const path = window.location.pathname;
    if (path.startsWith("/copilot") || path.includes("/copilot")) {
      console.log(`[Obfusca] ${SITE_NAME$5}: Input on Copilot page, assuming Copilot context`);
      return true;
    }
    return false;
  }
  const githubCopilotConfig = {
    name: SITE_NAME$5,
    hostPatterns: ["github.com"],
    getInputElement() {
      if (!isCopilotContext()) {
        return null;
      }
      for (const containerSelector of COPILOT_CONTAINER_SELECTORS) {
        const container = document.querySelector(containerSelector);
        if (container) {
          const { element: element2, selector } = findWithFallbacks$5(INPUT_SELECTORS$5, container);
          if (element2) {
            console.log(`[Obfusca] ${SITE_NAME$5}: Found input in container ${containerSelector} via ${selector}`);
            return element2;
          }
        }
      }
      const { element } = findWithFallbacks$5(INPUT_SELECTORS$5);
      if (element && isWithinCopilotContext(element)) {
        return element;
      }
      if (element && !isWithinCopilotContext(element)) {
        console.log(`[Obfusca] ${SITE_NAME$5}: Found input but not in Copilot context, ignoring`);
        return null;
      }
      return element;
    },
    getSubmitButton() {
      if (!isCopilotContext()) {
        return null;
      }
      for (const containerSelector of COPILOT_CONTAINER_SELECTORS) {
        const container = document.querySelector(containerSelector);
        if (container) {
          const { element, selector: selector2 } = findWithFallbacks$5(SUBMIT_SELECTORS$5, container);
          if (element) {
            let btn2 = element;
            while (btn2 && btn2.tagName !== "BUTTON") {
              btn2 = btn2.parentElement;
            }
            if (btn2) {
              console.log(`[Obfusca] ${SITE_NAME$5}: Found submit button in container ${containerSelector} via ${selector2}`);
              return btn2;
            }
          }
        }
      }
      let { element: btn, selector } = findWithFallbacks$5(SUBMIT_SELECTORS$5);
      if (btn) {
        while (btn && btn.tagName !== "BUTTON") {
          btn = btn.parentElement;
        }
        if (btn && selector) {
          console.log(`[Obfusca] ${SITE_NAME$5}: Found submit button via ${selector}`);
        }
        return btn;
      }
      const input = this.getInputElement();
      if (input) {
        const container = input.closest(
          'form, copilot-chat, copilot-chat-input, [class*="copilot" i], [data-testid*="copilot" i]'
        );
        if (container) {
          const buttons = container.querySelectorAll("button:not([disabled])");
          for (const button of buttons) {
            const rect = button.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const ariaLabel = button.getAttribute("aria-label") || "";
              const isLikelySend = ariaLabel.toLowerCase().includes("send") || ariaLabel.toLowerCase().includes("submit") || button.querySelector("svg") !== null;
              if (isLikelySend) {
                console.log(`[Obfusca] ${SITE_NAME$5}: Found submit button via proximity fallback (likely send)`);
                return button;
              }
            }
          }
          for (let i = buttons.length - 1; i >= 0; i--) {
            const button = buttons[i];
            const rect = button.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              console.log(`[Obfusca] ${SITE_NAME$5}: Found submit button via proximity fallback (last button)`);
              return button;
            }
          }
        }
      }
      return null;
    },
    getContent(element) {
      if (element instanceof HTMLTextAreaElement) {
        return element.value;
      }
      const paragraphs = element.querySelectorAll("p");
      if (paragraphs.length > 0) {
        return Array.from(paragraphs).map((p) => p.textContent || "").join("\n");
      }
      return element.innerText || element.textContent || "";
    },
    setContent(element, content) {
      if (element instanceof HTMLTextAreaElement) {
        element.value = content;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        element.innerText = content;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
    clearContent(element) {
      this.setContent(element, "");
    },
    isSubmitKeyCombo(event) {
      return event.key === "Enter" && !event.shiftKey;
    },
    // Observe for dynamic Copilot panel appearing
    // The panel opens dynamically - MutationObserver must watch for the textarea appearing
    observeSelectors: [
      "#copilot-chat-textarea",
      'textarea[aria-label="Ask anything"]',
      "copilot-chat",
      '[role="dialog"]',
      ".Overlay"
    ]
  };
  const SITE_NAME$4 = "Perplexity";
  let pageScriptInjected$1 = false;
  function injectPerplexityPageScript() {
    if (pageScriptInjected$1) return Promise.resolve(true);
    return new Promise((resolve) => {
      pageScriptInjected$1 = true;
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("pageScripts/perplexityLexicalBridge.js");
      script.onload = () => {
        console.log("[Obfusca Perplexity] Page script loaded (Lexical bridge)");
        resolve(true);
      };
      script.onerror = () => {
        console.error("[Obfusca Perplexity] Failed to load page script");
        pageScriptInjected$1 = false;
        resolve(false);
      };
      document.documentElement.appendChild(script);
      setTimeout(() => resolve(false), 2e3);
    });
  }
  function setContentViaPageScript(element, content) {
    return new Promise(async (resolve) => {
      const loaded = await injectPerplexityPageScript();
      if (!loaded) {
        console.warn("[Obfusca Perplexity] Page script not loaded, cannot use Lexical bridge");
        resolve(false);
        return;
      }
      const timeout = setTimeout(() => {
        window.removeEventListener("obfusca-perplexity-set-result", handler);
        console.warn("[Obfusca Perplexity] Page script set-content timed out");
        resolve(false);
      }, 5e3);
      const handler = (event) => {
        clearTimeout(timeout);
        window.removeEventListener("obfusca-perplexity-set-result", handler);
        const detail = event.detail || {};
        if (detail.success) {
          console.log(`[Obfusca Perplexity] Page script set-content succeeded (strategy ${detail.strategy})`);
          resolve(true);
        } else {
          console.warn(`[Obfusca Perplexity] Page script set-content failed: ${detail.error}`);
          resolve(false);
        }
      };
      window.addEventListener("obfusca-perplexity-set-result", handler);
      window.dispatchEvent(new CustomEvent("obfusca-perplexity-set-content", {
        detail: {
          content,
          elementId: element.id || void 0
        }
      }));
    });
  }
  function triggerSubmitViaPageScript(element) {
    element.dataset.obfuscaSyntheticSubmit = "true";
    injectPerplexityPageScript().then((loaded) => {
      if (!loaded) {
        console.warn("[Obfusca Perplexity] Page script not loaded for submit, falling back");
        const enterDown = new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        });
        element.dispatchEvent(enterDown);
        Promise.resolve().then(() => {
          delete element.dataset.obfuscaSyntheticSubmit;
        });
        return;
      }
      window.dispatchEvent(new CustomEvent("obfusca-perplexity-submit", {
        detail: { elementId: element.id || void 0 }
      }));
      setTimeout(() => {
        delete element.dataset.obfuscaSyntheticSubmit;
      }, 100);
    });
  }
  const INPUT_SELECTORS$4 = [
    // Primary: Exact ID from actual DOM
    "#ask-input",
    // Fallback: Lexical editor attribute
    '[data-lexical-editor="true"]',
    // Additional fallbacks for role-based selection
    'div[contenteditable="true"][role="textbox"]',
    '[aria-placeholder="Ask anything…"]',
    '[aria-placeholder*="Ask anything"]',
    // Legacy fallbacks in case DOM changes
    '[data-testid="ask-input"]',
    'textarea[placeholder*="Ask" i]'
  ];
  const SUBMIT_SELECTORS$4 = [
    // Aria-label based selectors (common pattern)
    'button[aria-label="Submit"]',
    'button[aria-label="Send"]',
    'button[aria-label="Search"]',
    // Data-testid selectors
    '[data-testid="send-button"]',
    '[data-testid="submit-button"]',
    '[data-testid="search-button"]',
    // Near the input element
    "#ask-input ~ button",
    '[data-lexical-editor="true"] ~ button',
    // Form submit fallback
    'form button[type="submit"]'
  ];
  function findWithFallbacks$4(selectors, context = document) {
    for (const selector of selectors) {
      try {
        const element = context.querySelector(selector);
        if (element && element instanceof HTMLElement) {
          const rect = element.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            console.log(`[Obfusca] ${SITE_NAME$4}: Found element via selector: ${selector}`);
            return { element, selector };
          }
        }
      } catch (e) {
        console.warn(`[Obfusca] ${SITE_NAME$4}: Invalid selector skipped: ${selector}`);
      }
    }
    return { element: null, selector: null };
  }
  function findBestInput$4() {
    const { element } = findWithFallbacks$4(INPUT_SELECTORS$4);
    if (element) {
      return element;
    }
    const editables = document.querySelectorAll('div[contenteditable="true"]');
    for (const editable of editables) {
      const rect = editable.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 20) {
        if (editable.hasAttribute("data-lexical-editor") || editable.getAttribute("role") === "textbox") {
          console.log(`[Obfusca] ${SITE_NAME$4}: Found input via contenteditable fallback`);
          return editable;
        }
      }
    }
    return null;
  }
  const perplexityConfig = {
    name: SITE_NAME$4,
    hostPatterns: ["perplexity.ai", "www.perplexity.ai"],
    getInputElement() {
      return findBestInput$4();
    },
    getSubmitButton() {
      let { element: btn, selector } = findWithFallbacks$4(SUBMIT_SELECTORS$4);
      if (btn) {
        while (btn && btn.tagName !== "BUTTON" && btn.tagName !== "INPUT") {
          btn = btn.parentElement;
        }
        if (btn && selector) {
          console.log(`[Obfusca] ${SITE_NAME$4}: Found submit button via ${selector}`);
        }
        return btn;
      }
      const input = this.getInputElement();
      if (input) {
        const container = input.closest(
          'form, [role="search"], .search-container, [class*="search" i], [class*="input" i], [class*="composer" i]'
        );
        if (container) {
          const buttons = container.querySelectorAll("button:not([disabled])");
          for (const button of buttons) {
            const rect = button.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const ariaLabel = button.getAttribute("aria-label") || "";
              const className = button.className || "";
              const type = button.getAttribute("type") || "";
              const isSubmitButton = type === "submit" || ariaLabel.toLowerCase().includes("search") || ariaLabel.toLowerCase().includes("submit") || ariaLabel.toLowerCase().includes("send") || ariaLabel.toLowerCase().includes("ask") || className.toLowerCase().includes("submit") || className.toLowerCase().includes("search") || button.querySelector("svg") !== null;
              if (isSubmitButton) {
                console.log(`[Obfusca] ${SITE_NAME$4}: Found submit button via proximity (submit-like)`);
                return button;
              }
            }
          }
          for (let i = buttons.length - 1; i >= 0; i--) {
            const button = buttons[i];
            const rect = button.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              console.log(`[Obfusca] ${SITE_NAME$4}: Found submit button via proximity (last button)`);
              return button;
            }
          }
        }
      }
      return null;
    },
    getContent(element) {
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
        return element.value;
      }
      return element.innerText || element.textContent || "";
    },
    setContent(element, content) {
      var _a, _b;
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
        const nativeInputValueSetter = ((_a = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value"
        )) == null ? void 0 : _a.set) || ((_b = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )) == null ? void 0 : _b.set);
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(element, content);
        } else {
          element.value = content;
        }
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      console.log(`[Obfusca Perplexity] setContent: requesting page script to set ${content.length} chars`);
      return setContentViaPageScript(element, content).then((success) => {
        if (success) {
          console.log("[Obfusca Perplexity] setContent: page script confirmed success");
        } else {
          console.warn("[Obfusca Perplexity] setContent: page script failed, trying DOM fallback");
          element.focus();
          const sel = window.getSelection();
          if (sel) {
            const range = document.createRange();
            range.selectNodeContents(element);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          document.execCommand("delete", false);
          const dt = new DataTransfer();
          dt.setData("text/plain", content);
          element.dispatchEvent(new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: dt
          }));
          const actual = (element.innerText || "").trim();
          console.log(`[Obfusca Perplexity] DOM fallback result: ${actual.length} chars (expected ${content.length})`);
        }
      });
    },
    clearContent(element) {
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
        element.value = "";
        element.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        element.focus();
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(element);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        if (!document.execCommand("delete", false)) {
          element.innerHTML = "";
          element.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            cancelable: true,
            inputType: "deleteContentBackward"
          }));
        }
      }
    },
    isSubmitKeyCombo(event) {
      return event.key === "Enter" && !event.shiftKey;
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
    triggerSubmit(input) {
      console.log("[Obfusca Perplexity] triggerSubmit: using page script bridge");
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
    async setContentAndSubmit(element, content) {
      const loaded = await injectPerplexityPageScript();
      if (!loaded) {
        console.warn("[Obfusca Perplexity] Page script not loaded, cannot use atomic set-and-submit");
        throw new Error("Perplexity page script not loaded");
      }
      element.dataset.obfuscaSyntheticSubmit = "true";
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          window.removeEventListener("obfusca-perplexity-set-and-submit-result", handler);
          delete element.dataset.obfuscaSyntheticSubmit;
          console.warn("[Obfusca Perplexity] Atomic set-and-submit timed out");
          reject(new Error("Atomic set-and-submit timed out"));
        }, 8e3);
        const handler = (event) => {
          clearTimeout(timeout);
          window.removeEventListener("obfusca-perplexity-set-and-submit-result", handler);
          const detail = event.detail || {};
          if (detail.success) {
            console.log("[Obfusca Perplexity] Atomic set-and-submit succeeded");
            setTimeout(() => {
              delete element.dataset.obfuscaSyntheticSubmit;
            }, 100);
            resolve();
          } else {
            delete element.dataset.obfuscaSyntheticSubmit;
            console.warn(`[Obfusca Perplexity] Atomic set-and-submit failed: ${detail.error}`);
            reject(new Error(detail.error || "Atomic set-and-submit failed"));
          }
        };
        window.addEventListener("obfusca-perplexity-set-and-submit-result", handler);
        window.dispatchEvent(new CustomEvent("obfusca-perplexity-set-and-submit", {
          detail: {
            content,
            elementId: element.id || void 0
          }
        }));
      });
    },
    // Observe for dynamic DOM changes (SPA navigation between homepage and conversations)
    observeSelectors: [
      "#ask-input",
      '[data-lexical-editor="true"]',
      '[role="textbox"]',
      "form",
      "main"
    ],
    getFileInputs() {
      const inputs = document.querySelectorAll('input[type="file"]');
      return Array.from(inputs);
    },
    getDropZones() {
      var _a;
      const zones = [];
      const mainContainer = document.querySelector("main");
      if (mainContainer) {
        zones.push(mainContainer);
      }
      const inputContainer = (_a = document.querySelector("#ask-input")) == null ? void 0 : _a.closest("form, div");
      if (inputContainer) {
        zones.push(inputContainer);
      }
      return zones;
    }
  };
  const SITE_NAME$3 = "Microsoft Copilot";
  const INPUT_SELECTORS$3 = [
    // Data-testid selectors
    '[data-testid="chat-input"]',
    '[data-testid="composer-input"]',
    '[data-testid="searchbox"]',
    // ID-based selectors
    "#searchbox",
    "#userInput",
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
    "form textarea",
    "main textarea"
  ];
  const SUBMIT_SELECTORS$3 = [
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
    'form button[type="submit"]'
  ];
  function findWithFallbacks$3(selectors, context = document) {
    for (const selector of selectors) {
      try {
        const element = context.querySelector(selector);
        if (element && element instanceof HTMLElement) {
          const rect = element.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            console.log(`[Obfusca] ${SITE_NAME$3}: Found element via selector: ${selector}`);
            return { element, selector };
          }
        }
      } catch (e) {
        console.warn(`[Obfusca] ${SITE_NAME$3}: Invalid selector skipped: ${selector}`);
      }
    }
    return { element: null, selector: null };
  }
  function findShadowDOMInput() {
    const cibSerp = document.querySelector("cib-serp");
    if (cibSerp == null ? void 0 : cibSerp.shadowRoot) {
      const actionBar = cibSerp.shadowRoot.querySelector("cib-action-bar");
      if (actionBar == null ? void 0 : actionBar.shadowRoot) {
        const textarea = actionBar.shadowRoot.querySelector("textarea");
        if (textarea) {
          console.log(`[Obfusca] ${SITE_NAME$3}: Found input via shadow DOM`);
          return textarea;
        }
      }
    }
    return null;
  }
  function findBestInput$3() {
    const { element } = findWithFallbacks$3(INPUT_SELECTORS$3);
    if (element) return element;
    const shadowInput = findShadowDOMInput();
    if (shadowInput) return shadowInput;
    const textareas = document.querySelectorAll("textarea");
    for (const textarea of textareas) {
      const rect = textarea.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 30) {
        const parent = textarea.closest('form, [class*="chat" i], [class*="input" i], main');
        if (parent) {
          console.log(`[Obfusca] ${SITE_NAME$3}: Found input via textarea fallback`);
          return textarea;
        }
      }
    }
    return null;
  }
  const copilotConfig = {
    name: SITE_NAME$3,
    hostPatterns: ["copilot.microsoft.com"],
    getInputElement() {
      return findBestInput$3();
    },
    getSubmitButton() {
      let { element: btn, selector } = findWithFallbacks$3(SUBMIT_SELECTORS$3);
      if (btn) {
        while (btn && btn.tagName !== "BUTTON") {
          btn = btn.parentElement;
        }
        if (btn && selector) {
          console.log(`[Obfusca] ${SITE_NAME$3}: Found submit button via ${selector}`);
        }
        return btn;
      }
      const input = this.getInputElement();
      if (input) {
        const container = input.closest(
          'form, [class*="chat" i], [class*="input" i], [class*="composer" i]'
        );
        if (container) {
          const buttons = container.querySelectorAll("button:not([disabled])");
          for (const button of buttons) {
            const rect = button.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const ariaLabel = button.getAttribute("aria-label") || "";
              const className = button.className || "";
              const isSendButton = ariaLabel.toLowerCase().includes("send") || ariaLabel.toLowerCase().includes("submit") || className.toLowerCase().includes("send") || button.querySelector("svg") !== null;
              if (isSendButton) {
                console.log(`[Obfusca] ${SITE_NAME$3}: Found submit button via proximity`);
                return button;
              }
            }
          }
        }
      }
      return null;
    },
    getContent(element) {
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
        return element.value;
      }
      return element.innerText || element.textContent || "";
    },
    setContent(element, content) {
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
        element.value = content;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        element.innerText = content;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
    clearContent(element) {
      this.setContent(element, "");
    },
    isSubmitKeyCombo(event) {
      return event.key === "Enter" && !event.shiftKey;
    },
    observeSelectors: [
      "textarea",
      '[role="textbox"]',
      '[contenteditable="true"]',
      "form",
      "main"
    ]
  };
  const SITE_NAME$2 = "Mistral";
  const INPUT_SELECTORS$2 = [
    // Data-testid selectors
    '[data-testid="chat-input"]',
    '[data-testid="composer-input"]',
    '[data-testid="message-input"]',
    // ID-based selectors
    "#chat-input",
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
    "form textarea",
    "main textarea"
  ];
  const SUBMIT_SELECTORS$2 = [
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
    "form button:last-of-type"
  ];
  function findWithFallbacks$2(selectors, context = document) {
    for (const selector of selectors) {
      try {
        const element = context.querySelector(selector);
        if (element && element instanceof HTMLElement) {
          const rect = element.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            console.log(`[Obfusca] ${SITE_NAME$2}: Found element via selector: ${selector}`);
            return { element, selector };
          }
        }
      } catch (e) {
        console.warn(`[Obfusca] ${SITE_NAME$2}: Invalid selector skipped: ${selector}`);
      }
    }
    return { element: null, selector: null };
  }
  function findBestInput$2() {
    const { element } = findWithFallbacks$2(INPUT_SELECTORS$2);
    if (element) return element;
    const textareas = document.querySelectorAll("textarea");
    for (const textarea of textareas) {
      const rect = textarea.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 30) {
        const parent = textarea.closest('form, [class*="chat" i], [class*="input" i], main');
        if (parent) {
          console.log(`[Obfusca] ${SITE_NAME$2}: Found input via textarea fallback`);
          return textarea;
        }
      }
    }
    const editables = document.querySelectorAll('div[contenteditable="true"]');
    for (const editable of editables) {
      const rect = editable.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 20) {
        const parent = editable.closest('[class*="chat" i], [class*="input" i], form, main');
        if (parent) {
          console.log(`[Obfusca] ${SITE_NAME$2}: Found input via contenteditable fallback`);
          return editable;
        }
      }
    }
    return null;
  }
  const mistralConfig = {
    name: SITE_NAME$2,
    hostPatterns: ["chat.mistral.ai"],
    getInputElement() {
      return findBestInput$2();
    },
    getSubmitButton() {
      let { element: btn, selector } = findWithFallbacks$2(SUBMIT_SELECTORS$2);
      if (btn) {
        while (btn && btn.tagName !== "BUTTON") {
          btn = btn.parentElement;
        }
        if (btn && selector) {
          console.log(`[Obfusca] ${SITE_NAME$2}: Found submit button via ${selector}`);
        }
        return btn;
      }
      const input = this.getInputElement();
      if (input) {
        const container = input.closest(
          'form, [class*="chat" i], [class*="input" i], [class*="composer" i]'
        );
        if (container) {
          const buttons = container.querySelectorAll("button:not([disabled])");
          for (const button of buttons) {
            const rect = button.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const ariaLabel = button.getAttribute("aria-label") || "";
              const className = button.className || "";
              const isSendButton = ariaLabel.toLowerCase().includes("send") || ariaLabel.toLowerCase().includes("submit") || className.toLowerCase().includes("send") || button.querySelector("svg") !== null;
              if (isSendButton) {
                console.log(`[Obfusca] ${SITE_NAME$2}: Found submit button via proximity`);
                return button;
              }
            }
          }
          for (let i = buttons.length - 1; i >= 0; i--) {
            const button = buttons[i];
            const rect = button.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              console.log(`[Obfusca] ${SITE_NAME$2}: Found submit button via proximity (last button)`);
              return button;
            }
          }
        }
      }
      return null;
    },
    getContent(element) {
      if (element instanceof HTMLTextAreaElement) {
        return element.value;
      }
      return element.innerText || element.textContent || "";
    },
    setContent(element, content) {
      if (element instanceof HTMLTextAreaElement) {
        element.value = content;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        element.innerText = content;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
    clearContent(element) {
      this.setContent(element, "");
    },
    isSubmitKeyCombo(event) {
      return event.key === "Enter" && !event.shiftKey;
    },
    observeSelectors: [
      '[data-testid="chat-input"]',
      "textarea",
      '[role="textbox"]',
      '[contenteditable="true"]',
      "form",
      "main"
    ]
  };
  const SITE_NAME$1 = "Cohere";
  const INPUT_SELECTORS$1 = [
    // Data-testid selectors
    '[data-testid="chat-input"]',
    '[data-testid="composer-input"]',
    '[data-testid="message-input"]',
    // ID-based selectors
    "#chat-input",
    // Role-based selectors
    'div[contenteditable="true"][role="textbox"]',
    'textarea[role="textbox"]',
    // Aria-label based selectors
    'textarea[aria-label*="message" i]',
    'textarea[aria-label*="chat" i]',
    '[aria-label*="message" i][contenteditable="true"]',
    // Placeholder-based selectors
    'textarea[placeholder*="message" i]',
    'textarea[placeholder*="Message" i]',
    'textarea[placeholder*="Type" i]',
    'textarea[placeholder*="Ask" i]',
    // Contenteditable divs
    'div[contenteditable="true"][data-placeholder]',
    'div[contenteditable="true"][aria-label*="message" i]',
    // Class-based selectors
    '[class*="chat-input" i] textarea',
    '[class*="ChatInput" i] textarea',
    '[class*="composer" i] textarea',
    '[class*="message-input" i] textarea',
    // Container-based fallbacks
    "form textarea",
    "main textarea"
  ];
  const SUBMIT_SELECTORS$1 = [
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
    "form button:last-of-type"
  ];
  function findWithFallbacks$1(selectors, context = document) {
    for (const selector of selectors) {
      try {
        const element = context.querySelector(selector);
        if (element && element instanceof HTMLElement) {
          const rect = element.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            console.log(`[Obfusca] ${SITE_NAME$1}: Found element via selector: ${selector}`);
            return { element, selector };
          }
        }
      } catch (e) {
        console.warn(`[Obfusca] ${SITE_NAME$1}: Invalid selector skipped: ${selector}`);
      }
    }
    return { element: null, selector: null };
  }
  function findBestInput$1() {
    const { element } = findWithFallbacks$1(INPUT_SELECTORS$1);
    if (element) return element;
    const textareas = document.querySelectorAll("textarea");
    for (const textarea of textareas) {
      const rect = textarea.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 30) {
        const parent = textarea.closest('form, [class*="chat" i], [class*="input" i], main');
        if (parent) {
          console.log(`[Obfusca] ${SITE_NAME$1}: Found input via textarea fallback`);
          return textarea;
        }
      }
    }
    const editables = document.querySelectorAll('div[contenteditable="true"]');
    for (const editable of editables) {
      const rect = editable.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 20) {
        const parent = editable.closest('[class*="chat" i], [class*="input" i], form, main');
        if (parent) {
          console.log(`[Obfusca] ${SITE_NAME$1}: Found input via contenteditable fallback`);
          return editable;
        }
      }
    }
    return null;
  }
  const cohereConfig = {
    name: SITE_NAME$1,
    hostPatterns: ["coral.cohere.com", "dashboard.cohere.com"],
    getInputElement() {
      return findBestInput$1();
    },
    getSubmitButton() {
      let { element: btn, selector } = findWithFallbacks$1(SUBMIT_SELECTORS$1);
      if (btn) {
        while (btn && btn.tagName !== "BUTTON") {
          btn = btn.parentElement;
        }
        if (btn && selector) {
          console.log(`[Obfusca] ${SITE_NAME$1}: Found submit button via ${selector}`);
        }
        return btn;
      }
      const input = this.getInputElement();
      if (input) {
        const container = input.closest(
          'form, [class*="chat" i], [class*="input" i], [class*="composer" i]'
        );
        if (container) {
          const buttons = container.querySelectorAll("button:not([disabled])");
          for (const button of buttons) {
            const rect = button.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const ariaLabel = button.getAttribute("aria-label") || "";
              const className = button.className || "";
              const isSendButton = ariaLabel.toLowerCase().includes("send") || ariaLabel.toLowerCase().includes("submit") || className.toLowerCase().includes("send") || button.querySelector("svg") !== null;
              if (isSendButton) {
                console.log(`[Obfusca] ${SITE_NAME$1}: Found submit button via proximity`);
                return button;
              }
            }
          }
          for (let i = buttons.length - 1; i >= 0; i--) {
            const button = buttons[i];
            const rect = button.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              console.log(`[Obfusca] ${SITE_NAME$1}: Found submit button via proximity (last button)`);
              return button;
            }
          }
        }
      }
      return null;
    },
    getContent(element) {
      if (element instanceof HTMLTextAreaElement) {
        return element.value;
      }
      return element.innerText || element.textContent || "";
    },
    setContent(element, content) {
      if (element instanceof HTMLTextAreaElement) {
        element.value = content;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        element.innerText = content;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
    clearContent(element) {
      this.setContent(element, "");
    },
    isSubmitKeyCombo(event) {
      return event.key === "Enter" && !event.shiftKey;
    },
    observeSelectors: [
      '[data-testid="chat-input"]',
      "textarea",
      '[role="textbox"]',
      '[contenteditable="true"]',
      "form",
      "main"
    ]
  };
  const SITE_NAME = "Notion AI";
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
    '[role="dialog"] textarea[class*="ai" i]'
  ];
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
    '[role="dialog"] button[type="submit"]'
  ];
  function findWithFallbacks(selectors, context = document) {
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
  function isAIFeatureActive() {
    const aiIndicators = [
      '[data-testid="ai-modal"]',
      '[data-testid="ai-popover"]',
      '[class*="notion-ai" i]',
      '[class*="ai-modal" i]',
      '[class*="ai-popover" i]',
      '[aria-label*="AI" i][role="dialog"]'
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
      }
    }
    return false;
  }
  function findBestInput() {
    if (!isAIFeatureActive()) {
      return null;
    }
    const { element } = findWithFallbacks(INPUT_SELECTORS);
    if (element) return element;
    const dialogs = document.querySelectorAll('[role="dialog"], [class*="modal" i], [class*="popover" i]');
    for (const dialog of dialogs) {
      const rect = dialog.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const textarea = dialog.querySelector("textarea");
        if (textarea) {
          const tRect = textarea.getBoundingClientRect();
          if (tRect.width > 0 && tRect.height > 0) {
            console.log(`[Obfusca] ${SITE_NAME}: Found input via dialog textarea fallback`);
            return textarea;
          }
        }
        const editable = dialog.querySelector('[contenteditable="true"]');
        if (editable) {
          const eRect = editable.getBoundingClientRect();
          if (eRect.width > 0 && eRect.height > 0) {
            console.log(`[Obfusca] ${SITE_NAME}: Found input via dialog contenteditable fallback`);
            return editable;
          }
        }
      }
    }
    return null;
  }
  const notionConfig = {
    name: SITE_NAME,
    hostPatterns: ["notion.so", "www.notion.so"],
    getInputElement() {
      return findBestInput();
    },
    getSubmitButton() {
      var _a, _b;
      if (!isAIFeatureActive()) {
        return null;
      }
      let { element: btn, selector } = findWithFallbacks(SUBMIT_SELECTORS);
      if (btn) {
        while (btn && btn.tagName !== "BUTTON") {
          btn = btn.parentElement;
        }
        if (btn && selector) {
          console.log(`[Obfusca] ${SITE_NAME}: Found submit button via ${selector}`);
        }
        return btn;
      }
      const dialogs = document.querySelectorAll('[role="dialog"], [class*="ai-modal" i], [class*="ai-popover" i]');
      for (const dialog of dialogs) {
        const rect = dialog.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const buttons = dialog.querySelectorAll("button:not([disabled])");
          for (const button of buttons) {
            const bRect = button.getBoundingClientRect();
            if (bRect.width > 0 && bRect.height > 0) {
              const text = ((_a = button.textContent) == null ? void 0 : _a.toLowerCase()) || "";
              const ariaLabel = ((_b = button.getAttribute("aria-label")) == null ? void 0 : _b.toLowerCase()) || "";
              if (text.includes("generate") || text.includes("submit") || text.includes("ask") || ariaLabel.includes("generate") || ariaLabel.includes("submit")) {
                console.log(`[Obfusca] ${SITE_NAME}: Found submit button via dialog fallback`);
                return button;
              }
            }
          }
        }
      }
      return null;
    },
    getContent(element) {
      if (element instanceof HTMLTextAreaElement) {
        return element.value;
      }
      return element.innerText || element.textContent || "";
    },
    setContent(element, content) {
      if (element instanceof HTMLTextAreaElement) {
        element.value = content;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        element.innerText = content;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
    clearContent(element) {
      this.setContent(element, "");
    },
    isSubmitKeyCombo(event) {
      return event.key === "Enter" && !event.shiftKey;
    },
    observeSelectors: [
      '[data-testid*="ai" i]',
      '[class*="notion-ai" i]',
      '[class*="ai-modal" i]',
      '[role="dialog"]',
      "main"
    ]
  };
  const SITE_REGISTRY = [
    chatgptConfig,
    claudeConfig,
    geminiConfig,
    grokConfig,
    deepseekConfig,
    githubCopilotConfig,
    perplexityConfig,
    copilotConfig,
    mistralConfig,
    cohereConfig,
    notionConfig
  ];
  function detectCurrentSite() {
    const hostname = window.location.hostname;
    for (const config of SITE_REGISTRY) {
      for (const pattern of config.hostPatterns) {
        if (hostname === pattern || hostname.endsWith("." + pattern)) {
          console.log(`Obfusca: Detected site "${config.name}" for hostname "${hostname}"`);
          return config;
        }
      }
    }
    console.log(`Obfusca: No supported site found for hostname "${hostname}"`);
    return null;
  }
  let inMemoryCustomPatterns = [];
  function loadCustomPatternsIntoMemory() {
    chrome.storage.local.get(["customPatterns"], (result) => {
      const patterns = result.customPatterns;
      if (Array.isArray(patterns)) {
        inMemoryCustomPatterns = patterns;
        console.log(`[Obfusca Detection] Loaded ${patterns.length} custom patterns into memory`);
      } else {
        inMemoryCustomPatterns = [];
        console.log("[Obfusca Detection] No custom patterns found in storage");
      }
    });
  }
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.customPatterns) {
      const newPatterns = changes.customPatterns.newValue;
      if (Array.isArray(newPatterns)) {
        inMemoryCustomPatterns = newPatterns;
        console.log(`[Obfusca Detection] Custom patterns updated in memory: ${newPatterns.length} patterns`);
      } else {
        inMemoryCustomPatterns = [];
        console.log("[Obfusca Detection] Custom patterns cleared from memory");
      }
    }
  });
  loadCustomPatternsIntoMemory();
  function luhnChecksum(cardNumber) {
    const digits = cardNumber.replace(/\D/g, "").split("").map(Number);
    if (digits.length < 13) {
      return false;
    }
    let sum = 0;
    let isEven = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = digits[i];
      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      sum += digit;
      isEven = !isEven;
    }
    return sum % 10 === 0;
  }
  function isValidSSN(ssn) {
    const digits = ssn.replace(/\D/g, "");
    if (digits.length !== 9) {
      return false;
    }
    const area = parseInt(digits.substring(0, 3), 10);
    const group = parseInt(digits.substring(3, 5), 10);
    const serial = parseInt(digits.substring(5), 10);
    if (area === 0 || area === 666 || area >= 900 && area <= 999) {
      return false;
    }
    if (group === 0) {
      return false;
    }
    if (serial === 0) {
      return false;
    }
    return true;
  }
  function isValidAWSKey(key) {
    const trimmed = key.trim();
    if (trimmed.length !== 20) {
      return false;
    }
    const prefixes = ["AKIA", "ABIA", "ACCA", "ASIA"];
    if (!prefixes.some((p) => trimmed.startsWith(p))) {
      return false;
    }
    return /^[A-Z0-9]{16}$/.test(trimmed.substring(4));
  }
  const PATTERNS = [
    // SSN: XXX-XX-XXXX format (with various separators)
    {
      name: "US Social Security Number",
      type: "ssn",
      severity: "critical",
      regex: /\b(\d{3}[-.\s]?\d{2}[-.\s]?\d{4})\b/g,
      confidence: 0.95,
      validator: isValidSSN
    },
    // Credit Card Numbers - Visa, Mastercard, Amex, Discover
    {
      name: "Credit Card Number",
      type: "credit_card",
      severity: "critical",
      regex: new RegExp(
        "\\b(4[0-9]{3}[-\\s]?[0-9]{4}[-\\s]?[0-9]{4}[-\\s]?[0-9]{4}|5[1-5][0-9]{2}[-\\s]?[0-9]{4}[-\\s]?[0-9]{4}[-\\s]?[0-9]{4}|3[47][0-9]{2}[-\\s]?[0-9]{6}[-\\s]?[0-9]{5}|6(?:011|5[0-9]{2})[-\\s]?[0-9]{4}[-\\s]?[0-9]{4}[-\\s]?[0-9]{4})\\b",
        "g"
      ),
      confidence: 0.9,
      validator: luhnChecksum
    },
    // AWS Access Key ID
    {
      name: "AWS Access Key",
      type: "aws_key",
      severity: "critical",
      regex: /\b((?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16})\b/g,
      confidence: 0.98,
      validator: isValidAWSKey
    },
    // Generic API Keys - sk-... (OpenAI, Stripe, etc.)
    {
      name: "API Key (sk- prefix)",
      type: "api_key",
      severity: "high",
      regex: /\b(sk-[A-Za-z0-9]{20,})\b/g,
      confidence: 0.95
    },
    // Generic api_key= or apikey= patterns
    {
      name: "API Key (generic)",
      type: "api_key",
      severity: "high",
      regex: /(?:api[_-]?key|apikey|api[_-]?secret|apisecret)[\s]*[=:"'][\s]*([A-Za-z0-9_\-]{20,64})/gi,
      confidence: 0.8
    },
    // Private Keys (PEM format)
    {
      name: "Private Key",
      type: "private_key",
      severity: "critical",
      regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
      confidence: 0.99
    },
    // GitHub Personal Access Token
    {
      name: "GitHub Token",
      type: "api_key",
      severity: "high",
      regex: /\b(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59})\b/g,
      confidence: 0.99
    }
  ];
  function detectBuiltInPatterns(text) {
    const detections = [];
    for (const pattern of PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        const matchedText = match[0];
        console.log(`[Obfusca Detection] Pattern "${pattern.name}" matched at position ${match.index}`);
        if (pattern.validator && !pattern.validator(matchedText)) {
          console.log(`[Obfusca Detection] Pattern "${pattern.name}" failed validation, skipping`);
          continue;
        }
        const confidence = pattern.validator ? Math.min(1, pattern.confidence + 0.02) : pattern.confidence;
        const detection = {
          type: pattern.type,
          displayName: pattern.name,
          severity: pattern.severity,
          start: match.index,
          end: match.index + matchedText.length,
          confidence
        };
        console.log(`[Obfusca Detection] Detection added:`, {
          type: detection.type,
          displayName: detection.displayName,
          severity: detection.severity,
          position: `${detection.start}-${detection.end}`,
          confidence: detection.confidence
        });
        detections.push(detection);
      }
    }
    return detections;
  }
  function detectCustomPatterns(text, customPatterns) {
    const detections = [];
    const textLower = text.toLowerCase();
    for (const cp of customPatterns) {
      if (!cp.enabled) {
        continue;
      }
      try {
        if (cp.pattern_type === "keyword_list") {
          const keywords = JSON.parse(cp.pattern_value);
          for (const keyword of keywords) {
            const keywordLower = keyword.toLowerCase();
            let searchIndex = 0;
            while (true) {
              const foundIndex = textLower.indexOf(keywordLower, searchIndex);
              if (foundIndex === -1) break;
              const detection = {
                type: "custom",
                displayName: cp.name,
                severity: cp.severity,
                start: foundIndex,
                end: foundIndex + keyword.length,
                confidence: 0.9
                // Keyword matches have high confidence
              };
              console.log(`[Obfusca Detection] Custom keyword pattern "${cp.name}" matched at position ${foundIndex}`);
              detections.push(detection);
              searchIndex = foundIndex + 1;
            }
          }
        } else if (cp.pattern_type === "regex") {
          const regex = new RegExp(cp.pattern_value, "gi");
          let match;
          while ((match = regex.exec(text)) !== null) {
            const detection = {
              type: "custom",
              displayName: cp.name,
              severity: cp.severity,
              start: match.index,
              end: match.index + match[0].length,
              confidence: 0.85
              // Regex matches slightly lower confidence
            };
            console.log(`[Obfusca Detection] Custom regex pattern "${cp.name}" matched at position ${match.index}`);
            detections.push(detection);
            if (match[0].length === 0) {
              regex.lastIndex++;
            }
          }
        }
      } catch (e) {
        console.warn(`[Obfusca Detection] Invalid custom pattern "${cp.name}":`, e);
      }
    }
    return detections;
  }
  async function detectSensitiveData(text) {
    console.log("[Obfusca Detection] detectSensitiveData: Scanning", text.length, "characters");
    const builtInDetections = detectBuiltInPatterns(text);
    console.log(`[Obfusca Detection] Built-in patterns found ${builtInDetections.length} detections`);
    let customDetections = [];
    try {
      const customPatterns = await getCachedCustomPatterns();
      if (customPatterns.length > 0) {
        console.log(`[Obfusca Detection] Checking ${customPatterns.length} custom patterns`);
        customDetections = detectCustomPatterns(text, customPatterns);
        console.log(`[Obfusca Detection] Custom patterns found ${customDetections.length} detections`);
      }
    } catch (err) {
      console.error("[Obfusca Detection] Error detecting custom patterns:", err);
    }
    const allDetections = [...builtInDetections, ...customDetections];
    allDetections.sort((a, b) => a.start - b.start);
    console.log(`[Obfusca Detection] detectSensitiveData: Found ${allDetections.length} total detections`);
    return allDetections;
  }
  function mightContainSensitiveDataSync(text) {
    if (text.length < 3) {
      return false;
    }
    if (text.length >= 8) {
      if (/\d{3}[-.\s]?\d{2}[-.\s]?\d{4}/.test(text)) {
        return true;
      }
      if (/[3456]\d{3}[-\s]?\d{4}/.test(text)) {
        return true;
      }
      if (/AKIA|ABIA|ACCA|ASIA/.test(text)) {
        return true;
      }
      if (/sk-[A-Za-z0-9]{10,}/.test(text)) {
        return true;
      }
      if (text.includes("BEGIN") && text.includes("PRIVATE KEY")) {
        return true;
      }
      if (/api[_-]?key|apikey/i.test(text)) {
        return true;
      }
    }
    if (inMemoryCustomPatterns.length > 0) {
      for (const cp of inMemoryCustomPatterns) {
        if (!cp.enabled) continue;
        if (matchesCustomPatternSync(text, cp)) {
          console.log(`[Obfusca Detection] SYNC: Custom pattern "${cp.name}" matched`);
          return true;
        }
      }
    }
    return false;
  }
  function matchesCustomPatternSync(text, pattern) {
    try {
      if (pattern.pattern_type === "keyword_list") {
        const keywords = JSON.parse(pattern.pattern_value);
        const textLower = text.toLowerCase();
        return keywords.some((kw) => textLower.includes(kw.toLowerCase()));
      } else if (pattern.pattern_type === "regex") {
        const regex = new RegExp(pattern.pattern_value, "i");
        return regex.test(text);
      }
    } catch (e) {
    }
    return false;
  }
  async function getCachedCustomPatterns() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["customPatterns"], (result) => {
        const patterns = result.customPatterns;
        if (Array.isArray(patterns)) {
          resolve(patterns);
        } else {
          resolve([]);
        }
      });
    });
  }
  const API_URL = "https://api.obfusca.ai";
  const SUPABASE_URL = "https://znovciqcvpnywctfzola.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpub3ZjaXFjdnBueXdjdGZ6b2xhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxODQzMDMsImV4cCI6MjA4NTc2MDMwM30.TKxHo5jBCZaWetdRgsqOZ9lpZfdJKMBcv0CCaT9xAws";
  const STORAGE_KEYS = {
    ACCESS_TOKEN: "obfusca_access_token",
    REFRESH_TOKEN: "obfusca_refresh_token",
    USER: "obfusca_user",
    EXPIRES_AT: "obfusca_expires_at"
  };
  async function getSession() {
    console.log("[Obfusca Auth] getSession: Retrieving session from chrome.storage.local");
    return new Promise((resolve) => {
      chrome.storage.local.get(
        [
          STORAGE_KEYS.ACCESS_TOKEN,
          STORAGE_KEYS.REFRESH_TOKEN,
          STORAGE_KEYS.USER,
          STORAGE_KEYS.EXPIRES_AT
        ],
        (result) => {
          var _a;
          console.log("[Obfusca Auth] getSession: Storage keys retrieved", {
            hasAccessToken: !!result[STORAGE_KEYS.ACCESS_TOKEN],
            hasRefreshToken: !!result[STORAGE_KEYS.REFRESH_TOKEN],
            hasUser: !!result[STORAGE_KEYS.USER],
            expiresAt: result[STORAGE_KEYS.EXPIRES_AT]
          });
          if (!result[STORAGE_KEYS.ACCESS_TOKEN]) {
            console.log("[Obfusca Auth] getSession: No access token found, returning null");
            resolve(null);
            return;
          }
          const session = {
            accessToken: result[STORAGE_KEYS.ACCESS_TOKEN],
            refreshToken: result[STORAGE_KEYS.REFRESH_TOKEN],
            expiresAt: result[STORAGE_KEYS.EXPIRES_AT],
            user: result[STORAGE_KEYS.USER]
          };
          console.log("[Obfusca Auth] getSession: Session found for user", (_a = session.user) == null ? void 0 : _a.email);
          resolve(session);
        }
      );
    });
  }
  async function saveSession(session) {
    var _a, _b, _c, _d;
    console.log("[Obfusca Auth] saveSession: Saving session to chrome.storage.local", {
      user: (_a = session.user) == null ? void 0 : _a.email,
      tenantId: (_b = session.user) == null ? void 0 : _b.tenantId,
      tenantName: (_c = session.user) == null ? void 0 : _c.tenantName,
      expiresAt: session.expiresAt,
      tokenLength: (_d = session.accessToken) == null ? void 0 : _d.length
    });
    return new Promise((resolve) => {
      chrome.storage.local.set(
        {
          [STORAGE_KEYS.ACCESS_TOKEN]: session.accessToken,
          [STORAGE_KEYS.REFRESH_TOKEN]: session.refreshToken,
          [STORAGE_KEYS.USER]: session.user,
          [STORAGE_KEYS.EXPIRES_AT]: session.expiresAt
        },
        () => {
          console.log("[Obfusca Auth] saveSession: Session saved successfully");
          resolve();
        }
      );
    });
  }
  async function clearSession() {
    return new Promise((resolve) => {
      chrome.storage.local.remove(
        [
          STORAGE_KEYS.ACCESS_TOKEN,
          STORAGE_KEYS.REFRESH_TOKEN,
          STORAGE_KEYS.USER,
          STORAGE_KEYS.EXPIRES_AT
        ],
        resolve
      );
    });
  }
  async function getAccessToken() {
    console.log("[Obfusca Auth] getAccessToken: Attempting to get access token");
    const session = await getSession();
    if (!session) {
      console.log("[Obfusca Auth] getAccessToken: No session found, returning null");
      return null;
    }
    const now = Math.floor(Date.now() / 1e3);
    const timeUntilExpiry = session.expiresAt - now;
    console.log("[Obfusca Auth] getAccessToken: Token expires in", timeUntilExpiry, "seconds");
    if (session.expiresAt - 60 <= now) {
      console.log("[Obfusca Auth] getAccessToken: Token expired or expiring soon, attempting refresh");
      const refreshed = await refreshSession();
      if (!refreshed) {
        console.log("[Obfusca Auth] getAccessToken: Refresh failed, clearing session");
        await clearSession();
        return null;
      }
      console.log("[Obfusca Auth] getAccessToken: Token refreshed successfully");
      return refreshed.accessToken;
    }
    console.log("[Obfusca Auth] getAccessToken: Returning valid token (length:", session.accessToken.length, ")");
    return session.accessToken;
  }
  async function fetchUserTenantInfo(userId, accessToken) {
    var _a, _b, _c;
    console.log("[Obfusca Auth] fetchUserTenantInfo: Fetching tenant info for user", userId);
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/users?select=tenant_id,role,tenants(name,slug)&id=eq.${userId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`
          }
        }
      );
      if (!response.ok) {
        console.error("[Obfusca Auth] fetchUserTenantInfo: Failed to fetch user record", response.status);
        return null;
      }
      const data = await response.json();
      console.log("[Obfusca Auth] fetchUserTenantInfo: Response data", data);
      if (data.length === 0) {
        console.warn("[Obfusca Auth] fetchUserTenantInfo: User not found in users table");
        return null;
      }
      const userRecord = data[0];
      console.log("[Obfusca Auth] fetchUserTenantInfo: Found user record", {
        tenantId: userRecord.tenant_id,
        role: userRecord.role,
        tenantName: (_a = userRecord.tenants) == null ? void 0 : _a.name
      });
      return {
        tenantId: userRecord.tenant_id,
        tenantName: ((_b = userRecord.tenants) == null ? void 0 : _b.name) || "Unknown",
        tenantSlug: ((_c = userRecord.tenants) == null ? void 0 : _c.slug) || "",
        role: userRecord.role || "member"
      };
    } catch (error) {
      console.error("[Obfusca Auth] fetchUserTenantInfo: Error fetching tenant info", error);
      return null;
    }
  }
  async function refreshSession() {
    const session = await getSession();
    if (!(session == null ? void 0 : session.refreshToken)) {
      return null;
    }
    try {
      const response = await fetch(
        `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ refresh_token: session.refreshToken })
        }
      );
      if (!response.ok) {
        console.warn("Obfusca: Token refresh failed");
        return null;
      }
      const data = await response.json();
      console.log("[Obfusca Auth] refreshSession: Token refreshed for user", data.user.id);
      const tenantInfo = await fetchUserTenantInfo(data.user.id, data.access_token);
      const user = {
        id: data.user.id,
        email: data.user.email,
        tenantId: (tenantInfo == null ? void 0 : tenantInfo.tenantId) || session.user.tenantId,
        tenantName: (tenantInfo == null ? void 0 : tenantInfo.tenantName) || session.user.tenantName,
        tenantSlug: (tenantInfo == null ? void 0 : tenantInfo.tenantSlug) || session.user.tenantSlug,
        role: (tenantInfo == null ? void 0 : tenantInfo.role) || session.user.role || "member"
      };
      const newSession = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at,
        user
      };
      await saveSession(newSession);
      return newSession;
    } catch (error) {
      console.error("Obfusca: Token refresh error", error);
      return null;
    }
  }
  const BACKEND_URL$1 = API_URL;
  const ANALYZE_ENDPOINT = `${BACKEND_URL$1}/analyze`;
  const GENERATE_DUMMIES_BATCH_ENDPOINT = `${BACKEND_URL$1}/generate-dummies-batch`;
  const PROTECT_FILE_ENDPOINT = `${BACKEND_URL$1}/files/protect`;
  const TIMEOUT_MS$1 = 1e4;
  function getSourceFromUrl(url) {
    if (url.includes("chat.openai.com") || url.includes("chatgpt.com")) {
      return "chatgpt";
    }
    if (url.includes("claude.ai")) {
      return "claude";
    }
    if (url.includes("gemini.google.com") || url.includes("bard.google.com")) {
      return "gemini";
    }
    if (url.includes("grok.com") || url.includes("x.com") || url.includes("twitter.com")) {
      return "grok";
    }
    if (url.includes("github.com")) {
      return "github-copilot";
    }
    if (url.includes("perplexity.ai")) {
      return "perplexity";
    }
    if (url.includes("deepseek.com")) {
      return "deepseek";
    }
    return "unknown";
  }
  function convertDetection(backend) {
    const displayNames = {
      ssn: "US Social Security Number",
      credit_card: "Credit Card Number",
      aws_key: "AWS Access Key",
      aws_secret: "AWS Secret Key",
      api_key: "API Key",
      private_key: "Private Key",
      email: "Email Address",
      phone: "Phone Number",
      jwt: "JWT Token",
      connection_string: "Connection String"
    };
    return {
      type: backend.type,
      displayName: backend.display_name || displayNames[backend.type] || backend.type,
      severity: backend.severity,
      start: backend.start,
      end: backend.end,
      confidence: backend.confidence
    };
  }
  let lastBackendStatus = {
    connected: false,
    authenticated: false,
    lastChecked: 0
  };
  async function analyzeWithBackend(text, sourceUrl) {
    var _a;
    console.log("[Obfusca API] analyzeWithBackend: Starting backend analysis");
    console.log("[Obfusca API] analyzeWithBackend: Content length:", text.length, "chars");
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS$1);
      const body = { content: text };
      if (sourceUrl) {
        const detectedSource = getSourceFromUrl(sourceUrl);
        body.context = {
          source: detectedSource,
          url: sourceUrl
        };
        console.log("[Obfusca API] analyzeWithBackend: Source URL:", sourceUrl);
        console.log("[Obfusca API] analyzeWithBackend: Detected source:", detectedSource);
      } else {
        console.log("[Obfusca API] analyzeWithBackend: No source URL provided");
      }
      const headers = {
        "Content-Type": "application/json"
      };
      console.log("[Obfusca API] analyzeWithBackend: Getting access token...");
      const accessToken = await getAccessToken();
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
        console.log("[Obfusca API] analyzeWithBackend: Authorization header set (token length:", accessToken.length, ")");
      } else {
        console.log("[Obfusca API] analyzeWithBackend: No access token available, proceeding without auth");
      }
      console.log("[Obfusca API] analyzeWithBackend: Sending request to", ANALYZE_ENDPOINT);
      const response = await fetch(ANALYZE_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      console.log("[Obfusca API] analyzeWithBackend: Response status:", response.status);
      if (response.status === 401) {
        console.warn("[Obfusca API] analyzeWithBackend: 401 Unauthorized - Authentication required or token expired");
        console.log("[Obfusca API] analyzeWithBackend: Falling back to local-only detection");
        lastBackendStatus = {
          ...lastBackendStatus,
          connected: true,
          authenticated: false,
          lastChecked: Date.now(),
          error: "Authentication failed (401)"
        };
        return null;
      }
      if (!response.ok) {
        console.warn(`[Obfusca API] analyzeWithBackend: Backend error ${response.status}`);
        lastBackendStatus = {
          ...lastBackendStatus,
          connected: true,
          authenticated: !!accessToken,
          lastChecked: Date.now(),
          error: `Backend error: ${response.status}`
        };
        return null;
      }
      const result = await response.json();
      console.log("[Obfusca API] analyzeWithBackend: Backend response received", {
        action: result.action,
        detectionCount: ((_a = result.detections) == null ? void 0 : _a.length) || 0
      });
      lastBackendStatus = {
        connected: true,
        authenticated: !!accessToken,
        lastChecked: Date.now()
      };
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.warn("[Obfusca API] analyzeWithBackend: Request timed out after", TIMEOUT_MS$1, "ms");
        lastBackendStatus = {
          ...lastBackendStatus,
          connected: false,
          lastChecked: Date.now(),
          error: "Request timed out"
        };
      } else {
        console.warn("[Obfusca API] analyzeWithBackend: Backend unreachable", error);
        lastBackendStatus = {
          ...lastBackendStatus,
          connected: false,
          lastChecked: Date.now(),
          error: error instanceof Error ? error.message : "Network error"
        };
      }
      console.log("[Obfusca API] analyzeWithBackend: Falling back to local-only detection");
      return null;
    }
  }
  async function analyze(text, localDetections, sourceUrl) {
    console.log("[Obfusca API] analyze: Starting analysis pipeline");
    console.log("[Obfusca API] analyze: Local detections count:", localDetections.length);
    const session = await getSession();
    if (!session) {
      console.log("[Obfusca API] analyze: No session — skipping analysis, allowing all");
      return {
        shouldBlock: false,
        action: "allow",
        detections: [],
        source: "local"
      };
    }
    const backendResponse = await analyzeWithBackend(text, sourceUrl);
    if (backendResponse === null) {
      console.log("[Obfusca API] analyze: Backend unavailable, using LOCAL DETECTION ONLY");
      const shouldBlock = localDetections.some(
        (d) => d.severity === "critical" || d.severity === "high"
      );
      const action = shouldBlock ? "block" : localDetections.length > 0 ? "redact" : "allow";
      const result2 = {
        shouldBlock,
        action,
        detections: localDetections,
        source: "local"
      };
      console.log("[Obfusca API] analyze: Local-only result:", {
        shouldBlock: result2.shouldBlock,
        action: result2.action,
        detectionCount: result2.detections.length
      });
      return result2;
    }
    console.log("[Obfusca API] analyze: Backend available, merging results");
    const backendDetections = backendResponse.detections.map(convertDetection);
    const mergedDetections = [...backendDetections];
    for (const local of localDetections) {
      const isDuplicate = backendDetections.some(
        (bd) => bd.type === local.type && Math.abs(bd.start - local.start) < 5 && Math.abs(bd.end - local.end) < 5
      );
      if (!isDuplicate) {
        mergedDetections.push(local);
      }
    }
    const result = {
      shouldBlock: backendResponse.action === "block",
      action: backendResponse.action,
      detections: mergedDetections,
      source: backendDetections.length > 0 ? "backend" : "combined",
      obfuscation: backendResponse.obfuscation,
      message: backendResponse.message,
      // Monitor mode fields
      simulated: backendResponse.simulated,
      wouldHaveBlocked: backendResponse.would_have_blocked,
      originalAction: backendResponse.original_action
    };
    console.log("[Obfusca API] analyze: Final result:", {
      shouldBlock: result.shouldBlock,
      action: result.action,
      detectionCount: result.detections.length,
      source: result.source,
      hasObfuscation: !!result.obfuscation,
      simulated: result.simulated,
      wouldHaveBlocked: result.wouldHaveBlocked
    });
    return result;
  }
  let _dummySessionId = null;
  function getDummySessionId() {
    if (!_dummySessionId) {
      _dummySessionId = `ext-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    return _dummySessionId;
  }
  async function generateDummiesBatch(originalText, detections) {
    console.log("[Obfusca Batch] generateDummiesBatch: Requesting AI dummies for", detections.length, "items");
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15e3);
      const headers = {
        "Content-Type": "application/json"
      };
      const accessToken = await getAccessToken();
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      } else {
        console.warn("[Obfusca Batch] No access token — batch dummy generation requires auth");
        return null;
      }
      const body = {
        original_text: originalText,
        detections,
        session_id: getDummySessionId()
      };
      console.log("[Obfusca Batch] POST", GENERATE_DUMMIES_BATCH_ENDPOINT);
      const response = await fetch(GENERATE_DUMMIES_BATCH_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        let errorDetail = "";
        try {
          const errorBody = await response.text();
          errorDetail = errorBody.slice(0, 500);
        } catch {
        }
        console.error("[Obfusca Batch] Server error", response.status, errorDetail);
        return null;
      }
      const result = await response.json();
      console.log("[Obfusca Batch] Got", result.dummies.length, "dummies, source:", result.source, "success:", result.success);
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error("[Obfusca Batch] Request timed out");
      } else {
        console.error("[Obfusca Batch] Request failed:", error);
      }
      return null;
    }
  }
  async function logBypassEvent(payload) {
    console.log("[Obfusca Bypass] Logging bypass event:", {
      source: payload.source,
      total_detections: payload.detections_summary.total_count,
      content_type: payload.content_type
    });
    try {
      const headers = {
        "Content-Type": "application/json"
      };
      const accessToken = await getAccessToken();
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      } else {
        console.warn("[Obfusca Bypass] No access token -- bypass event will not be logged");
        return;
      }
      const response = await fetch(`${BACKEND_URL$1}/events/bypass`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        let errorDetail = "";
        try {
          const errorBody = await response.text();
          errorDetail = errorBody.slice(0, 500);
        } catch {
        }
        console.error("[Obfusca Bypass] Failed to log bypass event:", response.status, errorDetail);
      } else {
        const result = await response.json();
        console.log("[Obfusca Bypass] Bypass event logged, event_id:", result.event_id);
      }
    } catch (error) {
      console.error("[Obfusca Bypass] Error logging bypass event:", error);
    }
  }
  async function logWarnEvent(payload) {
    console.log("[Obfusca Warn] Logging warn event:", {
      source: payload.source,
      total_detections: payload.detections_summary.total_count
    });
    try {
      const headers = {
        "Content-Type": "application/json"
      };
      const accessToken = await getAccessToken();
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      } else {
        console.warn("[Obfusca Warn] No access token -- warn event will not be logged");
        return;
      }
      const response = await fetch(`${BACKEND_URL$1}/events/warn`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        let errorDetail = "";
        try {
          const errorBody = await response.text();
          errorDetail = errorBody.slice(0, 500);
        } catch {
        }
        console.error("[Obfusca Warn] Failed to log warn event:", response.status, errorDetail);
      } else {
        const result = await response.json();
        console.log("[Obfusca Warn] Warn event logged, event_id:", result.event_id);
      }
    } catch (error) {
      console.error("[Obfusca Warn] Error logging warn event:", error);
    }
  }
  async function sha256Hash(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return "sha256:" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function protectFile(filename, contentBase64, choices) {
    const validChoices = choices.filter(
      (c) => c.original_value && c.original_value.trim() !== "" && c.replacement && c.replacement.trim() !== ""
    );
    if (validChoices.length < choices.length) {
      console.warn(`[Obfusca Files] Filtered ${choices.length - validChoices.length} invalid choices (empty original_value or replacement)`);
    }
    if (validChoices.length === 0) {
      console.warn("[Obfusca Files] No valid choices after filtering — skipping protection");
      return null;
    }
    choices = validChoices;
    console.log("[Obfusca Files] protectFile: Requesting protection for", filename, "with", choices.length, "choices");
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15e3);
      const headers = {
        "Content-Type": "application/json"
      };
      const accessToken = await getAccessToken();
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      } else {
        console.warn("[Obfusca Files] No access token — file protection requires auth");
        return null;
      }
      const body = {
        filename,
        content_base64: contentBase64,
        choices
      };
      console.log("[Obfusca Files] POST", PROTECT_FILE_ENDPOINT);
      const response = await fetch(PROTECT_FILE_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        let errorDetail = "";
        try {
          const errorBody = await response.text();
          errorDetail = errorBody.slice(0, 500);
        } catch {
        }
        console.error("[Obfusca Files] Server error", response.status, errorDetail);
        return null;
      }
      const result = await response.json();
      console.log("[Obfusca Files] Got protected file:", result.filename, "replacements:", result.replacements_applied);
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error("[Obfusca Files] Protection request timed out");
      } else {
        console.error("[Obfusca Files] Protection request failed:", error);
      }
      return null;
    }
  }
  const OBFUSCA_STYLES = {
    colors: {
      background: "#09090B",
      // zinc-950
      foreground: "#FAFAFA",
      // zinc-50
      card: "#18181B",
      // zinc-900
      secondary: "#27272A",
      // zinc-800 (used for muted surfaces)
      muted: "#27272A",
      // zinc-800
      mutedForeground: "#A1A1AA",
      // zinc-400
      border: "#27272A",
      // zinc-50
      obscured: "#3F3F46",
      // zinc-700
      obscuredText: "#71717A",
      // zinc-500
      // Semantic colors
      destructive: "#EF4444",
      // red-500
      success: "#22C55E",
      // green-500
      warning: "#F59E0B",
      // amber-500
      info: "#3B82F6",
      // Smart replacement / magic wand accent colors
      magicPrimary: "#8B5CF6",
      // Highlight colors for preview
      dummyHighlight: "rgba(139, 92, 246, 0.25)",
      redactedHighlight: "rgba(113, 113, 122, 0.25)"
    },
    radius: {
      sm: "6px",
      md: "8px",
      lg: "10px",
      xl: "14px"
    },
    fonts: {
      sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace"
    },
    shadows: {
      lg: "0 10px 40px rgba(0, 0, 0, 0.5)",
      xl: "0 20px 60px rgba(0, 0, 0, 0.6)"
    },
    transitions: {
      fast: "0.1s ease",
      base: "0.15s ease",
      smooth: "0.2s ease"
    }
  };
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  const ANIMATION_STYLE_ID = "obfusca-design-system-animations";
  function injectAnimationStyles() {
    if (document.getElementById(ANIMATION_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = ANIMATION_STYLE_ID;
    style.textContent = `
    @keyframes obfusca-popup-enter {
      from {
        opacity: 0;
        clip-path: inset(100% 0 0 0);
      }
      to {
        opacity: 1;
        clip-path: inset(0% 0 0 0);
      }
    }

    @keyframes obfusca-popup-exit {
      from {
        opacity: 1;
        clip-path: inset(0% 0 0 0);
      }
      to {
        opacity: 0;
        clip-path: inset(100% 0 0 0);
      }
    }

    @keyframes obfusca-slide-up {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes obfusca-slide-down {
      from {
        opacity: 1;
        transform: translateY(0);
      }
      to {
        opacity: 0;
        transform: translateY(12px);
      }
    }

    @keyframes obfusca-highlight-pulse {
      0% { background-color: rgba(139, 92, 246, 0.3); }
      50% { background-color: rgba(139, 92, 246, 0.15); }
      100% { background-color: rgba(139, 92, 246, 0.3); }
    }

    @keyframes obfusca-toast-enter {
      from {
        opacity: 0;
        transform: translateX(100%) translateY(0);
      }
      to {
        opacity: 1;
        transform: translateX(0) translateY(0);
      }
    }

    @keyframes obfusca-toast-exit {
      from {
        opacity: 1;
        transform: translateX(0) translateY(0);
      }
      to {
        opacity: 0;
        transform: translateX(100%) translateY(0);
      }
    }

    @keyframes obfusca-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    @keyframes obfusca-success-flash {
      0% { background-color: rgba(34, 197, 94, 0.2); }
      100% { background-color: transparent; }
    }

    @keyframes obfusca-error-flash {
      0% { background-color: rgba(239, 68, 68, 0.25); }
      50% { background-color: rgba(239, 68, 68, 0.15); }
      100% { background-color: transparent; }
    }

    @keyframes obfusca-fade-in {
      from { opacity: 0; transform: translateY(2px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes obfusca-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @keyframes obfusca-progress-bar {
      0% { width: 0%; }
      100% { width: 100%; }
    }

    @keyframes obfusca-wand-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @keyframes obfusca-wand-pulse {
      0%, 100% { opacity: 0.8; }
      50% { opacity: 1; }
    }

    @keyframes obfusca-sparkle-burst {
      0% { transform: scale(0); opacity: 1; }
      50% { transform: scale(1.2); opacity: 0.8; }
      100% { transform: scale(1.5); opacity: 0; }
    }

    @keyframes obfusca-typewriter-cursor {
      0%, 100% { border-right-color: transparent; }
      50% { border-right-color: ${OBFUSCA_STYLES.colors.magicPrimary}; }
    }
  `;
    document.head.appendChild(style);
  }
  const ICON_X = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <line x1="18" y1="6" x2="6" y2="18"/>
  <line x1="6" y1="6" x2="18" y2="18"/>
</svg>`;
  const ICON_CHECK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="m5 12 5 5L20 7"/>
</svg>`;
  const ICON_FILE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  <polyline points="14 2 14 8 20 8"/>
</svg>`;
  const ICON_DOWNLOAD = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
  <polyline points="7 10 12 15 17 10"/>
  <line x1="12" y1="15" x2="12" y2="3"/>
</svg>`;
  const ICON_SPINNER = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: obfusca-spin 1s linear infinite;">
  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
</svg>`;
  const ICON_ENTER = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="9 10 4 15 9 20"/>
  <path d="M20 4v7a4 4 0 0 1-4 4H4"/>
</svg>`;
  const OVERLAY_ID$1 = "obfusca-block-overlay";
  function removeBlockOverlay() {
    var _a;
    (_a = document.getElementById(OVERLAY_ID$1)) == null ? void 0 : _a.remove();
  }
  function isBlockOverlayVisible() {
    return document.getElementById(OVERLAY_ID$1) !== null;
  }
  const OVERLAY_ID = "obfusca-redact-overlay";
  function removeRedactOverlay() {
    var _a;
    (_a = document.getElementById(OVERLAY_ID)) == null ? void 0 : _a.remove();
  }
  function isRedactOverlayVisible() {
    return document.getElementById(OVERLAY_ID) !== null;
  }
  function generateProtectedText(obfuscatedText, mappings, choices, tokenMap) {
    let result = obfuscatedText;
    for (let i = 0; i < mappings.length; i++) {
      const mapping = mappings[i];
      const choice = choices[i];
      if (!choice || !choice.enabled) continue;
      const newText = choice.replacementText;
      if (tokenMap) {
        const token = tokenMap.get(i);
        if (token && token !== newText && result.includes(token)) {
          result = result.replace(token, newText);
          continue;
        }
      }
      if (newText && newText !== mapping.placeholder && result.includes(mapping.placeholder)) {
        result = result.replace(mapping.placeholder, newText);
        continue;
      }
      if (mapping.replacement && newText !== mapping.replacement && result.includes(mapping.replacement)) {
        result = result.replace(mapping.replacement, newText);
      }
    }
    return result;
  }
  const DEVICON_ICONS = {
    javascript: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#F0DB4F"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#323330">JS</text></svg>`,
    typescript: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#3178C6"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">TS</text></svg>`,
    python: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#3776AB"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#FFD43B">Py</text></svg>`,
    java: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#E76F00"/><text x="8" y="12.5" text-anchor="middle" font-family="serif" font-size="10" font-weight="bold" fill="#fff">J</text></svg>`,
    go: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#00ADD8"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">Go</text></svg>`,
    rust: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#DEA584"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#000">Rs</text></svg>`,
    ruby: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#CC342D"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">Rb</text></svg>`,
    php: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#777BB4"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="8" font-weight="bold" fill="#fff">PHP</text></svg>`,
    swift: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#F05138"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">Sw</text></svg>`,
    kotlin: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#7F52FF"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">Kt</text></svg>`,
    c: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#A8B9CC"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="11" font-weight="bold" fill="#fff">C</text></svg>`,
    cplusplus: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#00599C"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="8" font-weight="bold" fill="#fff">C++</text></svg>`,
    csharp: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#68217A"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">C#</text></svg>`,
    html5: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#E44D26"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="7" font-weight="bold" fill="#fff">HTML</text></svg>`,
    css3: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#264DE4"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="7.5" font-weight="bold" fill="#fff">CSS</text></svg>`,
    sass: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#CD6799"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">S</text></svg>`,
    react: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#20232A"/><circle cx="8" cy="8" r="1.5" fill="#61DAFB"/><ellipse cx="8" cy="8" rx="6" ry="2.5" fill="none" stroke="#61DAFB" stroke-width="0.7"/><ellipse cx="8" cy="8" rx="6" ry="2.5" fill="none" stroke="#61DAFB" stroke-width="0.7" transform="rotate(60 8 8)"/><ellipse cx="8" cy="8" rx="6" ry="2.5" fill="none" stroke="#61DAFB" stroke-width="0.7" transform="rotate(120 8 8)"/></svg>`,
    vuejs: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#35495E"/><polygon points="8,13 2,4 5,4 8,9 11,4 14,4" fill="#41B883"/><polygon points="8,10 4.5,4 6.5,4 8,7 9.5,4 11.5,4" fill="#35495E"/></svg>`,
    angularjs: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#DD0031"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">Ng</text></svg>`,
    svelte: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#FF3E00"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#fff">S</text></svg>`,
    docker: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#2496ED"/><g fill="#fff"><rect x="2.5" y="7" width="2.5" height="2" rx="0.3"/><rect x="5.5" y="7" width="2.5" height="2" rx="0.3"/><rect x="8.5" y="7" width="2.5" height="2" rx="0.3"/><rect x="2.5" y="4.5" width="2.5" height="2" rx="0.3"/><rect x="5.5" y="4.5" width="2.5" height="2" rx="0.3"/><rect x="8.5" y="4.5" width="2.5" height="2" rx="0.3"/><rect x="5.5" y="2" width="2.5" height="2" rx="0.3"/></g><ellipse cx="13" cy="9" rx="1.5" ry="1" fill="#fff" opacity="0.5"/></svg>`,
    bash: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#2E3436"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="7.5" font-weight="bold" fill="#4EAA25">&gt;_</text></svg>`,
    postgresql: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#336791"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">pg</text></svg>`,
    graphql: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#E10098"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="7" font-weight="bold" fill="#fff">GQL</text></svg>`,
    markdown: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#3F3F46"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="8" font-weight="bold" fill="#A1A1AA">MD</text></svg>`
  };
  const GENERIC_ICONS = {
    chat: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    document: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    text: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg>`,
    spreadsheet: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`,
    config: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    terminal: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`,
    database: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
    secure: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    pdf: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#E5322D"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="7" font-weight="bold" fill="#fff">PDF</text></svg>`,
    word: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#2B579A"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#fff">W</text></svg>`,
    image: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
    json: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#3F3F46"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="8" font-weight="bold" fill="#F0DB4F">{}</text></svg>`,
    log: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="8" y1="9" x2="10" y2="9"/></svg>`,
    xml: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#3F3F46"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="7" font-weight="bold" fill="#F97316">&lt;/&gt;</text></svg>`,
    yaml: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#3F3F46"/><text x="8" y="12" text-anchor="middle" font-family="monospace" font-size="7" font-weight="bold" fill="#CB171E">YML</text></svg>`,
    excel: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#217346"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#fff">X</text></svg>`,
    powerpoint: `<svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#D24726"/><text x="8" y="12.5" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold" fill="#fff">P</text></svg>`,
    code: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
    copy: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
  };
  const EXTENSION_MAP = {
    // JavaScript / TypeScript
    ".js": { language: "javascript", icon: DEVICON_ICONS.javascript, label: "JavaScript" },
    ".mjs": { language: "javascript", icon: DEVICON_ICONS.javascript, label: "JavaScript" },
    ".cjs": { language: "javascript", icon: DEVICON_ICONS.javascript, label: "JavaScript" },
    ".jsx": { language: "react", icon: DEVICON_ICONS.react, label: "React JSX" },
    ".ts": { language: "typescript", icon: DEVICON_ICONS.typescript, label: "TypeScript" },
    ".mts": { language: "typescript", icon: DEVICON_ICONS.typescript, label: "TypeScript" },
    ".cts": { language: "typescript", icon: DEVICON_ICONS.typescript, label: "TypeScript" },
    ".tsx": { language: "react", icon: DEVICON_ICONS.react, label: "React TSX" },
    // Python
    ".py": { language: "python", icon: DEVICON_ICONS.python, label: "Python" },
    ".pyw": { language: "python", icon: DEVICON_ICONS.python, label: "Python" },
    ".pyi": { language: "python", icon: DEVICON_ICONS.python, label: "Python" },
    ".ipynb": { language: "python", icon: DEVICON_ICONS.python, label: "Jupyter Notebook" },
    // Java / JVM
    ".java": { language: "java", icon: DEVICON_ICONS.java, label: "Java" },
    ".kt": { language: "kotlin", icon: DEVICON_ICONS.kotlin, label: "Kotlin" },
    ".kts": { language: "kotlin", icon: DEVICON_ICONS.kotlin, label: "Kotlin" },
    // Systems
    ".go": { language: "go", icon: DEVICON_ICONS.go, label: "Go" },
    ".rs": { language: "rust", icon: DEVICON_ICONS.rust, label: "Rust" },
    ".c": { language: "c", icon: DEVICON_ICONS.c, label: "C" },
    ".h": { language: "c", icon: DEVICON_ICONS.c, label: "C Header" },
    ".cpp": { language: "cplusplus", icon: DEVICON_ICONS.cplusplus, label: "C++" },
    ".cc": { language: "cplusplus", icon: DEVICON_ICONS.cplusplus, label: "C++" },
    ".cxx": { language: "cplusplus", icon: DEVICON_ICONS.cplusplus, label: "C++" },
    ".hpp": { language: "cplusplus", icon: DEVICON_ICONS.cplusplus, label: "C++ Header" },
    ".cs": { language: "csharp", icon: DEVICON_ICONS.csharp, label: "C#" },
    ".swift": { language: "swift", icon: DEVICON_ICONS.swift, label: "Swift" },
    // Scripting
    ".rb": { language: "ruby", icon: DEVICON_ICONS.ruby, label: "Ruby" },
    ".php": { language: "php", icon: DEVICON_ICONS.php, label: "PHP" },
    ".sh": { language: "bash", icon: DEVICON_ICONS.bash, label: "Shell" },
    ".bash": { language: "bash", icon: DEVICON_ICONS.bash, label: "Bash" },
    ".zsh": { language: "bash", icon: DEVICON_ICONS.bash, label: "Zsh" },
    ".fish": { language: "bash", icon: DEVICON_ICONS.bash, label: "Fish" },
    ".ps1": { language: "bash", icon: DEVICON_ICONS.bash, label: "PowerShell" },
    // Web
    ".html": { language: "html", icon: DEVICON_ICONS.html5, label: "HTML" },
    ".htm": { language: "html", icon: DEVICON_ICONS.html5, label: "HTML" },
    ".css": { language: "css", icon: DEVICON_ICONS.css3, label: "CSS" },
    ".scss": { language: "sass", icon: DEVICON_ICONS.sass, label: "SCSS" },
    ".sass": { language: "sass", icon: DEVICON_ICONS.sass, label: "Sass" },
    ".less": { language: "css", icon: DEVICON_ICONS.css3, label: "Less" },
    ".vue": { language: "vue", icon: DEVICON_ICONS.vuejs, label: "Vue" },
    ".svelte": { language: "svelte", icon: DEVICON_ICONS.svelte, label: "Svelte" },
    // Data / Config
    ".json": { language: "json", icon: GENERIC_ICONS.json, label: "JSON" },
    ".jsonl": { language: "json", icon: GENERIC_ICONS.json, label: "JSON Lines" },
    ".xml": { language: "xml", icon: GENERIC_ICONS.xml, label: "XML" },
    ".yaml": { language: "yaml", icon: GENERIC_ICONS.yaml, label: "YAML" },
    ".yml": { language: "yaml", icon: GENERIC_ICONS.yaml, label: "YAML" },
    ".toml": { language: "toml", icon: GENERIC_ICONS.config, label: "TOML" },
    ".ini": { language: "ini", icon: GENERIC_ICONS.config, label: "INI" },
    ".cfg": { language: "config", icon: GENERIC_ICONS.config, label: "Config" },
    ".conf": { language: "config", icon: GENERIC_ICONS.config, label: "Config" },
    ".env": { language: "env", icon: GENERIC_ICONS.secure, label: "Environment" },
    ".env.local": { language: "env", icon: GENERIC_ICONS.secure, label: "Environment" },
    // Markdown / Text
    ".md": { language: "markdown", icon: DEVICON_ICONS.markdown, label: "Markdown" },
    ".mdx": { language: "markdown", icon: DEVICON_ICONS.markdown, label: "MDX" },
    ".txt": { language: "text", icon: GENERIC_ICONS.text, label: "Text" },
    ".log": { language: "log", icon: GENERIC_ICONS.log, label: "Log" },
    ".csv": { language: "csv", icon: GENERIC_ICONS.spreadsheet, label: "CSV" },
    ".tsv": { language: "tsv", icon: GENERIC_ICONS.spreadsheet, label: "TSV" },
    // Documents
    ".pdf": { language: "pdf", icon: GENERIC_ICONS.pdf, label: "PDF" },
    ".doc": { language: "word", icon: GENERIC_ICONS.word, label: "Word" },
    ".docx": { language: "word", icon: GENERIC_ICONS.word, label: "Word" },
    ".xls": { language: "excel", icon: GENERIC_ICONS.excel, label: "Excel" },
    ".xlsx": { language: "excel", icon: GENERIC_ICONS.excel, label: "Excel" },
    ".ppt": { language: "powerpoint", icon: GENERIC_ICONS.powerpoint, label: "PowerPoint" },
    ".pptx": { language: "powerpoint", icon: GENERIC_ICONS.powerpoint, label: "PowerPoint" },
    // Images
    ".png": { language: "image", icon: GENERIC_ICONS.image, label: "PNG Image" },
    ".jpg": { language: "image", icon: GENERIC_ICONS.image, label: "JPEG Image" },
    ".jpeg": { language: "image", icon: GENERIC_ICONS.image, label: "JPEG Image" },
    ".gif": { language: "image", icon: GENERIC_ICONS.image, label: "GIF Image" },
    ".svg": { language: "xml", icon: GENERIC_ICONS.image, label: "SVG" },
    ".webp": { language: "image", icon: GENERIC_ICONS.image, label: "WebP Image" },
    // DevOps / Docker
    ".dockerfile": { language: "docker", icon: DEVICON_ICONS.docker, label: "Dockerfile" },
    // Database
    ".sql": { language: "sql", icon: DEVICON_ICONS.postgresql, label: "SQL" },
    ".graphql": { language: "graphql", icon: DEVICON_ICONS.graphql, label: "GraphQL" },
    ".gql": { language: "graphql", icon: DEVICON_ICONS.graphql, label: "GraphQL" }
  };
  const FILENAME_MAP = [
    { pattern: /^Dockerfile$/i, info: { language: "docker", icon: DEVICON_ICONS.docker, label: "Dockerfile" } },
    { pattern: /^Makefile$/i, info: { language: "makefile", icon: GENERIC_ICONS.terminal, label: "Makefile" } },
    { pattern: /^Rakefile$/i, info: { language: "ruby", icon: DEVICON_ICONS.ruby, label: "Rakefile" } },
    { pattern: /^Gemfile$/i, info: { language: "ruby", icon: DEVICON_ICONS.ruby, label: "Gemfile" } },
    { pattern: /^Cargo\.toml$/i, info: { language: "rust", icon: DEVICON_ICONS.rust, label: "Cargo.toml" } },
    { pattern: /^go\.(mod|sum)$/i, info: { language: "go", icon: DEVICON_ICONS.go, label: "Go Module" } },
    { pattern: /^package\.json$/i, info: { language: "json", icon: DEVICON_ICONS.javascript, label: "package.json" } },
    { pattern: /^tsconfig.*\.json$/i, info: { language: "json", icon: DEVICON_ICONS.typescript, label: "tsconfig" } },
    { pattern: /^\.env(\..+)?$/i, info: { language: "env", icon: GENERIC_ICONS.secure, label: "Environment" } },
    { pattern: /^docker-compose.*\.ya?ml$/i, info: { language: "yaml", icon: DEVICON_ICONS.docker, label: "Docker Compose" } },
    { pattern: /^requirements.*\.txt$/i, info: { language: "text", icon: DEVICON_ICONS.python, label: "Requirements" } },
    { pattern: /^angular\.json$/i, info: { language: "json", icon: DEVICON_ICONS.angularjs, label: "Angular Config" } }
  ];
  function detectFileType(filename, isTextChat) {
    if (!filename || isTextChat) {
      return {
        language: "text",
        icon: GENERIC_ICONS.chat,
        label: "AI Text Input"
      };
    }
    const baseName = filename.split("/").pop() || filename;
    for (const { pattern, info } of FILENAME_MAP) {
      if (pattern.test(baseName)) {
        return info;
      }
    }
    const lowerName = baseName.toLowerCase();
    const compoundExtMatch = lowerName.match(/(\.[^.]+\.[^.]+)$/);
    if (compoundExtMatch && EXTENSION_MAP[compoundExtMatch[1]]) {
      return EXTENSION_MAP[compoundExtMatch[1]];
    }
    const extMatch = lowerName.match(/(\.[^.]+)$/);
    if (extMatch && EXTENSION_MAP[extMatch[1]]) {
      return EXTENSION_MAP[extMatch[1]];
    }
    return {
      language: "text",
      icon: GENERIC_ICONS.document,
      label: baseName
    };
  }
  function getGenericIcon(name) {
    return GENERIC_ICONS[name] || GENERIC_ICONS.document;
  }
  const POPUP_ID = "obfusca-detection-popup";
  const POPUP_ANIMATION_NAME = "obfusca-popup-enter";
  const POPUP_ANIMATION_OUT_NAME = "obfusca-popup-exit";
  function truncate(text, maxLen) {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 1) + "…";
  }
  function normalizeAction(action) {
    if (action === "redact") return "warn";
    return action;
  }
  function resolveOriginalValue$2(mapping, extractedText) {
    if (mapping.original_value) return mapping.original_value;
    if (extractedText && typeof mapping.start === "number" && typeof mapping.end === "number" && mapping.start >= 0 && mapping.end > mapping.start && mapping.end <= extractedText.length) {
      return extractedText.slice(mapping.start, mapping.end);
    }
    return null;
  }
  function getEffectivePopupMode(items) {
    for (const item of items) {
      if (item.response && item.response.action === "block") {
        return "block";
      }
    }
    return "warn";
  }
  const BYPASS_CONFIRM_ID = "obfusca-bypass-confirm";
  function buildDetectionSummary(detections, mappings, fileDetections) {
    const byType = {};
    const bySeverity = {};
    let total = 0;
    for (const d of detections) {
      const typeName = d.displayName || d.type;
      byType[typeName] = (byType[typeName] || 0) + 1;
      bySeverity[d.severity] = (bySeverity[d.severity] || 0) + 1;
      total++;
    }
    if (mappings && total === 0) {
      for (const m of mappings) {
        const typeName = m.display_name || m.type;
        byType[typeName] = (byType[typeName] || 0) + 1;
        bySeverity[m.severity] = (bySeverity[m.severity] || 0) + 1;
        total++;
      }
    }
    let hasFiles = false;
    if (fileDetections && fileDetections.length > 0) {
      hasFiles = true;
      for (const fg of fileDetections) {
        if (!fg.isClean) {
          for (const det of fg.detections) {
            byType[det.displayName] = (byType[det.displayName] || 0) + det.count;
            total += det.count;
          }
        }
      }
    }
    return { byType, bySeverity, total, hasFiles };
  }
  function showBypassConfirmation(parentElement, summary) {
    return new Promise((resolve) => {
      var _a, _b, _c;
      (_a = parentElement.querySelector("#" + BYPASS_CONFIRM_ID)) == null ? void 0 : _a.remove();
      const S = OBFUSCA_STYLES;
      const summaryItems = Object.entries(summary.byType).sort(([, a], [, b]) => b - a).map(([type, count]) => `
        <div style="
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 0;
          font-size: 13px;
          color: ${S.colors.foreground};
        ">
          <span style="
            width: 6px;
            height: 6px;
            background: ${S.colors.destructive};
            border-radius: 50%;
            flex-shrink: 0;
          "></span>
          ${count} ${escapeHtml(type)}${count > 1 ? "s" : ""}
        </div>
      `).join("");
      const fileWarning = summary.hasFiles ? `
      <div style="
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 0;
        font-size: 13px;
        color: ${S.colors.foreground};
      ">
        <span style="
          width: 6px;
          height: 6px;
          background: ${S.colors.warning};
          border-radius: 50%;
          flex-shrink: 0;
        "></span>
        File(s) with sensitive data
      </div>
    ` : "";
      const overlay = document.createElement("div");
      overlay.id = BYPASS_CONFIRM_ID;
      overlay.style.cssText = `
      position: absolute;
      inset: 0;
      z-index: 100;
      background: ${S.colors.card};
      border-radius: inherit;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;
      overlay.innerHTML = `
      <!-- Header -->
      <div style="
        padding: 20px 24px 16px;
        border-bottom: 1px solid ${S.colors.border};
        background: linear-gradient(135deg, ${S.colors.destructive}15, transparent);
      ">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="
            width: 40px;
            height: 40px;
            background: ${S.colors.destructive}20;
            border-radius: ${S.radius.lg};
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${S.colors.destructive}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div>
            <h3 style="
              margin: 0;
              font-size: 16px;
              font-weight: 600;
              color: ${S.colors.foreground};
              letter-spacing: -0.02em;
            ">Send without protection?</h3>
          </div>
        </div>
      </div>

      <!-- Body -->
      <div style="padding: 16px 24px; flex: 1; overflow-y: auto;">
        <p style="
          margin: 0 0 16px;
          font-size: 13px;
          color: ${S.colors.mutedForeground};
          line-height: 1.5;
        ">
          This will send your message with all detected sensitive data unprotected.
          This action will be logged for review.
        </p>

        <div style="
          background: ${S.colors.background};
          border: 1px solid ${S.colors.border};
          border-radius: ${S.radius.md};
          padding: 12px 16px;
        ">
          <div style="
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: ${S.colors.mutedForeground};
            margin-bottom: 8px;
          ">Detected</div>
          ${summaryItems}
          ${fileWarning}
        </div>
      </div>

      <!-- Footer -->
      <div style="
        padding: 12px 24px;
        border-top: 1px solid ${S.colors.border};
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
      ">
        <button id="obfusca-bypass-cancel" style="
          padding: 8px 16px;
          background: transparent;
          color: ${S.colors.mutedForeground};
          border: 1px solid ${S.colors.border};
          border-radius: ${S.radius.md};
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: background ${S.transitions.fast}, color ${S.transitions.fast};
          font-family: ${S.fonts.sans};
        ">Cancel</button>
        <button id="obfusca-bypass-confirm-btn" style="
          padding: 8px 16px;
          background: ${S.colors.destructive};
          color: #FFFFFF;
          border: none;
          border-radius: ${S.radius.md};
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity ${S.transitions.fast};
          font-family: ${S.fonts.sans};
        ">Yes, send unprotected</button>
      </div>
    `;
      parentElement.appendChild(overlay);
      let resolved = false;
      function finish(confirmed) {
        if (resolved) return;
        resolved = true;
        overlay.remove();
        document.removeEventListener("keydown", keyHandler, true);
        resolve(confirmed);
      }
      (_b = overlay.querySelector("#obfusca-bypass-cancel")) == null ? void 0 : _b.addEventListener("click", () => {
        finish(false);
      });
      (_c = overlay.querySelector("#obfusca-bypass-confirm-btn")) == null ? void 0 : _c.addEventListener("click", () => {
        finish(true);
      });
      const cancelBtn = overlay.querySelector("#obfusca-bypass-cancel");
      if (cancelBtn) {
        cancelBtn.addEventListener("mouseenter", () => {
          cancelBtn.style.background = S.colors.secondary;
          cancelBtn.style.color = S.colors.foreground;
        });
        cancelBtn.addEventListener("mouseleave", () => {
          cancelBtn.style.background = "transparent";
          cancelBtn.style.color = S.colors.mutedForeground;
        });
      }
      const confirmBtn = overlay.querySelector("#obfusca-bypass-confirm-btn");
      if (confirmBtn) {
        confirmBtn.addEventListener("mouseenter", () => {
          confirmBtn.style.opacity = "0.85";
        });
        confirmBtn.addEventListener("mouseleave", () => {
          confirmBtn.style.opacity = "1";
        });
      }
      const keyHandler = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          finish(false);
        }
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
      };
      document.addEventListener("keydown", keyHandler, true);
      cancelBtn == null ? void 0 : cancelBtn.focus();
    });
  }
  function fireBypassEvent(detections, mappings, originalText, fileDetections) {
    const source = getSourceFromUrl(window.location.href);
    const hasText = !!originalText;
    const hasFiles = fileDetections ? fileDetections.some((f) => !f.isClean) : false;
    const content_type = hasText && hasFiles ? "text_and_file" : hasFiles ? "file" : "text";
    const byType = {};
    const bySeverity = {};
    const bypassed = [];
    for (const d of detections) {
      byType[d.type] = (byType[d.type] || 0) + 1;
      bySeverity[d.severity] = (bySeverity[d.severity] || 0) + 1;
      let value = "";
      let context = "";
      if (originalText && typeof d.start === "number" && typeof d.end === "number") {
        value = originalText.slice(d.start, d.end);
        const ctxStart = Math.max(0, d.start - 30);
        const ctxEnd = Math.min(originalText.length, d.end + 30);
        context = originalText.slice(ctxStart, ctxEnd);
      }
      const mapping = mappings == null ? void 0 : mappings.find(
        (m) => m.type === d.type && m.start === d.start && m.end === d.end
      );
      bypassed.push({
        type: d.type,
        label: d.displayName || d.type,
        value,
        severity: d.severity,
        confidence: d.confidence,
        replacement: (mapping == null ? void 0 : mapping.placeholder) || `[${(d.displayName || d.type).toUpperCase()}]`,
        context
      });
    }
    if (detections.length === 0 && mappings) {
      for (const m of mappings) {
        byType[m.type] = (byType[m.type] || 0) + 1;
        bySeverity[m.severity] = (bySeverity[m.severity] || 0) + 1;
        let value = m.original_value || "";
        if (!value && originalText && typeof m.start === "number" && typeof m.end === "number") {
          value = originalText.slice(m.start, m.end);
        }
        bypassed.push({
          type: m.type,
          label: m.display_name || m.type,
          value,
          severity: m.severity,
          confidence: 1,
          replacement: m.placeholder || `[${(m.display_name || m.type).toUpperCase()}]`,
          context: ""
        });
      }
    }
    const filesBypassed = [];
    if (fileDetections) {
      for (const fg of fileDetections) {
        if (!fg.isClean) {
          const detCount = fg.detections.reduce((sum, d) => sum + d.count, 0);
          filesBypassed.push({
            filename: fg.fileName,
            detections_count: detCount
          });
        }
      }
    }
    const totalCount = bypassed.length + filesBypassed.reduce((s, f) => s + f.detections_count, 0);
    const textToHash = originalText || "";
    sha256Hash(textToHash).then((hash) => {
      const payload = {
        source,
        content_type,
        detections_summary: {
          total_count: totalCount,
          by_type: byType,
          by_severity: bySeverity
        },
        bypassed_detections: bypassed,
        files_bypassed: filesBypassed,
        content_hash: hash,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      logBypassEvent(payload);
    }).catch((err) => {
      console.error("[Obfusca Bypass] Failed to compute hash:", err);
    });
  }
  function showWarnSentToast() {
    var _a;
    const S = OBFUSCA_STYLES;
    const TOAST_ID = "obfusca-warn-sent-toast";
    (_a = document.getElementById(TOAST_ID)) == null ? void 0 : _a.remove();
    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    font-family: ${S.fonts.sans};
    animation: obfusca-popup-enter 0.2s ease-out;
  `;
    toast.innerHTML = `
    <div style="
      background: ${S.colors.card};
      border: 1px solid ${S.colors.warning}40;
      border-left: 3px solid ${S.colors.warning};
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 13px;
      color: ${S.colors.foreground};
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      gap: 8px;
    ">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${S.colors.warning}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      Sent with warnings
    </div>
  `;
    document.body.appendChild(toast);
    setTimeout(() => {
      if (document.body.contains(toast)) {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.3s ease-out";
        setTimeout(() => toast.remove(), 300);
      }
    }, 3e3);
  }
  function fireWarnEvent(detections, mappings, originalText) {
    const source = getSourceFromUrl(window.location.href);
    const byType = {};
    const bySeverity = {};
    for (const d of detections) {
      byType[d.type] = (byType[d.type] || 0) + 1;
      bySeverity[d.severity] = (bySeverity[d.severity] || 0) + 1;
    }
    if (detections.length === 0 && mappings) {
      for (const m of mappings) {
        byType[m.type] = (byType[m.type] || 0) + 1;
        bySeverity[m.severity] = (bySeverity[m.severity] || 0) + 1;
      }
    }
    const totalCount = Object.values(byType).reduce((sum, c) => sum + c, 0);
    const textToHash = originalText || "";
    sha256Hash(textToHash).then((hash) => {
      const payload = {
        source,
        detections_summary: {
          total_count: totalCount,
          by_type: byType,
          by_severity: bySeverity
        },
        content_hash: hash,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      logWarnEvent(payload);
    }).catch((err) => {
      console.error("[Obfusca Warn] Failed to compute hash:", err);
    });
  }
  function renderHeader(action, hasFileDetections) {
    const S = OBFUSCA_STYLES;
    let title;
    let subtitle;
    let accentColor;
    let headerBg;
    if (hasFileDetections && action === "block") {
      title = "Sensitive Content Blocked";
      subtitle = "Protect this file before uploading";
      accentColor = S.colors.destructive;
      headerBg = `${S.colors.destructive}14`;
    } else if (action === "block") {
      title = "Sensitive Content Blocked";
      subtitle = "This content must be protected before sending";
      accentColor = S.colors.destructive;
      headerBg = `${S.colors.destructive}14`;
    } else if (action === "warn") {
      title = "Sensitive Content Detected";
      subtitle = "Review and choose how to protect detected items";
      accentColor = S.colors.info;
      headerBg = `${S.colors.info}0F`;
    } else {
      title = "Content Review";
      subtitle = "Review detected content before proceeding";
      accentColor = S.colors.info;
      headerBg = `${S.colors.info}0A`;
    }
    const shieldIcon = action === "block" ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <line x1="8" y1="8" x2="16" y2="16"/><line x1="16" y1="8" x2="8" y2="16"/>
      </svg>` : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>`;
    return `
    <div style="
      padding: 10px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: ${headerBg};
      border-bottom: 1px solid ${accentColor}20;
      flex-shrink: 0;
    ">
      <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
        <div style="
          width: 30px;
          height: 30px;
          background: ${accentColor}15;
          border-radius: ${S.radius.md};
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: ${accentColor};
        ">
          ${shieldIcon}
        </div>
        <div style="min-width: 0;">
          <div style="
            font-size: 13px;
            font-weight: 600;
            color: ${S.colors.foreground};
            letter-spacing: -0.01em;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          ">${escapeHtml(title)}</div>
          <div style="
            font-size: 11px;
            color: ${S.colors.mutedForeground};
            margin-top: 1px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          ">${escapeHtml(subtitle)}</div>
        </div>
      </div>
      <button id="obfusca-popup-close" aria-label="Close" style="
        background: transparent;
        border: none;
        border-radius: ${S.radius.sm};
        width: 26px;
        height: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: ${S.colors.mutedForeground};
        flex-shrink: 0;
        transition: all ${S.transitions.fast};
      "
        onmouseover="this.style.background='${S.colors.muted}';this.style.color='${S.colors.foreground}'"
        onmouseout="this.style.background='transparent';this.style.color='${S.colors.mutedForeground}'"
      >
        ${ICON_X}
      </button>
    </div>
  `;
  }
  function renderFileInfoBar(fileName) {
    return `
    <div style="
      padding: 6px 14px;
      background: ${OBFUSCA_STYLES.colors.background};
      border-bottom: 1px solid ${OBFUSCA_STYLES.colors.border};
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: ${OBFUSCA_STYLES.colors.mutedForeground};
      flex-shrink: 0;
    ">
      <span style="color: ${OBFUSCA_STYLES.colors.mutedForeground};">${ICON_FILE}</span>
      <span style="
        font-weight: 500;
        color: ${OBFUSCA_STYLES.colors.foreground};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      ">${escapeHtml(truncate(fileName, 40))}</span>
    </div>
  `;
  }
  function renderRedactionList(obfuscation, action, originalText) {
    if (!obfuscation.mappings || obfuscation.mappings.length === 0) return "";
    const S = OBFUSCA_STYLES;
    const isBlock = action === "block";
    return `
    <div style="padding: 8px 10px;">
      <div style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
      ">
        <div style="
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: ${S.colors.mutedForeground};
        ">${isBlock ? "Redactions" : "Redactions"}</div>
        <div style="display: flex; gap: 2px; background: ${S.colors.secondary}; border-radius: 4px; padding: 2px;">
          <button id="obfusca-all-mask-btn" style="
            padding: 3px 8px;
            border-radius: 3px;
            border: none;
            cursor: pointer;
            font-size: 10px;
            font-weight: 500;
            transition: all 0.15s;
            font-family: ${S.fonts.sans};
            background: ${S.colors.info};
            color: #fff;
          " title="Switch all to masked mode">Mask All</button>
          <button id="obfusca-generate-all-btn" style="
            padding: 3px 8px;
            border-radius: 3px;
            border: none;
            cursor: pointer;
            font-size: 10px;
            font-weight: 500;
            transition: all 0.15s;
            font-family: ${S.fonts.sans};
            background: transparent;
            color: ${S.colors.mutedForeground};
          " title="Switch all to dummy mode">Smart Replace</button>
        </div>
      </div>
      <div style="
        display: flex;
        flex-direction: column;
        gap: 4px;
      ">
        ${obfuscation.mappings.map((m, i) => {
      const isChecked = isBlock ? true : m.auto_redact !== false;
      const displayReplacement = m.masked_value || m.replacement || m.placeholder;
      m.severity || "medium";
      return `
          <div class="obfusca-redact-row" data-row-index="${i}" style="
            display: flex;
            flex-direction: column;
            gap: 3px;
            padding: 6px 8px;
            background: ${S.colors.background};
            border: 1px solid ${S.colors.border};
            border-radius: ${S.radius.sm};
            opacity: ${isChecked ? "1" : "0.5"};
            transition: all ${S.transitions.smooth};
            position: relative;
          ">
            <!-- Top row: checkbox, type, original value, mode toggle -->
            <div style="
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 11px;
            ">
              <input type="checkbox" data-mapping-index="${i}"
                ${isChecked ? "checked" : ""}
                ${isBlock ? "disabled" : ""}
                style="
                  width: 14px;
                  height: 14px;
                  accent-color: ${S.colors.info};
                  cursor: ${isBlock ? "not-allowed" : "pointer"};
                  flex-shrink: 0;
                  margin: 0;
                "
                class="obfusca-redact-checkbox"
                aria-label="Toggle redaction for ${escapeHtml(m.display_name || m.type)}"
              />
              <span style="
                font-size: 9px;
                font-weight: 600;
                text-transform: uppercase;
                padding: 2px 6px;
                border-radius: 3px;
                background: ${S.colors.info}22;
                color: ${S.colors.info};
                letter-spacing: 0.5px;
                flex-shrink: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 160px;
              ">${escapeHtml(m.display_name || m.type.split("__")[0].replace(/_/g, " "))}</span>
              <span style="
                color: ${S.colors.mutedForeground};
                opacity: 0.6;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-family: ${S.fonts.mono};
                font-size: 10px;
                flex: 1;
                min-width: 0;
              ">${escapeHtml(
        m.start != null && m.end != null && originalText ? originalText.substring(m.start, m.end) : m.original_preview || m.original || "***"
      )}</span>
              <!-- Mode toggle: Mask | Dummy -->
              <div class="obfusca-mode-toggle" data-row-index="${i}" style="
                display: flex;
                background: ${S.colors.card};
                border-radius: 3px;
                padding: 1px;
                gap: 1px;
                flex-shrink: 0;
                border: 1px solid ${S.colors.border};
              ">
                <button class="obfusca-mode-btn" data-mode="masked" data-row-index="${i}" style="
                  width: 20px; height: 18px;
                  border: none;
                  background: ${S.colors.info};
                  color: #fff;
                  font-size: 9px;
                  font-weight: 600;
                  border-radius: 2px 0 0 2px;
                  cursor: pointer;
                  transition: all ${S.transitions.fast};
                  font-family: ${S.fonts.sans};
                ">M</button>
                <button class="obfusca-mode-btn" data-mode="dummy" data-row-index="${i}" style="
                  width: 20px; height: 18px;
                  border: none;
                  background: ${S.colors.secondary};
                  color: ${S.colors.mutedForeground};
                  font-size: 9px;
                  font-weight: 600;
                  border-radius: 0 2px 2px 0;
                  cursor: pointer;
                  transition: all ${S.transitions.fast};
                  font-family: ${S.fonts.sans};
                ">D</button>
              </div>
            </div>
            <!-- Bottom row: replacement preview -->
            <div class="obfusca-replacement-code" data-row-index="${i}" style="
              margin-left: 22px;
              padding: 3px 8px;
              background: rgba(168, 85, 247, 0.15);
              border: 1px solid rgba(168, 85, 247, 0.3);
              border-radius: 3px;
              font-size: 10px;
              font-family: ${S.fonts.mono};
              color: ${S.colors.foreground};
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              transition: all ${S.transitions.smooth};
            ">&rarr; ${escapeHtml(displayReplacement)}</div>
          </div>
        `;
    }).join("")}
      </div>
    </div>
  `;
  }
  const SCROLLBAR_STYLE_ID = "obfusca-codeblock-scrollbar-styles";
  function injectScrollbarStyles() {
    if (document.getElementById(SCROLLBAR_STYLE_ID)) return;
    const S = OBFUSCA_STYLES;
    const style = document.createElement("style");
    style.id = SCROLLBAR_STYLE_ID;
    style.textContent = `
    .obfusca-code-preview::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .obfusca-code-preview::-webkit-scrollbar-track {
      background: transparent;
    }
    .obfusca-code-preview::-webkit-scrollbar-thumb {
      background: ${S.colors.obscured};
      border-radius: 3px;
    }
    .obfusca-code-preview::-webkit-scrollbar-thumb:hover {
      background: ${S.colors.obscuredText};
    }
    .obfusca-code-preview::-webkit-scrollbar-corner {
      background: transparent;
    }
  `;
    document.head.appendChild(style);
  }
  function renderCodeBlockPreview(content, fileName, isFileMode) {
    const S = OBFUSCA_STYLES;
    const fileType = detectFileType(fileName, !isFileMode && !fileName);
    const previewId = isFileMode ? "obfusca-file-preview-content" : "obfusca-preview-text";
    const maxChars = isFileMode ? 3e3 : 500;
    const truncatedContent = truncate(content, maxChars);
    const lines = truncatedContent.split("\n");
    const lineCount = lines.length;
    const showLineNumbers = lineCount > 1 && lineCount < 500;
    let contentHtml;
    if (showLineNumbers) {
      const digitCount = String(lineCount).length;
      const gutterWidth = Math.max(24, digitCount * 8 + 12);
      const lineRows = lines.map((line, i) => {
        const lineNum = i + 1;
        return `<div style="display: flex; min-height: 18px;">
        <span style="
          display: inline-block;
          width: ${gutterWidth}px;
          min-width: ${gutterWidth}px;
          padding-right: 8px;
          text-align: right;
          color: ${S.colors.obscuredText};
          user-select: none;
          font-size: 10px;
          line-height: 18px;
          opacity: 0.5;
          flex-shrink: 0;
        ">${lineNum}</span>
        <span style="
          flex: 1;
          min-width: 0;
          padding-left: 8px;
          border-left: 1px solid ${S.colors.border};
          line-height: 18px;
        " class="obfusca-code-line" data-line="${lineNum}">${escapeHtml(line) || " "}</span>
      </div>`;
      }).join("");
      contentHtml = lineRows;
    } else {
      contentHtml = escapeHtml(truncatedContent);
    }
    const legendHtml = `
    <div style="
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 9px;
      color: ${S.colors.mutedForeground};
    ">
      <span style="display: inline-flex; align-items: center; gap: 3px;">
        <span style="
          width: 6px; height: 6px; border-radius: 1px;
          background: ${S.colors.redactedHighlight};
          border: 1px solid ${S.colors.obscuredText};
          display: inline-block;
        "></span>Masked
      </span>
      <span style="display: inline-flex; align-items: center; gap: 3px;">
        <span style="
          width: 6px; height: 6px; border-radius: 1px;
          background: ${S.colors.dummyHighlight};
          border: 1px solid ${S.colors.magicPrimary};
          display: inline-block;
        "></span>Dummy
      </span>
    </div>
  `;
    const copyIcon = getGenericIcon("copy");
    return `
    <div style="
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    ">
      <!-- Header bar: icon + filename + language badge + legend + copy -->
      <div style="
        padding: 6px 10px;
        border-bottom: 1px solid ${S.colors.border};
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
        background: ${S.colors.card};
      ">
        <span style="display: flex; align-items: center; flex-shrink: 0;">${fileType.icon}</span>
        <span style="
          font-size: 11px;
          font-weight: 500;
          color: ${S.colors.foreground};
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        ">${escapeHtml(fileName ? fileName.split("/").pop() || fileName : fileType.label)}</span>
        <span style="
          padding: 1px 6px;
          font-size: 9px;
          font-weight: 500;
          color: ${S.colors.mutedForeground};
          background: ${S.colors.secondary};
          border-radius: 3px;
          white-space: nowrap;
          flex-shrink: 0;
          letter-spacing: 0.2px;
        ">${escapeHtml(fileType.label)}</span>
        <div style="margin-left: auto; display: flex; align-items: center; gap: 6px;">
          ${legendHtml}
          <button id="obfusca-preview-copy-btn" title="Copy preview content" style="
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border: none;
            background: transparent;
            border-radius: ${S.radius.sm};
            cursor: pointer;
            color: ${S.colors.mutedForeground};
            transition: all ${S.transitions.fast};
            flex-shrink: 0;
          ">${copyIcon}</button>
        </div>
      </div>
      <!-- Code content area -->
      <div id="${previewId}" class="obfusca-code-preview" style="
        flex: 1;
        overflow: auto;
        padding: ${showLineNumbers ? "6px 0" : "8px 12px"};
        font-size: 11px;
        font-family: ${S.fonts.mono};
        color: ${S.colors.mutedForeground};
        white-space: pre-wrap;
        word-break: break-word;
        line-height: ${showLineNumbers ? "18px" : "1.5"};
        transition: opacity ${S.transitions.smooth};
        background: ${S.colors.background};
        tab-size: 4;
      ">${contentHtml}</div>
    </div>
  `;
  }
  function renderFallbackDetections(detections, accentColor) {
    const S = OBFUSCA_STYLES;
    const grouped = /* @__PURE__ */ new Map();
    for (const d of detections) {
      const existing = grouped.get(d.displayName);
      if (existing) {
        existing.count++;
      } else {
        grouped.set(d.displayName, { displayName: d.displayName, count: 1 });
      }
    }
    const groups = Array.from(grouped.values()).sort((a, b) => b.count - a.count);
    return `
    <div style="
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 10px;
    ">
      ${groups.map((g) => `
        <div style="
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          background: ${S.colors.background};
          border: 1px solid ${S.colors.border};
          border-radius: ${S.radius.sm};
          border-left: 3px solid ${accentColor};
        ">
          <div style="
            font-size: 11px;
            font-weight: 500;
            color: ${S.colors.foreground};
          ">${escapeHtml(g.displayName)}${g.count > 1 ? ` <span style="color: ${S.colors.mutedForeground}; font-weight: 400; font-size: 10px;">(${g.count})</span>` : ""}</div>
        </div>
      `).join("")}
    </div>
  `;
  }
  function renderFileDetections(fileDetections) {
    if (!fileDetections || fileDetections.length === 0) return "";
    const S = OBFUSCA_STYLES;
    return `
    <div style="
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    ">
      ${fileDetections.map((fd) => {
      if (fd.isClean) {
        return `
            <div style="
              display: flex;
              align-items: center;
              gap: 6px;
              padding: 6px 8px;
              background: ${S.colors.background};
              border: 1px solid ${S.colors.border};
              border-radius: ${S.radius.sm};
              font-size: 11px;
              color: ${S.colors.mutedForeground};
            ">
              <span style="color: ${S.colors.mutedForeground};">${ICON_FILE}</span>
              <span>${escapeHtml(truncate(fd.fileName, 30))}</span>
              <span style="
                margin-left: auto;
                color: ${S.colors.success};
                font-size: 10px;
                font-weight: 500;
              ">Clean</span>
            </div>
          `;
      }
      const issueCount = fd.detections.reduce((sum, d) => sum + d.count, 0);
      return `
          <div style="
            padding: 6px 8px;
            background: ${S.colors.background};
            border: 1px solid ${S.colors.border};
            border-radius: ${S.radius.sm};
            border-left: 3px solid ${S.colors.destructive};
          ">
            <div style="
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 11px;
              color: ${S.colors.foreground};
              margin-bottom: 4px;
            ">
              <span style="color: ${S.colors.destructive};">${ICON_FILE}</span>
              <span style="font-weight: 500;">${escapeHtml(truncate(fd.fileName, 30))}</span>
              <span style="
                margin-left: auto;
                font-size: 10px;
                color: ${S.colors.destructive};
                font-weight: 500;
              ">${issueCount} issue${issueCount !== 1 ? "s" : ""}</span>
            </div>
            <div style="
              display: flex;
              flex-direction: column;
              gap: 2px;
              padding-left: 20px;
            ">
              ${fd.detections.map((det) => `
                <div style="
                  font-size: 10px;
                  color: ${S.colors.mutedForeground};
                  display: flex;
                  align-items: center;
                  gap: 4px;
                ">
                  <span style="color: ${S.colors.obscuredText};">•</span>
                  <span>${escapeHtml(det.displayName)}${det.count > 1 ? ` (${det.count})` : ""}</span>
                </div>
              `).join("")}
            </div>
          </div>
        `;
    }).join("")}
    </div>
  `;
  }
  function renderFooterActions(effectiveAction, hasObfuscation, hasFileDetections, hasTextDetections, fileProtectionMode) {
    const S = OBFUSCA_STYLES;
    const btnBase = `
    padding: 6px 12px;
    border-radius: ${S.radius.sm};
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all ${S.transitions.base};
    font-family: ${S.fonts.sans};
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    white-space: nowrap;
  `;
    const primaryStyle = `${btnBase}
    background: ${S.colors.foreground};
    color: ${S.colors.background};
    border: none;
  `;
    const secondaryStyle = `${btnBase}
    background: transparent;
    color: ${S.colors.foreground};
    border: 1px solid ${S.colors.border};
  `;
    const dangerOutlineStyle = `${btnBase}
    background: transparent;
    color: ${S.colors.destructive};
    border: 1px solid ${S.colors.destructive}40;
  `;
    const ghostStyle = `${btnBase}
    background: transparent;
    color: ${S.colors.mutedForeground};
    border: none;
  `;
    const disabledPrimaryStyle = `${btnBase}
    background: ${S.colors.foreground};
    color: ${S.colors.background};
    border: none;
    opacity: 0.5;
    cursor: not-allowed;
  `;
    let buttonsHtml = "";
    if (fileProtectionMode && hasObfuscation) {
      buttonsHtml = `
      ${effectiveAction !== "block" ? `<button id="obfusca-popup-send-original" style="${dangerOutlineStyle}">Upload Anyway</button>` : ""}
      <button id="obfusca-popup-remove-files" style="${secondaryStyle}">Remove</button>
      <button id="obfusca-popup-send-file-protected" style="${primaryStyle}">
        ${ICON_ENTER} Send Protected
      </button>
    `;
    } else if (hasFileDetections && !hasTextDetections) {
      buttonsHtml = `
      ${effectiveAction !== "block" ? `<button id="obfusca-popup-send-original" style="${dangerOutlineStyle}">Upload Anyway</button>` : ""}
      <button id="obfusca-popup-remove-files" style="${primaryStyle}">Remove Flagged</button>
    `;
    } else if (effectiveAction === "block") {
      buttonsHtml = `
      <button id="obfusca-popup-edit" style="${secondaryStyle}">Edit Message</button>
      <button id="obfusca-popup-send-protected" style="${hasObfuscation ? primaryStyle : disabledPrimaryStyle}"${hasObfuscation ? "" : " disabled"}>
        ${ICON_ENTER} Send Protected
      </button>
    `;
    } else if (effectiveAction === "warn") {
      buttonsHtml = `
      <button id="obfusca-popup-send-original" style="${dangerOutlineStyle}">Send Anyway</button>
      <button id="obfusca-popup-edit" style="${secondaryStyle}">Edit Message</button>
      <button id="obfusca-popup-send-protected" style="${hasObfuscation ? primaryStyle : disabledPrimaryStyle}"${hasObfuscation ? "" : " disabled"}>
        ${ICON_ENTER} Send Protected
      </button>
    `;
    } else {
      buttonsHtml = `
      <button id="obfusca-popup-edit" style="${secondaryStyle}">Edit</button>
      <button id="obfusca-popup-send-original" style="${primaryStyle}">Send Anyway</button>
    `;
    }
    const saveCopyHtml = fileProtectionMode ? `
    <button id="obfusca-popup-save-copy" style="${ghostStyle}">
      ${ICON_DOWNLOAD} Save Copy
    </button>
  ` : "";
    return `
    <div style="
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px;
      border-top: 1px solid ${S.colors.border};
      flex-shrink: 0;
    ">
      <div style="display: flex; align-items: center; gap: 6px;">
        <div style="
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          color: ${S.colors.mutedForeground};
          letter-spacing: 0.2px;
        ">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Protected by Obfusca
        </div>
        <span style="
          font-size: 9px;
          color: ${S.colors.mutedForeground};
          opacity: 0.5;
          margin-left: 4px;
        ">Enter to protect · Esc to edit</span>
        ${saveCopyHtml}
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        ${buttonsHtml}
      </div>
    </div>
  `;
  }
  const _dummyRowFlags = /* @__PURE__ */ new Map();
  let _tokenMap = /* @__PURE__ */ new Map();
  const LOCAL_FALLBACK_DUMMIES = {
    ssn: "123-45-6789",
    credit_card: "4111-1111-1111-1111",
    phone: "(555) 123-4567",
    email: "user@example.com",
    money: "$100,000",
    monetary: "$100,000",
    amount: "$100,000",
    salary: "$100,000",
    name: "Jane Doe",
    person_name: "Jane Doe",
    full_name: "Jane Doe",
    patient_name: "Jane Doe",
    employee_name: "Jane Doe",
    address: "123 Example St, Anytown, ST 12345",
    date: "01/01/2000",
    date_of_birth: "01/01/2000",
    aws_key: "AKIAIOSFODNN7EXAMPLE",
    api_key: "sk-example1234567890abcdef",
    jwt: "eyJhbGciOiJIUzI1NiJ9.example",
    private_key: "-----BEGIN EXAMPLE KEY-----",
    connection_string: "postgresql://user:pass@example.com/db"
  };
  function getLocalFallbackDummy(mapping) {
    const type = (mapping.type || "").toLowerCase();
    const name = (mapping.display_name || "").toLowerCase();
    const preview = mapping.original_preview || "";
    if (LOCAL_FALLBACK_DUMMIES[type]) {
      return LOCAL_FALLBACK_DUMMIES[type];
    }
    if (name.includes("amount") || name.includes("settlement") || name.includes("salary") || name.includes("wage") || name.includes("price") || name.includes("revenue") || name.includes("dollar") || name.includes("money") || name.includes("financial")) {
      return "$100,000";
    }
    if (name.includes("name") || name.includes("witness") || name.includes("client") || name.includes("defendant") || name.includes("plaintiff") || name.includes("employee") || name.includes("patient") || name.includes("person")) {
      return "Jane Doe";
    }
    if (name.includes("case") || name.includes("matter") || name.includes("reference")) {
      return "#0000-0000";
    }
    if (name.includes("date") || name.includes("birthday") || name.includes("dob")) {
      return "01/01/2000";
    }
    if (name.includes("address") || name.includes("street") || name.includes("location")) {
      return "123 Example St, Anytown, ST 12345";
    }
    if (/^\$[\d.,]+[KMBTkmbt]?$/i.test(preview)) return "$100,000";
    if (/^\d{3}[-.\s]?\d{2}[-.\s]?\d{4}$/.test(preview)) return "123-45-6789";
    if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(preview)) return "user@example.com";
    if (/^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/.test(preview)) return "(555) 123-4567";
    return mapping.masked_value || mapping.placeholder || "[REDACTED]";
  }
  function showDummyWarning(popup, message) {
    var _a;
    (_a = popup.querySelector(".obfusca-dummy-warning")) == null ? void 0 : _a.remove();
    const warning = document.createElement("div");
    warning.className = "obfusca-dummy-warning";
    warning.style.cssText = `
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: ${OBFUSCA_STYLES.colors.warning}15;
    border: 1px solid ${OBFUSCA_STYLES.colors.warning}40;
    border-radius: 4px;
    margin: 4px 10px;
    font-size: 10px;
    color: ${OBFUSCA_STYLES.colors.warning};
    font-family: ${OBFUSCA_STYLES.fonts.sans};
  `;
    const iconSpan = document.createElement("span");
    iconSpan.textContent = "⚠";
    iconSpan.style.fontSize = "12px";
    warning.appendChild(iconSpan);
    const textSpan = document.createElement("span");
    textSpan.textContent = message;
    warning.appendChild(textSpan);
    const dismissBtn = document.createElement("button");
    dismissBtn.textContent = "×";
    dismissBtn.style.cssText = `
    margin-left: auto;
    background: none;
    border: none;
    color: ${OBFUSCA_STYLES.colors.warning};
    cursor: pointer;
    font-size: 14px;
    padding: 0 2px;
    font-family: ${OBFUSCA_STYLES.fonts.sans};
  `;
    dismissBtn.addEventListener("click", () => warning.remove());
    warning.appendChild(dismissBtn);
    const header = popup.querySelector('[style*="border-bottom"]');
    if (header) {
      header.after(warning);
    } else {
      popup.prepend(warning);
    }
  }
  function setDummyLoadingState(popup, loading) {
    const dummyBtns = popup.querySelectorAll('.obfusca-mode-btn[data-mode="dummy"]');
    const generateAllBtn = popup.querySelector("#obfusca-generate-all-btn");
    dummyBtns.forEach((btn) => {
      if (loading) {
        btn.setAttribute("disabled", "true");
        btn.style.opacity = "0.5";
        btn.style.cursor = "wait";
      } else {
        btn.removeAttribute("disabled");
        btn.style.opacity = "";
        btn.style.cursor = "pointer";
      }
    });
    if (generateAllBtn) {
      if (loading) {
        generateAllBtn.setAttribute("disabled", "true");
        generateAllBtn.style.opacity = "0.5";
        generateAllBtn.style.cursor = "wait";
        generateAllBtn.textContent = "...";
      } else {
        generateAllBtn.removeAttribute("disabled");
        generateAllBtn.style.opacity = "";
        generateAllBtn.style.cursor = "pointer";
        generateAllBtn.textContent = "D";
      }
    }
  }
  function buildTokenMap(obfuscatedText, mappings) {
    const map = /* @__PURE__ */ new Map();
    const bracketRegex = /\[[A-Z][A-Z0-9_ ]*\]/g;
    const allBracketTokens = [];
    let regexMatch;
    let tokenIdx = 0;
    while ((regexMatch = bracketRegex.exec(obfuscatedText)) !== null) {
      allBracketTokens.push({ token: regexMatch[0], pos: regexMatch.index, idx: tokenIdx++ });
    }
    const claimedTokenIndices = /* @__PURE__ */ new Set();
    function claimTokenByString(tokenStr) {
      for (const bt of allBracketTokens) {
        if (bt.token === tokenStr && !claimedTokenIndices.has(bt.idx)) {
          claimedTokenIndices.add(bt.idx);
          return bt;
        }
      }
      return null;
    }
    for (let i = 0; i < mappings.length; i++) {
      const token = mappings[i].placeholder;
      if (token) {
        const found = claimTokenByString(token);
        if (found) map.set(i, found.token);
      }
    }
    for (let i = 0; i < mappings.length; i++) {
      if (map.has(i)) continue;
      const token = mappings[i].replacement;
      if (token) {
        const found = claimTokenByString(token);
        if (found) map.set(i, found.token);
      }
    }
    for (let i = 0; i < mappings.length; i++) {
      if (map.has(i)) continue;
      const dn = mappings[i].display_name;
      if (dn) {
        const variant1 = `[${dn.toUpperCase().replace(/\s+/g, "_")}]`;
        const found1 = claimTokenByString(variant1);
        if (found1) {
          map.set(i, found1.token);
          continue;
        }
        const variant2 = `[${dn.toUpperCase()}]`;
        const found2 = claimTokenByString(variant2);
        if (found2) {
          map.set(i, found2.token);
          continue;
        }
        const firstWord = dn.split(/\s+/)[0].toUpperCase();
        const variant3 = `[${firstWord}]`;
        const found3 = claimTokenByString(variant3);
        if (found3) map.set(i, found3.token);
      }
    }
    const unmappedWithPos = [];
    for (let i = 0; i < mappings.length; i++) {
      if (map.has(i)) continue;
      const m = mappings[i];
      if (m.start != null && m.start >= 0) {
        unmappedWithPos.push({ idx: i, start: m.start });
      }
    }
    if (unmappedWithPos.length > 0) {
      unmappedWithPos.sort((a, b) => a.start - b.start);
      const unclaimedTokens = allBracketTokens.filter((t) => !claimedTokenIndices.has(t.idx));
      for (let j = 0; j < unmappedWithPos.length && j < unclaimedTokens.length; j++) {
        const { idx } = unmappedWithPos[j];
        const bt = unclaimedTokens[j];
        map.set(idx, bt.token);
        claimedTokenIndices.add(bt.idx);
      }
    }
    const stillUnclaimed = allBracketTokens.filter((t) => !claimedTokenIndices.has(t.idx));
    let uncIdx = 0;
    for (let i = 0; i < mappings.length; i++) {
      if (map.has(i)) continue;
      if (uncIdx < stillUnclaimed.length) {
        map.set(i, stillUnclaimed[uncIdx].token);
        claimedTokenIndices.add(stillUnclaimed[uncIdx].idx);
        uncIdx++;
      }
    }
    console.log("[Obfusca Preview] Token map built:", Array.from(map.entries()).map(([k, v]) => `[${k}] → "${v}"`).join(", "));
    return map;
  }
  function updatePreview(popup, obfuscation, choices) {
    const previewEl = popup.querySelector("#obfusca-preview-text");
    if (!previewEl) return;
    let result = obfuscation.obfuscated_text;
    for (let i = 0; i < obfuscation.mappings.length; i++) {
      const choice = choices[i];
      if (!choice || !choice.enabled) continue;
      const newText = choice.replacementText;
      const mapping = obfuscation.mappings[i];
      const token = _tokenMap.get(i);
      if (token && token !== newText && result.includes(token)) {
        result = result.replace(token, newText);
        continue;
      }
      if (newText !== mapping.placeholder && result.includes(mapping.placeholder)) {
        result = result.replace(mapping.placeholder, newText);
        continue;
      }
      if (mapping.replacement && newText !== mapping.replacement && result.includes(mapping.replacement)) {
        result = result.replace(mapping.replacement, newText);
      }
    }
    const truncatedText = truncate(result, 500);
    let html = escapeHtml(truncatedText);
    for (let i = 0; i < obfuscation.mappings.length; i++) {
      const choice = choices[i];
      if (!choice || !choice.enabled) continue;
      const escapedReplacement = escapeHtml(choice.replacementText);
      if (!escapedReplacement || !html.includes(escapedReplacement)) continue;
      const isDummy = _dummyRowFlags.get(i) === true;
      const bgColor = isDummy ? OBFUSCA_STYLES.colors.dummyHighlight : OBFUSCA_STYLES.colors.redactedHighlight;
      const borderColor = isDummy ? OBFUSCA_STYLES.colors.magicPrimary : OBFUSCA_STYLES.colors.obscuredText;
      const highlightedSpan = `<mark style="
      background: ${bgColor};
      border-bottom: 1px solid ${borderColor};
      padding: 0 2px;
      border-radius: 2px;
      transition: all 0.3s ease;
      color: inherit;
    ">${escapedReplacement}</mark>`;
      html = html.replace(escapedReplacement, highlightedSpan);
    }
    previewEl.innerHTML = html;
  }
  function updateFilePreview(popup, extractedText, obfuscation, choices) {
    const previewEl = popup.querySelector("#obfusca-file-preview-content");
    if (!previewEl) return;
    let html = escapeHtml(truncate(extractedText, 3e3));
    const replacements = [];
    for (let i = 0; i < obfuscation.mappings.length; i++) {
      const m = obfuscation.mappings[i];
      const choice = choices[i];
      if (!choice || !choice.enabled) continue;
      const originalValue = resolveOriginalValue$2(m, extractedText);
      if (!originalValue) continue;
      replacements.push({
        index: i,
        original: originalValue,
        replacement: choice.replacementText,
        mode: choice.mode
      });
    }
    replacements.sort((a, b) => b.original.length - a.original.length);
    for (const r of replacements) {
      const escapedOriginal = escapeHtml(r.original);
      if (!html.includes(escapedOriginal)) continue;
      const isDummy = r.mode === "dummy";
      const bgColor = isDummy ? OBFUSCA_STYLES.colors.dummyHighlight : OBFUSCA_STYLES.colors.redactedHighlight;
      const borderColor = isDummy ? OBFUSCA_STYLES.colors.magicPrimary : OBFUSCA_STYLES.colors.obscuredText;
      const highlightedSpan = `<mark style="
      background: ${bgColor};
      border-bottom: 1px solid ${borderColor};
      padding: 0 2px;
      border-radius: 2px;
      transition: all 0.3s ease;
      color: inherit;
    " title="Original: ${escapedOriginal}">${escapeHtml(r.replacement)}</mark>`;
      html = html.replace(escapedOriginal, highlightedSpan);
    }
    previewEl.innerHTML = html;
  }
  function findVisibleInputContainer(inputElement) {
    let el = inputElement;
    let best = inputElement;
    for (let i = 0; i < 6 && el; i++) {
      el = el.parentElement;
      if (!el) break;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const hasBg = style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent";
      const hasBorder = style.borderWidth !== "0px" && style.borderStyle !== "none";
      const hasRadius = parseFloat(style.borderRadius) > 0;
      const isWideEnough = rect.width > 300;
      if (isWideEnough && (hasBg || hasBorder || hasRadius)) {
        best = el;
        break;
      }
      if (rect.width > best.getBoundingClientRect().width) {
        best = el;
      }
    }
    return best;
  }
  function positionBubble(bubble, anchorElement) {
    const container = findVisibleInputContainer(anchorElement);
    const rect = container.getBoundingClientRect();
    const gap = 8;
    const bottomValue = window.innerHeight - rect.top + gap;
    if (rect.width >= 400) {
      bubble.style.bottom = `${bottomValue}px`;
      bubble.style.left = `${rect.left}px`;
      bubble.style.width = `${rect.width}px`;
      bubble.style.transform = "none";
      bubble.style.maxHeight = `${Math.max(100, rect.top - gap - 20)}px`;
      bubble.style.borderRadius = "16px";
      bubble.style.maxWidth = "";
    } else {
      bubble.style.bottom = `${bottomValue}px`;
      bubble.style.left = "50%";
      bubble.style.transform = "translateX(-50%)";
      bubble.style.width = "750px";
      bubble.style.maxWidth = "calc(100vw - 32px)";
      bubble.style.maxHeight = `${Math.max(100, rect.top - gap - 32)}px`;
      bubble.style.borderRadius = "16px";
    }
  }
  function showDetectionPopup(options) {
    removeDetectionPopup();
    injectAnimationStyles();
    injectScrollbarStyles();
    const {
      detections,
      obfuscation,
      fileDetections,
      simulated,
      anchorElement
    } = options;
    const effectiveAction = normalizeAction(options.action);
    const displayAction = simulated && effectiveAction === "allow" ? "allow" : effectiveAction;
    const hasFileDetections = !!fileDetections && fileDetections.length > 0;
    const hasTextDetections = detections.length > 0;
    const hasObfuscation = !!obfuscation && obfuscation.mappings.length > 0;
    const S = OBFUSCA_STYLES;
    const needsSideBySide = hasObfuscation && (displayAction === "block" || displayAction === "warn" || options.fileProtectionMode);
    const headerHtml = renderHeader(
      hasFileDetections && !hasTextDetections ? "block" : displayAction,
      hasFileDetections && !hasTextDetections
    );
    let leftPanelHtml = "";
    let rightPanelHtml = "";
    let fallbackBodyHtml = "";
    if (options.fileProtectionMode && hasObfuscation) {
      leftPanelHtml = renderRedactionList(obfuscation, effectiveAction === "block" ? "block" : "warn", options.extractedText || options.originalText);
      if (options.extractedText) {
        rightPanelHtml = renderCodeBlockPreview(
          options.extractedText,
          options.fileName || null,
          true
        );
      }
    } else if (hasTextDetections && needsSideBySide) {
      leftPanelHtml = renderRedactionList(obfuscation, displayAction, options.originalText);
      rightPanelHtml = renderCodeBlockPreview(
        obfuscation.obfuscated_text,
        options.fileName || null,
        false
      );
    } else if (hasTextDetections) {
      if (displayAction === "block") {
        fallbackBodyHtml = renderFallbackDetections(detections, S.colors.destructive);
      } else if (displayAction === "warn") {
        fallbackBodyHtml = renderFallbackDetections(detections, S.colors.info);
      } else {
        fallbackBodyHtml = renderFallbackDetections(detections, S.colors.info);
      }
    }
    if (hasFileDetections && !options.fileProtectionMode) {
      fallbackBodyHtml += renderFileDetections(fileDetections);
    }
    let fileInfoHtml = "";
    if (options.fileProtectionMode && options.fileName) {
      fileInfoHtml = renderFileInfoBar(options.fileName);
    }
    const footerActionsHtml = renderFooterActions(
      displayAction,
      hasObfuscation,
      hasFileDetections,
      hasTextDetections,
      options.fileProtectionMode
    );
    const popup = document.createElement("div");
    popup.id = POPUP_ID;
    const maxHeightValue = 480;
    popup.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    transform: none;
    z-index: 2147483647;
    font-family: ${S.fonts.sans};
    width: 750px;
    max-width: calc(100vw - 32px);
    max-height: min(${maxHeightValue}px, 70vh);
    display: flex;
    flex-direction: column;
    background: ${S.colors.card};
    border: 1px solid ${S.colors.border};
    border-radius: 16px;
    box-shadow: 0 -4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08);
    overflow: visible;
    animation: ${POPUP_ANIMATION_NAME} 0.18s ease-out forwards;
  `;
    popup.style.setProperty("--obfusca-card-bg", S.colors.card);
    let bodyHtml;
    if (needsSideBySide && (leftPanelHtml || rightPanelHtml)) {
      bodyHtml = `
      ${fileInfoHtml}
      <div style="
        flex: 1;
        display: grid;
        grid-template-columns: 320px 1fr;
        min-height: 0;
        overflow: hidden;
      ">
        <!-- Left panel: detection list -->
        <div style="
          overflow-y: auto;
          overflow-x: hidden;
          border-right: 1px solid ${S.colors.border};
          background: ${S.colors.card};
        ">
          ${leftPanelHtml}
        </div>
        <!-- Right panel: preview -->
        <div style="
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-height: 0;
          background: ${S.colors.background};
        ">
          ${rightPanelHtml}
        </div>
      </div>
    `;
    } else {
      bodyHtml = `
      ${fileInfoHtml}
      <div style="
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
      ">
        ${fallbackBodyHtml || leftPanelHtml}
      </div>
    `;
    }
    const innerWrapper = document.createElement("div");
    innerWrapper.style.cssText = `
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 16px 16px 0 0;
    flex: 1;
    min-height: 0;
    max-height: min(${maxHeightValue}px, 70vh);
  `;
    innerWrapper.innerHTML = `
    ${headerHtml}
    ${bodyHtml}
    ${footerActionsHtml}
  `;
    popup.appendChild(innerWrapper);
    document.body.appendChild(popup);
    positionBubble(popup, anchorElement);
    const positionInterval = setInterval(() => {
      if (!popup.isConnected || !anchorElement.isConnected) {
        clearInterval(positionInterval);
        return;
      }
      positionBubble(popup, anchorElement);
    }, 100);
    popup.__obfuscaPositionInterval = positionInterval;
    const outsideClickHandler = (e) => {
      if (!popup.contains(e.target)) {
        removeDetectionPopup();
        options.onDismiss();
      }
    };
    setTimeout(() => {
      document.addEventListener("mousedown", outsideClickHandler, { capture: false });
      popup.__obfuscaOutsideClickHandler = outsideClickHandler;
    }, 150);
    const closeBtn = popup.querySelector("#obfusca-popup-close");
    const editBtn = popup.querySelector("#obfusca-popup-edit");
    const sendOriginalBtn = popup.querySelector("#obfusca-popup-send-original");
    const sendProtectedBtn = popup.querySelector("#obfusca-popup-send-protected");
    const removeFilesBtn = popup.querySelector("#obfusca-popup-remove-files");
    const downloadProtectedBtn = popup.querySelector("#obfusca-popup-download-protected");
    const sendFileProtectedBtn = popup.querySelector("#obfusca-popup-send-file-protected");
    const saveCopyBtn = popup.querySelector("#obfusca-popup-save-copy");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        removeDetectionPopup();
        options.onDismiss();
      });
    }
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        removeDetectionPopup();
        options.onEdit();
      });
      editBtn.addEventListener("mouseenter", () => {
        editBtn.style.background = S.colors.secondary;
      });
      editBtn.addEventListener("mouseleave", () => {
        editBtn.style.background = "transparent";
      });
    }
    if (sendOriginalBtn) {
      sendOriginalBtn.addEventListener("click", async () => {
        const summary = buildDetectionSummary(
          options.detections,
          obfuscation == null ? void 0 : obfuscation.mappings,
          options.fileDetections
        );
        const popupCard = popup.querySelector('[style*="position: relative"]') || popup;
        const confirmed = await showBypassConfirmation(popupCard, summary);
        if (!confirmed) return;
        fireBypassEvent(
          options.detections,
          obfuscation == null ? void 0 : obfuscation.mappings,
          options.originalText,
          options.fileDetections
        );
        setBypassFlag();
        removeDetectionPopup();
        options.onSendOriginal();
      });
      sendOriginalBtn.addEventListener("mouseenter", () => {
        if (sendOriginalBtn.style.color === S.colors.destructive) {
          sendOriginalBtn.style.background = `${S.colors.destructive}15`;
        } else {
          sendOriginalBtn.style.opacity = "0.9";
        }
      });
      sendOriginalBtn.addEventListener("mouseleave", () => {
        sendOriginalBtn.style.opacity = "1";
        if (sendOriginalBtn.style.color === S.colors.destructive) {
          sendOriginalBtn.style.background = "transparent";
        }
      });
    }
    const redactionChoices = obfuscation ? obfuscation.mappings.map((m, i) => ({
      index: i,
      enabled: effectiveAction === "block" ? true : m.auto_redact !== false,
      replacementText: m.masked_value || m.replacement || m.placeholder,
      mode: "masked"
    })) : [];
    _tokenMap.clear();
    if (obfuscation && obfuscation.obfuscated_text) {
      _tokenMap = buildTokenMap(obfuscation.obfuscated_text, obfuscation.mappings);
    }
    function refreshPreviews() {
      if (obfuscation) {
        updatePreview(popup, obfuscation, redactionChoices);
      }
      if (options.extractedText && obfuscation) {
        updateFilePreview(popup, options.extractedText, obfuscation, redactionChoices);
      }
    }
    if (options.extractedText && obfuscation) {
      updateFilePreview(popup, options.extractedText, obfuscation, redactionChoices);
    }
    const checkboxes = popup.querySelectorAll(".obfusca-redact-checkbox");
    checkboxes.forEach((cb) => {
      cb.addEventListener("change", () => {
        const idx = parseInt(cb.getAttribute("data-mapping-index") || "0", 10);
        if (redactionChoices[idx]) {
          redactionChoices[idx].enabled = cb.checked;
        }
        const row = cb.closest(".obfusca-redact-row");
        if (row) {
          row.style.opacity = cb.checked ? "1" : "0.5";
        }
        refreshPreviews();
      });
    });
    const customBtns = popup.querySelectorAll(".obfusca-custom-replacement-btn");
    customBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-mapping-index") || "0", 10);
        if (!obfuscation || !redactionChoices[idx]) return;
        const mapping = obfuscation.mappings[idx];
        const choice = redactionChoices[idx];
        Promise.resolve().then(() => replacementModal).then(({ showReplacementModal: showReplacementModal2 }) => {
          showReplacementModal2({
            currentText: choice.replacementText,
            label: mapping.display_name || mapping.type,
            onConfirm: (newText) => {
              choice.replacementText = newText;
              choice.mode = "custom";
              const row = popup.querySelector(`.obfusca-redact-row[data-row-index="${idx}"]`);
              if (row) {
                const codeEl = row.querySelector(".obfusca-replacement-code");
                if (codeEl) codeEl.textContent = `→ ${newText}`;
                updateModeToggleUI(row, "custom");
              }
              refreshPreviews();
            },
            onCancel: () => {
            },
            anchorElement: btn
          });
        });
      });
      btn.addEventListener("mouseenter", () => {
        btn.style.borderColor = S.colors.mutedForeground;
        btn.style.opacity = "1";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.borderColor = S.colors.border;
        btn.style.opacity = "0.5";
      });
    });
    function updateModeToggleUI(row, mode) {
      const maskBtn = row.querySelector('.obfusca-mode-btn[data-mode="masked"]');
      const dummyBtn = row.querySelector('.obfusca-mode-btn[data-mode="dummy"]');
      if (maskBtn) {
        maskBtn.style.background = mode === "masked" ? S.colors.info : S.colors.secondary;
        maskBtn.style.color = mode === "masked" ? "#fff" : S.colors.mutedForeground;
      }
      if (dummyBtn) {
        dummyBtn.style.background = mode === "dummy" ? "#10b981" : S.colors.secondary;
        dummyBtn.style.color = mode === "dummy" ? "#000" : S.colors.mutedForeground;
      }
    }
    const modeBtns = popup.querySelectorAll(".obfusca-mode-btn");
    modeBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute("data-row-index") || "0", 10);
        const mode = btn.getAttribute("data-mode");
        if (!obfuscation || !redactionChoices[idx]) return;
        const mapping = obfuscation.mappings[idx];
        const choice = redactionChoices[idx];
        console.log(`[Obfusca Toggle] Row ${idx} → ${mode} | masked_value=${mapping.masked_value} | dummy_value=${mapping.dummy_value}`);
        let newValue;
        if (mode === "masked") {
          newValue = mapping.masked_value || mapping.replacement || mapping.placeholder;
        } else {
          newValue = mapping.dummy_value || mapping.replacement || mapping.placeholder;
        }
        console.log(`[Obfusca Toggle] Row ${idx} → newValue="${newValue}"`);
        choice.replacementText = newValue;
        choice.mode = mode;
        const row = popup.querySelector(`.obfusca-redact-row[data-row-index="${idx}"]`);
        if (row) {
          const codeEl = row.querySelector(".obfusca-replacement-code");
          if (codeEl) {
            codeEl.textContent = `→ ${newValue}`;
            if (mode === "dummy") {
              codeEl.style.background = "rgba(16, 185, 129, 0.15)";
              codeEl.style.color = "#10b981";
              codeEl.style.border = "1px solid rgba(16, 185, 129, 0.3)";
            } else {
              codeEl.style.background = "rgba(168, 85, 247, 0.15)";
              codeEl.style.color = "#a855f7";
              codeEl.style.border = "1px solid rgba(168, 85, 247, 0.3)";
            }
          }
          updateModeToggleUI(row, mode);
        }
        _dummyRowFlags.set(idx, mode === "dummy");
        refreshPreviews();
      });
      btn.addEventListener("mouseenter", () => {
        const btnMode = btn.getAttribute("data-mode");
        const idx = parseInt(btn.getAttribute("data-row-index") || "0", 10);
        const choice = redactionChoices[idx];
        const isActive = choice && choice.mode === btnMode;
        if (!isActive) {
          const hoverColor = btnMode === "dummy" ? "rgba(16, 185, 129, 0.3)" : `${S.colors.info}30`;
          btn.style.background = hoverColor;
        }
      });
      btn.addEventListener("mouseleave", () => {
        const idx = parseInt(btn.getAttribute("data-row-index") || "0", 10);
        const choice = redactionChoices[idx];
        const btnMode = btn.getAttribute("data-mode");
        const isActive = choice && choice.mode === btnMode;
        if (!isActive) {
          btn.style.background = S.colors.secondary;
        }
      });
    });
    function switchAllToMode(targetMode) {
      if (!obfuscation) return;
      for (let i = 0; i < obfuscation.mappings.length; i++) {
        const choice = redactionChoices[i];
        if (!choice || !choice.enabled) continue;
        const m = obfuscation.mappings[i];
        let newValue;
        if (targetMode === "masked") {
          newValue = m.masked_value || m.replacement || m.placeholder;
        } else {
          newValue = m.dummy_value || m.replacement || m.placeholder;
        }
        choice.replacementText = newValue;
        choice.mode = targetMode;
        _dummyRowFlags.set(i, targetMode === "dummy");
        const row = popup.querySelector(`.obfusca-redact-row[data-row-index="${i}"]`);
        if (row) {
          const codeEl = row.querySelector(".obfusca-replacement-code");
          if (codeEl) {
            codeEl.textContent = `→ ${newValue}`;
            if (targetMode === "dummy") {
              codeEl.style.background = "rgba(16, 185, 129, 0.15)";
              codeEl.style.color = "#10b981";
              codeEl.style.border = "1px solid rgba(16, 185, 129, 0.3)";
            } else {
              codeEl.style.background = "rgba(168, 85, 247, 0.15)";
              codeEl.style.color = "#a855f7";
              codeEl.style.border = "1px solid rgba(168, 85, 247, 0.3)";
            }
          }
          updateModeToggleUI(row, targetMode);
        }
      }
      refreshPreviews();
    }
    const allMaskBtn = popup.querySelector("#obfusca-all-mask-btn");
    const generateAllBtn = popup.querySelector("#obfusca-generate-all-btn");
    function updateGlobalModeToggle(activeMode) {
      if (allMaskBtn) {
        allMaskBtn.style.background = activeMode === "masked" ? S.colors.info : "transparent";
        allMaskBtn.style.color = activeMode === "masked" ? "#fff" : S.colors.mutedForeground;
      }
      if (generateAllBtn) {
        generateAllBtn.style.background = activeMode === "dummy" ? "#10b981" : "transparent";
        generateAllBtn.style.color = activeMode === "dummy" ? "#000" : S.colors.mutedForeground;
      }
    }
    if (allMaskBtn) {
      allMaskBtn.addEventListener("click", () => {
        switchAllToMode("masked");
        updateGlobalModeToggle("masked");
      });
    }
    if (generateAllBtn) {
      generateAllBtn.addEventListener("click", () => {
        switchAllToMode("dummy");
        updateGlobalModeToggle("dummy");
      });
    }
    if (sendProtectedBtn && obfuscation) {
      sendProtectedBtn.addEventListener("click", () => {
        var _a;
        const protectedText = generateProtectedText(
          obfuscation.obfuscated_text,
          obfuscation.mappings,
          redactionChoices,
          _tokenMap
        );
        removeDetectionPopup();
        (_a = options.onSendProtected) == null ? void 0 : _a.call(options, protectedText);
      });
      sendProtectedBtn.addEventListener("mouseenter", () => {
        sendProtectedBtn.style.opacity = "0.9";
        sendProtectedBtn.style.transform = "translateY(-1px)";
      });
      sendProtectedBtn.addEventListener("mouseleave", () => {
        sendProtectedBtn.style.opacity = "1";
        sendProtectedBtn.style.transform = "";
      });
    }
    if (removeFilesBtn) {
      removeFilesBtn.addEventListener("click", () => {
        var _a;
        removeDetectionPopup();
        (_a = options.onRemoveFiles) == null ? void 0 : _a.call(options);
      });
      removeFilesBtn.addEventListener("mouseenter", () => {
        removeFilesBtn.style.opacity = "0.9";
      });
      removeFilesBtn.addEventListener("mouseleave", () => {
        removeFilesBtn.style.opacity = "1";
      });
    }
    if (downloadProtectedBtn && obfuscation && options.onDownloadProtected) {
      downloadProtectedBtn.addEventListener("click", async () => {
        const choices = [];
        for (let i = 0; i < obfuscation.mappings.length; i++) {
          const m = obfuscation.mappings[i];
          const choice = redactionChoices[i];
          if (choice && !choice.enabled) continue;
          const originalValue = resolveOriginalValue$2(m, options.extractedText);
          if (!originalValue) continue;
          const isDummy = _dummyRowFlags.get(i);
          const replacement = isDummy ? m.dummy_value || m.masked_value || m.placeholder : m.masked_value || m.placeholder;
          choices.push({ original_value: originalValue, replacement });
        }
        downloadProtectedBtn.disabled = true;
        downloadProtectedBtn.innerHTML = `${ICON_SPINNER} Processing...`;
        try {
          await options.onDownloadProtected(choices);
          downloadProtectedBtn.innerHTML = `${ICON_CHECK} Downloaded`;
          setTimeout(() => removeDetectionPopup(), 1200);
        } catch {
          downloadProtectedBtn.disabled = false;
          downloadProtectedBtn.innerHTML = `${ICON_DOWNLOAD} Download Protected`;
        }
      });
      downloadProtectedBtn.addEventListener("mouseenter", () => {
        downloadProtectedBtn.style.opacity = "0.9";
      });
      downloadProtectedBtn.addEventListener("mouseleave", () => {
        downloadProtectedBtn.style.opacity = "1";
      });
    }
    function buildFileProtectionChoices() {
      if (!obfuscation) return [];
      const choices = [];
      for (let i = 0; i < obfuscation.mappings.length; i++) {
        const m = obfuscation.mappings[i];
        const choice = redactionChoices[i];
        if (choice && !choice.enabled) continue;
        const originalValue = resolveOriginalValue$2(m, options.extractedText);
        if (!originalValue) continue;
        choices.push({ original_value: originalValue, replacement: (choice == null ? void 0 : choice.replacementText) || m.masked_value || m.placeholder });
      }
      return choices;
    }
    if (sendFileProtectedBtn && obfuscation && options.onSendFileProtected) {
      sendFileProtectedBtn.addEventListener("click", async () => {
        const choices = buildFileProtectionChoices();
        sendFileProtectedBtn.disabled = true;
        sendFileProtectedBtn.innerHTML = `${ICON_SPINNER} Processing...`;
        try {
          await options.onSendFileProtected(choices);
          sendFileProtectedBtn.innerHTML = `${ICON_CHECK} Sent`;
          setTimeout(() => removeDetectionPopup(), 800);
        } catch {
          sendFileProtectedBtn.disabled = false;
          sendFileProtectedBtn.innerHTML = `${ICON_ENTER} Send Protected`;
        }
      });
      sendFileProtectedBtn.addEventListener("mouseenter", () => {
        sendFileProtectedBtn.style.opacity = "0.9";
      });
      sendFileProtectedBtn.addEventListener("mouseleave", () => {
        sendFileProtectedBtn.style.opacity = "1";
      });
    }
    if (saveCopyBtn && obfuscation && options.onDownloadProtected) {
      saveCopyBtn.addEventListener("click", async () => {
        const choices = buildFileProtectionChoices();
        saveCopyBtn.textContent = "Saving...";
        try {
          await options.onDownloadProtected(choices);
          saveCopyBtn.textContent = "Saved!";
          setTimeout(() => {
            saveCopyBtn.textContent = "Save Copy";
          }, 2e3);
        } catch {
          saveCopyBtn.textContent = "Failed";
          setTimeout(() => {
            saveCopyBtn.textContent = "Save Copy";
          }, 2e3);
        }
      });
      saveCopyBtn.addEventListener("mouseenter", () => {
        saveCopyBtn.style.borderColor = S.colors.mutedForeground;
        saveCopyBtn.style.color = S.colors.foreground;
      });
      saveCopyBtn.addEventListener("mouseleave", () => {
        saveCopyBtn.style.borderColor = S.colors.border;
        saveCopyBtn.style.color = S.colors.mutedForeground;
      });
    }
    const copyBtn = popup.querySelector("#obfusca-preview-copy-btn");
    if (copyBtn) {
      const checkSvg = getGenericIcon("check");
      const copySvg = getGenericIcon("copy");
      copyBtn.addEventListener("click", () => {
        const previewEl = popup.querySelector("#obfusca-preview-text") || popup.querySelector("#obfusca-file-preview-content");
        if (!previewEl) return;
        const textContent = previewEl.textContent || "";
        navigator.clipboard.writeText(textContent).then(() => {
          copyBtn.innerHTML = checkSvg;
          copyBtn.style.color = S.colors.success;
          setTimeout(() => {
            copyBtn.innerHTML = copySvg;
            copyBtn.style.color = S.colors.mutedForeground;
          }, 2e3);
        }).catch(() => {
          const textarea = document.createElement("textarea");
          textarea.value = textContent;
          textarea.style.position = "fixed";
          textarea.style.left = "-9999px";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
          copyBtn.innerHTML = checkSvg;
          copyBtn.style.color = S.colors.success;
          setTimeout(() => {
            copyBtn.innerHTML = copySvg;
            copyBtn.style.color = S.colors.mutedForeground;
          }, 2e3);
        });
      });
      copyBtn.addEventListener("mouseenter", () => {
        copyBtn.style.background = S.colors.secondary;
        copyBtn.style.color = S.colors.foreground;
      });
      copyBtn.addEventListener("mouseleave", () => {
        copyBtn.style.background = "transparent";
        if (!copyBtn.innerHTML.includes('polyline points="20 6')) {
          copyBtn.style.color = S.colors.mutedForeground;
        }
      });
    }
    const _prevActiveElement = document.activeElement;
    if (_prevActiveElement instanceof HTMLElement) {
      _prevActiveElement.blur();
    }
    popup.setAttribute("tabindex", "-1");
    popup.focus({ preventScroll: true });
    const keyHandler = (e) => {
      var _a;
      if (document.getElementById(BYPASS_CONFIRM_ID)) return;
      if (e.key === "Escape") {
        removeDetectionPopup();
        options.onDismiss();
        document.removeEventListener("keydown", keyHandler, true);
        return;
      }
      if (e.key === "Enter") {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
          const isObfuscaInput = ((_a = activeEl.id) == null ? void 0 : _a.startsWith("obfusca-")) || activeEl.closest("#" + POPUP_ID);
          if (isObfuscaInput) return;
        }
        if (document.getElementById("obfusca-replacement-modal")) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.shiftKey) {
          const bypassBtn = popup.querySelector("#obfusca-popup-send-original");
          bypassBtn == null ? void 0 : bypassBtn.click();
        } else {
          const primaryBtn = popup.querySelector("#obfusca-popup-send-protected") || popup.querySelector("#obfusca-popup-send-file-protected") || popup.querySelector("#obfusca-popup-remove-files");
          if (primaryBtn && !primaryBtn.hasAttribute("disabled")) primaryBtn.click();
        }
      }
    };
    document.addEventListener("keydown", keyHandler, true);
    popup.__obfuscaEscHandler = keyHandler;
    popup.__obfuscaPrevFocus = _prevActiveElement;
    if (hasObfuscation && obfuscation && options.originalText) {
      const needsDummies = obfuscation.mappings.length > 0;
      if (needsDummies) {
        setDummyLoadingState(popup, true);
        const batchDetections = obfuscation.mappings.map((m, i) => ({
          index: i,
          type: m.type || "custom",
          original_value: m.original_preview || m.placeholder,
          display_name: m.display_name
        }));
        console.log("[Obfusca Batch] Fetching AI dummies for", batchDetections.length, "items");
        generateDummiesBatch(options.originalText, batchDetections).then((response) => {
          if (!document.getElementById(POPUP_ID)) {
            console.log("[Obfusca Batch] Popup dismissed before dummies arrived");
            return;
          }
          if (response && response.success && response.dummies.length > 0) {
            console.log("[Obfusca Batch] AI dummies received:", response.dummies.length, "items, source:", response.source);
            for (const item of response.dummies) {
              const idx = item.index;
              if (idx >= 0 && idx < obfuscation.mappings.length && item.dummy_value) {
                obfuscation.mappings[idx].dummy_value = item.dummy_value;
                const choice = redactionChoices[idx];
                if (choice && choice.mode === "dummy") {
                  choice.replacementText = item.dummy_value;
                  const row = popup.querySelector(`.obfusca-redact-row[data-row-index="${idx}"]`);
                  if (row) {
                    const codeEl = row.querySelector(".obfusca-replacement-code");
                    if (codeEl) codeEl.textContent = item.dummy_value;
                  }
                }
              }
            }
            const hasDummyRows = Array.from(_dummyRowFlags.values()).some((v) => v);
            if (hasDummyRows) refreshPreviews();
          } else {
            console.warn("[Obfusca Batch] AI dummies failed, applying local fallbacks");
            showDummyWarning(popup, "Couldn’t generate smart replacements. Using defaults.");
            for (let i = 0; i < obfuscation.mappings.length; i++) {
              const m = obfuscation.mappings[i];
              if (!m.dummy_value || m.dummy_value === m.masked_value) {
                m.dummy_value = getLocalFallbackDummy(m);
              }
            }
          }
        }).catch((err) => {
          console.error("[Obfusca Batch] Batch dummy fetch error:", err);
          if (document.getElementById(POPUP_ID)) {
            showDummyWarning(popup, "Backend error. Using default replacements.");
            for (let i = 0; i < obfuscation.mappings.length; i++) {
              const m = obfuscation.mappings[i];
              if (!m.dummy_value || m.dummy_value === m.masked_value) {
                m.dummy_value = getLocalFallbackDummy(m);
              }
            }
          }
        }).finally(() => {
          if (document.getElementById(POPUP_ID)) {
            setDummyLoadingState(popup, false);
          }
        });
      }
    }
    return popup;
  }
  function removeDetectionPopup() {
    const existing = document.getElementById(POPUP_ID);
    if (!existing) return;
    if (existing) {
      const escHandler = existing.__obfuscaEscHandler;
      if (escHandler) {
        document.removeEventListener("keydown", escHandler, true);
      }
      const outsideClickHandler = existing.__obfuscaOutsideClickHandler;
      if (outsideClickHandler) {
        document.removeEventListener("mousedown", outsideClickHandler, false);
      }
      const positionInterval = existing.__obfuscaPositionInterval;
      if (positionInterval !== void 0) {
        clearInterval(positionInterval);
      }
      const prevFocus = existing.__obfuscaPrevFocus;
      if (prevFocus && typeof prevFocus.focus === "function") {
        try {
          prevFocus.focus({ preventScroll: true });
        } catch (_) {
        }
      }
    }
    _dummyRowFlags.clear();
    _tokenMap.clear();
    if (existing) {
      existing.style.animation = `${POPUP_ANIMATION_OUT_NAME} 0.12s ease-in forwards`;
      setTimeout(() => {
        existing.remove();
      }, 120);
    }
  }
  function isDetectionPopupVisible() {
    return document.getElementById(POPUP_ID) !== null;
  }
  const MULTI_POPUP_ID = "obfusca-multi-detection-popup";
  function renderStatusIndicator(status) {
    const S = OBFUSCA_STYLES;
    switch (status) {
      case "protected":
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${S.colors.success}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>`;
      case "skipped":
        return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${S.colors.mutedForeground}" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      default:
        return `<span style="
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: ${S.colors.info};
        flex-shrink: 0;
      "></span>`;
    }
  }
  function renderItemTypeIcon(type) {
    if (type === "file") {
      return ICON_FILE;
    }
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  }
  function renderTabBar(state) {
    if (state.items.length <= 1) return "";
    const S = OBFUSCA_STYLES;
    const protectedCount = state.items.filter((i) => i.status === "protected").length;
    const total = state.items.length;
    const tabsHtml = state.items.map((item, idx) => {
      const isActive = item.id === state.activeItemId;
      return `
      <button class="obfusca-multi-tab" data-item-id="${escapeHtml(item.id)}" style="
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: ${isActive ? S.colors.card : "transparent"};
        border: ${isActive ? `1px solid ${S.colors.border}` : "1px solid transparent"};
        border-radius: ${S.radius.sm};
        cursor: pointer;
        transition: all ${S.transitions.fast};
        font-family: ${S.fonts.sans};
        font-size: 11px;
        color: ${isActive ? S.colors.foreground : S.colors.mutedForeground};
        white-space: nowrap;
        flex-shrink: 0;
        opacity: ${item.status === "skipped" ? "0.5" : "1"};
      ">
        ${renderStatusIndicator(item.status)}
        <span style="display: flex; align-items: center; flex-shrink: 0;">${renderItemTypeIcon(item.type)}</span>
        <span style="
          max-width: 100px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: ${isActive ? "500" : "400"};
        ">${escapeHtml(truncate(item.name, 20))}</span>
        <span style="
          font-size: 9px;
          color: ${S.colors.mutedForeground};
          opacity: 0.7;
        ">${idx + 1}/${total}</span>
      </button>
    `;
    }).join("");
    const shieldIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${S.colors.success}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`;
    return `
    <div style="
      padding: 8px 16px;
      background: ${S.colors.background};
      border-bottom: 1px solid ${S.colors.border};
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
      overflow: hidden;
    ">
      <div style="
        display: flex;
        align-items: center;
        gap: 4px;
        overflow-x: auto;
        flex: 1;
        min-width: 0;
        scrollbar-width: thin;
      ">
        ${tabsHtml}
      </div>
      <div style="
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        color: ${S.colors.mutedForeground};
        flex-shrink: 0;
        padding-left: 8px;
        border-left: 1px solid ${S.colors.border};
        margin-left: 4px;
      ">
        ${shieldIcon}
        <span style="white-space: nowrap; font-weight: 500; color: ${protectedCount === total ? S.colors.success : S.colors.mutedForeground};">${protectedCount}/${total} protected</span>
      </div>
    </div>
  `;
  }
  function renderMultiItemHeader(state) {
    const S = OBFUSCA_STYLES;
    const total = state.items.length;
    const effectiveMode = getEffectivePopupMode(state.items);
    const pendingCount = state.items.filter((i) => i.status === "pending").length;
    const isBlockMode = effectiveMode === "block";
    let title;
    let subtitle;
    let accentColor;
    let headerBg;
    let shieldIcon;
    if (isBlockMode) {
      const blockedCount = state.items.filter((i) => i.response && i.response.action === "block").length;
      title = "Sensitive Content Blocked";
      subtitle = `${total} item${total !== 1 ? "s" : ""} • ${blockedCount} blocked`;
      accentColor = S.colors.destructive;
      headerBg = `${S.colors.destructive}14`;
      shieldIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <line x1="8" y1="8" x2="16" y2="16"/><line x1="16" y1="8" x2="8" y2="16"/>
    </svg>`;
    } else {
      title = "Sensitive Content Detected";
      subtitle = `${total} item${total !== 1 ? "s" : ""} • ${pendingCount} require review`;
      accentColor = S.colors.warning;
      headerBg = `${S.colors.warning}14`;
      shieldIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>`;
    }
    return `
    <div style="
      padding: 10px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: ${headerBg};
      border-bottom: 1px solid ${accentColor}20;
      flex-shrink: 0;
    ">
      <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
        <div style="
          width: 30px;
          height: 30px;
          background: ${accentColor}15;
          border-radius: ${S.radius.md};
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: ${accentColor};
        ">
          ${shieldIcon}
        </div>
        <div style="min-width: 0;">
          <div style="
            font-size: 13px;
            font-weight: 600;
            color: ${S.colors.foreground};
            letter-spacing: -0.01em;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          ">${escapeHtml(title)}</div>
          <div style="
            font-size: 11px;
            color: ${S.colors.mutedForeground};
            margin-top: 1px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          ">${escapeHtml(subtitle)}</div>
        </div>
      </div>
      <button id="obfusca-multi-popup-close" aria-label="Close" style="
        background: transparent;
        border: none;
        border-radius: ${S.radius.sm};
        width: 26px;
        height: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: ${S.colors.mutedForeground};
        flex-shrink: 0;
        transition: all ${S.transitions.fast};
      "
        onmouseover="this.style.background='${S.colors.muted}';this.style.color='${S.colors.foreground}'"
        onmouseout="this.style.background='transparent';this.style.color='${S.colors.mutedForeground}'"
      >
        ${ICON_X}
      </button>
    </div>
  `;
  }
  function renderMultiItemContent(activeItem, state) {
    const S = OBFUSCA_STYLES;
    if (!activeItem.mappings || activeItem.mappings.length === 0) {
      return `
      <div style="
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        color: ${S.colors.mutedForeground};
        font-size: 12px;
        font-family: ${S.fonts.sans};
      ">No detections for this item.</div>
    `;
    }
    const leftPanelHtml = renderMultiItemDetectionList(activeItem, state);
    const rightPanelHtml = renderMultiItemPreview(activeItem, state);
    return `
    <div style="
      flex: 1;
      display: grid;
      grid-template-columns: 320px 1fr;
      min-height: 0;
      overflow: hidden;
    ">
      <!-- Left panel: detection list -->
      <div style="
        overflow-y: auto;
        overflow-x: hidden;
        border-right: 1px solid ${S.colors.border};
        background: ${S.colors.card};
      ">
        ${leftPanelHtml}
      </div>
      <!-- Right panel: preview -->
      <div style="
        display: flex;
        flex-direction: column;
        overflow: hidden;
        min-height: 0;
        background: ${S.colors.background};
      ">
        ${rightPanelHtml}
      </div>
    </div>
  `;
  }
  function renderMultiItemDetectionList(item, state) {
    const mappings = item.mappings || [];
    if (mappings.length === 0) {
      return `<div style="padding: 16px; color: ${OBFUSCA_STYLES.colors.mutedForeground}; text-align: center;">No detections found</div>`;
    }
    if (!state.redactionChoices) {
      state.redactionChoices = /* @__PURE__ */ new Map();
    }
    const S = OBFUSCA_STYLES;
    const currentGlobalMode = state.globalRedactMode || "mask";
    let html = `
    <div style="display: flex; flex-direction: column; height: 100%;">
      <!-- Detection Header with Global Toggle -->
      <div style="
        padding: 8px 12px;
        border-bottom: 1px solid ${S.colors.border};
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      ">
        <span style="font-size: 11px; font-weight: 600; color: ${S.colors.mutedForeground}; text-transform: uppercase; letter-spacing: 0.5px;">
          ${mappings.length} Detection${mappings.length !== 1 ? "s" : ""}
        </span>
        <div style="display: flex; gap: 2px; background: ${S.colors.secondary}; border-radius: 4px; padding: 2px;">
          <button class="obfusca-global-mode-btn" data-mode="mask" style="
            padding: 3px 8px; border-radius: 3px; border: none; cursor: pointer;
            font-size: 10px; font-weight: 500; transition: all 0.15s;
            font-family: ${S.fonts.sans};
            ${currentGlobalMode === "mask" ? `background: ${S.colors.info}; color: #fff;` : `background: transparent; color: ${S.colors.mutedForeground};`}
          ">Mask All</button>
          <button class="obfusca-global-mode-btn" data-mode="dummy" style="
            padding: 3px 8px; border-radius: 3px; border: none; cursor: pointer;
            font-size: 10px; font-weight: 500; transition: all 0.15s;
            font-family: ${S.fonts.sans};
            ${currentGlobalMode === "dummy" ? `background: #10b981; color: #000;` : `background: transparent; color: ${S.colors.mutedForeground};`}
          ">Smart Replace</button>
        </div>
      </div>

      <!-- Detection Items -->
      <div style="flex: 1; overflow-y: auto; padding: 4px 0;">
  `;
    mappings.forEach((mapping, index) => {
      var _a;
      const choice = (_a = state.redactionChoices) == null ? void 0 : _a.get(index);
      const isEnabled = (choice == null ? void 0 : choice.enabled) !== false;
      const mode = (choice == null ? void 0 : choice.mode) || currentGlobalMode;
      let replacementValue = "";
      if (mode === "mask") {
        replacementValue = mapping.masked_value || mapping.placeholder || `[${mapping.type.toUpperCase()}_REDACTED]`;
      } else if (mode === "dummy") {
        replacementValue = mapping.dummy_value || mapping.original_preview || "***";
      }
      if (choice == null ? void 0 : choice.customValue) {
        replacementValue = choice.customValue;
      }
      const replacementBg = mode === "mask" ? "rgba(168, 85, 247, 0.15)" : "rgba(16, 185, 129, 0.15)";
      const replacementBorder = mode === "mask" ? "rgba(168, 85, 247, 0.3)" : "rgba(16, 185, 129, 0.3)";
      html += `
      <div class="obfusca-detection-item" data-index="${index}" style="
        padding: 8px 12px;
        border-bottom: 1px solid ${S.colors.border}22;
        display: flex;
        flex-direction: column;
        gap: 4px;
        opacity: ${isEnabled ? "1" : "0.4"};
        transition: all 0.15s;
        cursor: pointer;
        position: relative;
      ">
        <!-- Row 1: Checkbox + Type + Original Preview + Controls -->
        <div style="display: flex; align-items: center; gap: 8px;">
          <!-- Checkbox -->
          <input type="checkbox" class="obfusca-detection-checkbox" data-index="${index}"
            ${isEnabled ? "checked" : ""}
            style="
              width: 14px; height: 14px; cursor: pointer;
              accent-color: ${S.colors.info};
              flex-shrink: 0;
            "
          />

          <!-- Type Badge (prefer display_name for semantic detections) -->
          <span style="
            font-size: 9px; font-weight: 600; text-transform: uppercase;
            padding: 2px 6px; border-radius: 3px;
            background: ${S.colors.info}22;
            color: ${S.colors.info};
            letter-spacing: 0.5px;
            flex-shrink: 0;
          ">${escapeHtml(mapping.display_name || mapping.type.split("__")[0].replace(/_/g, " "))}</span>

          <!-- Original Value (extracted from content using positions when available) -->
          <span style="
            font-size: 11px; color: ${S.colors.mutedForeground};
            font-family: ${S.fonts.mono};
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            flex: 1;
          ">${escapeHtml(
        mapping.start != null && mapping.end != null && item.content ? item.content.substring(mapping.start, mapping.end) : mapping.original_preview || "***"
      )}</span>

          <!-- Per-item Mode Toggle -->
          <div style="display: flex; gap: 1px; flex-shrink: 0;">
            <button class="obfusca-item-mode-btn" data-index="${index}" data-mode="mask" title="Mask" style="
              width: 20px; height: 18px; border: none; cursor: pointer; border-radius: 2px 0 0 2px;
              font-size: 9px; font-weight: 600; transition: all 0.15s;
              font-family: ${S.fonts.sans};
              ${mode === "mask" ? `background: ${S.colors.info}; color: #fff;` : `background: ${S.colors.secondary}; color: ${S.colors.mutedForeground};`}
            ">M</button>
            <button class="obfusca-item-mode-btn" data-index="${index}" data-mode="dummy" title="Smart Replace" style="
              width: 20px; height: 18px; border: none; cursor: pointer; border-radius: 0 2px 2px 0;
              font-size: 9px; font-weight: 600; transition: all 0.15s;
              font-family: ${S.fonts.sans};
              ${mode === "dummy" ? `background: #10b981; color: #000;` : `background: ${S.colors.secondary}; color: ${S.colors.mutedForeground};`}
            ">D</button>
          </div>

          <!-- Edit Button -->
          <button class="obfusca-edit-btn" data-index="${index}" title="Custom value" style="
            width: 20px; height: 18px; border: none; cursor: pointer; border-radius: 2px;
            background: transparent; color: ${S.colors.mutedForeground};
            font-size: 11px; transition: all 0.15s; flex-shrink: 0;
            font-family: ${S.fonts.sans};
            opacity: 0;
          ">&#x270E;</button>
        </div>

        <!-- Row 2: Replacement Preview -->
        ${isEnabled && replacementValue ? `
          <div style="
            margin-left: 22px;
            padding: 3px 8px;
            background: ${replacementBg};
            border: 1px solid ${replacementBorder};
            border-radius: 3px;
            font-size: 10px;
            font-family: ${S.fonts.mono};
            color: ${S.colors.foreground};
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          ">&rarr; ${escapeHtml(replacementValue)}</div>
        ` : ""}
      </div>
    `;
    });
    html += `
      </div>
    </div>
  `;
    return html;
  }
  function renderMultiItemPreview(item, state) {
    const S = OBFUSCA_STYLES;
    const content = item.content || "";
    const isFile = item.type === "file";
    const fileName = isFile ? item.name : "Untitled";
    const mappings = item.mappings || [];
    const viewMode = state.previewViewMode || "highlighted";
    let previewContent = "";
    if (viewMode === "original") {
      previewContent = escapeHtml(content);
    } else if (viewMode === "highlighted" && mappings.length > 0) {
      previewContent = renderContentWithHighlights(content, mappings, state);
    } else if (viewMode === "protected") {
      previewContent = escapeHtml(buildProtectedText(content, mappings, state));
    } else {
      previewContent = escapeHtml(content);
    }
    const fileTypeInfo = detectFileType(isFile ? fileName : null, !isFile);
    const icon = fileTypeInfo.icon;
    const label = isFile ? fileName : "AI Text Input";
    const copyIcon = getGenericIcon("copy");
    return `
    <div style="display: flex; flex-direction: column; height: 100%; background: ${S.colors.background};">
      <!-- Preview Header -->
      <div style="
        padding: 6px 12px;
        border-bottom: 1px solid ${S.colors.border};
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
        background: ${S.colors.secondary};
      ">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="display: flex; align-items: center;">${icon}</span>
          <span style="font-size: 11px; font-weight: 500; color: ${S.colors.foreground};">${escapeHtml(label)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          <!-- View mode radio toggles -->
          <div style="display: flex; gap: 2px; background: ${S.colors.background}; border-radius: 4px; padding: 2px;">
            <button class="obfusca-view-mode-btn" data-mode="original" style="
              padding: 2px 6px; border-radius: 3px; border: none; cursor: pointer;
              font-size: 9px; transition: all 0.15s;
              font-family: ${S.fonts.sans};
              ${viewMode === "original" ? `background: ${S.colors.mutedForeground}; color: ${S.colors.background};` : `background: transparent; color: ${S.colors.mutedForeground};`}
            ">Original</button>
            <button class="obfusca-view-mode-btn" data-mode="highlighted" style="
              padding: 2px 6px; border-radius: 3px; border: none; cursor: pointer;
              font-size: 9px; transition: all 0.15s;
              font-family: ${S.fonts.sans};
              ${viewMode === "highlighted" ? `background: ${S.colors.mutedForeground}; color: ${S.colors.background};` : `background: transparent; color: ${S.colors.mutedForeground};`}
            ">Highlighted</button>
            <button class="obfusca-view-mode-btn" data-mode="protected" style="
              padding: 2px 6px; border-radius: 3px; border: none; cursor: pointer;
              font-size: 9px; transition: all 0.15s;
              font-family: ${S.fonts.sans};
              ${viewMode === "protected" ? `background: ${S.colors.mutedForeground}; color: ${S.colors.background};` : `background: transparent; color: ${S.colors.mutedForeground};`}
            ">Protected</button>
          </div>

          <!-- Copy Button -->
          <button class="obfusca-preview-copy-btn" title="Copy" style="
            width: 24px; height: 20px; border: none; cursor: pointer; border-radius: 3px;
            background: transparent; color: ${S.colors.mutedForeground};
            font-size: 12px; transition: all 0.15s;
            display: flex; align-items: center; justify-content: center;
          ">${copyIcon}</button>
        </div>
      </div>

      <!-- Preview Content -->
      <div class="obfusca-code-preview" style="
        flex: 1;
        overflow: auto;
        padding: 12px;
        font-family: ${S.fonts.mono};
        font-size: 11px;
        line-height: 1.6;
        color: ${S.colors.foreground};
        white-space: pre-wrap;
        word-break: break-word;
      ">${previewContent}</div>
    </div>
  `;
  }
  function buildProtectedText(content, mappings, state) {
    var _a;
    if (!mappings || mappings.length === 0) return content;
    const sortedMappings = mappings.map((m, i) => ({ ...m, _idx: i })).filter((m) => m.start !== void 0 && m.end !== void 0).sort((a, b) => a.start - b.start);
    let result = "";
    let lastEnd = 0;
    for (const mapping of sortedMappings) {
      const choice = (_a = state.redactionChoices) == null ? void 0 : _a.get(mapping._idx);
      const isEnabled = (choice == null ? void 0 : choice.enabled) !== false;
      const mode = (choice == null ? void 0 : choice.mode) || state.globalRedactMode || "mask";
      if (mapping.start > lastEnd) {
        result += content.substring(lastEnd, mapping.start);
      }
      if (isEnabled) {
        let replacementText = "";
        if (choice == null ? void 0 : choice.customValue) {
          replacementText = choice.customValue;
        } else if (mode === "mask") {
          replacementText = mapping.masked_value || mapping.placeholder || `[${mapping.type.toUpperCase()}_REDACTED]`;
        } else {
          replacementText = mapping.dummy_value || content.substring(mapping.start, mapping.end);
        }
        result += replacementText;
      } else {
        result += content.substring(mapping.start, mapping.end);
      }
      lastEnd = mapping.end;
    }
    if (lastEnd < content.length) {
      result += content.substring(lastEnd);
    }
    return result;
  }
  function renderContentWithHighlights(content, mappings, state) {
    var _a;
    if (!mappings || mappings.length === 0) {
      return escapeHtml(content);
    }
    const sortedMappings = mappings.map((m, i) => ({ ...m, _idx: i })).filter((m) => m.start !== void 0 && m.end !== void 0).sort((a, b) => a.start - b.start);
    let result = "";
    let lastEnd = 0;
    for (const mapping of sortedMappings) {
      const choice = (_a = state.redactionChoices) == null ? void 0 : _a.get(mapping._idx);
      const isEnabled = (choice == null ? void 0 : choice.enabled) !== false;
      const mode = (choice == null ? void 0 : choice.mode) || state.globalRedactMode || "mask";
      if (mapping.start > lastEnd) {
        result += escapeHtml(content.substring(lastEnd, mapping.start));
      }
      const originalText = content.substring(mapping.start, mapping.end);
      if (isEnabled) {
        let replacementText = "";
        if (choice == null ? void 0 : choice.customValue) {
          replacementText = choice.customValue;
        } else if (mode === "mask") {
          replacementText = mapping.masked_value || mapping.placeholder || `[${mapping.type.toUpperCase()}_REDACTED]`;
        } else {
          replacementText = mapping.dummy_value || originalText;
        }
        const highlightColor = mode === "mask" ? "rgba(168, 85, 247, 0.25)" : "rgba(16, 185, 129, 0.25)";
        const borderColor = mode === "mask" ? "rgba(168, 85, 247, 0.5)" : "rgba(16, 185, 129, 0.5)";
        result += `<mark style="
        background: ${highlightColor};
        border-bottom: 2px solid ${borderColor};
        border-radius: 2px;
        padding: 0 2px;
        color: inherit;
      " title="Original: ${escapeHtml(mapping.original_preview || "***")}">${escapeHtml(replacementText)}</mark>`;
      } else {
        result += `<span style="opacity: 0.5; text-decoration: line-through;">${escapeHtml(originalText)}</span>`;
      }
      lastEnd = mapping.end;
    }
    if (lastEnd < content.length) {
      result += escapeHtml(content.substring(lastEnd));
    }
    return result;
  }
  function renderMultiItemFooter(state) {
    const S = OBFUSCA_STYLES;
    const activeItem = state.items.find((i) => i.id === state.activeItemId);
    const activeIndex = state.items.findIndex((i) => i.id === state.activeItemId);
    const total = state.items.length;
    const isFirst = activeIndex <= 0;
    const isLast = activeIndex >= total - 1;
    const pendingItems = state.items.filter((i) => i.status === "pending");
    const isActiveBlocked = activeItem && activeItem.response && activeItem.response.action === "block";
    const isActiveDone = activeItem && activeItem.status !== "pending";
    const effectiveMode = getEffectivePopupMode(state.items);
    const isBlockMode = effectiveMode === "block";
    const isLastPending = pendingItems.length <= 1;
    const primaryLabel = isLastPending ? "Protect & Finish" : "Protect & Next";
    const btnBase = `
    padding: 6px 12px;
    border-radius: ${S.radius.sm};
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all ${S.transitions.base};
    font-family: ${S.fonts.sans};
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    white-space: nowrap;
  `;
    const primaryStyle = `${btnBase}
    background: ${S.colors.foreground};
    color: ${S.colors.background};
    border: none;
  `;
    const secondaryStyle = `${btnBase}
    background: transparent;
    color: ${S.colors.foreground};
    border: 1px solid ${S.colors.border};
  `;
    const dangerOutlineStyle = `${btnBase}
    background: transparent;
    color: ${S.colors.destructive};
    border: 1px solid ${S.colors.destructive}40;
  `;
    const ghostStyle = `${btnBase}
    background: transparent;
    color: ${S.colors.mutedForeground};
    border: none;
  `;
    const disabledStyle = `${btnBase}
    background: ${S.colors.secondary};
    color: ${S.colors.mutedForeground};
    border: 1px solid ${S.colors.border};
    opacity: 0.4;
    cursor: not-allowed;
  `;
    let navigationHtml = "";
    if (total > 1) {
      const prevArrow = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
      const nextArrow = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
      navigationHtml = `
      <div style="display: flex; align-items: center; gap: 2px;">
        <button id="obfusca-multi-prev" ${isFirst ? "disabled" : ""} style="
          ${isFirst ? disabledStyle : ghostStyle}
          padding: 4px 6px;
        ">${prevArrow}</button>
        <span style="
          font-size: 10px;
          color: ${S.colors.mutedForeground};
          min-width: 30px;
          text-align: center;
          font-variant-numeric: tabular-nums;
        ">${activeIndex + 1} / ${total}</span>
        <button id="obfusca-multi-next" ${isLast ? "disabled" : ""} style="
          ${isLast ? disabledStyle : ghostStyle}
          padding: 4px 6px;
        ">${nextArrow}</button>
      </div>
    `;
    }
    const saveCopyHtml = activeItem && activeItem.type === "file" ? `
    <button id="obfusca-multi-save-copy" style="${ghostStyle}">
      ${ICON_DOWNLOAD} Save Copy
    </button>
  ` : "";
    let actionsHtml = "";
    if (isActiveDone) {
      const statusText = activeItem.status === "protected" ? "Protected" : "Skipped";
      const statusColor = activeItem.status === "protected" ? S.colors.success : S.colors.mutedForeground;
      actionsHtml = `
      <span style="
        font-size: 11px;
        color: ${statusColor};
        font-weight: 500;
        padding: 6px 12px;
      ">${ICON_CHECK} ${statusText}</span>
    `;
    } else {
      actionsHtml += `<button id="obfusca-multi-skip" style="${secondaryStyle}">Skip</button>`;
      if (!isActiveBlocked) {
        if (isBlockMode) {
          const warningIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
          actionsHtml += `<button id="obfusca-multi-bypass" style="${dangerOutlineStyle}">${warningIcon} Send Anyway</button>`;
        } else {
          const warnOutlineStyle = `${btnBase}
          background: transparent;
          color: ${S.colors.warning};
          border: 1px solid ${S.colors.warning}40;
        `;
          actionsHtml += `<button id="obfusca-multi-bypass" data-mode="warn" style="${warnOutlineStyle}">Send Anyway</button>`;
        }
      }
      actionsHtml += `<button id="obfusca-multi-protect" style="${primaryStyle}">${ICON_ENTER} ${escapeHtml(primaryLabel)}</button>`;
    }
    return `
    <div style="
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px;
      border-top: 1px solid ${S.colors.border};
      flex-shrink: 0;
    ">
      <div style="display: flex; align-items: center; gap: 6px;">
        <div style="
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          color: ${S.colors.mutedForeground};
          letter-spacing: 0.2px;
        ">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Protected by Obfusca
        </div>
        <span style="
          font-size: 9px;
          color: ${S.colors.mutedForeground};
          opacity: 0.5;
          margin-left: 4px;
        ">${isBlockMode ? "Enter to protect · Esc to edit" : "Enter to protect · Shift+Enter to send · Esc to edit"}</span>
        ${saveCopyHtml}
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        ${navigationHtml}
        ${actionsHtml}
      </div>
    </div>
  `;
  }
  function showMultiItemPopup(items, callbacks, anchorElement) {
    removeMultiItemPopup();
    removeDetectionPopup();
    injectAnimationStyles();
    injectScrollbarStyles();
    const S = OBFUSCA_STYLES;
    const state = {
      items: [...items],
      activeItemId: items.length > 0 ? items[0].id : "",
      globalMode: "mask"
    };
    const popup = document.createElement("div");
    popup.id = MULTI_POPUP_ID;
    const maxHeightValue = 520;
    popup.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    transform: none;
    z-index: 2147483647;
    font-family: ${S.fonts.sans};
    width: 750px;
    max-width: calc(100vw - 32px);
    max-height: min(${maxHeightValue}px, 70vh);
    display: flex;
    flex-direction: column;
    background: ${S.colors.card};
    border: 1px solid ${S.colors.border};
    border-radius: 16px;
    box-shadow: 0 -4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08);
    overflow: visible;
    animation: ${POPUP_ANIMATION_NAME} 0.18s ease-out forwards;
  `;
    const multiInnerWrapper = document.createElement("div");
    multiInnerWrapper.id = "obfusca-multi-inner";
    multiInnerWrapper.style.cssText = `
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 16px;
    flex: 1;
    min-height: 0;
    max-height: min(${maxHeightValue}px, 70vh);
  `;
    popup.appendChild(multiInnerWrapper);
    document.body.appendChild(popup);
    if (anchorElement) {
      positionBubble(popup, anchorElement);
      const multiPositionInterval = setInterval(() => {
        if (!popup.isConnected || !anchorElement.isConnected) {
          clearInterval(multiPositionInterval);
          return;
        }
        positionBubble(popup, anchorElement);
      }, 100);
      popup.__obfuscaPositionInterval = multiPositionInterval;
    } else {
      popup.style.bottom = "92px";
    }
    const multiOutsideClickHandler = (e) => {
      if (!popup.contains(e.target)) {
        handleClose();
      }
    };
    setTimeout(() => {
      document.addEventListener("mousedown", multiOutsideClickHandler, { capture: false });
      popup.__obfuscaOutsideClickHandler = multiOutsideClickHandler;
    }, 150);
    function render() {
      const activeItem = state.items.find((i) => i.id === state.activeItemId);
      if (!activeItem && state.items.length > 0) {
        state.activeItemId = state.items[0].id;
      }
      const resolvedItem = state.items.find((i) => i.id === state.activeItemId);
      const headerHtml = renderMultiItemHeader(state);
      const tabBarHtml = renderTabBar(state);
      const contentHtml = resolvedItem ? renderMultiItemContent(resolvedItem, state) : `<div style="flex:1;display:flex;align-items:center;justify-content:center;color:${S.colors.mutedForeground};font-size:12px;">No items to review.</div>`;
      const footerHtml = renderMultiItemFooter(state);
      const innerWrapper = document.getElementById("obfusca-multi-inner") || multiInnerWrapper;
      innerWrapper.innerHTML = `
      ${headerHtml}
      ${tabBarHtml}
      ${contentHtml}
      ${footerHtml}
    `;
      attachEventListeners();
    }
    function attachEventListeners() {
      const closeBtn = popup.querySelector("#obfusca-multi-popup-close");
      if (closeBtn) {
        closeBtn.addEventListener("click", handleClose);
      }
      const tabs = popup.querySelectorAll(".obfusca-multi-tab");
      tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
          const itemId = tab.getAttribute("data-item-id");
          if (itemId && itemId !== state.activeItemId) {
            state.activeItemId = itemId;
            render();
          }
        });
        tab.addEventListener("mouseenter", () => {
          const itemId = tab.getAttribute("data-item-id");
          if (itemId !== state.activeItemId) {
            tab.style.background = S.colors.secondary;
          }
        });
        tab.addEventListener("mouseleave", () => {
          const itemId = tab.getAttribute("data-item-id");
          if (itemId !== state.activeItemId) {
            tab.style.background = "transparent";
          }
        });
      });
      const prevBtn = popup.querySelector("#obfusca-multi-prev");
      const nextBtn = popup.querySelector("#obfusca-multi-next");
      if (prevBtn && !prevBtn.hasAttribute("disabled")) {
        prevBtn.addEventListener("click", () => {
          const currentIdx = state.items.findIndex((i) => i.id === state.activeItemId);
          if (currentIdx > 0) {
            state.activeItemId = state.items[currentIdx - 1].id;
            render();
          }
        });
      }
      if (nextBtn && !nextBtn.hasAttribute("disabled")) {
        nextBtn.addEventListener("click", () => {
          const currentIdx = state.items.findIndex((i) => i.id === state.activeItemId);
          if (currentIdx < state.items.length - 1) {
            state.activeItemId = state.items[currentIdx + 1].id;
            render();
          }
        });
      }
      const protectBtn = popup.querySelector("#obfusca-multi-protect");
      if (protectBtn) {
        protectBtn.addEventListener("click", async () => {
          var _a;
          const activeItem = state.items.find((i) => i.id === state.activeItemId);
          if (!activeItem) return;
          protectBtn.style.opacity = "0.5";
          protectBtn.style.cursor = "wait";
          protectBtn.innerHTML = `${ICON_SPINNER} Protecting...`;
          try {
            const currentMode = state.globalRedactMode || "mask";
            if (activeItem.type === "chat" && activeItem.content && activeItem.mappings.length > 0) {
              activeItem.protectedContent = buildProtectedText(
                activeItem.content,
                activeItem.mappings,
                state
              );
              console.log("[Obfusca Multi] Chat protected text computed using mode:", currentMode);
            }
            if (activeItem.type === "file" && activeItem.mappings.length > 0) {
              const extractedText = activeItem.content || "";
              const extractedLength = (_a = activeItem.response) == null ? void 0 : _a.extractedLength;
              if (extractedLength && extractedText.length < extractedLength) {
                console.warn(`[Obfusca Multi] extracted_text truncated: received ${extractedText.length} chars but extractedLength=${extractedLength}. Backend may be truncating the response.`);
              }
              activeItem.protectedReplacements = activeItem.mappings.map((m, idx) => {
                var _a2;
                const choice = (_a2 = state.redactionChoices) == null ? void 0 : _a2.get(idx);
                const isEnabled = (choice == null ? void 0 : choice.enabled) !== false;
                const mode = (choice == null ? void 0 : choice.mode) || currentMode;
                const origVal = resolveOriginalValue$2(m, extractedText);
                if (!origVal) {
                  console.warn(`[Obfusca Multi] Cannot resolve original value for mapping ${idx} (start=${m.start}, end=${m.end}, textLen=${extractedText.length}, extractedLength=${extractedLength || "unknown"})`);
                  return null;
                }
                let replacement;
                if (!isEnabled) {
                  replacement = origVal;
                } else if (choice == null ? void 0 : choice.customValue) {
                  replacement = choice.customValue;
                } else if (mode === "dummy") {
                  replacement = m.dummy_value || m.masked_value || `[${m.type.toUpperCase()}_REDACTED]`;
                } else {
                  replacement = m.masked_value || `[${m.type.toUpperCase()}_REDACTED]`;
                }
                return { original_value: origVal, replacement };
              }).filter((c) => c !== null);
              console.log(`[Obfusca Multi] File replacements computed: ${activeItem.protectedReplacements.length}/${activeItem.mappings.length} using mode: ${currentMode}`);
            }
            await callbacks.onProtectItem(activeItem);
            activeItem.status = "protected";
            advanceToNextPending();
          } catch (_err) {
            render();
          }
        });
        protectBtn.addEventListener("mouseenter", () => {
          protectBtn.style.opacity = "0.9";
          protectBtn.style.transform = "translateY(-1px)";
        });
        protectBtn.addEventListener("mouseleave", () => {
          protectBtn.style.opacity = "1";
          protectBtn.style.transform = "";
        });
      }
      const skipBtn = popup.querySelector("#obfusca-multi-skip");
      if (skipBtn) {
        skipBtn.addEventListener("click", () => {
          const activeItem = state.items.find((i) => i.id === state.activeItemId);
          if (!activeItem) return;
          callbacks.onSkipItem(activeItem);
          activeItem.status = "skipped";
          advanceToNextPending();
        });
        skipBtn.addEventListener("mouseenter", () => {
          skipBtn.style.background = S.colors.secondary;
        });
        skipBtn.addEventListener("mouseleave", () => {
          skipBtn.style.background = "transparent";
        });
      }
      const bypassBtn = popup.querySelector("#obfusca-multi-bypass");
      if (bypassBtn) {
        const isBtnWarnMode = bypassBtn.getAttribute("data-mode") === "warn";
        bypassBtn.addEventListener("click", async () => {
          const activeItem = state.items.find((i) => i.id === state.activeItemId);
          if (!activeItem) return;
          const itemDetections = [];
          const itemMappings = activeItem.mappings || [];
          const summary = buildDetectionSummary(itemDetections, itemMappings);
          if (!isBtnWarnMode) {
            const popupCard = popup.querySelector('[style*="position: relative"]') || popup;
            const confirmed = await showBypassConfirmation(popupCard, summary);
            if (!confirmed) return;
            fireBypassEvent(
              itemDetections,
              itemMappings,
              activeItem.content
            );
          } else {
            fireWarnEvent(
              itemDetections,
              itemMappings,
              activeItem.content
            );
          }
          setBypassFlag();
          callbacks.onBypassItem(activeItem);
          state.items = state.items.filter((i) => i.id !== activeItem.id);
          if (state.items.length === 0) {
            if (!allCompleteAlreadyFired) {
              allCompleteAlreadyFired = true;
              callbacks.onAllComplete([activeItem]);
            }
            removeMultiItemPopup();
            if (isBtnWarnMode) {
              showWarnSentToast();
            }
            return;
          }
          const currentIdx = Math.min(
            state.items.findIndex((i) => i.status === "pending"),
            state.items.length - 1
          );
          state.activeItemId = state.items[Math.max(0, currentIdx)].id;
          render();
        });
        const hoverColor = isBtnWarnMode ? S.colors.warning : S.colors.destructive;
        bypassBtn.addEventListener("mouseenter", () => {
          bypassBtn.style.background = `${hoverColor}15`;
        });
        bypassBtn.addEventListener("mouseleave", () => {
          bypassBtn.style.background = "transparent";
        });
      }
      const saveCopyBtn = popup.querySelector("#obfusca-multi-save-copy");
      if (saveCopyBtn) {
        saveCopyBtn.addEventListener("click", () => {
          saveCopyBtn.textContent = "Saved!";
          setTimeout(() => {
            if (saveCopyBtn) saveCopyBtn.textContent = "Save Copy";
          }, 2e3);
        });
      }
      popup.querySelectorAll(".obfusca-detection-checkbox").forEach((cb) => {
        cb.addEventListener("change", (e) => {
          const idx = parseInt(e.target.dataset.index || "0");
          if (!state.redactionChoices) state.redactionChoices = /* @__PURE__ */ new Map();
          const existing = state.redactionChoices.get(idx) || { enabled: true, mode: state.globalRedactMode || "mask" };
          existing.enabled = e.target.checked;
          state.redactionChoices.set(idx, existing);
          render();
        });
      });
      popup.querySelectorAll(".obfusca-global-mode-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const mode = btn.dataset.mode;
          state.globalRedactMode = mode;
          if (state.redactionChoices) {
            state.redactionChoices.forEach((choice) => {
              if (!choice.customValue) {
                choice.mode = mode;
              }
            });
          }
          render();
        });
      });
      popup.querySelectorAll(".obfusca-item-mode-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.dataset.index || "0");
          const mode = btn.dataset.mode;
          if (!state.redactionChoices) state.redactionChoices = /* @__PURE__ */ new Map();
          const existing = state.redactionChoices.get(idx) || { enabled: true, mode: "mask" };
          existing.mode = mode;
          state.redactionChoices.set(idx, existing);
          render();
        });
      });
      popup.querySelectorAll(".obfusca-edit-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          var _a;
          e.stopPropagation();
          const idx = parseInt(btn.dataset.index || "0");
          const currentChoice = (_a = state.redactionChoices) == null ? void 0 : _a.get(idx);
          const currentValue = (currentChoice == null ? void 0 : currentChoice.customValue) || "";
          const newValue = prompt("Enter custom replacement value:", currentValue);
          if (newValue !== null) {
            if (!state.redactionChoices) state.redactionChoices = /* @__PURE__ */ new Map();
            const existing = state.redactionChoices.get(idx) || { enabled: true, mode: state.globalRedactMode || "mask" };
            existing.customValue = newValue || void 0;
            state.redactionChoices.set(idx, existing);
            render();
          }
        });
      });
      popup.querySelectorAll(".obfusca-view-mode-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.previewViewMode = btn.dataset.mode;
          render();
        });
      });
      const previewCopyBtn = popup.querySelector(".obfusca-preview-copy-btn");
      if (previewCopyBtn) {
        previewCopyBtn.addEventListener("click", async () => {
          const previewEl = popup.querySelector(".obfusca-code-preview");
          if (previewEl) {
            const text = previewEl.textContent || "";
            const copyIcon = getGenericIcon("copy");
            try {
              await navigator.clipboard.writeText(text);
              previewCopyBtn.innerHTML = "✓";
              setTimeout(() => {
                previewCopyBtn.innerHTML = copyIcon;
              }, 2e3);
            } catch {
              const ta = document.createElement("textarea");
              ta.value = text;
              document.body.appendChild(ta);
              ta.select();
              document.execCommand("copy");
              ta.remove();
              previewCopyBtn.innerHTML = "✓";
              setTimeout(() => {
                previewCopyBtn.innerHTML = copyIcon;
              }, 2e3);
            }
          }
        });
      }
      popup.querySelectorAll(".obfusca-detection-item").forEach((item) => {
        item.addEventListener("mouseenter", () => {
          item.style.background = S.colors.secondary;
          const editBtn = item.querySelector(".obfusca-edit-btn");
          if (editBtn) editBtn.style.opacity = "1";
        });
        item.addEventListener("mouseleave", () => {
          item.style.background = "transparent";
          const editBtn = item.querySelector(".obfusca-edit-btn");
          if (editBtn) editBtn.style.opacity = "0";
        });
      });
    }
    let allCompleteAlreadyFired = false;
    function advanceToNextPending() {
      const pendingItems = state.items.filter((i) => i.status === "pending");
      if (pendingItems.length === 0) {
        if (allCompleteAlreadyFired) {
          console.log("[Obfusca Multi] advanceToNextPending: onAllComplete already fired, skipping");
          return;
        }
        allCompleteAlreadyFired = true;
        callbacks.onAllComplete(state.items);
        removeMultiItemPopup();
        return;
      }
      state.activeItemId = pendingItems[0].id;
      render();
    }
    function handleClose() {
      removeMultiItemPopup();
      callbacks.onClose();
    }
    const _prevActiveElement = document.activeElement;
    if (_prevActiveElement instanceof HTMLElement) {
      _prevActiveElement.blur();
    }
    popup.setAttribute("tabindex", "-1");
    popup.focus({ preventScroll: true });
    const keyHandler = (e) => {
      var _a;
      if (document.getElementById(BYPASS_CONFIRM_ID)) return;
      if (e.key === "Escape") {
        handleClose();
        document.removeEventListener("keydown", keyHandler, true);
        return;
      }
      if (e.key === "Enter") {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
          const isObfuscaInput = ((_a = activeEl.id) == null ? void 0 : _a.startsWith("obfusca-")) || activeEl.closest("#" + MULTI_POPUP_ID);
          if (isObfuscaInput) return;
        }
        if (document.getElementById("obfusca-replacement-modal")) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.shiftKey) {
          const currentEffectiveMode = getEffectivePopupMode(state.items);
          if (currentEffectiveMode === "warn") {
            const bypassBtn = popup.querySelector("#obfusca-multi-bypass");
            bypassBtn == null ? void 0 : bypassBtn.click();
          }
        } else {
          const protectBtn = popup.querySelector("#obfusca-multi-protect");
          if (protectBtn && !protectBtn.hasAttribute("disabled")) protectBtn.click();
        }
      }
    };
    document.addEventListener("keydown", keyHandler, true);
    popup.__obfuscaEscHandler = keyHandler;
    popup.__obfuscaPrevFocus = _prevActiveElement;
    render();
    for (const item of state.items) {
      if (!item.content || !item.mappings || item.mappings.length === 0) continue;
      const batchDetections = item.mappings.map((m, i) => ({
        index: i,
        type: m.type || "custom",
        original_value: m.original_preview || m.placeholder,
        display_name: m.display_name
      }));
      console.log(`[Obfusca Multi Batch] Fetching AI dummies for item "${item.name}": ${batchDetections.length} items`);
      generateDummiesBatch(item.content, batchDetections).then((response) => {
        if (!document.getElementById(MULTI_POPUP_ID)) {
          console.log("[Obfusca Multi Batch] Popup dismissed before dummies arrived");
          return;
        }
        if (response && response.success && response.dummies.length > 0) {
          console.log(`[Obfusca Multi Batch] AI dummies received for "${item.name}": ${response.dummies.length} items, source: ${response.source}`);
          for (const dummy of response.dummies) {
            const idx = dummy.index;
            if (idx >= 0 && idx < item.mappings.length && dummy.dummy_value) {
              item.mappings[idx].dummy_value = dummy.dummy_value;
            }
          }
          render();
        } else {
          console.warn(`[Obfusca Multi Batch] AI dummies failed for "${item.name}", applying local fallbacks`);
          for (const m of item.mappings) {
            if (!m.dummy_value || m.dummy_value === m.masked_value) {
              m.dummy_value = getLocalFallbackDummy(m);
            }
          }
          render();
        }
      }).catch((err) => {
        console.error(`[Obfusca Multi Batch] Batch dummy fetch error for "${item.name}":`, err);
        if (document.getElementById(MULTI_POPUP_ID)) {
          for (const m of item.mappings) {
            if (!m.dummy_value || m.dummy_value === m.masked_value) {
              m.dummy_value = getLocalFallbackDummy(m);
            }
          }
          render();
        }
      });
    }
    return popup;
  }
  function removeMultiItemPopup() {
    const existing = document.getElementById(MULTI_POPUP_ID);
    if (!existing) return;
    if (existing) {
      const escHandler = existing.__obfuscaEscHandler;
      if (escHandler) {
        document.removeEventListener("keydown", escHandler, true);
      }
      const outsideClickHandler = existing.__obfuscaOutsideClickHandler;
      if (outsideClickHandler) {
        document.removeEventListener("mousedown", outsideClickHandler, false);
      }
      const positionInterval = existing.__obfuscaPositionInterval;
      if (positionInterval !== void 0) {
        clearInterval(positionInterval);
      }
      const prevFocus = existing.__obfuscaPrevFocus;
      if (prevFocus && typeof prevFocus.focus === "function") {
        try {
          prevFocus.focus({ preventScroll: true });
        } catch (_) {
        }
      }
    }
    if (existing) {
      existing.style.animation = `${POPUP_ANIMATION_OUT_NAME} 0.12s ease-in forwards`;
      setTimeout(() => {
        existing.remove();
      }, 120);
    }
  }
  function isMultiItemPopupVisible() {
    return document.getElementById(MULTI_POPUP_ID) !== null;
  }
  const ANALYSIS_INDICATOR_ID = "obfusca-analysis-indicator";
  function showAnalysisIndicator(anchorElement) {
    removeAnalysisIndicator();
    const container = findVisibleInputContainer(anchorElement);
    const rect = container.getBoundingClientRect();
    const indicator = document.createElement("div");
    indicator.id = ANALYSIS_INDICATOR_ID;
    indicator.style.cssText = `
    position: fixed;
    bottom: ${window.innerHeight - rect.top + 8}px;
    left: ${rect.width >= 400 ? rect.left + "px" : "50%"};
    width: ${rect.width >= 400 ? rect.width + "px" : "750px"};
    max-width: calc(100vw - 32px);
    transform: ${rect.width >= 400 ? "none" : "translateX(-50%)"};
    background: #0a0a0a;
    border: 1px solid #222222;
    border-radius: 16px;
    padding: 14px 20px;
    z-index: 2147483646;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 -4px 24px rgba(0,0,0,0.3);
    overflow: hidden;
  `;
    const icon = document.createElement("div");
    icon.style.cssText = "flex-shrink: 0; display: flex; align-items: center;";
    icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    const text = document.createElement("span");
    text.id = "obfusca-indicator-text";
    text.textContent = "Scanning for sensitive data";
    text.style.cssText = 'color: #666; font-size: 12px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; flex: 1;';
    const dots = document.createElement("span");
    dots.style.cssText = "color: #666; font-size: 12px; font-family: monospace; min-width: 18px;";
    dots.textContent = "";
    let dotCount = 0;
    const dotInterval = window.setInterval(() => {
      dotCount = (dotCount + 1) % 4;
      dots.textContent = ".".repeat(dotCount);
    }, 400);
    indicator.__dotInterval = dotInterval;
    const progressBar = document.createElement("div");
    progressBar.style.cssText = `
    position: absolute;
    bottom: 0;
    left: -100%;
    height: 2px;
    width: 60%;
    background: linear-gradient(90deg, #6366f1, #8b5cf6);
    animation: obfusca-scan-sweep 1.8s ease-in-out infinite;
  `;
    const styleEl = document.createElement("style");
    styleEl.textContent = `
    @keyframes obfusca-scan-sweep {
      0%   { left: -60%; }
      100% { left: 110%; }
    }
  `;
    indicator.appendChild(icon);
    indicator.appendChild(text);
    indicator.appendChild(dots);
    indicator.appendChild(progressBar);
    indicator.appendChild(styleEl);
    document.body.appendChild(indicator);
    const posInterval = window.setInterval(() => {
      if (!indicator.isConnected) {
        clearInterval(posInterval);
        return;
      }
      const r = container.getBoundingClientRect();
      indicator.style.bottom = `${window.innerHeight - r.top}px`;
      if (r.width >= 400) {
        indicator.style.left = `${r.left}px`;
        indicator.style.width = `${r.width}px`;
      }
    }, 100);
    indicator.__posInterval = posInterval;
  }
  function removeAnalysisIndicator() {
    const indicator = document.getElementById(ANALYSIS_INDICATOR_ID);
    if (!indicator) return;
    clearInterval(indicator.__dotInterval);
    clearInterval(indicator.__posInterval);
    indicator.style.opacity = "0";
    indicator.style.transition = "opacity 0.12s ease";
    setTimeout(() => {
      if (indicator.isConnected) indicator.remove();
    }, 130);
  }
  function updateAnalysisIndicatorText(label) {
    const el = document.getElementById("obfusca-indicator-text");
    if (el) el.textContent = label;
  }
  function showIndicatorSuccess() {
    const indicator = document.getElementById(ANALYSIS_INDICATOR_ID);
    if (!indicator) return;
    clearInterval(indicator.__dotInterval);
    clearInterval(indicator.__posInterval);
    const textEl = document.getElementById("obfusca-indicator-text");
    if (textEl) {
      textEl.textContent = "No sensitive data detected";
      textEl.style.color = "#4ade80";
    }
    const spans = indicator.querySelectorAll("span");
    const dotsSpan = spans[spans.length - 1];
    if (dotsSpan) dotsSpan.textContent = " ✓";
    const progressBar = indicator.querySelector('div[style*="animation"]');
    if (progressBar) progressBar.style.display = "none";
    setTimeout(() => {
      if (!indicator.isConnected) return;
      indicator.style.opacity = "0";
      indicator.style.transition = "opacity 0.15s ease";
      setTimeout(() => {
        if (indicator.isConnected) indicator.remove();
      }, 150);
    }, 1e3);
  }
  const BACKEND_URL = API_URL;
  const FILE_ANALYZE_ENDPOINT = `${BACKEND_URL}/files/analyze`;
  const TIMEOUT_MS = 1e4;
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const SUPPORTED_EXTENSIONS = /* @__PURE__ */ new Set([
    // Text
    "txt",
    "md",
    "log",
    "rtf",
    // Config
    "json",
    "xml",
    "yaml",
    "yml",
    "env",
    "ini",
    "toml",
    "conf",
    "cfg",
    "config",
    "plist",
    "dockerfile",
    "gradle",
    // Documents
    "pdf",
    "docx",
    "pptx",
    "odt",
    // Spreadsheets
    "xlsx",
    "xls",
    "csv",
    // Code
    "py",
    "js",
    "ts",
    "jsx",
    "tsx",
    "java",
    "sql",
    "go",
    "rb",
    "php",
    "cs",
    "cpp",
    "c",
    "h",
    "hpp",
    "sh",
    "bash",
    "zsh",
    "ps1",
    "swift",
    "kt",
    "kts",
    "rs",
    "scala",
    "r",
    "m",
    "mm",
    "pl",
    "pm",
    "lua",
    "dart",
    "coffee",
    "less",
    "scss",
    "sass",
    "html",
    "htm",
    "tex",
    "latex",
    "ipynb"
  ]);
  function getFileExtension(filename) {
    const parts = filename.split(".");
    if (parts.length < 2) return "";
    return parts[parts.length - 1].toLowerCase();
  }
  function isSupportedFile(file) {
    const ext = getFileExtension(file.name);
    return SUPPORTED_EXTENSIONS.has(ext);
  }
  function shouldScanFile(file) {
    if (!isSupportedFile(file)) {
      console.log(`[Obfusca FileScanner] Skipping unsupported file: ${file.name}`);
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      console.log(`[Obfusca FileScanner] Skipping large file: ${file.name} (${file.size} bytes)`);
      return false;
    }
    return true;
  }
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = () => {
        reject(new Error("Failed to read file"));
      };
      reader.readAsDataURL(file);
    });
  }
  async function scanFile(file) {
    var _a;
    console.log(`[Obfusca FileScanner] Scanning file: ${file.name} (${file.size} bytes)`);
    if (!isSupportedFile(file)) {
      return {
        error: true,
        message: `Unsupported file type: ${file.name}`,
        code: "unsupported"
      };
    }
    if (file.size > MAX_FILE_SIZE) {
      return {
        error: true,
        message: `File too large: ${file.name} (max ${MAX_FILE_SIZE / (1024 * 1024)}MB)`,
        code: "too_large"
      };
    }
    try {
      console.log(`[Obfusca FileScanner] Converting file to base64...`);
      const contentBase64 = await fileToBase64(file);
      console.log(`[Obfusca FileScanner] Base64 length: ${contentBase64.length}`);
      const body = {
        filename: file.name,
        content_base64: contentBase64
      };
      const headers = {
        "Content-Type": "application/json"
      };
      const accessToken = await getAccessToken();
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
        console.log("[Obfusca FileScanner] Using authenticated request");
      }
      console.log(`[Obfusca FileScanner] Sending to backend: ${FILE_ANALYZE_ENDPOINT}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const response = await fetch(FILE_ANALYZE_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Obfusca FileScanner] Backend error: ${response.status}`, errorText);
        if (response.status === 413) {
          return {
            error: true,
            message: "File too large for server",
            code: "too_large"
          };
        }
        if (response.status === 415) {
          return {
            error: true,
            message: "Unsupported file type",
            code: "unsupported"
          };
        }
        return {
          error: true,
          message: `Server error: ${response.status}`,
          code: "unknown"
        };
      }
      const result = await response.json();
      console.log(`[Obfusca FileScanner] Analysis complete:`, {
        action: result.action,
        detections: ((_a = result.detections) == null ? void 0 : _a.length) || 0,
        fileType: result.file_type,
        typeMismatch: result.type_mismatch || false,
        isDangerous: result.is_dangerous || false
      });
      return {
        requestId: result.request_id,
        filename: result.filename,
        fileType: result.file_type,
        extractedLength: result.extracted_length,
        action: result.action,
        detections: result.detections || [],
        obfuscation: result.obfuscation,
        message: result.message,
        typeMismatch: result.type_mismatch || false,
        typeMismatchWarning: result.type_mismatch_warning || null,
        detectedType: result.detected_type || null,
        isDangerous: result.is_dangerous || false,
        dangerWarning: result.danger_warning || null,
        extractedText: result.extracted_text || null
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error(`[Obfusca FileScanner] Request timed out`);
        return {
          error: true,
          message: "File analysis timed out",
          code: "network"
        };
      }
      console.error(`[Obfusca FileScanner] Error scanning file:`, error);
      return {
        error: true,
        message: error instanceof Error ? error.message : "Unknown error",
        code: "unknown"
      };
    }
  }
  function resolveOriginalValue$1(mapping, extractedText) {
    if (mapping.original_value) return mapping.original_value;
    if (extractedText && typeof mapping.start === "number" && typeof mapping.end === "number" && mapping.start >= 0 && mapping.end > mapping.start && mapping.end <= extractedText.length) {
      return extractedText.slice(mapping.start, mapping.end);
    }
    return null;
  }
  function showToast$1(message, type = "info") {
    var _a;
    (_a = document.getElementById("obfusca-file-toast")) == null ? void 0 : _a.remove();
    const toast = document.createElement("div");
    toast.id = "obfusca-file-toast";
    toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    font-family: ${OBFUSCA_STYLES.fonts.sans};
    animation: obfusca-toast-fade-in 0.3s ease-out;
  `;
    const colors = {
      info: "#2563eb",
      success: OBFUSCA_STYLES.colors.success,
      error: OBFUSCA_STYLES.colors.destructive
    };
    toast.innerHTML = `
    <style>
      @keyframes obfusca-toast-fade-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    </style>
    <div style="
      background: ${OBFUSCA_STYLES.colors.card};
      border: 1px solid ${OBFUSCA_STYLES.colors.border};
      border-left: 3px solid ${colors[type]};
      border-radius: ${OBFUSCA_STYLES.radius.lg};
      padding: 12px 16px;
      font-size: 13px;
      color: ${OBFUSCA_STYLES.colors.foreground};
      box-shadow: ${OBFUSCA_STYLES.shadows.lg};
    ">${message}</div>
  `;
    document.body.appendChild(toast);
    setTimeout(() => {
      if (document.body.contains(toast)) {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.2s";
        setTimeout(() => toast.remove(), 200);
      }
    }, 3e3);
  }
  const pendingAllowedFiles = /* @__PURE__ */ new Map();
  function getFileKey(file) {
    return `${file.name}-${file.size}-${file.lastModified}`;
  }
  function allowFileTemporarily(file) {
    const hash = getFileKey(file);
    const expiresAt = Date.now() + 5e3;
    pendingAllowedFiles.set(hash, expiresAt);
    console.log("[Obfusca Files] File temporarily allowed:", file.name, "expires in 5s");
    setTimeout(() => {
      if (pendingAllowedFiles.get(hash) === expiresAt) {
        pendingAllowedFiles.delete(hash);
        console.log("[Obfusca Files] File allowance expired:", file.name);
      }
    }, 5500);
  }
  function isFileTemporarilyAllowed(file) {
    const hash = getFileKey(file);
    const expiresAt = pendingAllowedFiles.get(hash);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      pendingAllowedFiles.delete(hash);
      return false;
    }
    pendingAllowedFiles.delete(hash);
    console.log("[Obfusca Files] File allowance consumed:", file.name);
    return true;
  }
  function isFileAllowedPeek(file) {
    const hash = getFileKey(file);
    const expiresAt = pendingAllowedFiles.get(hash);
    if (!expiresAt) return false;
    return Date.now() <= expiresAt;
  }
  const bypassedEvents = /* @__PURE__ */ new WeakSet();
  let bypassFileInterception = false;
  function setBypassFileInterception(value) {
    bypassFileInterception = value;
    console.log(`[Obfusca Files] Bypass file interception: ${value}`);
  }
  let pendingFlaggedFiles = null;
  let inFlightScanCount = 0;
  const inFlightWaiters = [];
  function hasInFlightFileScans() {
    return inFlightScanCount > 0;
  }
  function waitForPendingFileScans(timeoutMs) {
    if (inFlightScanCount === 0) {
      return Promise.resolve(consumePendingFlaggedFiles());
    }
    return new Promise((resolve) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        const idx = inFlightWaiters.indexOf(onDone);
        if (idx !== -1) inFlightWaiters.splice(idx, 1);
        resolve(consumePendingFlaggedFiles());
      };
      const onDone = settle;
      inFlightWaiters.push(onDone);
      setTimeout(() => {
        if (!settled) {
          console.warn(`[Obfusca Files] waitForPendingFileScans timed out after ${timeoutMs}ms`);
          settle();
        }
      }, timeoutMs);
    });
  }
  function notifyInFlightWaiters() {
    if (inFlightScanCount > 0) return;
    const waiters = inFlightWaiters.splice(0);
    for (const fn of waiters) fn();
  }
  function hasPendingFlaggedFiles() {
    return pendingFlaggedFiles !== null;
  }
  function consumePendingFlaggedFiles() {
    if (!pendingFlaggedFiles) return null;
    const entry = pendingFlaggedFiles;
    pendingFlaggedFiles = null;
    console.log("[Obfusca Files] Pending flagged files consumed by text interceptor");
    return entry;
  }
  function deferFlaggedFiles(entry) {
    pendingFlaggedFiles = entry;
    console.log(
      `[Obfusca Files] Deferred ${entry.flaggedItems.length} flagged file(s), waiting for submit to merge with text detections`
    );
    showToast$1(
      `${entry.flaggedItems.length} file${entry.flaggedItems.length !== 1 ? "s" : ""} flagged — review will appear when you send your message`,
      "info"
    );
  }
  let captureListenerAttached = false;
  let dropListenerAttached = false;
  function onDocumentFileCapture(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "file") return;
    if (bypassFileInterception) {
      console.log("[Obfusca Files] Bypass active — letting restored file through");
      return;
    }
    if (isBypassActive()) {
      console.log("[Obfusca Files] Submit bypass active — letting files through without scanning");
      return;
    }
    if (bypassedEvents.has(event)) return;
    const files = target.files;
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    console.log(
      `[Obfusca Files] Captured file change: ${fileArray.length} file(s)`,
      fileArray.map((f) => ({ name: f.name, size: f.size, type: f.type }))
    );
    const filesToScan = [];
    for (const f of fileArray) {
      if (isFileTemporarilyAllowed(f)) {
        console.log("[Obfusca Files] Skipping temporarily allowed file:", f.name);
      } else {
        filesToScan.push(f);
      }
    }
    if (filesToScan.length === 0) {
      console.log("[Obfusca Files] All files temporarily allowed, passing through");
      return;
    }
    if (!filesToScan.some((f) => shouldScanFile(f))) {
      console.log("[Obfusca Files] No scannable files, passing through");
      return;
    }
    event.stopImmediatePropagation();
    event.preventDefault();
    console.log("[Obfusca Files] Event blocked synchronously, starting async scan...");
    showToast$1("Scanning file for sensitive data...", "info");
    processInterceptedFiles(target, fileArray, filesToScan);
  }
  async function processInterceptedFiles(input, files, filesToScan) {
    var _a;
    inFlightScanCount++;
    console.log(`[Obfusca Files] In-flight scan started (count=${inFlightScanCount})`);
    const scanSet = filesToScan ? new Set(filesToScan) : null;
    const flaggedItems = [];
    const cleanFiles = [];
    const flaggedMeta = /* @__PURE__ */ new Map();
    for (const file of files) {
      if (scanSet && !scanSet.has(file)) {
        cleanFiles.push(file);
        continue;
      }
      if (!shouldScanFile(file)) {
        cleanFiles.push(file);
        continue;
      }
      console.log(`[Obfusca Files] Scanning: ${file.name}`);
      try {
        const fileBase64 = await fileToBase64(file);
        const result = await scanFile(file);
        if (!result) {
          console.log(`[Obfusca Files] No result for: ${file.name}`);
          cleanFiles.push(file);
          continue;
        }
        if ("error" in result) {
          const scanError = result;
          console.log(`[Obfusca Files] Scan error for ${file.name}: ${scanError.message}`);
          cleanFiles.push(file);
          continue;
        }
        const analysis = result;
        if (analysis.typeMismatch) {
          console.warn(`[Obfusca Files] TYPE MISMATCH: ${file.name} — ${analysis.typeMismatchWarning}`);
        }
        if (analysis.isDangerous) {
          console.warn(`[Obfusca Files] DANGEROUS FILE: ${file.name} — ${analysis.dangerWarning}`);
        }
        if (analysis.action === "block" || analysis.action === "redact") {
          console.log(
            `[Obfusca Files] SENSITIVE: ${file.name}, action=${analysis.action}, detections=${analysis.detections.length}`
          );
          const itemId = `file-${file.name}-${Date.now()}-${flaggedItems.length}`;
          const extractedTextContent = analysis.extractedText || "";
          if (analysis.extractedLength && extractedTextContent.length < analysis.extractedLength) {
            console.warn(
              `[Obfusca Files] WARNING: extracted_text truncated for ${file.name}: received ${extractedTextContent.length} chars but extractedLength=${analysis.extractedLength}. Detections at positions beyond ${extractedTextContent.length} will fail.`
            );
          }
          flaggedItems.push({
            id: itemId,
            type: "file",
            name: file.name,
            status: "pending",
            content: extractedTextContent,
            response: analysis,
            mappings: ((_a = analysis.obfuscation) == null ? void 0 : _a.mappings) || [],
            file,
            fileBase64
          });
          flaggedMeta.set(itemId, { file, fileBase64, analysis });
        } else {
          if (analysis.typeMismatch && analysis.typeMismatchWarning) {
            showToast$1(analysis.typeMismatchWarning, "info");
          }
          console.log(`[Obfusca Files] Clean: ${file.name}`);
          cleanFiles.push(file);
        }
      } catch (err) {
        console.error(`[Obfusca Files] Error scanning ${file.name}:`, err);
        cleanFiles.push(file);
      }
    }
    if (flaggedItems.length === 0) {
      console.log("[Obfusca Files] All files passed, restoring to input...");
      for (const file of files) {
        allowFileTemporarily(file);
      }
      inFlightScanCount = Math.max(0, inFlightScanCount - 1);
      console.log(`[Obfusca Files] In-flight scan complete (clean), count=${inFlightScanCount}`);
      notifyInFlightWaiters();
      restoreFilesAndDispatch(input, files);
      return;
    }
    await Promise.all(
      flaggedItems.map(async (item) => {
        var _a2;
        const meta = flaggedMeta.get(item.id);
        if (!meta) return;
        const hasObfuscation = !!meta.analysis.obfuscation && meta.analysis.obfuscation.mappings.length > 0;
        if (hasObfuscation) {
          await fetchAIDummies(meta.analysis.obfuscation, meta.analysis.extractedText);
          item.mappings = ((_a2 = meta.analysis.obfuscation) == null ? void 0 : _a2.mappings) || [];
        }
      })
    );
    inFlightScanCount = Math.max(0, inFlightScanCount - 1);
    console.log(`[Obfusca Files] In-flight scan complete (flagged), count=${inFlightScanCount}`);
    deferFlaggedFiles({
      flaggedItems,
      flaggedMeta,
      allFiles: files,
      cleanFiles,
      input
    });
    notifyInFlightWaiters();
  }
  function detectPlatform() {
    const hostname = window.location.hostname;
    if (hostname.includes("gemini.google.com") || hostname.includes("bard.google.com")) return "gemini";
    if (hostname.includes("github.com")) return "github-copilot";
    if (hostname.includes("chat.deepseek.com") || hostname.includes("deepseek.com")) return "deepseek";
    if (hostname.includes("chatgpt.com") || hostname.includes("chat.openai.com")) return "chatgpt";
    if (hostname.includes("claude.ai")) return "claude";
    if (hostname.includes("x.com") || hostname.includes("grok")) return "grok";
    if (hostname.includes("copilot.microsoft.com")) return "copilot";
    if (hostname.includes("perplexity.ai")) return "perplexity";
    return "unknown";
  }
  function restoreFilesAndDispatch(input, files) {
    var _a, _b;
    const platform = detectPlatform();
    console.log(`[Obfusca Files] Restoring ${files.length} file(s), platform=${platform}, inputInDOM=${document.contains(input)}`);
    try {
      if (platform === "gemini") {
        console.log("[Obfusca Files] Gemini: Using saved file input approach");
        restoreFileForGemini(files);
        return;
      }
      if (platform === "github-copilot") {
        const imageUploader = document.getElementById("image-uploader");
        if (imageUploader && document.contains(imageUploader)) {
          console.log("[Obfusca Files] GitHub Copilot: Using #image-uploader with React handler");
          restoreFileForGitHubCopilot(imageUploader, files);
          return;
        }
        console.warn("[Obfusca Files] GitHub Copilot: #image-uploader not found, trying fallback");
      }
      if (document.contains(input)) {
        restoreToInput(input, files);
        return;
      }
      console.warn("[Obfusca Files] Input no longer in DOM, searching for fresh input");
      const freshInput = findFreshFileInput(input);
      if (freshInput) {
        console.log("[Obfusca Files] Found fresh file input, using it instead");
        restoreToInput(freshInput, files);
        return;
      }
      console.warn("[Obfusca Files] No file input in DOM — attempting drop event fallback");
      if (restoreFilesViaDrop(files)) return;
      showFileRestoreNotification(((_a = files[0]) == null ? void 0 : _a.name) || "file", files[0]);
    } catch (err) {
      console.error("[Obfusca Files] Failed to restore files:", err);
      showFileRestoreNotification(((_b = files[0]) == null ? void 0 : _b.name) || "file", files[0]);
    }
  }
  function findFreshFileInput(originalInput) {
    const freshInputs = document.querySelectorAll('input[type="file"]');
    for (const fi of freshInputs) {
      if (document.contains(fi) && (fi.accept === originalInput.accept || !originalInput.accept)) {
        return fi;
      }
    }
    if (originalInput.id) {
      const byId = document.getElementById(originalInput.id);
      if (byId && document.contains(byId) && byId.type === "file") {
        return byId;
      }
    }
    for (const fi of freshInputs) {
      if (document.contains(fi)) {
        return fi;
      }
    }
    return null;
  }
  let pageScriptInjected = false;
  function injectPageScript() {
    if (pageScriptInjected) return Promise.resolve(true);
    return new Promise((resolve) => {
      pageScriptInjected = true;
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("pageScripts/reactFileRestore.js");
      script.onload = () => {
        console.log("[Obfusca Files] Page script loaded from extension");
        resolve(true);
      };
      script.onerror = () => {
        console.error("[Obfusca Files] Failed to load page script");
        pageScriptInjected = false;
        resolve(false);
      };
      document.documentElement.appendChild(script);
      setTimeout(() => resolve(false), 2e3);
    });
  }
  function fileToBase64ForPageScript(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const base64 = result.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }
  async function restoreFileForGitHubCopilot(fileInput, files) {
    const file = files[0];
    if (!file) return;
    const loaded = await injectPageScript();
    if (!loaded) {
      console.warn("[Obfusca Files] GitHub Copilot: Page script failed, using native event fallback");
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      const changeEvent = new Event("change", { bubbles: true, cancelable: true });
      bypassedEvents.add(changeEvent);
      fileInput.dispatchEvent(changeEvent);
      return;
    }
    let fileData;
    try {
      fileData = await fileToBase64ForPageScript(file);
    } catch {
      console.error("[Obfusca Files] GitHub Copilot: Failed to convert file to base64");
      showFileRestoreNotification(file.name, file);
      return;
    }
    setBypassFileInterception(true);
    const bypassTimeout = setTimeout(() => {
      setBypassFileInterception(false);
      console.log("[Obfusca Files] GitHub Copilot: Bypass flag cleared (timeout safety)");
    }, 3e3);
    const resultPromise = new Promise((resolve) => {
      const handler = (event) => {
        const detail = event.detail;
        window.removeEventListener("obfusca-restore-result", handler);
        clearTimeout(bypassTimeout);
        setBypassFileInterception(false);
        if (detail == null ? void 0 : detail.success) {
          console.log("[Obfusca Files] GitHub Copilot: File restored via page script");
        } else {
          console.warn(`[Obfusca Files] GitHub Copilot: Page script failed: ${detail == null ? void 0 : detail.error}`);
          showFileRestoreNotification(file.name, file);
        }
        resolve();
      };
      window.addEventListener("obfusca-restore-result", handler);
      setTimeout(() => {
        window.removeEventListener("obfusca-restore-result", handler);
        clearTimeout(bypassTimeout);
        setBypassFileInterception(false);
        console.warn("[Obfusca Files] GitHub Copilot: Timeout waiting for page script");
        resolve();
      }, 3e3);
    });
    window.dispatchEvent(new CustomEvent("obfusca-restore-file", {
      detail: {
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileData
      }
    }));
    await resultPromise;
  }
  async function restoreFileForGemini(files) {
    const file = files[0];
    if (!file) return;
    let fileData;
    try {
      fileData = await fileToBase64ForPageScript(file);
    } catch {
      console.error("[Obfusca Files] Gemini: Failed to convert file to base64");
      showFileRestoreNotification(file.name, file);
      return;
    }
    setBypassFileInterception(true);
    const bypassTimeout = setTimeout(() => {
      setBypassFileInterception(false);
      console.log("[Obfusca Files] Gemini: Bypass flag cleared (timeout safety)");
    }, 5e3);
    const resultPromise = new Promise((resolve) => {
      let settled = false;
      let innerTimeout;
      const handler = (event) => {
        if (settled) return;
        settled = true;
        const detail = event.detail;
        window.removeEventListener("obfusca-gemini-restore-result", handler);
        clearTimeout(bypassTimeout);
        clearTimeout(innerTimeout);
        setBypassFileInterception(false);
        if (detail == null ? void 0 : detail.success) {
          console.log("[Obfusca Files] Gemini: File restored via page script");
        } else {
          console.warn(`[Obfusca Files] Gemini: Page script failed: ${detail == null ? void 0 : detail.error}`);
          showFileRestoreNotification(file.name, file);
        }
        resolve();
      };
      window.addEventListener("obfusca-gemini-restore-result", handler);
      innerTimeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        window.removeEventListener("obfusca-gemini-restore-result", handler);
        clearTimeout(bypassTimeout);
        setBypassFileInterception(false);
        console.warn("[Obfusca Files] Gemini: Timeout waiting for page script");
        showFileRestoreNotification(file.name, file);
        resolve();
      }, 5e3);
    });
    window.dispatchEvent(new CustomEvent("obfusca-gemini-restore-file", {
      detail: {
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileData
      }
    }));
    await resultPromise;
  }
  function showFileRestoreNotification(filename, file) {
    var _a;
    if (!file) {
      showToast$1("File is clean — please re-select to upload", "success");
      return;
    }
    const blobUrl = URL.createObjectURL(file);
    (_a = document.getElementById("obfusca-file-restore-toast")) == null ? void 0 : _a.remove();
    const toast = document.createElement("div");
    toast.id = "obfusca-file-restore-toast";
    toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    z-index: 2147483647;
    font-family: ${OBFUSCA_STYLES.fonts.sans};
    animation: obfusca-toast-fade-in 0.3s ease-out;
    max-width: 340px;
  `;
    toast.innerHTML = `
    <div style="
      background: ${OBFUSCA_STYLES.colors.card};
      border: 1px solid ${OBFUSCA_STYLES.colors.border};
      border-left: 3px solid ${OBFUSCA_STYLES.colors.success};
      border-radius: ${OBFUSCA_STYLES.radius.lg};
      padding: 14px 16px;
      font-size: 13px;
      color: ${OBFUSCA_STYLES.colors.foreground};
      box-shadow: ${OBFUSCA_STYLES.shadows.lg};
      line-height: 1.5;
    ">
      <div style="font-weight: 600; margin-bottom: 6px;">File Protected</div>
      <div style="margin-bottom: 8px;">
        <strong>${filename}</strong> is clean. Re-attach it manually:
      </div>
      <a href="${blobUrl}" download="${filename}" style="
        color: #60a5fa;
        text-decoration: none;
        font-weight: 500;
      ">Download file</a>
    </div>
  `;
    document.body.appendChild(toast);
    setTimeout(() => {
      if (document.body.contains(toast)) {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.3s";
        setTimeout(() => {
          toast.remove();
          URL.revokeObjectURL(blobUrl);
        }, 300);
      }
    }, 1e4);
  }
  function restoreToInput(input, files) {
    const dt = new DataTransfer();
    for (const file of files) {
      dt.items.add(file);
    }
    input.files = dt.files;
    console.log(`[Obfusca Files] Set ${files.length} file(s) on input, dispatching events...`);
    const changeEvent = new Event("change", { bubbles: true, cancelable: true });
    bypassedEvents.add(changeEvent);
    input.dispatchEvent(changeEvent);
    const inputEvent = new Event("input", { bubbles: true, cancelable: true });
    bypassedEvents.add(inputEvent);
    input.dispatchEvent(inputEvent);
    const form = input.closest("form");
    if (form) {
      const formChangeEvent = new Event("change", { bubbles: true, cancelable: true });
      bypassedEvents.add(formChangeEvent);
      form.dispatchEvent(formChangeEvent);
    }
    console.log("[Obfusca Files] Files restored and events dispatched (change + input)");
  }
  function restoreFilesViaDrop(files, targetSelectors) {
    const selectors = [
      "main",
      '[class*="chat" i]',
      '[class*="conversation" i]',
      '[class*="composer" i]',
      '[class*="input" i]',
      "form"
    ];
    let dropTarget = null;
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el instanceof HTMLElement && document.contains(el)) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 100) {
          dropTarget = el;
          break;
        }
      }
    }
    if (!dropTarget) {
      console.warn("[Obfusca Files] No suitable drop target found");
      return false;
    }
    try {
      const dt = new DataTransfer();
      for (const file of files) {
        dt.items.add(file);
      }
      console.log(`[Obfusca Files] Simulating drop on ${dropTarget.tagName}.${(dropTarget.className || "").substring(0, 30)}`);
      const dragEnter = new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt });
      bypassedEvents.add(dragEnter);
      dropTarget.dispatchEvent(dragEnter);
      const dragOver = new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt });
      bypassedEvents.add(dragOver);
      dropTarget.dispatchEvent(dragOver);
      const drop = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt });
      bypassedEvents.add(drop);
      dropTarget.dispatchEvent(drop);
      console.log("[Obfusca Files] Drop event sequence dispatched");
      return true;
    } catch (err) {
      console.error("[Obfusca Files] Drop simulation failed:", err);
      return false;
    }
  }
  function buildFinalFileList(originalFiles, reviewedItems, flaggedMeta) {
    const flaggedOriginalKeys = /* @__PURE__ */ new Set();
    const itemByOriginalKey = /* @__PURE__ */ new Map();
    for (const item of reviewedItems) {
      if (item.file) {
        flaggedOriginalKeys.add(getFileKey(item.file));
        itemByOriginalKey.set(getFileKey(item.file), item);
      }
    }
    const result = [];
    for (const file of originalFiles) {
      const key = getFileKey(file);
      const reviewedItem = itemByOriginalKey.get(key);
      if (!reviewedItem) {
        result.push(file);
        continue;
      }
      switch (reviewedItem.status) {
        case "protected": {
          const meta = flaggedMeta.get(reviewedItem.id);
          if (meta) {
            result.push(meta.file);
          }
          break;
        }
        case "skipped":
          console.log(`[Obfusca Files] Removing skipped file: ${file.name}`);
          break;
        default:
          result.push(file);
          break;
      }
    }
    return result;
  }
  async function fetchAIDummies(obfuscation, extractedText) {
    if (!obfuscation || obfuscation.mappings.length === 0) return;
    const needsDummies = obfuscation.mappings.some(
      (m) => !m.dummy_value || m.dummy_value === m.masked_value
    );
    if (!needsDummies) return;
    const contextText = extractedText || "";
    if (!contextText) {
      console.log("[Obfusca Files] No extracted text available for AI dummies");
      return;
    }
    console.log("[Obfusca Files] Fetching AI-generated dummies for", obfuscation.mappings.length, "mappings...");
    try {
      const detections = obfuscation.mappings.map((m, i) => ({
        index: i,
        type: m.type,
        original_value: m.original_preview,
        // Use preview (backend has the real values)
        display_name: m.display_name || void 0
      }));
      const batchResponse = await generateDummiesBatch(contextText, detections);
      if (batchResponse && batchResponse.success && batchResponse.dummies) {
        console.log("[Obfusca Files] AI dummies received:", batchResponse.dummies.length, "source:", batchResponse.source);
        for (const item of batchResponse.dummies) {
          if (item.index >= 0 && item.index < obfuscation.mappings.length && item.dummy_value) {
            obfuscation.mappings[item.index].dummy_value = item.dummy_value;
          }
        }
      } else {
        console.warn("[Obfusca Files] AI dummy batch returned no results, using fallbacks");
      }
    } catch (error) {
      console.warn("[Obfusca Files] AI dummy generation failed, using fallbacks:", error);
    }
  }
  function triggerFileDownload(filename, base64Content) {
    const binary = atob(base64Content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  async function handleDownloadProtected(filename, fileBase64, choices) {
    const result = await protectFile(
      filename,
      fileBase64,
      choices
    );
    if (result) {
      triggerFileDownload(result.filename, result.content_base64);
      showToast$1(
        `Downloaded ${result.filename} (${result.replacements_applied} item${result.replacements_applied !== 1 ? "s" : ""} redacted)`,
        "success"
      );
    } else {
      showToast$1("File protection failed — try again", "error");
      throw new Error("File protection returned null");
    }
  }
  function onDocumentDropCapture(event) {
    if (bypassedEvents.has(event)) return;
    if (bypassFileInterception) {
      console.log("[Obfusca Files] Drop bypassed (file restore in progress)");
      return;
    }
    if (isBypassActive()) {
      console.log("[Obfusca Files] Drop bypass active — letting files through without scanning");
      return;
    }
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer || !dataTransfer.files || dataTransfer.files.length === 0) return;
    const fileArray = Array.from(dataTransfer.files);
    const allAllowed = fileArray.every((f) => isFileAllowedPeek(f));
    if (allAllowed) {
      console.log("[Obfusca Files] DROP: All files already allowed, skipping scan");
      return;
    }
    if (!fileArray.some((f) => shouldScanFile(f))) return;
    console.log(
      `[Obfusca Files] Captured file drop: ${fileArray.length} file(s)`,
      fileArray.map((f) => ({ name: f.name, size: f.size, type: f.type }))
    );
    processDroppedFiles(fileArray);
  }
  async function processDroppedFiles(files) {
    var _a;
    const flaggedItems = [];
    const flaggedDropMeta = /* @__PURE__ */ new Map();
    for (const file of files) {
      if (!shouldScanFile(file)) continue;
      console.log(`[Obfusca Files] Scanning dropped: ${file.name}`);
      try {
        const fileBase64 = await fileToBase64(file);
        const result = await scanFile(file);
        if (!result) continue;
        if ("error" in result) {
          console.log(`[Obfusca Files] Drop scan error for ${file.name}: ${result.message}`);
          continue;
        }
        const analysis = result;
        if (analysis.typeMismatch) {
          console.warn(`[Obfusca Files] DROP TYPE MISMATCH: ${file.name} — ${analysis.typeMismatchWarning}`);
        }
        if (analysis.action === "block" || analysis.action === "redact") {
          console.log(
            `[Obfusca Files] DROPPED SENSITIVE: ${file.name}, action=${analysis.action}, detections=${analysis.detections.length}`
          );
          const itemId = `drop-${file.name}-${Date.now()}-${flaggedItems.length}`;
          const dropExtractedText = analysis.extractedText || "";
          if (analysis.extractedLength && dropExtractedText.length < analysis.extractedLength) {
            console.warn(
              `[Obfusca Files] WARNING: extracted_text truncated for dropped ${file.name}: received ${dropExtractedText.length} chars but extractedLength=${analysis.extractedLength}. Detections at positions beyond ${dropExtractedText.length} will fail.`
            );
          }
          flaggedItems.push({
            id: itemId,
            type: "file",
            name: file.name,
            status: "pending",
            content: dropExtractedText,
            response: analysis,
            mappings: ((_a = analysis.obfuscation) == null ? void 0 : _a.mappings) || [],
            file,
            fileBase64
          });
          flaggedDropMeta.set(itemId, { file, fileBase64, analysis });
        } else {
          if (analysis.typeMismatch && analysis.typeMismatchWarning) {
            showToast$1(analysis.typeMismatchWarning, "info");
          }
          console.log(`[Obfusca Files] Dropped clean: ${file.name}`);
        }
      } catch (err) {
        console.error(`[Obfusca Files] Error scanning dropped ${file.name}:`, err);
      }
    }
    if (flaggedItems.length === 0) {
      return;
    }
    await Promise.all(
      flaggedItems.map(async (item) => {
        var _a2;
        const meta = flaggedDropMeta.get(item.id);
        if (!meta) return;
        const hasObfuscation = !!meta.analysis.obfuscation && meta.analysis.obfuscation.mappings.length > 0;
        if (hasObfuscation) {
          await fetchAIDummies(meta.analysis.obfuscation, meta.analysis.extractedText);
          item.mappings = ((_a2 = meta.analysis.obfuscation) == null ? void 0 : _a2.mappings) || [];
        }
      })
    );
    if (flaggedItems.length === 1) {
      const item = flaggedItems[0];
      const meta = flaggedDropMeta.get(item.id);
      showDroppedFilePopup(meta.file, meta.fileBase64, meta.analysis);
    } else {
      console.log(`[Obfusca Files] Showing multi-item popup for ${flaggedItems.length} flagged dropped files`);
      showMultiItemPopup(flaggedItems, {
        onProtectItem: async (item) => {
          const meta = flaggedDropMeta.get(item.id);
          if (!meta) {
            console.error(`[Obfusca Files] No metadata for dropped item: ${item.id}`);
            return;
          }
          console.log(`[Obfusca Files] Protecting dropped: ${item.name}`);
          let choices;
          if (item.protectedReplacements) {
            choices = item.protectedReplacements;
          } else {
            const extractedText = item.content || "";
            choices = item.mappings.map((m) => {
              const origVal = resolveOriginalValue$1(m, extractedText);
              if (!origVal) return null;
              return {
                original_value: origVal,
                replacement: m.dummy_value || m.masked_value || `[${m.type.toUpperCase()}_REDACTED]`
              };
            }).filter((c) => c !== null);
          }
          await handleDownloadProtected(meta.file.name, meta.fileBase64, choices);
        },
        onSkipItem: (item) => {
          console.log(`[Obfusca Files] Skipping dropped: ${item.name}`);
        },
        onBypassItem: (item) => {
          console.log(`[Obfusca Files] Bypassing dropped (allow original): ${item.name}`);
          if (item.file) allowFileTemporarily(item.file);
        },
        onAllComplete: (items) => {
          console.log(`[Obfusca Files] All dropped items reviewed`);
          const hasProtected = items.some((i) => i.status === "protected");
          if (hasProtected) {
            showToast$1("Protected files downloaded — please re-upload them manually", "info");
          }
        },
        onClose: () => {
          console.log("[Obfusca Files] Multi-item drop popup closed");
          showToast$1("Please remove the dropped files manually from the chat", "info");
        }
      });
    }
  }
  async function showDroppedFilePopup(file, fileBase64, analysis) {
    const detectionMap = /* @__PURE__ */ new Map();
    for (const d of analysis.detections) {
      const existing = detectionMap.get(d.type);
      if (existing) existing.count++;
      else detectionMap.set(d.type, { type: d.type, displayName: d.type, count: 1 });
    }
    const hasObfuscation = !!analysis.obfuscation && analysis.obfuscation.mappings.length > 0;
    if (hasObfuscation) {
      await fetchAIDummies(analysis.obfuscation, analysis.extractedText);
    }
    showDetectionPopup({
      action: analysis.action === "block" ? "block" : "warn",
      detections: [],
      obfuscation: analysis.obfuscation ?? void 0,
      fileDetections: [{
        fileName: file.name,
        detections: Array.from(detectionMap.values()),
        isClean: false
      }],
      fileProtectionMode: hasObfuscation,
      fileName: file.name,
      fileBase64,
      extractedText: analysis.extractedText ?? void 0,
      onEdit: () => {
        console.log(`[Obfusca Files] Drop edit dismissed: ${file.name}`);
      },
      onSendOriginal: () => {
        console.log(`[Obfusca Files] User allows dropped file: ${file.name}`);
        allowFileTemporarily(file);
      },
      onRemoveFiles: () => {
        console.log(`[Obfusca Files] User wants to remove dropped file: ${file.name}`);
        showToast$1("Please remove the file manually from the chat", "info");
      },
      onDownloadProtected: async (choices) => {
        console.log(`[Obfusca Files] Downloading protected dropped: ${file.name}`);
        await handleDownloadProtected(file.name, fileBase64, choices);
      },
      onDismiss: () => {
        console.log(`[Obfusca Files] Drop popup dismissed: ${file.name}`);
      },
      anchorElement: document.body
    });
  }
  function setupUniversalFileInterception() {
    console.log("[Obfusca Files] Setting up universal file interception (document capture)...");
    cleanupFileInterception();
    document.addEventListener("change", onDocumentFileCapture, { capture: true });
    captureListenerAttached = true;
    document.addEventListener("drop", onDocumentDropCapture, { capture: true });
    dropListenerAttached = true;
    const platform = detectPlatform();
    if (platform === "gemini") {
      const scriptId = "obfusca-gemini-file-restore";
      if (!document.getElementById(scriptId)) {
        const script = document.createElement("script");
        script.id = scriptId;
        script.src = chrome.runtime.getURL("pageScripts/geminiFileRestore.js");
        (document.head || document.documentElement).appendChild(script);
        console.log("[Obfusca Files] Gemini: Injected page script for createElement capture");
      }
    }
    console.log("[Obfusca Files] Document-level capture listeners attached (change + drop)");
  }
  function cleanupFileInterception() {
    if (captureListenerAttached) {
      document.removeEventListener("change", onDocumentFileCapture, { capture: true });
      captureListenerAttached = false;
    }
    if (dropListenerAttached) {
      document.removeEventListener("drop", onDocumentDropCapture, { capture: true });
      dropListenerAttached = false;
    }
    pendingAllowedFiles.clear();
    pendingFlaggedFiles = null;
    console.log("[Obfusca Files] File interception listeners removed");
  }
  function resetAllowedFiles() {
    pendingAllowedFiles.clear();
    pendingFlaggedFiles = null;
    console.log("[Obfusca Files] File allowances cleared");
  }
  function cleanupFileState() {
    pendingFlaggedFiles = null;
    console.log("[Obfusca Files] File state cleaned up after submission");
  }
  const FILE_OVERLAY_ID = "obfusca-file-overlay";
  function hideFileOverlay() {
    const existingOverlay = document.getElementById(FILE_OVERLAY_ID);
    if (existingOverlay) {
      existingOverlay.remove();
      console.log("[Obfusca Files] Overlay removed from DOM");
    }
  }
  function createDOMObserver(options) {
    const {
      target = document.body,
      onMutation,
      debounceMs = 100,
      addedNodesOnly = true
    } = options;
    let observer = null;
    let debounceTimer = null;
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
    const mutationCallback = (mutations) => {
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
          subtree: true
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
      }
    };
  }
  function watchURLChanges(onURLChange, intervalMs = 500) {
    let lastURL = window.location.href;
    const intervalId = setInterval(() => {
      const currentURL = window.location.href;
      if (currentURL !== lastURL) {
        const oldURL = lastURL;
        lastURL = currentURL;
        onURLChange(currentURL, oldURL);
      }
    }, intervalMs);
    const popstateHandler = () => {
      const currentURL = window.location.href;
      if (currentURL !== lastURL) {
        const oldURL = lastURL;
        lastURL = currentURL;
        onURLChange(currentURL, oldURL);
      }
    };
    window.addEventListener("popstate", popstateHandler);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener("popstate", popstateHandler);
    };
  }
  function resolveOriginalValue(mapping, extractedText) {
    if (mapping.original_value) return mapping.original_value;
    if (extractedText && typeof mapping.start === "number" && typeof mapping.end === "number" && mapping.start >= 0 && mapping.end > mapping.start && mapping.end <= extractedText.length) {
      return extractedText.slice(mapping.start, mapping.end);
    }
    return null;
  }
  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.id = "obfusca-toast";
    toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    animation: obfusca-toast-fade-in 0.3s ease-out;
  `;
    const colors = {
      info: "#2563eb",
      success: "#44FF44",
      error: "#FF4444"
    };
    toast.innerHTML = `
    <style>
      @keyframes obfusca-toast-fade-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    </style>
    <div style="
      background: #0A0A0A;
      border: 1px solid #222222;
      border-left: 3px solid ${colors[type]};
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 13px;
      color: #FFFFFF;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    ">${message}</div>
  `;
    document.body.appendChild(toast);
    setTimeout(() => {
      if (document.body.contains(toast)) {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.2s";
        setTimeout(() => toast.remove(), 200);
      }
    }, 3e3);
  }
  const FILE_SCAN_INDICATOR_ID = "obfusca-file-scan-indicator";
  function showFileScanPendingIndicator() {
    var _a;
    (_a = document.getElementById(FILE_SCAN_INDICATOR_ID)) == null ? void 0 : _a.remove();
    const el = document.createElement("div");
    el.id = FILE_SCAN_INDICATOR_ID;
    el.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  `;
    el.innerHTML = `
    <div style="
      background: #0A0A0A;
      border: 1px solid #222222;
      border-left: 3px solid #2563eb;
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 13px;
      color: #FFFFFF;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      gap: 8px;
    ">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;animation:obfusca-spin 1s linear infinite;">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      <style>@keyframes obfusca-spin{to{transform:rotate(360deg)}}</style>
      Scanning attached files...
    </div>
  `;
    document.body.appendChild(el);
  }
  function hideFileScanPendingIndicator() {
    var _a;
    (_a = document.getElementById(FILE_SCAN_INDICATOR_ID)) == null ? void 0 : _a.remove();
  }
  let bypassNextSubmit = false;
  let bypassTimeoutId = null;
  function setBypassFlag() {
    bypassNextSubmit = true;
    if (bypassTimeoutId) {
      clearTimeout(bypassTimeoutId);
    }
    bypassTimeoutId = setTimeout(() => {
      if (bypassNextSubmit) {
        console.log("[Obfusca] Safety: auto-clearing bypassNextSubmit after 5s timeout");
        bypassNextSubmit = false;
      }
      bypassTimeoutId = null;
    }, 5e3);
    console.log("[Obfusca] Bypass flag SET — next submit will skip all scanning");
    window.postMessage(
      { source: "obfusca-content", type: "bypass-next-submit", data: {} },
      "*"
    );
  }
  function consumeBypassFlag() {
    if (!bypassNextSubmit) return false;
    bypassNextSubmit = false;
    if (bypassTimeoutId) {
      clearTimeout(bypassTimeoutId);
      bypassTimeoutId = null;
    }
    console.log("[Obfusca] Bypass flag CONSUMED — this submit skips all scanning");
    return true;
  }
  function isBypassActive() {
    return bypassNextSubmit;
  }
  function buildChatFlaggedItem(text, result) {
    var _a;
    return {
      id: `chat-${Date.now()}`,
      type: "chat",
      name: "Chat Message",
      status: "pending",
      content: text,
      response: result,
      mappings: ((_a = result.obfuscation) == null ? void 0 : _a.mappings) || []
    };
  }
  function showUnifiedPopup(chatItem, fileEntry, callbacks, anchorElement) {
    const allItems = [];
    if (chatItem) allItems.push(chatItem);
    if (fileEntry) allItems.push(...fileEntry.flaggedItems);
    if (allItems.length === 0) {
      console.warn("[Obfusca Unified] showUnifiedPopup called with no items");
      return;
    }
    console.log(`[Obfusca Unified] Showing multi-item popup: ${allItems.length} items (${chatItem ? 1 : 0} chat, ${(fileEntry == null ? void 0 : fileEntry.flaggedItems.length) || 0} files)`);
    try {
      showMultiItemPopup(allItems, {
        onProtectItem: async (item) => {
          if (item.type === "chat") {
            console.log("[Obfusca Unified] Chat item protected (protectedContent set by popup)");
            return;
          }
          if (!fileEntry) return;
          const meta = fileEntry.flaggedMeta.get(item.id);
          if (!meta) {
            console.error(`[Obfusca Unified] No metadata for file item: ${item.id}`);
            return;
          }
          console.log(`[Obfusca Unified] Protecting file: ${item.name}`);
          let choices;
          if (item.protectedReplacements) {
            choices = item.protectedReplacements;
            console.log(`[Obfusca Unified] Using popup-computed replacements (${choices.length} items)`);
          } else {
            const extractedText = item.content || "";
            choices = item.mappings.map((m) => {
              const origVal = resolveOriginalValue(m, extractedText);
              if (!origVal) return null;
              return {
                original_value: origVal,
                replacement: m.dummy_value || m.masked_value || `[${m.type.toUpperCase()}_REDACTED]`
              };
            }).filter((c) => c !== null);
          }
          const result = await protectFile(meta.file.name, meta.fileBase64, choices);
          if (result) {
            const binary = atob(result.content_base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            const protectedFile = new File([bytes], meta.file.name, {
              type: meta.file.type || "application/octet-stream"
            });
            meta.file = protectedFile;
            meta.fileBase64 = result.content_base64;
            showToast(
              `${item.name}: ${result.replacements_applied} item${result.replacements_applied !== 1 ? "s" : ""} redacted`,
              "success"
            );
          } else {
            showToast(`Failed to protect ${item.name}`, "error");
            throw new Error("File protection returned null");
          }
        },
        onSkipItem: (item) => {
          console.log(`[Obfusca Unified] Skipping: ${item.name}`);
        },
        onBypassItem: (item) => {
          if (item.type === "chat") {
            console.log("[Obfusca Unified] Bypassing chat (send original)");
            return;
          }
          console.log(`[Obfusca Unified] Bypassing file (allow original): ${item.name}`);
          if (item.file) allowFileTemporarily(item.file);
        },
        onAllComplete: (items) => {
          var _a, _b, _c;
          console.log("[Obfusca Unified] All items reviewed");
          const chatResult = items.find((i) => i.type === "chat");
          const isGitHubCopilot = window.location.hostname.includes("github.com");
          let finalFiles = null;
          if (fileEntry) {
            const fileItems = items.filter((i) => i.type === "file");
            if (fileItems.length > 0) {
              const built = buildFinalFileList(
                fileEntry.allFiles,
                fileItems,
                fileEntry.flaggedMeta
              );
              if (built.length > 0) {
                finalFiles = built;
              } else {
                console.log("[Obfusca Unified] No files remaining after review");
                if (document.contains(fileEntry.input)) fileEntry.input.value = "";
                showToast("All files removed", "info");
              }
            }
          }
          let protectedText = null;
          if ((chatResult == null ? void 0 : chatResult.status) === "protected") {
            protectedText = chatResult.protectedContent || ((_b = (_a = chatResult.response) == null ? void 0 : _a.obfuscation) == null ? void 0 : _b.obfuscated_text) || null;
          }
          if (isGitHubCopilot && finalFiles && fileEntry && callbacks.onSetContentOnly && callbacks.onSubmitOnly) {
            console.log("[Obfusca Unified] GitHub Copilot: Setting text BEFORE file restore");
            if (protectedText) {
              callbacks.onSetContentOnly(protectedText);
              showToast("Sent with sensitive data replaced", "success");
            } else if ((chatResult == null ? void 0 : chatResult.status) === "skipped") {
              callbacks.onEditText();
              return;
            } else if (chatResult) {
            }
            setTimeout(() => {
              for (const f of finalFiles) allowFileTemporarily(f);
              restoreFilesAndDispatch(fileEntry.input, finalFiles);
              setTimeout(() => {
                console.log("[Obfusca Unified] GitHub Copilot: File processed, triggering submit");
                callbacks.onSubmitOnly();
              }, 1e3);
            }, 300);
            return;
          }
          let hasRestoredFiles = false;
          if (finalFiles && fileEntry) {
            for (const f of finalFiles) allowFileTemporarily(f);
            restoreFilesAndDispatch(fileEntry.input, finalFiles);
            hasRestoredFiles = true;
          }
          const sendChat = () => {
            if (chatResult) {
              if (chatResult.status === "protected") {
                if (protectedText) {
                  console.log(`[Obfusca Unified] Sending protected text (${chatResult.protectedContent ? "mode-aware" : "fallback"})`);
                  callbacks.onSendProtectedText(protectedText);
                } else {
                  console.warn("[Obfusca Unified] Chat marked protected but no obfuscated text found");
                  callbacks.onEditText();
                }
              } else if (chatResult.status === "skipped") {
                callbacks.onEditText();
              } else {
                callbacks.onSendOriginalText(chatResult.content);
              }
            } else {
              console.log("[Obfusca Unified] No chat item — triggering submission for file-only scenario");
              callbacks.onSendOriginalText("");
            }
          };
          if (hasRestoredFiles) {
            (_c = callbacks.onFileRestoreStart) == null ? void 0 : _c.call(callbacks);
            console.log("[Obfusca Unified] Waiting 2000ms for file attachment to be processed");
            setTimeout(() => {
              var _a2;
              (_a2 = callbacks.onFileRestoreEnd) == null ? void 0 : _a2.call(callbacks);
              sendChat();
            }, 2e3);
          } else {
            sendChat();
          }
        },
        onClose: () => {
          console.log("[Obfusca Unified] Multi-item popup closed");
          callbacks.onDismiss();
          if (fileEntry && document.contains(fileEntry.input)) {
            fileEntry.input.value = "";
          }
        }
      }, anchorElement);
    } catch (err) {
      console.error("[Obfusca Unified] CRITICAL: Failed to render multi-item popup:", err);
      callbacks.onDismiss();
    }
  }
  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }
  function createSiteInterceptor(config) {
    const state = {
      isAnalyzing: false,
      lastAnalyzedText: "",
      allowNextSubmit: false,
      allowedContentHash: 0,
      pendingObfuscatedText: null,
      blockPendingAnalysis: false,
      fileRestoreInProgress: false
    };
    function setAllowNextSubmit() {
      state.allowNextSubmit = true;
      const currentInput = config.getInputElement() || inputElement;
      if (currentInput) {
        const currentContent = config.getContent(currentInput);
        state.allowedContentHash = currentContent ? simpleHash(currentContent) : 0;
        console.log(`[Obfusca] Allow next submit set, content hash=${state.allowedContentHash}, length=${currentContent.length}, freshInput=${currentInput !== inputElement}`);
      } else {
        state.allowedContentHash = 0;
      }
    }
    function setAllowNextSubmitFromText(text) {
      state.allowNextSubmit = true;
      state.allowedContentHash = text ? simpleHash(text) : 0;
      console.log(`[Obfusca] Allow next submit set from text, hash=${state.allowedContentHash}, length=${text.length}`);
      setTimeout(() => {
        if (state.allowNextSubmit) {
          console.log("[Obfusca] Auto-resetting allowNextSubmit after atomic submission window (10s)");
        }
        cleanupAfterSubmission();
      }, 1e4);
    }
    async function setContentAndWait(element, content) {
      const result = config.setContent(element, content);
      if (result && typeof result.then === "function") {
        await result;
      }
    }
    async function setContentAndVerify(element, content, maxRetries = 5, checkIntervalMs = 200) {
      const freshElement = config.getInputElement() || element;
      await setContentAndWait(freshElement, content);
      let retries = 0;
      while (retries < maxRetries) {
        await new Promise((r) => setTimeout(r, checkIntervalMs));
        const currentElement = config.getInputElement() || freshElement;
        const current = config.getContent(currentElement);
        if (current.trim() !== content.trim()) {
          retries++;
          console.log(`[Obfusca] Content reverted after setContent, re-applying (attempt ${retries}/${maxRetries})`);
          await setContentAndWait(currentElement, content);
        } else {
          console.log(`[Obfusca] Content verified stable after ${retries > 0 ? retries + " retr" + (retries === 1 ? "y" : "ies") : "initial set"}`);
          return currentElement;
        }
      }
      const finalElement = config.getInputElement() || freshElement;
      console.warn(`[Obfusca] Content may not be stable after ${maxRetries} retries`);
      return finalElement;
    }
    const ANALYSIS_TIMEOUT_MS = 15e3;
    let analysisTimeoutId = null;
    function startAnalysisTimeout() {
      if (analysisTimeoutId) clearTimeout(analysisTimeoutId);
      analysisTimeoutId = setTimeout(() => {
        if (state.isAnalyzing) {
          console.warn("[Obfusca] Safety: Auto-resetting stuck isAnalyzing after timeout");
          endAnalysis();
          state.blockPendingAnalysis = false;
          state.lastAnalyzedText = "";
        }
        analysisTimeoutId = null;
      }, ANALYSIS_TIMEOUT_MS);
    }
    function clearAnalysisTimeout() {
      if (analysisTimeoutId) {
        clearTimeout(analysisTimeoutId);
        analysisTimeoutId = null;
      }
    }
    function endAnalysis() {
      state.isAnalyzing = false;
      clearAnalysisTimeout();
    }
    function cleanupAfterSubmission() {
      console.log(`[Obfusca ${config.name}] Cleaning up submission state for next cycle`);
      state.isAnalyzing = false;
      state.lastAnalyzedText = "";
      state.allowNextSubmit = false;
      state.allowedContentHash = 0;
      state.blockPendingAnalysis = false;
      state.fileRestoreInProgress = false;
      state.pendingObfuscatedText = null;
      savedEditorContent = null;
      clearAnalysisTimeout();
      cleanupFileState();
    }
    let inputElement = null;
    let submitButton = null;
    let observer = null;
    let urlWatcherCleanup = null;
    let listenersAttached = false;
    let savedEditorContent = null;
    const boundHandlers = {};
    function nuclearClearEditor(editor, text) {
      console.log("[Obfusca Claude] NUCLEAR BLOCK - clearing editor temporarily");
      console.log(`[Obfusca Claude] Saving content: ${text.length} chars`);
      savedEditorContent = {
        html: editor.innerHTML,
        text,
        editor
      };
      if (config.clearContent) {
        config.clearContent(editor);
      } else {
        editor.innerHTML = "";
      }
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
      console.log("[Obfusca Claude] Editor cleared - Claude will see empty content");
    }
    function restoreEditorContent() {
      if (!savedEditorContent) {
        console.log("[Obfusca Claude] No saved content to restore");
        return;
      }
      console.log("[Obfusca Claude] Restoring editor content");
      const { html, editor } = savedEditorContent;
      editor.innerHTML = html;
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
      editor.focus();
      savedEditorContent = null;
      console.log("[Obfusca Claude] Editor content restored");
    }
    function discardSavedContent() {
      if (savedEditorContent) {
        console.log("[Obfusca Claude] Discarding saved content permanently");
        savedEditorContent = null;
      }
    }
    function needsNuclearBlocking(_editor) {
      return config.name === "Claude";
    }
    function isAnyPopupVisible() {
      return isDetectionPopupVisible() || isMultiItemPopupVisible() || isBlockOverlayVisible() || isRedactOverlayVisible();
    }
    async function handleSubmissionAttempt(input, button, originalEvent) {
      console.log(`[Obfusca] Submit intercepted: ${(originalEvent == null ? void 0 : originalEvent.type) || "programmatic"}`);
      if (isBypassActive()) {
        console.log("[Obfusca] Bypass flag active — allowing submission without scanning");
        consumeBypassFlag();
        return true;
      }
      if (state.allowNextSubmit) {
        console.log("[Obfusca] User previously allowed this submission, proceeding (not consuming)");
        return true;
      }
      if (isAnyPopupVisible()) {
        console.log("[Obfusca] Popup/overlay already visible, blocking submission");
        originalEvent == null ? void 0 : originalEvent.preventDefault();
        originalEvent == null ? void 0 : originalEvent.stopPropagation();
        return false;
      }
      if (state.pendingObfuscatedText !== null) {
        console.log("[Obfusca] Using pending obfuscated text");
        const obfuscatedText = state.pendingObfuscatedText;
        state.pendingObfuscatedText = null;
        await setContentAndWait(input, obfuscatedText);
        return true;
      }
      const text = config.getContent(input);
      console.log(`[Obfusca] Content extracted: ${text.length} chars`);
      console.log(`[Obfusca] Content preview: "${text.substring(0, 100)}${text.length > 100 ? "..." : ""}"`);
      if (!text.trim()) {
        console.log("[Obfusca] Empty content, allowing submission");
        return true;
      }
      console.log("[Obfusca] Running full detection pipeline (local + backend AI)...");
      originalEvent == null ? void 0 : originalEvent.preventDefault();
      originalEvent == null ? void 0 : originalEvent.stopPropagation();
      if (config.preventSubmit && originalEvent) {
        config.preventSubmit(originalEvent);
      }
      if (state.isAnalyzing) {
        console.log("[Obfusca] Already analyzing, blocking duplicate submission");
        return false;
      }
      if (text === state.lastAnalyzedText) {
        console.log("[Obfusca] Same text as last analysis, blocking");
        return false;
      }
      state.isAnalyzing = true;
      state.lastAnalyzedText = text;
      startAnalysisTimeout();
      showAnalysisIndicator(input);
      try {
        console.log("[Obfusca] Running local detection (built-in + custom patterns)...");
        const localDetections = await detectSensitiveData(text);
        console.log(`[Obfusca] Local detection results: ${localDetections.length} detections found`);
        if (localDetections.length > 0) {
          console.log("[Obfusca] Local detections:", JSON.stringify(localDetections.map((d) => ({
            type: d.type,
            displayName: d.displayName,
            severity: d.severity,
            position: `${d.start}-${d.end}`
          }))));
        }
        console.log("[Obfusca] Running full analysis pipeline (backend + local merge)...");
        const result = await analyze(text, localDetections, window.location.href);
        console.log(`[Obfusca] Analysis complete: source=${result.source}, action=${result.action}, shouldBlock=${result.shouldBlock}`);
        console.log(`[Obfusca] Detection results: ${JSON.stringify(result.detections.map((d) => ({
          type: d.type,
          displayName: d.displayName,
          severity: d.severity
        })))}`);
        let pendingFiles;
        if (hasInFlightFileScans()) {
          console.log("[Obfusca] File scan in progress — holding submit, showing indicator");
          updateAnalysisIndicatorText("Scanning files");
          showFileScanPendingIndicator();
          pendingFiles = await waitForPendingFileScans(3e4);
          hideFileScanPendingIndicator();
          console.log("[Obfusca] File scan wait complete, pendingFiles=", !!pendingFiles);
        } else {
          pendingFiles = consumePendingFlaggedFiles();
        }
        const textHasDetections = result.detections.length > 0 && !(result.simulated && result.wouldHaveBlocked);
        const isMonitor = result.simulated && result.wouldHaveBlocked;
        console.log("[Obfusca] Decision state:", {
          textDetections: result.detections.length,
          textHasDetections,
          isMonitor,
          hasPendingFiles: !!pendingFiles,
          pendingFileCount: (pendingFiles == null ? void 0 : pendingFiles.flaggedItems.length) || 0,
          action: result.action,
          source: result.source
        });
        if (textHasDetections && pendingFiles) {
          console.log("[Obfusca] Both text and files flagged -- showing unified popup");
          removeAnalysisIndicator();
          const chatItem = buildChatFlaggedItem(text, result);
          showUnifiedPopup(chatItem, pendingFiles, {
            onEditText: () => {
              console.log("[Obfusca Unified] User wants to edit");
              endAnalysis();
              state.lastAnalyzedText = "";
            },
            onSendOriginalText: (_origText) => {
              console.log("[Obfusca Unified] User sending original text");
              state.lastAnalyzedText = "";
              if (config.setContentAndSubmit) {
                setAllowNextSubmit();
                showToast("Sent original - be careful!", "info");
                triggerSubmit(button, input);
              } else {
                setAllowNextSubmit();
                showToast("Sent original - be careful!", "info");
                triggerSubmit(button, input);
              }
            },
            onSendProtectedText: async (obfuscatedText) => {
              console.log("[Obfusca Unified] User sending protected text");
              state.lastAnalyzedText = "";
              if (config.setContentAndSubmit) {
                const freshInput = config.getInputElement() || input;
                setAllowNextSubmitFromText(obfuscatedText);
                showToast("Sent with sensitive data replaced", "success");
                await config.setContentAndSubmit(freshInput, obfuscatedText);
              } else {
                const verifiedInput = await setContentAndVerify(input, obfuscatedText);
                setAllowNextSubmit();
                showToast("Sent with sensitive data replaced", "success");
                triggerSubmit(button, verifiedInput);
              }
            },
            onDismiss: () => {
              console.log("[Obfusca Unified] Dismissed");
              endAnalysis();
              state.lastAnalyzedText = "";
            },
            // GitHub Copilot split callbacks: set text without submitting,
            // then submit separately after file restore completes.
            onSetContentOnly: async (text2) => {
              const freshInput = config.getInputElement() || input;
              await setContentAndWait(freshInput, text2);
            },
            onSubmitOnly: () => {
              console.log("[Obfusca GitHub Copilot] Submitting via synthetic Enter keypress");
              const freshInput = config.getInputElement() || input;
              setAllowNextSubmit();
              setTimeout(() => {
                const enterEvent = new KeyboardEvent("keydown", {
                  key: "Enter",
                  code: "Enter",
                  keyCode: 13,
                  which: 13,
                  bubbles: true,
                  cancelable: true
                });
                freshInput.dispatchEvent(enterEvent);
                console.log("[Obfusca GitHub Copilot] Synthetic Enter dispatched on textarea");
              }, 50);
            },
            onFileRestoreStart: () => {
              state.fileRestoreInProgress = true;
            },
            onFileRestoreEnd: () => {
              state.fileRestoreInProgress = false;
            }
          }, input);
          endAnalysis();
          return false;
        }
        if (!textHasDetections && pendingFiles) {
          console.log("[Obfusca] Text clean but files flagged -- showing unified file popup");
          removeAnalysisIndicator();
          showUnifiedPopup(null, pendingFiles, {
            onEditText: () => {
              endAnalysis();
              state.lastAnalyzedText = "";
            },
            onSendOriginalText: () => {
              state.lastAnalyzedText = "";
              setAllowNextSubmit();
              triggerSubmit(button, input);
            },
            onSendProtectedText: () => {
              state.lastAnalyzedText = "";
              setAllowNextSubmit();
              triggerSubmit(button, input);
            },
            onDismiss: () => {
              endAnalysis();
              state.lastAnalyzedText = "";
            },
            onFileRestoreStart: () => {
              state.fileRestoreInProgress = true;
            },
            onFileRestoreEnd: () => {
              state.fileRestoreInProgress = false;
            }
          }, input);
          endAnalysis();
          return false;
        }
        if (result.detections.length > 0) {
          if (isMonitor) {
            console.log(`[Obfusca] MONITOR MODE: Would have ${result.originalAction} - ${result.detections.length} detections`);
            const detectionTypes = [...new Set(result.detections.map((d) => d.displayName))].join(", ");
            console.log(`[Obfusca] MONITOR: Would have blocked/redacted: ${detectionTypes}`);
            endAnalysis();
            showIndicatorSuccess();
            setAllowNextSubmit();
            triggerSubmit(button, input);
            return true;
          }
          console.log(`[Obfusca] Showing unified popup for text-only: ${result.detections.length} detections, action=${result.action}`);
          removeAnalysisIndicator();
          const chatItem = buildChatFlaggedItem(text, result);
          showUnifiedPopup(chatItem, null, {
            onEditText: () => {
              console.log("[Obfusca] User wants to edit message");
              endAnalysis();
              state.lastAnalyzedText = "";
            },
            onSendOriginalText: (_origText) => {
              console.log("[Obfusca] User chose to send original (risky)");
              state.lastAnalyzedText = "";
              if (config.setContentAndSubmit) {
                setAllowNextSubmit();
                showToast("Sent original - be careful!", "info");
                triggerSubmit(button, input);
              } else {
                setAllowNextSubmit();
                showToast("Sent original - be careful!", "info");
                triggerSubmit(button, input);
              }
            },
            onSendProtectedText: async (obfuscatedText) => {
              console.log("[Obfusca] User chose to send obfuscated version");
              state.lastAnalyzedText = "";
              if (config.setContentAndSubmit) {
                const freshInput = config.getInputElement() || input;
                setAllowNextSubmitFromText(obfuscatedText);
                showToast("Sent with sensitive data replaced", "success");
                await config.setContentAndSubmit(freshInput, obfuscatedText);
              } else {
                const verifiedInput = await setContentAndVerify(input, obfuscatedText);
                setAllowNextSubmit();
                showToast("Sent with sensitive data replaced", "success");
                triggerSubmit(button, verifiedInput);
              }
            },
            onDismiss: () => {
              console.log("[Obfusca] User dismissed popup");
              endAnalysis();
              state.lastAnalyzedText = "";
            },
            onFileRestoreStart: () => {
              state.fileRestoreInProgress = true;
            },
            onFileRestoreEnd: () => {
              state.fileRestoreInProgress = false;
            }
          }, input);
          endAnalysis();
          return false;
        }
        console.log("[Obfusca] No blocking/redacting needed, allowing submission");
        endAnalysis();
        showIndicatorSuccess();
        setAllowNextSubmit();
        triggerSubmit(button, input);
        return true;
      } catch (error) {
        console.error(`[Obfusca] Error during analysis:`, error);
        endAnalysis();
        removeAnalysisIndicator();
        console.log("[Obfusca] Error occurred, failing open (allowing submission)");
        return true;
      }
    }
    function triggerSubmit(button, input) {
      const delay = config.submitDelay || 10;
      if (config.triggerSubmit) {
        const freshInput = config.getInputElement() || input;
        console.log(`[Obfusca] triggerSubmit: Using site-specific triggerSubmit (${config.name}), delay=${delay}ms`);
        setTimeout(() => {
          config.triggerSubmit(freshInput);
        }, delay);
      } else {
        const freshButton = config.getSubmitButton() || button;
        if (freshButton && freshButton instanceof HTMLButtonElement) {
          console.log(`[Obfusca] triggerSubmit: Using ${freshButton === button ? "original" : "FRESH"} button, connected=${document.contains(freshButton)}, delay=${delay}ms`);
          setTimeout(() => {
            freshButton.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
            freshButton.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
            freshButton.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
            freshButton.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
            freshButton.click();
          }, delay);
        } else {
          const form = input.closest("form");
          if (form) {
            console.log("[Obfusca] triggerSubmit: No button, using form.requestSubmit()");
            setTimeout(() => {
              form.requestSubmit();
            }, delay);
          } else {
            const freshInput = config.getInputElement() || input;
            console.log("[Obfusca] triggerSubmit: No button/form — simulating Enter key on input");
            setTimeout(() => {
              freshInput.focus();
              const enterDown = new KeyboardEvent("keydown", {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
              });
              freshInput.dispatchEvent(enterDown);
              const enterUp = new KeyboardEvent("keyup", {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
              });
              freshInput.dispatchEvent(enterUp);
            }, delay);
          }
        }
      }
      setTimeout(() => {
        if (state.allowNextSubmit) {
          console.log("[Obfusca] Auto-resetting allowNextSubmit after submission window (10s)");
        }
        cleanupAfterSubmission();
      }, 1e4);
    }
    async function handleSubmissionAttemptWithNuclear(input, button, _originalEvent, capturedText) {
      console.log(`[Obfusca Claude Nuclear] Submit intercepted with nuclear blocking`);
      console.log(`[Obfusca Claude Nuclear] Using captured text: ${capturedText.length} chars`);
      if (isBypassActive()) {
        console.log("[Obfusca Claude Nuclear] Bypass flag active — restoring content and allowing");
        consumeBypassFlag();
        restoreEditorContent();
        return true;
      }
      if (state.allowNextSubmit) {
        console.log("[Obfusca Claude Nuclear] User previously allowed, restoring and proceeding (not consuming)");
        restoreEditorContent();
        triggerSubmit(button, input);
        return true;
      }
      if (isAnyPopupVisible()) {
        console.log("[Obfusca Claude Nuclear] Popup/overlay already visible, keeping content cleared");
        return false;
      }
      if (!capturedText.trim()) {
        console.log("[Obfusca Claude Nuclear] Empty content, restoring and allowing submission");
        restoreEditorContent();
        return true;
      }
      if (state.isAnalyzing) {
        console.log("[Obfusca Claude Nuclear] Already analyzing, keeping content cleared");
        return false;
      }
      if (capturedText === state.lastAnalyzedText) {
        console.log("[Obfusca Claude Nuclear] Same text as last analysis, keeping content cleared");
        return false;
      }
      state.isAnalyzing = true;
      state.lastAnalyzedText = capturedText;
      startAnalysisTimeout();
      showAnalysisIndicator(input);
      try {
        console.log("[Obfusca Claude Nuclear] Running local detection...");
        const localDetections = await detectSensitiveData(capturedText);
        console.log(`[Obfusca Claude Nuclear] Local detection: ${localDetections.length} detections found`);
        console.log("[Obfusca Claude Nuclear] Running full analysis pipeline...");
        const result = await analyze(capturedText, localDetections, window.location.href);
        console.log(`[Obfusca Claude Nuclear] Analysis complete: action=${result.action}, shouldBlock=${result.shouldBlock}`);
        let pendingFiles;
        if (hasInFlightFileScans()) {
          console.log("[Obfusca Claude Nuclear] File scan in progress — holding submit, showing indicator");
          updateAnalysisIndicatorText("Scanning files");
          showFileScanPendingIndicator();
          pendingFiles = await waitForPendingFileScans(3e4);
          hideFileScanPendingIndicator();
          console.log("[Obfusca Claude Nuclear] File scan wait complete, pendingFiles=", !!pendingFiles);
        } else {
          pendingFiles = consumePendingFlaggedFiles();
        }
        const textHasDetections = result.detections.length > 0 && !(result.simulated && result.wouldHaveBlocked);
        const isMonitor = result.simulated && result.wouldHaveBlocked;
        console.log("[Obfusca Nuclear] Decision state:", {
          textDetections: result.detections.length,
          textHasDetections,
          isMonitor,
          hasPendingFiles: !!pendingFiles,
          pendingFileCount: (pendingFiles == null ? void 0 : pendingFiles.flaggedItems.length) || 0,
          action: result.action,
          source: result.source
        });
        if (textHasDetections && pendingFiles) {
          console.log("[Obfusca Claude Nuclear] Both text and files flagged -- showing unified popup");
          removeAnalysisIndicator();
          const chatItem = buildChatFlaggedItem(capturedText, result);
          showUnifiedPopup(chatItem, pendingFiles, {
            onEditText: () => {
              console.log("[Obfusca Claude Nuclear Unified] User wants to edit");
              restoreEditorContent();
              endAnalysis();
              state.lastAnalyzedText = "";
            },
            onSendOriginalText: (_origText) => {
              console.log("[Obfusca Claude Nuclear Unified] Sending original text");
              restoreEditorContent();
              state.lastAnalyzedText = "";
              if (config.setContentAndSubmit) {
                setAllowNextSubmit();
                showToast("Sent original - be careful!", "info");
                triggerSubmit(button, input);
              } else {
                setAllowNextSubmit();
                showToast("Sent original - be careful!", "info");
                triggerSubmit(button, input);
              }
            },
            onSendProtectedText: async (obfuscatedText) => {
              console.log("[Obfusca Claude Nuclear Unified] Sending protected text");
              discardSavedContent();
              state.lastAnalyzedText = "";
              if (config.setContentAndSubmit) {
                const freshInput = config.getInputElement() || input;
                setAllowNextSubmitFromText(obfuscatedText);
                showToast("Sent with sensitive data replaced", "success");
                await config.setContentAndSubmit(freshInput, obfuscatedText);
              } else {
                const verifiedInput = await setContentAndVerify(input, obfuscatedText);
                setAllowNextSubmit();
                showToast("Sent with sensitive data replaced", "success");
                triggerSubmit(button, verifiedInput);
              }
            },
            onDismiss: () => {
              console.log("[Obfusca Claude Nuclear Unified] Dismissed");
              restoreEditorContent();
              endAnalysis();
              state.lastAnalyzedText = "";
            },
            // GitHub Copilot split callbacks (nuclear-aware)
            onSetContentOnly: async (text) => {
              discardSavedContent();
              const freshInput = config.getInputElement() || input;
              await setContentAndWait(freshInput, text);
            },
            onSubmitOnly: () => {
              console.log("[Obfusca GitHub Copilot Nuclear] Submitting via synthetic Enter keypress");
              const freshInput = config.getInputElement() || input;
              setAllowNextSubmit();
              setTimeout(() => {
                const enterEvent = new KeyboardEvent("keydown", {
                  key: "Enter",
                  code: "Enter",
                  keyCode: 13,
                  which: 13,
                  bubbles: true,
                  cancelable: true
                });
                freshInput.dispatchEvent(enterEvent);
                console.log("[Obfusca GitHub Copilot Nuclear] Synthetic Enter dispatched on textarea");
              }, 50);
            },
            onFileRestoreStart: () => {
              state.fileRestoreInProgress = true;
            },
            onFileRestoreEnd: () => {
              state.fileRestoreInProgress = false;
            }
          }, input);
          endAnalysis();
          return false;
        }
        if (!textHasDetections && pendingFiles) {
          console.log("[Obfusca Claude Nuclear] Text clean but files flagged -- showing unified file popup");
          removeAnalysisIndicator();
          showUnifiedPopup(null, pendingFiles, {
            onEditText: () => {
              endAnalysis();
              state.lastAnalyzedText = "";
            },
            onSendOriginalText: () => {
              restoreEditorContent();
              state.lastAnalyzedText = "";
              setAllowNextSubmit();
              triggerSubmit(button, input);
            },
            onSendProtectedText: () => {
              restoreEditorContent();
              state.lastAnalyzedText = "";
              setAllowNextSubmit();
              triggerSubmit(button, input);
            },
            onDismiss: () => {
              restoreEditorContent();
              endAnalysis();
              state.lastAnalyzedText = "";
            },
            onFileRestoreStart: () => {
              state.fileRestoreInProgress = true;
            },
            onFileRestoreEnd: () => {
              state.fileRestoreInProgress = false;
            }
          }, input);
          endAnalysis();
          return false;
        }
        if (result.detections.length > 0) {
          if (isMonitor) {
            console.log(`[Obfusca Claude Nuclear] MONITOR MODE: Restoring content and allowing`);
            restoreEditorContent();
            endAnalysis();
            showIndicatorSuccess();
            setAllowNextSubmit();
            triggerSubmit(button, input);
            return true;
          }
          console.log(`[Obfusca Claude Nuclear] Showing unified popup for text-only: ${result.detections.length} detections, action=${result.action}`);
          removeAnalysisIndicator();
          const chatItem = buildChatFlaggedItem(capturedText, result);
          showUnifiedPopup(chatItem, null, {
            onEditText: () => {
              console.log("[Obfusca Claude Nuclear] User wants to edit - restoring content");
              restoreEditorContent();
              endAnalysis();
              state.lastAnalyzedText = "";
            },
            onSendOriginalText: (_origText) => {
              console.log("[Obfusca Claude Nuclear] User chose original - restoring and submitting");
              restoreEditorContent();
              state.lastAnalyzedText = "";
              if (config.setContentAndSubmit) {
                setAllowNextSubmit();
                showToast("Sent original - be careful!", "info");
                triggerSubmit(button, input);
              } else {
                setAllowNextSubmit();
                showToast("Sent original - be careful!", "info");
                triggerSubmit(button, input);
              }
            },
            onSendProtectedText: async (obfuscatedText) => {
              console.log("[Obfusca Claude Nuclear] User chose obfuscated - setting content and submitting");
              discardSavedContent();
              state.lastAnalyzedText = "";
              if (config.setContentAndSubmit) {
                const freshInput = config.getInputElement() || input;
                setAllowNextSubmitFromText(obfuscatedText);
                showToast("Sent with sensitive data replaced", "success");
                await config.setContentAndSubmit(freshInput, obfuscatedText);
              } else {
                const verifiedInput = await setContentAndVerify(input, obfuscatedText);
                setAllowNextSubmit();
                showToast("Sent with sensitive data replaced", "success");
                triggerSubmit(button, verifiedInput);
              }
            },
            onDismiss: () => {
              console.log("[Obfusca Claude Nuclear] User dismissed popup");
              restoreEditorContent();
              endAnalysis();
              state.lastAnalyzedText = "";
            },
            onFileRestoreStart: () => {
              state.fileRestoreInProgress = true;
            },
            onFileRestoreEnd: () => {
              state.fileRestoreInProgress = false;
            }
          }, input);
          endAnalysis();
          return false;
        }
        console.log("[Obfusca Claude Nuclear] No blocking needed, restoring and allowing");
        restoreEditorContent();
        endAnalysis();
        showIndicatorSuccess();
        setAllowNextSubmit();
        triggerSubmit(button, input);
        return true;
      } catch (error) {
        console.error(`[Obfusca Claude Nuclear] Error during analysis:`, error);
        endAnalysis();
        removeAnalysisIndicator();
        console.log("[Obfusca Claude Nuclear] Error occurred, restoring content and failing open");
        restoreEditorContent();
        return true;
      }
    }
    function shouldBlockEventSync(input) {
      console.log(`[Obfusca ${config.name}] SYNC CHECK START`);
      if (consumeBypassFlag()) {
        console.log(`[Obfusca ${config.name}] SYNC: ALLOWING - bypass flag active (send unprotected)`);
        return false;
      }
      if (input.dataset.obfuscaSyntheticSubmit === "true") {
        console.log(`[Obfusca ${config.name}] SYNC: ALLOWING - Obfusca synthetic submit detected (bypass)`);
        return false;
      }
      if (state.blockPendingAnalysis) {
        console.log(`[Obfusca ${config.name}] SYNC: BLOCKING - analysis in progress`);
        return true;
      }
      if (state.allowNextSubmit) {
        if (state.allowedContentHash !== 0) {
          const currentText = config.getContent(input);
          const currentHash = simpleHash(currentText);
          if (currentHash === state.allowedContentHash) {
            console.log(`[Obfusca ${config.name}] SYNC: ALLOWING - user approved, content matches (hash=${currentHash})`);
            return false;
          }
          console.log(`[Obfusca ${config.name}] SYNC: Content changed since approval (expected=${state.allowedContentHash}, got=${currentHash}), revoking`);
          state.allowNextSubmit = false;
          state.allowedContentHash = 0;
        } else {
          console.log(`[Obfusca ${config.name}] SYNC: ALLOWING - user approved (no hash)`);
          return false;
        }
      }
      if (isAnyPopupVisible()) {
        console.log(`[Obfusca ${config.name}] SYNC: BLOCKING - popup/overlay visible (detection=${isDetectionPopupVisible()}, multi=${isMultiItemPopupVisible()}, block=${isBlockOverlayVisible()}, redact=${isRedactOverlayVisible()})`);
        return true;
      }
      const text = config.getContent(input);
      console.log(`[Obfusca ${config.name}] SYNC: Content length=${text.length}, preview="${text.substring(0, 50)}..."`);
      if (!text.trim()) {
        if (hasPendingFlaggedFiles() || hasInFlightFileScans()) {
          console.log(`[Obfusca ${config.name}] SYNC: BLOCKING - pending/in-flight file scans`);
          return true;
        }
        console.log(`[Obfusca ${config.name}] SYNC: ALLOWING - empty content`);
        return false;
      }
      if (text.trim().length < 20) {
        const hasSensitiveData = mightContainSensitiveDataSync(text);
        if (!hasSensitiveData) {
          if (hasPendingFlaggedFiles() || hasInFlightFileScans()) {
            console.log(`[Obfusca ${config.name}] SYNC: BLOCKING - pending/in-flight file scans`);
            return true;
          }
          console.log(`[Obfusca ${config.name}] SYNC: ALLOWING - short message, no local patterns`);
          return false;
        }
      }
      console.log(`[Obfusca ${config.name}] SYNC: BLOCKING - routing to backend for full analysis`);
      return true;
    }
    function stopEventCompletely(event) {
      console.log(`[Obfusca ${config.name}] stopEventCompletely: Blocking ${event.type} event`);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      console.log(`[Obfusca ${config.name}] stopEventCompletely: Event blocked - defaultPrevented=${event.defaultPrevented}`);
      if (event instanceof KeyboardEvent) {
        Object.defineProperty(event, "defaultPrevented", {
          get: () => true,
          configurable: true
        });
        console.log(`[Obfusca ${config.name}] stopEventCompletely: KeyboardEvent neutralized`);
      }
    }
    function setupKeyboardListener(input) {
      console.log(`[Obfusca] Attaching keydown listener to input: ${input.tagName}#${input.id || "(no id)"}`);
      console.log(`[Obfusca ${config.name}] Event phase: capture=true for early interception`);
      const handleKeydown = (event) => {
        console.log(`[Obfusca ${config.name}] Keydown captured, key: ${event.key}, eventPhase: ${event.eventPhase}, inputConnected=${document.contains(input)}`);
        const shouldSubmit = config.isSubmitKeyCombo ? config.isSubmitKeyCombo(event) : event.key === "Enter" && !event.shiftKey;
        if (!shouldSubmit) {
          return;
        }
        console.log(`[Obfusca ${config.name}] Submit key combo detected (key=${event.key}, shift=${event.shiftKey}, meta=${event.metaKey}, ctrl=${event.ctrlKey})`);
        const text = config.getContent(input);
        const shouldBlock = shouldBlockEventSync(input);
        if (shouldBlock) {
          console.log(`[Obfusca ${config.name}] BLOCKING EVENT SYNCHRONOUSLY`);
          stopEventCompletely(event);
          if (needsNuclearBlocking()) {
            console.log("[Obfusca Claude] Using nuclear blocking (clear editor)");
            nuclearClearEditor(input, text);
          } else {
            console.log(`[Obfusca ${config.name}] Using standard blocking (preventDefault only)`);
          }
          if (!state.isAnalyzing && !isAnyPopupVisible()) {
            state.blockPendingAnalysis = true;
            const currentButton = config.getSubmitButton();
            handleSubmissionAttemptWithNuclear(input, currentButton, event, text).finally(() => {
              state.blockPendingAnalysis = false;
            });
          }
          return;
        }
        console.log(`[Obfusca ${config.name}] Allowing event through`);
      };
      boundHandlers.keydown = handleKeydown;
      input.addEventListener("keydown", boundHandlers.keydown, { capture: true });
      console.log("[Obfusca] Keydown listener attached to input successfully");
      if (input.getAttribute("contenteditable") === "true" || input.classList.contains("ProseMirror")) {
        console.log("[Obfusca] Detected contenteditable/ProseMirror, adding document-level keydown listener");
        console.log(`[Obfusca ${config.name}] Adding beforeinput listener for additional protection`);
        boundHandlers.documentKeydown = (event) => {
          const target = event.target;
          if (!input.contains(target) && target !== input) {
            return;
          }
          console.log(`[Obfusca ${config.name}] Document keydown captured, key: ${event.key}, eventPhase: ${event.eventPhase}`);
          const shouldSubmit = config.isSubmitKeyCombo ? config.isSubmitKeyCombo(event) : event.key === "Enter" && !event.shiftKey;
          if (!shouldSubmit) {
            return;
          }
          console.log(`[Obfusca ${config.name}] Document-level submit key detected (key=${event.key})`);
          const text = config.getContent(input);
          const shouldBlock = shouldBlockEventSync(input);
          if (shouldBlock) {
            console.log(`[Obfusca ${config.name}] BLOCKING EVENT (document level) SYNCHRONOUSLY`);
            stopEventCompletely(event);
            if (needsNuclearBlocking()) {
              console.log("[Obfusca Claude] Using nuclear blocking (clear editor)");
              nuclearClearEditor(input, text);
            } else {
              console.log(`[Obfusca ${config.name}] Using standard blocking (preventDefault only)`);
            }
            if (!state.isAnalyzing && !isAnyPopupVisible()) {
              state.blockPendingAnalysis = true;
              const currentButton = config.getSubmitButton();
              handleSubmissionAttemptWithNuclear(input, currentButton, event, text).finally(() => {
                state.blockPendingAnalysis = false;
              });
            }
            return;
          }
          console.log(`[Obfusca ${config.name}] Allowing document-level event through`);
        };
        window.addEventListener("keydown", boundHandlers.documentKeydown, { capture: true });
        console.log("[Obfusca] Window-level keydown listener attached successfully");
        const beforeInputHandler = (event) => {
          if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
            console.log(`[Obfusca ${config.name}] beforeinput captured: ${event.inputType}, eventPhase: ${event.eventPhase}`);
            const text = config.getContent(input);
            const shouldBlock = shouldBlockEventSync(input);
            if (shouldBlock) {
              console.log(`[Obfusca ${config.name}] BLOCKING beforeinput event SYNCHRONOUSLY`);
              stopEventCompletely(event);
              if (needsNuclearBlocking()) {
                console.log("[Obfusca Claude] Using nuclear blocking (clear editor)");
                nuclearClearEditor(input, text);
              } else {
                console.log(`[Obfusca ${config.name}] Using standard blocking (preventDefault only)`);
              }
              if (!state.isAnalyzing && !isAnyPopupVisible()) {
                console.log(`[Obfusca ${config.name}] beforeinput: Triggering async analysis`);
                state.blockPendingAnalysis = true;
                const currentButton = config.getSubmitButton();
                handleSubmissionAttemptWithNuclear(input, currentButton, event, text).finally(() => {
                  state.blockPendingAnalysis = false;
                });
              }
              return;
            }
          }
        };
        boundHandlers.beforeInput = beforeInputHandler;
        input.addEventListener("beforeinput", beforeInputHandler, { capture: true });
        window.addEventListener("beforeinput", beforeInputHandler, { capture: true });
        console.log("[Obfusca] beforeinput listeners attached for ProseMirror protection");
      }
      const escapeHandler = (event) => {
        if (event.key !== "Escape") return;
        if (state.blockPendingAnalysis) {
          removeAnalysisIndicator();
        }
      };
      document.addEventListener("keydown", escapeHandler, { capture: false });
      input.__obfuscaEscapeHandler = escapeHandler;
    }
    function handleSubmitButtonEvent(event, input, button) {
      console.log(`[Obfusca ${config.name}] Submit button event: ${event.type}, inputConnected=${document.contains(input)}, buttonConnected=${document.contains(button)}`);
      if (state.fileRestoreInProgress) {
        console.log(`[Obfusca ${config.name}] SUPPRESSING ${event.type} - file restore in progress`);
        stopEventCompletely(event);
        return;
      }
      if (!document.contains(input)) {
        console.error(`[Obfusca ${config.name}] STALE INPUT - element detached from DOM, cannot intercept`);
        return;
      }
      const text = config.getContent(input);
      const shouldBlock = shouldBlockEventSync(input);
      if (shouldBlock) {
        console.log(`[Obfusca ${config.name}] BLOCKING submit button ${event.type} SYNCHRONOUSLY`);
        stopEventCompletely(event);
        if (needsNuclearBlocking()) {
          console.log("[Obfusca Claude] Using nuclear blocking (clear editor)");
          nuclearClearEditor(input, text);
        } else {
          console.log(`[Obfusca ${config.name}] Using standard blocking (preventDefault only)`);
        }
        if (!state.isAnalyzing && !isAnyPopupVisible()) {
          state.blockPendingAnalysis = true;
          handleSubmissionAttemptWithNuclear(input, button, event, text).finally(() => {
            state.blockPendingAnalysis = false;
          });
        }
        return;
      }
      console.log(`[Obfusca ${config.name}] Allowing submit button ${event.type} through`);
    }
    function setupSubmitButtonListener(button, input) {
      console.log(`[Obfusca] Attaching submit button listeners to: ${button.tagName}#${button.id || "(no id)"}`);
      boundHandlers.submitMousedown = (event) => {
        handleSubmitButtonEvent(event, input, button);
      };
      button.addEventListener("mousedown", boundHandlers.submitMousedown, { capture: true });
      boundHandlers.submitPointerdown = (event) => {
        handleSubmitButtonEvent(event, input, button);
      };
      button.addEventListener("pointerdown", boundHandlers.submitPointerdown, { capture: true });
      boundHandlers.submitTouchstart = (event) => {
        handleSubmitButtonEvent(event, input, button);
      };
      button.addEventListener("touchstart", boundHandlers.submitTouchstart, { capture: true });
      boundHandlers.submitClick = (event) => {
        handleSubmitButtonEvent(event, input, button);
      };
      button.addEventListener("click", boundHandlers.submitClick, { capture: true });
      console.log("[Obfusca] Submit button listeners attached (mousedown + pointerdown + touchstart + click)");
    }
    function setupFormListener(input) {
      const form = input.closest("form");
      if (form) {
        console.log(`[Obfusca] Attaching submit listener to form: ${form.id || "(no id)"}`);
        boundHandlers.formSubmit = async (event) => {
          console.log("[Obfusca] Form submit event detected");
          const currentButton = config.getSubmitButton();
          const allowed = await handleSubmissionAttempt(input, currentButton, event);
          if (!allowed) {
            event.preventDefault();
            event.stopPropagation();
          }
        };
        form.addEventListener("submit", boundHandlers.formSubmit, { capture: true });
        console.log("[Obfusca] Form submit listener attached successfully");
      } else {
        console.log("[Obfusca] No form found for input element");
      }
    }
    function removeListeners() {
      if (inputElement && boundHandlers.keydown) {
        inputElement.removeEventListener("keydown", boundHandlers.keydown, { capture: true });
      }
      if (boundHandlers.documentKeydown) {
        window.removeEventListener("keydown", boundHandlers.documentKeydown, { capture: true });
      }
      if (boundHandlers.beforeInput) {
        if (inputElement) {
          inputElement.removeEventListener("beforeinput", boundHandlers.beforeInput, { capture: true });
        }
        window.removeEventListener("beforeinput", boundHandlers.beforeInput, { capture: true });
      }
      if (inputElement) {
        const escapeHandler = inputElement.__obfuscaEscapeHandler;
        if (escapeHandler) {
          document.removeEventListener("keydown", escapeHandler, { capture: false });
          delete inputElement.__obfuscaEscapeHandler;
        }
      }
      if (submitButton) {
        if (boundHandlers.submitMousedown) {
          submitButton.removeEventListener("mousedown", boundHandlers.submitMousedown, { capture: true });
        }
        if (boundHandlers.submitPointerdown) {
          submitButton.removeEventListener("pointerdown", boundHandlers.submitPointerdown, { capture: true });
        }
        if (boundHandlers.submitTouchstart) {
          submitButton.removeEventListener("touchstart", boundHandlers.submitTouchstart, { capture: true });
        }
        if (boundHandlers.submitClick) {
          submitButton.removeEventListener("click", boundHandlers.submitClick, { capture: true });
        }
      }
      if (inputElement && boundHandlers.formSubmit) {
        const form = inputElement.closest("form");
        if (form) {
          form.removeEventListener("submit", boundHandlers.formSubmit, { capture: true });
        }
      }
      boundHandlers.keydown = void 0;
      boundHandlers.documentKeydown = void 0;
      boundHandlers.beforeInput = void 0;
      boundHandlers.submitMousedown = void 0;
      boundHandlers.submitPointerdown = void 0;
      boundHandlers.submitTouchstart = void 0;
      boundHandlers.submitClick = void 0;
      boundHandlers.formSubmit = void 0;
      listenersAttached = false;
    }
    function attemptHook() {
      console.log(`[Obfusca] Attempting to hook input elements for ${config.name}...`);
      const newInput = config.getInputElement();
      if (!newInput) {
        console.log("[Obfusca] Input element not found yet");
        return false;
      }
      if (newInput !== inputElement) {
        console.log("[Obfusca] New input element detected, removing old listeners");
        removeListeners();
        inputElement = newInput;
      }
      if (listenersAttached) {
        console.log("[Obfusca] Listeners already attached, skipping (button will be re-checked by observer)");
        return true;
      }
      console.log(`[Obfusca] Input detected: ${inputElement == null ? void 0 : inputElement.tagName}#${(inputElement == null ? void 0 : inputElement.id) || "(no id)"}, connected=${document.contains(inputElement)}`);
      setupKeyboardListener(inputElement);
      setupFormListener(inputElement);
      const newButton = config.getSubmitButton();
      if (newButton) {
        submitButton = newButton;
        console.log(`[Obfusca] Submit button found: ${submitButton.tagName}#${submitButton.id || "(no id)"}, connected=${document.contains(submitButton)}`);
        setupSubmitButtonListener(submitButton, inputElement);
      } else {
        console.log("[Obfusca] No submit button found yet — observer will attach when it appears");
      }
      listenersAttached = true;
      console.log(`[Obfusca] Successfully hooked ${config.name} - all listeners attached`);
      return true;
    }
    function init2() {
      console.log(`Obfusca [${config.name}]: Initializing on`, window.location.hostname);
      const handleMutation = () => {
        if (!listenersAttached) {
          attemptHook();
          return;
        }
        const currentInput = config.getInputElement();
        if (currentInput && currentInput !== inputElement) {
          console.log("[Obfusca] Input element changed (React re-render?), re-hooking");
          attemptHook();
          return;
        }
        if (inputElement) {
          const currentButton = config.getSubmitButton();
          if (currentButton && currentButton !== submitButton) {
            console.log(`[Obfusca] Submit button changed (old=${(submitButton == null ? void 0 : submitButton.tagName) || "null"}, new=${currentButton.tagName}), re-attaching listeners`);
            if (submitButton) {
              if (boundHandlers.submitMousedown) submitButton.removeEventListener("mousedown", boundHandlers.submitMousedown, { capture: true });
              if (boundHandlers.submitPointerdown) submitButton.removeEventListener("pointerdown", boundHandlers.submitPointerdown, { capture: true });
              if (boundHandlers.submitTouchstart) submitButton.removeEventListener("touchstart", boundHandlers.submitTouchstart, { capture: true });
              if (boundHandlers.submitClick) submitButton.removeEventListener("click", boundHandlers.submitClick, { capture: true });
            }
            submitButton = currentButton;
            setupSubmitButtonListener(submitButton, inputElement);
          }
        }
      };
      if (!attemptHook()) {
        observer = createDOMObserver({
          onMutation: handleMutation,
          debounceMs: 100
        });
        observer.start();
      } else {
        observer = createDOMObserver({
          onMutation: handleMutation,
          debounceMs: 100
        });
        observer.start();
      }
      urlWatcherCleanup = watchURLChanges((newURL, oldURL) => {
        console.log(`Obfusca [${config.name}]: URL changed from ${oldURL} to ${newURL}`);
        cleanupAfterSubmission();
        resetAllowedFiles();
        removeDetectionPopup();
        removeBlockOverlay();
        removeRedactOverlay();
        hideFileOverlay();
        setTimeout(() => attemptHook(), 100);
      });
    }
    function cleanup2() {
      removeListeners();
      observer == null ? void 0 : observer.stop();
      observer = null;
      urlWatcherCleanup == null ? void 0 : urlWatcherCleanup();
      urlWatcherCleanup = null;
      removeDetectionPopup();
      removeBlockOverlay();
      removeRedactOverlay();
      hideFileOverlay();
      discardSavedContent();
      inputElement = null;
      submitButton = null;
      state.pendingObfuscatedText = null;
    }
    init2();
    return {
      config,
      get inputElement() {
        return inputElement;
      },
      get submitButton() {
        return submitButton;
      },
      get observer() {
        return observer;
      },
      get listenersAttached() {
        return listenersAttached;
      },
      cleanup: cleanup2
    };
  }
  function isClaudeSite() {
    return window.location.hostname.includes("claude.ai");
  }
  function sendToMainWorld(type, data) {
    window.postMessage({ source: "obfusca-content", type, data }, "*");
  }
  let currentInterceptor = null;
  let protectionEnabled = true;
  function sendCustomPatternsToMainWorld() {
    if (!isClaudeSite()) return;
    chrome.storage.local.get(["customPatterns"], (result) => {
      const patterns = result.customPatterns;
      if (Array.isArray(patterns) && patterns.length > 0) {
        console.log(`[Obfusca] Sending ${patterns.length} custom patterns to MAIN world`);
        sendToMainWorld("custom-patterns", patterns);
      }
    });
  }
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.customPatterns) {
      const newPatterns = changes.customPatterns.newValue;
      if (Array.isArray(newPatterns) && isClaudeSite()) {
        console.log(`[Obfusca] Custom patterns updated, sending ${newPatterns.length} to MAIN world`);
        sendToMainWorld("custom-patterns", newPatterns);
      }
    }
  });
  function setupNetworkBlockListener() {
    console.log("[Obfusca Claude] Setting up network block event listener");
    window.addEventListener("obfusca-blocked", (event) => {
      const { reason, source } = event.detail || {};
      console.log(`[Obfusca Claude] Received block event from ${source}: ${reason}`);
    });
  }
  let initialized = false;
  async function init() {
    var _a, _b;
    console.log("[Obfusca] Content script initializing...");
    console.log("[Obfusca] Current URL:", window.location.href);
    console.log("[Obfusca] Document readyState:", document.readyState);
    const settings = await new Promise((resolve) => {
      chrome.storage.local.get(["enabled"], resolve);
    });
    protectionEnabled = settings.enabled !== false;
    if (!protectionEnabled) {
      console.log("[Obfusca] Protection disabled by user toggle — skipping initialization");
      if (isClaudeSite()) {
        sendToMainWorld("protection-state", { enabled: false });
      }
      return;
    }
    const session = await getSession();
    if (!session) {
      console.log("[Obfusca] No session — extension inactive, waiting for sign-in");
      if (isClaudeSite()) {
        sendToMainWorld("session-state", { active: false });
      }
      return;
    }
    if (initialized) {
      console.log("[Obfusca] Already initialized, skipping");
      return;
    }
    initialized = true;
    console.log("[Obfusca] Session found — activating protection");
    loadCustomPatternsIntoMemory();
    sendCustomPatternsToMainWorld();
    if (isClaudeSite()) {
      sendToMainWorld("session-state", { active: true });
      sendToMainWorld("protection-state", { enabled: true });
    }
    const siteConfig = detectCurrentSite();
    if (!siteConfig) {
      console.log("[Obfusca] Current site is not supported:", window.location.hostname);
      return;
    }
    console.log(`[Obfusca] Site detected: ${siteConfig.name}`);
    console.log(`[Obfusca] Host patterns:`, siteConfig.hostPatterns);
    if (isClaudeSite()) {
      console.log("[Obfusca Claude] Using DOM interception with nuclear blocking + network safety net");
      setupNetworkBlockListener();
    }
    console.log(`[Obfusca] Creating site interceptor for ${siteConfig.name}...`);
    currentInterceptor = createSiteInterceptor(siteConfig);
    console.log("[Obfusca] Setting up universal file interception...");
    setupUniversalFileInterception();
    console.log(`[Obfusca] Initialized successfully for ${siteConfig.name}`);
    console.log("[Obfusca] Interceptor state:", {
      inputElement: ((_a = currentInterceptor.inputElement) == null ? void 0 : _a.tagName) || "not found",
      submitButton: ((_b = currentInterceptor.submitButton) == null ? void 0 : _b.tagName) || "not found",
      listenersAttached: currentInterceptor.listenersAttached
    });
  }
  function cleanup() {
    console.log("[Obfusca] Content script cleanup triggered");
    if (currentInterceptor) {
      currentInterceptor.cleanup();
      currentInterceptor = null;
    }
    cleanupFileInterception();
  }
  window.addEventListener("unload", cleanup);
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.obfusca_access_token) {
      if (changes.obfusca_access_token.newValue && !initialized) {
        console.log("[Obfusca] Session detected (user signed in) — initializing protection");
        init();
      } else if (!changes.obfusca_access_token.newValue && initialized) {
        console.log("[Obfusca] Session removed (user signed out) — deactivating protection");
        cleanup();
        initialized = false;
        if (isClaudeSite()) {
          sendToMainWorld("session-state", { active: false });
        }
      }
    }
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && "enabled" in changes) {
      const newEnabled = changes.enabled.newValue !== false;
      console.log(`[Obfusca] Protection toggle changed: ${newEnabled}`);
      if (!newEnabled && protectionEnabled) {
        protectionEnabled = false;
        console.log("[Obfusca] Protection disabled — removing all interception");
        cleanup();
        initialized = false;
        if (isClaudeSite()) {
          sendToMainWorld("protection-state", { enabled: false });
        }
      } else if (newEnabled && !protectionEnabled) {
        protectionEnabled = true;
        console.log("[Obfusca] Protection re-enabled — reinitializing");
        if (isClaudeSite()) {
          sendToMainWorld("protection-state", { enabled: true });
        }
        if (!initialized) {
          init();
        }
      }
    }
  });
  if (document.readyState === "loading") {
    console.log("[Obfusca] DOM not ready, waiting for DOMContentLoaded...");
    document.addEventListener("DOMContentLoaded", init);
  } else {
    console.log("[Obfusca] DOM already ready, initializing immediately");
    init();
  }
  const MODAL_ID = "obfusca-replacement-modal";
  const SUGGESTIONS = [
    "[REDACTED]",
    "[CONFIDENTIAL]",
    "[REMOVED]",
    "[PRIVATE]",
    "[HIDDEN]",
    "***"
  ];
  function showReplacementModal(options) {
    removeReplacementModal();
    const { currentText, label, anchorElement } = options;
    const modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    font-family: ${OBFUSCA_STYLES.fonts.sans};
    width: 280px;
    background: ${OBFUSCA_STYLES.colors.card};
    border: 1px solid ${OBFUSCA_STYLES.colors.border};
    border-radius: ${OBFUSCA_STYLES.radius.xl};
    box-shadow: ${OBFUSCA_STYLES.shadows.xl};
    overflow: hidden;
    padding: 12px;
  `;
    modal.innerHTML = `
    <div style="margin-bottom: 8px;">
      <div style="
        font-size: 12px;
        font-weight: 600;
        color: ${OBFUSCA_STYLES.colors.foreground};
        margin-bottom: 4px;
      ">Custom Replacement</div>
      <div style="
        font-size: 11px;
        color: ${OBFUSCA_STYLES.colors.mutedForeground};
      ">for ${escapeHtml(label)}</div>
    </div>
    <input
      id="obfusca-replacement-input"
      type="text"
      value="${escapeHtml(currentText)}"
      style="
        width: 100%;
        box-sizing: border-box;
        padding: 6px 10px;
        font-size: 12px;
        font-family: ${OBFUSCA_STYLES.fonts.mono};
        background: ${OBFUSCA_STYLES.colors.secondary};
        color: ${OBFUSCA_STYLES.colors.foreground};
        border: 1px solid ${OBFUSCA_STYLES.colors.border};
        border-radius: ${OBFUSCA_STYLES.radius.sm};
        outline: none;
        margin-bottom: 8px;
      "
      placeholder="Enter replacement text"
    />
    <div style="
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 10px;
    ">
      ${SUGGESTIONS.map((s) => `
        <button class="obfusca-suggestion-btn" data-suggestion="${escapeHtml(s)}" style="
          padding: 3px 8px;
          font-size: 10px;
          font-family: ${OBFUSCA_STYLES.fonts.mono};
          background: ${OBFUSCA_STYLES.colors.secondary};
          color: ${OBFUSCA_STYLES.colors.mutedForeground};
          border: 1px solid ${OBFUSCA_STYLES.colors.border};
          border-radius: ${OBFUSCA_STYLES.radius.sm};
          cursor: pointer;
          transition: background 0.15s;
        ">${escapeHtml(s)}</button>
      `).join("")}
    </div>
    <div style="display: flex; gap: 6px; justify-content: flex-end;">
      <button id="obfusca-replacement-cancel" style="
        padding: 5px 12px;
        font-size: 12px;
        background: ${OBFUSCA_STYLES.colors.secondary};
        color: ${OBFUSCA_STYLES.colors.mutedForeground};
        border: 1px solid ${OBFUSCA_STYLES.colors.border};
        border-radius: ${OBFUSCA_STYLES.radius.sm};
        cursor: pointer;
      ">Cancel</button>
      <button id="obfusca-replacement-confirm" style="
        padding: 5px 12px;
        font-size: 12px;
        background: ${OBFUSCA_STYLES.colors.foreground};
        color: ${OBFUSCA_STYLES.colors.background};
        border: none;
        border-radius: ${OBFUSCA_STYLES.radius.sm};
        cursor: pointer;
        font-weight: 500;
      ">Apply</button>
    </div>
  `;
    document.body.appendChild(modal);
    const anchorRect = anchorElement.getBoundingClientRect();
    const modalRect = modal.getBoundingClientRect();
    let top = anchorRect.top - modalRect.height - 4;
    if (top < 8) top = anchorRect.bottom + 4;
    let left = anchorRect.left;
    if (left + modalRect.width > window.innerWidth - 8) {
      left = window.innerWidth - modalRect.width - 8;
    }
    modal.style.top = `${Math.max(8, top)}px`;
    modal.style.left = `${Math.max(8, left)}px`;
    const input = modal.querySelector("#obfusca-replacement-input");
    const cancelBtn = modal.querySelector("#obfusca-replacement-cancel");
    const confirmBtn = modal.querySelector("#obfusca-replacement-confirm");
    const suggestionBtns = modal.querySelectorAll(".obfusca-suggestion-btn");
    input == null ? void 0 : input.focus();
    input == null ? void 0 : input.select();
    suggestionBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const suggestion = btn.getAttribute("data-suggestion") || "";
        if (input) input.value = suggestion;
      });
      btn.addEventListener("mouseenter", () => {
        btn.style.background = OBFUSCA_STYLES.colors.border;
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = OBFUSCA_STYLES.colors.secondary;
      });
    });
    cancelBtn == null ? void 0 : cancelBtn.addEventListener("click", () => {
      removeReplacementModal();
      options.onCancel();
    });
    confirmBtn == null ? void 0 : confirmBtn.addEventListener("click", () => {
      var _a;
      const newText = ((_a = input == null ? void 0 : input.value) == null ? void 0 : _a.trim()) || currentText;
      removeReplacementModal();
      options.onConfirm(newText);
    });
    input == null ? void 0 : input.addEventListener("keydown", (e) => {
      var _a;
      if (e.key === "Enter") {
        const newText = ((_a = input.value) == null ? void 0 : _a.trim()) || currentText;
        removeReplacementModal();
        options.onConfirm(newText);
      } else if (e.key === "Escape") {
        removeReplacementModal();
        options.onCancel();
      }
    });
    return modal;
  }
  function removeReplacementModal() {
    const existing = document.getElementById(MODAL_ID);
    existing == null ? void 0 : existing.remove();
  }
  const replacementModal = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    removeReplacementModal,
    showReplacementModal
  }, Symbol.toStringTag, { value: "Module" }));
})();
//# sourceMappingURL=content.js.map
