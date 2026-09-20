import { notFound, redirect } from '@tanstack/react-router';

import { AUTH_ROUTES } from '@/core/config/constants.ts';
import { hasPermission, type OrganizationPermission } from '@/core/rbac/policies.ts';
import { awaitAuthBootstrap } from '@/shared/auth/service.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

/**
 * How an *authorization* denial surfaces (FE-52): `'unauthorized'` → the 403
 * page ("you can't do this"); `'notFound'` → a 404 that hides the surface's
 * very existence (for sensitive routes where even "exists but forbidden" leaks
 * information). Defaults to `'unauthorized'`. An *authentication* failure always
 * redirects to login regardless — being a guest is not a route secret.
 */
export type DenyMode = 'unauthorized' | 'notFound';

/** Throw the configured denial (FE-52). Never returns. */
function denyAccess(onDeny: DenyMode = 'unauthorized'): never {
  if (onDeny === 'notFound') throw notFound();
  throw redirect({ to: AUTH_ROUTES.UNAUTHORIZED });
}

/**
 * Route loader/`beforeLoad` guard — throws a redirect if the user lacks an
 * org-scoped permission in the active organization.
 *
 * Redirects to `/login` when unauthenticated; otherwise denies per `onDeny`
 * (`/unauthorized` by default, or `notFound()` to hide a sensitive surface).
 *
 * @param permission - The required org-scoped permission code.
 * @param onDeny - How an authorization denial surfaces (default `'unauthorized'`).
 * @param expectedOrgSlug - When given (org-scoped routes), the gate fails closed
 *   unless the synced active-org context matches the route's org — so it never
 *   authorizes against another tenant's permission set even if an upstream guard
 *   is reordered/omitted (FE-52 sibling check). Omitted for personal-mode routes.
 *
 * @example
 * beforeLoad: () => requirePermission('membership:read');
 */
export async function requirePermission(
  permission: OrganizationPermission,
  onDeny?: DenyMode,
  expectedOrgSlug?: string,
): Promise<void> {
  await awaitAuthBootstrap();
  const { user, isAuthenticated } = useAuthStore.getState();

  if (!(isAuthenticated && user)) {
    throw redirect({ to: AUTH_ROUTES.LOGIN });
  }

  const { organizationSlug, permissions } = useOrganizationStore.getState();
  // Never check permissions against a different tenant's synced context.
  if (expectedOrgSlug !== undefined && organizationSlug !== expectedOrgSlug) {
    denyAccess(onDeny);
  }
  if (!hasPermission({ role: user.role, permissions }, permission)) {
    denyAccess(onDeny);
  }
}

/**
 * Guest-only guard — sends already-authenticated users away from auth screens
 * (login/MFA) to `/`, where the resolver picks their
 * last organization. Pure store read: safe to run during hover preloads.
 */
export async function redirectIfAuthenticated(): Promise<void> {
  await awaitAuthBootstrap();
  const { isAuthenticated } = useAuthStore.getState();
  if (isAuthenticated) {
    throw redirect({ to: '/' });
  }
}

/**
 * Route loader guard — throws redirect if not authenticated.
 *
 * @param redirectTo - Optional path to return to after login; carried as the
 * `redirect` search param (LoginForm validates it via `isSafeRedirectPath`).
 */
export async function requireAuth(redirectTo?: string): Promise<void> {
  await awaitAuthBootstrap();
  const { isAuthenticated } = useAuthStore.getState();

  if (!isAuthenticated) {
    throw redirect({
      to: AUTH_ROUTES.LOGIN,
      search: redirectTo ? { redirect: redirectTo } : undefined,
    });
  }
}
