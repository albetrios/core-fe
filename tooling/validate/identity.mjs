/**
 * validate:identity — three guards that together make the rebrand path complete.
 *
 *  1. DRIFT — every file derived from `tooling/setup/setup.config.json` →
 *     `project.*` must already equal what that block implies. Because each
 *     surface's transform is idempotent and structurally anchored, "applying it
 *     changes nothing" IS the check (see tooling/identity/identity.mjs).
 *
 *  2. TRANSFORM COMPLETENESS — apply a fake rename to every surface and demand
 *     zero survivors of the old name. This catches the failure mode that
 *     per-surface transforms keep producing: a transform covering *some* of a
 *     file's brand occurrences looks like it works (drift clean, rename
 *     "succeeds") while shipping stale branding. It is how the footer copyright,
 *     the onboarding question, the offline-page title and the Netlify site names
 *     were found — 30 stale references that the first version of this validator
 *     reported as OK.
 *
 *  3. HARDCODED LITERALS — files that are NOT derived surfaces must never embed
 *     the product or package name. Runtime code reads it from
 *     `@/lib/product-identity.ts`, `index.html` uses `{{PRODUCT_*}}` tokens, and
 *     locale files use the `{{productName}}` interpolation variable. Derived
 *     surfaces are skipped automatically — they legitimately contain the name and
 *     are covered by (1) and (2) instead, so there is no manual list to keep.
 *
 * Genuine exceptions live in `tooling/validate/identity-allowlist.txt`, one path
 * per line with a reason — never a silent suppression.
 *
 * Usage: node tooling/validate/identity.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  derivedSurfaces,
  findDrift,
  findIncompleteTransforms,
  findPreviousNames,
  loadIdentity,
  renamedFiles,
  wholeWord,
} from '../identity/identity.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALLOWLIST = join(ROOT, 'tooling/validate/identity-allowlist.txt');

/** Directories walked for hardcoded brand literals, with the extensions scanned. */
const SCAN_TREES = [
  { dir: 'src', extensions: ['.ts', '.tsx'] },
  // Translated copy must carry {{productName}}, never the brand itself.
  { dir: 'src/locales', extensions: ['.json'] },
  // public/ is copied verbatim by Vite — no transform can save a literal here.
  { dir: 'public', extensions: ['.html', '.txt', '.svg', '.webmanifest'] },
];
/** Standalone files scanned in addition to SCAN_TREES. */
const SCAN_FILES = ['index.html'];

const isComment = (line) => {
  const t = line.trim();
  return (
    t.startsWith('//') ||
    t.startsWith('*') ||
    t.startsWith('/*') ||
    t.startsWith('<!--') ||
    t.startsWith('#')
  );
};

/** Read the allowlist — blank lines and `#` comments ignored. */
function loadAllowlist() {
  let text = '';
  try {
    text = readFileSync(ALLOWLIST, 'utf8');
  } catch {
    return new Set();
  }
  return new Set(
    text
      .split('\n')
      .map((line) => line.replace(/#.*$/, '').trim())
      .filter(Boolean),
  );
}

/** Recursively collect files with the given extensions. */
function walk(dir, extensions, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, extensions, out);
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Find the brand name anywhere on a non-comment line.
 *
 * Scans the WHOLE line, not just quoted strings. Two earlier narrower versions
 * both shipped leaks:
 *   - exact-match-only (`'Core'`) missed `'Core — two-factor recovery codes'`,
 *     the header of a file users download;
 *   - string-literals-only missed **JSX text**, which is not quoted at all —
 *     hiding the boot-screen wordmark (`<span>Core</span>`) and the cookie-banner
 *     copy. A clean-room rebrand of the whole repo is what surfaced those.
 *
 * Whole-line matching is safe because `wholeWord` is case-sensitive and bounded by
 * ASCII word characters: `CoreModule`, `coreConfig` and `@/core/types.ts` cannot
 * match the product name `Core`.
 *
 * Comment lines are skipped — prose naming the product in a docstring is
 * documentation, not a value the app renders.
 *
 * @returns {Array<{ literal: string, line: number }>}
 */
export function scanText(text, literals) {
  const found = [];
  text.split('\n').forEach((line, index) => {
    if (isComment(line)) return;
    for (const literal of literals) {
      if (wholeWord(literal).test(line)) {
        found.push({ literal, line: index + 1 });
      }
    }
  });
  return found;
}

function main() {
  const identity = loadIdentity(ROOT);
  const allowlist = loadAllowlist();
  let failed = false;

  // ── 1. Derived-surface drift ──────────────────────────────────────────────
  const drifted = findDrift(identity, ROOT);
  if (drifted.length > 0) {
    failed = true;
    console.error(
      `\nidentity: ${drifted.length} file(s) disagree with tooling/setup/setup.config.json:\n`,
    );
    for (const { file, label } of drifted) {
      console.error(`  ✖ ${file}  (${label})`);
    }
    console.error('\n  Fix: pnpm identity:sync\n');
  }

  // ── 2. Transform completeness ─────────────────────────────────────────────
  const incomplete = findIncompleteTransforms(identity, ROOT);
  if (incomplete.length > 0) {
    failed = true;
    console.error(
      `\nidentity: ${incomplete.length} transform(s) would leave the old name behind on rename:\n`,
    );
    for (const { file, label, stale, count } of incomplete) {
      console.error(`  ✖ ${file}  (${label}) — ${count}x "${stale}" survives`);
    }
    console.error(`
  A rebrand must leave NO trace of the previous name in a derived file. Widen that
  surface's transform in tooling/identity/identity.mjs so it covers every
  occurrence, or move the value out of the file entirely (as locale files do with
  the {{productName}} interpolation variable).
`);
  }

  // ── 3. Hardcoded brand literals outside derived surfaces ──────────────────
  const literals = [...new Set([identity.productName, identity.name])];
  // Derived surfaces legitimately contain the name — checks 1 and 2 own them.
  const derived = new Set(derivedSurfaces(identity, ROOT).map((s) => s.file));
  const files = [
    ...SCAN_TREES.flatMap(({ dir, extensions }) => walk(join(ROOT, dir), extensions)),
    ...SCAN_FILES.map((file) => join(ROOT, file)),
  ];

  const violations = [];
  for (const file of new Set(files)) {
    const rel = relative(ROOT, file);
    if (allowlist.has(rel) || derived.has(rel)) continue;
    for (const hit of scanText(readFileSync(file, 'utf8'), literals)) {
      violations.push({ file: rel, ...hit });
    }
  }

  if (violations.length > 0) {
    failed = true;
    console.error(`\nidentity: ${violations.length} hardcoded brand literal(s):\n`);
    for (const { file, literal, line } of violations) {
      console.error(`  ✖ ${file}:${line}  "${literal}"`);
    }
    console.error(`
  App code reads the product name from '@/lib/product-identity.ts'; index.html uses
  {{PRODUCT_*}} tokens; locale files use the {{productName}} variable. If this
  occurrence genuinely is not product branding, add the path with a reason to
  tooling/validate/identity-allowlist.txt.
`);
  }

  // ── 3b. Files whose NAME still embeds the identity ────────────────────────
  const pendingRenames = renamedFiles(identity, ROOT);
  if (pendingRenames.length > 0) {
    failed = true;
    console.error(`\nidentity: ${pendingRenames.length} file(s) need renaming on disk:\n`);
    for (const { from, to } of pendingRenames) {
      console.error(`  ✖ ${from}  →  ${to}`);
    }
    console.error('\n  Fix: pnpm identity:sync\n');
  }

  // ── 4. A retired name coming back ─────────────────────────────────────────
  // The permanent guard for a derived product: once renamed, the previous name
  // must never reappear — not through an upstream merge, not through a
  // copy-paste, not through a half-finished sweep.
  const resurrected = findPreviousNames(identity, ROOT);
  if (resurrected.length > 0) {
    failed = true;
    const total = resurrected.reduce((sum, hit) => sum + hit.count, 0);
    console.error(
      `\nidentity: ${total} occurrence(s) of a retired name in ${resurrected.length} file(s):\n`,
    );
    for (const { file, name, count } of resurrected.slice(0, 20)) {
      console.error(`  ✖ ${file} — ${count}x "${name}"`);
    }
    if (resurrected.length > 20) {
      console.error(`  … and ${resurrected.length - 20} more file(s)`);
    }
    console.error(`
  This repo was renamed away from that name. Replace it with the current identity
  (see tooling/setup/setup.config.json -> project). If the occurrence is real
  history that must keep the old name, exclude the file in RENAME_SKIP_FILES in
  tooling/identity/identity.mjs — as CHANGELOG.md is.
`);
  }

  if (failed) {
    process.exit(1);
  }
  console.log(
    `identity: OK — ${literals.join(', ')} centralized; ${derived.size} derived surfaces in sync, transforms complete, no stray literals.`,
  );
}

main();
