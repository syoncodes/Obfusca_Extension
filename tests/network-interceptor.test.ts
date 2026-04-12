/**
 * Tests for src/network-interceptor.ts
 *
 * SKIPPED: This module cannot be unit tested without significant DOM mocking.
 *
 * Reasons:
 * 1. The entire module is wrapped in an IIFE that executes immediately on import.
 * 2. It checks window.location.hostname for 'claude.ai' at module level (line 44)
 *    and returns early if not on Claude.ai, making the interceptor code unreachable.
 * 3. It replaces window.fetch with a custom interceptor, which would interfere
 *    with other tests if imported.
 * 4. Internal functions (checkForSensitiveData, extractPromptFromBody,
 *    isClaudeApiUrl, etc.) are declared inside the IIFE scope and are not
 *    exported or accessible from outside.
 * 5. The UI functions (showBlockNotification, escapeHtml) manipulate the DOM
 *    directly and would require jsdom or similar.
 *
 * To test this module properly, we would need:
 * - A jsdom or happy-dom environment
 * - window.location mocked to claude.ai
 * - The IIFE refactored to export testable functions
 *
 * The detection patterns in this module are a DUPLICATE of detection.ts patterns.
 * They are covered by the detection.test.ts tests. The network-interceptor
 * patterns serve as a redundant safety net for Claude.ai specifically.
 *
 * Integration testing of the network interceptor should be done via browser
 * extension E2E tests (e.g., Puppeteer/Playwright with extension loaded).
 */

describe('network-interceptor', () => {
  it.skip('module is an IIFE with side effects -- cannot be unit tested without DOM mocking', () => {
    // See comments above for explanation
  });
});
