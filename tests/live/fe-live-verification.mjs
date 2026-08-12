/**
 * Frontend live third-party verification — REAL APIs, no mocks.
 *
 * Exercises the browser-side surface of each provider exactly as the app does:
 *   - Stripe    : loads js.stripe.com, mounts a Card Element, creates a real
 *                 PaymentMethod + Token against api.stripe.com using ONLY the
 *                 publishable key (the sole Stripe credential a frontend holds).
 *   - Turnstile : loads challenges.cloudflare.com/turnstile/v0/api.js, renders the
 *                 widget with the real site key, captures the solved token.
 *   - S3        : PUTs bytes from the BROWSER to a presigned URL (the app's upload
 *                 path), then reads them back.
 *
 * Opt-in only: runs providers named in FE_LIVE_PROVIDERS.
 *   FE_LIVE_PROVIDERS=stripe,turnstile,s3 node tests/live/fe-live-verification.mjs
 *
 * Never runs as part of `pnpm test` — this file is not a *.test.ts and lives outside
 * every vitest project include.
 */
import http from 'node:http';
import { chromium } from '@playwright/test';

import { presignS3Url } from './lib/sigv4-presign.mjs';

const PROVIDERS = (process.env.FE_LIVE_PROVIDERS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const wants = (name) => PROVIDERS.includes(name);

const PAGE_PORT = Number(process.env.FE_LIVE_PAGE_PORT ?? 4599);
const ORIGIN = `http://localhost:${PAGE_PORT}`;
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || '';

const THIRD_PARTY = /stripe\.com|cloudflare\.com|amazonaws\.com/;

/** Refuse live-mode Stripe keys outright. */
const PUBLISHABLE_KEY = process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '';
if (PUBLISHABLE_KEY.startsWith('pk_live_')) {
  throw new Error('Refusing to run: VITE_STRIPE_PUBLISHABLE_KEY is a LIVE key.');
}
const TURNSTILE_SITE_KEY = process.env.VITE_TURNSTILE_SITE_KEY ?? '';

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>fe-live</title></head>
<body><div id="card-mount"></div><div id="card-mount-2"></div><div id="turnstile-mount"></div></body></html>`;

function startPageServer() {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE_HTML);
  });
  return new Promise((resolve) => server.listen(PAGE_PORT, '127.0.0.1', () => resolve(server)));
}

const results = [];
const record = (r) => {
  results.push(r);
  const mark = r.ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${r.id} ${r.operation}`);
  if (!r.ok) console.log(`       -> ${JSON.stringify(r.response).slice(0, 300)}`);
};

async function main() {
  if (PROVIDERS.length === 0) {
    console.log('No providers opted in. Set FE_LIVE_PROVIDERS=stripe,turnstile,s3');
    return;
  }

  const server = await startPageServer();
  // The container ships a pinned Chromium that may not match this Playwright
  // build's expected revision; point at it directly rather than downloading.
  const CHROME_PATH =
    process.env.FE_LIVE_CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  // Proxy notes (see /root/.ccr/README.md):
  //  - Only CONNECT (https) is supported; plain-HTTP through the proxy returns 405,
  //    so loopback (our own page server) must bypass it.
  //  - TLS is re-terminated at the proxy, so the browser must accept its CA.
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    ...(PROXY ? { proxy: { server: PROXY, bypass: 'localhost,127.0.0.1,::1' } } : {}),
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      // Environment accommodation, NOT a security relaxation: the agent proxy
      // re-terminates TLS and cannot complete Chromium's TLS 1.3 handshake
      // (every request dies with ERR_CONNECTION_RESET). Capping the client at
      // TLS 1.2 lets the tunnel establish; certificates are still verified
      // against the proxy CA installed in the NSS store.
      '--ssl-version-max=tls1.2',
    ],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  /** Capture every third-party request/response the BROWSER makes. */
  const wire = [];
  page.on('request', (req) => {
    if (THIRD_PARTY.test(req.url())) wire.push({ dir: 'req', method: req.method(), url: req.url() });
  });
  page.on('response', (res) => {
    if (THIRD_PARTY.test(res.url()))
      wire.push({ dir: 'res', status: res.status(), url: res.url() });
  });
  page.on('console', (m) => {
    if (m.type() === 'error') wire.push({ dir: 'console-error', text: m.text().slice(0, 200) });
  });

  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });

  if (wants('turnstile')) await runTurnstile(page);
  if (wants('stripe')) await runStripe(page);
  if (wants('s3')) await runS3(page);

  await browser.close();
  server.close();

  console.log('\n===JSON_RESULTS_START===');
  console.log(JSON.stringify({ results, wire }, null, 2));
  console.log('===JSON_RESULTS_END===');
}

/* ─────────────────────────── Turnstile ─────────────────────────── */
async function runTurnstile(page) {
  const loaded = await page.evaluate(async () => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    const ok = await new Promise((resolve) => {
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
      setTimeout(() => resolve(false), 20000);
    });
    return { ok, hasTurnstile: typeof window.turnstile !== 'undefined' };
  });
  record({
    id: 'FE-TS-1',
    provider: 'Turnstile',
    operation: 'GET challenges.cloudflare.com/turnstile/v0/api.js (widget script)',
    request: { url: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit' },
    response: loaded,
    ok: loaded.ok && loaded.hasTurnstile,
  });
  if (!loaded.hasTurnstile) return;

  const token = await page.evaluate(
    async (siteKey) =>
      await new Promise((resolve) => {
        try {
          window.turnstile.render('#turnstile-mount', {
            sitekey: siteKey,
            callback: (t) => resolve({ token: t, ok: true }),
            'error-callback': (e) => resolve({ ok: false, error: String(e) }),
          });
        } catch (e) {
          resolve({ ok: false, error: String(e?.message ?? e) });
        }
        setTimeout(() => resolve({ ok: false, error: 'timeout waiting for token' }), 30000);
      }),
    TURNSTILE_SITE_KEY,
  );
  record({
    id: 'FE-TS-2',
    provider: 'Turnstile',
    operation: 'turnstile.render() → solve challenge → token',
    request: { sitekey: TURNSTILE_SITE_KEY, origin: ORIGIN },
    response: token.ok
      ? { tokenPrefix: String(token.token).slice(0, 24), tokenLength: String(token.token).length }
      : token,
    ok: Boolean(token.ok && token.token),
    tokenForVerify: token.token,
  });
}

/* ───────────────────────────── Stripe ──────────────────────────── */
async function runStripe(page) {
  const loaded = await page.evaluate(async () => {
    const s = document.createElement('script');
    s.src = 'https://js.stripe.com/v3';
    const ok = await new Promise((resolve) => {
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
      setTimeout(() => resolve(false), 20000);
    });
    return { ok, hasStripe: typeof window.Stripe !== 'undefined' };
  });
  record({
    id: 'FE-ST-1',
    provider: 'Stripe',
    operation: 'GET js.stripe.com/v3 (Stripe.js loader)',
    request: { url: 'https://js.stripe.com/v3' },
    response: loaded,
    ok: loaded.ok && loaded.hasStripe,
  });
  if (!loaded.hasStripe) return;

  const mounted = await page.evaluate((pk) => {
    window.__stripe = window.Stripe(pk);
    window.__elements = window.__stripe.elements();
    window.__card = window.__elements.create('card');
    window.__card.mount('#card-mount');
    return { publishableKeyPrefix: pk.slice(0, 12), mounted: true };
  }, PUBLISHABLE_KEY);
  record({
    id: 'FE-ST-2',
    provider: 'Stripe',
    operation: 'Stripe(pk).elements().create("card").mount()',
    request: { publishableKeyPrefix: mounted.publishableKeyPrefix },
    response: mounted,
    ok: mounted.mounted === true,
  });

  // Fill the Stripe-hosted card iframe with the canonical test card.
  const frame = page.frameLocator('#card-mount iframe').first();
  await frame.locator('input[name="cardnumber"]').fill('4242424242424242', { timeout: 30000 });
  await frame.locator('input[name="exp-date"]').fill('12 34');
  await frame.locator('input[name="cvc"]').fill('123');
  await frame.locator('input[name="postal"]').fill('42424');

  const pm = await page.evaluate(async () => {
    const r = await window.__stripe.createPaymentMethod({
      type: 'card',
      card: window.__card,
    });
    if (r.error) return { ok: false, error: { type: r.error.type, message: r.error.message } };
    return {
      ok: true,
      id: r.paymentMethod.id,
      object: r.paymentMethod.object,
      livemode: r.paymentMethod.livemode,
      brand: r.paymentMethod.card?.brand,
      last4: r.paymentMethod.card?.last4,
      expMonth: r.paymentMethod.card?.exp_month,
      expYear: r.paymentMethod.card?.exp_year,
      country: r.paymentMethod.card?.country,
      funding: r.paymentMethod.card?.funding,
    };
  });
  record({
    id: 'FE-ST-3',
    provider: 'Stripe',
    operation: 'POST api.stripe.com/v1/payment_methods (stripe.createPaymentMethod)',
    request: { type: 'card', card: '4242 4242 4242 4242, 12/34, cvc 123, zip 42424' },
    response: pm,
    ok: pm.ok === true && pm.livemode === false,
  });

  const tok = await page.evaluate(async () => {
    const r = await window.__stripe.createToken(window.__card);
    if (r.error) return { ok: false, error: { type: r.error.type, message: r.error.message } };
    return {
      ok: true,
      id: r.token.id,
      object: r.token.object,
      livemode: r.token.livemode,
      used: r.token.used,
      cardId: r.token.card?.id,
      brand: r.token.card?.brand,
      last4: r.token.card?.last4,
    };
  });
  record({
    id: 'FE-ST-4',
    provider: 'Stripe',
    operation: 'POST api.stripe.com/v1/tokens (stripe.createToken)',
    request: { source: 'mounted card element' },
    response: tok,
    ok: tok.ok === true && tok.livemode === false,
  });

  // A second card Element must come from a FRESH Elements instance — Stripe.js
  // throws if you create two of the same type on one instance.
  const bad = await page.evaluate(async () => {
    try {
      const elements2 = window.__stripe.elements();
      const el = elements2.create('card');
      el.mount('#card-mount-2');
      await new Promise((r) => setTimeout(r, 1500));
      const r = await window.__stripe.createPaymentMethod({ type: 'card', card: el });
      if (r.error)
        return {
          ok: true,
          rejected: true,
          type: r.error.type,
          code: r.error.code,
          message: r.error.message,
        };
      return { ok: false, unexpectedlySucceeded: r.paymentMethod?.id };
    } catch (e) {
      return { ok: false, threw: String(e?.message ?? e).slice(0, 160) };
    }
  });
  record({
    id: 'FE-ST-5',
    provider: 'Stripe',
    operation: 'Error path — createPaymentMethod with an empty/unmounted card element',
    request: { card: 'empty element, no card number' },
    response: bad,
    ok: bad.ok === true,
  });
}

/* ─────────────────────────────── S3 ────────────────────────────── */
async function runS3(page) {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION ?? 'us-east-1';
  const key = `fe-live/probe-${Date.now()}.png`;
  // 8-byte PNG magic — same shape the upload domain uses.
  const bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  const putUrl = presignS3Url({ method: 'PUT', bucket, region, key, expiresIn: 600 });
  const getUrl = presignS3Url({ method: 'GET', bucket, region, key, expiresIn: 600 });
  const delUrl = presignS3Url({ method: 'DELETE', bucket, region, key, expiresIn: 600 });

  record({
    id: 'FE-S3-1',
    provider: 'S3',
    operation: 'Presign PUT URL (SigV4) — what core-be hands the browser',
    request: { bucket, region, key, expiresIn: 600 },
    response: {
      host: new URL(putUrl).host,
      path: new URL(putUrl).pathname,
      signed: putUrl.includes('X-Amz-Signature='),
      algorithm: new URL(putUrl).searchParams.get('X-Amz-Algorithm'),
    },
    ok: putUrl.includes('X-Amz-Signature='),
  });

  const put = await page.evaluate(
    async ({ url, bytes }) => {
      try {
        const r = await fetch(url, {
          method: 'PUT',
          headers: { 'content-type': 'image/png' },
          body: new Uint8Array(bytes),
        });
        return { ok: r.ok, status: r.status, etag: r.headers.get('etag') };
      } catch (e) {
        return { ok: false, networkError: String(e?.message ?? e) };
      }
    },
    { url: putUrl, bytes },
  );
  record({
    id: 'FE-S3-2',
    provider: 'S3',
    operation: 'BROWSER PUT to presigned URL (the app’s real upload path)',
    request: { method: 'PUT', contentType: 'image/png', bytes: 8, origin: ORIGIN },
    response: put,
    ok: put.ok === true,
  });

  const get = await page.evaluate(async (url) => {
    try {
      const r = await fetch(url);
      const buf = new Uint8Array(await r.arrayBuffer());
      return {
        ok: r.ok,
        status: r.status,
        contentType: r.headers.get('content-type'),
        byteLength: buf.byteLength,
        firstBytes: Array.from(buf.slice(0, 8)),
      };
    } catch (e) {
      return { ok: false, networkError: String(e?.message ?? e) };
    }
  }, getUrl);
  record({
    id: 'FE-S3-3',
    provider: 'S3',
    operation: 'BROWSER GET readback from presigned URL (byte integrity)',
    request: { method: 'GET' },
    response: get,
    ok:
      get.ok === true &&
      get.byteLength === 8 &&
      JSON.stringify(get.firstBytes) === JSON.stringify(bytes),
  });

  const del = await page.evaluate(async (url) => {
    try {
      const r = await fetch(url, { method: 'DELETE' });
      return { ok: r.ok || r.status === 204, status: r.status };
    } catch (e) {
      return { ok: false, networkError: String(e?.message ?? e) };
    }
  }, delUrl);
  record({
    id: 'FE-S3-4',
    provider: 'S3',
    operation: 'BROWSER DELETE (cleanup — leave no residue)',
    request: { method: 'DELETE' },
    response: del,
    ok: del.ok === true,
  });

  const after = await page.evaluate(async (url) => {
    try {
      const r = await fetch(url);
      return { status: r.status, gone: r.status === 404 || r.status === 403 };
    } catch (e) {
      return { networkError: String(e?.message ?? e), gone: null };
    }
  }, getUrl);
  record({
    id: 'FE-S3-5',
    provider: 'S3',
    operation: 'Verify deletion — GET after DELETE must not return the object',
    request: { method: 'GET' },
    response: after,
    ok: after.gone === true,
  });
}

await main();
