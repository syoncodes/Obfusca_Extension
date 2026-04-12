/**
 * Onboarding flow for Obfusca extension.
 * Handles first-run experience: welcome, join by invite, or sign in.
 */

import {
  signInWithPassword,
  getCurrentUser,
  refreshCurrentUserTenantInfo,
} from '../auth';

// API and Dashboard URLs
import { API_URL } from '../config';
const DASHBOARD_URL = 'https://app.obfusca.ai';

// Current step tracking
let inviteInfo: {
  valid: boolean;
  org_name?: string;
  email?: string;
  invited_by?: string;
  role?: string;
} | null = null;

// DOM Elements
const steps: { [key: string]: HTMLElement } = {};

function showStep(stepName: string): void {
  // Hide all steps
  Object.values(steps).forEach((step) => step.classList.remove('active'));

  // Show target step
  if (steps[stepName]) {
    steps[stepName].classList.add('active');
  }
}

function showMessage(containerId: string, text: string, type: 'error' | 'success' | 'info'): void {
  const container = document.getElementById(containerId);
  if (container) {
    container.textContent = text;
    container.className = `message ${type}`;
    container.classList.remove('hidden');
  }
}

function hideMessage(containerId: string): void {
  const container = document.getElementById(containerId);
  if (container) {
    container.classList.add('hidden');
  }
}

async function validateInviteCode(code: string): Promise<void> {
  if (code.length !== 8) return;

  const validateBtn = document.getElementById('validate-invite') as HTMLButtonElement;
  validateBtn.disabled = true;
  validateBtn.innerHTML = '<span class="spinner"></span>Validating...';
  hideMessage('invite-message');

  try {
    const response = await fetch(`${API_URL}/invites/validate/${code.toUpperCase()}`);
    const data = await response.json();

    inviteInfo = data;

    if (data.valid) {
      // Show org preview
      const orgPreview = document.getElementById('org-preview')!;
      const orgName = document.getElementById('org-name')!;
      const orgInvitedBy = document.getElementById('org-invited-by')!;
      const orgRole = document.getElementById('org-role')!;
      const accountForm = document.getElementById('account-form')!;

      orgName.textContent = data.org_name || 'Organization';
      orgInvitedBy.textContent = data.invited_by ? `Invited by ${data.invited_by}` : '';
      orgRole.textContent = data.role || 'member';

      orgPreview.classList.remove('hidden');
      accountForm.classList.remove('hidden');

      // Pre-fill email if invite is for specific email
      if (data.email) {
        const emailInput = document.getElementById('join-email') as HTMLInputElement;
        emailInput.value = data.email;
        emailInput.disabled = true;
      }

      validateBtn.textContent = 'Join Organization';
    } else {
      showMessage('invite-message', data.message || 'Invalid invite code', 'error');
      document.getElementById('org-preview')!.classList.add('hidden');
      document.getElementById('account-form')!.classList.add('hidden');
      validateBtn.textContent = 'Continue';
    }
  } catch (err) {
    showMessage('invite-message', 'Failed to validate invite code', 'error');
    validateBtn.textContent = 'Continue';
  } finally {
    validateBtn.disabled = false;
  }
}

async function handleJoin(): Promise<void> {
  if (!inviteInfo?.valid) {
    const codeInput = document.getElementById('invite-code') as HTMLInputElement;
    await validateInviteCode(codeInput.value);
    return;
  }

  const email = (document.getElementById('join-email') as HTMLInputElement).value;
  const password = (document.getElementById('join-password') as HTMLInputElement).value;
  const confirm = (document.getElementById('join-confirm') as HTMLInputElement).value;
  const code = (document.getElementById('invite-code') as HTMLInputElement).value;

  if (!email || !password || !confirm) {
    showMessage('invite-message', 'Please fill in all fields', 'error');
    return;
  }

  if (password.length < 8) {
    showMessage('invite-message', 'Password must be at least 8 characters', 'error');
    return;
  }

  if (password !== confirm) {
    showMessage('invite-message', 'Passwords do not match', 'error');
    return;
  }

  const btn = document.getElementById('validate-invite') as HTMLButtonElement;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Joining...';
  hideMessage('invite-message');

  try {
    const response = await fetch(`${API_URL}/auth/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        invite_code: code.toUpperCase(),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to join');
    }

    // Now sign in
    const signInResult = await signInWithPassword(email, password);

    if (signInResult.success) {
      let user = await getCurrentUser();
      if (user && !user.tenantName) {
        user = await refreshCurrentUserTenantInfo();
      }

      // Mark onboarding as complete
      chrome.storage.local.set({ onboardingComplete: true });

      // Show success
      const successMessage = document.getElementById('success-message')!;
      successMessage.textContent = `Welcome to ${data.org_name || 'your organization'}! Obfusca is now protecting your data.`;
      showStep('success');
    } else {
      throw new Error(signInResult.error || 'Failed to sign in after joining');
    }
  } catch (err) {
    showMessage('invite-message', err instanceof Error ? err.message : 'Failed to join', 'error');
    btn.disabled = false;
    btn.textContent = 'Join Organization';
  }
}

async function handleSignIn(): Promise<void> {
  const email = (document.getElementById('signin-email') as HTMLInputElement).value;
  const password = (document.getElementById('signin-password') as HTMLInputElement).value;

  if (!email || !password) {
    showMessage('signin-message', 'Please enter email and password', 'error');
    return;
  }

  const btn = document.getElementById('do-signin') as HTMLButtonElement;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Signing in...';
  hideMessage('signin-message');

  try {
    const result = await signInWithPassword(email, password);

    if (result.success) {
      let user = await getCurrentUser();
      if (user && !user.tenantName) {
        user = await refreshCurrentUserTenantInfo();
      }

      // Mark onboarding as complete
      chrome.storage.local.set({ onboardingComplete: true });

      // Show success
      const successMessage = document.getElementById('success-message')!;
      successMessage.textContent = user?.tenantName
        ? `Welcome back! Connected to ${user.tenantName}.`
        : 'You are now signed in. Obfusca is protecting your data.';
      showStep('success');
    } else {
      throw new Error(result.error || 'Sign in failed');
    }
  } catch (err) {
    showMessage('signin-message', err instanceof Error ? err.message : 'Sign in failed', 'error');
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

function init(): void {
  // Get step elements
  steps.welcome = document.getElementById('step-welcome')!;
  steps.invite = document.getElementById('step-invite')!;
  steps.signin = document.getElementById('step-signin')!;
  steps.signup = document.getElementById('step-signup')!;
  steps.success = document.getElementById('step-success')!;

  // Welcome step option handlers
  const options = document.querySelectorAll('.option[data-choice]');
  options.forEach((option) => {
    option.addEventListener('click', () => {
      const choice = option.getAttribute('data-choice');
      if (choice === 'invite') {
        showStep('invite');
      } else if (choice === 'signin') {
        showStep('signin');
      } else if (choice === 'signup') {
        showStep('signup');
      }
    });
  });

  // Invite step handlers
  const inviteCodeInput = document.getElementById('invite-code') as HTMLInputElement;
  inviteCodeInput.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement;
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  document.getElementById('validate-invite')!.addEventListener('click', handleJoin);
  document.getElementById('back-from-invite')!.addEventListener('click', () => {
    inviteInfo = null;
    document.getElementById('org-preview')!.classList.add('hidden');
    document.getElementById('account-form')!.classList.add('hidden');
    (document.getElementById('invite-code') as HTMLInputElement).value = '';
    (document.getElementById('validate-invite') as HTMLButtonElement).textContent = 'Continue';
    hideMessage('invite-message');
    showStep('welcome');
  });

  // Sign in step handlers
  document.getElementById('do-signin')!.addEventListener('click', handleSignIn);
  document.getElementById('back-from-signin')!.addEventListener('click', () => {
    hideMessage('signin-message');
    showStep('welcome');
  });

  // Enter key handling for sign in
  document.getElementById('signin-password')!.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleSignIn();
    }
  });

  // Signup step handlers
  document.getElementById('open-signup')!.addEventListener('click', () => {
    chrome.tabs.create({ url: `${DASHBOARD_URL}/signup` });
  });
  document.getElementById('back-from-signup')!.addEventListener('click', () => {
    showStep('welcome');
  });

  // Success step handler
  document.getElementById('close-onboarding')!.addEventListener('click', () => {
    window.close();
  });

  // Check URL params for invite code
  const urlParams = new URLSearchParams(window.location.search);
  const codeFromUrl = urlParams.get('code');
  if (codeFromUrl) {
    (document.getElementById('invite-code') as HTMLInputElement).value = codeFromUrl.toUpperCase();
    showStep('invite');
    validateInviteCode(codeFromUrl);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
