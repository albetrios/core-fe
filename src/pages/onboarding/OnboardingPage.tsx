import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import i18n from '@/lib/i18n/i18n.ts';
import { ANALYTICS_EVENTS } from '@/shared/analytics/analytics.constants.ts';
import { captureAnalyticsEvent } from '@/shared/analytics/capture.ts';
import { authApi } from '@/shared/api/auth-api.ts';
import { createRole, inviteMember, listRoles } from '@/shared/api/organization-api.ts';
import { isSafeRedirectPath } from '@/shared/auth/redirect-safety.ts';
import { getAccessToken } from '@/shared/auth/token.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card.tsx';
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
  const { data: meContext } = useMeContext();
  const deploymentFlags = useDeploymentFlags();
  const effectiveSteps = deriveOnboardingSteps(deploymentFlags, meContext ?? null);
  const [submitting, setSubmitting] = useState(false);
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
      const failed =
        effectiveSteps.includes('invite') && organizationId
          ? await sendOnboardingInvites(data.invites)
          : 0;

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
                {renderStep(step, effectiveSteps.includes('workspace'))}
              </div>

              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  onClick={() => setStepIndex(Math.max(stepIndex - 1, 0))}
                  disabled={stepIndex === 0 || submitting}
                  data-testid={ONBOARDING_TEST_IDS.back}
                >
                  {t(ONBOARDING_KEYS.actions.back)}
                </Button>

                {step === 'done' ? (
                  <Button
                    onClick={finish}
                    disabled={submitting}
                    data-testid={ONBOARDING_TEST_IDS.finish}
                  >
                    {submitting ? (
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
                    onClick={() =>
                      setStepIndex(Math.min(stepIndex + 1, effectiveSteps.length - 1))
                    }
                    disabled={!canProceed}
                    data-testid={ONBOARDING_TEST_IDS.next}
                  >
                    {t(ONBOARDING_KEYS.actions.continue)}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
