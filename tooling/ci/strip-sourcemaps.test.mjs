import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const STRIPPER = join(ROOT, 'tooling/ci/strip-sourcemaps.mjs');

/**
 * Run the stripper against a throwaway `dist`. `files === null` omits it.
 *
 * `survivors` is snapshotted INSIDE the try: the `finally` deletes the temp tree
 * before the caller ever sees the result, so a lazy `existsSync` closure would
 * report everything missing and quietly pass the "was it deleted?" assertions.
 */
function run(files) {
  const root = mkdtempSync(join(tmpdir(), 'strip-sourcemaps-'));
  try {
    for (const [relativePath, content] of Object.entries(files ?? {})) {
      const file = join(root, relativePath);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
    const result = spawnSync('node', [STRIPPER], {
      encoding: 'utf8',
      env: { ...process.env, STRIP_SOURCEMAPS_ROOT: root },
    });
    const survivors = new Set(
      Object.keys(files ?? {}).filter((path) => existsSync(join(root, path))),
    );
    return {
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
      survived: (relativePath) => survivors.has(relativePath),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('removes maps from dist/assets and the dist root, keeping the code', () => {
  const { status, output, survived } = run({
    'dist/assets/index-abc123.js': 'export const a = 1;\n',
    'dist/assets/index-abc123.js.map': '{"version":3}\n',
    'dist/assets/vendor-def456.js.map': '{"version":3}\n',
    'dist/sw.js': 'self.addEventListener("fetch", () => {});\n',
    'dist/sw.js.map': '{"version":3}\n',
  });
  assert.equal(status, 0, output);
  assert.match(output, /removed 3 source maps/);
  assert.equal(survived('dist/assets/index-abc123.js.map'), false);
  assert.equal(survived('dist/assets/vendor-def456.js.map'), false);
  assert.equal(survived('dist/sw.js.map'), false);
  // The shipped code itself is untouched.
  assert.equal(survived('dist/assets/index-abc123.js'), true);
  assert.equal(survived('dist/sw.js'), true);
});

test('is a no-op when the build emitted none', () => {
  const { status, output } = run({
    'dist/assets/index-abc123.js': 'export const a = 1;\n',
  });
  assert.equal(status, 0, output);
  assert.match(output, /nothing to remove/);
});

test('fails when the build has not run', () => {
  const { status, output } = run(null);
  assert.equal(status, 1, output);
  assert.match(output, /run the build first/);
});
