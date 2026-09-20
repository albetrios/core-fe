import { platformConfig } from '@/core/config/env.ts';
import {
  enabledOAuthProviders,
  type OAuthProviderFlags,
} from '@/core/config/env-resolvers.ts';
import { resolveAuthMethodsFromPlatform } from '@/core/config/platform-config.ts';

/** Which auth methods this deployment exposes on the unified auth screen. */
export interface AuthMethods {
  email: boolean;
  oauth: OAuthProviderFlags;
  passkey: boolean;
  oauthAutoGoogle: boolean;
}

/** Resolved auth-method toggles (env-only — no backend config fetch). */
export function resolveAuthMethods(): AuthMethods {
  return resolveAuthMethodsFromPlatform(platformConfig);
}

export { enabledOAuthProviders };
