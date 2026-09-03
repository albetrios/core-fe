import { create } from 'zustand';

import type { OrganizationPermission } from '@/core/rbac/policies.ts';
import type { DeploymentFlags } from '@/shared/tenancy/deployment-mode.ts';
import { DEFAULT_DEPLOYMENT_FLAGS } from '@/shared/tenancy/deployment-mode.ts';
import type {
  OrganizationSummary,
  OrganizationType,
} from '@/shared/tenancy/me-context.ts';

/** Map the me/context org status (uppercase) to the store's lowercase enum. */
function toStoreStatus(org: OrganizationSummary | null): 'active' | 'suspended' | null {
  if (!org) return null;
  return org.status === 'ACTIVE' ? 'active' : 'suspended';
}

interface OrganizationStore {
  organizationId: string | null;
  organizationSlug: string | null;
  /** Organization status from the membership response. */
  organizationStatus: 'active' | 'suspended' | null;
  /** Active organization type (PERSONAL vs TEAM) — gates team-only UI. */
  organizationType: OrganizationType | null;
  /** Org-scoped permission codes the user holds in the active organization. */
  permissions: OrganizationPermission[];
  /**
   * Whether {@link permissions} is an ANSWER or just the empty default. The
   * guard chain populates it a beat after the route renders, and an empty list
   * that means "we do not know yet" is indistinguishable from "you may do
   * nothing" — which is why gated controls appeared a moment late (SET-23).
   */
  permissionsResolved: boolean;
  /** Deployment-wide personal/team toggles (from me/context). */
  deploymentFlags: DeploymentFlags;
  personalOrganizationId: string | null;

  setOrganization: (id: string, slug: string, status?: 'active' | 'suspended') => void;
  /** Derive the full active-org context from me/context (the canonical source). */
  setActiveOrganization: (
    org: OrganizationSummary | null,
    permissions: OrganizationPermission[],
  ) => void;
  setDeploymentContext: (
    flags: DeploymentFlags,
    personalOrganizationId: string | null,
  ) => void;
  /** Replace the active org's permission set (from the membership response). */
  setPermissions: (permissions: OrganizationPermission[]) => void;
  /** Drop the current set and mark it unresolved (an org switch is starting). */
  clearPermissions: () => void;
  clearOrganization: () => void;
}

/**
 * Derived cache of organization context (canonical value: the URL) (active organization + its
 * permissions).
 *
 * Accessible outside React via `useOrganizationStore.getState()` — used by the HTTP
 * RBAC
 * guards to resolve org-scoped permissions.
 */
export const useOrganizationStore = create<OrganizationStore>((set) => ({
  organizationId: null,
  organizationSlug: null,
  organizationStatus: null,
  organizationType: null,
  permissions: [],
  permissionsResolved: false,
  deploymentFlags: DEFAULT_DEPLOYMENT_FLAGS,
  personalOrganizationId: null,

  setActiveOrganization: (org, permissions) =>
    set({
      organizationId: org?.id ?? null,
      organizationSlug: org?.slug ?? null,
      organizationStatus: toStoreStatus(org),
      organizationType: org?.type ?? null,
      permissions,
      permissionsResolved: true,
    }),

  setDeploymentContext: (deploymentFlags, personalOrganizationId) =>
    set({ deploymentFlags, personalOrganizationId }),

  setOrganization: (organizationId, organizationSlug, organizationStatus) =>
    set({
      organizationId,
      organizationSlug,
      organizationStatus: organizationStatus ?? null,
    }),
  setPermissions: (permissions) => set({ permissions, permissionsResolved: true }),
  clearPermissions: () => set({ permissions: [], permissionsResolved: false }),
  clearOrganization: () =>
    set({
      organizationId: null,
      organizationSlug: null,
      organizationStatus: null,
      organizationType: null,
      permissions: [],
      permissionsResolved: false,
      deploymentFlags: DEFAULT_DEPLOYMENT_FLAGS,
      personalOrganizationId: null,
    }),
}));
