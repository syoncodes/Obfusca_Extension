/**
 * Content script entry point for Obfusca extension.
 * Detects the current LLM chat site and initializes the appropriate interceptor.
 *
 * This is a thin entry point - all site-specific logic lives in the sites/ adapters,
 * and shared interception logic lives in core/interceptor.ts.
 *
 * IMPORTANT: Claude.ai uses network-level interception (network-interceptor.ts) because
 * it ignores DOM events. Other sites use DOM-level interception here.
 *
 * MAIN world communication uses postMessage (CSP-compliant) instead of inline script
 * injection, which is blocked by Claude.ai's Content Security Policy.
 */

import { detectCurrentSite } from './sites';
import { createSiteInterceptor } from './core/interceptor';
import { setupUniversalFileInterception, cleanupFileInterception } from './core/fileInterception';
import { loadCustomPatternsIntoMemory } from './detection';
import { getSession } from './auth';
import type { SiteState } from './sites/types';

/**
 * Check if we're on Claude.ai - it uses network interception instead of DOM interception.
 */
function isClaudeSite(): boolean {
  return window.location.hostname.includes('claude.ai');
}

/**
 * Send a message to the MAIN world (network-interceptor.ts) via postMessage.
 * CSP-compliant — no inline script injection needed.
 */
function sendToMainWorld(type: string, data: unknown): void {
  window.postMessage({ source: 'obfusca-content', type, data }, '*');
}

// Current interceptor state
let currentInterceptor: SiteState | null = null;

// Protection toggle state — synced with chrome.storage.local.enabled
let protectionEnabled = true;

/**
 * Send custom patterns to MAIN world for the network interceptor.
 * Uses postMessage instead of inline script injection (CSP-compliant).
 */
function sendCustomPatternsToMainWorld(): void {
  if (!isClaudeSite()) return;

  chrome.storage.local.get(['customPatterns'], (result) => {
    const patterns = result.customPatterns;
    if (Array.isArray(patterns) && patterns.length > 0) {
      console.log(`[Obfusca] Sending ${patterns.length} custom patterns to MAIN world`);
      sendToMainWorld('custom-patterns', patterns);
    }
  });
}

/**
 * Listen for custom pattern updates and re-send them to MAIN world.
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.customPatterns) {
    const newPatterns = changes.customPatterns.newValue;
    if (Array.isArray(newPatterns) && isClaudeSite()) {
      console.log(`[Obfusca] Custom patterns updated, sending ${newPatterns.length} to MAIN world`);
      sendToMainWorld('custom-patterns', newPatterns);
    }
  }
});

/**
 * Set up listener for network interceptor block events (Claude only).
 * The network interceptor dispatches 'obfusca-blocked' events when it blocks a request.
 * This content script listens for those events to provide any additional UI feedback if needed.
 */
function setupNetworkBlockListener(): void {
  console.log('[Obfusca Claude] Setting up network block event listener');

  window.addEventListener('obfusca-blocked', ((event: CustomEvent) => {
    const { reason, source } = event.detail || {};
    console.log(`[Obfusca Claude] Received block event from ${source}: ${reason}`);
  }) as EventListener);
}

/**
 * Initialize the content script.
 * Detects the current site and creates an interceptor if supported.
 *
 * CLAUDE HANDLING:
 * Claude.ai uses network-level interception (network-interceptor.ts) because it ignores
 * DOM events. For Claude, we only:
 * - Send custom patterns to MAIN world for the network interceptor (via postMessage)
 * - Set up listener for network block events
 * - Set up file interception (still works via DOM)
 *
 * OTHER SITES:
 * All other sites (ChatGPT, Gemini, Grok, etc.) use DOM-level interception which works
 * correctly with preventDefault/stopPropagation.
 */
// Track whether interception has been initialized
let initialized = false;

async function init(): Promise<void> {

// Badge status helper
function setBadge(status: 'ready' | 'loading' | 'error' | 'disabled' | 'noauth') {
  try { chrome.runtime.sendMessage({ type: 'SET_BADGE', status }); } catch {}
}

// Loading overlay - matches analysis indicator style
function showLoadingOverlay() {
  if (document.getElementById('obfusca-loading-overlay')) return;
  const input = document.querySelector('#prompt-textarea, [contenteditable="true"], textarea');
  const container = input ? input.closest('form, [class*="composer"], [class*="input"]') || input : null;
  const rect = container?.getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.id = 'obfusca-loading-overlay';
  const bottomPos = rect ? (window.innerHeight - rect.top + 8) : 80;
  const leftPos = rect && rect.width >= 400 ? rect.left : 0;
  const width = rect && rect.width >= 400 ? rect.width : 750;
  const useTransform = !(rect && rect.width >= 400);
  overlay.style.cssText = 'position:fixed;'
    + 'bottom:' + bottomPos + 'px;'
    + 'left:' + (useTransform ? '50%' : leftPos + 'px') + ';'
    + 'width:' + width + 'px;'
    + 'max-width:calc(100vw - 32px);'
    + 'transform:' + (useTransform ? 'translateX(-50%)' : 'none') + ';'
    + 'background:#0a0a0a;border:1px solid #222;border-radius:16px;'
    + 'padding:14px 20px;z-index:2147483646;display:flex;align-items:center;gap:10px;'
    + 'box-shadow:0 -4px 24px rgba(0,0,0,0.3);font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
  const shield = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
  const spinner = '<div style="width:14px;height:14px;border:2px solid #333;border-top:2px solid #666;border-radius:50%;animation:obfusca-spin 0.8s linear infinite;flex-shrink:0;"></div>';
  const style = '<style>@keyframes obfusca-spin{to{transform:rotate(360deg)}}</style>';
  overlay.innerHTML = '<div style="flex-shrink:0;display:flex;align-items:center;">' + shield + '</div>'
    + '<span id="obfusca-loading-text" style="color:#666;font-size:12px;flex:1;">Initializing protection...</span>'
    + spinner + style;
  document.body?.appendChild(overlay);
}
function updateLoadingText(text: string) {
  const el = document.getElementById('obfusca-loading-text');
  if (el) el.textContent = text;
}
function hideLoadingOverlay() {
  const el = document.getElementById('obfusca-loading-overlay');
  if (el) el.remove();
}

  console.log('[Obfusca] Content script initializing...');
  console.log('[Obfusca] Current URL:', window.location.href);
  console.log('[Obfusca] Document readyState:', document.readyState);

  // Check if protection is enabled (user toggle in popup)
  const settings = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get(['enabled'], resolve);
  });
  protectionEnabled = settings.enabled !== false; // Default true if not set

  if (!protectionEnabled) {
    console.log('[Obfusca] Protection disabled by user toggle — skipping initialization');
    if (isClaudeSite()) {
      sendToMainWorld('protection-state', { enabled: false });
    }
    return;
  }

  // Check for authenticated session — if not signed in, do nothing
  const session = await getSession();
  if (!session) {
    console.log('[Obfusca] No session — extension inactive, waiting for sign-in');
  setBadge('noauth');
    if (isClaudeSite()) {
      sendToMainWorld('session-state', { active: false });
    }
    return;
  }

  // Prevent double-initialization
  if (initialized) {
    console.log('[Obfusca] Already initialized, skipping');
    return;
  }
  initialized = true;

  console.log('[Obfusca] Session found — activating protection');
  setBadge('loading');
  showLoadingOverlay();

  // Pre-load WebLLM model in background so it's ready for first submit
  (async () => {
    try {
      const { isWebGPUAvailable, initWebLLM } = await import('./webllmDetector');
      if (await isWebGPUAvailable()) {
        console.log('[Obfusca] Pre-loading WebLLM model in background...');
        updateLoadingText('Loading AI model...');
        await initWebLLM();
        console.log('[Obfusca] WebLLM model pre-loaded and ready');
        updateLoadingText('Loading NER model...');
      }
      // Also pre-load NER and Layer 3 models
      try {
        const { detectWithNERModel } = await import('./nerModelBridge');
        await detectWithNERModel('preload warmup');
        console.log('[Obfusca] NER model pre-loaded');
        updateLoadingText('Loading classifier...');
      } catch {}
      try {
        const { applyContextClassification } = await import('./contextClassifier');
        await applyContextClassification('preload warmup', []);
        console.log('[Obfusca] Layer 3 classifier pre-loaded');
        updateLoadingText('Protection active!');
        setBadge('ready');
        setTimeout(hideLoadingOverlay, 1500);
      } catch {}
    } catch (err) {
      console.log('[Obfusca] Model pre-load skipped:', err);
    }
  })();

  // Sync semantic rules from backend for LLM validation layer
  (async () => {
    try {
      const storage = await chrome.storage.local.get(['obfusca_access_token']);
      const token = storage.obfusca_access_token;
      if (!token) {
        console.log('[Obfusca] No access token for semantic rules sync');
        return;
      }
      console.log('[Obfusca] Fetching semantic rules from backend...');
      const resp = await fetch('https://api.obfusca.ai/semantic-rules', {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      if (resp.ok) {
        const data = await resp.json();
        const rules = data.rules || [];
        await chrome.storage.local.set({ semanticRules: rules });
        console.log('[Obfusca] Synced ' + rules.length + ' semantic rules from backend');
        // Pre-warm the system prompt cache
        try {
          const wllm = await import('./webllmDetector');
          if (wllm.isWebGPUAvailable) await wllm.isWebGPUAvailable();
        } catch {}
      } else {
        console.log('[Obfusca] Semantic rules sync failed: ' + resp.status);
      }
    } catch (err) {
      console.log('[Obfusca] Semantic rules sync error:', err);
    }
  })();
  // Sync semantic rules from backend for LLM validation layer
  (async () => {
    try {
      const storage = await chrome.storage.local.get(['obfusca_access_token']);
      const token = storage.obfusca_access_token;
      if (!token) {
        console.log('[Obfusca] No access token for semantic rules sync');
        return;
      }
      console.log('[Obfusca] Fetching semantic rules from backend...');
      const resp = await fetch('https://api.obfusca.ai/semantic-rules', {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      if (resp.ok) {
        const data = await resp.json();
        const rules = data.rules || [];
        await chrome.storage.local.set({ semanticRules: rules });
        console.log('[Obfusca] Synced ' + rules.length + ' semantic rules from backend');
      } else {
        console.log('[Obfusca] Semantic rules sync failed: ' + resp.status);
      }
    } catch (err) {
      console.log('[Obfusca] Semantic rules sync error:', err);
    }
  })();
  // Load custom patterns into memory for synchronous quick checks
  // This is also called at module load, but we call it again to ensure fresh patterns
  loadCustomPatternsIntoMemory();

  // Send custom patterns to MAIN world for network interceptor (Claude only)
  sendCustomPatternsToMainWorld();

  // Signal to MAIN world network interceptor (Claude) that session is active
  // and protection is enabled
  if (isClaudeSite()) {
    sendToMainWorld('session-state', { active: true });
    sendToMainWorld('protection-state', { enabled: true });
  }

  const siteConfig = detectCurrentSite();

  if (!siteConfig) {
    console.log('[Obfusca] Current site is not supported:', window.location.hostname);
    return;
  }

  console.log(`[Obfusca] Site detected: ${siteConfig.name}`);
  console.log(`[Obfusca] Host patterns:`, siteConfig.hostPatterns);

  // CLAUDE: Use DOM interception with nuclear blocking (clears editor before ProseMirror reads it)
  // The network interceptor (network-interceptor.ts) still runs as a secondary safety net
  if (isClaudeSite()) {
    console.log('[Obfusca Claude] Using DOM interception with nuclear blocking + network safety net');
    setupNetworkBlockListener();
  }

  // Create DOM-level interceptor (uses nuclear blocking on Claude, standard on others)
  console.log(`[Obfusca] Creating site interceptor for ${siteConfig.name}...`);
  currentInterceptor = createSiteInterceptor(siteConfig);

  // Set up universal file interception (works across all sites)
  console.log('[Obfusca] Setting up universal file interception...');
  setupUniversalFileInterception();

  // Log success
  console.log(`[Obfusca] Initialized successfully for ${siteConfig.name}`);
  console.log('[Obfusca] Interceptor state:', {
    inputElement: currentInterceptor.inputElement?.tagName || 'not found',
    submitButton: currentInterceptor.submitButton?.tagName || 'not found',
    listenersAttached: currentInterceptor.listenersAttached,
  });
}

/**
 * Cleanup function for when the content script is unloaded.
 */
function cleanup(): void {
  console.log('[Obfusca] Content script cleanup triggered');
  if (currentInterceptor) {
    currentInterceptor.cleanup();
    currentInterceptor = null;
  }
  // Clean up universal file interception
  cleanupFileInterception();
}

// Handle page unload
window.addEventListener('unload', cleanup);

// Listen for session changes — activate when user signs in
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.obfusca_access_token) {
    if (changes.obfusca_access_token.newValue && !initialized) {
      console.log('[Obfusca] Session detected (user signed in) — initializing protection');
      init();
    } else if (!changes.obfusca_access_token.newValue && initialized) {
      console.log('[Obfusca] Session removed (user signed out) — deactivating protection');
      cleanup();
      initialized = false;
      if (isClaudeSite()) {
        sendToMainWorld('session-state', { active: false });
      }
    }
  }
});

// Listen for protection toggle changes from popup
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && 'enabled' in changes) {
    const newEnabled = changes.enabled.newValue !== false;
    console.log(`[Obfusca] Protection toggle changed: ${newEnabled}`);

    if (!newEnabled && protectionEnabled) {
      // Disabling protection — tear down all interception
      protectionEnabled = false;
      console.log('[Obfusca] Protection disabled — removing all interception');
      cleanup();
      initialized = false;
      if (isClaudeSite()) {
        sendToMainWorld('protection-state', { enabled: false });
      }
    } else if (newEnabled && !protectionEnabled) {
      // Re-enabling protection — reinitialize
      protectionEnabled = true;
      console.log('[Obfusca] Protection re-enabled — reinitializing');
      if (isClaudeSite()) {
        sendToMainWorld('protection-state', { enabled: true });
      }
      if (!initialized) {
        init();
      }
    }
  }
});

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  console.log('[Obfusca] DOM not ready, waiting for DOMContentLoaded...');
  document.addEventListener('DOMContentLoaded', init);
} else {
  console.log('[Obfusca] DOM already ready, initializing immediately');
  init();
}
