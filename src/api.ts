/**
 * Backend API communication for Obfusca extension.
 * Handles analysis requests with authentication and graceful fallback.
 */

import type { Detection } from './detection';
import { getAccessToken, getCurrentUser, getSession } from './auth';
import { API_URL } from './config';

const BACKEND_URL = API_URL;
const ANALYZE_ENDPOINT = `${BACKEND_URL}/analyze`;
const GENERATE_DUMMY_ENDPOINT = `${BACKEND_URL}/generate-dummy`;
const GENERATE_DUMMIES_BATCH_ENDPOINT = `${BACKEND_URL}/generate-dummies-batch`;
const PROTECT_FILE_ENDPOINT = `${BACKEND_URL}/files/protect`;
const TIMEOUT_MS = 10000;

export interface AnalyzeRequest {
  content: string;
  tenant_id?: string;
  context?: {
    source?: string;
    url?: string;
  };
}

export interface MappingItem {
  /** Zero-based index of this detection in the sorted list */
  index: number;
  original_preview: string;
  placeholder: string;
  type: string;
  /** Severity level (critical/high/medium/low) */
  severity: string;
  /** Start character position in the original text */
  start: number;
  /** End character position in the original text */
  end: number;
  /** Format-preserving X-mask (e.g., '$X.XM', 'Xxxx Xxxxx') */
  masked_value: string;
  /** Realistic fake value (e.g., '$100,000', 'Jane Doe') */
  dummy_value: string;
  display_name?: string | null;
  replacement?: string | null;
  auto_redact?: boolean;
  /** original_value is excluded from backend serialization for security */
  original_value?: string | null;
}

export interface ObfuscationData {
  obfuscated_text: string;
  mappings: MappingItem[];
}

export interface AnalyzeResponse {
  request_id: string;
  action: 'allow' | 'block' | 'redact';
  detections: BackendDetection[];
  summary: {
    total_detections: number;
    highest_severity: string | null;
    categories: string[];
  };
  obfuscation?: ObfuscationData;
  message?: string;
  // Monitor mode fields
  simulated?: boolean;
  would_have_blocked?: boolean;
  original_action?: 'allow' | 'block' | 'redact';
}

interface BackendDetection {
  type: string;
  severity: string;
  start: number;
  end: number;
  confidence: number;
  display_name?: string | null;
  replacement?: string | null;
  auto_redact?: boolean;
}

/**
 * Determine source platform from current URL.
 * Must match all sites supported in extension/src/sites/
 */
export function getSourceFromUrl(url: string): string {
  // ChatGPT: chatgpt.com, chat.openai.com
  if (url.includes('chat.openai.com') || url.includes('chatgpt.com')) {
    return 'chatgpt';
  }
  // Claude: claude.ai
  if (url.includes('claude.ai')) {
    return 'claude';
  }
  // Gemini: gemini.google.com, bard.google.com
  if (url.includes('gemini.google.com') || url.includes('bard.google.com')) {
    return 'gemini';
  }
  // Grok: grok.com, x.com, twitter.com
  if (url.includes('grok.com') || url.includes('x.com') || url.includes('twitter.com')) {
    return 'grok';
  }
  // GitHub Copilot: github.com
  if (url.includes('github.com')) {
    return 'github-copilot';
  }
  // Perplexity: perplexity.ai
  if (url.includes('perplexity.ai')) {
    return 'perplexity';
  }
  // DeepSeek: deepseek.com, chat.deepseek.com
  if (url.includes('deepseek.com')) {
    return 'deepseek';
  }
  return 'unknown';
}

/**
 * Convert backend detection format to extension format.
 */
function convertDetection(backend: BackendDetection): Detection {
  const displayNames: Record<string, string> = {
    ssn: 'US Social Security Number',
    credit_card: 'Credit Card Number',
    aws_key: 'AWS Access Key',
    aws_secret: 'AWS Secret Key',
    api_key: 'API Key',
    private_key: 'Private Key',
    email: 'Email Address',
    phone: 'Phone Number',
    jwt: 'JWT Token',
    connection_string: 'Connection String',
  };

  return {
    type: backend.type as Detection['type'],
    displayName: backend.display_name || displayNames[backend.type] || backend.type,
    severity: backend.severity as Detection['severity'],
    start: backend.start,
    end: backend.end,
    confidence: backend.confidence,
  };
}

/**
 * Backend connection status for tracking.
 */
export interface BackendStatus {
  connected: boolean;
  authenticated: boolean;
  lastChecked: number;
  error?: string;
}

let lastBackendStatus: BackendStatus = {
  connected: false,
  authenticated: false,
  lastChecked: 0,
};

/**
 * Get the current backend status.
 */
export function getBackendStatus(): BackendStatus {
  return { ...lastBackendStatus };
}

/**
 * Check if the backend is reachable.
 */
export async function checkBackendHealth(): Promise<boolean> {
  console.log('[Obfusca API] checkBackendHealth: Checking backend at', BACKEND_URL);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(`${BACKEND_URL}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const isHealthy = response.ok;
    console.log('[Obfusca API] checkBackendHealth: Backend status', isHealthy ? 'healthy' : 'unhealthy');

    lastBackendStatus = {
      ...lastBackendStatus,
      connected: isHealthy,
      lastChecked: Date.now(),
    };

    return isHealthy;
  } catch (error) {
    console.log('[Obfusca API] checkBackendHealth: Backend unreachable', error);
    lastBackendStatus = {
      ...lastBackendStatus,
      connected: false,
      lastChecked: Date.now(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    return false;
  }
}

/**
 * Analyze text using the backend API.
 *
 * If authenticated, includes the auth token and source context.
 * Returns null if backend is unreachable (caller should fall back to local detection).
 */
export async function analyzeWithBackend(
  text: string,
  sourceUrl?: string
): Promise<AnalyzeResponse | null> {
  console.log('[Obfusca API] analyzeWithBackend: Starting backend analysis');
  console.log('[Obfusca API] analyzeWithBackend: Content length:', text.length, 'chars');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // Build request body
    const body: AnalyzeRequest = { content: text };

    // Add source context if available
    if (sourceUrl) {
      const detectedSource = getSourceFromUrl(sourceUrl);
      body.context = {
        source: detectedSource,
        url: sourceUrl,
      };
      console.log('[Obfusca API] analyzeWithBackend: Source URL:', sourceUrl);
      console.log('[Obfusca API] analyzeWithBackend: Detected source:', detectedSource);
    } else {
      console.log('[Obfusca API] analyzeWithBackend: No source URL provided');
    }

    // Build headers
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // Add auth token if available
    console.log('[Obfusca API] analyzeWithBackend: Getting access token...');
    const accessToken = await getAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      console.log('[Obfusca API] analyzeWithBackend: Authorization header set (token length:', accessToken.length, ')');
    } else {
      console.log('[Obfusca API] analyzeWithBackend: No access token available, proceeding without auth');
    }

    console.log('[Obfusca API] analyzeWithBackend: Sending request to', ANALYZE_ENDPOINT);
    const response = await fetch(ANALYZE_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    console.log('[Obfusca API] analyzeWithBackend: Response status:', response.status);

    // Handle 401 - token may be expired or invalid
    if (response.status === 401) {
      console.warn('[Obfusca API] analyzeWithBackend: 401 Unauthorized - Authentication required or token expired');
      console.log('[Obfusca API] analyzeWithBackend: Falling back to local-only detection');
      lastBackendStatus = {
        ...lastBackendStatus,
        connected: true,
        authenticated: false,
        lastChecked: Date.now(),
        error: 'Authentication failed (401)',
      };
      // Return null to trigger local fallback
      return null;
    }

    if (!response.ok) {
      console.warn(`[Obfusca API] analyzeWithBackend: Backend error ${response.status}`);
      lastBackendStatus = {
        ...lastBackendStatus,
        connected: true,
        authenticated: !!accessToken,
        lastChecked: Date.now(),
        error: `Backend error: ${response.status}`,
      };
      return null;
    }

    const result = await response.json();
    console.log('[Obfusca API] analyzeWithBackend: Backend response received', {
      action: result.action,
      detectionCount: result.detections?.length || 0,
    });

    lastBackendStatus = {
      connected: true,
      authenticated: !!accessToken,
      lastChecked: Date.now(),
    };

    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('[Obfusca API] analyzeWithBackend: Request timed out after', TIMEOUT_MS, 'ms');
      lastBackendStatus = {
        ...lastBackendStatus,
        connected: false,
        lastChecked: Date.now(),
        error: 'Request timed out',
      };
    } else {
      console.warn('[Obfusca API] analyzeWithBackend: Backend unreachable', error);
      lastBackendStatus = {
        ...lastBackendStatus,
        connected: false,
        lastChecked: Date.now(),
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
    console.log('[Obfusca API] analyzeWithBackend: Falling back to local-only detection');
    return null;
  }
}

/**
 * Full analysis pipeline: try backend first, then merge with local detection.
 * IMPORTANT: Local detection ALWAYS runs as fallback if backend is unavailable.
 */
export async function analyze(
  text: string,
  localDetections: Detection[],
  sourceUrl?: string
): Promise<{
  shouldBlock: boolean;
  action: 'allow' | 'block' | 'redact';
  detections: Detection[];
  source: 'backend' | 'local' | 'combined';
  obfuscation?: ObfuscationData;
  message?: string;
  // Monitor mode fields
  simulated?: boolean;
  wouldHaveBlocked?: boolean;
  originalAction?: 'allow' | 'block' | 'redact';
}> {
  console.log('[Obfusca API] analyze: Starting analysis pipeline');
  console.log('[Obfusca API] analyze: Local detections count:', localDetections.length);

  // No session = no enforcement, allow everything through
  const session = await getSession();
  if (!session) {
    console.log('[Obfusca API] analyze: No session — skipping analysis, allowing all');
    return {
      shouldBlock: false,
      action: 'allow' as const,
      detections: [],
      source: 'local' as const,
    };
  }

  const backendResponse = await analyzeWithBackend(text, sourceUrl);

  if (backendResponse === null) {
    // Backend unavailable - use local detections only (GRACEFUL FALLBACK)
    console.log('[Obfusca API] analyze: Backend unavailable, using LOCAL DETECTION ONLY');
    const shouldBlock = localDetections.some(
      (d) => d.severity === 'critical' || d.severity === 'high'
    );
    const action: 'allow' | 'block' | 'redact' = shouldBlock ? 'block' : localDetections.length > 0 ? 'redact' : 'allow';
    const result = {
      shouldBlock,
      action,
      detections: localDetections,
      source: 'local' as const,
    };
    console.log('[Obfusca API] analyze: Local-only result:', {
      shouldBlock: result.shouldBlock,
      action: result.action,
      detectionCount: result.detections.length,
    });
    return result;
  }

  // Backend available - convert and merge detections
  console.log('[Obfusca API] analyze: Backend available, merging results');
  const backendDetections = backendResponse.detections.map(convertDetection);

  // Merge: use backend detections as primary, add any unique local ones
  const mergedDetections = [...backendDetections];

  for (const local of localDetections) {
    const isDuplicate = backendDetections.some(
      (bd) =>
        bd.type === local.type &&
        Math.abs(bd.start - local.start) < 5 &&
        Math.abs(bd.end - local.end) < 5
    );

    if (!isDuplicate) {
      mergedDetections.push(local);
    }
  }

  const result = {
    shouldBlock: backendResponse.action === 'block',
    action: backendResponse.action,
    detections: mergedDetections,
    source: (backendDetections.length > 0 ? 'backend' : 'combined') as 'backend' | 'combined',
    obfuscation: backendResponse.obfuscation,
    message: backendResponse.message,
    // Monitor mode fields
    simulated: backendResponse.simulated,
    wouldHaveBlocked: backendResponse.would_have_blocked,
    originalAction: backendResponse.original_action,
  };

  console.log('[Obfusca API] analyze: Final result:', {
    shouldBlock: result.shouldBlock,
    action: result.action,
    detectionCount: result.detections.length,
    source: result.source,
    hasObfuscation: !!result.obfuscation,
    simulated: result.simulated,
    wouldHaveBlocked: result.wouldHaveBlocked,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Extension status reporting (protection toggle, heartbeat)
// ---------------------------------------------------------------------------

/**
 * Report extension protection status to the backend.
 *
 * Fire-and-forget: never blocks the caller. Errors are logged but not thrown.
 * Called on:
 * - Protection toggle change
 * - Extension startup (background worker)
 * - Periodic heartbeat (every 30 minutes)
 * - Login/auth change
 */
export async function reportExtensionStatus(protectionEnabled: boolean): Promise<void> {
  console.log('[Obfusca Status] Reporting extension status: protection_enabled=', protectionEnabled);

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.log('[Obfusca Status] No access token -- skipping status report');
      return;
    }

    const manifest = chrome.runtime.getManifest();
    const payload = {
      protection_enabled: protectionEnabled,
      extension_version: manifest.version,
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(`${BACKEND_URL}/extension/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.warn('[Obfusca Status] Status report failed:', response.status);
    } else {
      console.log('[Obfusca Status] Status reported successfully');
    }
  } catch (error) {
    // Fire-and-forget: never throw
    console.log('[Obfusca Status] Status report error:', error instanceof Error ? error.message : 'unknown');
  }
}

/**
 * Check if user is authenticated for full functionality.
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null;
}

/**
 * Get current user info for display.
 */
export async function getUserInfo(): Promise<{
  email: string;
  tenantId?: string;
} | null> {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  return {
    email: user.email,
    tenantId: user.tenantId,
  };
}

// ---------------------------------------------------------------------------
// Dummy data generation (smart replacement)
// ---------------------------------------------------------------------------

export interface DummyDetectionItem {
  type: string;
  value: string;
  context?: string;
  display_name?: string;
  index: number;
}

export interface DummyReplacementItem {
  index: number;
  dummy_value: string;
  source: 'builtin' | 'ai';
}

export interface DummyGenerateResponse {
  replacements: DummyReplacementItem[];
  session_id?: string;
}

/** Session ID for caching consistency within a page session */
let _dummySessionId: string | null = null;

function getDummySessionId(): string {
  if (!_dummySessionId) {
    _dummySessionId = `ext-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return _dummySessionId;
}

/**
 * Generate realistic dummy data for detected sensitive values.
 *
 * Calls POST /generate-dummy with authentication.
 * Returns null if the request fails (caller should fall back gracefully).
 */
export async function generateDummyData(
  detections: DummyDetectionItem[]
): Promise<DummyGenerateResponse | null> {
  console.log('[Obfusca Magic Wand] generateDummyData: Requesting dummies for', detections.length, 'items');
  console.log('[Obfusca Magic Wand] generateDummyData: Detection types:', detections.map(d => `${d.type}${d.display_name ? ` (${d.display_name})` : ''}`).join(', '));

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    console.log('[Obfusca Magic Wand] generateDummyData: Getting access token...');
    const accessToken = await getAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      console.log('[Obfusca Magic Wand] generateDummyData: Auth token set (length:', accessToken.length, ')');
    } else {
      console.warn('[Obfusca Magic Wand] generateDummyData: NO ACCESS TOKEN -- user may not be logged in. Dummy generation requires auth.');
      return null;
    }

    const body = {
      detections,
      session_id: getDummySessionId(),
    };

    console.log('[Obfusca Magic Wand] generateDummyData: POST', GENERATE_DUMMY_ENDPOINT);
    console.log('[Obfusca Magic Wand] generateDummyData: Request body:', JSON.stringify(body, null, 2));

    const response = await fetch(GENERATE_DUMMY_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    console.log('[Obfusca Magic Wand] generateDummyData: Response status:', response.status);

    if (!response.ok) {
      // Read the error body for debugging
      let errorDetail = '';
      try {
        const errorBody = await response.text();
        errorDetail = errorBody.slice(0, 500);
      } catch { /* ignore read errors */ }
      console.error('[Obfusca Magic Wand] generateDummyData: Server error', response.status, errorDetail);
      return null;
    }

    const result: DummyGenerateResponse = await response.json();
    console.log('[Obfusca Magic Wand] generateDummyData: Got', result.replacements.length, 'replacements');
    console.log('[Obfusca Magic Wand] generateDummyData: Replacements:', result.replacements.map(r => `[${r.index}] source=${r.source}, value="${r.dummy_value.slice(0, 50)}"`).join('; '));
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[Obfusca Magic Wand] generateDummyData: Request TIMED OUT after', TIMEOUT_MS, 'ms');
    } else {
      console.error('[Obfusca Magic Wand] generateDummyData: Request FAILED:', error);
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Batch dummy generation (single AI call with full context)
// ---------------------------------------------------------------------------

export interface BatchDetectionItem {
  index: number;
  type: string;
  original_value: string;
  display_name?: string | null;
}

export interface BatchDummyResponse {
  success: boolean;
  dummies: DummyReplacementItem[];
  source: 'ai' | 'fallback' | 'error';
  error?: string;
}

/**
 * Generate dummy values for ALL detections in one AI call.
 *
 * Sends the full original message + all detections to the backend,
 * which makes a single Groq call to produce coherent, context-aware
 * replacements. Falls back gracefully on failure.
 *
 * @param originalText - The full original message text
 * @param detections - Array of detections needing dummy replacements
 * @returns BatchDummyResponse or null if request fails entirely
 */
export async function generateDummiesBatch(
  originalText: string,
  detections: BatchDetectionItem[]
): Promise<BatchDummyResponse | null> {
  console.log('[Obfusca Batch] generateDummiesBatch: Requesting AI dummies for', detections.length, 'items');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s for batch AI

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    const accessToken = await getAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    } else {
      console.warn('[Obfusca Batch] No access token — batch dummy generation requires auth');
      return null;
    }

    const body = {
      original_text: originalText,
      detections,
      session_id: getDummySessionId(),
    };

    console.log('[Obfusca Batch] POST', GENERATE_DUMMIES_BATCH_ENDPOINT);

    const response = await fetch(GENERATE_DUMMIES_BATCH_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errorBody = await response.text();
        errorDetail = errorBody.slice(0, 500);
      } catch { /* ignore */ }
      console.error('[Obfusca Batch] Server error', response.status, errorDetail);
      return null;
    }

    const result: BatchDummyResponse = await response.json();
    console.log('[Obfusca Batch] Got', result.dummies.length, 'dummies, source:', result.source, 'success:', result.success);
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[Obfusca Batch] Request timed out');
    } else {
      console.error('[Obfusca Batch] Request failed:', error);
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Bypass event logging
// ---------------------------------------------------------------------------

/**
 * SECURITY EXCEPTION: This is the ONE case where raw sensitive values are sent
 * to the backend. When a user bypasses protection ("Send Anyway"), the admin
 * needs to see exactly what was sent unprotected for incident response.
 * The data has already been sent to a third-party LLM at this point, so the
 * damage is done -- full visibility is needed for remediation.
 */

export interface BypassDetectionItem {
  type: string;
  label: string;
  value: string;
  severity: string;
  confidence: number;
  replacement?: string;
  context?: string;
}

export interface BypassFileItem {
  filename: string;
  size_bytes?: number;
  detections_count: number;
}

export interface BypassEventPayload {
  source: string;
  content_type: 'text' | 'file' | 'text_and_file';
  detections_summary: {
    total_count: number;
    by_type: Record<string, number>;
    by_severity: Record<string, number>;
  };
  bypassed_detections: BypassDetectionItem[];
  files_bypassed: BypassFileItem[];
  content_hash: string;
  timestamp: string;
}

/**
 * Log a bypass event to the backend.
 *
 * Called asynchronously after the user confirms "Send Anyway". This should
 * NOT block the send -- fire and forget with error logging.
 */
export async function logBypassEvent(
  payload: BypassEventPayload
): Promise<void> {
  console.log('[Obfusca Bypass] Logging bypass event:', {
    source: payload.source,
    total_detections: payload.detections_summary.total_count,
    content_type: payload.content_type,
  });

  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    const accessToken = await getAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    } else {
      console.warn('[Obfusca Bypass] No access token -- bypass event will not be logged');
      return;
    }

    const response = await fetch(`${BACKEND_URL}/events/bypass`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errorBody = await response.text();
        errorDetail = errorBody.slice(0, 500);
      } catch { /* ignore */ }
      console.error('[Obfusca Bypass] Failed to log bypass event:', response.status, errorDetail);
    } else {
      const result = await response.json();
      console.log('[Obfusca Bypass] Bypass event logged, event_id:', result.event_id);
    }
  } catch (error) {
    // Fire-and-forget: never block the send
    console.error('[Obfusca Bypass] Error logging bypass event:', error);
  }
}

// ---------------------------------------------------------------------------
// Warn event logging (non-bypass, lower severity)
// ---------------------------------------------------------------------------

/**
 * Payload for logging a warn-mode "Send Anyway" event.
 * Unlike bypass events, warn events do NOT include raw sensitive values.
 * They only store detection summaries (counts by type/severity).
 */
export interface WarnEventPayload {
  source: string;
  detections_summary: {
    total_count: number;
    by_type: Record<string, number>;
    by_severity: Record<string, number>;
  };
  content_hash: string;
  timestamp: string;
}

/**
 * Log a warn event to the backend.
 *
 * Called when the user clicks "Send Anyway" on a warn-level popup
 * (single-click, no confirmation dialog). This is a lower-severity
 * action than a bypass (which overrides a block).
 *
 * Fire-and-forget -- does not block the send.
 */
export async function logWarnEvent(
  payload: WarnEventPayload
): Promise<void> {
  console.log('[Obfusca Warn] Logging warn event:', {
    source: payload.source,
    total_detections: payload.detections_summary.total_count,
  });

  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    const accessToken = await getAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    } else {
      console.warn('[Obfusca Warn] No access token -- warn event will not be logged');
      return;
    }

    const response = await fetch(`${BACKEND_URL}/events/warn`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errorBody = await response.text();
        errorDetail = errorBody.slice(0, 500);
      } catch { /* ignore */ }
      console.error('[Obfusca Warn] Failed to log warn event:', response.status, errorDetail);
    } else {
      const result = await response.json();
      console.log('[Obfusca Warn] Warn event logged, event_id:', result.event_id);
    }
  } catch (error) {
    // Fire-and-forget: never block the send
    console.error('[Obfusca Warn] Error logging warn event:', error);
  }
}

/**
 * Build a SHA-256 hex hash of content for bypass event logging.
 * Uses the SubtleCrypto API available in browser contexts.
 */
export async function sha256Hash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return 'sha256:' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// File protection (download redacted version)
// ---------------------------------------------------------------------------

export interface ProtectionChoice {
  original_value: string;
  replacement: string;
}

export interface ProtectFileResponse {
  filename: string;
  content_base64: string;
  replacements_applied: number;
}

/**
 * Send a file + replacement pairs to the backend, which applies the exact
 * replacements via string substitution. No re-detection or re-obfuscation.
 */
export async function protectFile(
  filename: string,
  contentBase64: string,
  choices: ProtectionChoice[]
): Promise<ProtectFileResponse | null> {
  // Filter out choices with empty original_value or replacement (prevents backend 422)
  const validChoices = choices.filter(c =>
    c.original_value && c.original_value.trim() !== '' &&
    c.replacement && c.replacement.trim() !== ''
  );
  if (validChoices.length < choices.length) {
    console.warn(`[Obfusca Files] Filtered ${choices.length - validChoices.length} invalid choices (empty original_value or replacement)`);
  }
  if (validChoices.length === 0) {
    console.warn('[Obfusca Files] No valid choices after filtering — skipping protection');
    return null;
  }
  choices = validChoices;

  console.log('[Obfusca Files] protectFile: Requesting protection for', filename, 'with', choices.length, 'choices');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s for file processing

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    const accessToken = await getAccessToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    } else {
      console.warn('[Obfusca Files] No access token — file protection requires auth');
      return null;
    }

    const body = {
      filename,
      content_base64: contentBase64,
      choices,
    };

    console.log('[Obfusca Files] POST', PROTECT_FILE_ENDPOINT);

    const response = await fetch(PROTECT_FILE_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errorBody = await response.text();
        errorDetail = errorBody.slice(0, 500);
      } catch { /* ignore */ }
      console.error('[Obfusca Files] Server error', response.status, errorDetail);
      return null;
    }

    const result: ProtectFileResponse = await response.json();
    console.log('[Obfusca Files] Got protected file:', result.filename, 'replacements:', result.replacements_applied);
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[Obfusca Files] Protection request timed out');
    } else {
      console.error('[Obfusca Files] Protection request failed:', error);
    }
    return null;
  }
}
