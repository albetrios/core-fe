#!/usr/bin/env node
/**
 * Source-map tripwire. Run AFTER `pnpm build` (part of `pnpm build:check`).
 *
 * `dist/` is published verbatim (`netlify deploy --dir=dist`), so anything left
 * in `dist/assets/` is a public URL. A `.map` file there hands every visitor the
 * original TypeScript — component names, comments, internal route and API
 * shapes — for the whole app.
 *
 * The build DOES emit them — `build.sourcemap` is `'hidden'` in production so
 * Sentry can symbolicate, and under Vite 8 / rolldown that writes one `.map` per
 * chunk (145 of them, measured) with `sourcesContent` populated. They are removed
 * by the `strip-sourcemaps` step at the end of `pnpm build`; this guard is the
 * independent check that the removal actually happened.
 *
 * Do not assume the Sentry plugin covers it. `filesToDeleteAfterUpload` is added
 * ONLY when `SENTRY_AUTH_TOKEN` is present, and it is scoped to `dist/assets`, so
 * before the strip step a deploy without that secret published every map and a
 * deploy with it still published `dist/sw.js.map`.
 *
 * Scans the WHOLE of `dist`, not just `dist/assets`: the service worker is built
 * in its own Vite pass that writes `dist/sw.js.map` at the output root, which an
 * assets-only scan (and the Sentry plugin's `filesToDeleteAfterUpload`, scoped the
 * same way) both walk straight past.
 *
 * Also rejects a `sourceMappingURL` comment in shipped JS/CSS, which is how a
 * browser is TOLD to go fetch one.
 *
 * NO_SOURCEMAPS_ROOT — check a different tree (it must contain `dist`).
 * For `check-no-sourcemaps.test.mjs` only.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.env.NO_SOURCEMAPS_ROOT ?? process.cwd();
const outDir = join(root, 'dist');

if (!existsSync(join(outDir, 'assets'))) {
  console.error(
    `build:check FAILED — no ${relative(root, join(outDir, 'assets'))} directory. Run \`pnpm build\` first.`,
  );
  process.exit(1);
}

function filesUnder(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...filesUnder(path));
    else found.push(path);
  }
  return found;
}

const shipped = filesUnder(outDir);
const mapFiles = shipped.filter((path) => path.endsWith('.map'));

// `//# sourceMappingURL=` / `/*# sourceMappingURL= */`, split so this file's own
// text can never be mistaken for the thing it is looking for.
const SOURCE_MAPPING_URL = `source${'MappingURL'}=`;
const referencing = shipped
  .filter((path) => /\.(js|css)$/.test(path))
  .filter((path) => readFileSync(path, 'utf8').includes(SOURCE_MAPPING_URL));

const offenders = [...new Set([...mapFiles, ...referencing])]
  .map((path) => relative(root, path))
  .sort();

if (offenders.length > 0) {
  console.error(
    `\nbuild:check FAILED — ${offenders.length} source-map artifact${offenders.length === 1 ? '' : 's'} would be published:`,
  );
  for (const path of offenders) console.error(`  ${path}`);
  console.error(
    "\ndist/ is served as-is, so these are public URLs handing out the app's original\n" +
      'source. `pnpm build` ends with `node tooling/ci/strip-sourcemaps.mjs`, which\n' +
      'deletes them after the Sentry plugin has uploaded what it needs — check that the\n' +
      'step still runs. Never rely on the Sentry plugin alone: it is added only when\n' +
      'SENTRY_AUTH_TOKEN is set, and it only cleans dist/assets.',
  );
  process.exit(1);
}

console.log(
  `build:check OK — no source maps in the published bundle (${shipped.length} files under dist/ checked).`,
);
