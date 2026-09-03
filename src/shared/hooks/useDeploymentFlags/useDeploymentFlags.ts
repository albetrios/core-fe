import { platformConfig } from '@/core/config/env.ts';
import { useMeContext } from '@/shared/hooks/useMeContext/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import {
  type DeploymentFlags,
  type DeploymentMode,
  mergeDeploymentFlags,
  resolveDeploymentMode,
} from '@/shared/tenancy/deployment-mode.ts';

/** Deployment flags plus whether they come from loaded session context. */
export interface DeploymentFlagsState {
  flags: DeploymentFlags;
  /**
   * `true` once the flags are backed by resolved `me/context` (or pinned
   * outright by env overrides). While `false`, {@link DeploymentFlagsState.flags}
   * is the permissive `DEFAULT_DEPLOYMENT_FLAGS` fallback — a *guess*, and never
   * a safe basis for a decision the user can see (house rule 4).
   */
  ready: boolean;
}

/** Both flags pinned by env: nothing about the answer waits on the network. */
function overridesArePinned(): boolean {
  const o = platformConfig.deploymentOverrides;
  return !!o && o.personalOrganizations !== null && o.teamOrganizations !== null;
}

/**
 * Effective deployment flags **with their provenance**.
 *
 * The plain {@link useDeploymentFlags} cannot distinguish "personal-and-team"
 * from "we have not been told yet" — both read as the permissive default. Any
 * caller whose output the user *sees change* must branch on `ready` instead, or
 * it renders one answer and then swaps to another (SHELL-1).
 */
export function useDeploymentFlagsState(): DeploymentFlagsState {
  const storeFlags = useOrganizationStore((s) => s.deploymentFlags);
  const { data: ctx, isSuccess } = useMeContext();
  return {
    flags: mergeDeploymentFlags(
      ctx?.deploymentFlags ?? storeFlags,
      platformConfig.deploymentOverrides,
    ),
    // `isSuccess` alone is not enough: a cache seeded by `hydrateSessionContext`
    // during auth bootstrap has data before this observer's first fetch settles.
    ready: overridesArePinned() || isSuccess || ctx !== undefined,
  };
}

/**
 * Effective deployment flags — me/context when loaded, else the derived store.
 * Read this only where the fallback is harmless (copy, an optional affordance).
 */
export function useDeploymentFlags(): DeploymentFlags {
  return useDeploymentFlagsState().flags;
}

export function useDeploymentMode(): DeploymentMode {
  return resolveDeploymentMode(useDeploymentFlags());
}
