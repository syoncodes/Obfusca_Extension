/**
 * Utility to generate protected text based on user redaction choices.
 *
 * Takes the fully-obfuscated text from the backend and applies the user's
 * per-item redaction choices:
 *  - Enabled items: keep the placeholder (or swap in custom replacement text)
 *  - Disabled items: placeholder stays in place (we never have the raw original)
 *
 * SECURITY: The backend never sends raw matched values. Unchecked items cannot
 * be "restored" -- the user should use "Send Anyway" for the original text.
 * This function is only called by the "Send Protected" button.
 */

import type { MappingItem, RedactionChoice } from './detectionPopup';

/**
 * Generate the final protected text based on the user's redaction choices.
 *
 * Uses the token map for reliable text replacement when available.
 * The token map identifies what text each mapping actually corresponds to
 * in `obfuscatedText`, handling mismatches between AI-generated
 * placeholders and backend-reported placeholder names.
 *
 * @param obfuscatedText - The fully obfuscated text from the backend
 * @param mappings - The mapping items showing what was replaced
 * @param choices - The user's per-item redaction choices (checkbox state + replacement text)
 * @param tokenMap - Optional map from row index to actual token in obfuscatedText
 * @returns The final text with the user's chosen redactions applied
 */
export function generateProtectedText(
  obfuscatedText: string,
  mappings: MappingItem[],
  choices: RedactionChoice[],
  tokenMap?: Map<number, string>
): string {
  let result = obfuscatedText;

  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    const choice = choices[i];

    if (!choice || !choice.enabled) continue;

    const newText = choice.replacementText;

    // Strategy 1: Use token map for reliable matching
    if (tokenMap) {
      const token = tokenMap.get(i);
      if (token && token !== newText && result.includes(token)) {
        result = result.replace(token, newText);
        continue;
      }
    }

    // Strategy 2: Fallback to placeholder
    if (newText && newText !== mapping.placeholder && result.includes(mapping.placeholder)) {
      result = result.replace(mapping.placeholder, newText);
      continue;
    }

    // Strategy 3: Fallback to replacement
    if (mapping.replacement && newText !== mapping.replacement && result.includes(mapping.replacement)) {
      result = result.replace(mapping.replacement, newText);
    }
    // Disabled items: placeholder remains. The raw value is never available
    // client-side (by design). Users who want the original should use "Send Anyway".
  }

  return result;
}
