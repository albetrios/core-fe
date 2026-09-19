import { useMemo } from 'react';

import { hasPermission, type OrganizationPermission } from '@/core/rbac/policies.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

/** A UI access requirement: an org-scoped permission and/or a team-org guard. */
export interface AccessCheck {
  /** Org-scoped permission the user must hold in the active org. */
  permission?: OrganizationPermission;
  /**
   * Require a TEAM organization — a personal org is blocked. The explicit
   * personal-vs-team guard that replaced the removed per-org `capabilities` object.
   */
  teamOrganizationOnly?: boolean;
  /** Require team organizations to be enabled on this deployment. */
  requiresTeamOrganizations?: boolean;
}

function passes(
  check: AccessCheck,
  user: ReturnType<typeof useAuthStore.getState>['user'],
  permissions: ReturnType<typeof useOrganizationStore.getState>['permissions'],
  organizationType: ReturnType<typeof useOrganizationStore.getState>['organizationType'],
  deploymentFlags: ReturnType<typeof useOrganizationStore.getState>['deploymentFlags'],
): boolean {
  const permissionOk =
    !check.permission ||
    (!!user && hasPermission({ role: user.role, permissions }, check.permission));
  const teamOk = !check.teamOrganizationOnly || organizationType === 'TEAM';
  const deploymentTeamOk =
    !check.requiresTeamOrganizations || deploymentFlags.teamOrganizations;
  return permissionOk && teamOk && deploymentTeamOk;
}

/**
 * Reactive access check for conditional UI. True when **every** supplied
 * requirement is met (AND); permissive with no requirement. This is the UI half
 * of authorization (defense-in-depth) — the route gates (core/security) and the
 * API remain the authoritative boundary.
 */
export function useCan(check: AccessCheck): boolean {
  const user = useAuthStore((s) => s.user);
  const permissions = useOrganizationStore((s) => s.permissions);
  const organizationType = useOrganizationStore((s) => s.organizationType);
  const deploymentFlags = useOrganizationStore((s) => s.deploymentFlags);
  return passes(check, user, permissions, organizationType, deploymentFlags);
}

/**
 * Whether the permission set is an answer yet. `useCan` is synchronous and the
 * guard chain fills the store a beat after the route renders, so a `false` from
 * `useCan` can mean "not allowed" OR "not known yet" — and a control that is
 * hidden for the second reason pops in a moment later (SET-23). Gate the
 * placeholder on this, not on `useCan`.
 */
export function useAccessResolved(): boolean {
  return useOrganizationStore((s) => s.permissionsResolved);
}

/**
 * Filter a list (nav items, settings sections, …) to those the current user may
 * see. Reads the stores once and checks inline — safe for any array length.
 */
export function useVisibleNav<T extends AccessCheck>(items: readonly T[]): T[] {
  const user = useAuthStore((s) => s.user);
  const permissions = useOrganizationStore((s) => s.permissions);
  const organizationType = useOrganizationStore((s) => s.organizationType);
  const deploymentFlags = useOrganizationStore((s) => s.deploymentFlags);
  // Memoised on the slices it actually reads. `.filter()` builds a new array on
  // every render, and this one is handed to every shell variant as a prop — so
  // an unmemoised result silently defeats any `React.memo` placed on the shell
  // subtree later, and re-renders the whole nav on unrelated state changes
  // (SHELL-11). The only production caller passes a module-level constant, so
  // `items` is referentially stable and the memo actually holds.
  return useMemo(
    () =>
      items.filter((item) =>
        passes(item, user, permissions, organizationType, deploymentFlags),
      ),
    [items, user, permissions, organizationType, deploymentFlags],
  );
}
