/**
 * validate:identity — two guards that together make the rebrand path permanent.
 *
 *  1. DRIFT — every file derived from `tooling/setup/setup.config.json` →
 *     `project.*` must already equal what that block implies. Because each
 *     surface's transform is idempotent and structurally anchored, "applying it
 *     changes nothing" IS the check (see tooling/identity/identity.mjs).
 *
 *  2. HARDCODED LITERALS — app code (`src/**` TS/TSX) and `index.html` must never
 *     embed the product or package name as a string literal. Runtime code reads
 *     it from `@/lib/product-identity.ts`; `index.html` gets `{{PRODUCT_*}}`
 *     tokens substituted by `plugins/product-identity-html.ts`. This is the half
 *     that stops an 11th hardcoded literal appearing next month — the failure the
 *     repo already hit, where setup.config.json and catalog-info.yaml disagreed
 *     about the repository slug.
 *
 * Genuine exceptions live in `tooling/validate/identity-allowlist.txt`, one path
 * per line with a reason — never a silent suppression.
 *
 * Usage: node tooling/validate/identity.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findDrift, loadIdentity } from '../identity/identity.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALLOWLIST = join(ROOT, 'tooling/validate/identity-allowlist.txt');

/** Directories scanned for hardcoded brand literals. */
const SCAN_ROOTS = ['src'];
const SCAN_EXTENSIONS = ['.ts', '.tsx'];
/** Standalone files scanned in addition to SCAN_ROOTS. */
const SCAN_FILES = ['index.html'];

const isComment = (line) => {
  const t = line.trim();
  return (
    t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--')
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

/** Recursively collect scannable files under a directory. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/** Single-line string literals: '…', "…", `…`. */
const STRING_LITERAL = /'[^\n']*'|"[^\n"]*"|`[^\n`]*`/g;

/**
 * Find brand literals embedded ANYWHERE inside a string, not just as the whole
 * string. `'Core — two-factor recovery codes'` (the header of a file users
 * download) is exactly as much a hardcoded brand as `'Core'`, and an
 * exact-match-only scan silently misses it.
 *
 * Matching is case-sensitive and whole-word, so an import path like
 * `'@/core/types.ts'` never trips the product name `Core`.
 *
 * Comment lines are skipped — prose naming the product in a docstring is
 * documentation, not a value the app renders.
 *
 * @returns {Array<{ literal: string, line: number }>}
 */
export function scanText(text, literals) {
  const found = [];
  const patterns = literals.map((literal) => ({
    literal,
    regex: new RegExp(
      `(?<![\\w-])${literal.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')}(?![\\w-])`,
    ),
  }));
  text.split('\n').forEach((line, index) => {
    if (isComment(line)) return;
    const strings = line.match(STRING_LITERAL);
    if (!strings) return;
    for (const { literal, regex } of patterns) {
      if (strings.some((value) => regex.test(value))) {
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

  // ── 2. Hardcoded brand literals ───────────────────────────────────────────
  const literals = [...new Set([identity.productName, identity.name])];
  const files = [
    ...SCAN_ROOTS.flatMap((dir) => walk(join(ROOT, dir))),
    ...SCAN_FILES.map((file) => join(ROOT, file)),
  ];

  const violations = [];
  for (const file of files) {
    const rel = relative(ROOT, file);
    if (allowlist.has(rel)) continue;
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
  App code must read the product name from '@/lib/product-identity.ts';
  index.html uses {{PRODUCT_*}} tokens. If this occurrence is genuinely not
  product branding, add the path with a reason to
  tooling/validate/identity-allowlist.txt.
`);
  }

  if (failed) {
    process.exit(1);
  }
  console.log(
    `identity: OK — ${literals.join(', ')} centralized; all derived surfaces in sync.`,
  );
}

main();
