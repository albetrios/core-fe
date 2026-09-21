import type { UseQueryResult } from '@tanstack/react-query';
import { useNavigate, useRouterState, useSearch } from '@tanstack/react-router';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { queryClient } from '@/core/http/queryClient.ts';
import i18n from '@/lib/i18n/i18n.ts';
import { ANALYTICS_EVENTS } from '@/shared/analytics/analytics.constants.ts';
import { captureAnalyticsEvent } from '@/shared/analytics/capture.ts';
import { authApi } from '@/shared/api/auth-api.ts';
import { createRole, inviteMember, listRoles } from '@/shared/api/organization-api.ts';
import { isSafeRedirectPath } from '@/shared/auth/redirect-safety.ts';
import { getAccessToken } from '@/shared/auth/token.ts';
import { QueryBoundary } from '@/shared/components/QueryBoundary/index.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
import { SectionErrorBoundary } from '@/shared/components/WidgetErrorBoundary/index.ts';
import { reportError } from '@/shared/errors/errorHandler.ts';
import { mapFrontendError } from '@/shared/errors/map-frontend-error.ts';
import { FormError } from '@/shared/forms/FormError/index.ts';
import { useDeploymentFlags } from '@/shared/hooks/useDeploymentFlags/index.ts';
import { useMeContext } from '@/shared/hooks/useMeContext/index.ts';
import { useUnsavedChangesGuard } from '@/shared/hooks/useUnsavedChangesGuard/index.ts';
import { Loader } from '@/shared/icons/index.ts';
import { notify } from '@/shared/notify/index.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOnboardingStore } from '@/shared/store/useOnboardingStore/index.ts';
import type { MeContext } from '@/shared/tenancy/me-context.ts';
import {
  createOrganization,
  listMyOrganizations,
  type Organization,
} from '@/shared/tenancy/my-organizations.ts';
import { resolveRootTarget } from '@/shared/tenancy/organization-resolver.ts';
import { hydrateSessionContext } from '@/shared/tenancy/session-context.ts';
import { switchToOrganization, switchToPersonal } from '@/shared/tenancy/switch.ts';

import { DoneStep } from './components/DoneStep/index.ts';
import { InviteStep } from './components/InviteStep/index.ts';
import { ProfileStep } from './components/ProfileStep/index.ts';
import { QuestionsStep } from './components/QuestionsStep/index.ts';
import { StepIndicator } from './components/StepIndicator/index.ts';
import { WelcomeStep } from './components/WelcomeStep/index.ts';
import { WorkspaceStep } from './components/WorkspaceStep/index.ts';
import { useOnboardingStepMotion } from './hooks/useOnboardingStepMotion/index.ts';
import {
  ONBOARDING_DEFAULT_MEMBER_PERMISSIONS,
  ONBOARDING_KEYS,
  ONBOARDING_NS,
  ONBOARDING_TEST_IDS,
} from './onboarding.constants.ts';
import type { OnboardingSearch } from './onboarding.search.ts';
import {
  clampStepIndex,
  deriveOnboardingSteps,
  isValidWorkspaceSlug,
  type OnboardingStep,
  shouldCreateOrganizationOnFinish,
  stepAtIndex,
} from './onboarding-flow.ts';

/** Step list used while me/context has not loaded — nothing is rendered from it. */
const EMPTY_STEPS: readonly OnboardingStep[] = [];

/**
 * How long a just-read organization list counts as fresh inside the finish path.
 *
 * Long enough that the stale-created-org effect and `resolveOrganizationForFinish`
 * share one response a moment later; short enough that a list read in an earlier
 * session is never trusted to decide whether the created org still exists.
 */
const ORGANIZATIONS_STALE_MS = 10_000;

/**
 * Read the user's organizations THROUGH the query cache.
 *
 * `listMyOrganizations()` was called bare from two places on the finish path —
 * the stale-created-org effect and `resolveOrganizationForFinish` — so a resumed
 * session fetched the identical list twice, back to back, and neither response
 * reached the cache the picker and Settings read from (ONB-10). `query()`
 * under the SAME `['organizations']` key collapses those two into one request
 * and leaves the result where the next screen can use it.
 *
 * `staleTime` rather than `ensureQueryData`: this list decides whether a
 * persisted created-org id still exists, and answering that from an arbitrarily
 * old cache entry would drop a real organization and create a duplicate.
 */
function readMyOrganizations(): Promise<Organization[]> {
  return queryClient.query({
    queryKey: ['organizations'],
    queryFn: listMyOrganizations,
    staleTime: ORGANIZATIONS_STALE_MS,
  });
}

function getStepMetaKeys(step: OnboardingStep): {
  title: string;
  description: string;
} {
  switch (step) {
    case 'profile':
      return ONBOARDING_KEYS.steps.profile;
    case 'questions':
      return ONBOARDING_KEYS.steps.questions;
    case 'workspace':
      return ONBOARDING_KEYS.steps.workspace;
    case 'invite':
      return ONBOARDING_KEYS.steps.invite;
    case 'done':
      return ONBOARDING_KEYS.steps.done;
    default:
      return ONBOARDING_KEYS.steps.welcome;
  }
}

/**
 * Persist the collected profile + fire a segmentation event. Best-effort by
 * contract — every failure is swallowed so it can never strand the user on
 * the onboarding screen. The survey answers are analytics only (not PII we
 * store server-side); first + last name update the user's profile.
 */
async function persistOnboardingResult(input: {
  firstName: string;
  lastName: string;
  teamSize: string;
  primaryUseCase: string;
  referralSource: string;
  invitedCount: number;
}): Promise<void> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const token = getAccessToken();
  if (token && (firstName || lastName)) {
    try {
      await authApi.updateProfile(
        { firstName: firstName || undefined, lastName: lastName || undefined },
        token,
      );
      const user = useAuthStore.getState().user;
      const displayName = [firstName, lastName].filter(Boolean).join(' ');
      if (user && displayName) {
        useAuthStore.getState().setUser({ ...user, name: displayName });
      }
    } catch (error) {
      /*
       * Best-effort by design — a failed profile PATCH must never strand the
       * wizard. Best-effort is not the same as invisible though: the user's name
       * silently failed to save and the dashboard then greeted them by their
       * email prefix, with nothing anywhere to say why (ONB-11).
       *
       * So: reported for us, and said out loud to the user. A warning, not an
       * error — onboarding itself succeeded and the fix is one visit to
       * Settings, which the toast names.
       */
      reportError(error, { scope: 'onboarding.persistProfile' });
      notify.warning(
        i18n.t(ONBOARDING_KEYS.toast.profileSaveFailed, { ns: ONBOARDING_NS }),
        {
          id: 'onboarding-profile-save',
        },
      );
    }
  }

  captureAnalyticsEvent(ANALYTICS_EVENTS.onboardingCompleted, {
    team_size: input.teamSize || undefined,
    primary_use_case: input.primaryUseCase || undefined,
    referral_source: input.referralSource || undefined,
    invited_count: input.invitedCount,
  });
}

async function resolveOrganizationForFinish(input: {
  needsCreate: boolean;
  createdOrganizationId: string | null;
  createdOrganizationSlug: string | null;
  organizationName: string;
  organizationSlugField: string;
  setCreatedOrganizationId: (id: string | null) => void;
  setCreatedOrganizationSlug: (slug: string | null) => void;
}): Promise<{ organizationId: string | null; organizationSlug: string | null }> {
  let organizationSlug = input.createdOrganizationSlug;
  let organizationId = input.createdOrganizationId;

  if (organizationId) {
    const organizations = await readMyOrganizations();
    const existing = organizations.find((o) => o.id === organizationId);
    if (!existing) {
      organizationId = null;
      organizationSlug = null;
      input.setCreatedOrganizationId(null);
      input.setCreatedOrganizationSlug(null);
    } else {
      organizationSlug = existing.slug;
    }
  }

  if (input.needsCreate && !organizationId) {
    const org = await createOrganization({
      name:
        input.organizationName.trim() ||
        i18n.t(ONBOARDING_KEYS.defaults.organizationName, { ns: ONBOARDING_NS }),
      slug: input.organizationSlugField.trim() || undefined,
    });
    organizationSlug = org.slug;
    organizationId = org.id;
    input.setCreatedOrganizationId(org.id);
    input.setCreatedOrganizationSlug(org.slug);
    /*
     * Keep the cache honest about an org WE just created.
     *
     * The existence check above reads `['organizations']` through the cache
     * (ONB-10), and its window can now span this create — a retry after a
     * partial failure would otherwise be told the org does not exist, drop the
     * stored id and create a SECOND workspace. Appending here means the next
     * read inside that window sees the truth; the finish path still invalidates
     * the key for real once it is done.
     */
    queryClient.setQueryData<Organization[]>(['organizations'], (previous) =>
      previous ? [...previous, org] : previous,
    );
  }

  return { organizationId, organizationSlug };
}

async function refreshSessionAfterOnboardingFinish(): Promise<MeContext> {
  return hydrateSessionContext();
}

/**
 * Primitives rather than the `data` object: the caller selects these fields
 * individually so a keystroke elsewhere in the wizard does not re-render the
 * page (ONB-13), and passing the object back would undo that.
 */
function isOnboardingDirty(input: {
  completed: boolean;
  stepIndex: number;
  firstName: string;
  lastName: string;
  organizationName: string;
  inviteCount: number;
}): boolean {
  if (input.completed) return false;
  if (input.stepIndex > 0) return true;
  return Boolean(
    input.firstName.trim() ||
    input.lastName.trim() ||
    input.organizationName.trim() ||
    input.inviteCount > 0,
  );
}

/**
 * Activate the workspace the user just finished onboarding into and return the
 * post-switch context (active org applied). Switching re-mints the token and
 * writes `activeOrganization` into the me/context cache, so the returned context
 * is what the destination resolver should read.
 *
 * When the wizard created nothing, an EXISTING sole team membership outranks
 * the personal fallback: an invited (or pre-provisioned) user finishing the
 * wizard was brought here to join that team — landing them on Personal hides
 * the very workspace they came for. With several teams no single one is the
 * obvious destination, so fall back to personal; the dashboard switcher lists
 * them all.
 *
 * Gate the personal switch on the concrete `personalOrganizationId`, not the
 * deployment flag: personal orgs can be *enabled* yet unprovisioned for a user
 * (core-be self-heals this, but the FE stays defensive), in which case
 * `switch-to-personal` would 404 and trap onboarding. No workspace → return
 * `undefined` and let the caller defer to the `/` resolver.
 */
async function activateWorkspaceAfterOnboardingFinish(input: {
  organizationId: string | null;
  personalOrganizationId: string | null;
  organizations: MeContext['organizations'];
}): Promise<MeContext | undefined> {
  if (input.organizationId) {
    return switchToOrganization(input.organizationId);
  }
  const activeTeams = input.organizations.filter(
    (o) => o.type === 'TEAM' && o.status === 'ACTIVE',
  );
  const soleTeam = activeTeams.length === 1 ? activeTeams[0] : undefined;
  if (soleTeam) {
    return switchToOrganization(soleTeam.id);
  }
  if (input.personalOrganizationId) {
    return switchToPersonal();
  }
  return undefined;
}

/**
 * The organization onboarding invites must be created in: the workspace that was
 * just ACTIVATED, not the one the wizard created.
 *
 * Invites are scoped by the active-org token, but the send used to be gated on
 * the *created* org id. In `personal-and-team` mode with an existing team the
 * wizard creates nothing (`shouldCreateOrganizationOnFinish` -> false) while
 * `deriveOnboardingSteps` still shows the invite step, so that id was null:
 * every invite was dropped and the success toast still told the user their
 * workspace was ready. Reading the activated org makes the two agree.
 *
 * Only a TEAM org can hold invited members, so an activation that landed on a
 * personal workspace (several teams -> no unambiguous destination) is NOT an
 * invite target; the caller reports that through the partial-failure warning
 * rather than a success toast that lies.
 */
function resolveInviteTargetOrganizationId(input: {
  activeOrganization: MeContext['activeOrganization'] | undefined;
  createdOrganizationId: string | null;
}): string | null {
  const active = input.activeOrganization;
  if (active?.type === 'TEAM') return active.id;
  return input.createdOrganizationId;
}

/**
 * An assignable (non-Owner) role id for onboarding invites. A freshly created
 * org seeds only the system **Owner** role (core-be), so there is nothing to
 * invite anyone *as*: reuse an existing non-system role if the org already has
 * one, otherwise provision a default "Member" role. Scoped by the active-org
 * token, so the caller must switch to the new org first.
 */
async function resolveInviteRoleId(): Promise<string> {
  const { rows } = await listRoles();
  const existing = rows.find((role) => !role.isSystem);
  if (existing) return existing.id;

  const created = await createRole({
    name: i18n.t(ONBOARDING_KEYS.defaults.memberRoleName, { ns: ONBOARDING_NS }),
    description: i18n.t(ONBOARDING_KEYS.defaults.memberRoleDescription, {
      ns: ONBOARDING_NS,
    }),
    permissions: [...ONBOARDING_DEFAULT_MEMBER_PERMISSIONS],
  });
  return created.id;
}

/**
 * Send onboarding invites: create an INVITED membership per email
 * (`POST /organization/memberships` with a real `role_id`), all into one
 * resolved role. Returns how many failed. Best-effort and non-blocking — a
 * failure (including not being able to provision a role) never strands the
 * wizard; the caller warns on partial failure and the user can resend from
 * Members. Must run AFTER the token has switched to the new org.
 */
async function sendOnboardingInvites(emails: string[]): Promise<number> {
  if (emails.length === 0) return 0;

  let roleId: string;
  try {
    roleId = await resolveInviteRoleId();
  } catch {
    return emails.length;
  }

  const results = await Promise.allSettled(
    emails.map((email) => inviteMember({ email, roleId })),
  );
  return results.filter((result) => result.status === 'rejected').length;
}

/**
 * Land the user directly on their resolved workspace after onboarding — no hop
 * through the `/` resolver (which would re-fetch me/context and add a second
 * redirect). A safe `?redirect=` deep link (attached by the workspace guards
 * when they bounced the user here) wins over the resolved workspace: it is the
 * page the user originally asked for, and its own guards re-validate
 * membership/status on arrival. Otherwise `resolveRootTarget` is the same
 * decision `/` makes, run on the post-switch context we already hold.
 */
function navigateAfterOnboarding(
  navigate: ReturnType<typeof useNavigate>,
  ctx: MeContext,
  redirectPath?: string,
): void {
  if (redirectPath && isSafeRedirectPath(redirectPath)) {
    void navigate({ to: redirectPath, replace: true });
    return;
  }
  const target = resolveRootTarget(ctx);
  if (target.to === '/organization/$organizationSlug/dashboard') {
    void navigate({ to: target.to, params: target.params, replace: true });
    return;
  }
  if (target.to === '/dashboard' || target.to === '/organization') {
    void navigate({ to: target.to, replace: true });
    return;
  }
  void navigate({ to: '/', replace: true });
}

/** This wizard's own pathname — where a destination guard bounces the user back to. */
const ONBOARDING_PATHNAME = '/onboarding';

/**
 * Release the "already finished" latch once the router has settled back on the
 * wizard.
 *
 * `finishedContextRef` (armed in `OnboardingPage.finish`) makes a repeat click
 * replay the post-finish navigation instead of re-running the writes. That is
 * right for as long as the destination is still resolving — and wrong the moment
 * the destination REFUSES us. When a workspace guard bounces the user back to
 * `/onboarding` (the `completeOnboarding` that answered 200 without sticking,
 * named on the ref) this page is never unmounted, so the latch outlived the
 * navigation it was armed for and every further click replayed a navigation that
 * bounced straight back: the un-finishable wizard again, this time produced by
 * the fix for the duplicate writes.
 *
 * The dependency array is what separates the two cases, and nothing else needs
 * to: an effect re-runs only when its deps CHANGE, and while the post-finish
 * navigation is merely in flight the pathname never leaves `/onboarding`. A
 * second click inside that window therefore still finds the latch armed and
 * still only replays — no duplicate invitations. The latch is dropped only after
 * the router has been somewhere else and come back, which is exactly the bounce.
 */
function useReleaseFinishLatchOnReturn(latchRef: RefObject<MeContext | null>): void {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (pathname === ONBOARDING_PATHNAME) latchRef.current = null;
  }, [pathname, latchRef]);
}

/**
 * Stand-in for the wizard while `me/context` is loading or failed.
 *
 * A step indicator and a Continue button built from a context we do not have
 * would walk the user through the WRONG flow and let them finish it — so the
 * query state is rendered INSTEAD of the wizard, not alongside it.
 * `QueryBoundary` shows a skeleton while pending and a retry that re-runs the
 * query in place on failure, so a transient blip costs one click.
 */
/**
 * Back + Continue/Finish row. `Finish` is the wizard's checkout — it creates the
 * organization, stamps the profile and sends the invites — so `submitting` keeps
 * it visibly disabled while `finish()` holds the synchronous single-flight guard
 * that actually stops a duplicate write.
 */
function WizardActions(props: {
  isFirstStep: boolean;
  isDoneStep: boolean;
  submitting: boolean;
  canProceed: boolean;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  const { t } = useTranslation(ONBOARDING_NS);
  return (
    <div className="flex items-center justify-between">
      <Button
        variant="ghost"
        onClick={props.onBack}
        disabled={props.isFirstStep || props.submitting}
        data-testid={ONBOARDING_TEST_IDS.back}
      >
        {t(ONBOARDING_KEYS.actions.back)}
      </Button>

      {props.isDoneStep ? (
        <Button
          onClick={props.onFinish}
          disabled={props.submitting}
          data-testid={ONBOARDING_TEST_IDS.finish}
        >
          {props.submitting ? (
            <>
              <Loader className="me-2 h-4 w-4 animate-spin" />
              {t(ONBOARDING_KEYS.actions.settingUp)}
            </>
          ) : (
            t(ONBOARDING_KEYS.actions.enterDashboard)
          )}
        </Button>
      ) : (
        <Button
          onClick={props.onNext}
          disabled={!props.canProceed}
          data-testid={ONBOARDING_TEST_IDS.next}
        >
          {t(ONBOARDING_KEYS.actions.continue)}
        </Button>
      )}
    </div>
  );
}

function SessionContextGate({ query }: { query: UseQueryResult<MeContext> }) {
  const { t } = useTranslation(ONBOARDING_NS);
  return (
    <Card className="w-full">
      <CardContent className="py-2" data-testid={ONBOARDING_TEST_IDS.contextGate}>
        <QueryBoundary query={query} errorMessage={t(ONBOARDING_KEYS.session.loadError)}>
          {() => null}
        </QueryBoundary>
      </CardContent>
    </Card>
  );
}

/**
 * `steps` is threaded down rather than re-derived by the children: the summary
 * step needs to know which rows this flow collected, and deriving that a second
 * time from a context the child fetches itself is exactly the hazard ONB-9 is
 * about. The page holds the one derivation, made from a proven-loaded context.
 */
function renderStep(
  step: ReturnType<typeof stepAtIndex>,
  steps: readonly OnboardingStep[],
) {
  switch (step) {
    case 'profile':
      return <ProfileStep />;
    case 'questions':
      return <QuestionsStep />;
    case 'workspace':
      return <WorkspaceStep />;
    case 'invite':
      return <InviteStep />;
    case 'done':
      return <DoneStep steps={steps} />;
    default:
      return <WelcomeStep teamSetupIncluded={steps.includes('workspace')} />;
  }
}

/**
 * Multi-step, resumable onboarding wizard. Progress is persisted in
 * {@link useOnboardingStore}; the final step creates the organization, sends any
 * invitations, and navigates to the new organization's dashboard (the
 * `$organizationSlug` guard syncs context, persists, and loads permissions).
 * Step UIs live in `components/` (folder-per-unit).
 */
export function OnboardingPage() {
  const { t } = useTranslation(ONBOARDING_NS);
  const navigate = useNavigate();
  // Deep link the workspace guards carried here (?redirect=…) — consumed at
  // finish so the user lands on the page they originally asked for. The
  // non-strict search is untyped here; validateOnboardingSearch (routeTree)
  // guarantees `redirect` is a string when present.
  const search: OnboardingSearch = useSearch({ strict: false });
  const redirectSearch = search.redirect;
  /*
   * Slices, not the whole store. `useOnboardingStore()` with no selector
   * subscribes to every field, and `patch` replaces the whole `data` object — so
   * a keystroke in ANY field re-rendered this page, the step indicator and the
   * mounted step, whether or not the page reads that field (ONB-13).
   *
   * Only what the render actually derives from is selected here; the four
   * actions are stable store closures, so the shallow compare on this object is
   * driven purely by the primitives above them. `finish()` reads the full data
   * with `getState()` instead — a submit wants the latest values, not a
   * subscription.
   */
  const {
    stepIndex,
    completed,
    createdOrganizationId,
    createdOrganizationSlug,
    firstName,
    lastName,
    organizationName,
    organizationSlug,
    inviteCount,
    complete,
    setCreatedOrganizationId,
    setCreatedOrganizationSlug,
    setStepIndex,
  } = useOnboardingStore(
    useShallow((s) => ({
      stepIndex: s.stepIndex,
      completed: s.completed,
      createdOrganizationId: s.createdOrganizationId,
      createdOrganizationSlug: s.createdOrganizationSlug,
      firstName: s.data.firstName,
      lastName: s.data.lastName,
      organizationName: s.data.organizationName,
      organizationSlug: s.data.organizationSlug,
      inviteCount: s.data.invites.length,
      complete: s.complete,
      setCreatedOrganizationId: s.setCreatedOrganizationId,
      setCreatedOrganizationSlug: s.setCreatedOrganizationSlug,
      setStepIndex: s.setStepIndex,
    })),
  );
  const meContextQuery = useMeContext();
  const meContext = meContextQuery.data;
  /**
   * Nothing in this wizard is safe to render or submit without a LOADED
   * me/context. The step list, the create-an-org decision and the destination
   * are all derived from it, and `useDeploymentFlags` falls back to the
   * permissive `DEFAULT_DEPLOYMENT_FLAGS` when it is missing — so a failed
   * me/context silently produced a `personal-and-team` flow: no workspace step,
   * no organization created, onboarding still stamped complete, and the user
   * dropped on a personal dashboard the deployment may not even have.
   *
   * `isError` counts even when a stale `data` is still cached (a background
   * refetch that failed): the wizard would otherwise submit against a context
   * we already know is out of date. Wizard progress lives in localStorage, so
   * gating here costs the user nothing but a retry.
   */
  const contextReady =
    !(meContextQuery.isPending || meContextQuery.isError) && Boolean(meContext);
  /*
   * The same fact as `contextReady`, but as a VALUE the type system can narrow.
   * `deriveOnboardingSteps` and `shouldCreateOrganizationOnFinish` now demand a
   * non-null `MeContext`, so every consumer — this page, and any future one —
   * has to prove it holds a loaded context before it can derive a flow. The gate
   * below is still what the user sees; this is what stops the gate from being
   * quietly dropped (ONB-9).
   */
  const loadedContext = contextReady ? meContext : undefined;
  const deploymentFlags = useDeploymentFlags();
  // Derived ONLY from a loaded context — never from the permissive fallback.
  const effectiveSteps = loadedContext
    ? deriveOnboardingSteps(deploymentFlags, loadedContext)
    : EMPTY_STEPS;
  const [submitting, setSubmitting] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  // Synchronous twin of `submitting` — see finish().
  const finishingRef = useRef(false);
  /*
   * The context a SUCCESSFUL finish resolved — doubling as the "this wizard is
   * already done" latch.
   *
   * `finishingRef` only covers the run itself: its `finally` fires the moment
   * `navigateAfterOnboarding` *starts* the navigation, while the destination's
   * guard chain is still awaiting the network. The wizard stays mounted and
   * interactive for that whole stretch, so a second "Enter dashboard" click
   * re-ran the ENTIRE finish. Org creation is idempotent (cached append +
   * existence check), but the profile PATCH, `completeOnboarding`, the org
   * switch, the analytics event and every invitation went out a SECOND time —
   * duplicate invitations, or a spurious "N invites couldn't be sent" warning
   * landing on top of the success toast the user had just read.
   *
   * A ref rather than the store's persisted `completed` flag: `completed`
   * outlives the page in localStorage, so gating on it would permanently
   * dead-end a user whose store says done while `requireOnboardingWorkspace`
   * still routes them here (an account reset server-side, or a
   * `completeOnboarding` that answered 200 without sticking) — the un-finishable
   * wizard the rest of this file works to avoid. Scoped to the mount, the latch
   * covers exactly the window the bug lives in and dies with a remount, where
   * finishing again is the correct behaviour.
   *
   * A remount is not the only way that window can end, though: a destination
   * that bounces the user straight back to `/onboarding` leaves this page
   * mounted with the latch still armed and the wizard un-finishable — so the
   * hook below disarms it when the router settles back here.
   */
  const finishedContextRef = useRef<MeContext | null>(null);
  useReleaseFinishLatchOnReturn(finishedContextRef);
  /*
   * `stepIndex` is persisted in localStorage and is NOT re-clamped when the step
   * list shrinks — which happens when the deployment mode changes, or a team org
   * appears between sessions. `stepAtIndex` clamped for the body, but the
   * indicator and the Back/Continue maths were driven off the raw value, so the
   * dots showed every step done with none current, `aria-current="step"`
   * disappeared, and the first Back click was a no-op (ONB-3). One clamp, used
   * everywhere.
   */
  const clampedIndex = clampStepIndex(stepIndex, effectiveSteps);
  const step = stepAtIndex(clampedIndex, effectiveSteps);
  const metaKeys = getStepMetaKeys(step);
  const { cardRef, headerRef, stepBodyRef } = useOnboardingStepMotion(clampedIndex);
  const dirty = isOnboardingDirty({
    completed,
    stepIndex: clampedIndex,
    firstName,
    lastName,
    organizationName,
    inviteCount,
  });
  const { guardDialog } = useUnsavedChangesGuard({
    when: dirty && !submitting,
    title: t(ONBOARDING_KEYS.guard.title),
    description: t(ONBOARDING_KEYS.guard.description),
    confirmLabel: t(ONBOARDING_KEYS.guard.discard),
    cancelLabel: t(ONBOARDING_KEYS.guard.stay),
  });

  // Bind persisted wizard progress to the signed-in user as soon as their id
  // is known: a store left behind by a DIFFERENT user on this browser is wiped
  // before any of its data can be reviewed or submitted (the wizard would
  // otherwise PATCH the previous user's name onto this account).
  /*
   * Claimed in the route's beforeLoad, not here. As a passive effect this ran
   * after the first commit, so signing in as a second user on the same browser
   * painted the previous user's name and workspace for a frame before the wipe
   * (ONB-4). The guard already awaits `me/context`, so it can claim the store
   * before a single frame is committed — and it keeps the write out of render,
   * which React does not allow anyway.
   */

  // Persisted wizard state can carry a created-org id from a prior session while
  // fresh signup with an empty membership list skips duplicate org creation
  // and navigates to a slug the user no longer belongs to → 404.
  useEffect(() => {
    if (!createdOrganizationId) return;
    let cancelled = false;
    readMyOrganizations()
      .then((organizations) => {
        if (cancelled) return;
        if (organizations.some((o) => o.id === createdOrganizationId)) return;
        setCreatedOrganizationId(null);
        setCreatedOrganizationSlug(null);
      })
      .catch(() => {
        /* membership check is best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, [createdOrganizationId, setCreatedOrganizationId, setCreatedOrganizationSlug]);

  /*
   * The slug is checked HERE, against the same schema `createOrganization` uses.
   * Left unvalidated, an uppercase or spaced slug passed Continue and only blew
   * up at Finish, two steps away, as the generic error above (ONB-6).
   */
  const slugValid = isValidWorkspaceSlug(organizationSlug);

  const canProceed =
    (step !== 'workspace' || (organizationName.trim().length > 0 && slugValid)) &&
    (step !== 'profile' || firstName.trim().length > 0);

  const finish = async () => {
    // `submitting` only disables the button after React re-renders, so the
    // control stays live for the frame after the first click: a double-click or
    // a bouncing touch target fires this handler twice and the second run
    // creates a second organization and re-sends every invite. This ref flips
    // synchronously, so the duplicate gesture is dropped before any request
    // goes out; `disabled={submitting}` remains the visible affordance.
    if (finishingRef.current) return;
    /*
     * Already finished on this mount, and the navigation it started has not been
     * bounced back here (`useReleaseFinishLatchOnReturn`): replay that navigation
     * and run nothing else. Deliberately not a silent no-op — the user is
     * clicking again *because* they are still looking at the wizard while the
     * destination's guards resolve, and a button that does nothing at all is its
     * own bug. The same `replace` navigation is idempotent; re-running the writes
     * above is not. `submitting` is still cleared in the `finally` below, so the
     * button is never left stuck disabled either.
     */
    if (finishedContextRef.current) {
      navigateAfterOnboarding(navigate, finishedContextRef.current, redirectSearch);
      return;
    }
    // The button is disabled without a context, but the guard belongs here too:
    // finish stamps onboarding complete on the backend, which is not reversible
    // from the UI. Never run it against a step list we could not derive — and
    // narrowing on the context itself is what lets the call below take it
    // non-null (ONB-9).
    if (!loadedContext) return;
    finishingRef.current = true;
    setFinishError(null);
    setSubmitting(true);
    // Non-reactive read: a submit wants the latest values, and subscribing to
    // the whole `data` object here is exactly what ONB-13 removed above.
    const data = useOnboardingStore.getState().data;
    try {
      const needsCreate = shouldCreateOrganizationOnFinish(
        deploymentFlags,
        loadedContext,
      );
      const { organizationId } = await resolveOrganizationForFinish({
        needsCreate,
        createdOrganizationId,
        createdOrganizationSlug,
        organizationName: data.organizationName,
        organizationSlugField: data.organizationSlug,
        setCreatedOrganizationId,
        setCreatedOrganizationSlug,
      });

      // Awaited so the profile PATCH lands BEFORE the me/context refetch below —
      // unawaited, the refreshed context could still carry firstName: null and
      // the dashboard would greet the user by their email prefix instead of the
      // name they just typed. Still best-effort: every failure inside is
      // swallowed, so awaiting can never strand the wizard.
      await persistOnboardingResult({
        firstName: data.firstName,
        lastName: data.lastName,
        teamSize: data.teamSize,
        primaryUseCase: data.primaryUseCase,
        referralSource: data.referralSource,
        invitedCount: data.invites.length,
      });

      // Stamp onboarding complete on the backend BEFORE re-reading me/context, so
      // the refreshed context (and every later `/` resolve + workspace guard)
      // reports onboarding done and routes to the dashboard instead of looping
      // back here. Awaited on purpose: a failure surfaces as the finish error and
      // keeps the user on the wizard to retry, rather than a silent redirect loop.
      const accessToken = getAccessToken();
      if (accessToken) await authApi.completeOnboarding(accessToken);

      /*
       * `['organizations']` has a 5-minute staleTime, so without this the org
       * picker and Settings → Organization served a cached list from before the
       * workspace existed — for five minutes after creating it (ONB-7). The
       * create dialog already does this; the wizard did not.
       */
      await queryClient.invalidateQueries({ queryKey: ['organizations'] });

      const refreshedContext = await refreshSessionAfterOnboardingFinish();
      const activatedContext = await activateWorkspaceAfterOnboardingFinish({
        organizationId,
        personalOrganizationId: refreshedContext.personalOrganizationId,
        organizations: refreshedContext.organizations,
      });

      // Invites go out AFTER activation: they are scoped by the active-org token
      // (switched above), and a just-created org needs an assignable role first.
      // The target is therefore the org that was ACTIVATED, not the one the
      // wizard created — see resolveInviteTargetOrganizationId.
      const inviteEmails = effectiveSteps.includes('invite') ? data.invites : [];
      const inviteOrganizationId = resolveInviteTargetOrganizationId({
        activeOrganization: activatedContext?.activeOrganization,
        createdOrganizationId: organizationId,
      });
      // No team workspace to invite into: nothing can be sent, so count every
      // address as failed and let the partial-failure warning below say so. A
      // success toast here would tell the user their teammates were invited
      // when not one request was made.
      const failed = inviteOrganizationId
        ? await sendOnboardingInvites(inviteEmails)
        : inviteEmails.length;

      // How many invitations actually went out. The toast names it: "your
      // workspace is ready" alone left the user with no confirmation that the
      // teammates they typed were invited at all — the one thing they most
      // wanted to know at that moment.
      const invitesSent = inviteEmails.length - failed;

      complete();
      if (failed > 0) {
        notify.warning(
          i18n.t(ONBOARDING_KEYS.toast.invitePartialFailure, {
            ns: ONBOARDING_NS,
            count: failed,
          }),
        );
      } else {
        notify.success(
          invitesSent > 0
            ? i18n.t(ONBOARDING_KEYS.toast.finishSuccessWithInvites, {
                ns: ONBOARDING_NS,
                count: invitesSent,
              })
            : i18n.t(ONBOARDING_KEYS.toast.finishSuccess, { ns: ONBOARDING_NS }),
        );
      }
      // Armed BEFORE control passes to the router: every write above has
      // landed, so from this point a repeat click must navigate, not re-submit.
      finishedContextRef.current = activatedContext ?? refreshedContext;
      navigateAfterOnboarding(navigate, finishedContextRef.current, redirectSearch);
    } catch (error) {
      /*
       * The error object used to be discarded entirely: a generic toast that
       * named no reason and no field, on a page that looked unchanged, and a
       * fresh duplicate toast on every retry (ONB-5). The mapped message now
       * stays on screen next to the button that failed, the raw error reaches
       * the logs, and a stable toast id replaces rather than stacks.
       */
      const message = mapFrontendError(error);
      reportError(error, { scope: 'onboarding.finish' });
      setFinishError(message);
      notify.error(message, { id: 'onboarding-finish' });
    } finally {
      finishingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <>
      {guardDialog}
      {/* No page-level background here. This island renders inside PublicLayout,
          whose every variant already paints `bg-background` across a `min-h-dvh`
          viewport — and it renders into `PublicMain`, which is `w-full max-w-md`.
          A backdrop set here is therefore 448px wide over a full-width one: a
          tinted vertical band down the middle of the page with visible seams,
          which is exactly what `bg-muted/30` drew. Widening it cannot fix that
          (`w-full` is still the 448px slot); the layout has to own the surface. */}
      <div
        className="flex min-h-screen items-center justify-center p-4"
        data-testid={ONBOARDING_TEST_IDS.page}
      >
        <div ref={cardRef} className="w-full max-w-lg transform-gpu">
          {contextReady ? (
            <Card className="w-full">
              <CardHeader className="space-y-4">
                <StepIndicator current={clampedIndex} steps={effectiveSteps} />
                <div ref={headerRef} className="transform-gpu">
                  <CardTitle data-testid={ONBOARDING_TEST_IDS.stepTitle}>
                    {t(metaKeys.title)}
                  </CardTitle>
                  <CardDescription>{t(metaKeys.description)}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 overflow-hidden">
                <div
                  ref={stepBodyRef}
                  className="transform-gpu"
                  data-testid={ONBOARDING_TEST_IDS.stepMotion}
                >
                  {/*
                  A throw inside one step body must not take the wizard with it:
                  uncontained it escalates to the route boundary, which replaces
                  the whole screen with a generic error page and strands a
                  brand-new user mid-signup. Contained here, the card, the step
                  indicator and Back/Continue survive and the fallback offers a
                  retry in place. Keyed by step so moving on mounts a fresh
                  boundary instead of carrying the error to the next one.
                */}
                  <SectionErrorBoundary
                    key={step}
                    title={t(metaKeys.title)}
                    testId={ONBOARDING_TEST_IDS.stepError}
                  >
                    {renderStep(step, effectiveSteps)}
                  </SectionErrorBoundary>
                </div>

                {/*
                  The same FormError banner the auth screens use, rather than a
                  bare paragraph: one error surface across the product, and it
                  carries the icon, the destructive tokens and role="alert"
                  without this page re-deciding any of it.
                */}
                <FormError
                  message={finishError}
                  className="mt-4"
                  data-testid={ONBOARDING_TEST_IDS.finishError}
                />

                <WizardActions
                  isFirstStep={clampedIndex === 0}
                  isDoneStep={step === 'done'}
                  submitting={submitting}
                  canProceed={canProceed}
                  onBack={() => setStepIndex(Math.max(clampedIndex - 1, 0))}
                  onNext={() =>
                    setStepIndex(Math.min(clampedIndex + 1, effectiveSteps.length - 1))
                  }
                  onFinish={finish}
                />
              </CardContent>
            </Card>
          ) : (
            <SessionContextGate query={meContextQuery} />
          )}
        </div>
      </div>
    </>
  );
}
