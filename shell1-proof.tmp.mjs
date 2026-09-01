/**
 * SHELL-1 proof harness — does the authenticated shell tear down and rebuild
 * after the session context lands?
 *
 * Cold boot (no cached me/context, exactly what F5 on a deep URL does) against
 * `vite --port 5204`, core-be intercepted. The deployment is **personal-only**,
 * but `useDeploymentFlags()` falls back to the permissive DEFAULT_DEPLOYMENT_FLAGS
 * until `me/context` resolves — so the app first derives the wrong shell.
 *
 *   node shell1-proof.tmp.mjs <before|after> <scenario> <outDir>
 *
 * scenarios:
 *   coldboot  hard-load /dashboard with a slow me/context and record every shell
 *             that mounts, plus whether the routed page remounts underneath
 *   switcher  double-click one org in the switcher — how many switch POSTs
 *   boundary  a shell variant throws mid-render — app survives, or not
 */
import fs from 'node:fs';
import path from 'node:path';

import { chromium } from '@playwright/test';

const LABEL = process.argv[2] ?? 'after';
const SCENARIO = process.argv[3] ?? 'coldboot';
const OUT = process.argv[4] ?? '.';
const BASE = process.env.PROOF_BASE_URL ?? 'http://localhost:5204';
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

const PERSONAL = org(PERSONAL_ORG_ID, 'Ada Lovelace', null, 'PERSONAL', true);
const TEAM = org(TEAM_ORG_ID, 'Acme Inc.', 'acme', 'TEAM', false);

// `switcher` needs a deployment that HAS a switcher, so it keeps both flags.
const personalOnly = SCENARIO === 'coldboot';
/** A realistic cold-boot latency for the session context. */
const CONTEXT_MS = SCENARIO === 'coldboot' ? 900 : 120;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'light',
});

let contextCalls = 0;
let switchPosts = 0;
let dashboardFetches = 0;

await context.route('**/*sentry*/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
);

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

  // A live refresh cookie: this is a returning user pressing F5, not a login.
  if (p === '/auth/refresh') return json({ data: { access_token: JWT } });

  if (p === '/auth/me/context') {
    contextCalls += 1;
    await new Promise((r) => setTimeout(r, CONTEXT_MS));
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
          capabilities: {
            personal_organizations: true,
            team_organizations: !personalOnly,
          },
          personal_organization_id: PERSONAL_ORG_ID,
        },
        active_organization: personalOnly ? PERSONAL : TEAM,
        my_permissions: ['organization:read', 'organization:update'],
        global_role: null,
        organizations: personalOnly ? [PERSONAL] : [{ ...TEAM, is_active: true }, PERSONAL],
      },
    });
  }

  if (p === '/auth/switch-to-organization' && method === 'POST') {
    switchPosts += 1;
    await new Promise((r) => setTimeout(r, 400));
    return json({
      data: {
        access_token: JWT,
        active_organization: personalOnly ? PERSONAL : TEAM,
        my_permissions: ['organization:read'],
        global_role: null,
      },
    });
  }

  if (p === '/auth/switch-to-personal' && method === 'POST') {
    switchPosts += 1;
    await new Promise((r) => setTimeout(r, 400));
    return json({
      data: {
        access_token: JWT,
        active_organization: PERSONAL,
        my_permissions: ['organization:read'],
        global_role: null,
      },
    });
  }

  if (p === '/tenancy/organization') return json({ data: personalOnly ? PERSONAL : TEAM });
  if (p.startsWith('/tenancy')) return page(personalOnly ? [PERSONAL] : [TEAM, PERSONAL]);

  // Everything the dashboard island pulls — counted, because a shell swap that
  // remounts the routed page shows up here as a second round of fetches.
  dashboardFetches += 1;
  return page([]);
});

const page = await context.newPage();
const consoleTrail = [];
page.on('pageerror', (e) => consoleTrail.push(`PAGEERROR ${String(e).slice(0, 220)}`));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning')
    consoleTrail.push(`${m.type()} ${m.text().slice(0, 200)}`);
});
const shot = (name, opts = {}) =>
  page.screenshot({ path: path.join(OUT, `shell1-${SCENARIO}-${LABEL}-${name}.png`), ...opts });
const result = { label: LABEL, scenario: SCENARIO };

/**
 * Record every distinct shell state the DOM passes through. A MutationObserver,
 * not polling: a shell that mounts and unmounts inside one frame is exactly the
 * kind of tear-down this card is about, and polling steps straight over it.
 */
const OBSERVER = () => {
  const w = window;
  w.__shellTrail = [];
  w.__t0 ??= performance.now();
  const sample = () => {
    // Only VISIBLE nodes count. React keeps a re-suspended subtree in the DOM
    // with `display:none`, so a querySelector hit is not "the user sees a shell".
    const q = (sel) => {
      const el = document.querySelector(sel);
      return el && el.getClientRects().length > 0 ? el : null;
    };
    const main = q('[data-testid="main-content"]');
    const aside = q('aside[data-testid="sidebar"]');
    let shell = null;
    if (q('[data-testid="focus-shell"]')) shell = 'focus';
    // Sidebar and Rail share the `sidebar` test id; the rail is the narrow one.
    else if (aside) shell = aside.getBoundingClientRect().width > 160 ? 'sidebar' : 'rail';
    else if (q('[data-testid="header"]')) shell = 'topnav';
    const entry = {
      ms: Math.round(performance.now() - w.__t0),
      shell,
      fallback: !!q('[data-testid="layout-variant-fallback"]'),
      spinner: !!q('[data-testid="full-page-spinner"]'),
      appLayout: !!q('[data-testid="app-layout"]'),
      shellError: !!q('[data-testid="app-shell-error"]'),
      routeError: !!q('[data-testid="route-error-boundary"]'),
      // A brand-new <main> node means the routed page remounted under the shell.
      mainId: main ? (main.__id ??= `m${(w.__mainSeq = (w.__mainSeq ?? 0) + 1)}`) : null,
    };
    const last = w.__shellTrail.at(-1);
    const key = (e) =>
      `${e.shell}|${e.fallback}|${e.spinner}|${e.appLayout}|${e.shellError}|${e.routeError}|${e.mainId}`;
    if (!last || key(last) !== key(entry)) w.__shellTrail.push(entry);
  };
  // addInitScript runs before <html> exists, so install once the document does.
  const install = () => {
    sample();
    new MutationObserver(sample).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
    });
  };
  if (document.documentElement) install();
  else document.addEventListener('readystatechange', function once() {
    if (!document.documentElement) return;
    document.removeEventListener('readystatechange', once);
    install();
  });
};

if (SCENARIO === 'coldboot' || SCENARIO === 'boundary') {
  await page.addInitScript(OBSERVER);
  // `boundary` needs the team shell (variant 0 = sidebar), which is the one the
  // crash is injected into; `coldboot` is the personal-only deployment.
  await page.goto(SCENARIO === 'boundary' ? `${BASE}/organization/acme/dashboard` : `${BASE}/dashboard`, {
    waitUntil: 'domcontentloaded',
  });

  // Frame 1 — what is on screen while me/context is still in flight.
  await page.waitForTimeout(620);
  await shot('1-early');
  result.earlyShell = await page.evaluate(() => window.__shellTrail?.at(-1) ?? null);

  await page.waitForTimeout(6000);
  await shot('2-settled');
  result.trail = await page.evaluate(() => window.__shellTrail ?? []);
  result.finalUrl = new URL(page.url()).pathname;
  result.shellsMounted = [
    ...new Set(result.trail.map((s) => s.shell).filter(Boolean)),
  ];
  result.shellSwaps = result.trail.filter(
    (s, i) => i > 0 && s.shell && result.trail[i - 1].shell && s.shell !== result.trail[i - 1].shell,
  ).length;
  result.mainRemounts =
    new Set(result.trail.map((s) => s.mainId).filter(Boolean)).size;
  result.sawFallback = result.trail.some((s) => s.fallback);
  result.sawBlank = result.trail.some((s) => s.appLayout && !s.shell && !s.spinner);
  result.containedShellError = result.trail.some((s) => s.shellError);
  result.routeBoundary = result.trail.some((s) => s.routeError);
  result.bodyText = (await page.locator('body').innerText())
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
} else if (SCENARIO === 'shuffle') {
  // The live trigger: Appearance → Shuffle re-rolls `appVariant`, so the mounted
  // shell becomes a DIFFERENT lazy chunk while the user is sitting on the page.
  await page.addInitScript(OBSERVER);
  await page.goto(`${BASE}/organization/acme/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('app-layout').waitFor({ timeout: 30_000 });
  await page.getByTestId('main-content').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1800);

  // Scroll down: losing this position is half the reported damage.
  await page.getByTestId('main-content').evaluate((el) => {
    el.scrollTop = 320;
  });
  await page.waitForTimeout(200);
  result.scrollBefore = await page
    .getByTestId('main-content')
    .evaluate((el) => el.scrollTop);
  const fetchesBefore = dashboardFetches;
  await page.evaluate(() => {
    window.__shellTrail = [];
    window.__t0 = performance.now();
  });
  await shot('1-before-shuffle');

  // The canonical user path: the floating Appearance button → Shuffle.
  await page.getByTestId('floating-settings').first().click();
  await page.getByTestId('theme-shuffle').waitFor({ timeout: 15_000 });
  await page.getByTestId('theme-shuffle').click();

  // Frame 2 — the moment the old shell is gone and the new one is not up yet.
  await page.waitForTimeout(70);
  await shot('2-mid-swap');
  await page.getByTestId('appearance-close').click().catch(() => {});

  // Sample the scroll offset as the new shell settles — a restore that lands and
  // is then clobbered looks identical to one that never happened, at one read.
  const scrollSamples = [];
  for (let i = 0; i < 40; i += 1) {
    scrollSamples.push(
      await page
        .getByTestId('main-content')
        .evaluate((el) => ({ top: el.scrollTop, h: el.scrollHeight, c: el.clientHeight }))
        .catch(() => null),
    );
    await page.waitForTimeout(120);
  }
  result.scrollSamples = scrollSamples;
  await shot('3-after-shuffle');
  result.trail = await page.evaluate(() => window.__shellTrail ?? []);
  result.dashboardFetchesForSwap = dashboardFetches - fetchesBefore;
  result.scrollAfter = await page
    .getByTestId('main-content')
    .evaluate((el) => el.scrollTop)
    .catch(() => null);
  result.shellsMounted = [...new Set(result.trail.map((x) => x.shell).filter(Boolean))];
  result.shellSwaps = result.trail.filter(
    (x, i) =>
      i > 0 && x.shell && result.trail[i - 1].shell && x.shell !== result.trail[i - 1].shell,
  ).length;
  result.mainRemounts = new Set(result.trail.map((x) => x.mainId).filter(Boolean)).size;
  result.sawFallback = result.trail.some((x) => x.fallback);
  // The reported symptom: app-layout mounted, but NO shell and NO spinner inside it.
  result.sawShellless = result.trail.some((x) => x.appLayout && !x.shell);
  result.shelllessMs = (() => {
    const t = result.trail;
    let total = 0;
    for (let i = 0; i < t.length; i += 1) {
      if (t[i].appLayout && !t[i].shell) total += (t[i + 1]?.ms ?? t[i].ms) - t[i].ms;
    }
    return total;
  })();
} else if (SCENARIO === 'switcher') {
  await page.goto(`${BASE}/organization/acme/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('organization-switcher-trigger').first().waitFor({ timeout: 25_000 });
  await page.waitForTimeout(400);
  await page.getByTestId('organization-switcher-trigger').first().click();
  const option = page.getByTestId('organization-switcher-option-personal').first();
  await option.waitFor({ timeout: 10_000 });
  await shot('1-open');

  const before = switchPosts;
  // Both clicks in ONE frame — the window a disabled/closing menu cannot close.
  await option.evaluate((el) => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(2200);
  result.switchPostsForGesture = switchPosts - before;
  result.finalUrl = new URL(page.url()).pathname;
  await shot('2-after-doubleclick');
}

result.console = consoleTrail.slice(0, 12);
result.contextCalls = contextCalls;
result.switchPosts = switchPosts;
result.dashboardFetches = dashboardFetches;
fs.writeFileSync(
  path.join(OUT, `shell1-${SCENARIO}-${LABEL}.json`),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
await browser.close();
