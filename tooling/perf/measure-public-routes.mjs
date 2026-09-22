#!/usr/bin/env node
/**
 * Per-route transfer budgets for the routes a signed-OUT visitor can reach.
 *
 * Why this exists alongside `run-size-limit.mjs`: that gate measures the entry
 * chunk plus whatever `index.html` declares as a modulepreload, which is the
 * first-paint critical path and nothing else. A route pulls the rest of what it
 * needs dynamically, so the number it reports is not what a visitor downloads.
 * Measured on the build this was written against, `/login` reported 233.67 kB
 * to that gate and actually transferred ~480 kB — roughly 247 kB of guest
 * weight that no gate could see, including a 150 kB Sentry chunk.
 *
 * Deriving that statically is not practical without a build manifest, and a
 * hand-maintained chunk list drifts. So this measures the thing directly: a
 * real browser, one route at a time, each in a FRESH context so nothing is
 * warmed by the route before it. That cold-cache-per-route detail is the whole
 * point — a visitor arriving at `/accept-invite/...` from an email has none of
 * `/login`'s chunks, and a harness that reuses one context would report that
 * route as nearly free.
 *
 * Two numbers per route, because they answer different questions:
 *   • `firstPaint` — transferred before the load event. What delays render.
 *   • `total` — everything after an idle settle. What the visit costs, including
 *     idle-deferred work like Sentry and PostHog that does not block paint but
 *     does compete for bandwidth and main thread on the same visit.
 *
 * Only PUBLIC routes are listed: they need no backend, which is what lets this
 * run anywhere the E2E suite cannot (CLAUDE.md — Playwright E2E is local-only
 * because it needs core-be on :3000).
 *
 * Usage:
 *   pnpm perf:routes            measure and assert against the budgets
 *   pnpm perf:routes --update   re-pin budgets to what was just measured
 *   pnpm perf:routes --json     machine-readable output
 *   pnpm perf:routes --authed   ALSO report signed-in routes (needs core-be)
 *
 * `--authed` is report-only and opt-in. Those routes need a running backend and
 * a seeded fixture user, which is the same reason the E2E suite is local-only —
 * so they are never asserted in CI, and a budget that cannot run everywhere is
 * a budget nobody trusts. They are measured the same way: one route at a time,
 * a fresh context each time, cold cache but a warm session (`storageState`), so
 * the number is what a returning user pays on a hard refresh of that page.
 */
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const budgetPath = path.join(root, 'tooling/perf/public-route-budgets.json');

const UPDATE = process.argv.includes('--update');
const AS_JSON = process.argv.includes('--json');
const AUTHED = process.argv.includes('--authed');
const API_ORIGIN = process.env.PERF_API_ORIGIN ?? 'http://localhost:3001';
const FIXTURE_EMAIL = process.env.PERF_FIXTURE_EMAIL ?? 'demo@example.com';
/*
 * The dev-server port, deliberately — NOT an arbitrary free one. core-be checks
 * `Origin` on the refresh path, and an origin it does not allow is rejected
 * with 403 before the session is ever restored, so the authed routes measure a
 * signed-out page. 5173 is the origin a local backend already allows.
 */
const PORT = Number(process.env.PERF_PORT ?? 5173);
const ORIGIN = `http://localhost:${PORT}`;

/** The per-email resend cooldown is 60s; wait past it rather than around it. */
const COOLDOWN_WAIT_MS = 62_000;
const SEND_CODE_ATTEMPTS = 3;

/**
 * Settle policy.
 *
 * Observability registers on an idle callback (`initObservabilityWhenIdle`), so
 * a measurement that stops at `networkidle` misses the single largest chunk on
 * the page and reports a number far better than the visit is.
 *
 * A FIXED wait does not fix that, it just moves the race: measured with a flat
 * 3s settle, `/not-found` came in at 793 kB on one run and 482 kB on the next —
 * a 40% swing on identical bytes, purely from where the idle callback landed
 * relative to the timer. A budget that varies by 40% passes things it should
 * fail.
 *
 * So: wait for the resource list to STOP GROWING for {@link QUIET_MS}, rather
 * than for a clock. Deterministic whatever the machine is doing, and the cap
 * turns a page that genuinely never settles into a loud failure instead of a
 * quietly short number.
 */
const QUIET_MS = 1_500;
const SETTLE_CAP_MS = 20_000;

function log(message) {
  if (!AS_JSON) process.stdout.write(`${message}\n`);
}

/** Content types for the handful of extensions `dist/` actually emits. */
const CONTENT_TYPES = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.woff2': 'font/woff2',
};

/**
 * Serve `dist/` and proxy `/api` to core-be from ONE origin.
 *
 * `pnpm preview` cannot do the authed half: it serves a production build whose
 * API base points at the deployed API, and the dev server's proxy is not part
 * of a preview. Pointing the build straight at `http://localhost:3001` does not
 * work either — core-be sends `Cross-Origin-Resource-Policy: same-origin`, so
 * the browser discards the response even though CORS passes.
 *
 * Same origin removes both problems, and it is also closer to how the app is
 * actually deployed (frontend and API behind one host), so the measurement is
 * not describing a topology nobody runs.
 */
function startStaticProxy(port) {
  const distDir = path.join(root, 'dist');
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, ORIGIN);

    if (url.pathname.startsWith('/api')) {
      const headers = { ...req.headers, host: new URL(API_ORIGIN).host };
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      try {
        const upstream = await fetch(`${API_ORIGIN}${url.pathname}${url.search}`, {
          method: req.method,
          headers,
          body: chunks.length ? Buffer.concat(chunks) : undefined,
          redirect: 'manual',
        });
        const headersOut = Object.fromEntries(upstream.headers);
        /*
         * `Object.fromEntries` folds repeated headers into ONE comma-joined
         * value. core-be sets two cookies on sign-in (`session_id` and
         * `csrf_token`), so folding them hands the browser a single malformed
         * cookie and it stores neither. The next `/auth/refresh` then answers
         * `401 Missing session cookie` and every "signed-in" measurement is
         * quietly a signed-OUT page — which reads as a real auth regression
         * rather than as a broken harness. Pass them through as a list.
         */
        delete headersOut['set-cookie'];
        const setCookie = upstream.headers.getSetCookie?.() ?? [];
        if (setCookie.length > 0) headersOut['set-cookie'] = setCookie;
        // Decoded by `fetch`; leaving these on describes a body we no longer have.
        delete headersOut['content-encoding'];
        delete headersOut['content-length'];
        res.writeHead(upstream.status, headersOut);
        res.end(Buffer.from(await upstream.arrayBuffer()));
      } catch (error) {
        res.writeHead(502).end(String(error));
      }
      return;
    }

    // SPA fallback: anything that is not a real file is a client route.
    const filePath = path.join(distDir, url.pathname);
    const resolved =
      existsSync(filePath) && !filePath.endsWith('/')
        ? filePath
        : path.join(distDir, 'index.html');
    res.writeHead(200, {
      'content-type': CONTENT_TYPES[path.extname(resolved)] ?? 'application/octet-stream',
      // No caching: every route must start cold, which is the whole premise.
      'cache-control': 'no-store',
    });
    res.end(readFileSync(resolved));
  });
  server.listen(port);
  return server;
}

/** Wait for the preview server to answer, or fail loudly rather than hang. */
async function waitForServer(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(ORIGIN, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`preview server did not answer on ${ORIGIN} within ${timeoutMs}ms`);
}

/**
 * Block until no new asset request has been recorded for {@link QUIET_MS}.
 *
 * @throws when the page is still pulling assets at {@link SETTLE_CAP_MS} — a
 *   route that never goes quiet has no meaningful total, and reporting the
 *   bytes-so-far as if it did is how a budget silently stops meaning anything.
 */
async function waitForResourceQuiet(page) {
  const deadline = Date.now() + SETTLE_CAP_MS;
  let lastCount = -1;
  let quietSince = Date.now();

  while (Date.now() < deadline) {
    const count = await page.evaluate(
      () =>
        performance.getEntriesByType('resource').filter((e) => e.name.includes('/assets/'))
          .length,
    );
    if (count !== lastCount) {
      lastCount = count;
      quietSince = Date.now();
    } else if (Date.now() - quietSince >= QUIET_MS) {
      return;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(
    `${page.url()} was still requesting assets after ${SETTLE_CAP_MS}ms — ` +
      'no stable total to budget against.',
  );
}

/** Gzipped size on disk, in kB — the unit `pnpm size` budgets in. */
const gzipKb = (file) =>
  gzipSync(readFileSync(path.join(root, 'dist/assets', file))).length / 1024;

/**
 * Which files a route loads, and how big they are — deliberately two different
 * measurements from two different sources.
 *
 * The browser is authoritative about the SET: nothing else knows what the
 * router pulled. It is not authoritative about the SIZE. `encodedBodySize` is
 * whatever came over the wire, so it reports compressed bytes for a response
 * the preview server gzipped and raw bytes for one it did not — measured here,
 * that mix put `vendor` at 90.5 kB (gzipped) and `sentry` at 461.9 kB (raw) in
 * the same total. Summing those is meaningless, and it flattered nothing: it
 * inflated the number by ~300 kB on one chunk alone.
 *
 * It would also be the wrong unit even if it were consistent. A local preview
 * is not the CDN — production serves brotli — so over-the-wire numbers from
 * here describe a server nobody uses.
 *
 * So the set comes from the browser and the bytes come from `dist/`, gzipped,
 * which is deterministic, immune to cache and server quirks, and the same unit
 * the existing `pnpm size` budgets already use.
 */
async function measureRoute(browser, routePath, storageState) {
  const context = await browser.newContext(storageState ? { storageState } : {});
  const page = await context.newPage();
  try {
    await page.goto(`${ORIGIN}${routePath}`, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await waitForResourceQuiet(page);

    const loaded = await page.evaluate(() => {
      const loadEnd = performance.timing
        ? performance.timing.loadEventEnd - performance.timing.navigationStart
        : Number.POSITIVE_INFINITY;
      return performance
        .getEntriesByType('resource')
        .filter((entry) => entry.name.includes('/assets/'))
        .map((entry) => ({
          file: entry.name.split('/assets/')[1] ?? entry.name,
          beforeLoad: entry.responseEnd <= loadEnd,
        }));
    });

    const rows = loaded.map((row) => ({ ...row, kb: gzipKb(row.file) }));
    const sum = (list) => list.reduce((total, row) => total + row.kb, 0);
    const js = rows.filter((row) => row.file.endsWith('.js'));
    const css = rows.filter((row) => row.file.endsWith('.css'));
    return {
      assets: rows.length,
      firstPaintJsKb: sum(js.filter((row) => row.beforeLoad)),
      totalJsKb: sum(js),
      cssKb: sum(css),
      /*
       * The five biggest files ON THE CRITICAL PATH, so a breach names its own
       * cause instead of sending the reader to a bundle analyzer.
       *
       * Scoped to `beforeLoad` deliberately: drawn from every file the route
       * ever fetches, this list is led by whatever is biggest overall — on the
       * dashboard that was `sentry.js`, which arrives ~660ms AFTER first paint
       * and is not on the critical path at all. Naming it invites cutting the
       * one chunk that costs the measured number nothing.
       */
      top: js
        .filter((row) => row.beforeLoad)
        .sort((a, b) => b.kb - a.kb)
        .slice(0, 5)
        .map((row) => ({
          file: row.file.replace(/-[A-Za-z0-9_-]{8,}\./, '.'),
          kb: +row.kb.toFixed(1),
        })),
    };
  } finally {
    await context.close();
  }
}

/**
 * Sign the fixture user in once and return a Playwright `storageState`.
 *
 * Uses the backend's own TEST_MODE debug code rather than driving the form: the
 * point of the measurement is what a signed-in page downloads, not how the
 * login screen behaves, and a UI sign-in would warm exactly the chunks each
 * route is supposed to be measured without.
 */
async function signInFixture(browser) {
  /*
   * `send-code` holds a 60s per-email cooldown in Redis. Inside that window it
   * returns a normal HTTP 200 with the usual body and simply OMITS the debug
   * code — deliberately indistinguishable from a real send, which reads as
   * "TEST_MODE is off" rather than "you re-ran within a minute". Clearing
   * `auth.verification_tokens` does not help; the cooldown is not in Postgres.
   */
  let code;
  for (let attempt = 0; attempt < SEND_CODE_ATTEMPTS && !code; attempt += 1) {
    if (attempt > 0) {
      log(`[perf:routes] send-code cooldown held; retrying in ${COOLDOWN_WAIT_MS / 1000}s`);
      await new Promise((done) => setTimeout(done, COOLDOWN_WAIT_MS));
    }
    const send = await fetch(`${API_ORIGIN}/api/v1/auth/email/send-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ email: FIXTURE_EMAIL }),
    });
    if (!send.ok) throw new Error(`send-code failed (HTTP ${send.status})`);
    code = (await send.json())?.data?.debug_verification_code;
  }
  if (!code) {
    throw new Error(
      'backend returned no debug_verification_code — --authed needs core-be in TEST_MODE ' +
        `(tried ${SEND_CODE_ATTEMPTS}x across the resend cooldown)`,
    );
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${ORIGIN}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('name@company.com').fill(FIXTURE_EMAIL);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const codeField = page.getByRole('textbox', { name: /verification code/i });
    await codeField.waitFor({ timeout: 15_000 });
    await codeField.fill(code);
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
      timeout: 20_000,
    });
    const state = await context.storageState();
    /*
     * Fail LOUD rather than measure a signed-out page dressed as a signed-in
     * one. Without the session cookie every authed route silently reports the
     * login screen's bytes plus whatever the router preloads, which looks like
     * a plausible number and is not one.
     */
    const cookieNames = state.cookies.map((cookie) => cookie.name);
    if (!cookieNames.includes('session_id')) {
      throw new Error(
        `signed in but no session_id cookie was stored (got: ${cookieNames.join(', ') || 'none'}) — ` +
          'the proxy is probably folding the two Set-Cookie headers into one',
      );
    }
    return state;
  } finally {
    await context.close();
  }
}

const round = (value) => +value.toFixed(1);

async function main() {
  const budgets = JSON.parse(readFileSync(budgetPath, 'utf8'));

  log('[perf:routes] building…');
  execFileSync('pnpm', ['build'], {
    cwd: root,
    stdio: AS_JSON ? 'ignore' : 'inherit',
    // Relative API base so requests go through the proxy above rather than to
    // whatever host the ambient env names. It is one string constant, so the
    // measured bytes are the shipped bytes.
    env: { ...process.env, VITE_API_BASE_URL: '' },
  });

  log(`[perf:routes] serving dist on ${ORIGIN}${AUTHED ? ` (api → ${API_ORIGIN})` : ''}`);
  const server = startStaticProxy(PORT);

  let browser;
  const results = {};
  const authedResults = {};
  try {
    await waitForServer();
    const { chromium } = await import('@playwright/test');
    browser = await chromium.launch();

    // Sequential on purpose. Parallel contexts share a network and a CPU, which
    // is exactly the interference this is trying to measure away.
    for (const [routePath, route] of Object.entries(budgets.routes)) {
      const measured = await measureRoute(browser, route.url ?? routePath);
      results[routePath] = measured;
      log(
        `  ${routePath.padEnd(26)} ${String(measured.assets).padStart(3)} assets  ` +
          `first-paint ${round(measured.firstPaintJsKb).toString().padStart(6)} kB  ` +
          `total ${round(measured.totalJsKb).toString().padStart(6)} kB  ` +
          `css ${round(measured.cssKb).toFixed(1).padStart(5)} kB`,
      );
    }

    if (AUTHED) {
      log('\n[perf:routes] signed-in routes (report only — needs core-be):');
      const storageState = await signInFixture(browser);
      for (const [label, route] of Object.entries(budgets.authedRoutes ?? {})) {
        const measured = await measureRoute(browser, route.url, storageState);
        authedResults[label] = measured;
        log(
          `  ${label.padEnd(32)} ${String(measured.assets).padStart(3)} assets  ` +
            `first-paint ${round(measured.firstPaintJsKb).toString().padStart(6)} kB  ` +
            `total ${round(measured.totalJsKb).toString().padStart(6)} kB`,
        );
        for (const row of measured.top.slice(0, 3)) {
          log(`        ${String(row.kb).padStart(7)} kB  ${row.file}`);
        }
      }
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }

  if (UPDATE) {
    for (const [routePath, measured] of Object.entries(results)) {
      const route = budgets.routes[routePath];
      // Proportional, not flat: a fixed allowance is two thirds of a 22 kB CSS
      // budget and a rounding error against an 800 kB one.
      const pin = (value) => round(value * (1 + budgets.headroomPercent / 100));
      route.firstPaintJsKb = pin(measured.firstPaintJsKb);
      route.totalJsKb = pin(measured.totalJsKb);
      route.cssKb = pin(measured.cssKb);
    }
    writeFileSync(budgetPath, `${JSON.stringify(budgets, null, 2)}\n`);
    log(`\n[perf:routes] budgets re-pinned in ${path.relative(root, budgetPath)}`);
    return;
  }

  const breaches = [];
  for (const [routePath, measured] of Object.entries(results)) {
    const budget = budgets.routes[routePath];
    /*
     * `firstPaintJsKb` is REPORTED but not asserted. It is drawn against the
     * load event, which moves with things that are not the bundle: with a
     * reachable backend the app does more before `load`, and a large chunk
     * lands on one side of the line or the other depending on how the run went.
     * Measured across two back-to-back runs of identical bytes, `/unauthorized`
     * came in at 228.5 kB and then 267.8 kB — a 39 kB swing, and `/mfa` and
     * `/not-found` moved ~13 kB each. `totalJsKb` moved at most 0.1 kB on
     * any route across three runs, because it is a property of the file set
     * rather than of timing.
     *
     * So: budget what is stable, report what is not. `pnpm size` already
     * guards the critical path properly, from the modulepreload set.
     */
    for (const key of ['totalJsKb', 'cssKb']) {
      const limit = budget[key];
      const actual = round(measured[key]);
      if (limit !== undefined && actual > limit) {
        breaches.push({ routePath, key, limit, actual, top: measured.top });
      }
    }
  }

  if (AS_JSON) {
    process.stdout.write(
      `${JSON.stringify({ results, authed: authedResults, breaches }, null, 2)}\n`,
    );
  }

  if (breaches.length > 0) {
    log('\n[perf:routes] ✗ budget exceeded:');
    for (const breach of breaches) {
      log(`  ${breach.routePath} ${breach.key}: ${breach.actual} kB > ${breach.limit} kB`);
      for (const row of breach.top) log(`      ${String(row.kb).padStart(7)} kB  ${row.file}`);
    }
    log('\n  Budgets are a RATCHET: lower them as routes shrink, never raise to');
    log('  absorb growth. Re-pin deliberately with `pnpm perf:routes --update`.');
    process.exit(1);
  }

  log('\n[perf:routes] ✓ every public route within budget.');
}

main().catch((error) => {
  process.stderr.write(`[perf:routes] ${error?.stack ?? error}\n`);
  process.exit(1);
});
