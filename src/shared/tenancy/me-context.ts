import { z } from 'zod';

import { API_BASE_PATH } from '@/core/config/constants.ts';
import { apiClient } from '@/core/http/fetch-client.ts';
import { isoDateString, publicId } from '@/core/types/wire.ts';

import {
  type DeploymentFlags,
  mergeDeploymentFlags,
  parseDeploymentFlagsFromUserWire,
  userDeploymentFlagsWire,
} from './deployment-mode.ts';

// ── Wire schemas (snake_case — mirror the core-be serializers) ──────────────
// core-be #795 removed the per-org `capabilities` object. The app gates UI by
// `my_permissions` (RBAC) + an explicit team-org guard (useCan teamOrganizationOnly).
export const organizationWire = z.object({
  id: publicId('org'),
  name: z.string(),
  slug: z.string().nullable(),
  type: z.enum(['PERSONAL', 'TEAM']),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']),
  logo_url: z.string().nullable(),
  brand_color: z.string().nullable().optional(),
  created_at: isoDateString,
  updated_at: isoDateString,
});

const userWire = z.object({
  id: publicId('usr'),
  email: z.string(),
  is_email_verified: z.boolean(),
  is_mfa_enabled: z.boolean(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  job_title: z.string().nullable().optional(),
  avatar_url: z.string().nullable(),
  status: z.enum(['ACTIVE', 'LOCKED', 'SUSPENDED']),
  /** Whether the user has finished the onboarding wizard. Optional for
   * backward-compat with an older backend — absent is treated as onboarded so a
   * version skew never traps existing users in onboarding. */
  onboarding_completed: z.boolean().optional(),
  created_at: isoDateString,
  updated_at: isoDateString,
  /** Deployment flags — NOT per-org capabilities (those are ignored on org wire). */
  capabilities: userDeploymentFlagsWire,
  personal_organization_id: publicId('org').nullable().optional(),
  personal_organizations: z.boolean().optional(),
  team_organizations: z.boolean().optional(),
});

/** Wire shape of the `GET /auth/me/context` response `data` (snake_case). */
export const meContextWire = z.object({
  user: userWire,
  active_organization: organizationWire.nullable(),
  // Permission codes are kept as plain strings — forward-compatible with new
  // codes the FE enum may not yet know (RBAC matches by string membership).
  my_permissions: z.array(z.string()),
  global_role: z.enum(['super_admin', 'user']).nullable(),
});
export type MeContextWire = z.infer<typeof meContextWire>;

// ── Camel-cased domain types (what the app consumes) ────────────────────────
export type OrganizationType = 'PERSONAL' | 'TEAM';
export type OrganizationStatusValue = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
export type GlobalRole = 'super_admin' | 'user';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string | null;
  type: OrganizationType;
  status: OrganizationStatusValue;
  logoUrl: string | null;
  /** Optional per-org accent (hex/oklch) → `--color-brand` (FE-57); absent until the backend sends it. */
  brandColor?: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface MeUser {
  id: string;
  email: string;
  isEmailVerified: boolean;
  isMfaEnabled: boolean;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  avatarUrl: string | null;
  status: 'ACTIVE' | 'LOCKED' | 'SUSPENDED';
  /** Whether the user has finished the onboarding wizard (drives post-login routing). */
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface MeContext {
  user: MeUser;
  activeOrganization: OrganizationSummary | null;
  myPermissions: string[];
  globalRole: GlobalRole | null;
  /** Deployment-wide toggles (personal / team orgs enabled for this install). */
  deploymentFlags: DeploymentFlags;
  /** User's personal workspace id when personal orgs are enabled. */
  personalOrganizationId: string | null;
}

export function toOrganization(w: z.infer<typeof organizationWire>): OrganizationSummary {
  return {
    id: w.id,
    name: w.name,
    slug: w.slug,
    type: w.type,
    status: w.status,
    logoUrl: w.logo_url,
    brandColor: w.brand_color ?? null,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

/** Map the validated wire payload to the camel-cased {@link MeContext}. */
export function toMeContext(wire: MeContextWire): MeContext {
  const deploymentFlags = mergeDeploymentFlags(
    parseDeploymentFlagsFromUserWire(wire.user),
  );
  return {
    user: {
      id: wire.user.id,
      email: wire.user.email,
      isEmailVerified: wire.user.is_email_verified,
      isMfaEnabled: wire.user.is_mfa_enabled,
      firstName: wire.user.first_name,
      lastName: wire.user.last_name,
      jobTitle: wire.user.job_title ?? null,
      avatarUrl: wire.user.avatar_url,
      status: wire.user.status,
      // Absent (older backend) → treat as onboarded so a version skew can't trap
      // an existing user in the wizard.
      onboardingCompleted: wire.user.onboarding_completed ?? true,
      createdAt: wire.user.created_at,
      updatedAt: wire.user.updated_at,
    },
    activeOrganization: wire.active_organization
      ? toOrganization(wire.active_organization)
      : null,
    myPermissions: wire.my_permissions,
    globalRole: wire.global_role,
    deploymentFlags,
    personalOrganizationId: wire.user.personal_organization_id ?? null,
  };
}

/**
 * True until the user finishes the onboarding wizard. Driven by the backend
 * `onboarding_completed` flag (not workspace presence) so EVERY fresh user is
 * routed through onboarding once — personal deployments auto-provision a personal
 * org at signup, which previously made those users skip onboarding entirely. Only
 * the wizard *steps* differ by deployment mode; whether onboarding happens does not.
 */
export function needsOnboarding(ctx: MeContext): boolean {
  return !ctx.user.onboardingCompleted;
}

/** React Query key for the caller's session context (`GET /auth/me/context`). */
export const meContextQueryKey = ['auth', 'me-context'] as const;

/**
 * The single authoritative read of the caller's session context: user, active
 * organization (+ status), resolved permissions, global role, and
 * the org-switcher list. Powers boot hydration, the post-auth resolver, RBAC,
 * and nav visibility. Re-fetch on cold boot; after an org switch the switch
 * endpoint already returns the active-org delta (no extra call needed).
 */
export async function fetchMeContext(): Promise<MeContext> {
  const res = await apiClient.get<unknown>(`${API_BASE_PATH}/auth/me/context`);
  return toMeContext(meContextWire.parse(res.data));
}
