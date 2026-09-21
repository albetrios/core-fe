#!/usr/bin/env node
/**
 * Delete every source map the build emitted. Runs as the last step of
 * `pnpm build`, after Vite — and therefore after the Sentry plugin's upload —
 * has finished with them.
 *
 * `build.sourcemap` is `'hidden'` so Sentry can symbolicate, and under Vite 8 /
 * rolldown that DOES write `dist/assets/*.js.map`, each with `sourcesContent`.
 * `dist/` is published verbatim (`netlify deploy --dir=dist`), so every one of
 * those is a public URL serving the app's original TypeScript.
 *
 * The only thing that removed them before was the Sentry plugin's
 * `filesToDeleteAfterUpload`, which is added ONLY when `SENTRY_AUTH_TOKEN` is
 * present — so a deploy environment without that secret shipped the lot, and
 * nothing said so. Deleting here makes it unconditional: the maps still exist
 * while Sentry uploads them, and never afterwards.
 *
 * Keep this AFTER `vite build` in the `build` script, never as a plugin hook —
 * plugin ordering against the Sentry upload is not something to leave to chance.
 * `pnpm build:check` verifies the result independently.
 *
 * STRIP_SOURCEMAPS_ROOT — operate on a different tree. For tests only.
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.env.STRIP_SOURCEMAPS_ROOT ?? process.cwd();
const outDir = join(root, 'dist');

if (!existsSync(outDir)) {
  console.error(
    `strip-sourcemaps: no ${relative(root, outDir)} directory — run the build first.`,
  );
  process.exit(1);
}

function mapsUnder(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...mapsUnder(path));
    else if (path.endsWith('.map')) found.push(path);
  }
  return found;
}

const maps = mapsUnder(outDir);
for (const path of maps) rmSync(path);

console.log(
  maps.length === 0
    ? 'strip-sourcemaps: no source maps in dist/ (nothing to remove).'
    : `strip-sourcemaps: removed ${maps.length} source map${maps.length === 1 ? '' : 's'} from dist/.`,
);
