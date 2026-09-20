/**
 * Runtime environment bootstrap — validates `import.meta.env` and exposes
 * {@link getRuntimeConfigValue} for `window.__CONFIG__` overrides.
 */
import { z } from 'zod';

import {
  assertAuthPlatformInvariants,
  type ClientEnv,
  clientEnvSchema,
} from './env-schema.ts';

export type { ClientEnv };

let _clientEnv: ClientEnv | null = null;

/** Lazily parse and cache validated client env. */
export function getClientEnv(): ClientEnv {
  if (_clientEnv) return _clientEnv;

  const parsed = clientEnvSchema.safeParse(import.meta.env);
  if (!parsed.success) {
    // Fail-closed in every environment — invalid config is a real error, not a
    // per-mode branch. No `import.meta.env.PROD` / NODE_ENV check.
    const detail = JSON.stringify(z.flattenError(parsed.error));
    throw new Error(`[Config] Invalid environment configuration: ${detail}`);
  }

  _clientEnv = parsed.data;
  return _clientEnv;
}

/** Test-only: reset cached client env. */
export function resetClientEnvCacheForTests(): void {
  _clientEnv = null;
}

const runtimeConfig: Record<string, string> =
  typeof window !== 'undefined'
    ? (((window as unknown as Record<string, unknown>).__CONFIG__ as
        Record<string, string> | undefined) ?? {})
    : {};

/** Read a config value: runtime (`window.__CONFIG__`) → `import.meta.env.VITE_*`. */
export function getRuntimeConfigValue(key: string): string | undefined {
  /* eslint-disable security/detect-object-injection -- keys from controlled callers */
  return (
    runtimeConfig[key] ??
    (import.meta.env[`VITE_${key}`] as string | undefined) ??
    undefined
  );
  /* eslint-enable security/detect-object-injection */
}

/** Run cross-field auth/platform invariant checks once at boot. */
export function validatePlatformInvariantsAtBoot(): void {
  assertAuthPlatformInvariants(getRuntimeConfigValue);
}
