import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const TRIPWIRE = join(ROOT, 'tooling/ci/check-css-sources.mjs');

/**
 * Run the tripwire against a throwaway tree: one built stylesheet, plus whatever
 * app files the case needs. A gate nobody has watched fail is a green checkmark
 * (agent-os/skills/fe-guard-authoring) — and a fixture that makes it fail cannot
 * live in the real `src/`.
 */
function run(css, files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'css-sources-'));
  try {
    const write = (relativePath, content) => {
      const file = join(root, relativePath);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
    };
    write('src/placeholder.ts', 'export {};\n');
    if (css !== null) write('dist/assets/index-abc123.css', css);
    else mkdirSync(join(root, 'dist/assets'), { recursive: true });
    for (const [relativePath, content] of Object.entries(files)) {
      write(relativePath, content);
    }

    const result = spawnSync('node', [TRIPWIRE], {
      encoding: 'utf8',
      env: { ...process.env, CSS_SOURCES_ROOT: root },
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('passes when every raw-palette utility in the build is spelled in app source', () => {
  // The vendored badge is the legitimate case: `ui/` is exempt from validate:tokens.
  const { status, output } = run(
    String.raw`.bg-emerald-100{background:#d1fae5}.dark\:text-emerald-400:is(.dark *){color:#34d399}`,
    {
      'src/shared/components/ui/badge.tsx':
        "export const success = 'bg-emerald-100 dark:text-emerald-400';\n",
    },
  );

  assert.equal(status, 0, output);
  assert.match(output, /generated from app source only/);
});

test('fails when the build carries a utility no app file spells', () => {
  // `bg-blue-500` reached the stylesheet from a doc, a skill or a gate fixture —
  // the scan has widened past `src/`.
  const { status, output } = run('.bg-blue-500{background:#3b82f6}.p-4{padding:1rem}');

  assert.equal(status, 1, output);
  assert.match(output, /no app file spells: bg-blue-500/);
  assert.match(output, /source\('\.\.\/src'\)/);
});

test('a spelling that exists only in a TEST file does not count as app source', () => {
  // `not.toHaveClass('text-red-600')` is an assertion, not a component. Tests are
  // excluded from Tailwind's scan, so they must not vouch for a utility either.
  const { status, output } = run('.text-red-600{color:#dc2626}', {
    'src/shared/components/Probe/Probe.test.tsx':
      "expect(el).not.toHaveClass('text-red-600');\n",
  });

  assert.equal(status, 1, output);
  assert.match(output, /text-red-600/);
});

test('reads through variants and opacity modifiers to the bare utility', () => {
  const { status, output } = run(
    String.raw`.hover\:bg-red-600\/90:hover{background:#dc2626e6}.sm\:dark\:border-zinc-700{border-color:#3f3f46}`,
  );

  assert.equal(status, 1, output);
  assert.match(output, /bg-red-600/);
  assert.match(output, /border-zinc-700/);
});

test('ignores semantic-token utilities — they are the app’s own vocabulary', () => {
  const { status, output } = run(
    '.bg-primary{background:var(--color-primary)}.text-success{color:var(--color-success)}.bg-chart-2{background:var(--color-chart-2)}',
  );

  assert.equal(status, 0, output);
});

test('fails closed when there is no build to check', () => {
  const { status, output } = run(null);

  assert.equal(status, 1, output);
  assert.match(output, /Run `pnpm build` first/);
});
