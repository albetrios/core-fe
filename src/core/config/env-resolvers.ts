/** OAuth provider ids exposed on `/login` (env-only — no backend config fetch). */
const OAUTH_PROVIDER_IDS = ['google', 'github', 'apple'] as const;

export type OAuthProviderId = (typeof OAUTH_PROVIDER_IDS)[number];

/**
 * Parse a boolean env flag: omitted/empty → `defaultValue`; `'false'` is the only
 * value that disables, everything else enables. The single primitive behind every
 * boolean platform switch (auth methods, diagnostics, devtools) so the whole app
 * reads one truth table. @internal Exported for unit tests.
 */
export function resolveBooleanFlag(
  flag: string | undefined,
  defaultValue: boolean,
): boolean {
  if (flag === undefined || flag === '') return defaultValue;
  return flag !== 'false';
}

/** Parse `true`/`false` auth-method flags; omitted → default. @internal Exported for unit tests. */
export function resolveAuthMethodFlag(
  flag: string | undefined,
  defaultValue: boolean,
): boolean {
  return resolveBooleanFlag(flag, defaultValue);
}

/**
 * Parse a `0..1` sample rate; omitted/empty/out-of-range/NaN → `defaultValue`.
 * Lets Sentry sampling be set per environment via env instead of a build-mode
 * branch. @internal Exported for unit tests.
 */
export function resolveSampleRate(
  flag: string | undefined,
  defaultValue: number,
): number {
  if (flag === undefined || flag === '') return defaultValue;
  const rate = Number(flag);
  if (Number.isNaN(rate) || rate < 0 || rate > 1) return defaultValue;
  return rate;
}

/**
 * Optional tri-state deployment override: unset → defer to API; `true`/`false` → env wins.
 * @internal Exported for unit tests.
 */
export function resolveDeploymentOverride(flag: string | undefined): boolean | null {
  if (flag === undefined || flag === '') return null;
  return flag !== 'false';
}

/**
 * Feature modules disabled for this deployment (`VITE_DISABLED_MODULES`, comma-separated).
 * @internal Exported for unit tests.
 */
export function resolveDisabledModules(flag: string | undefined): ReadonlySet<string> {
  return new Set(
    (flag ?? '')
      .split(',')
      .map((module) => module.trim())
      .filter(Boolean),
  );
}

/** App content layout width id. @internal Exported for unit tests. */
export function resolveLayoutWidth(
  flag: string | undefined,
): 'contained' | 'full' | 'reading' {
  if (flag === 'full' || flag === 'reading') return flag;
  return 'contained';
}

/** When set, locks shell width — Appearance picker hidden. @internal Exported for unit tests. */
export function resolveLayoutWidthForced(
  flag: string | undefined,
): 'contained' | 'full' | 'reading' | null {
  if (flag === 'contained' || flag === 'full' || flag === 'reading') return flag;
  return null;
}

/** When true, theme switcher + shuffle are hidden. @internal Exported for unit tests. */
export function resolveThemeLock(flag: string | undefined): boolean {
  return flag === 'true';
}

export type OAuthProviderFlags = Record<OAuthProviderId, boolean>;

/** Per-provider OAuth toggles from env. */
export function resolveOAuthProviderFlags(
  get: (key: string) => string | undefined,
): OAuthProviderFlags {
  return {
    google: resolveAuthMethodFlag(get('AUTH_OAUTH_GOOGLE'), true),
    github: resolveAuthMethodFlag(get('AUTH_OAUTH_GITHUB'), true),
    apple: resolveAuthMethodFlag(get('AUTH_OAUTH_APPLE'), false),
  };
}

/** Whether any auth surface is enabled for `/login`. */
export function hasAnyAuthSurface(methods: {
  email: boolean;
  passkey: boolean;
  oauth: OAuthProviderFlags;
}): boolean {
  if (methods.email || methods.passkey) return true;
  return OAUTH_PROVIDER_IDS.some((id) => methods.oauth[id]);
}

/** Providers enabled for this deployment's login UI (env-only). */
export function enabledOAuthProviders(oauth: OAuthProviderFlags): OAuthProviderId[] {
  return OAUTH_PROVIDER_IDS.filter((id) => oauth[id]);
}
