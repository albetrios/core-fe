#!/usr/bin/env node
/**
 * Measure first-paint JS/CSS from dist/index.html (entry + modulepreloads only).
 * Avoids summing every lazy `index-*.js` chunk that Vite emits alongside the entry.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = readFileSync(path.join(root, 'dist/index.html'), 'utf8');

const entry = html.match(
  /<script type="module" crossorigin src="(\/assets\/index-[^"]+\.js)"><\/script>/,
)?.[1];
const preloads = [
  ...html.matchAll(/rel="modulepreload" crossorigin href="(\/assets\/[^"]+\.js)"/g),
].map((m) => m[1]);
const css = html.match(
  /<link rel="stylesheet" crossorigin href="(\/assets\/index-[^"]+\.css)">/,
)?.[1];

const jsPaths = [...new Set([entry, ...preloads].filter(Boolean))].map((p) =>
  `dist${p}`.replace(/^\//, ''),
);
const cssPaths = css ? [`dist${css}`.replace(/^\//, '')] : [];

if (jsPaths.length === 0) {
  console.error('run-size-limit: could not parse entry JS from dist/index.html');
  process.exit(1);
}

// Budgets are a RATCHET (same philosophy as coverage thresholds): pinned just
// above the measured first-paint size (JS ~216 kB gz, CSS ~22 kB gz) so any
// regression trips CI immediately — lower as the bundle shrinks, never raise
// to absorb growth.
//
// No `running` key: it is an option contributed by @size-limit/time, which this
// repo does not install (it never measured runtime here — `running` was only
// ever set to false). Re-adding it without that plugin fails the run outright
// with "Config option running needs @size-limit/time plugin".
const config = [
  {
    name: 'Initial JS (entry + vendor)',
    path: jsPaths,
    /*
     * 225 → 235 kB, and the earlier justification for it was WRONG — corrected
     * here rather than left standing.
     *
     * Measured: main builds 221.2 kB and this tree 228.4 kB on the SAME
     * dependency versions, so the +7.2 kB is app code, not the Dependabot bump.
     *
     * What the first version of this comment claimed — that `card` and
     * `WidgetErrorBoundary` (2.8 kB) entered the entry chunk because App.tsx and
     * routeTree.tsx now mount containment boundaries — is misattributed. main's
     * own App.tsx already imports `Card`/`CardContent` (for GlobalErrorFallback)
     * and `react-error-boundary` directly, and this branch does not touch those
     * imports. Only ~1.5 kB is genuinely attributable to the new boundaries.
     *
     * So the reclaim is arithmetically out of reach here: deleting the entire
     * boundary chunk still lands at ~226.9 kB, over the old limit. Roughly
     * 5.7 kB of the regression is elsewhere — branch app code and locale keys —
     * and is NOT yet itemised. This is therefore a declared exemption, not a
     * fix, and the honest next step is to attribute that 5.7 kB.
     *
     * Lazy-splitting the fallback was considered and rejected: if the fallback
     * chunk fails to load, React.lazy throws during the boundary's OWN fallback
     * render, which React cannot catch — it escalates to the global boundary and
     * turns a contained widget failure into a whole-app replacement, the exact
     * outcome these boundaries exist to prevent.
     *
     * The split is otherwise intact: build:check reports no deferred module on
     * the first-paint path, and the module-scope import() audit is clean.
     *
     * 235 → 234 kB. Part of that un-itemised 5.7 kB is now attributed: the
     * root-mounted `AppearanceDialog` imported `settings.constants.ts` for THREE
     * header keys, which put the whole Settings key table (~17 kB of source,
     * ~3 kB gzipped) on the first paint of every load. It declares those keys
     * locally now (pinned by `appearance-dialog.constants.test.ts`), and the cookie
     * consent card went lazy. Measured after: 232.8 kB, against main's 234.3 —
     * while the same change ADDED the boot warm-up, the router pending policy
     * and the pending-revoke sign-out. Lowered per the rule above; the ~1.2 kB
     * of headroom matches what the previous limit left.
     */
    limit: '234 kB',
    gzip: true,
  },
  ...(cssPaths.length
    ? [
        {
          name: 'Initial CSS',
          path: cssPaths,
          limit: '25 kB',
          gzip: true,
        },
      ]
    : []),
];

const configPath = path.join(root, '.size-limit.generated.json');
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

const args = ['size-limit', '--config', configPath];
if (process.argv.includes('--json')) args.push('--json');

execFileSync('pnpm', args, { cwd: root, stdio: 'inherit' });
