import { organizationDashboard } from '@/lib/routes/index.ts';

import { type DeploymentFlags, resolveDeploymentMode } from './deployment-mode.ts';
import { type MeContext, needsOnboarding } from './me-context.ts';
import { ensureSessionContext } from './session-context.ts';

/**
 * Dual-URL root target (research/11 §3.3, D-02/D-10): the active org from
 * `me/context` decides where `/` lands — adjusted for deployment mode
 * (personal-only / team-only / both).
 */
export type RootTarget =
  | { readonly to: '/onboarding' }
  | { readonly to: '/dashboard' }
  | { readonly to: '/organization' }
  | {
      readonly to: '/organization/$organizationSlug/dashboard';
      readonly params: { organizationSlug: string };
    };

/** Where to send a session with no active org when onboarding is not required. */
function targetWhenNoActiveOrg(flags: DeploymentFlags, ctx: MeContext): RootTarget {
  if (needsOnboarding(ctx)) {
    return { to: '/onboarding' } as const;
  }
  const mode = resolveDeploymentMode(flags);
  if (mode === 'team-only') {
    return { to: '/organization' } as const;
  }
  // OAuth / email OTP: personal workspace may be provisioned server-side after onboarding.
  return { to: '/dashboard' } as const;
}

/**
 * The org dashboard — the team landing surface — is gated on `organization:read`
 * (see `dashboard.manifest.ts`). A member whose active org is a team they can't
 * read (a role without that grant, e.g. a mis-seeded org) would land on that
 * dashboard and be bounced to `/unauthorized` — whose "Go Home" resolves right
 * back here, a dead-end loop. So land such a session on the **org picker**
 * instead: a gate-light surface they can always reach, where they pick a
 * workspace they can enter (or sign out). Members WITH the grant are unaffected.
 */
const DASHBOARD_LANDING_PERMISSION = 'organization:read';

function teamDashboardOrPicker(ctx: MeContext, organizationSlug: string): RootTarget {
  if (!ctx.myPermissions.includes(DASHBOARD_LANDING_PERMISSION)) {
    return { to: '/organization' } as const;
  }
  return {
    to: '/organization/$organizationSlug/dashboard',
    params: { organizationSlug },
  } as const;
}

export function resolveRootTarget(ctx: MeContext): RootTarget {
  // Onboarding is the first gate for EVERY deployment mode: a fresh user goes
  // through the wizard once before any dashboard — even in personal modes, where
  // a personal org is auto-provisioned at signup and would otherwise short-circuit
  // straight to `/dashboard`. Only the wizard steps differ by mode, not whether
  // onboarding runs. Driven by the backend `onboarding_completed` flag.
  if (needsOnboarding(ctx)) return { to: '/onboarding' } as const;

  const mode = resolveDeploymentMode(ctx.deploymentFlags);
  const active = ctx.activeOrganization;
  const noActive = targetWhenNoActiveOrg(ctx.deploymentFlags, ctx);

  if (mode === 'personal-only') {
    if (!active) return noActive;
    return { to: '/dashboard' } as const;
  }

  if (mode === 'team-only') {
    if (!active) return noActive;
    if (active.type === 'TEAM' && active.slug) {
      return teamDashboardOrPicker(ctx, active.slug);
    }
    return noActive;
  }

  if (!active) return noActive;
  if (active.type === 'PERSONAL') return { to: '/dashboard' } as const;
  if (active.slug) {
    return teamDashboardOrPicker(ctx, active.slug);
  }
  return noActive;
}

/**
 * Personal `/dashboard` is only valid when {@link resolveRootTarget} would send
 * `/` there. Otherwise return the canonical workspace (onboarding or team slug).
 */
export function workspaceRedirectForPersonalDashboard(ctx: MeContext): RootTarget | null {
  const target = resolveRootTarget(ctx);
  if (target.to === '/dashboard') return null;
  return target;
}

/**
 * Team slug routes require a provisioned workspace. Only onboarding redirects
 * unconditionally. When the URL targets a **specific** `$organizationSlug`, the
 * slug chain ({@link requireOrganizationContext}) owns membership validation
 * (404 for non-members) and switch-on-navigation — redirecting on the CURRENT
 * active org here would trap personal-active (or no-active) sessions out of
 * every team workspace they belong to, which is the exact org switch the
 * navigation is asking for. The bare `/organization` picker entry keeps the
 * active-org routing (personal-active sessions belong on `/dashboard`).
 */
export function workspaceRedirectForTeamEntry(
  ctx: MeContext,
  options?: { organizationPicker?: boolean },
): RootTarget | null {
  const target = resolveRootTarget(ctx);
  if (target.to === '/onboarding') return target;
  if (!options?.organizationPicker) return null;
  if (target.to === '/dashboard') return target;
  return null;
}

type RootRedirect =
  | ReturnType<typeof organizationDashboard>
  | { readonly to: '/dashboard' }
  | { readonly to: '/onboarding' }
  | { readonly to: '/organization' };

/**
 * `/` resolver (dual-URL, research/11 §3.3): reads deployment mode + active org
 * from `me/context` (JWT-backed session context).
 */
export async function resolveRootRedirect(): Promise<RootRedirect> {
  const ctx = await ensureSessionContext();
  const target = resolveRootTarget(ctx);
  if (target.to === '/onboarding') return { to: '/onboarding' } as const;
  if (target.to === '/dashboard') return { to: '/dashboard' } as const;
  if (target.to === '/organization') return { to: '/organization' } as const;
  return organizationDashboard(target.params.organizationSlug);
}
