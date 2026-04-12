(function() {
  "use strict";
  (function() {
    if (!window.location.hostname.includes("claude.ai")) {
      console.log("[Obfusca Network] Not on Claude.ai, skipping network interceptor");
      return;
    }
    function log(...args) {
    }
    window.__obfuscaSessionActive = false;
    window.__obfuscaProtectionEnabled = true;
    window.__obfuscaCachedPatterns = [];
    window.__obfuscaBypassNext = false;
    window.addEventListener("message", (event) => {
      var _a, _b;
      if (event.source !== window) return;
      if (((_a = event.data) == null ? void 0 : _a.source) !== "obfusca-content") return;
      const { type, data } = event.data;
      switch (type) {
        case "session-state":
          window.__obfuscaSessionActive = (data == null ? void 0 : data.active) ?? false;
          break;
        case "protection-state":
          window.__obfuscaProtectionEnabled = (data == null ? void 0 : data.enabled) ?? true;
          break;
        case "custom-patterns":
          window.__obfuscaCachedPatterns = data || [];
          log("Patterns loaded:", ((_b = window.__obfuscaCachedPatterns) == null ? void 0 : _b.length) || 0);
          break;
        case "bypass-next-submit":
          window.__obfuscaBypassNext = true;
          setTimeout(() => {
            if (window.__obfuscaBypassNext) {
              window.__obfuscaBypassNext = false;
            }
          }, 5e3);
          break;
      }
    });
    const SENSITIVE_PATTERNS = [
      // Email addresses
      {
        name: "Email Address",
        regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/
      },
      // US Phone numbers
      {
        name: "Phone Number",
        regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,
        validator: (match) => {
          const digits = match.replace(/\D/g, "");
          return digits.length >= 10 && digits.length <= 11;
        }
      },
      // SSN: XXX-XX-XXXX or XXX XX XXXX or XXXXXXXXX
      {
        name: "Social Security Number",
        regex: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/,
        validator: (match) => {
          const digits = match.replace(/\D/g, "");
          if (digits.length !== 9) return false;
          const area = parseInt(digits.substring(0, 3), 10);
          if (area === 0 || area === 666 || area >= 900 && area <= 999) {
            return false;
          }
          return true;
        }
      },
      // Credit Card: 16 digits with optional separators
      {
        name: "Credit Card Number",
        regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
        validator: (match) => {
          const digits = match.replace(/\D/g, "").split("").map(Number);
          if (digits.length < 13) return false;
          let sum = 0;
          let isEven = false;
          for (let i = digits.length - 1; i >= 0; i--) {
            let digit = digits[i];
            if (isEven) {
              digit *= 2;
              if (digit > 9) digit -= 9;
            }
            sum += digit;
            isEven = !isEven;
          }
          return sum % 10 === 0;
        }
      },
      // API Keys with sk- prefix (OpenAI, Stripe, etc.)
      {
        name: "API Key",
        regex: /\b(sk|api|key)[-_]?[a-zA-Z0-9]{20,}\b/i
      },
      // AWS Access Key ID
      {
        name: "AWS Access Key",
        regex: /\b(AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/
      },
      // Private Key markers
      {
        name: "Private Key",
        regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/
      },
      // GitHub tokens
      {
        name: "GitHub Token",
        regex: /\b(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59})\b/
      }
    ];
    function checkForSensitiveData(text) {
      if (!text || text.length < 3) {
        return null;
      }
      for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.regex.test(text)) {
          const match = text.match(pattern.regex);
          if (match && pattern.validator) {
            if (pattern.validator(match[0])) {
              log(`Pattern matched: ${pattern.name}`);
              return pattern.name;
            }
          } else if (match) {
            log(`Pattern matched: ${pattern.name}`);
            return pattern.name;
          }
        }
      }
      const customPatterns = window.__obfuscaCachedPatterns;
      if (customPatterns && Array.isArray(customPatterns)) {
        for (const cp of customPatterns) {
          if (!cp.enabled) continue;
          try {
            if (cp.pattern_type === "keyword_list") {
              const keywords = JSON.parse(cp.pattern_value);
              const textLower = text.toLowerCase();
              for (const kw of keywords) {
                if (textLower.includes(kw.toLowerCase())) {
                  log(`Custom keyword pattern matched: ${cp.name}`);
                  return cp.name;
                }
              }
            } else if (cp.pattern_type === "regex") {
              const regex = new RegExp(cp.pattern_value, "i");
              if (regex.test(text)) {
                log(`Custom regex pattern matched: ${cp.name}`);
                return cp.name;
              }
            }
          } catch {
          }
        }
      }
      return null;
    }
    function extractPromptFromBody(body) {
      try {
        const data = JSON.parse(body);
        if (typeof data.prompt === "string") {
          return data.prompt;
        }
        if (typeof data.content === "string") {
          return data.content;
        }
        if (typeof data.text === "string") {
          return data.text;
        }
        if (typeof data.message === "string") {
          return data.message;
        }
        if (Array.isArray(data.messages)) {
          const texts = [];
          for (const msg of data.messages) {
            if (typeof msg.content === "string") {
              texts.push(msg.content);
            } else if (Array.isArray(msg.content)) {
              for (const part of msg.content) {
                if (typeof part === "string") {
                  texts.push(part);
                } else if (part && typeof part.text === "string") {
                  texts.push(part.text);
                }
              }
            }
          }
          if (texts.length > 0) {
            return texts.join("\n");
          }
        }
        const allText = extractAllText(data);
        if (allText) {
          return allText;
        }
      } catch {
      }
      return null;
    }
    function extractAllText(obj, depth = 0) {
      if (depth > 5) return "";
      if (typeof obj === "string") {
        return obj;
      }
      if (Array.isArray(obj)) {
        return obj.map((item) => extractAllText(item, depth + 1)).join("\n");
      }
      if (obj && typeof obj === "object") {
        const texts = [];
        for (const key of Object.keys(obj)) {
          const value = obj[key];
          const text = extractAllText(value, depth + 1);
          if (text) {
            texts.push(text);
          }
        }
        return texts.join("\n");
      }
      return "";
    }
    const NOTIFICATION_ID = "obfusca-network-block-notification";
    function showBlockNotification(patternName) {
      hideBlockNotification();
      const notification = document.createElement("div");
      notification.id = NOTIFICATION_ID;
      notification.setAttribute("role", "alert");
      notification.innerHTML = `
      <div class="obfusca-network-block-content">
        <div class="obfusca-network-block-header">
          <svg class="obfusca-network-block-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <span class="obfusca-network-block-title">Message Blocked</span>
        </div>
        <p class="obfusca-network-block-message">
          Sensitive data detected: <strong>${escapeHtml(patternName)}</strong>
        </p>
        <p class="obfusca-network-block-submessage">
          Please remove or redact the sensitive information before sending.
        </p>
        <div class="obfusca-network-block-actions">
          <button class="obfusca-network-block-btn" id="obfusca-edit-message-btn">
            Edit Message
          </button>
        </div>
      </div>
    `;
      applyNotificationStyles(notification);
      document.body.appendChild(notification);
      const editBtn = notification.querySelector("#obfusca-edit-message-btn");
      if (editBtn) {
        editBtn.addEventListener("click", () => {
          hideBlockNotification();
          const editor = document.querySelector(
            'div.ProseMirror[contenteditable="true"]'
          );
          if (editor) {
            editor.focus();
          }
        });
      }
      setTimeout(() => {
        hideBlockNotification();
      }, 1e4);
    }
    function hideBlockNotification() {
      const existing = document.getElementById(NOTIFICATION_ID);
      if (existing) {
        existing.remove();
      }
    }
    function escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }
    function applyNotificationStyles(notification) {
      notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: obfusca-slide-in 0.3s ease-out;
    `;
      const content = notification.querySelector(
        ".obfusca-network-block-content"
      );
      if (content) {
        content.style.cssText = `
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05);
        border-left: 4px solid #dc2626;
        padding: 16px;
        min-width: 300px;
        max-width: 400px;
      `;
      }
      const header = notification.querySelector(
        ".obfusca-network-block-header"
      );
      if (header) {
        header.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      `;
      }
      const icon = notification.querySelector(
        ".obfusca-network-block-icon"
      );
      if (icon) {
        icon.style.cssText = `
        color: #dc2626;
        flex-shrink: 0;
      `;
      }
      const title = notification.querySelector(
        ".obfusca-network-block-title"
      );
      if (title) {
        title.style.cssText = `
        font-size: 16px;
        font-weight: 600;
        color: #111827;
      `;
      }
      const message = notification.querySelector(
        ".obfusca-network-block-message"
      );
      if (message) {
        message.style.cssText = `
        font-size: 14px;
        color: #374151;
        margin: 0 0 8px 0;
      `;
      }
      const submessage = notification.querySelector(
        ".obfusca-network-block-submessage"
      );
      if (submessage) {
        submessage.style.cssText = `
        font-size: 13px;
        color: #6b7280;
        margin: 0 0 16px 0;
      `;
      }
      const actions = notification.querySelector(
        ".obfusca-network-block-actions"
      );
      if (actions) {
        actions.style.cssText = `
        display: flex;
        gap: 8px;
      `;
      }
      const btn = notification.querySelector(
        ".obfusca-network-block-btn"
      );
      if (btn) {
        btn.style.cssText = `
        flex: 1;
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        background: #2563eb;
        color: white;
        transition: background 0.15s ease;
      `;
        btn.addEventListener("mouseenter", () => {
          btn.style.background = "#1d4ed8";
        });
        btn.addEventListener("mouseleave", () => {
          btn.style.background = "#2563eb";
        });
      }
      const style = document.createElement("style");
      style.textContent = `
      @keyframes obfusca-slide-in {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
      if (!document.getElementById("obfusca-network-styles")) {
        style.id = "obfusca-network-styles";
        document.head.appendChild(style);
      }
    }
    function isClaudeApiUrl(url) {
      if (!url.includes("claude.ai")) {
        return false;
      }
      const apiPaths = [
        "/api/organizations/",
        "/api/append_message",
        "/api/chat_conversations",
        "/api/completion",
        "/completion"
      ];
      return apiPaths.some((path) => url.includes(path));
    }
    function installFetchInterceptor() {
      if (window.__obfuscaNetworkInterceptorActive) {
        return;
      }
      const originalFetch = window.fetch;
      window.fetch = async function(input, init) {
        var _a;
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (isClaudeApiUrl(url) && ((_a = init == null ? void 0 : init.method) == null ? void 0 : _a.toUpperCase()) === "POST" && window.__obfuscaSessionActive && window.__obfuscaProtectionEnabled !== false) {
          if (window.__obfuscaBypassNext) {
            window.__obfuscaBypassNext = false;
            return originalFetch.call(window, input, init);
          }
          const body = init.body;
          let bodyText = null;
          if (body) {
            if (typeof body === "string") {
              bodyText = body;
            } else if (body instanceof Blob) {
              try {
                bodyText = await body.text();
              } catch {
              }
            } else if (body instanceof ArrayBuffer) {
              try {
                bodyText = new TextDecoder().decode(body);
              } catch {
              }
            } else if (ArrayBuffer.isView(body)) {
              try {
                bodyText = new TextDecoder().decode(body);
              } catch {
              }
            } else if (body instanceof URLSearchParams) {
              bodyText = body.toString();
            } else if (body instanceof FormData) {
              const texts = [];
              body.forEach((value) => {
                if (typeof value === "string") texts.push(value);
              });
              if (texts.length > 0) bodyText = texts.join("\n");
            }
          }
          if (bodyText) {
            const prompt = extractPromptFromBody(bodyText);
            if (prompt) {
              const sensitivePattern = checkForSensitiveData(prompt);
              if (sensitivePattern) {
                console.warn(
                  `[Obfusca] BLOCKED: Message contains ${sensitivePattern}`
                );
                showBlockNotification(sensitivePattern);
                window.dispatchEvent(new CustomEvent("obfusca-blocked", {
                  detail: {
                    reason: sensitivePattern,
                    source: "network-interceptor",
                    url
                  }
                }));
                return new Response(
                  JSON.stringify({
                    error: "Blocked by Obfusca",
                    message: `Sensitive data detected: ${sensitivePattern}`
                  }),
                  {
                    status: 403,
                    statusText: "Forbidden",
                    headers: { "Content-Type": "application/json" }
                  }
                );
              }
            }
          }
        }
        return originalFetch.call(window, input, init);
      };
      window.__obfuscaNetworkInterceptorActive = true;
    }
    installFetchInterceptor();
    console.log("[Obfusca] Network interceptor active for claude.ai");
  })();
})();
//# sourceMappingURL=network-interceptor.js.map
