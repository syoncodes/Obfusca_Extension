/**
 * Site registry for Obfusca.
 * Central registry of all supported LLM chat sites.
 * Adding a new site is as simple as creating a config file and adding it here.
 */

import type { SiteConfig } from './types';

// Import all site adapters
import { chatgptConfig } from './chatgpt';
import { claudeConfig } from './claude';
import { geminiConfig } from './gemini';
import { grokConfig } from './grok';
import { deepseekConfig } from './deepseek';
import { githubCopilotConfig } from './github-copilot';
import { perplexityConfig } from './perplexity';
import { copilotConfig } from './copilot';
import { mistralConfig } from './mistral';
import { cohereConfig } from './cohere';
import { notionConfig } from './notion';

/**
 * Registry of all supported sites.
 * To add a new site:
 * 1. Create a new adapter file (e.g., sites/newsite.ts)
 * 2. Implement the SiteConfig interface
 * 3. Import and add it to this array
 * 4. Update manifest.json with the new host permissions
 */
export const SITE_REGISTRY: SiteConfig[] = [
  chatgptConfig,
  claudeConfig,
  geminiConfig,
  grokConfig,
  deepseekConfig,
  githubCopilotConfig,
  perplexityConfig,
  copilotConfig,
  mistralConfig,
  cohereConfig,
  notionConfig,
];

/**
 * Find the site configuration for the current hostname.
 * Returns null if the current site is not supported.
 */
export function detectCurrentSite(): SiteConfig | null {
  const hostname = window.location.hostname;

  for (const config of SITE_REGISTRY) {
    for (const pattern of config.hostPatterns) {
      // Support exact match or subdomain match
      if (hostname === pattern || hostname.endsWith('.' + pattern)) {
        console.log(`Obfusca: Detected site "${config.name}" for hostname "${hostname}"`);
        return config;
      }
    }
  }

  console.log(`Obfusca: No supported site found for hostname "${hostname}"`);
  return null;
}

/**
 * Get all host patterns for manifest.json host_permissions.
 */
export function getAllHostPatterns(): string[] {
  const patterns: string[] = [];

  for (const config of SITE_REGISTRY) {
    for (const host of config.hostPatterns) {
      // Convert to manifest URL pattern format
      patterns.push(`https://${host}/*`);
      // Also add www variant if not already a subdomain
      if (!host.startsWith('www.') && !host.includes('.')) {
        patterns.push(`https://www.${host}/*`);
      }
    }
  }

  return [...new Set(patterns)]; // Deduplicate
}

/**
 * Get a site configuration by name.
 */
export function getSiteByName(name: string): SiteConfig | null {
  return SITE_REGISTRY.find((config) => config.name.toLowerCase() === name.toLowerCase()) || null;
}

/**
 * Check if a hostname is supported.
 */
export function isHostnameSupported(hostname: string): boolean {
  for (const config of SITE_REGISTRY) {
    for (const pattern of config.hostPatterns) {
      if (hostname === pattern || hostname.endsWith('.' + pattern)) {
        return true;
      }
    }
  }
  return false;
}

// Re-export types
export type { SiteConfig, SiteHookResult, SiteState } from './types';

// Re-export individual configs for direct access if needed
export {
  chatgptConfig,
  claudeConfig,
  geminiConfig,
  grokConfig,
  deepseekConfig,
  githubCopilotConfig,
  perplexityConfig,
  copilotConfig,
  mistralConfig,
  cohereConfig,
  notionConfig,
};
