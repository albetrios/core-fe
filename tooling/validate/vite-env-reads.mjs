/**
 * Fail on environment/mode SNIFFING in app code. Behavior must be env-driven
 * (named `platformConfig` flags), never sniffed from the build mode. Flags:
 *   1. `import.meta.env.VITE_*`            — route reads through the config kernel.
 *   2. `import.meta.env.DEV/PROD/MODE/SSR/BASE_URL` — allowlisted readers only.
 *   3. `platformConfig.environment === …` / `.MODE === …` / `=== 'production'` etc.
 *      — `environment` is a reported value only; never branch on it.
 *
 * Allowlisted config-kernel files may read raw env (they PRODUCE the typed config).
 * Test files are exempt (they stub env via `vi.stubEnv`, not runtime reads).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

/**
 * Paths (relative to root) allowed to read raw `import.meta.env`. build-env.ts
 * and env.config.ts PRODUCE the typed config; version/check.ts reads only the
 * Vite builtin BASE_URL (a build constant outside the schema, not a mode sniff).
 */
const ALLOWLIST = new Set([
  'src/lib/i18n/build-env.ts',
  'src/core/config/env.config.ts',
  'src/core/version/check.ts',
]);

/** @param {string} dir @param {string[]} files */
function walkTs(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walkTs(path, files);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name)) {
      files.push(path);
    }
  }
  return files;
}

const VITE_READ = /import\.meta\.env\.VITE_[A-Z0-9_]+/;
// BASE_URL is a Vite builtin (not a mode flag), but raw reads of it still
// belong in allowlisted files only — everything else goes via platformConfig.
const RAW_ENV_SNIFF = /import\.meta\.env\.(?:DEV|PROD|MODE|SSR|BASE_URL)\b/;
// Comparing the derived environment (or Vite MODE) to a named environment.
// Scoped to `.environment ===` / `.MODE ===` so unrelated string comparisons
// (a domain field that happens to equal 'production', etc.) are not flagged.
const ENV_COMPARE = /\.(?:environment|MODE)\s*===/;

/** @type {{file: string, kind: string}[]} */
const violations = [];
for (const file of walkTs(resolve(ROOT, 'src'))) {
  // POSIX separators so the ALLOWLIST matches on Windows too.
  const rel = relative(ROOT, file).split(sep).join('/');
  const content = readFileSync(file, 'utf8');
  const allowlisted = ALLOWLIST.has(rel);
  if (VITE_READ.test(content) && !allowlisted)
    violations.push({ file: rel, kind: 'VITE_* read' });
  if (RAW_ENV_SNIFF.test(content) && !allowlisted)
    violations.push({ file: rel, kind: 'DEV/PROD/MODE sniff' });
  // environment/mode comparisons are never allowed — not even in the kernel.
  if (ENV_COMPARE.test(content))
    violations.push({ file: rel, kind: 'environment=== compare' });
}

if (violations.length > 0) {
  console.error('Environment/mode sniffing outside the config kernel:');
  for (const { file, kind } of violations.sort((a, b) => a.file.localeCompare(b.file))) {
    console.error(`  ${file}  [${kind}]`);
  }
  console.error('');
  console.error(
    'Drive behavior with named platformConfig flags (env-schema.ts). Raw env reads belong',
  );
  console.error(
    'only in build-env.ts / env.config.ts; never compare platformConfig.environment.',
  );
  process.exit(1);
}

console.log('vite-env-reads: OK (no env/mode sniffing outside the config kernel)');
