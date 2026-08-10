import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { renameableFiles } from '../../tooling/identity/identity.mjs';

/**
 * Every source file must be plain text — no raw control bytes.
 *
 * A raw control byte makes a source file **binary to text-based tooling**, and the
 * damage is silent. Three real instances existed in this repo when this guard was
 * written, all of them values that had a perfectly good escape form:
 *
 *   - `tooling/identity/identity.mjs` — a literal NUL in the protected-phrase
 *     sentinel. `file(1)` called the module `data`, and **`grep` skipped the whole
 *     file**: no match, no warning. Every grep-driven gate, code search and secret
 *     scan silently inspected an empty file.
 *   - `tests/security/redirect-safety.security.test.ts` — a literal NUL inside an
 *     open-redirect attack vector. Same effect, on a *security* suite: exactly the
 *     file an audit or secret scan most needs to be able to read.
 *   - `tooling/identity/rebrand.mjs` — raw ESC in five ANSI colour constants. This
 *     one does NOT break grep (only NUL triggers binary detection), but a raw
 *     escape is unreadable in a diff and emits terminal control sequences whenever
 *     the file is printed.
 *
 * That is the same failure shape as the rebrand defects this repo already guards:
 * a tool reporting success while inspecting nothing. A unicode escape is an exact
 * substitute — identical at runtime, legible everywhere — so there is never a
 * reason to embed the raw byte.
 *
 * Scope is {@link renameableFiles}: the repo's text-file walk, which already skips
 * `node_modules`, build output, generated artifacts and history files.
 */

const ROOT = process.cwd();

const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const SPACE = 0x20;
const DELETE = 0x7f;

/**
 * Control bytes that must never appear raw in source.
 *
 * Tab, line feed and carriage return are legitimate whitespace; every other byte
 * below space — plus DEL — is what trips binary detection in `grep` and `file(1)`.
 */
function rawControlBytes(buffer: Buffer): number[] {
  const found = new Set<number>();
  for (const byte of buffer) {
    const isAllowedWhitespace =
      byte === TAB || byte === LINE_FEED || byte === CARRIAGE_RETURN;
    if ((byte < SPACE && !isAllowedWhitespace) || byte === DELETE) found.add(byte);
  }
  return [...found].sort((a, b) => a - b);
}

describe('source files are plain text', () => {
  const files: string[] = renameableFiles(ROOT);

  it('walks a meaningful number of source files', () => {
    // Guards the guard: a broken walk would make the assertion below vacuous.
    expect(files.length).toBeGreaterThan(500);
  });

  it('contains no raw control bytes in any source file', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const bytes = rawControlBytes(readFileSync(join(ROOT, file)));
      if (bytes.length > 0) {
        const hex = bytes
          .map((byte) => `0x${byte.toString(16).padStart(2, '0')}`)
          .join(', ');
        offenders.push(`${file} — ${hex}`);
      }
    }
    // To fix: replace the raw byte with its unicode escape (for example the
    // six-character form for NUL, or the ESC form for an ANSI colour code). Same
    // value at runtime, and the file stays readable by grep, gitleaks and search.
    expect(offenders).toEqual([]);
  });
});
