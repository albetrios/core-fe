import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import sonarjs from 'eslint-plugin-sonarjs';
import security from 'eslint-plugin-security';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import { defineConfig, globalIgnores } from 'eslint/config';

/**
 * Shared by the app-wide restriction block and the LocalizedCalendar override.
 * Flat config REPLACES a rule's options rather than merging them, so any block
 * that re-declares `no-restricted-imports` must restate these or it silently
 * drops the icon/toast boundaries for the files it matches.
 */
const RESTRICTED_IMPORT_PATHS = [
  {
    name: 'lucide-react',
    message: "Import icons from '@/shared/icons/index.ts' (one-file icon-library swap).",
  },
  {
    name: '@tabler/icons-react',
    message:
      "Import icons from '@/shared/icons/index.ts' — Tabler is wired there as a swappable set.",
  },
  {
    name: '@phosphor-icons/react',
    message:
      "Import icons from '@/shared/icons/index.ts' — Phosphor is wired there as a swappable set.",
  },
  {
    name: 'sonner',
    message:
      "Use '@/shared/notify' for toasts — the single toast surface (one place for durations/de-dupe/a11y).",
  },
];

/** Vendored calendar bypasses locale prefs; app code goes through the wrapper. */
const RESTRICTED_CALENDAR_PATTERN = {
  group: ['**/shared/components/ui/calendar', '**/shared/components/ui/calendar.tsx'],
  message:
    "Import '@/shared/components/LocalizedCalendar' — the vendored calendar's defaults ignore weekStartsOn / month formatting from Appearance prefs.",
};

/** The shared layer's own boundary, restated by the LocalizedCalendar override. */
const SHARED_LAYER_PATTERN = {
  group: ['@/pages/**', '@/app/**'],
  message: 'src/shared must not depend on pages or app (shared may import core/lib).',
};

export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'coverage', 'test-results', '.stryker-tmp']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
      sonarjs.configs.recommended,
      security.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    rules: {
      // ── Import ordering + dead imports ──
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],

      // ── Complexity & structure ──
      'max-depth': ['warn', 4],
      'max-lines-per-function': [
        'warn',
        { max: 200, skipBlankLines: true, skipComments: true },
      ],
      complexity: ['warn', 15],

      // TODOs are tracked; don't block production on them
      'sonarjs/todo-tag': 'warn',

      // ── Security (built-in) ──
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-param-reassign': 'error',
    },
  },

  // Icons flow through the @/shared/icons barrel so the icon library is
  // swappable in one file. Exempt paths: the barrel itself and vendored shadcn
  // primitives (icon sources), plus the notify layer — it WRAPS sonner, the
  // other restricted import in this block.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/shared/icons/**',
      'src/shared/components/ui/**',
      'src/shared/notify/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: RESTRICTED_IMPORT_PATHS,
          patterns: [RESTRICTED_CALENDAR_PATTERN],
        },
      ],
    },
  },

  // Lazy route modules export Component (+ ErrorBoundary when wired in
  // routeTree — rare). No loader/action: RBAC and data belong in routeTree
  // beforeLoad + gatewayFromManifest, never in an island loader (CLAUDE.md
  // route.tsx contract).
  {
    files: ['**/pages/**/*.route.tsx'],
    rules: {
      'react-refresh/only-export-components': [
        'warn',
        { allowExportNames: ['ErrorBoundary'] },
      ],
    },
  },

  // shadcn/ui components export variant definitions alongside components
  {
    files: ['**/shared/components/ui/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  // Test files — relax rules that produce noise on fixtures/mocks
  // parameterized-tests (S5976): descriptive per-case `it()` names document
  // distinct behaviour branches — each carries its own inputs AND its own
  // expected result, and the name is the "why". Collapsing them into an
  // `it.each` table trades that intent for a data row. We DO parameterize where
  // cases vary only by data (see `it.each` across the suite); the rule cannot
  // tell the two apart, so it stays off for tests and parameterization is a
  // judgement call, not a lint error.
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'sonarjs/slow-regex': 'off',
      'sonarjs/no-hardcoded-passwords': 'off',
      'sonarjs/parameterized-tests': 'off',
      'max-lines-per-function': 'off',
    },
  },

  // Tests reset mocks; they do not merely clear them.
  //
  // `vi.clearAllMocks()` clears call history but keeps any implementation a test
  // installed, so one test's `mockResolvedValue(...)` / `mockImplementation(...)`
  // silently becomes the next test's starting state. It broke
  // `AuthForm.test.tsx`: a test left `emailVerificationCodeSend` pending forever
  // and a later one never saw the code step. `vi.resetAllMocks()` restores each
  // mock to the implementation it was created with, so defaults belong in
  // `vi.fn(impl)` (a bare `vi.fn()` resets to returning `undefined`).
  // `no-restricted-properties` is set nowhere else in this config, so this block
  // replaces nothing (flat config REPLACES rule options, it does not merge them;
  // `no-restricted-syntax` would have collided with the e2e `.catch()` ban).
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'tests/**/*.ts', 'tests/**/*.tsx'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'vi',
          property: 'clearAllMocks',
          message:
            'Use vi.resetAllMocks(): clearAllMocks keeps implementations a test installed, so they leak into later tests. Put mock defaults in vi.fn(impl) so the reset restores them.',
        },
      ],
    },
  },

  // E2E test utilities — fixtures, unique IDs for isolation.
  // no-skipped-tests: Playwright's conditional `test.skip(condition, reason)`
  // is the sanctioned environment-dependent skip (org switcher hidden, no
  // seeded plans, …) and always carries a reason — the rule targets jest-style
  // unconditional `.skip` and misreads this idiom.
  // assertions-in-tests: hybrid e2e assertions live in tests/utils helpers
  // (expect* wrappers), which the rule cannot see — same rationale as the
  // S2699 test exclusion in sonar-project.properties.
  // no-fixed-wait-in-tests: some Playwright waits are inherently time-based and
  // have no observable condition to synchronize on — asserting the ABSENCE of an
  // event (no reload after the update toast is dismissed) can only be verified by
  // waiting a fixed budget and confirming nothing changed, and the reduced-motion
  // animation-settle helper is a fixed frame budget by design. The rule targets
  // arbitrary sleeps standing in for a real await and misreads these idioms.
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx'],
    rules: {
      'sonarjs/no-hardcoded-passwords': 'off',
      'sonarjs/pseudo-random': 'off',
      'sonarjs/no-skipped-tests': 'off',
      'sonarjs/assertions-in-tests': 'off',
      'sonarjs/no-fixed-wait-in-tests': 'off',
    },
  },

  // Same-route navigation must say what happens to the hash.
  //
  // Settings is a global HASH modal (`#settings/<scope>/<section>`) that can sit
  // over any page, and TanStack Router resolves an OMITTED `hash` to "none"
  // (`buildLocation`: `dest.hash === true ? current : dest.hash ? … : undefined`).
  // So `navigate({ to: '.', search, replace: true })` — "just patch the search" —
  // also closes the modal. Three call sites did exactly that after a Stripe
  // return, dropping a customer who had just finished 3DS onto a bare dashboard,
  // and the table URL-state hook would have done it on the first column sort.
  // Write `hash: true` to keep it, or `hash: ''` to clear it on purpose.
  // (`no-restricted-syntax` is set for no other `src` glob, so nothing is replaced.)
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['**/*.test.*'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression:matches([callee.name='navigate'], [callee.property.name='navigate']) > ObjectExpression:has(> Property[key.name='to'][value.value='.']):not(:has(> Property[key.name='hash']))",
          message:
            "Same-route navigate({ to: '.' }) must state the hash: the router drops an omitted hash, which closes the settings hash modal. Use `hash: true` to keep it (or `hash: ''` to clear it deliberately).",
        },
      ],
    },
  },

  // Playwright specs + helpers: a feature check must not swallow its own error.
  //
  // `locator.isVisible()` (and its siblings) already return `false` when nothing
  // matches. The ONLY thing a trailing `.catch(() => false)` can ever swallow is a
  // strict-mode violation — the locator matched MORE THAN ONE element. That turned
  // `test.skip(!(await switcher.isVisible().catch(() => false)), '…')` into an
  // unconditional, silent skip: the org switcher's test id is mounted twice
  // (sidebar + mobile header), so its own specs ran zero assertions on every
  // machine, green, and two product bugs sat behind them. Narrow the locator
  // (`byTestId()` = visible + first) and let an ambiguous one fail loudly.
  // A timed `waitFor(…).then(() => true).catch(() => false)` is a different thing
  // (a timeout IS the expected "no") and is not matched.
  // `no-restricted-syntax` is set nowhere else in this config, so this block
  // replaces nothing (flat config REPLACES rule options, it does not merge them).
  {
    files: ['tests/e2e/**/*.ts', 'tests/utils/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='catch'][callee.object.type='CallExpression'][callee.object.callee.property.name=/^is(Visible|Hidden|Enabled|Disabled|Checked|Editable)$/]",
          message:
            'Do not .catch() an instantaneous locator check: it already returns false for no match, so the catch can only hide a strict-mode violation (more than one element) and turn a feature check into a silent skip. Narrow the locator with byTestId() instead.',
        },
      ],
    },
  },

  // Build plugins — non-security random, fs writes to known paths
  {
    files: ['plugins/**/*.ts'],
    rules: {
      'sonarjs/pseudo-random': 'off',
      'security/detect-non-literal-fs-filename': 'off',
    },
  },

  // ── Dev-time surfaces: scripts, generators and tests ──────────────────────
  // These walk the repo, build paths from directory listings and print to stdout — that is
  // their job, not a finding. The inputs are files already in the checkout, so a malicious
  // path implies an attacker who can already write to the repo. `plugins/**` has carried the
  // same exemption for `detect-non-literal-fs-filename` since it was added; this extends the
  // same reasoning to the other build-time surfaces rather than scattering ~140 inline
  // disables through them. `src/**` stays strict — nothing here loosens shipped code.
  {
    files: [
      'tooling/**/*.{ts,mjs}',
      'agent-os/**/*.{ts,mjs}',
      'tests/**/*.{ts,tsx}',
      '**/*.test.{ts,tsx}',
      'plugins/**/*.ts',
    ],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-non-literal-regexp': 'off',
      'security/detect-unsafe-regex': 'off',
      'no-console': 'off',
      'max-depth': 'off',
    },
  },

  // ── detect-object-injection ────────────────────────────────────────────────
  // The rule flags the SYNTAX `obj[key]`, not an actual unsafe lookup, so it cannot be
  // satisfied by making the code safer — only by avoiding computed access entirely. Every
  // remaining site here is a record keyed by a typed union or a local `as const` array
  // (`INTL_LOCALE[locale]`, `envProfiles[environment]`, `TOAST_VARIANTS[next]`), and
  // `noUncheckedIndexedAccess: true` (tsconfig.app.json) already forces each of those reads
  // to be handled as possibly-undefined. That is the guarantee the rule is reaching for, and
  // the compiler enforces it where the linter can only guess.
  //
  // Where keys genuinely come from outside — an API error payload, a JSON manifest on disk —
  // the accumulators they write into are built with `Object.create(null)` so a `__proto__`
  // entry lands as an ordinary own property instead of reassigning a prototype. See
  // `src/shared/errors/map-validation-errors.ts`, `tooling/agent-os/generate.ts` and
  // `tooling/dev/mcp-config.ts`. That is the real defence; this rule does not detect it.
  {
    files: [
      'src/**/*.{ts,tsx}',
      'tooling/**/*.{ts,mjs}',
      'tests/**/*.{ts,tsx}',
      'plugins/**/*.ts',
      'agent-os/**/*.{ts,mjs}',
    ],
    rules: {
      'security/detect-object-injection': 'off',
    },
  },

  // API/route path constants (strings like /auth/reset-password), not credentials
  {
    files: ['**/core/config/constants.ts', '**/*.constants.ts'],
    rules: {
      'sonarjs/no-hardcoded-passwords': 'off',
    },
  },

  // ── Layer boundaries: ui → lib → core → shared → pages → app ──
  // One-way dependency rule from agent-os/rules/fe-file-structure.mdc, enforced on
  // production code (test files may cross layers for mocks/fixtures).
  // KNOWN DEBT files are exempted explicitly — shrink these lists by relocating
  // the code; never extend them.
  {
    files: ['src/lib/**/*.{ts,tsx}'],
    ignores: ['**/*.test.*'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/shared/**', '@/pages/**', '@/app/**'],
              message:
                'src/lib is the bottom layer — pure utilities only (lib may import lib and core/types).',
            },
            {
              // lib may reach core ONLY for shared type definitions
              regex: '^@/core/(?!types/)',
              message:
                'src/lib may import from core only @/core/types (see fe-file-structure.mdc → Import Rules).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    ignores: ['**/*.test.*'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/pages/**', '@/app/**'],
              message: 'src/core must never import pages or app.',
            },
            {
              // Baseline: core never imports shared. The runtime-trio exception
              // is scoped to the kernel (core/http + core/rbac) in the next
              // block — a later flat-config block overrides this rule for its
              // narrower file set (fe-file-structure.mdc → Import Rules).
              group: ['@/shared/**'],
              message:
                'src/core must not import from shared — only the kernel (core/http, core/rbac) may reach the runtime trio (see fe-file-structure.mdc → Import Rules).',
            },
          ],
        },
      ],
    },
  },
  {
    // Kernel exception (fe-file-structure.mdc → Import Rules): core/http and
    // core/rbac may read the auth runtime, error reporting, and the
    // auth/tenant stores. Everything else in shared stays off-limits.
    files: ['src/core/http/**/*.{ts,tsx}', 'src/core/rbac/**/*.{ts,tsx}'],
    ignores: ['**/*.test.*'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/pages/**', '@/app/**'],
              message: 'src/core must never import pages or app.',
            },
            {
              regex:
                '^@/shared/(?!auth/|errors/|store/useAuthStore/|store/useOrganizationStore/)',
              message:
                'The core kernel may import from shared ONLY the runtime trio: @/shared/auth, @/shared/errors, useAuthStore, useOrganizationStore (see fe-file-structure.mdc → Import Rules).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    ignores: ['**/*.test.*'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [SHARED_LAYER_PATTERN, RESTRICTED_CALENDAR_PATTERN] },
      ],
    },
  },
  // shadcn primitives: strictest layer — only other ui primitives and lib
  {
    files: ['src/shared/components/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // everything internal except @/lib and other ui primitives
              regex: '^@/(core|pages|app)/|^@/shared/(?!components/ui/)',
              message: 'UI primitives may import only @/lib and other ui primitives.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/pages/**/*.{ts,tsx}'],
    ignores: ['**/*.test.*'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/pages/**'],
              message:
                'Pages never import other pages — use relative imports within an island; share cross-page code via src/shared.',
            },
            {
              group: ['@/app/**'],
              message: 'Pages must not import the app shell.',
            },
            RESTRICTED_CALENDAR_PATTERN,
          ],
        },
      ],
    },
  },

  // The sanctioned calendar boundary: LocalizedCalendar is the ONE place
  // allowed to import the vendored primitive (it injects weekStartsOn + the
  // civil-day month formatter from Appearance prefs). Must sit AFTER the
  // src/shared block — flat config replaces rule options rather than merging,
  // so the last matching block wins and the icon/toast paths plus the shared
  // layer boundary have to be restated here.
  {
    files: ['src/shared/components/LocalizedCalendar/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: RESTRICTED_IMPORT_PATHS, patterns: [SHARED_LAYER_PATTERN] },
      ],
    },
  },
]);
