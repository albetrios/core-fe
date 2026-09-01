/**
 * SHELL-2 proof harness — what the user sees when they switch workspace.
 *
 * Drives the real org switcher on `/organization/acme/dashboard` in a real
 * Chromium against `vite --port 5205`, core-be intercepted.
 *
 *   node shell2-proof.tmp.mjs <before|after> <scenario> <outDir>
 *
 * scenarios:
 *   inflight  the switch takes a normal round trip — is there ANY sign of it?
 *   failure   the switch 500s — is the user told, or left on the old org silently?
 *   dblclick  two clicks on one row in ONE frame — how many switch POSTs
 *   boundary  the switcher throws mid-render — contained, or the whole app
 */
import fs from 'node:fs';
import path from 'node:path';

import { chromium } from '@playwright/test';

const LABEL = process.argv[2] ?? 'after';
const SCENARIO = process.argv[3] ?? 'inflight';
const OUT = process.argv[4] ?? '.';
const BASE = process.env.PROOF_BASE_URL ?? 'http://localhost:5205';
fs.mkdirSync(OUT, { recursive: true });

const id = (p, seed) => `${p}_${seed.padEnd(21, 'x').slice(0, 21)}`;
const USER_ID = id('usr', 'ada00000000000000000');
const PERSONAL_ORG_ID = id('org', 'adapersonal000000000');
const TEAM_ORG_ID = id('org', 'acme0000000000000000');
const TS = '2026-01-01T00:00:00.000Z';
const b64u = (o) =>
  Buffer.from(JSON.stringify(o)).toString('base64url').replace(/=+$/, '');
const EXP = Math.floor(Date.now() / 1000) + 3600;
const JWT = `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u({ sub: USER_ID, exp: EXP })}.sig`;

const org = (oid, name, slug, type, isActive) => ({
  id: oid,
  name,
  slug,
  type,
  status: 'ACTIVE',
  logo_url: null,
  brand_color: null,
  created_at: TS,
  updated_at: TS,
  is_active: isActive,
});
const PERSONAL = org(PERSONAL_ORG_ID, 'Ada Lovelace', null, 'PERSONAL', false);
const TEAM = org(TEAM_ORG_ID, 'Acme Inc.', 'acme', 'TEAM', true);

/** A normal mobile-ish round trip for the switch itself. */
const SWITCH_MS = SCENARIO === 'dblclick' ? 900 : 1500;
const switchShouldFail = SCENARIO === 'failure';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'light',
});

let switchPosts = 0;
const sentryReports = [];

await context.route('**/*sentry*/**', async (route) => {
  sentryReports.push(new URL(route.request().url()).pathname);
  await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

await context.route('**/api/v1/**', async (route) => {
  const req = route.request();
  const p = new URL(req.url()).pathname.replace('/api/v1', '');
  const method = req.method();
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
          capabilities: { personal_organizations: true, team_organizations: true },
          personal_organization_id: PERSONAL_ORG_ID,
        },
        active_organization: TEAM,
        my_permissions: ['organization:read', 'organization:update'],
        global_role: null,
        organizations: [TEAM, PERSONAL],
      },
    });
  }

  // The measurement.
  if (p === '/auth/switch-to-personal' && method === 'POST') {
    switchPosts += 1;
    await new Promise((r) => setTimeout(r, SWITCH_MS));
    if (switchShouldFail) {
      return json(
        { error: { code: 'INTERNAL', detail: 'Workspace switch is unavailable' } },
        500,
      );
    }
    return json({
      data: {
        access_token: JWT,
        active_organization: { ...PERSONAL, is_active: true },
        my_permissions: ['organization:read'],
        global_role: null,
      },
    });
  }
  if (p === '/auth/switch-to-organization' && method === 'POST') {
    switchPosts += 1;
    await new Promise((r) => setTimeout(r, SWITCH_MS));
    return json({
      data: {
        access_token: JWT,
        active_organization: TEAM,
        my_permissions: ['organization:read'],
        global_role: null,
      },
    });
  }

  if (p === '/tenancy/organization') return json({ data: TEAM });
  if (p.startsWith('/tenancy')) return page([TEAM, PERSONAL]);
  return page([]);
});

const page = await context.newPage();
const shot = (name, opts = {}) =>
  page.screenshot({
    path: path.join(OUT, `shell2-${SCENARIO}-${LABEL}-${name}.png`),
    ...opts,
  });
const result = { label: LABEL, scenario: SCENARIO };
const readToasts = async () =>
  (await page.locator('[data-sonner-toast]').allInnerTexts()).map((x) =>
    x.replace(/\s+/g, ' ').trim(),
  );

/**
 * Record every visible state of the switcher surface. A MutationObserver, not
 * polling: the whole complaint is that nothing changes, and "nothing changed"
 * is only a finding if you were watching every frame.
 */
const OBSERVER = () => {
  const w = window;
  w.__swTrail = [];
  const install = () => {
    const t0 = performance.now();
    const vis = (sel) => {
      const el = document.querySelector(sel);
      return el && el.getClientRects().length > 0 ? el : null;
    };
    const sample = () => {
      const trigger = vis('[data-testid="organization-switcher-trigger"]');
      const entry = {
        ms: Math.round(performance.now() - t0),
        menuOpen: !!vis('[data-testid="organization-switcher-option-personal"]'),
        rowSpinner: !!vis('[data-testid="organization-switcher-option-spinner"]'),
        triggerDisabled: trigger ? trigger.disabled : null,
        triggerBusy: trigger ? trigger.getAttribute('aria-busy') === 'true' : null,
        // The app's usual "something is happening" signal.
        progressBar: !!vis('[data-testid="route-progress"]'),
        toasts: document.querySelectorAll('[data-sonner-toast]').length,
        path: location.pathname,
      };
      const key = (e) =>
        `${e.menuOpen}|${e.rowSpinner}|${e.triggerDisabled}|${e.triggerBusy}|${e.progressBar}|${e.toasts}|${e.path}`;
      const last = w.__swTrail.at(-1);
      if (!last || key(last) !== key(entry)) w.__swTrail.push(entry);
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

await page.addInitScript(OBSERVER);
await page.goto(`${BASE}/organization/acme/dashboard${SCENARIO === 'boundary' ? '?crash=1' : ''}`, {
  waitUntil: 'domcontentloaded',
});

if (SCENARIO === 'boundary') {
  await page.getByTestId('app-layout').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  result.containedFallback =
    (await page.getByTestId('org-switcher-error-sidebar').count()) > 0 ||
    (await page.getByTestId('org-switcher-error').count()) > 0;
  result.routeBoundary = (await page.getByTestId('route-error-boundary').count()) > 0;
  result.appLayoutSurvives = (await page.getByTestId('app-layout').count()) > 0;
  result.mainContentSurvives = (await page.getByTestId('main-content').count()) > 0;
  await shot('1-crash');
} else {
  await page.getByTestId('organization-switcher-trigger').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.getByTestId('organization-switcher-trigger').first().click();
  const row = page.getByTestId('organization-switcher-option-personal').first();
  await row.waitFor({ timeout: 10_000 });
  await page.waitForTimeout(250);
  await shot('1-menu-open');

  // Reset the trail so the measurement starts at the gesture.
  await page.evaluate(() => {
    window.__swTrail = [];
  });
  const postsBefore = switchPosts;

  if (SCENARIO === 'dblclick') {
    // Both in ONE frame — the window `disabled` cannot close.
    await row.evaluate((el) => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  } else {
    await row.click();
  }

  // Frame 2 — mid-round-trip. This is the window the card is about.
  await page.waitForTimeout(500);
  result.inflight = await page.evaluate(() => window.__swTrail?.at(-1) ?? null);
  await shot('2-inflight');

  await page.waitForTimeout(SWITCH_MS + 2500);
  result.trail = await page.evaluate(() => window.__swTrail ?? []);
  result.postsForGesture = switchPosts - postsBefore;
  result.toasts = await readToasts();
  result.landedUrl = new URL(page.url()).pathname;
  result.activeOrgLabel = await page
    .getByTestId('organization-switcher-trigger')
    .first()
    .innerText()
    .then((x) => x.replace(/\s+/g, ' ').trim())
    .catch(() => null);
  // Was there ANY visible sign of work between the click and the outcome?
  const hasSignal = (x) => x.rowSpinner || x.triggerDisabled || x.progressBar;
  result.anyInFlightSignal = result.trail.some(hasSignal);
  // How long the screen said nothing at all. The route progress bar only starts
  // when navigation does, which is AFTER the switch round trip — so on the old
  // build this is the full length of the request.
  const firstSignal = result.trail.find(hasSignal);
  result.deadMs = firstSignal ? firstSignal.ms - (result.trail[0]?.ms ?? 0) : null;
  result.menuClosedImmediately = result.trail.some(
    (x, i) => i > 0 && !x.menuOpen && !hasSignal(x),
  );
  await shot('3-settled');
}

result.switchPosts = switchPosts;
result.sentryReports = sentryReports.length;
fs.writeFileSync(
  path.join(OUT, `shell2-${SCENARIO}-${LABEL}.json`),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
await browser.close();
