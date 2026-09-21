import {
  assertAuthPlatformInvariants,
  branchEnvironmentMap,
  clientEnvSchema,
  type DeployEnvironment,
  envFieldDescriptions,
  environmentForBranch,
  envProfiles,
  envSchemaConditionallyRequiredKeys,
  envSchemaKeys,
  type ForbiddenKeyRule,
} from './env-schema.ts';

/** Mirrors the validator's forbidden matcher (tooling/validate/client-env.ts). */
function isForbidden(rule: ForbiddenKeyRule, value: string): boolean {
  return rule.valuePattern ? rule.valuePattern.test(value) : true;
}

function forbiddenHits(
  environment: DeployEnvironment,
  committed: Record<string, string>,
): string[] {
  return envProfiles[environment].forbidden
    .filter((rule) => {
      const value = committed[rule.key];
      return value !== undefined && isForbidden(rule, value);
    })
    .map((rule) => rule.key);
}

describe('environmentForBranch', () => {
  it('maps the single deploying branch (main) to its environment', () => {
    expect(environmentForBranch('main')).toBe('production');
  });

  it('returns undefined for non-deploying branches and missing input', () => {
    // Single-trunk: no `dev` branch — only `main` maps.
    expect(environmentForBranch('dev')).toBeUndefined();
    expect(environmentForBranch('feature/foo')).toBeUndefined();
    expect(environmentForBranch(undefined)).toBeUndefined();
    expect(environmentForBranch('')).toBeUndefined();
  });

  it('stays in lock step with branchEnvironmentMap', () => {
    expect(branchEnvironmentMap).toEqual({ main: 'production' });
  });
});

describe('envProfiles forbidden keys', () => {
  it('blocks local-only Sonar secrets in every environment', () => {
    for (const environment of ['development', 'production'] as const) {
      expect(forbiddenHits(environment, { SONAR_TOKEN: 'x' })).toContain('SONAR_TOKEN');
      expect(forbiddenHits(environment, { SONAR_ADMIN_PASSWORD: 'x' })).toContain(
        'SONAR_ADMIN_PASSWORD',
      );
    }
  });

  it('blocks a test Stripe key in production but allows a live key', () => {
    expect(
      forbiddenHits('production', { VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_1' }),
    ).toContain('VITE_STRIPE_PUBLISHABLE_KEY');
    expect(
      forbiddenHits('production', { VITE_STRIPE_PUBLISHABLE_KEY: 'pk_live_1' }),
    ).toEqual([]);
  });

  it('blocks a live Stripe key in development but allows a test key', () => {
    expect(
      forbiddenHits('development', { VITE_STRIPE_PUBLISHABLE_KEY: 'pk_live_1' }),
    ).toContain('VITE_STRIPE_PUBLISHABLE_KEY');
    expect(
      forbiddenHits('development', { VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_1' }),
    ).toEqual([]);
  });
});

describe('envProfiles required keys', () => {
  it('requires Turnstile in production only when captcha is enabled', () => {
    const rule = envProfiles.production.required.find(
      (r) => r.key === 'VITE_TURNSTILE_SITE_KEY',
    );
    expect(rule).toBeDefined();
    expect(rule?.level).toBe('error');
    expect(rule?.when?.(() => undefined)).toBe(true);
    expect(
      rule?.when?.((key) => (key === 'VITE_CAPTCHA_DISABLED' ? 'true' : undefined)),
    ).toBe(false);
  });

  it('derives the conditionally-required list from the production profile', () => {
    const keys = envSchemaConditionallyRequiredKeys.map((entry) => entry.key);
    expect(keys).toEqual([
      'VITE_TURNSTILE_SITE_KEY',
      'VITE_API_BASE_URL',
      'VITE_CSP_REPORT_URI',
    ]);
    for (const entry of envSchemaConditionallyRequiredKeys) {
      expect(entry.condition.length).toBeGreaterThan(0);
    }
  });

  it('requires VITE_APP_ENV unconditionally in both deploy environments', () => {
    // Deploys must self-report their environment (Sentry/PostHog tag); without
    // this rule an un-injected VITE_APP_ENV silently falls back to `local`.
    for (const env of ['development', 'production'] as const) {
      const rule = envProfiles[env].required.find((r) => r.key === 'VITE_APP_ENV');
      expect(rule, `${env} must require VITE_APP_ENV`).toBeDefined();
      expect(rule?.level).toBe('error');
      expect(rule?.when).toBeUndefined();
      expect(rule?.condition).toBeUndefined();
    }
    expect(envProfiles.local.required.some((r) => r.key === 'VITE_APP_ENV')).toBe(false);
  });

  it('warns — never fails — when a deploy has no CSP violation collector', () => {
    // Both deploy environments ship `Content-Security-Policy-Report-Only:
    // require-trusted-types-for 'script'` unconditionally. With no collector the
    // browser reports each violation to the visitor's own console and nowhere
    // else, so the "promote to enforcing once the stream is clean" step has no
    // stream. Surface that as a warning: missing collection is degraded, not broken.
    const deployProfiles = [
      ['development', envProfiles.development],
      ['production', envProfiles.production],
    ] as const;
    for (const [env, profile] of deployProfiles) {
      const rule = profile.required.find((r) => r.key === 'VITE_CSP_REPORT_URI');
      expect(rule, `${env} must flag a missing CSP collector`).toBeDefined();
      expect(rule?.level).toBe('warn');
      expect(rule?.condition).toBeTruthy();
      // Unconditional: `when` would let an unset collector pass silently.
      expect(rule?.when).toBeUndefined();
    }
    // `local` never deploys, so it has no collector to miss.
    expect(envProfiles.local.required.some((r) => r.key === 'VITE_CSP_REPORT_URI')).toBe(
      false,
    );
  });
});

describe('envProfiles allowed values (strict per-environment)', () => {
  it('production permits only the safe value for each diagnostics flag', () => {
    const allowed = envProfiles.production.allowed;
    expect(allowed).toBeDefined();
    expect(allowed?.VITE_DEBUG_LOGGING).toEqual(['false']);
    expect(allowed?.VITE_DEVTOOLS).toEqual(['false']);
    expect(allowed?.VITE_E2E_HOOKS).toEqual(['false']);
    expect(allowed?.VITE_VERSION_CHECK).toEqual(['true']);
  });

  it('development permits either boolean value for diagnostics flags', () => {
    const allowed = envProfiles.development.allowed;
    expect(allowed?.VITE_DEBUG_LOGGING).toEqual(['true', 'false']);
    expect(allowed?.VITE_DEVTOOLS).toEqual(['true', 'false']);
    expect(allowed?.VITE_E2E_HOOKS).toEqual(['true', 'false']);
    expect(allowed?.VITE_VERSION_CHECK).toEqual(['true', 'false']);
  });

  it('rejects a disallowed production value (mirrors the validator check)', () => {
    const debug = envProfiles.production.allowed?.VITE_DEBUG_LOGGING ?? [];
    expect(debug.includes('true')).toBe(false);
    expect(debug.includes('false')).toBe(true);
    const versionCheck = envProfiles.production.allowed?.VITE_VERSION_CHECK ?? [];
    expect(versionCheck.includes('false')).toBe(false);
    expect(versionCheck.includes('true')).toBe(true);
  });
});

describe('envProfiles defaults (per-environment starting values)', () => {
  it('every default value is within the allowed set for its key', () => {
    for (const env of ['local', 'development', 'production'] as const) {
      const { defaults, allowed } = envProfiles[env];
      for (const [key, value] of Object.entries(defaults ?? {})) {
        const permitted = allowed?.[key];
        // Keys without an `allowed` constraint (URLs/secrets) accept any default.
        if (permitted) {
          expect(
            permitted,
            `${env}.defaults.${key}=${value} must be within allowed`,
          ).toContain(value);
        }
      }
    }
  });

  it('production defaults are production-safe (diagnostics off, version-check on)', () => {
    const defaults = envProfiles.production.defaults;
    expect(defaults?.VITE_DEBUG_LOGGING).toBe('false');
    expect(defaults?.VITE_DEVTOOLS).toBe('false');
    expect(defaults?.VITE_E2E_HOOKS).toBe('false');
    expect(defaults?.VITE_VERSION_CHECK).toBe('true');
  });

  it('local defaults turn dev-tooling on and point at the localhost backend', () => {
    const defaults = envProfiles.local.defaults;
    expect(defaults?.VITE_DEBUG_LOGGING).toBe('true');
    expect(defaults?.VITE_DEVTOOLS).toBe('true');
    expect(defaults?.VITE_DEV_API_URL).toBe('http://localhost:3000');
  });
});

describe('assertAuthPlatformInvariants', () => {
  it('does not throw when no auth surface is enabled (runs the warn path)', () => {
    const allAuthOff = (key: string) => (key.startsWith('AUTH_') ? 'false' : undefined);
    expect(() => assertAuthPlatformInvariants(allAuthOff)).not.toThrow();
  });

  it('throws when auto-google is on but google is off', () => {
    const get = (key: string) => {
      if (key === 'AUTH_OAUTH_AUTO_GOOGLE') return 'true';
      if (key === 'AUTH_OAUTH_GOOGLE') return 'false';
      return undefined;
    };
    expect(() => assertAuthPlatformInvariants(get)).toThrow(/AUTO_GOOGLE/);
  });
});

describe('envSchemaKeys', () => {
  it('includes the Stripe publishable key', () => {
    expect(envSchemaKeys).toContain('VITE_STRIPE_PUBLISHABLE_KEY');
  });

  it('includes the local Sonar tooling secrets', () => {
    expect(envSchemaKeys).toContain('SONAR_TOKEN');
    expect(envSchemaKeys).toContain('SONAR_ADMIN_PASSWORD');
  });
});

describe('envFieldDescriptions', () => {
  it('has a non-empty description for every schema key (single source for .env.example)', () => {
    const missing = envSchemaKeys.filter((key) => !envFieldDescriptions[key]?.trim());
    expect(missing, `keys without a description: ${missing.join(', ')}`).toEqual([]);
  });

  it('has no descriptions for keys absent from the schema', () => {
    const known = new Set<string>(envSchemaKeys);
    const extra = Object.keys(envFieldDescriptions).filter((key) => !known.has(key));
    expect(extra, `descriptions with no schema key: ${extra.join(', ')}`).toEqual([]);
  });
});

describe('VITE_APP_ENV enum (reported environment identity)', () => {
  it('accepts `local` (developer machine — mirrors core-be NODE_ENV=local)', () => {
    const parsed = clientEnvSchema.safeParse({ VITE_APP_ENV: 'local' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.VITE_APP_ENV).toBe('local');
  });

  it('defaults to local when unset (mirrors core-be NODE_ENV=local)', () => {
    const parsed = clientEnvSchema.safeParse({});
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.VITE_APP_ENV).toBe('local');
  });

  it('accepts the two deploy environments (`development`, `production`)', () => {
    expect(clientEnvSchema.safeParse({ VITE_APP_ENV: 'development' }).success).toBe(true);
    expect(clientEnvSchema.safeParse({ VITE_APP_ENV: 'production' }).success).toBe(true);
  });

  it('rejects `test` — it is not an environment; a Vitest run is marked by VITE_TEST_MODE', () => {
    // The environment vocabulary is exactly local/development/production. A test run is
    // flagged by VITE_TEST_MODE, decoupled from the Vite mode.
    expect(clientEnvSchema.safeParse({ VITE_APP_ENV: 'test' }).success).toBe(false);
  });

  it('fails loudly on an out-of-enum value (e.g. qa) — never a silent default', () => {
    // env.config.ts eager-parses clientEnvSchema and throws on failure.
    expect(clientEnvSchema.safeParse({ VITE_APP_ENV: 'qa' }).success).toBe(false);
  });
});
