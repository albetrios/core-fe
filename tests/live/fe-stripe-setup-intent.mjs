/**
 * Mirrors the app's REAL Stripe flow (src/shared/components/StripePaymentForm):
 *   Elements({ clientSecret }) → <PaymentElement/> → stripe.confirmSetup({ elements,
 *   redirect: 'if_required' })
 *
 * The SetupIntent is created server-side (as core-be does) and everything after that
 * happens in the browser with only the publishable key — exactly the production split.
 * Cleans up the payment method it creates.
 */
import http from 'node:http';
import { chromium } from '@playwright/test';

const SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? '';
const PUBLISHABLE_KEY = process.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '';
if (SECRET_KEY.startsWith('sk_live_') || PUBLISHABLE_KEY.startsWith('pk_live_')) {
  throw new Error('Refusing to run against LIVE Stripe keys.');
}

const PORT = 4601;
const ORIGIN = `http://localhost:${PORT}`;
const PROXY = process.env.HTTPS_PROXY ?? '';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const out = [];

async function stripeApi(path, method = 'POST', form) {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    ...(form ? { body: new URLSearchParams(form).toString() } : {}),
  });
  return { status: res.status, json: await res.json() };
}

// 1. Server-side: create the SetupIntent (core-be's job).
const created = await stripeApi('/v1/setup_intents', 'POST', {
  'payment_method_types[]': 'card',
  usage: 'off_session',
});
out.push({
  id: 'FE-ST-6',
  operation: 'POST api.stripe.com/v1/setup_intents (server-side, as core-be does)',
  request: { payment_method_types: ['card'], usage: 'off_session' },
  response: {
    status: created.status,
    id: created.json.id,
    object: created.json.object,
    intentStatus: created.json.status,
    livemode: created.json.livemode,
    hasClientSecret: Boolean(created.json.client_secret),
  },
  ok: created.status === 200 && created.json.livemode === false,
});
const clientSecret = created.json.client_secret;

const server = await new Promise((r) => {
  const s = http.createServer((_q, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><html><body><div id="pay"></div></body></html>');
  });
  s.listen(PORT, '127.0.0.1', () => r(s));
});

const browser = await chromium.launch({
  executablePath: CHROME,
  proxy: { server: PROXY, bypass: 'localhost,127.0.0.1' },
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--ssl-version-max=tls1.2'],
});
const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
await page.goto(ORIGIN);

await page.evaluate(async () => {
  const s = document.createElement('script');
  s.src = 'https://js.stripe.com/v3';
  await new Promise((r) => {
    s.onload = r;
    document.head.appendChild(s);
  });
});

// 2. Browser: mount the PaymentElement against that client secret.
const mounted = await page.evaluate(
  ({ pk, cs }) => {
    window.__stripe = window.Stripe(pk);
    window.__elements = window.__stripe.elements({ clientSecret: cs });
    window.__pe = window.__elements.create('payment');
    window.__pe.mount('#pay');
    return { mounted: true };
  },
  { pk: PUBLISHABLE_KEY, cs: clientSecret },
);
await page.waitForTimeout(6000);

const frame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();
const filled = { number: false, expiry: false, cvc: false, zip: false };
try {
  await frame.getByPlaceholder('1234 1234 1234 1234').fill('4242424242424242', { timeout: 25000 });
  filled.number = true;
  await frame.getByPlaceholder('MM / YY').fill('12 / 34');
  filled.expiry = true;
  await frame.getByPlaceholder('CVC').fill('123');
  filled.cvc = true;
  // The PaymentElement shows a postal-code field for US cards; without it
  // confirmSetup fails with validation_error / invalid_zip.
  for (const zipSel of ['12345', 'ZIP', 'Postal code']) {
    try {
      await frame.getByPlaceholder(zipSel).fill('42424', { timeout: 4000 });
      filled.zip = true;
      break;
    } catch {
      /* try the next placeholder variant */
    }
  }
} catch (e) {
  out.push({ id: 'FE-ST-7-fill', operation: 'fill PaymentElement', response: { error: String(e?.message).slice(0, 150) }, ok: false });
}
out.push({
  id: 'FE-ST-7',
  operation: 'Elements({clientSecret}) → PaymentElement mount + fill test card',
  request: { card: '4242 4242 4242 4242, 12/34, cvc 123' },
  response: { ...mounted, filled },
  ok: filled.number && filled.expiry && filled.cvc && filled.zip,
});

// 3. Browser: confirmSetup — the exact call StripePaymentForm makes.
const confirmed = await page.evaluate(async (returnUrl) => {
  const r = await window.__stripe.confirmSetup({
    elements: window.__elements,
    redirect: 'if_required',
    confirmParams: { return_url: returnUrl },
  });
  if (r.error) return { ok: false, type: r.error.type, code: r.error.code, message: r.error.message };
  return {
    ok: true,
    id: r.setupIntent.id,
    status: r.setupIntent.status,
    livemode: r.setupIntent.livemode,
    paymentMethod: r.setupIntent.payment_method,
    usage: r.setupIntent.usage,
  };
}, `${ORIGIN}/billing/return`);
out.push({
  id: 'FE-ST-8',
  operation: 'stripe.confirmSetup({elements, redirect:"if_required"}) — the app’s real call',
  request: { setupIntent: created.json.id, returnUrl: `${ORIGIN}/billing/return` },
  response: confirmed,
  ok: confirmed.ok === true && confirmed.status === 'succeeded' && confirmed.livemode === false,
});

await browser.close();
server.close();

// 4. Cleanup — detach the payment method this test created.
if (confirmed.paymentMethod) {
  const detached = await stripeApi(`/v1/payment_methods/${confirmed.paymentMethod}/detach`, 'POST');
  out.push({
    id: 'FE-ST-9',
    operation: 'Cleanup — POST /v1/payment_methods/:id/detach',
    request: { paymentMethod: confirmed.paymentMethod },
    response: { status: detached.status, id: detached.json.id, customer: detached.json.customer },
    ok: detached.status === 200,
  });
}

for (const r of out) console.log(`[${r.ok ? 'PASS' : 'FAIL'}] ${r.id} ${r.operation}`);
console.log('\n===JSON_RESULTS_START===');
console.log(JSON.stringify(out, null, 2));
console.log('===JSON_RESULTS_END===');
