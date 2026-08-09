import { defineConfig, devices } from '@playwright/test';

/**
 * Cross-browser smoke against the production build (preview).
 * Does not require core-be — static shell + version-check UX only.
 *
 *   pnpm build && pnpm preview --port 4173 --strictPort
 *   pnpm test:cross-browser
 */
export default defineConfig({
  testDir: './tests/cross-browser',
  testMatch: /\.cross-browser\.test\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: './test-results/cross-browser/artifacts',
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    // Builds its own bundle with VITE_VERSION_CHECK on. The version-update specs assert
    // the "Update available" toast, and that flag is inlined at BUILD time while
    // envProfiles.local.defaults pins it false — so the documented `pnpm build && pnpm
    // preview` flow baked the feature out and produced 9 identical false failures across
    // all three engines. Test-runner env belongs to the harness, never the developer's
    // .env.local.
    command:
      'VITE_VERSION_CHECK=true pnpm build && pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    // false: a stale flag-less preview left running would silently reintroduce the
    // false failures this config exists to prevent.
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
