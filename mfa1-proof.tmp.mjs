/**
 * MFA-1 proof harness — how many times one gesture spends a single-use MFA token.
 *
 * Drives the REAL /login → /mfa flow in a real Chromium against `vite --port 5203`,
 * with core-be intercepted. The MFA session token is minted once and, like core-be,
 * this fake backend BURNS it on first use: a second verify with the same token is
 * rejected `mfa_token_consumed`. That is the whole point — a duplicate request does
 * not waste a round trip, it fails the sign-in the first request just won.
 *
 *   node mfa1-proof.mjs <before|after> <scenario> <outDir>
 *
 * scenarios:
 *   retype    verify is slow; the user edits a box and re-completes the code
 *             (the reported symptom — boxes stay editable while verifying)
 *   dblclick  two clicks on Verify inside ONE frame
 *   navflip   a GOOD code: does "Verifying..." re-arm while the route swaps?
 *   boundary  the form throws mid-render — page shell survives, or not
 */
import fs from 'node:fs';
import path from 'node:path';

import { chromium } from '@playwright/test';

const LABEL = process.argv[2] ?? 'after';
const SCENARIO = process.argv[3] ?? 'retype';
const OUT = process.argv[4] ?? '.';
const BASE = process.env.PROOF_BASE_URL ?? 'http://localhost:5203';
fs.mkdirSync(OUT, { recursive: true });

const id = (p, seed) => `${p}_${seed.padEnd(21, 'x').slice(0, 21)}`;
const USER_ID = id('usr', 'ada00000000000000000');
const ORG_ID = id('org', 'acme0000000000000000');
const TS = '2026-01-01T00:00:00.000Z';
const b64u = (o) =>
  Buffer.from(JSON.stringify(o)).toString('base64url').replace(/=+$/, '');
const EXP = Math.floor(Date.now() / 1000) + 3600;
const JWT = `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u({ sub: USER_ID, exp: EXP })}.sig`;
const MFA_TOKEN = 'mfa-session-token-single-use';

const ORG = {
  id: ORG_ID,
  name: 'Acme Inc.',
  slug: 'acme',
  type: 'TEAM',
  status: 'ACTIVE',
  logo_url: null,
  brand_color: null,
  created_at: TS,
  updated_at: TS,
};

// A slow verify widens the in-flight window the user can type into. 1.4s is a
// realistic mobile round trip, not a contrivance — the bug needs no slowness at
// all for `dblclick`, which lands both gestures inside a single animation frame.
const VERIFY_MS = SCENARIO === 'dblclick' ? 900 : 1400;
/** How long the destination's own guards take to resolve the org context. */
const NAV_GUARD_MS = SCENARIO === 'navflip' ? 1100 : 0;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1180, height: 860 },
  deviceScaleFactor: 2,
  colorScheme: 'light',
});

let mfaPosts = 0;
let mfaAccepted = 0;
let mfaRejectedAsConsumed = 0;
let tokenBurned = false;
const mfaBodies = [];

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

  if (p === '/auth/refresh') {
    return json({ error: { code: 'UNAUTHORIZED', detail: 'No session' } }, 401);
  }

  if (p === '/auth/oauth/providers') return json({ data: [] });

  if (p === '/auth/email/send-code' && method === 'POST') {
    return json({ data: { sent: true } });
  }

  // The primary factor passes and hands back an MFA challenge.
  if (p === '/auth/email/login' && method === 'POST') {
    return json({ data: { mfa_required: true, mfa_session_token: MFA_TOKEN } });
  }

  // The second factor. This is the measurement.
  if (p === '/auth/mfa/login' && method === 'POST') {
    mfaPosts += 1;
    const body = JSON.parse(req.postData() ?? '{}');
    mfaBodies.push({ token: body.mfa_session_token, code: body.totp_code ?? body.recovery_code });
    await new Promise((r) => setTimeout(r, VERIFY_MS));

    // core-be behaviour: the MFA session token is single use.
    if (tokenBurned) {
      mfaRejectedAsConsumed += 1;
      return json(
        { error: { code: 'UNAUTHORIZED', detail: 'MFA session token already used' } },
        401,
      );
    }
    tokenBurned = true;
    mfaAccepted += 1;
    return json({ data: { access_token: JWT } });
  }

  if (p === '/auth/me/context') {
    return json({
      data: {
        user: {
          id: USER_ID,
          email: 'ada@acme.test',
          is_email_verified: true,
          is_mfa_enabled: true,
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
        active_organization: ORG,
        my_permissions: ['organization:read'],
        global_role: null,
        organizations: [{ ...ORG, is_active: true }],
      },
    });
  }

  // The post-MFA redirect is not instant: the destination guards resolve the org
  // context over the network before the new screen paints. That gap is the window
  // the user is looking at the MFA form in — so model it.
  if (p === '/auth/switch-to-organization' && method === 'POST') {
    await new Promise((r) => setTimeout(r, NAV_GUARD_MS));
    return json({
      data: {
        access_token: JWT,
        active_organization: ORG,
        my_permissions: ['organization:read'],
        global_role: null,
      },
    });
  }

  if (p === '/tenancy/organization') {
    await new Promise((r) => setTimeout(r, NAV_GUARD_MS));
    return json({ data: ORG });
  }
  if (p.startsWith('/tenancy')) return page([{ ...ORG, is_active: true }]);
  return page([]);
});

const page = await context.newPage();
const shot = (name, opts = {}) =>
  page.screenshot({ path: path.join(OUT, `mfa1-${SCENARIO}-${LABEL}-${name}.png`), ...opts });

const result = { label: LABEL, scenario: SCENARIO };
const txt = async (locator) =>
  (await locator.innerText()).replace(/\s+/g, ' ').trim();

// ── Reach /mfa through the real sign-in flow ────────────────────────────────
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('auth-email').waitFor({ timeout: 20_000 });
await page.getByTestId('auth-email').fill('ada@acme.test');
await page.getByTestId('auth-email-submit').click();
await page.getByTestId('auth-email-code').waitFor({ timeout: 20_000 });
await page.getByTestId('auth-email-code').pressSequentially('ABC123', { delay: 20 });
if (SCENARIO === 'boundary') {
  // The form throws on mount here, so wait for the ROUTE, not for the form.
  await page.waitForFunction(() => window.location.pathname === '/mfa', null, {
    timeout: 20_000,
  });
  await page.waitForTimeout(1200);
} else {
  await page.getByTestId('mfa-form').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(200);
}

if (SCENARIO === 'boundary') {
  result.pageShellSurvives = (await page.getByTestId('mfa-page').count()) > 0;
  result.containedFallback =
    (await page.getByTestId('mfa-form-boundary-error').count()) > 0;
  result.routeBoundary = (await page.getByTestId('route-error-boundary').count()) > 0;
  result.authShell = (await page.getByTestId('auth-form-container').count()) > 0;
  result.localeSwitcher = (await page.getByTestId('auth-locale-select').count()) > 0;
  result.bodyText = (await txt(page.locator('body'))).slice(0, 220);
  await shot('1-crash');
} else if (SCENARIO === 'navflip') {
  // A GOOD code. Watch the button across the verify and the route swap.
  const samples = [];
  const t0 = Date.now();
  // Polling can step over a one-frame re-arm. A MutationObserver on the form
  // records EVERY paint of the button, so "it never happened" is a real finding
  // and not an artefact of the sampling rate.
  await page.evaluate(() => {
    const w = window;
    w.__mfaLabels = [];
    const t = performance.now();
    const record = () => {
      const b = document.querySelector('[data-testid="mfa-submit"]');
      const entry = b
        ? { ms: Math.round(performance.now() - t), label: (b.textContent ?? '').trim(), disabled: b.disabled, path: location.pathname }
        : { ms: Math.round(performance.now() - t), label: null, disabled: null, path: location.pathname };
      const last = w.__mfaLabels.at(-1);
      if (!last || last.label !== entry.label || last.disabled !== entry.disabled || last.path !== entry.path)
        w.__mfaLabels.push(entry);
    };
    record();
    new MutationObserver(record).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
  });
  await page.getByTestId('mfa-code').pressSequentially('123456', { delay: 25 });
  for (let i = 0; i < 220; i += 1) {
    const s = await page.evaluate(() => {
      const b = document.querySelector('[data-testid="mfa-submit"]');
      return {
        path: window.location.pathname,
        label: b ? (b.textContent ?? '').trim() : null,
        disabled: b ? b.disabled : null,
      };
    });
    const last = samples.at(-1);
    if (!last || last.label !== s.label || last.disabled !== s.disabled || last.path !== s.path)
      samples.push({ ms: Date.now() - t0, ...s });
    // The re-arm window is short; catch the frame it happens in.
    if (s.label && /^Verify$/i.test(s.label) && !s.disabled && !result.rearmShot) {
      result.rearmShot = true;
      await shot('2-rearmed');
    }
    await page.waitForTimeout(20);
  }
  result.samples = samples;
  result.observed = await page.evaluate(() => window.__mfaLabels ?? []);
  result.reArmObserved = result.observed.some(
    (o, i) => i > 0 && o.path === '/mfa' && o.label && /^Verify$/i.test(o.label) && o.disabled === false,
  );
  // Did the button ever return to an armed "Verify" AFTER the verify was sent?
  result.reArmedWhileNavigating = samples.some(
    (s, i) => i > 0 && s.path === '/mfa' && s.label && /^Verify$/i.test(s.label) && s.disabled === false,
  );
  result.landedUrl = new URL(page.url()).pathname;
  await shot('3-landed');
} else if (SCENARIO === 'retype') {
  // A CORRECT code. Auto-submit fires on the sixth digit. While that verify is
  // still in flight the user does the most ordinary thing there is: second-guesses
  // a digit and fixes it. The code completes again — and the boxes were still live.
  const hidden = page.locator('input[data-input-otp="true"]');
  await page.getByTestId('mfa-code').pressSequentially('123456', { delay: 25 });
  await page.waitForTimeout(340); // verify in flight (VERIFY_MS = 1400)
  const postsBefore = mfaPosts;

  result.inputDisabledDuringVerify = await hidden.isDisabled().catch(() => null);
  result.buttonLabelDuringVerify = await txt(page.getByTestId('mfa-submit'));
  // A label that merely changes is not motion — is anything actually spinning?
  result.spinnerDuringVerify = await page
    .getByTestId('mfa-submit')
    .evaluate((el) => !!el.querySelector('.animate-spin'))
    .catch(() => null);
  result.buttonBusyDuringVerify = await page
    .getByTestId('mfa-submit')
    .evaluate((el) => el.getAttribute('aria-busy') === 'true')
    .catch(() => null);
  await shot('1-verifying');

  await hidden.press('Backspace').catch(() => {});
  await page.waitForTimeout(80);
  await hidden.pressSequentially('6', { delay: 20 }).catch(() => {});
  await page.waitForTimeout(1000);
  result.postsForOneGesture = mfaPosts - postsBefore;

  await page.waitForTimeout(2600);
  result.landedUrl = new URL(page.url()).pathname;
  result.banner = await txt(page.getByTestId('form-error')).catch(() => '');
  await shot('2-settled');
} else if (SCENARIO === 'dblclick') {
  // Recovery mode: a plain text field, no auto-submit, so the Verify button is
  // the only trigger — the cleanest place to fire two clicks in one frame.
  await page.getByTestId('mfa-toggle-recovery').click();
  await page.getByTestId('mfa-code').fill('abcd1234');
  await page.waitForTimeout(150);
  const postsBefore = mfaPosts;
  await shot('1-armed');

  // Both clicks dispatched in ONE frame — the window `disabled` cannot close,
  // because `isSubmitting` only lands on the next React render.
  await page.getByTestId('mfa-submit').evaluate((el) => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(600);
  await shot('2-verifying');
  await page.waitForTimeout(2600);
  result.postsForDoubleClick = mfaPosts - postsBefore;
  result.landedUrl = new URL(page.url()).pathname;
  result.banner = await txt(page.getByTestId('form-error')).catch(() => '');
  await shot('3-settled');
}

result.mfaPosts = mfaPosts;
result.mfaAccepted = mfaAccepted;
result.mfaRejectedAsConsumed = mfaRejectedAsConsumed;
result.mfaBodies = mfaBodies;
fs.writeFileSync(
  path.join(OUT, `mfa1-${SCENARIO}-${LABEL}.json`),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
await browser.close();
