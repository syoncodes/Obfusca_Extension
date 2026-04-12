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
  async function getCurrentUser() {
    const session = await getSession();
    return (session == null ? void 0 : session.user) || null;
  }
  async function refreshCurrentUserTenantInfo() {
    console.log("[Obfusca Auth] refreshCurrentUserTenantInfo: Refreshing tenant info for current user");
    const session = await getSession();
    if (!session) {
      console.log("[Obfusca Auth] refreshCurrentUserTenantInfo: No session found");
      return null;
    }
    const tenantInfo = await fetchUserTenantInfo(session.user.id, session.accessToken);
    if (!tenantInfo) {
      console.warn("[Obfusca Auth] refreshCurrentUserTenantInfo: Could not fetch tenant info");
      return session.user;
    }
    const updatedUser = {
      ...session.user,
      tenantId: tenantInfo.tenantId,
      tenantName: tenantInfo.tenantName,
      tenantSlug: tenantInfo.tenantSlug,
      role: tenantInfo.role
    };
    await saveSession({
      ...session,
      user: updatedUser
    });
    console.log("[Obfusca Auth] refreshCurrentUserTenantInfo: Updated user with tenant info", {
      tenantId: updatedUser.tenantId,
      tenantName: updatedUser.tenantName
    });
    return updatedUser;
  }
  async function isLoggedIn() {
    const token = await getAccessToken();
    return token !== null;
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
  async function signInWithPassword(email, password) {
    try {
      console.log("[Obfusca Auth] signInWithPassword: Attempting login for", email);
      const response = await fetch(
        `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ email, password })
        }
      );
      if (!response.ok) {
        const error = await response.json();
        console.error("[Obfusca Auth] signInWithPassword: Auth failed", error);
        return {
          success: false,
          error: error.error_description || error.msg || "Login failed"
        };
      }
      const data = await response.json();
      console.log("[Obfusca Auth] signInWithPassword: Auth successful for user", data.user.id);
      const tenantInfo = await fetchUserTenantInfo(data.user.id, data.access_token);
      const user = {
        id: data.user.id,
        email: data.user.email,
        tenantId: tenantInfo == null ? void 0 : tenantInfo.tenantId,
        tenantName: tenantInfo == null ? void 0 : tenantInfo.tenantName,
        tenantSlug: tenantInfo == null ? void 0 : tenantInfo.tenantSlug,
        role: (tenantInfo == null ? void 0 : tenantInfo.role) || "member"
      };
      console.log("[Obfusca Auth] signInWithPassword: User info with tenant", {
        email: user.email,
        tenantId: user.tenantId,
        tenantName: user.tenantName,
        role: user.role
      });
      await saveSession({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at,
        user
      });
      syncCustomPatternsInternal(data.access_token).catch((err) => {
        console.error("[Obfusca Auth] signInWithPassword: Failed to sync custom patterns:", err);
      });
      return { success: true };
    } catch (error) {
      console.error("[Obfusca Auth] signInWithPassword: Error", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Network error"
      };
    }
  }
  async function signInWithMagicLink(email) {
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/magiclink`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ email })
      });
      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error_description || error.msg || "Failed to send magic link"
        };
      }
      return { success: true };
    } catch (error) {
      console.error("Obfusca: Magic link error", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Network error"
      };
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
  async function signOut() {
    const session = await getSession();
    if (session == null ? void 0 : session.accessToken) {
      try {
        await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            apikey: SUPABASE_ANON_KEY
          }
        });
      } catch {
      }
    }
    await clearSession();
    await clearCustomPatternsStorage();
  }
  const BACKEND_URL$2 = API_URL;
  const CUSTOM_PATTERNS_STORAGE_KEYS = {
    PATTERNS: "customPatterns",
    LAST_SYNC: "customPatternsLastSync"
  };
  async function syncCustomPatternsInternal(accessToken) {
    console.log("[Obfusca Auth] syncCustomPatternsInternal: Starting sync...");
    try {
      const response = await fetch(`${BACKEND_URL$2}/custom-patterns`, {
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
  async function clearCustomPatternsStorage() {
    console.log("[Obfusca Auth] clearCustomPatternsStorage: Clearing cached patterns");
    return new Promise((resolve) => {
      chrome.storage.local.remove(
        [
          CUSTOM_PATTERNS_STORAGE_KEYS.PATTERNS,
          CUSTOM_PATTERNS_STORAGE_KEYS.LAST_SYNC
        ],
        resolve
      );
    });
  }
  const BACKEND_URL$1 = API_URL;
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
      const response = await fetch(`${BACKEND_URL$1}/extension/status`, {
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
  const BACKEND_URL = API_URL;
  let enabledToggle;
  let backendDot;
  let backendText;
  let authLoggedOut;
  let authLoggedIn;
  let emailInput;
  let passwordInput;
  let loginBtn;
  let magicLinkBtn;
  let logoutBtn;
  let loginMessage;
  let userEmailDisplay;
  let userTenantDisplay;
  let userPlanDisplay;
  let upgradeLinkEl;
  let currentPlanInfo = null;
  async function checkBackendStatus() {
    try {
      const response = await fetch(`${BACKEND_URL}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(3e3)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  async function fetchPlanInfo() {
    try {
      const token = await getAccessToken();
      if (!token) return null;
      const response = await fetch(`${BACKEND_URL}/plans/current`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        signal: AbortSignal.timeout(5e3)
      });
      if (!response.ok) {
        console.log("[Obfusca Popup] Plan fetch returned", response.status);
        return null;
      }
      const data = await response.json();
      console.log("[Obfusca Popup] Plan info:", data);
      currentPlanInfo = data;
      return data;
    } catch (err) {
      console.log("[Obfusca Popup] Failed to fetch plan:", err instanceof Error ? err.message : "unknown");
      return null;
    }
  }
  function getPlanDisplayName(info) {
    const { plan, status, trial_days_remaining } = info;
    if (status === "trialing" && trial_days_remaining !== null) {
      return `Trial (${trial_days_remaining}d left)`;
    }
    if (status === "expired") {
      return "Trial Expired";
    }
    switch (plan) {
      case "individual":
        return "Individual";
      case "team":
        return "Team";
      case "enterprise":
        return "Enterprise";
      default:
        return plan.charAt(0).toUpperCase() + plan.slice(1);
    }
  }
  function getPlanBadgeClass(info) {
    if (info.status === "expired") return "expired";
    if (info.status === "trialing") return "trialing";
    return "active";
  }
  function getProtectionText(info) {
    if (!info) return "Connected";
    if (info.status === "expired") return "Warn-only mode";
    if (info.status === "trialing") return "Full protection (trial)";
    return "Full protection";
  }
  function updatePlanDisplay(info) {
    if (!userPlanDisplay || !upgradeLinkEl) return;
    if (!info) {
      userPlanDisplay.classList.add("hidden");
      upgradeLinkEl.classList.add("hidden");
      return;
    }
    const badgeClass = getPlanBadgeClass(info);
    const displayName = getPlanDisplayName(info);
    userPlanDisplay.innerHTML = `<span class="plan-badge ${badgeClass}">${displayName}</span>`;
    userPlanDisplay.classList.remove("hidden");
    if (info.status === "trialing") {
      upgradeLinkEl.textContent = "Subscribe to keep access after trial →";
      upgradeLinkEl.className = "upgrade-link";
      upgradeLinkEl.classList.remove("hidden");
    } else if (info.status === "expired") {
      upgradeLinkEl.textContent = "Subscribe to continue protection →";
      upgradeLinkEl.className = "upgrade-link expired";
      upgradeLinkEl.classList.remove("hidden");
    } else {
      upgradeLinkEl.classList.add("hidden");
    }
  }
  function updateBackendStatus(status) {
    console.log("[Obfusca Popup] Updating backend status:", status);
    if (backendDot && backendText) {
      if (status.backendConnected && status.authenticated) {
        backendDot.className = "status-dot connected";
        backendText.textContent = getProtectionText(currentPlanInfo);
      } else if (status.backendConnected && !status.authenticated) {
        backendDot.className = "status-dot connected";
        backendText.textContent = "Connected (not logged in)";
      } else {
        backendDot.className = "status-dot disconnected";
        backendText.textContent = "Backend offline (local-only mode)";
      }
    }
  }
  function showMessage(text, type) {
    if (loginMessage) {
      loginMessage.textContent = text;
      loginMessage.className = `message ${type}`;
      loginMessage.classList.remove("hidden");
    }
  }
  function hideMessage() {
    if (loginMessage) {
      loginMessage.classList.add("hidden");
    }
  }
  function showLoggedInState(user) {
    authLoggedOut.classList.add("hidden");
    authLoggedIn.classList.remove("hidden");
    userEmailDisplay.textContent = user.email;
    userTenantDisplay.textContent = user.tenantName ? `Tenant: ${user.tenantName}` : "No tenant assigned";
  }
  function showLoggedOutState() {
    authLoggedIn.classList.add("hidden");
    authLoggedOut.classList.remove("hidden");
    emailInput.value = "";
    passwordInput.value = "";
    hideMessage();
    currentPlanInfo = null;
    updatePlanDisplay(null);
  }
  async function handleLogin() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email) {
      showMessage("Please enter your email", "error");
      return;
    }
    if (!password) {
      showMessage("Please enter your password", "error");
      return;
    }
    loginBtn.disabled = true;
    magicLinkBtn.disabled = true;
    loginBtn.innerHTML = '<span class="spinner"></span>Signing in...';
    hideMessage();
    const result = await signInWithPassword(email, password);
    loginBtn.disabled = false;
    magicLinkBtn.disabled = false;
    loginBtn.innerHTML = "Sign In";
    if (result.success) {
      let user = await getCurrentUser();
      if (user && !user.tenantName) {
        console.log("[Obfusca Popup] Tenant info missing after login, refreshing...");
        const updatedUser = await refreshCurrentUserTenantInfo();
        if (updatedUser) {
          user = updatedUser;
        }
      }
      if (user) {
        showLoggedInState(user);
        const planInfo = await fetchPlanInfo();
        updatePlanDisplay(planInfo);
        updateBackendStatus({
          backendConnected: true,
          authenticated: true,
          mode: "full"
        });
        chrome.storage.local.get(["enabled"], (settings) => {
          reportExtensionStatus(settings.enabled !== false).catch(() => {
          });
        });
      }
    } else {
      showMessage(result.error || "Login failed", "error");
    }
  }
  async function handleMagicLink() {
    const email = emailInput.value.trim();
    if (!email) {
      showMessage("Please enter your email", "error");
      return;
    }
    loginBtn.disabled = true;
    magicLinkBtn.disabled = true;
    magicLinkBtn.innerHTML = '<span class="spinner"></span>Sending...';
    hideMessage();
    const result = await signInWithMagicLink(email);
    loginBtn.disabled = false;
    magicLinkBtn.disabled = false;
    magicLinkBtn.innerHTML = "Send Magic Link";
    if (result.success) {
      showMessage("Check your email for the login link", "success");
    } else {
      showMessage(result.error || "Failed to send magic link", "error");
    }
  }
  async function handleLogout() {
    logoutBtn.disabled = true;
    logoutBtn.innerHTML = "Signing out...";
    await signOut();
    logoutBtn.disabled = false;
    logoutBtn.innerHTML = "Sign Out";
    showLoggedOutState();
  }
  async function init() {
    enabledToggle = document.getElementById("enabled-toggle");
    backendDot = document.getElementById("backend-dot");
    backendText = document.getElementById("backend-text");
    authLoggedOut = document.getElementById("auth-logged-out");
    authLoggedIn = document.getElementById("auth-logged-in");
    emailInput = document.getElementById("email");
    passwordInput = document.getElementById("password");
    loginBtn = document.getElementById("login-btn");
    magicLinkBtn = document.getElementById("magic-link-btn");
    logoutBtn = document.getElementById("logout-btn");
    loginMessage = document.getElementById("login-message");
    userEmailDisplay = document.getElementById("user-email");
    userTenantDisplay = document.getElementById("user-tenant");
    userPlanDisplay = document.getElementById("user-plan");
    upgradeLinkEl = document.getElementById("upgrade-link");
    if (upgradeLinkEl) {
      upgradeLinkEl.addEventListener("click", () => {
        chrome.tabs.create({ url: "https://app.obfusca.ai/settings/billing" });
      });
    }
    chrome.storage.local.get(["enabled"], (settings) => {
      if (enabledToggle) {
        enabledToggle.checked = settings.enabled !== false;
      }
    });
    if (enabledToggle) {
      enabledToggle.addEventListener("change", () => {
        const newState = enabledToggle.checked;
        chrome.storage.local.set({ enabled: newState });
        reportExtensionStatus(newState).catch(() => {
        });
      });
    }
    loginBtn.addEventListener("click", handleLogin);
    magicLinkBtn.addEventListener("click", handleMagicLink);
    logoutBtn.addEventListener("click", handleLogout);
    passwordInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        handleLogin();
      }
    });
    emailInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        passwordInput.focus();
      }
    });
    console.log("[Obfusca Popup] Checking authentication state...");
    const loggedIn = await isLoggedIn();
    console.log("[Obfusca Popup] User logged in:", loggedIn);
    if (loggedIn) {
      let user = await getCurrentUser();
      console.log("[Obfusca Popup] Current user:", user == null ? void 0 : user.email, "tenantName:", user == null ? void 0 : user.tenantName);
      if (user && !user.tenantName) {
        console.log("[Obfusca Popup] Tenant info missing, refreshing...");
        userTenantDisplay.textContent = "Loading tenant info...";
        const updatedUser = await refreshCurrentUserTenantInfo();
        if (updatedUser) {
          user = updatedUser;
          console.log("[Obfusca Popup] Tenant info refreshed:", user.tenantName);
        }
      }
      if (user) {
        showLoggedInState(user);
      } else {
        showLoggedOutState();
      }
      fetchPlanInfo().then((planInfo) => {
        updatePlanDisplay(planInfo);
      }).catch((err) => {
        console.log("[Obfusca Popup] Plan fetch failed:", err);
      });
      console.log("[Obfusca Popup] Triggering custom patterns sync...");
      syncCustomPatterns().catch((err) => {
        console.error("[Obfusca Popup] Failed to sync custom patterns:", err);
      });
    } else {
      showLoggedOutState();
    }
    console.log("[Obfusca Popup] Checking backend status...");
    const backendConnected = await checkBackendStatus();
    console.log("[Obfusca Popup] Backend connected:", backendConnected);
    updateBackendStatus({
      backendConnected,
      authenticated: loggedIn,
      mode: backendConnected ? "full" : "local-only"
    });
    setInterval(async () => {
      const connected = await checkBackendStatus();
      const authenticated = await isLoggedIn();
      updateBackendStatus({
        backendConnected: connected,
        authenticated,
        mode: connected ? "full" : "local-only"
      });
    }, 1e4);
    const footerElement = document.querySelector(".footer");
    if (footerElement && footerElement.parentNode) {
      const supportLink = document.createElement("a");
      supportLink.textContent = "Report a Bug · Support";
      supportLink.style.cssText = "display:block; text-align:center; font-size:11px; color:#666; cursor:pointer; padding:8px 0 4px; text-decoration:none;";
      supportLink.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: "https://www.obfusca.ai/support" });
      });
      supportLink.addEventListener("mouseenter", () => {
        supportLink.style.color = "#999";
      });
      supportLink.addEventListener("mouseleave", () => {
        supportLink.style.color = "#666";
      });
      footerElement.parentNode.insertBefore(supportLink, footerElement);
    }
  }
  document.addEventListener("DOMContentLoaded", init);
})();
//# sourceMappingURL=popup.js.map
