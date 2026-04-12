/**
 * Tests for src/api.ts
 *
 * Tests the pure utility functions that do NOT require network access:
 * - getSourceFromUrl(url): determines platform source from URL
 *
 * NOT tested (require fetch/network mocking):
 * - analyzeWithBackend(): makes HTTP requests
 * - analyze(): orchestrates backend + local detection
 * - checkBackendHealth(): makes HTTP request
 * - generateDummyData(): makes HTTP request
 * - generateDummiesBatch(): makes HTTP request
 * - protectFile(): makes HTTP request
 *
 * Note: api.ts imports from ./auth and ./config which use chrome APIs.
 * The chrome mock in setup.ts handles this.
 */

import { getSourceFromUrl } from '../src/api';

// Suppress console output from the module
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

// =============================================================================
// getSourceFromUrl
// =============================================================================

describe('getSourceFromUrl', () => {
  describe('ChatGPT', () => {
    it('detects chatgpt.com', () => {
      expect(getSourceFromUrl('https://chatgpt.com/')).toBe('chatgpt');
    });

    it('detects chatgpt.com with path', () => {
      expect(getSourceFromUrl('https://chatgpt.com/c/12345')).toBe('chatgpt');
    });

    it('detects chat.openai.com', () => {
      expect(getSourceFromUrl('https://chat.openai.com/')).toBe('chatgpt');
    });

    it('detects chat.openai.com with path', () => {
      expect(
        getSourceFromUrl('https://chat.openai.com/c/abc123'),
      ).toBe('chatgpt');
    });
  });

  describe('Claude', () => {
    it('detects claude.ai', () => {
      expect(getSourceFromUrl('https://claude.ai/')).toBe('claude');
    });

    it('detects claude.ai with path', () => {
      expect(
        getSourceFromUrl('https://claude.ai/chat/abc123'),
      ).toBe('claude');
    });
  });

  describe('Gemini', () => {
    it('detects gemini.google.com', () => {
      expect(getSourceFromUrl('https://gemini.google.com/')).toBe('gemini');
    });

    it('detects gemini.google.com with path', () => {
      expect(
        getSourceFromUrl('https://gemini.google.com/app/abc'),
      ).toBe('gemini');
    });

    it('detects bard.google.com (legacy)', () => {
      expect(getSourceFromUrl('https://bard.google.com/')).toBe('gemini');
    });
  });

  describe('Grok', () => {
    it('detects grok.com', () => {
      expect(getSourceFromUrl('https://grok.com/')).toBe('grok');
    });

    it('detects x.com', () => {
      expect(getSourceFromUrl('https://x.com/i/grok')).toBe('grok');
    });

    it('detects twitter.com', () => {
      expect(getSourceFromUrl('https://twitter.com/')).toBe('grok');
    });
  });

  describe('GitHub Copilot', () => {
    it('detects github.com', () => {
      expect(getSourceFromUrl('https://github.com/copilot')).toBe(
        'github-copilot',
      );
    });

    it('detects github.com with path', () => {
      expect(
        getSourceFromUrl('https://github.com/copilot/c/abc123'),
      ).toBe('github-copilot');
    });
  });

  describe('Perplexity', () => {
    it('detects perplexity.ai', () => {
      expect(getSourceFromUrl('https://perplexity.ai/')).toBe('perplexity');
    });

    it('detects www.perplexity.ai', () => {
      expect(
        getSourceFromUrl('https://www.perplexity.ai/search'),
      ).toBe('perplexity');
    });
  });

  describe('DeepSeek', () => {
    it('detects deepseek.com', () => {
      expect(getSourceFromUrl('https://deepseek.com/')).toBe('deepseek');
    });

    it('detects chat.deepseek.com', () => {
      expect(getSourceFromUrl('https://chat.deepseek.com/')).toBe('deepseek');
    });
  });

  describe('Unknown', () => {
    it('returns unknown for unrecognized domains', () => {
      expect(getSourceFromUrl('https://example.com/')).toBe('unknown');
    });

    it('returns unknown for empty string', () => {
      expect(getSourceFromUrl('')).toBe('unknown');
    });

    it('returns unknown for random URL', () => {
      expect(
        getSourceFromUrl('https://my-internal-app.company.com'),
      ).toBe('unknown');
    });
  });
});
