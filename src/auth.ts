/**
 * Authentication module for Supabase Auth integration.
 *
 * Handles login, logout, token storage, and token refresh.
 * After login, fetches tenant info from users table (not in JWT).
 */

// Supabase configuration
const SUPABASE_URL = 'https://znovciqcvpnywctfzola.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpub3ZjaXFjdnBueXdjdGZ6b2xhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxODQzMDMsImV4cCI6MjA4NTc2MDMwM30.TKxHo5jBCZaWetdRgsqOZ9lpZfdJKMBcv0CCaT9xAws';

// Storage keys
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'obfusca_access_token',
  REFRESH_TOKEN: 'obfusca_refresh_token',
  USER: 'obfusca_user',
  EXPIRES_AT: 'obfusca_expires_at',
};

/**
 * User information from auth session.
 */
export interface AuthUser {
  id: string;
  email: string;
  tenantId?: string;
  tenantName?: string;
  tenantSlug?: string;
  role?: string;
}

/**
 * Auth session data stored in extension storage.
 */
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: AuthUser;
}

/**
 * Login response from Supabase.
 */
interface SupabaseAuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  user: {
    id: string;
    email: string;
    app_metadata?: {
      tenant_id?: string;
      role?: string;
    };
    user_metadata?: {
      tenant_id?: string;
      role?: string;
    };
  };
}

/**
 * User record from our users table with tenant info.
 */
interface UserRecord {
  tenant_id: string;
  role: string;
  tenants: {
    name: string;
    slug: string;
  };
}

/**
 * Get the current auth session from storage.
 */
export async function getSession(): Promise<AuthSession | null> {
  console.log('[Obfusca Auth] getSession: Retrieving session from chrome.storage.local');
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
        STORAGE_KEYS.USER,
        STORAGE_KEYS.EXPIRES_AT,
      ],
      (result) => {
        console.log('[Obfusca Auth] getSession: Storage keys retrieved', {
          hasAccessToken: !!result[STORAGE_KEYS.ACCESS_TOKEN],
          hasRefreshToken: !!result[STORAGE_KEYS.REFRESH_TOKEN],
          hasUser: !!result[STORAGE_KEYS.USER],
          expiresAt: result[STORAGE_KEYS.EXPIRES_AT],
        });

        if (!result[STORAGE_KEYS.ACCESS_TOKEN]) {
          console.log('[Obfusca Auth] getSession: No access token found, returning null');
          resolve(null);
          return;
        }

        const session = {
          accessToken: result[STORAGE_KEYS.ACCESS_TOKEN],
          refreshToken: result[STORAGE_KEYS.REFRESH_TOKEN],
          expiresAt: result[STORAGE_KEYS.EXPIRES_AT],
          user: result[STORAGE_KEYS.USER],
        };
        console.log('[Obfusca Auth] getSession: Session found for user', session.user?.email);
        resolve(session);
      }
    );
  });
}

/**
 * Save auth session to storage.
 */
async function saveSession(session: AuthSession): Promise<void> {
  console.log('[Obfusca Auth] saveSession: Saving session to chrome.storage.local', {
    user: session.user?.email,
    tenantId: session.user?.tenantId,
    tenantName: session.user?.tenantName,
    expiresAt: session.expiresAt,
    tokenLength: session.accessToken?.length,
  });
  return new Promise((resolve) => {
    chrome.storage.local.set(
      {
        [STORAGE_KEYS.ACCESS_TOKEN]: session.accessToken,
        [STORAGE_KEYS.REFRESH_TOKEN]: session.refreshToken,
        [STORAGE_KEYS.USER]: session.user,
        [STORAGE_KEYS.EXPIRES_AT]: session.expiresAt,
      },
      () => {
        console.log('[Obfusca Auth] saveSession: Session saved successfully');
        resolve();
      }
    );
  });
}

/**
 * Clear auth session from storage.
 */
export async function clearSession(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(
      [
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
        STORAGE_KEYS.USER,
        STORAGE_KEYS.EXPIRES_AT,
      ],
      resolve
    );
  });
}

/**
 * Get the access token, refreshing if needed.
 */
export async function getAccessToken(): Promise<string | null> {
  console.log('[Obfusca Auth] getAccessToken: Attempting to get access token');
  const session = await getSession();
  if (!session) {
    console.log('[Obfusca Auth] getAccessToken: No session found, returning null');
    return null;
  }

  // Check if token is expired (with 60 second buffer)
  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = session.expiresAt - now;
  console.log('[Obfusca Auth] getAccessToken: Token expires in', timeUntilExpiry, 'seconds');

  if (session.expiresAt - 60 <= now) {
    console.log('[Obfusca Auth] getAccessToken: Token expired or expiring soon, attempting refresh');
    // Token is expired or about to expire, try to refresh
    const refreshed = await refreshSession();
    if (!refreshed) {
      console.log('[Obfusca Auth] getAccessToken: Refresh failed, clearing session');
      await clearSession();
      return null;
    }
    console.log('[Obfusca Auth] getAccessToken: Token refreshed successfully');
    return refreshed.accessToken;
  }

  console.log('[Obfusca Auth] getAccessToken: Returning valid token (length:', session.accessToken.length, ')');
  return session.accessToken;
}

/**
 * Get the current user.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await getSession();
  return session?.user || null;
}

/**
 * Refresh tenant info for the current user.
 * Call this if tenant info is missing (e.g., from a stale session).
 */
export async function refreshCurrentUserTenantInfo(): Promise<AuthUser | null> {
  console.log('[Obfusca Auth] refreshCurrentUserTenantInfo: Refreshing tenant info for current user');
  const session = await getSession();
  if (!session) {
    console.log('[Obfusca Auth] refreshCurrentUserTenantInfo: No session found');
    return null;
  }

  // Fetch tenant info
  const tenantInfo = await fetchUserTenantInfo(session.user.id, session.accessToken);
  if (!tenantInfo) {
    console.warn('[Obfusca Auth] refreshCurrentUserTenantInfo: Could not fetch tenant info');
    return session.user;
  }

  // Update user with tenant info
  const updatedUser: AuthUser = {
    ...session.user,
    tenantId: tenantInfo.tenantId,
    tenantName: tenantInfo.tenantName,
    tenantSlug: tenantInfo.tenantSlug,
    role: tenantInfo.role,
  };

  // Save updated session
  await saveSession({
    ...session,
    user: updatedUser,
  });

  console.log('[Obfusca Auth] refreshCurrentUserTenantInfo: Updated user with tenant info', {
    tenantId: updatedUser.tenantId,
    tenantName: updatedUser.tenantName,
  });

  return updatedUser;
}

/**
 * Check if user is logged in.
 */
export async function isLoggedIn(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null;
}

/**
 * Fetch user's tenant info from the users table.
 * This is needed because tenant_id is not in the JWT.
 */
async function fetchUserTenantInfo(
  userId: string,
  accessToken: string
): Promise<{ tenantId: string; tenantName: string; tenantSlug: string; role: string } | null> {
  console.log('[Obfusca Auth] fetchUserTenantInfo: Fetching tenant info for user', userId);

  try {
    // Query users table joined with tenants
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/users?select=tenant_id,role,tenants(name,slug)&id=eq.${userId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      console.error('[Obfusca Auth] fetchUserTenantInfo: Failed to fetch user record', response.status);
      return null;
    }

    const data: UserRecord[] = await response.json();
    console.log('[Obfusca Auth] fetchUserTenantInfo: Response data', data);

    if (data.length === 0) {
      console.warn('[Obfusca Auth] fetchUserTenantInfo: User not found in users table');
      return null;
    }

    const userRecord = data[0];
    console.log('[Obfusca Auth] fetchUserTenantInfo: Found user record', {
      tenantId: userRecord.tenant_id,
      role: userRecord.role,
      tenantName: userRecord.tenants?.name,
    });

    return {
      tenantId: userRecord.tenant_id,
      tenantName: userRecord.tenants?.name || 'Unknown',
      tenantSlug: userRecord.tenants?.slug || '',
      role: userRecord.role || 'member',
    };
  } catch (error) {
    console.error('[Obfusca Auth] fetchUserTenantInfo: Error fetching tenant info', error);
    return null;
  }
}

/**
 * Sign in with email and password.
 */
export async function signInWithPassword(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[Obfusca Auth] signInWithPassword: Attempting login for', email);

    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, password }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('[Obfusca Auth] signInWithPassword: Auth failed', error);
      return {
        success: false,
        error: error.error_description || error.msg || 'Login failed',
      };
    }

    const data: SupabaseAuthResponse = await response.json();
    console.log('[Obfusca Auth] signInWithPassword: Auth successful for user', data.user.id);

    // Step 2: Fetch tenant info from users table
    const tenantInfo = await fetchUserTenantInfo(data.user.id, data.access_token);

    // Build user object with tenant info
    const user: AuthUser = {
      id: data.user.id,
      email: data.user.email,
      tenantId: tenantInfo?.tenantId,
      tenantName: tenantInfo?.tenantName,
      tenantSlug: tenantInfo?.tenantSlug,
      role: tenantInfo?.role || 'member',
    };

    console.log('[Obfusca Auth] signInWithPassword: User info with tenant', {
      email: user.email,
      tenantId: user.tenantId,
      tenantName: user.tenantName,
      role: user.role,
    });

    // Save session
    await saveSession({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      user,
    });

    // Sync custom patterns after successful login (fire and forget)
    // We do this async so it doesn't block the login flow
    syncCustomPatternsInternal(data.access_token).catch((err) => {
      console.error('[Obfusca Auth] signInWithPassword: Failed to sync custom patterns:', err);
    });

    return { success: true };
  } catch (error) {
    console.error('[Obfusca Auth] signInWithPassword: Error', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Send magic link to email.
 */
export async function signInWithMagicLink(
  email: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/magiclink`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        error: error.error_description || error.msg || 'Failed to send magic link',
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Obfusca: Magic link error', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Refresh the access token using the refresh token.
 */
export async function refreshSession(): Promise<AuthSession | null> {
  const session = await getSession();
  if (!session?.refreshToken) {
    return null;
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ refresh_token: session.refreshToken }),
      }
    );

    if (!response.ok) {
      console.warn('Obfusca: Token refresh failed');
      return null;
    }

    const data: SupabaseAuthResponse = await response.json();
    console.log('[Obfusca Auth] refreshSession: Token refreshed for user', data.user.id);

    // Fetch tenant info again (in case it changed)
    const tenantInfo = await fetchUserTenantInfo(data.user.id, data.access_token);

    // Build user object with tenant info
    const user: AuthUser = {
      id: data.user.id,
      email: data.user.email,
      tenantId: tenantInfo?.tenantId || session.user.tenantId,
      tenantName: tenantInfo?.tenantName || session.user.tenantName,
      tenantSlug: tenantInfo?.tenantSlug || session.user.tenantSlug,
      role: tenantInfo?.role || session.user.role || 'member',
    };

    const newSession: AuthSession = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      user,
    };

    await saveSession(newSession);
    return newSession;
  } catch (error) {
    console.error('Obfusca: Token refresh error', error);
    return null;
  }
}

/**
 * Sign out and clear session.
 */
export async function signOut(): Promise<void> {
  const session = await getSession();

  if (session?.accessToken) {
    // Try to sign out on server (best effort)
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          apikey: SUPABASE_ANON_KEY,
        },
      });
    } catch {
      // Ignore errors - we'll clear local session anyway
    }
  }

  await clearSession();
  // Also clear cached custom patterns on logout
  await clearCustomPatternsStorage();
}

// =============================================================================
// Custom Pattern Sync
// =============================================================================

/**
 * Backend URL for custom patterns endpoint.
 */
import { API_URL } from './config';
const BACKEND_URL = API_URL;

/**
 * Storage keys for custom patterns.
 */
const CUSTOM_PATTERNS_STORAGE_KEYS = {
  PATTERNS: 'customPatterns',
  LAST_SYNC: 'customPatternsLastSync',
};

/**
 * Custom pattern from the backend.
 */
export interface CustomPattern {
  id: string;
  name: string;
  pattern_type: 'regex' | 'keyword_list' | 'semantic';
  pattern_value: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  action: 'block' | 'redact' | 'warn' | 'allow';
  enabled: boolean;
  category?: string;
}

/**
 * Internal: Sync custom patterns using a provided access token.
 * Used during login before session is fully saved.
 */
async function syncCustomPatternsInternal(accessToken: string): Promise<void> {
  console.log('[Obfusca Auth] syncCustomPatternsInternal: Starting sync...');

  try {
    const response = await fetch(`${BACKEND_URL}/custom-patterns`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    // Handle 401 gracefully - token expired or invalid
    if (response.status === 401) {
      console.log('[Obfusca Auth] syncCustomPatternsInternal: Token expired or invalid, skipping sync');
      return;
    }

    if (!response.ok) {
      console.log('[Obfusca Auth] syncCustomPatternsInternal: Server returned', response.status, '- skipping sync');
      return;
    }

    const data = await response.json();
    const patterns: CustomPattern[] = data.patterns || [];

    await chrome.storage.local.set({
      [CUSTOM_PATTERNS_STORAGE_KEYS.PATTERNS]: patterns,
      [CUSTOM_PATTERNS_STORAGE_KEYS.LAST_SYNC]: Date.now(),
    });

    console.log(`[Obfusca Auth] syncCustomPatternsInternal: Synced ${patterns.length} custom patterns`);
  } catch (err) {
    // Network errors, timeouts - log but don't treat as error
    console.log('[Obfusca Auth] syncCustomPatternsInternal: Sync unavailable:', err instanceof Error ? err.message : 'unknown error');
  }
}

/**
 * Sync custom patterns from the backend.
 * Fetches the user's tenant custom patterns and stores them in chrome.storage.local.
 *
 * Call this:
 * - After successful login (handled automatically)
 * - Periodically (every 5 minutes via background alarm)
 * - When popup opens
 */
export async function syncCustomPatterns(): Promise<void> {
  const session = await getSession();
  if (!session?.accessToken) {
    // Not logged in - this is expected, skip silently
    console.log('[Obfusca Auth] syncCustomPatterns: No session, skipping sync');
    return;
  }

  await syncCustomPatternsInternal(session.accessToken);
}

/**
 * Get cached custom patterns from storage.
 * Returns an empty array if no patterns are cached.
 */
export async function getCachedCustomPatterns(): Promise<CustomPattern[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [CUSTOM_PATTERNS_STORAGE_KEYS.PATTERNS],
      (result) => {
        const patterns = result[CUSTOM_PATTERNS_STORAGE_KEYS.PATTERNS];
        if (Array.isArray(patterns)) {
          resolve(patterns);
        } else {
          resolve([]);
        }
      }
    );
  });
}

/**
 * Clear cached custom patterns from storage.
 * Called automatically on logout.
 */
async function clearCustomPatternsStorage(): Promise<void> {
  console.log('[Obfusca Auth] clearCustomPatternsStorage: Clearing cached patterns');
  return new Promise((resolve) => {
    chrome.storage.local.remove(
      [
        CUSTOM_PATTERNS_STORAGE_KEYS.PATTERNS,
        CUSTOM_PATTERNS_STORAGE_KEYS.LAST_SYNC,
      ],
      resolve
    );
  });
}
