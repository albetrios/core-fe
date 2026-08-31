import type { UseQueryResult } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
import { useDeploymentFlags } from '@/shared/hooks/useDeploymentFlags/index.ts';
import { useMeContext } from '@/shared/hooks/useMeContext/index.ts';
import { useUnsavedChangesGuard } from '@/shared/hooks/useUnsavedChangesGuard/index.ts';
import { Loader2 } from '@/shared/icons/index.ts';
import { notify } from '@/shared/notify/index.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOnboardingStore } from '@/shared/store/useOnboardingStore/index.ts';
import type { MeContext } from '@/shared/tenancy/me-context.ts';
import {
  createOrganization,
  listMyOrganizations,
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
  deriveOnboardingSteps,
  type OnboardingStep,
  shouldCreateOrganizationOnFinish,
  stepAtIndex,
} from './onboarding-flow.ts';

/** Step list used while me/context has not loaded — nothing is rendered from it. */
const EMPTY_STEPS: readonly OnboardingStep[] = [];

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
    } catch {
      /* profile update is best-effort */
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
    const organizations = await listMyOrganizations();
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
  }

  return { organizationId, organizationSlug };
}

async function refreshSessionAfterOnboardingFinish(): Promise<MeContext> {
  return hydrateSessionContext();
}

function isOnboardingDirty(input: {
  completed: boolean;
  stepIndex: number;
  data: {
    firstName: string;
    lastName: string;
    organizationName: string;
    invites: string[];
  };
}): boolean {
  if (input.completed) return false;
  if (input.stepIndex > 0) return true;
  const d = input.data;
  return Boolean(
    d.firstName.trim() ||
    d.lastName.trim() ||
    d.organizationName.trim() ||
    d.invites.length > 0,
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
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
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

function renderStep(step: ReturnType<typeof stepAtIndex>, teamSetupIncluded: boolean) {
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
      return <DoneStep />;
    default:
      return <WelcomeStep teamSetupIncluded={teamSetupIncluded} />;
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
  const {
    stepIndex,
    data,
    complete,
    completed,
    createdOrganizationId,
    setCreatedOrganizationId,
    createdOrganizationSlug,
    setCreatedOrganizationSlug,
    setStepIndex,
    claimForUser,
  } = useOnboardingStore();
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
  const deploymentFlags = useDeploymentFlags();
  // Derived ONLY from a loaded context — never from the permissive fallback.
  const effectiveSteps = contextReady
    ? deriveOnboardingSteps(deploymentFlags, meContext)
    : EMPTY_STEPS;
  const [submitting, setSubmitting] = useState(false);
  // Synchronous twin of `submitting` — see finish().
  const finishingRef = useRef(false);
  const step = stepAtIndex(stepIndex, effectiveSteps);
  const metaKeys = getStepMetaKeys(step);
  const { cardRef, headerRef, stepBodyRef } = useOnboardingStepMotion(stepIndex);
  const dirty = isOnboardingDirty({ completed, stepIndex, data });
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
  const sessionUserId = meContext?.user.id ?? null;
  useEffect(() => {
    if (sessionUserId) claimForUser(sessionUserId);
  }, [sessionUserId, claimForUser]);

  // Persisted wizard state can carry a created-org id from a prior session while
  // fresh signup with an empty membership list skips duplicate org creation
  // and navigates to a slug the user no longer belongs to → 404.
  useEffect(() => {
    if (!createdOrganizationId) return;
    let cancelled = false;
    listMyOrganizations()
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

  const canProceed =
    (step !== 'workspace' || data.organizationName.trim().length > 0) &&
    (step !== 'profile' || data.firstName.trim().length > 0);

  const finish = async () => {
    // `submitting` only disables the button after React re-renders, so the
    // control stays live for the frame after the first click: a double-click or
    // a bouncing touch target fires this handler twice and the second run
    // creates a second organization and re-sends every invite. This ref flips
    // synchronously, so the duplicate gesture is dropped before any request
    // goes out; `disabled={submitting}` remains the visible affordance.
    if (finishingRef.current) return;
    // The button is disabled without a context, but the guard belongs here too:
    // finish stamps onboarding complete on the backend, which is not reversible
    // from the UI. Never run it against a step list we could not derive.
    if (!contextReady) return;
    finishingRef.current = true;
    setSubmitting(true);
    try {
      const needsCreate = shouldCreateOrganizationOnFinish(
        deploymentFlags,
        meContext ?? null,
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
          i18n.t(ONBOARDING_KEYS.toast.finishSuccess, { ns: ONBOARDING_NS }),
        );
      }
      navigateAfterOnboarding(
        navigate,
        activatedContext ?? refreshedContext,
        redirectSearch,
      );
    } catch {
      notify.error(i18n.t(ONBOARDING_KEYS.toast.finishError, { ns: ONBOARDING_NS }));
    } finally {
      finishingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <>
      {guardDialog}
      <div
        className="bg-muted/30 flex min-h-screen items-center justify-center p-4"
        data-testid={ONBOARDING_TEST_IDS.page}
      >
        <div ref={cardRef} className="w-full max-w-lg transform-gpu">
          {contextReady ? (
            <Card className="w-full">
              <CardHeader className="space-y-4">
                <StepIndicator current={stepIndex} steps={effectiveSteps} />
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
                    {renderStep(step, effectiveSteps.includes('workspace'))}
                  </SectionErrorBoundary>
                </div>

                <WizardActions
                  isFirstStep={stepIndex === 0}
                  isDoneStep={step === 'done'}
                  submitting={submitting}
                  canProceed={canProceed}
                  onBack={() => setStepIndex(Math.max(stepIndex - 1, 0))}
                  onNext={() =>
                    setStepIndex(Math.min(stepIndex + 1, effectiveSteps.length - 1))
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
