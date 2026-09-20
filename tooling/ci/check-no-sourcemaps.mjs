#!/usr/bin/env node
/**
 * Source-map tripwire. Run AFTER `pnpm build` (part of `pnpm build:check`).
 *
 * `dist/` is published verbatim (`netlify deploy --dir=dist`), so anything left
 * in `dist/assets/` is a public URL. A `.map` file there hands every visitor the
 * original TypeScript — component names, comments, internal route and API
 * shapes — for the whole app.
 *
 * Today nothing emits them: `build.sourcemap` is `'hidden'` in production, and
 * under Vite 8 / rolldown that generates maps for the Sentry upload plugin
 * without writing them to disk. That is a property of the bundler, not of this
 * repo — a Vite upgrade, a switch back to `sourcemap: true`, or a plugin that
 * emits its own maps would start publishing 14 MB of readable source with no
 * other signal. `filesToDeleteAfterUpload` is not that signal either: it only
 * runs when `SENTRY_AUTH_TOKEN` is present, so a deploy environment without the
 * secret would silently ship them.
 *
 * Also rejects a `sourceMappingURL` comment in shipped JS/CSS, which is how a
 * browser is TOLD to go fetch one.
 *
 * NO_SOURCEMAPS_ROOT — check a different tree (it must contain `dist/assets`).
 * For `check-no-sourcemaps.test.mjs` only.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.env.NO_SOURCEMAPS_ROOT ?? process.cwd();
const assets = join(root, 'dist/assets');

if (!existsSync(assets)) {
  console.error(
    `build:check FAILED — no ${relative(root, assets)} directory. Run \`pnpm build\` first.`,
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

const shipped = filesUnder(assets);
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
      "source. Keep `build.sourcemap` at 'hidden' in vite.config.ts and delete any map\n" +
      'the build emits before deploy — never rely on the Sentry plugin to do it (it only\n' +
      'runs when SENTRY_AUTH_TOKEN is set).',
  );
  process.exit(1);
}

console.log(
  `build:check OK — no source maps in the published bundle (${shipped.length} asset files checked).`,
);
