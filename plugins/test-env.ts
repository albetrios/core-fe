import type { Plugin, UserConfig } from 'vite';

/**
 * Removes ambient `VITE_*` keys from `env`, returning the names removed.
 *
 * Exported for {@link ../tests/ci/env-hermetic.policy.test.ts}; call it with a
 * plain object to exercise it without touching the live process.
 */
export function stripAmbientViteEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const stripped = Object.keys(env).filter((key) => key.startsWith('VITE_'));
  for (const key of stripped) {
    // eslint-disable-next-line security/detect-object-injection -- key comes from Object.keys(env), not user input
    delete env[key];
  }
  return stripped;
}

/**
 * Cross-cutting test-environment defaults for Vitest, injected via `test.env`.
 *
 * These are genuine test-runner requirements (not app behavior defaults, which
 * come from the schema) — kept here so app code stays free of build-mode sniffing.
 * The runner runs in `local` mode (there is no `test` environment); `VITE_TEST_MODE`
 * is the single flag that marks a Vitest run (read via `platformConfig.testMode`),
 * so test-only behavior is env-driven, never sniffed from `import.meta.env.MODE`.
 *
 * Also disables the captcha gate so auth suites never mount a real Turnstile
 * widget. i18n build vars are injected separately by the i18n-build plugin.
 *
 * ## Why this also strips ambient `VITE_*`
 *
 * An exported shell variable is the SECOND way a machine leaks into the suite.
 * `vitest.config.ts` points `envDir` at an empty directory so no `.env` FILE
 * loads — but Vite's `loadEnv` copies every prefix-matching key straight out of
 * `process.env` as well, and `envDir` does not touch that path. So a shell, CI
 * runner, or cloud dev container that exports `VITE_API_BASE_URL` silently
 * re-points `import.meta.env` and the suite stops testing schema defaults —
 * which is exactly what "hermetic by construction" promises it cannot do.
 *
 * `config()` runs before Vite resolves env, so stripping here lands ahead of
 * `loadEnv`. The runner's OWN values are re-injected afterwards through
 * `test.env` (here and in `plugins/i18n-build.ts`), so this removes only what
 * the machine contributed, never what the suite asked for.
 *
 * It is deliberately unconditional — no opt-out flag. A suite whose result
 * depends on who is running it is the failure mode being closed; to change what
 * a test sees, change the schema default or the test, not the shell.
 */
export function coreFeTestEnv(): Plugin {
  return {
    name: 'core-fe-test-env',
    config() {
      const stripped = stripAmbientViteEnv();
      if (stripped.length > 0) {
        // One line, so an ignored `VITE_X=y pnpm test` is never a silent mystery.
        console.info(
          `core-fe-test-env: ignored ${stripped.length} ambient VITE_* var(s) to keep the suite hermetic — ${stripped.join(', ')}`,
        );
      }
      return {
        test: { env: { VITE_TEST_MODE: 'true', VITE_CAPTCHA_DISABLED: 'true' } },
      } as Omit<UserConfig, 'plugins'>;
    },
  };
}
