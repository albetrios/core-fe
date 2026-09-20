/**
 * Application config — exports {@link platformConfig} resolved from validated env.
 *
 * Env files at project root (all gitignored except the committed .env.example):
 *   .env.example (template) · .env.local (local dev) · .env.development · .env.production (deploy envs)
 *
 * Resolution: `window.__CONFIG__[key]` → `import.meta.env.VITE_${key}` → defaults.
 * See docs/deployment/runbooks/environment-variables.md.
 */
import {
  getClientEnv,
  getRuntimeConfigValue,
  validatePlatformInvariantsAtBoot,
} from './env.config.ts';
import {
  resolveLayoutWidth,
  resolveLayoutWidthForced,
  resolveThemeLock,
} from './env-resolvers.ts';
import { resolvePlatformConfig } from './platform-config.ts';

export { resolveLayoutWidth, resolveLayoutWidthForced, resolveThemeLock };
const clientEnv = getClientEnv();
export const platformConfig = resolvePlatformConfig(getRuntimeConfigValue, clientEnv);

// Boot invariants — no environment branching (behavior is env-flag-driven; the
// production Turnstile requirement is enforced at deploy time by validate:client-env).
validatePlatformInvariantsAtBoot();

// Reject a non-HTTPS absolute API origin anywhere except localhost. Dev uses ''
// (Vite proxy) or http://localhost, so this only fires on a genuinely
// misconfigured http:// origin — no isProduction check needed.
if (
  platformConfig.apiBaseUrl?.startsWith('http://') &&
  !platformConfig.apiBaseUrl.startsWith('http://localhost')
) {
  throw new Error(
    '[Config] VITE_API_BASE_URL must use HTTPS. Received: ' +
      platformConfig.apiBaseUrl.slice(0, 40),
  );
}
