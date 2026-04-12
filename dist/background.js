(function() {
  "use strict";
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
  const CUSTOM_PATTERNS_STORAGE_KEYS = {
    PATTERNS: "customPatterns",
    LAST_SYNC: "customPatternsLastSync"
  };
  async function syncCustomPatternsInternal(accessToken) {
    console.log("[Obfusca Auth] syncCustomPatternsInternal: Starting sync...");
    try {
      const response = await fetch(`${BACKEND_URL$1}/custom-patterns`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        signal: AbortSignal.timeout(1e4)
      });
      if (response.status === 401) {
        console.log("[Obfusca Auth] syncCustomPatternsInternal: Token expired or invalid, skipping sync");
        return;
      }
      if (!response.ok) {
        console.log("[Obfusca Auth] syncCustomPatternsInternal: Server returned", response.status, "- skipping sync");
        return;
      }
      const data = await response.json();
      const patterns = data.patterns || [];
      await chrome.storage.local.set({
        [CUSTOM_PATTERNS_STORAGE_KEYS.PATTERNS]: patterns,
        [CUSTOM_PATTERNS_STORAGE_KEYS.LAST_SYNC]: Date.now()
      });
      console.log(`[Obfusca Auth] syncCustomPatternsInternal: Synced ${patterns.length} custom patterns`);
    } catch (err) {
      console.log("[Obfusca Auth] syncCustomPatternsInternal: Sync unavailable:", err instanceof Error ? err.message : "unknown error");
    }
  }
  async function syncCustomPatterns() {
    const session = await getSession();
    if (!(session == null ? void 0 : session.accessToken)) {
      console.log("[Obfusca Auth] syncCustomPatterns: No session, skipping sync");
      return;
    }
    await syncCustomPatternsInternal(session.accessToken);
  }
  const BACKEND_URL = API_URL;
  async function reportExtensionStatus(protectionEnabled) {
    console.log("[Obfusca Status] Reporting extension status: protection_enabled=", protectionEnabled);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        console.log("[Obfusca Status] No access token -- skipping status report");
        return;
      }
      const manifest = chrome.runtime.getManifest();
      const payload = {
        protection_enabled: protectionEnabled,
        extension_version: manifest.version,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      const response = await fetch(`${BACKEND_URL}/extension/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5e3)
      });
      if (!response.ok) {
        console.warn("[Obfusca Status] Status report failed:", response.status);
      } else {
        console.log("[Obfusca Status] Status reported successfully");
      }
    } catch (error) {
      console.log("[Obfusca Status] Status report error:", error instanceof Error ? error.message : "unknown");
    }
  }
  const CUSTOM_PATTERNS_SYNC_ALARM = "obfusca_custom_patterns_sync";
  const STATUS_HEARTBEAT_ALARM = "obfusca_status_heartbeat";
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      console.log("Obfusca: Extension installed");
      chrome.storage.local.set({
        enabled: true,
        failMode: "block",
        // 'block' or 'allow' when backend unavailable
        localDetectionOnly: false,
        onboardingComplete: false
      });
      chrome.tabs.create({
        url: chrome.runtime.getURL("onboarding/onboarding.html")
      });
      setupCustomPatternsSyncAlarm();
      setupStatusHeartbeatAlarm();
    } else if (details.reason === "update") {
      console.log("Obfusca: Extension updated to", chrome.runtime.getManifest().version);
      setupCustomPatternsSyncAlarm();
      setupStatusHeartbeatAlarm();
      chrome.storage.local.get(["enabled"], (settings) => {
        reportExtensionStatus(settings.enabled !== false).catch(() => {
        });
      });
    }
  });
  function setupCustomPatternsSyncAlarm() {
    if (!chrome.alarms) {
      console.warn("[Obfusca Background] Alarms API not available - skipping alarm setup");
      return;
    }
    console.log("[Obfusca Background] Setting up custom patterns sync alarm (every 5 minutes)");
    chrome.alarms.clear(CUSTOM_PATTERNS_SYNC_ALARM, () => {
      chrome.alarms.create(CUSTOM_PATTERNS_SYNC_ALARM, {
        delayInMinutes: 1,
        // First sync after 1 minute
        periodInMinutes: 5
        // Then every 5 minutes
      });
    });
  }
  function setupStatusHeartbeatAlarm() {
    if (!chrome.alarms) {
      console.warn("[Obfusca Background] Alarms API not available - skipping heartbeat alarm setup");
      return;
    }
    console.log("[Obfusca Background] Setting up status heartbeat alarm (every 30 minutes)");
    chrome.alarms.clear(STATUS_HEARTBEAT_ALARM, () => {
      chrome.alarms.create(STATUS_HEARTBEAT_ALARM, {
        delayInMinutes: 1,
        // First heartbeat after 1 minute
        periodInMinutes: 30
        // Then every 30 minutes
      });
    });
  }
  if (chrome.alarms) {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === CUSTOM_PATTERNS_SYNC_ALARM) {
        console.log("[Obfusca Background] Custom patterns sync alarm fired");
        syncCustomPatterns().catch((err) => {
          console.log("[Obfusca Background] Sync skipped:", err instanceof Error ? err.message : "unknown");
        });
      } else if (alarm.name === STATUS_HEARTBEAT_ALARM) {
        console.log("[Obfusca Background] Status heartbeat alarm fired");
        chrome.storage.local.get(["enabled"], (settings) => {
          reportExtensionStatus(settings.enabled !== false).catch((err) => {
            console.log("[Obfusca Background] Heartbeat skipped:", err instanceof Error ? err.message : "unknown");
          });
        });
      }
    });
  }
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.enabled !== void 0) {
      const newValue = changes.enabled.newValue;
      console.log("[Obfusca Background] Protection toggle changed to:", newValue);
      reportExtensionStatus(newValue !== false).catch(() => {
      });
    }
  });
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    var _a, _b;
    switch (message.type) {
      case "GET_SETTINGS":
        chrome.storage.local.get(["enabled", "failMode", "localDetectionOnly"], (settings) => {
          sendResponse(settings);
        });
        return true;
      case "LOG_DETECTION":
        console.log("Obfusca: Detection logged", {
          tabId: (_a = sender.tab) == null ? void 0 : _a.id,
          url: (_b = sender.tab) == null ? void 0 : _b.url,
          detectionTypes: message.detectionTypes,
          action: message.action,
          // 'blocked' or 'allowed'
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
        sendResponse({ success: true });
        break;
      case "CHECK_BACKEND":
        fetch(`${API_URL}/health`, { method: "GET" }).then((response) => response.ok).then((isHealthy) => sendResponse({ available: isHealthy })).catch(() => sendResponse({ available: false }));
        return true;
      default:
        console.warn("Obfusca: Unknown message type", message.type);
    }
  });
  const SUPPORTED_SITES = [
    "chatgpt.com",
    "chat.openai.com",
    "claude.ai",
    "gemini.google.com",
    "bard.google.com",
    "grok.com",
    "x.com",
    "twitter.com",
    "chat.deepseek.com",
    "deepseek.com",
    "github.com"
  ];
  function isSupportedSite(url) {
    for (const site of SUPPORTED_SITES) {
      if (url.includes(site)) {
        return site;
      }
    }
    return null;
  }
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url) {
      const matchedSite = isSupportedSite(tab.url);
      if (matchedSite) {
        console.log(`Obfusca: Supported site "${matchedSite}" loaded (tab ${tabId})`);
      }
    }
  });
  chrome.action.onClicked.addListener((_tab) => {
    chrome.storage.local.get(["enabled"], (result) => {
      const newState = !result.enabled;
      chrome.storage.local.set({ enabled: newState });
      chrome.action.setIcon({
        path: newState ? {
          16: "icons/icon16.png",
          48: "icons/icon48.png",
          128: "icons/icon128.png"
        } : {
          16: "icons/icon16-disabled.png",
          48: "icons/icon48-disabled.png",
          128: "icons/icon128-disabled.png"
        }
      });
    });
  });
  console.log("Obfusca: Background service worker started");
  (async () => {
    try {
      if (chrome.alarms) {
        const syncAlarm = await chrome.alarms.get(CUSTOM_PATTERNS_SYNC_ALARM);
        if (!syncAlarm) {
          console.log("[Obfusca Background] No sync alarm found, setting up...");
          setupCustomPatternsSyncAlarm();
        }
        const heartbeatAlarm = await chrome.alarms.get(STATUS_HEARTBEAT_ALARM);
        if (!heartbeatAlarm) {
          console.log("[Obfusca Background] No heartbeat alarm found, setting up...");
          setupStatusHeartbeatAlarm();
        }
      }
      console.log("[Obfusca Background] Running initial custom patterns sync...");
      await syncCustomPatterns();
      chrome.storage.local.get(["enabled"], (settings) => {
        reportExtensionStatus(settings.enabled !== false).catch((err) => {
          console.log("[Obfusca Background] Startup status report skipped:", err instanceof Error ? err.message : "unknown");
        });
      });
    } catch (err) {
      console.log("[Obfusca Background] Startup sync skipped:", err instanceof Error ? err.message : "unknown");
    }
  })();
})();
//# sourceMappingURL=background.js.map
