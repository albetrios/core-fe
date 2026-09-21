import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const TRIPWIRE = join(ROOT, 'tooling/ci/check-no-sourcemaps.mjs');

/** Split so this file's own text never trips the guard it is testing. */
const MAPPING_COMMENT = `//# source${'MappingURL'}=/assets/index-abc123.js.map`;

/**
 * Run the tripwire against a throwaway `dist/assets`. A gate nobody has watched
 * fail is a green checkmark (agent-os/skills/guard-authoring), and a fixture
 * that makes it fail cannot live in the real `dist/`.
 *
 * `files === null` omits `dist/assets` entirely (the "did you build?" case).
 */
function run(files) {
  const root = mkdtempSync(join(tmpdir(), 'no-sourcemaps-'));
  try {
    if (files !== null) {
      mkdirSync(join(root, 'dist/assets'), { recursive: true });
      for (const [relativePath, content] of Object.entries(files)) {
        const file = join(root, relativePath);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, content);
      }
    }
    const result = spawnSync('node', [TRIPWIRE], {
      encoding: 'utf8',
      env: { ...process.env, NO_SOURCEMAPS_ROOT: root },
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('passes on a bundle with no source-map artifacts', () => {
  const { status, output } = run({
    'dist/assets/index-abc123.js': 'export const a = 1;\n',
    'dist/assets/index-abc123.css': '.a{color:red}\n',
  });
  assert.equal(status, 0, output);
  assert.match(output, /build:check OK/);
});

test('fails on a published .map file', () => {
  const { status, output } = run({
    'dist/assets/index-abc123.js': 'export const a = 1;\n',
    'dist/assets/index-abc123.js.map': '{"version":3}\n',
  });
  assert.equal(status, 1, output);
  assert.match(output, /build:check FAILED/);
  assert.match(output, /index-abc123\.js\.map/);
});

test('fails on a .map outside dist/assets (the service worker)', () => {
  // The regression this guard was widened for: the SW's own Vite pass writes
  // dist/sw.js.map at the output ROOT, which an assets-only scan walks past.
  const { status, output } = run({
    'dist/assets/index-abc123.js': 'export const a = 1;\n',
    'dist/sw.js': 'self.addEventListener("fetch", () => {});\n',
    'dist/sw.js.map': '{"version":3,"sourcesContent":["export {}"]}\n',
  });
  assert.equal(status, 1, output);
  assert.match(output, /build:check FAILED/);
  assert.match(output, /dist\/sw\.js\.map/);
});

test('fails on a sourceMappingURL comment in shipped JS', () => {
  const { status, output } = run({
    'dist/assets/index-abc123.js': `export const a = 1;\n${MAPPING_COMMENT}\n`,
  });
  assert.equal(status, 1, output);
  assert.match(output, /build:check FAILED/);
  assert.match(output, /index-abc123\.js/);
});

test('fails when the build has not run', () => {
  const { status, output } = run(null);
  assert.equal(status, 1, output);
  assert.match(output, /Run `pnpm build` first/);
});
