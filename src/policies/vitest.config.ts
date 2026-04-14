/**
 * Vitest config for the LocalPolicyEngine test suite.
 *
 * The root vitest.config.ts only includes 'tests/**\/*.test.ts', so this
 * local config is needed to run tests under src/policies/__tests__/.
 *
 * Usage:
 *   npx vitest run --config src/policies/vitest.config.ts
 *   npx vitest    --config src/policies/vitest.config.ts   (watch mode)
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/policies/__tests__/**/*.test.ts'],
  },
});
