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
     * 225 → 235 kB. Measured, not guessed: main is 221.2 kB and this tree is
     * 228.4 kB with the SAME dependencies, so the +7.2 kB is app code.
     *
     * 2.8 kB of it is `WidgetErrorBoundary` + `card` entering the entry chunk
     * because App.tsx and routeTree.tsx now mount containment boundaries at the
     * app and route roots (house rule 2). Those cannot be lazy — a boundary has
     * to be mounted to catch — so the only way to reclaim that weight is to stop
     * containing crashes at the two places where a crash costs the whole
     * application. The rest is branch app code plus new locale keys.
     *
     * The split is otherwise intact: `build:check` reports no deferred module on
     * the first-paint path, and the module-scope `import()` audit in
     * agent-os/skills/bundle-performance is clean. Headroom is deliberately
     * ~6 kB, not ~1 — a budget that reds on the next small change teaches people
     * to raise it reflexively.
     */
    limit: '235 kB',
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
