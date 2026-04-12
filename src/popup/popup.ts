/**
 * Popup script for Obfusca extension.
 * Manages the extension popup UI and authentication.
 */

import {
  getCurrentUser,
  getAccessToken,
  signInWithPassword,
  signInWithMagicLink,
  signOut,
  isLoggedIn,
  refreshCurrentUserTenantInfo,
  syncCustomPatterns,
  type AuthUser,
} from '../auth';
import { reportExtensionStatus } from '../api';
import { API_URL } from '../config';

const BACKEND_URL = API_URL;

// Track overall status
interface ConnectionStatus {
  backendConnected: boolean;
  authenticated: boolean;
  mode: 'full' | 'local-only';
}

// Plan info from /plans/current
interface PlanInfo {
  plan: string;
  status: string;
  trial_days_remaining: number | null;
  limits: Record<string, boolean | number>;
}

// DOM Elements
let enabledToggle: HTMLInputElement;
let backendDot: HTMLElement;
let backendText: HTMLElement;
let authLoggedOut: HTMLElement;
let authLoggedIn: HTMLElement;
let emailInput: HTMLInputElement;
let passwordInput: HTMLInputElement;
let loginBtn: HTMLButtonElement;
let magicLinkBtn: HTMLButtonElement;
let logoutBtn: HTMLButtonElement;
let loginMessage: HTMLElement;
let userEmailDisplay: HTMLElement;
let userTenantDisplay: HTMLElement;
let userPlanDisplay: HTMLElement;
let upgradeLinkEl: HTMLElement;

// Current plan info (cached for status updates)
let currentPlanInfo: PlanInfo | null = null;

/**
 * Check if the backend is available.
 */
async function checkBackendStatus(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch plan info from the backend.
 */
async function fetchPlanInfo(): Promise<PlanInfo | null> {
  try {
    const token = await getAccessToken();
    if (!token) return null;

    const response = await fetch(`${BACKEND_URL}/plans/current`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.log('[Obfusca Popup] Plan fetch returned', response.status);
      return null;
    }

    const data: PlanInfo = await response.json();
    console.log('[Obfusca Popup] Plan info:', data);
    currentPlanInfo = data;
    return data;
  } catch (err) {
    console.log('[Obfusca Popup] Failed to fetch plan:', err instanceof Error ? err.message : 'unknown');
    return null;
  }
}

/**
 * Get a human-readable plan display name.
 */
function getPlanDisplayName(info: PlanInfo): string {
  const { plan, status, trial_days_remaining } = info;

  if (status === 'trialing' && trial_days_remaining !== null) {
    return `Trial (${trial_days_remaining}d left)`;
  }

  if (status === 'expired') {
    return 'Trial Expired';
  }

  switch (plan) {
    case 'individual':
      return 'Individual';
    case 'team':
      return 'Team';
    case 'enterprise':
      return 'Enterprise';
    default:
      return plan.charAt(0).toUpperCase() + plan.slice(1);
  }
}

/**
 * Get the CSS class for the plan badge based on status.
 */
function getPlanBadgeClass(info: PlanInfo): string {
  if (info.status === 'expired') return 'expired';
  if (info.status === 'trialing') return 'trialing';
  return 'active';
}

/**
 * Get the protection level text based on plan status.
 */
function getProtectionText(info: PlanInfo | null): string {
  if (!info) return 'Connected';

  if (info.status === 'expired') return 'Warn-only mode';
  // Trial gives full Individual access
  if (info.status === 'trialing') return 'Full protection (trial)';
  return 'Full protection';
}

/**
 * Update the plan display in the popup.
 */
function updatePlanDisplay(info: PlanInfo | null): void {
  if (!userPlanDisplay || !upgradeLinkEl) return;

  if (!info) {
    userPlanDisplay.classList.add('hidden');
    upgradeLinkEl.classList.add('hidden');
    return;
  }

  // Show plan badge
  const badgeClass = getPlanBadgeClass(info);
  const displayName = getPlanDisplayName(info);
  userPlanDisplay.innerHTML = `<span class="plan-badge ${badgeClass}">${displayName}</span>`;
  userPlanDisplay.classList.remove('hidden');

  // Show upgrade link for trialing/expired users
  if (info.status === 'trialing') {
    upgradeLinkEl.textContent = 'Subscribe to keep access after trial \u2192';
    upgradeLinkEl.className = 'upgrade-link';
    upgradeLinkEl.classList.remove('hidden');
  } else if (info.status === 'expired') {
    upgradeLinkEl.textContent = 'Subscribe to continue protection \u2192';
    upgradeLinkEl.className = 'upgrade-link expired';
    upgradeLinkEl.classList.remove('hidden');
  } else {
    upgradeLinkEl.classList.add('hidden');
  }
}

/**
 * Update the backend status indicator with detailed status.
 */
function updateBackendStatus(status: ConnectionStatus): void {
  console.log('[Obfusca Popup] Updating backend status:', status);

  if (backendDot && backendText) {
    if (status.backendConnected && status.authenticated) {
      backendDot.className = 'status-dot connected';
      backendText.textContent = getProtectionText(currentPlanInfo);
    } else if (status.backendConnected && !status.authenticated) {
      backendDot.className = 'status-dot connected';
      backendText.textContent = 'Connected (not logged in)';
    } else {
      backendDot.className = 'status-dot disconnected';
      backendText.textContent = 'Backend offline (local-only mode)';
    }
  }
}


/**
 * Show a message in the login form.
 */
function showMessage(text: string, type: 'error' | 'success'): void {
  if (loginMessage) {
    loginMessage.textContent = text;
    loginMessage.className = `message ${type}`;
    loginMessage.classList.remove('hidden');
  }
}

/**
 * Hide the login message.
 */
function hideMessage(): void {
  if (loginMessage) {
    loginMessage.classList.add('hidden');
  }
}

/**
 * Update UI to show logged-in state.
 */
function showLoggedInState(user: AuthUser): void {
  authLoggedOut.classList.add('hidden');
  authLoggedIn.classList.remove('hidden');

  userEmailDisplay.textContent = user.email;
  userTenantDisplay.textContent = user.tenantName
    ? `Tenant: ${user.tenantName}`
    : 'No tenant assigned';
}

/**
 * Update UI to show logged-out state.
 */
function showLoggedOutState(): void {
  authLoggedIn.classList.add('hidden');
  authLoggedOut.classList.remove('hidden');

  // Clear form
  emailInput.value = '';
  passwordInput.value = '';
  hideMessage();

  // Clear plan display
  currentPlanInfo = null;
  updatePlanDisplay(null);
}

/**
 * Handle login button click.
 */
async function handleLogin(): Promise<void> {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email) {
    showMessage('Please enter your email', 'error');
    return;
  }

  if (!password) {
    showMessage('Please enter your password', 'error');
    return;
  }

  // Disable buttons during login
  loginBtn.disabled = true;
  magicLinkBtn.disabled = true;
  loginBtn.innerHTML = '<span class="spinner"></span>Signing in...';

  hideMessage();

  const result = await signInWithPassword(email, password);

  loginBtn.disabled = false;
  magicLinkBtn.disabled = false;
  loginBtn.innerHTML = 'Sign In';

  if (result.success) {
    let user = await getCurrentUser();
    // If tenant info is missing after login, try to refresh it
    if (user && !user.tenantName) {
      console.log('[Obfusca Popup] Tenant info missing after login, refreshing...');
      const updatedUser = await refreshCurrentUserTenantInfo();
      if (updatedUser) {
        user = updatedUser;
      }
    }
    if (user) {
      showLoggedInState(user);
      // Fetch and display plan info after login
      const planInfo = await fetchPlanInfo();
      updatePlanDisplay(planInfo);
      // Update backend status to reflect plan
      updateBackendStatus({
        backendConnected: true,
        authenticated: true,
        mode: 'full',
      });
      // Report extension status on login (fire-and-forget)
      chrome.storage.local.get(['enabled'], (settings) => {
        reportExtensionStatus(settings.enabled !== false).catch(() => {});
      });
    }
  } else {
    showMessage(result.error || 'Login failed', 'error');
  }
}

/**
 * Handle magic link button click.
 */
async function handleMagicLink(): Promise<void> {
  const email = emailInput.value.trim();

  if (!email) {
    showMessage('Please enter your email', 'error');
    return;
  }

  // Disable buttons
  loginBtn.disabled = true;
  magicLinkBtn.disabled = true;
  magicLinkBtn.innerHTML = '<span class="spinner"></span>Sending...';

  hideMessage();

  const result = await signInWithMagicLink(email);

  loginBtn.disabled = false;
  magicLinkBtn.disabled = false;
  magicLinkBtn.innerHTML = 'Send Magic Link';

  if (result.success) {
    showMessage('Check your email for the login link', 'success');
  } else {
    showMessage(result.error || 'Failed to send magic link', 'error');
  }
}

/**
 * Handle logout button click.
 */
async function handleLogout(): Promise<void> {
  logoutBtn.disabled = true;
  logoutBtn.innerHTML = 'Signing out...';

  await signOut();

  logoutBtn.disabled = false;
  logoutBtn.innerHTML = 'Sign Out';

  showLoggedOutState();
}

/**
 * Initialize the popup.
 */
async function init(): Promise<void> {
  // Get DOM elements
  enabledToggle = document.getElementById('enabled-toggle') as HTMLInputElement;
  backendDot = document.getElementById('backend-dot') as HTMLElement;
  backendText = document.getElementById('backend-text') as HTMLElement;
  authLoggedOut = document.getElementById('auth-logged-out') as HTMLElement;
  authLoggedIn = document.getElementById('auth-logged-in') as HTMLElement;
  emailInput = document.getElementById('email') as HTMLInputElement;
  passwordInput = document.getElementById('password') as HTMLInputElement;
  loginBtn = document.getElementById('login-btn') as HTMLButtonElement;
  magicLinkBtn = document.getElementById('magic-link-btn') as HTMLButtonElement;
  logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement;
  loginMessage = document.getElementById('login-message') as HTMLElement;
  userEmailDisplay = document.getElementById('user-email') as HTMLElement;
  userTenantDisplay = document.getElementById('user-tenant') as HTMLElement;
  userPlanDisplay = document.getElementById('user-plan') as HTMLElement;
  upgradeLinkEl = document.getElementById('upgrade-link') as HTMLElement;

  // Set up upgrade link click handler
  if (upgradeLinkEl) {
    upgradeLinkEl.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://app.obfusca.ai/settings/billing' });
    });
  }

  // Load current settings
  chrome.storage.local.get(['enabled'], (settings) => {
    if (enabledToggle) {
      enabledToggle.checked = settings.enabled !== false;
    }
  });

  // Set up toggle listener
  if (enabledToggle) {
    enabledToggle.addEventListener('change', () => {
      const newState = enabledToggle.checked;
      chrome.storage.local.set({ enabled: newState });
      // Fire-and-forget: report protection toggle change to backend
      reportExtensionStatus(newState).catch(() => {});
    });
  }

  // Set up auth event listeners
  loginBtn.addEventListener('click', handleLogin);
  magicLinkBtn.addEventListener('click', handleMagicLink);
  logoutBtn.addEventListener('click', handleLogout);

  // Handle Enter key in form
  passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  });

  emailInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      passwordInput.focus();
    }
  });

  // Check auth state
  console.log('[Obfusca Popup] Checking authentication state...');
  const loggedIn = await isLoggedIn();
  console.log('[Obfusca Popup] User logged in:', loggedIn);

  if (loggedIn) {
    let user = await getCurrentUser();
    console.log('[Obfusca Popup] Current user:', user?.email, 'tenantName:', user?.tenantName);

    // If user is logged in but tenant info is missing (stale session), refresh it
    if (user && !user.tenantName) {
      console.log('[Obfusca Popup] Tenant info missing, refreshing...');
      userTenantDisplay.textContent = 'Loading tenant info...';
      const updatedUser = await refreshCurrentUserTenantInfo();
      if (updatedUser) {
        user = updatedUser;
        console.log('[Obfusca Popup] Tenant info refreshed:', user.tenantName);
      }
    }

    if (user) {
      showLoggedInState(user);
    } else {
      showLoggedOutState();
    }

    // Fetch and display plan info (fire and forget for display)
    fetchPlanInfo().then((planInfo) => {
      updatePlanDisplay(planInfo);
    }).catch((err) => {
      console.log('[Obfusca Popup] Plan fetch failed:', err);
    });

    // Sync custom patterns when popup opens (fire and forget)
    console.log('[Obfusca Popup] Triggering custom patterns sync...');
    syncCustomPatterns().catch((err) => {
      console.error('[Obfusca Popup] Failed to sync custom patterns:', err);
    });
  } else {
    showLoggedOutState();
  }

  // Check backend status and combine with auth status
  console.log('[Obfusca Popup] Checking backend status...');
  const backendConnected = await checkBackendStatus();
  console.log('[Obfusca Popup] Backend connected:', backendConnected);

  updateBackendStatus({
    backendConnected,
    authenticated: loggedIn,
    mode: backendConnected ? 'full' : 'local-only',
  });

  // Periodically check backend status
  setInterval(async () => {
    const connected = await checkBackendStatus();
    const authenticated = await isLoggedIn();
    updateBackendStatus({
      backendConnected: connected,
      authenticated,
      mode: connected ? 'full' : 'local-only',
    });
  }, 10000);

  // Insert support link just before the footer
  const footerElement = document.querySelector('.footer');
  if (footerElement && footerElement.parentNode) {
    const supportLink = document.createElement('a');
    supportLink.textContent = 'Report a Bug · Support';
    supportLink.style.cssText = 'display:block; text-align:center; font-size:11px; color:#666; cursor:pointer; padding:8px 0 4px; text-decoration:none;';
    supportLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://www.obfusca.ai/support' });
    });
    supportLink.addEventListener('mouseenter', () => { supportLink.style.color = '#999'; });
    supportLink.addEventListener('mouseleave', () => { supportLink.style.color = '#666'; });
    footerElement.parentNode.insertBefore(supportLink, footerElement);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
