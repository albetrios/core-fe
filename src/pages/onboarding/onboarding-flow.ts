import {
  ONBOARDING_STEPS,
  type OnboardingStep,
} from '@/shared/store/useOnboardingStore/index.ts';
import {
  type DeploymentFlags,
  resolveDeploymentMode,
} from '@/shared/tenancy/deployment-mode.ts';
import type { MeContext } from '@/shared/tenancy/me-context.ts';
import { createOrganizationSchema } from '@/shared/tenancy/my-organizations.ts';

export type { OnboardingStep };

function hasTeamOrganization(ctx: MeContext): boolean {
  return ctx.organizations.some((o) => o.type === 'TEAM');
}

/**
 * Steps shown for this deployment mode + current org inventory.
 *
 * `ctx` is deliberately NOT nullable. The step list, the create-an-org decision
 * and the finish destination are all derived from it, and `useDeploymentFlags`
 * falls back to the permissive `DEFAULT_DEPLOYMENT_FLAGS` when me/context is
 * missing — so an absent context silently produced a DIFFERENT, shorter flow
 * that the user could still complete. A runtime gate in the page prevented that,
 * but nothing stopped the next caller from skipping the gate (ONB-9). Requiring
 * a loaded context here makes that a compile error instead of a latent bug.
 */
export function deriveOnboardingSteps(
  flags: DeploymentFlags,
  ctx: MeContext,
): readonly OnboardingStep[] {
  const mode = resolveDeploymentMode(flags);
  const hasTeam = hasTeamOrganization(ctx);

  const steps: OnboardingStep[] = ['welcome', 'profile', 'questions'];

  if (mode === 'team-only') steps.push('workspace');

  if (mode === 'team-only' || (mode === 'personal-and-team' && hasTeam)) {
    steps.push('invite');
  }

  steps.push('done');
  return steps;
}

/**
 * Whether the finish step should create a team org via API.
 *
 * Takes the loaded context for the same reason {@link deriveOnboardingSteps}
 * does — this decision is only meaningful against a context we actually have,
 * and the type is what enforces it (ONB-9).
 */
export function shouldCreateOrganizationOnFinish(
  flags: DeploymentFlags,
  _ctx: MeContext,
): boolean {
  const mode = resolveDeploymentMode(flags);
  if (mode === 'personal-only') return false;
  if (mode === 'team-only') return true;
  // Both: personal workspace is auto-provisioned on signup; team orgs are created
  // later from the organization switcher.
  return false;
}

export function clampStepIndex(index: number, steps: readonly OnboardingStep[]): number {
  return Math.min(Math.max(index, 0), Math.max(steps.length - 1, 0));
}

export function stepAtIndex(
  index: number,
  steps: readonly OnboardingStep[],
): OnboardingStep {
  const clamped = clampStepIndex(index, steps);
  return steps[clamped] ?? ONBOARDING_STEPS[0] ?? 'welcome';
}

/**
 * Whether the typed workspace slug is one `createOrganization` will accept.
 *
 * Deliberately the SAME schema the create call parses with, so the wizard cannot
 * drift from the API it submits to. An empty slug is valid — the backend derives
 * one from the name — which is why this is not just `safeParse`.
 *
 * Shared by the Continue gate and the field's inline message so a user is never
 * blocked by a rule they cannot see (ONB-6).
 */
export function isValidWorkspaceSlug(slug: string): boolean {
  const value = slug.trim();
  if (value.length === 0) return true;
  return createOrganizationSchema.shape.slug.safeParse(value).success;
}
