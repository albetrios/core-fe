import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { stripAmbientViteEnv } from '../../plugins/test-env.ts';

const ROOT = process.cwd();

/**
 * Hermetic-env guard. The default environment is `local`, whose env file is
 * `.env.local` — and Vite loads `.env.local` in EVERY mode, including the Vitest
 * runner. If that were allowed, a developer's local `.env.local` would leak
 * into the suite and it would stop being reproducible across machines and CI.
 * `vitest.config.ts` prevents it by pointing `envDir` at an empty directory, so
 * the test runner loads no `.env` files at all. These checks keep that wiring
 * from silently regressing (which would only surface as flaky, machine-dependent
 * tests once someone actually had a `.env.local`).
 *
 * A `.env` file is only HALF the leak, though. Vite's `loadEnv` also copies
 * every `VITE_`-prefixed key straight out of `process.env`, a path `envDir` does
 * not touch — so an exported shell variable bypasses the empty-dir guard
 * entirely. `plugins/test-env.ts` closes it by stripping those keys before Vite
 * resolves env; the third check pins that stripper's contract.
 */
describe('test env hermeticity', () => {
  it('vitest.config.ts points envDir at the empty env dir', () => {
    const config = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8');
    expect(config).toMatch(
      /envDir:\s*path\.resolve\(__dirname,\s*['"]tooling\/test\/empty-env['"]\)/,
    );
  });

  it('the empty env dir exists and holds no .env files', () => {
    const dir = join(ROOT, 'tooling/test/empty-env');
    expect(existsSync(dir)).toBe(true);
    const envFiles = readdirSync(dir).filter((name) => name.startsWith('.env'));
    expect(envFiles).toEqual([]);
  });

  it('strips ambient VITE_* keys and leaves everything else alone', () => {
    const env = {
      VITE_API_BASE_URL: 'https://leaked.example.com',
      VITE_TEAM_ORGANIZATIONS: 'true',
      PATH: '/usr/bin',
      NODE_ENV: 'development',
      // Not a VITE_ key: the i18n build vars reach the runner via `test.env`.
      BUILD_I18N_MODE: 'single',
      // A prefix match must be exact — this is not a Vite client variable.
      MY_VITE_THING: 'keep me',
    };

    const stripped = stripAmbientViteEnv(env);

    expect(stripped.sort()).toEqual(['VITE_API_BASE_URL', 'VITE_TEAM_ORGANIZATIONS']);
    expect(env).toEqual({
      PATH: '/usr/bin',
      NODE_ENV: 'development',
      BUILD_I18N_MODE: 'single',
      MY_VITE_THING: 'keep me',
    });
  });

  it('is a no-op on an env with nothing to strip', () => {
    const env = { PATH: '/usr/bin' };
    expect(stripAmbientViteEnv(env)).toEqual([]);
    expect(env).toEqual({ PATH: '/usr/bin' });
  });

  it('the test-env plugin runs the stripper before Vite resolves env', () => {
    // `config()` is the last hook that runs BEFORE `loadEnv`, so the stripping
    // has to live there — a later hook would be too late to matter.
    const plugin = readFileSync(join(ROOT, 'plugins/test-env.ts'), 'utf8');
    const configHook = plugin.slice(plugin.indexOf('config()'));
    expect(configHook).toMatch(/stripAmbientViteEnv\(\)/);
  });
});
