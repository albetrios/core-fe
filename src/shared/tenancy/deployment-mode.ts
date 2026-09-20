/**
 * Deployment-mode flags — **not** per-org capabilities (those were removed in
 * core-be #795). These two booleans describe what the **deployment** supports:
 * personal workspaces and/or team organizations.
 *
 * **Phase 0 wire (locked from `docs/reference/api/core-be-sample-responses.json`):**
 * `GET /auth/me/context` → `user.capabilities.personal_organizations` and
 * `user.capabilities.team_organizations`, plus `user.personal_organization_id`.
 * Per-org `active_organization.capabilities` may still appear on the wire but
 * is intentionally **not parsed** by the FE.
 */
import { z } from 'zod';

/** Deployment-wide toggles (camelCase domain shape). */
export interface DeploymentFlags {
  personalOrganizations: boolean;
  teamOrganizations: boolean;
}

export type DeploymentMode = 'personal-only' | 'team-only' | 'personal-and-team';

/** Wire: nested deployment flags on `user` (ignore org-level capabilities). */
export const userDeploymentFlagsWire = z
  .object({
    /** Plural — documented wire shape in sample responses. */
    personal_organizations: z.boolean().optional(),
    /** Singular — live core-be serializer alias (2026-06). */
    personal_organization: z.boolean().optional(),
    team_organizations: z.boolean().optional(),
  })
  .optional();

/** Defaults when the backend omits flags (backward compatible — both enabled). */
export const DEFAULT_DEPLOYMENT_FLAGS: DeploymentFlags = {
  personalOrganizations: true,
  teamOrganizations: true,
};

type DeploymentFlagsUserWire = {
  capabilities?: {
    personal_organizations?: boolean;
    /** Live core-be alias — maps to personalOrganizations. */
    personal_organization?: boolean;
    team_organizations?: boolean;
  };
  personal_organizations?: boolean;
  team_organizations?: boolean;
};

/**
 * Parse deployment flags from a me/context `user` wire object. Accepts the
 * nested `capabilities` object **or** top-level booleans for forward compatibility.
 */
export function parseDeploymentFlagsFromUserWire(
  user: DeploymentFlagsUserWire,
): DeploymentFlags {
  const nested = user.capabilities;
  return {
    personalOrganizations:
      nested?.personal_organizations ??
      nested?.personal_organization ??
      user.personal_organizations ??
      DEFAULT_DEPLOYMENT_FLAGS.personalOrganizations,
    teamOrganizations:
      nested?.team_organizations ??
      user.team_organizations ??
      DEFAULT_DEPLOYMENT_FLAGS.teamOrganizations,
  };
}

/** Derive the three product modes from the two deployment booleans. */
export function resolveDeploymentMode(flags: DeploymentFlags): DeploymentMode {
  if (flags.personalOrganizations && !flags.teamOrganizations) return 'personal-only';
  if (!flags.personalOrganizations && flags.teamOrganizations) return 'team-only';
  return 'personal-and-team';
}

export function shouldShowOrganizationSwitcher(flags: DeploymentFlags): boolean {
  // Personal-only is a single implicit workspace — no switcher. Team deployments
  // (team-only and personal-and-team) always expose team org selection.
  return flags.teamOrganizations;
}

/** True when the deployment is a single implicit account scope (no org/product framing). */
export function isPersonalOnlyDeployment(flags: DeploymentFlags): boolean {
  return resolveDeploymentMode(flags) === 'personal-only';
}

export function shouldAllowCreateTeam(flags: DeploymentFlags): boolean {
  return flags.teamOrganizations;
}

/** Optional env overrides: `null` = defer to API. */
export type DeploymentEnvOverrides = {
  personalOrganizations: boolean | null;
  teamOrganizations: boolean | null;
};

/** Apply optional env overrides on top of API-derived deployment flags. */
export function mergeDeploymentFlags(
  apiFlags: DeploymentFlags,
  overrides?: DeploymentEnvOverrides,
): DeploymentFlags {
  if (!overrides) return apiFlags;
  return {
    personalOrganizations:
      overrides.personalOrganizations ?? apiFlags.personalOrganizations,
    teamOrganizations: overrides.teamOrganizations ?? apiFlags.teamOrganizations,
  };
}
