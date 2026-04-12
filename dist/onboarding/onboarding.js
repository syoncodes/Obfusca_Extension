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
  const BACKEND_URL = API_URL;
  const CUSTOM_PATTERNS_STORAGE_KEYS = {
    PATTERNS: "customPatterns",
    LAST_SYNC: "customPatternsLastSync"
  };
  async function syncCustomPatternsInternal(accessToken) {
    console.log("[Obfusca Auth] syncCustomPatternsInternal: Starting sync...");
    try {
      const response = await fetch(`${BACKEND_URL}/custom-patterns`, {
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
  const DASHBOARD_URL = "https://app.obfusca.ai";
  let inviteInfo = null;
  const steps = {};
  function showStep(stepName) {
    Object.values(steps).forEach((step) => step.classList.remove("active"));
    if (steps[stepName]) {
      steps[stepName].classList.add("active");
    }
  }
  function showMessage(containerId, text, type) {
    const container = document.getElementById(containerId);
    if (container) {
      container.textContent = text;
      container.className = `message ${type}`;
      container.classList.remove("hidden");
    }
  }
  function hideMessage(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
      container.classList.add("hidden");
    }
  }
  async function validateInviteCode(code) {
    if (code.length !== 8) return;
    const validateBtn = document.getElementById("validate-invite");
    validateBtn.disabled = true;
    validateBtn.innerHTML = '<span class="spinner"></span>Validating...';
    hideMessage("invite-message");
    try {
      const response = await fetch(`${API_URL}/invites/validate/${code.toUpperCase()}`);
      const data = await response.json();
      inviteInfo = data;
      if (data.valid) {
        const orgPreview = document.getElementById("org-preview");
        const orgName = document.getElementById("org-name");
        const orgInvitedBy = document.getElementById("org-invited-by");
        const orgRole = document.getElementById("org-role");
        const accountForm = document.getElementById("account-form");
        orgName.textContent = data.org_name || "Organization";
        orgInvitedBy.textContent = data.invited_by ? `Invited by ${data.invited_by}` : "";
        orgRole.textContent = data.role || "member";
        orgPreview.classList.remove("hidden");
        accountForm.classList.remove("hidden");
        if (data.email) {
          const emailInput = document.getElementById("join-email");
          emailInput.value = data.email;
          emailInput.disabled = true;
        }
        validateBtn.textContent = "Join Organization";
      } else {
        showMessage("invite-message", data.message || "Invalid invite code", "error");
        document.getElementById("org-preview").classList.add("hidden");
        document.getElementById("account-form").classList.add("hidden");
        validateBtn.textContent = "Continue";
      }
    } catch (err) {
      showMessage("invite-message", "Failed to validate invite code", "error");
      validateBtn.textContent = "Continue";
    } finally {
      validateBtn.disabled = false;
    }
  }
  async function handleJoin() {
    if (!(inviteInfo == null ? void 0 : inviteInfo.valid)) {
      const codeInput = document.getElementById("invite-code");
      await validateInviteCode(codeInput.value);
      return;
    }
    const email = document.getElementById("join-email").value;
    const password = document.getElementById("join-password").value;
    const confirm = document.getElementById("join-confirm").value;
    const code = document.getElementById("invite-code").value;
    if (!email || !password || !confirm) {
      showMessage("invite-message", "Please fill in all fields", "error");
      return;
    }
    if (password.length < 8) {
      showMessage("invite-message", "Password must be at least 8 characters", "error");
      return;
    }
    if (password !== confirm) {
      showMessage("invite-message", "Passwords do not match", "error");
      return;
    }
    const btn = document.getElementById("validate-invite");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Joining...';
    hideMessage("invite-message");
    try {
      const response = await fetch(`${API_URL}/auth/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          invite_code: code.toUpperCase()
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to join");
      }
      const signInResult = await signInWithPassword(email, password);
      if (signInResult.success) {
        let user = await getCurrentUser();
        if (user && !user.tenantName) {
          user = await refreshCurrentUserTenantInfo();
        }
        chrome.storage.local.set({ onboardingComplete: true });
        const successMessage = document.getElementById("success-message");
        successMessage.textContent = `Welcome to ${data.org_name || "your organization"}! Obfusca is now protecting your data.`;
        showStep("success");
      } else {
        throw new Error(signInResult.error || "Failed to sign in after joining");
      }
    } catch (err) {
      showMessage("invite-message", err instanceof Error ? err.message : "Failed to join", "error");
      btn.disabled = false;
      btn.textContent = "Join Organization";
    }
  }
  async function handleSignIn() {
    const email = document.getElementById("signin-email").value;
    const password = document.getElementById("signin-password").value;
    if (!email || !password) {
      showMessage("signin-message", "Please enter email and password", "error");
      return;
    }
    const btn = document.getElementById("do-signin");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Signing in...';
    hideMessage("signin-message");
    try {
      const result = await signInWithPassword(email, password);
      if (result.success) {
        let user = await getCurrentUser();
        if (user && !user.tenantName) {
          user = await refreshCurrentUserTenantInfo();
        }
        chrome.storage.local.set({ onboardingComplete: true });
        const successMessage = document.getElementById("success-message");
        successMessage.textContent = (user == null ? void 0 : user.tenantName) ? `Welcome back! Connected to ${user.tenantName}.` : "You are now signed in. Obfusca is protecting your data.";
        showStep("success");
      } else {
        throw new Error(result.error || "Sign in failed");
      }
    } catch (err) {
      showMessage("signin-message", err instanceof Error ? err.message : "Sign in failed", "error");
      btn.disabled = false;
      btn.textContent = "Sign In";
    }
  }
  function init() {
    steps.welcome = document.getElementById("step-welcome");
    steps.invite = document.getElementById("step-invite");
    steps.signin = document.getElementById("step-signin");
    steps.signup = document.getElementById("step-signup");
    steps.success = document.getElementById("step-success");
    const options = document.querySelectorAll(".option[data-choice]");
    options.forEach((option) => {
      option.addEventListener("click", () => {
        const choice = option.getAttribute("data-choice");
        if (choice === "invite") {
          showStep("invite");
        } else if (choice === "signin") {
          showStep("signin");
        } else if (choice === "signup") {
          showStep("signup");
        }
      });
    });
    const inviteCodeInput = document.getElementById("invite-code");
    inviteCodeInput.addEventListener("input", (e) => {
      const input = e.target;
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    });
    document.getElementById("validate-invite").addEventListener("click", handleJoin);
    document.getElementById("back-from-invite").addEventListener("click", () => {
      inviteInfo = null;
      document.getElementById("org-preview").classList.add("hidden");
      document.getElementById("account-form").classList.add("hidden");
      document.getElementById("invite-code").value = "";
      document.getElementById("validate-invite").textContent = "Continue";
      hideMessage("invite-message");
      showStep("welcome");
    });
    document.getElementById("do-signin").addEventListener("click", handleSignIn);
    document.getElementById("back-from-signin").addEventListener("click", () => {
      hideMessage("signin-message");
      showStep("welcome");
    });
    document.getElementById("signin-password").addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        handleSignIn();
      }
    });
    document.getElementById("open-signup").addEventListener("click", () => {
      chrome.tabs.create({ url: `${DASHBOARD_URL}/signup` });
    });
    document.getElementById("back-from-signup").addEventListener("click", () => {
      showStep("welcome");
    });
    document.getElementById("close-onboarding").addEventListener("click", () => {
      window.close();
    });
    const urlParams = new URLSearchParams(window.location.search);
    const codeFromUrl = urlParams.get("code");
    if (codeFromUrl) {
      document.getElementById("invite-code").value = codeFromUrl.toUpperCase();
      showStep("invite");
      validateInviteCode(codeFromUrl);
    }
  }
  document.addEventListener("DOMContentLoaded", init);
})();
//# sourceMappingURL=onboarding.js.map
