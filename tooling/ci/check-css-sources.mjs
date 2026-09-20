#!/usr/bin/env node
/**
 * CSS-source tripwire. Run AFTER `pnpm build` (part of `pnpm build:check`).
 *
 * The production stylesheet must be generated from the APP. Left to its
 * automatic detection Tailwind reads every tracked file in the repository, so a
 * class-shaped string in `docs/`, an agent-os skill, a `tooling/` gate fixture or
 * an E2E spec is emitted and shipped: before `src/index.css` scoped the scan
 * (`@import 'tailwindcss' source('../src')`) the initial CSS carried ~2.2 kB
 * gzipped of utilities no component uses — 196 of them.
 *
 * How it notices: raw palette utilities (`bg-blue-500`, `text-red-600`) are
 * forbidden in app code by `validate:tokens`, and the docs are full of them as
 * examples of what NOT to write. So every one that reaches `dist/` must be
 * spelled somewhere in non-test `src/` (the vendored `ui/` primitives are the
 * legitimate source). One that is not came from outside the app — the scan has
 * widened again.
 *
 * CSS_SOURCES_ROOT — check a different tree (it must contain `dist/assets` and
 * `src`). For `check-css-sources.test.mjs` only.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.CSS_SOURCES_ROOT ?? process.cwd();

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PROPERTY =
  'bg|text|border|from|to|via|ring|divide|placeholder|fill|stroke|outline|decoration|accent|caret|shadow';
/** `.bg-blue-500`, `.dark\:text-amber-400`, `.hover\:bg-red-600\/90` → the bare utility. */
const RAW_PALETTE = new RegExp(
  String.raw`\.(?:[\w\\:\[\]=-]*\\:)?((?:${PROPERTY})-(?:${PALETTE})-(?:50|[1-9]00|950))(?![\w-])`,
  'g',
);

function filesUnder(dir, keep) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...filesUnder(path, keep));
    else if (keep(path)) found.push(path);
  }
  return found;
}

const assets = join(root, 'dist/assets');
const stylesheets = filesUnder(assets, (path) => path.endsWith('.css'));
if (stylesheets.length === 0) {
  console.error(
    `build:check FAILED — no stylesheet in ${assets}. Run \`pnpm build\` first.`,
  );
  process.exit(1);
}

const shipped = new Set();
for (const stylesheet of stylesheets) {
  for (const match of readFileSync(stylesheet, 'utf8').matchAll(RAW_PALETTE)) {
    shipped.add(match[1]);
  }
}

const appSource = filesUnder(
  join(root, 'src'),
  (path) => /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path),
)
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

const strays = [...shipped].filter((utility) => !appSource.includes(utility)).sort();

if (strays.length > 0) {
  console.error(
    `\nbuild:check FAILED — ${strays.length} utilit${strays.length === 1 ? 'y' : 'ies'} in the production CSS that no app file spells: ${strays.join(', ')}.`,
  );
  console.error(
    'Tailwind is generating CSS from something other than the app (docs, skills, tooling\n' +
      "fixtures, specs). Keep `@import 'tailwindcss' source('../src')` and the `@source not`\n" +
      'test exclusions at the top of src/index.css.',
  );
  process.exit(1);
}

console.log(
  `build:check OK — production CSS is generated from app source only (${shipped.size} raw-palette utilities, all spelled in src/).`,
);
