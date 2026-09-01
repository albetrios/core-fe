/**
 * SHELL-3 / SHELL-4 proof harness — what a lazy overlay does while its chunk is
 * in flight, and what it does when that chunk never arrives.
 *
 * Drives the real app on `/organization/acme/dashboard` against
 * `vite --port 5206`, core-be intercepted. The overlay's own JS module request
 * is intercepted too — delayed (SHELL-4) or failed (SHELL-3).
 *
 *   node shell34-proof.tmp.mjs <before|after> <scenario> <outDir>
 *
 * scenarios:
 *   deadclick   ⌘K with a slow palette chunk — does the click register?
 *   settings    open Settings with a slow chunk (the biggest of the three)
 *   flaky       the Settings chunk 500s once — is the page replaced, and does
 *               Retry do anything?
 *   spam        ⌘K pressed twice in one frame — how many chunk requests
 */
import fs from 'node:fs';
import path from 'node:path';

import { chromium } from '@playwright/test';

const LABEL = process.argv[2] ?? 'after';
const SCENARIO = process.argv[3] ?? 'deadclick';
const OUT = process.argv[4] ?? '.';
const BASE = process.env.PROOF_BASE_URL ?? 'http://localhost:5206';
fs.mkdirSync(OUT, { recursive: true });

const id = (p, seed) => `${p}_${seed.padEnd(21, 'x').slice(0, 21)}`;
const USER_ID = id('usr', 'ada00000000000000000');
const TEAM_ORG_ID = id('org', 'acme0000000000000000');
const TS = '2026-01-01T00:00:00.000Z';
const b64u = (o) =>
  Buffer.from(JSON.stringify(o)).toString('base64url').replace(/=+$/, '');
const EXP = Math.floor(Date.now() / 1000) + 3600;
const JWT = `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u({ sub: USER_ID, exp: EXP })}.sig`;

const TEAM = {
  id: TEAM_ORG_ID,
  name: 'Acme Inc.',
  slug: 'acme',
  type: 'TEAM',
  status: 'ACTIVE',
  logo_url: null,
  brand_color: null,
  created_at: TS,
  updated_at: TS,
  is_active: true,
};

/** Which module the scenario targets, and how it is degraded. */
const TARGET = SCENARIO === 'deadclick' || SCENARIO === 'spam' ? 'CommandPalette' : 'SettingsModal';
// Settings gets a longer stall on purpose: its chunk is idle-PREFETCHED on
// authenticated surfaces, so the dead window only exists while that prefetch is
// still in flight — a cold tab, a slow network, or a `#settings/…` deep link.
const CHUNK_DELAY_MS = SCENARIO === 'flaky' ? 0 : SCENARIO === 'settings' ? 4200 : 1600;
const failFirstFetch = SCENARIO === 'flaky';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'light',
});

let chunkRequests = 0;
let chunkFailures = 0;

await context.route('**/*sentry*/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
);

// ── The overlay's own JS module ──────────────────────────────────────────────
// Vite dev serves each source module at its own URL, so the chunk fetch React
// waits on is interceptable exactly like an API call.
await context.route(`**/${TARGET}.tsx*`, async (route) => {
  chunkRequests += 1;
  if (failFirstFetch && chunkRequests === 1) {
    chunkFailures += 1;
    return route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' });
  }
  if (CHUNK_DELAY_MS) await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
  return route.continue();
});

await context.route('**/api/v1/**', async (route) => {
  const p = new URL(route.request().url()).pathname.replace('/api/v1', '');
  const json = (body, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(
        body && typeof body === 'object' && 'data' in body && !('meta' in body)
          ? { ...body, meta: { request_id: 'proof' } }
          : body,
      ),
    });
  const page = (rows) =>
    json({ data: rows, meta: { pagination: { next: null, has_more: false } } });

  if (p === '/auth/refresh') return json({ data: { access_token: JWT } });
  if (p === '/auth/me/context') {
    return json({
      data: {
        user: {
          id: USER_ID,
          email: 'ada@acme.test',
          is_email_verified: true,
          is_mfa_enabled: false,
          first_name: 'Ada',
          last_name: 'Lovelace',
          job_title: null,
          avatar_url: null,
          status: 'ACTIVE',
          onboarding_completed: true,
          created_at: TS,
          updated_at: TS,
          capabilities: { personal_organizations: false, team_organizations: true },
          personal_organization_id: null,
        },
        active_organization: TEAM,
        my_permissions: ['organization:read', 'organization:update'],
        global_role: null,
        organizations: [TEAM],
      },
    });
  }
  if (p === '/tenancy/organization') return json({ data: TEAM });
  if (p.startsWith('/tenancy')) return page([TEAM]);
  return page([]);
});

const pageObj = await context.newPage();
const shot = (name, opts = {}) =>
  pageObj.screenshot({
    path: path.join(OUT, `shell34-${SCENARIO}-${LABEL}-${name}.png`),
    ...opts,
  });
const result = { label: LABEL, scenario: SCENARIO };

/** Every visible state of the overlay surface, frame by frame. */
const OBSERVER = () => {
  const w = window;
  w.__ovTrail = [];
  const install = () => {
    w.__ovT0 ??= performance.now();
    const vis = (sel) => {
      const el = document.querySelector(sel);
      return el && el.getClientRects().length > 0 ? el : null;
    };
    const sample = () => {
      const entry = {
        ms: Math.round(performance.now() - w.__ovT0),
        // Something overlay-shaped is on screen: skeleton, error, or the real thing.
        pending: !!vis('[data-testid$="-pending"]'),
        // Callers override the testId per overlay, so key on the role instead.
        overlayError: !!vis('[role="alertdialog"]'),
        palette: !!vis('[cmdk-root]'),
        settings: !!vis('[data-testid="settings-modal"]'),
        appearance: !!vis('[data-testid="appearance-dialog"]'),
        // The old behaviour: the whole page replaced.
        routeBoundary: !!vis('[data-testid="route-error-boundary"]'),
        pageContentError: !!vis('[data-testid="page-content-error"]'),
        appShellError: !!vis('[data-testid="app-shell-error"]'),
        mainContent: !!vis('[data-testid="main-content"]'),
      };
      const key = (e) => Object.values(e).slice(1).join('|');
      const last = w.__ovTrail.at(-1);
      if (!last || key(last) !== key(entry)) w.__ovTrail.push(entry);
    };
    sample();
    new MutationObserver(sample).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
    });
  };
  if (document.documentElement) install();
  else
    document.addEventListener('readystatechange', function once() {
      if (!document.documentElement) return;
      document.removeEventListener('readystatechange', once);
      install();
    });
};

await pageObj.addInitScript(OBSERVER);
await pageObj.goto(`${BASE}/organization/acme/dashboard`, {
  waitUntil: 'domcontentloaded',
});
await pageObj.getByTestId('main-content').waitFor({ timeout: 30_000 });
await pageObj.waitForTimeout(2000);
await shot('1-before-gesture');

// Reset the trail so the measurement starts at the gesture.
await pageObj.evaluate(() => {
  window.__ovTrail = [];
  window.__ovT0 = performance.now();
});
const requestsBefore = chunkRequests;

const openPalette = async () => {
  await pageObj.keyboard.press('Control+k');
};
const openSettings = async () => {
  await pageObj.evaluate(() => {
    window.location.hash = '#settings/account/profile';
  });
};

if (SCENARIO === 'spam') {
  // Two presses inside one frame — does the chunk get requested twice?
  await pageObj.evaluate(() => {
    const fire = () =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
      );
    fire();
    fire();
  });
} else if (TARGET === 'CommandPalette') {
  await openPalette();
} else {
  await openSettings();
}

// Frame 2 — 150 ms after the gesture. This is the dead-click window.
await pageObj.waitForTimeout(150);
result.at150ms = await pageObj.evaluate(() => window.__ovTrail?.at(-1) ?? null);
await shot('2-just-after-gesture');

await pageObj.waitForTimeout(CHUNK_DELAY_MS + 2500);
result.trail = await pageObj.evaluate(() => window.__ovTrail ?? []);
result.chunkRequestsForGesture = chunkRequests - requestsBefore;
await shot('3-settled');

const anyOverlay = (x) =>
  x.pending || x.overlayError || x.palette || x.settings || x.appearance;
const first = result.trail.find(anyOverlay);
result.deadMs = first ? first.ms : null;
result.pageReplaced = result.trail.some(
  (x) => x.routeBoundary || x.pageContentError || x.appShellError || !x.mainContent,
);
result.containedError = result.trail.some((x) => x.overlayError);
result.everOpened = result.trail.some((x) => x.palette || x.settings || x.appearance);

if (SCENARIO === 'flaky') {
  // Does Retry do anything? On the old build the button is there and inert.
  const retry = pageObj.getByTestId('lazy-overlay-retry');
  // Whatever retry the build actually offers — the contained one, the route
  // boundary's own, or any button that says so.
  const anyRetry = pageObj
    .getByRole('button', { name: /try again|retry|refresh/i })
    .first();
  result.hasContainedRetry = (await retry.count()) > 0;
  result.hasAnyRetryButton = (await anyRetry.count()) > 0;
  result.retryLabel = result.hasAnyRetryButton
    ? (await anyRetry.innerText()).replace(/\s+/g, ' ').trim()
    : null;
  const beforeRetry = chunkRequests;
  if (result.hasContainedRetry) {
    await retry.click();
  }
  // A "Refresh page" button is NOT a retry — it is a whole-app reload that
  // throws away everything the user had. Record it, do not press it.
  result.recoveryIsFullReload =
    !result.hasContainedRetry && /refresh/i.test(result.retryLabel ?? '');
  await pageObj.waitForTimeout(3000);
  result.chunkRequestsOnRetry = chunkRequests - beforeRetry;
  result.recoveredAfterRetry =
    (await pageObj.getByTestId('settings-modal').count()) > 0 ||
    (await pageObj.locator('[cmdk-root]').count()) > 0;
  result.mainContentAfterRetry = (await pageObj.getByTestId('main-content').count()) > 0;
  await shot('4-after-retry');
}

result.chunkRequests = chunkRequests;
result.chunkFailures = chunkFailures;
fs.writeFileSync(
  path.join(OUT, `shell34-${SCENARIO}-${LABEL}.json`),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
await browser.close();
