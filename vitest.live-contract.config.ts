import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Live third-party contract tier (Node half).
 *
 * Separate from vitest.config.ts on purpose: these tests make real outbound requests, so they must
 * never be picked up by `pnpm test`. A provider runs only when named in CONTRACT_LIVE_PROVIDERS.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    name: 'live-contract',
    include: ['tests/live-contract/**/*.live.test.ts'],
    environment: 'node',
    testTimeout: 45_000,
    hookTimeout: 45_000,
  },
});
