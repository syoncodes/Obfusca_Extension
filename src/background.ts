/**
 * Background service worker for Obfusca extension.
 * Handles extension lifecycle, cross-tab communication, and periodic sync.
 */

import { syncCustomPatterns } from './auth';
import { reportExtensionStatus } from './api';
import { API_URL } from './config';

// Alarm name for periodic custom pattern sync
const CUSTOM_PATTERNS_SYNC_ALARM = 'obfusca_custom_patterns_sync';

// Alarm name for periodic extension status heartbeat
const STATUS_HEARTBEAT_ALARM = 'obfusca_status_heartbeat';

// Extension installation/update handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Obfusca: Extension installed');
    // Set default settings
    chrome.storage.local.set({
      enabled: true,
      failMode: 'block', // 'block' or 'allow' when backend unavailable
      localDetectionOnly: false,
      onboardingComplete: false,
    });

    // Open onboarding page on first install
    chrome.tabs.create({
      url: chrome.runtime.getURL('onboarding/onboarding.html'),
    });

    // Set up periodic sync alarm for custom patterns
    setupCustomPatternsSyncAlarm();
    // Set up heartbeat alarm for extension status
    setupStatusHeartbeatAlarm();
  } else if (details.reason === 'update') {
    console.log('Obfusca: Extension updated to', chrome.runtime.getManifest().version);
    // Ensure alarms are set up after update
    setupCustomPatternsSyncAlarm();
    setupStatusHeartbeatAlarm();
    // Report status after update (fire-and-forget)
    chrome.storage.local.get(['enabled'], (settings) => {
      reportExtensionStatus(settings.enabled !== false).catch(() => {});
    });
  }
});

/**
 * Set up periodic alarm for syncing custom patterns.
 * Runs every 5 minutes to keep patterns fresh.
 */
function setupCustomPatternsSyncAlarm(): void {
  // Check if alarms API is available
  if (!chrome.alarms) {
    console.warn('[Obfusca Background] Alarms API not available - skipping alarm setup');
    return;
  }

  console.log('[Obfusca Background] Setting up custom patterns sync alarm (every 5 minutes)');

  // Clear any existing alarm first
  chrome.alarms.clear(CUSTOM_PATTERNS_SYNC_ALARM, () => {
    // Create alarm to fire every 5 minutes
    chrome.alarms.create(CUSTOM_PATTERNS_SYNC_ALARM, {
      delayInMinutes: 1, // First sync after 1 minute
      periodInMinutes: 5, // Then every 5 minutes
    });
  });
}

/**
 * Set up periodic alarm for extension status heartbeat.
 * Runs every 30 minutes to keep the backend aware the extension is alive.
 */
function setupStatusHeartbeatAlarm(): void {
  if (!chrome.alarms) {
    console.warn('[Obfusca Background] Alarms API not available - skipping heartbeat alarm setup');
    return;
  }

  console.log('[Obfusca Background] Setting up status heartbeat alarm (every 30 minutes)');

  chrome.alarms.clear(STATUS_HEARTBEAT_ALARM, () => {
    chrome.alarms.create(STATUS_HEARTBEAT_ALARM, {
      delayInMinutes: 1, // First heartbeat after 1 minute
      periodInMinutes: 30, // Then every 30 minutes
    });
  });
}

// Handle alarms (with safety check)
if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CUSTOM_PATTERNS_SYNC_ALARM) {
      console.log('[Obfusca Background] Custom patterns sync alarm fired');
      // syncCustomPatterns already handles no-session case gracefully
      syncCustomPatterns().catch((err) => {
        // Log as info, not error - likely just not logged in
        console.log('[Obfusca Background] Sync skipped:', err instanceof Error ? err.message : 'unknown');
      });
    } else if (alarm.name === STATUS_HEARTBEAT_ALARM) {
      console.log('[Obfusca Background] Status heartbeat alarm fired');
      chrome.storage.local.get(['enabled'], (settings) => {
        reportExtensionStatus(settings.enabled !== false).catch((err) => {
          console.log('[Obfusca Background] Heartbeat skipped:', err instanceof Error ? err.message : 'unknown');
        });
      });
    }
  });
}

// Listen for storage changes to detect toggle changes from other contexts
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.enabled !== undefined) {
    const newValue = changes.enabled.newValue;
    console.log('[Obfusca Background] Protection toggle changed to:', newValue);
    reportExtensionStatus(newValue !== false).catch(() => {});
  }
});

// Message handler for content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_SETTINGS':
      chrome.storage.local.get(['enabled', 'failMode', 'localDetectionOnly'], (settings) => {
        sendResponse(settings);
      });
      return true; // Keep channel open for async response

    case 'LOG_DETECTION':
      // Log detection event (without PII)
      console.log('Obfusca: Detection logged', {
        tabId: sender.tab?.id,
        url: sender.tab?.url,
        detectionTypes: message.detectionTypes,
        action: message.action, // 'blocked' or 'allowed'
        timestamp: new Date().toISOString(),
      });
      sendResponse({ success: true });
      break;

    case 'CHECK_BACKEND':
      // Ping backend to check if it's available
      fetch(`${API_URL}/health`, { method: 'GET' })
        .then((response) => response.ok)
        .then((isHealthy) => sendResponse({ available: isHealthy }))
        .catch(() => sendResponse({ available: false }));
      return true; // Keep channel open for async response

    default:
      console.warn('Obfusca: Unknown message type', message.type);
  }
});

// Supported site patterns for logging
const SUPPORTED_SITES = [
  'chatgpt.com',
  'chat.openai.com',
  'claude.ai',
  'gemini.google.com',
  'bard.google.com',
  'grok.com',
  'x.com',
  'twitter.com',
  'chat.deepseek.com',
  'deepseek.com',
  'github.com',
];

/**
 * Check if a URL matches any supported site.
 */
function isSupportedSite(url: string): string | null {
  for (const site of SUPPORTED_SITES) {
    if (url.includes(site)) {
      return site;
    }
  }
  return null;
}

// Tab update handler - log when supported sites load
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const matchedSite = isSupportedSite(tab.url);
    if (matchedSite) {
      console.log(`Obfusca: Supported site "${matchedSite}" loaded (tab ${tabId})`);
    }
  }
});

// Extension icon click handler (in case popup is disabled)
chrome.action.onClicked.addListener((_tab) => {
  // Toggle enabled state
  chrome.storage.local.get(['enabled'], (result) => {
    const newState = !result.enabled;
    chrome.storage.local.set({ enabled: newState });

    // Update icon to reflect state
    chrome.action.setIcon({
      path: newState
        ? {
            16: 'icons/icon16.png',
            48: 'icons/icon48.png',
            128: 'icons/icon128.png',
          }
        : {
            16: 'icons/icon16-disabled.png',
            48: 'icons/icon48-disabled.png',
            128: 'icons/icon128-disabled.png',
          },
    });
  });
});

console.log('Obfusca: Background service worker started');

// On service worker startup, ensure alarms are set up, do initial sync & status report
// This handles cases where the browser was closed and reopened
(async () => {
  try {
    // Check if alarms already exist (with safety check for alarms API)
    if (chrome.alarms) {
      const syncAlarm = await chrome.alarms.get(CUSTOM_PATTERNS_SYNC_ALARM);
      if (!syncAlarm) {
        console.log('[Obfusca Background] No sync alarm found, setting up...');
        setupCustomPatternsSyncAlarm();
      }
      const heartbeatAlarm = await chrome.alarms.get(STATUS_HEARTBEAT_ALARM);
      if (!heartbeatAlarm) {
        console.log('[Obfusca Background] No heartbeat alarm found, setting up...');
        setupStatusHeartbeatAlarm();
      }
    }

    // Only sync if we might be logged in (sync function checks session internally)
    console.log('[Obfusca Background] Running initial custom patterns sync...');
    await syncCustomPatterns();

    // Report extension status on startup (fire-and-forget)
    chrome.storage.local.get(['enabled'], (settings) => {
      reportExtensionStatus(settings.enabled !== false).catch((err) => {
        console.log('[Obfusca Background] Startup status report skipped:', err instanceof Error ? err.message : 'unknown');
      });
    });
  } catch (err) {
    // Don't log as error - this might just be because user isn't logged in
    console.log('[Obfusca Background] Startup sync skipped:', err instanceof Error ? err.message : 'unknown');
  }
})();
