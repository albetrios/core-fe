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
 */
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const budgetPath = path.join(root, 'tooling/perf/public-route-budgets.json');

const UPDATE = process.argv.includes('--update');
const AS_JSON = process.argv.includes('--json');
const PORT = 4183;
const ORIGIN = `http://localhost:${PORT}`;

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
async function measureRoute(browser, routePath) {
  const context = await browser.newContext();
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
      // The five biggest files, so a breach names its own cause instead of
      // sending the reader to a bundle analyzer.
      top: [...js]
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

const round = (value) => +value.toFixed(1);

async function main() {
  const budgets = JSON.parse(readFileSync(budgetPath, 'utf8'));

  log('[perf:routes] building…');
  execFileSync('pnpm', ['build'], { cwd: root, stdio: AS_JSON ? 'ignore' : 'inherit' });

  log(`[perf:routes] serving dist on ${ORIGIN}`);
  const server = spawn(
    'pnpm',
    ['preview', '--port', String(PORT), '--strictPort'],
    { cwd: root, stdio: 'ignore', detached: true },
  );

  let browser;
  const results = {};
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
  } finally {
    if (browser) await browser.close();
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      // already gone
    }
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
    for (const key of ['firstPaintJsKb', 'totalJsKb', 'cssKb']) {
      const limit = budget[key];
      const actual = round(measured[key]);
      if (limit !== undefined && actual > limit) {
        breaches.push({ routePath, key, limit, actual, top: measured.top });
      }
    }
  }

  if (AS_JSON) {
    process.stdout.write(`${JSON.stringify({ results, breaches }, null, 2)}\n`);
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
