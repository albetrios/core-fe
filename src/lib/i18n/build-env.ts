import { resolveBuildI18nBcp47, resolveBuildI18nMode } from './build-config.ts';

/**
 * Build-time Vite injections (version-json, i18n-build plugins).
 * Single allowlisted surface for direct `import.meta.env.VITE_*` reads outside
 * {@link env.config.ts} — see `tooling/validate/vite-env-reads.mjs`.
 */
export function readInjectedI18nMode() {
  return resolveBuildI18nMode(import.meta.env.VITE_I18N_BUILD_MODE as string | undefined);
}

function readInjectedI18nBcp47() {
  return resolveBuildI18nBcp47(
    import.meta.env.VITE_I18N_BUILD_BCP47 as string | undefined,
  );
}

export function readInjectedAppBuildId() {
  const raw = import.meta.env.VITE_APP_BUILD_ID as string | undefined;
  // An empty string means "not injected at build time" — collapse it on purpose.
  return raw === undefined || raw === '' ? undefined : raw;
}

export function readInjectedAppVersion() {
  const raw = import.meta.env.VITE_APP_VERSION as string | undefined;
  // An empty string means "not injected at build time" — collapse it on purpose.
  return raw === undefined || raw === '' ? undefined : raw;
}

/** True under the Vitest runner (`VITE_TEST_MODE` from plugins/test-env.ts). */
export function readInjectedTestMode(): boolean {
  return import.meta.env.VITE_TEST_MODE === 'true';
}

/** Snapshot at module load — use the `readInjected*` helpers when env may change (tests). */
export const buildEnv = {
  i18nMode: readInjectedI18nMode(),
  i18nBcp47: readInjectedI18nBcp47(),
  appBuildId: readInjectedAppBuildId(),
  appVersion: readInjectedAppVersion(),
  testMode: readInjectedTestMode(),
} as const;
