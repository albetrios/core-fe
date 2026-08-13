import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.LIVE_E2E_PORT ?? 4319);

export default defineConfig({
  testDir: './tests/live-contract',
  testMatch: '**/*.live.e2e.test.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
    // The vendor scripts these tests exercise are fetched by the BROWSER, which does not inherit
    // HTTPS_PROXY the way Node does. Where an egress proxy is configured, hand it to Chromium
    // explicitly and bypass loopback so the dev server is still reached directly.
    ...(process.env.HTTPS_PROXY
      ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1,::1' } }
      : {}),
  },
  projects: [
    {
      name: 'live',
      use: {
        ...devices['Desktop Chrome'],
        // This environment provisions Chromium at a fixed path and blocks browser downloads. The
        // pinned Playwright looks for a headless-shell build that is not present, so point it at
        // the full Chromium that is. Falls back to Playwright's own resolution when unset.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: {
    command: `pnpm dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
