import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

import { i18nBuild } from './plugins/i18n-build.ts';
import { coreFeTestEnv } from './plugins/test-env.ts';

export default defineConfig({
  // Deliberately NO react-compiler here (vite.config.ts has it): coverage must
  // measure SOURCE branches, not the compiler's synthetic memo-cache checks
  // (which tripled the branch denominator and made the ratchet meaningless).
  // Compiled output is exercised by the e2e suite and the production build.
  plugins: [
    react(),
    i18nBuild({ modeFlag: 'multi', localeFlag: 'en-US' }),
    coreFeTestEnv(),
  ],
  // Hermetic env: point Vite/Vitest env loading at an empty dir so NO .env files load — not
  // even `.env.local` (which Vite loads in every mode). The runner keeps Vitest's default Vite
  // mode; the reported environment is `local` (the VITE_APP_ENV default, since no env files
  // load), and a Vitest run is marked by `VITE_TEST_MODE` (plugins/test-env.ts). Keeps the
  // suite on schema defaults on every machine + CI. See tooling/test/empty-env/.
  envDir: path.resolve(__dirname, 'tooling/test/empty-env'),
  resolve: {
    alias: {
      '@/tests': path.resolve(__dirname, './tests'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/utils/setup.ts'],
    exclude: ['node_modules', 'dist', 'tests/e2e'],
    css: true,
    // Hermetic by construction — no env pinning here. The top-level `envDir` above
    // points Vite/Vitest env loading at an empty dir, so the runner loads NO .env files
    // (not even `.env.local`, which Vite otherwise loads in every mode), and the suite
    // runs on schema defaults on every machine and on CI. i18n build vars
    // are injected by the i18n-build plugin's `test.env` (see plugins/i18n-build.ts).
    // Projects (core-be pattern): `unit` = colocated src suites; `security` =
    // cross-cutting invariants under tests/security (token storage, redirect
    // safety, header tripwires). `pnpm test` runs all;
    // `pnpm test:unit` / `pnpm test:security` target one project.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'security',
          include: ['tests/security/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ci-policy',
          // Release/CI-flow invariants (core-be src/tests/unit/ci pattern):
          // workflow YAML wiring, release-please manifest shape, Dependabot
          // flow rules. Guards against silent drift like a renamed workflow
          // killing a workflow_run trigger.
          include: ['tests/ci/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      // lcov feeds SonarQube (sonar.javascript.lcov.reportPaths);
      // json-summary feeds the CI job-summary coverage table.
      reporter: ['text', 'json', 'html', 'lcov', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/__tests__/**',
        'tests/**',
        'src/vite-env.d.ts',
      ],
      // Coverage RATCHET — pinned ~1% under measured coverage so CI fails on
      // regression, never on ambition. Raise (never lower) when coverage rises;
      // target is 80 as the auth/organization modules get rebuilt with tests.
      thresholds: {
        branches: 59,
        functions: 61,
        lines: 66,
        statements: 66,
      },
    },
  },
});
