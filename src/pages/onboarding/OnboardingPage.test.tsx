import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryClient } from '@/core/http/queryClient.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

vi.mock('@/shared/hooks/useUnsavedChangesGuard/index.ts', () => ({
  useUnsavedChangesGuard: () => ({ guardDialog: null, isBlocked: false }),
}));

/**
 * The live `me/context` the wizard itself reads. It is what `deriveOnboardingSteps`
 * runs on and what the readiness gate checks, so every test drives it through this
 * ref: `data: null` now renders the gate, not a wizard.
 */
const liveContextRef = vi.hoisted(() => ({
  value: null as unknown,
  isPending: false,
  isError: false,
}));
const refetchMeContext = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
vi.mock('@/shared/hooks/useMeContext/index.ts', () => ({
  useMeContext: vi.fn(() => ({
    data: liveContextRef.value,
    isPending: liveContextRef.isPending,
    isError: liveContextRef.isError,
    isFetching: false,
    refetch: refetchMeContext,
  })),
  meContextQueryKey: ['auth', 'me-context'],
}));

const hydratedContextRef = vi.hoisted(() => ({
  value: {
    user: {
      id: 'usr_1',
      email: 'a@b.test',
      firstName: 'A',
      lastName: null,
      onboardingCompleted: true,
    },
    activeOrganization: null,
    myPermissions: ['organization:read'],
    globalRole: null,
    organizations: [],
    deploymentFlags: { personalOrganizations: false, teamOrganizations: true },
    personalOrganizationId: null as string | null,
  },
}));
vi.mock('@/shared/tenancy/session-context.ts', () => ({
  hydrateSessionContext: vi.fn(() => Promise.resolve(hydratedContextRef.value)),
}));

const navigate = vi.fn();
const searchRef = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => navigate,
  useSearch: () => searchRef.value,
}));

const switchToOrganization = vi.fn();
const switchToPersonal = vi.fn();
vi.mock('@/shared/tenancy/switch.ts', () => ({
  switchToOrganization: (...args: unknown[]) => switchToOrganization(...args),
  switchToPersonal: (...args: unknown[]) => switchToPersonal(...args),
}));

const deploymentFlagsRef = vi.hoisted(() => ({
  value: { personalOrganizations: false, teamOrganizations: true },
}));
vi.mock('@/shared/hooks/useDeploymentFlags/index.ts', () => ({
  useDeploymentFlags: () => deploymentFlagsRef.value,
}));

const createOrganization = vi.fn();
const listMyOrganizations = vi.fn();
vi.mock('@/shared/tenancy/my-organizations.ts', async (importOriginal) => ({
  // Spread the real module so the REAL schema is used: the wizard validates the
  // slug against the same one `createOrganization` does, and a stubbed schema
  // would make that test prove nothing.
  ...(await importOriginal<Record<string, unknown>>()),
  createOrganization: (...args: unknown[]) => createOrganization(...args),
  listMyOrganizations: (...args: unknown[]) => listMyOrganizations(...args),
}));

const inviteMember = vi.fn();
const listRoles = vi.fn();
const createRole = vi.fn();
vi.mock('@/shared/api/organization-api.ts', () => ({
  inviteMember: (...args: unknown[]) => inviteMember(...args),
  listRoles: (...args: unknown[]) => listRoles(...args),
  createRole: (...args: unknown[]) => createRole(...args),
}));

/** A non-system role row shaped like organization-api's RoleSummary. */
function memberRole(id = 'rol_member') {
  return {
    id,
    name: 'Member',
    description: '',
    permissions: [],
    memberCount: 0,
    isSystem: false,
  };
}

/**
 * `DoneStep` that can be made to throw on demand — the containment test needs a
 * real render-time crash inside a step body, not a stubbed one.
 */
const doneStepThrows = vi.hoisted(() => ({ value: false }));
vi.mock('./components/DoneStep/index.ts', async (importOriginal) => {
  const actual = await importOriginal<{ DoneStep: () => ReactNode }>();
  return {
    ...actual,
    DoneStep: () => {
      if (doneStepThrows.value) throw new Error('DoneStep crashed');
      return actual.DoneStep();
    },
  };
});

vi.mock('@/shared/api/auth-api.ts', () => ({
  authApi: {
    updateProfile: vi.fn().mockResolvedValue(undefined),
    completeOnboarding: vi.fn().mockResolvedValue(undefined),
  },
}));

import { notify } from '@/shared/notify/index.ts';
import { useOnboardingStore } from '@/shared/store/useOnboardingStore/index.ts';

import { OnboardingPage } from './OnboardingPage.tsx';

const SESSION_USER_ID = 'usr_1';

/**
 * Drop the wizard on the final step with a chosen org name + invites. The store
 * is claimed for the session user FIRST: the mount effect claims it too, and an
 * unclaimed store is wiped — taking the seed with it.
 */
/**
 * Structurally valid base64url JWT — `setAccessToken` validates the shape, so a
 * bare string is rejected. Shared by every test that needs a token in scope.
 */
const FAKE_JWT = (() => {
  const b64u = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64u({ alg: 'none' })}.${b64u({ sub: 'usr_1', exp: 9999999999 })}.sig`;
})();

function seedDoneStep(invites: string[] = []) {
  const store = useOnboardingStore.getState();
  store.reset();
  store.claimForUser(SESSION_USER_ID);
  store.patch({ organizationName: 'Acme Inc.', invites });
  store.setStepIndex(5); // team-only: welcome/profile/questions/workspace/invite/done
}

const TS = '2026-01-01T00:00:00.000Z';

/**
 * A switch (to org or personal) re-mints the token and returns the post-switch
 * context with `activeOrganization` applied — that context is what the
 * onboarding-finish navigation resolves against. Build it from the current
 * hydrated context so deployment flags stay consistent per test.
 */
function ctxWithActive(active: unknown) {
  return { ...hydratedContextRef.value, activeOrganization: active };
}
function teamOrg(slug: string) {
  return {
    id: `org_${slug}`,
    name: 'Acme Inc.',
    slug,
    type: 'TEAM' as const,
    status: 'ACTIVE' as const,
    logoUrl: null,
    createdAt: TS,
    updatedAt: TS,
  };
}
/**
 * A loaded me/context for the wizard to derive its step list from. Only
 * `organizations` matters to `deriveOnboardingSteps` (the deployment flags come
 * from the separately-mocked `useDeploymentFlags`), but the rest is filled in so
 * the shape matches what the component actually consumes.
 */
function makeLiveContext(
  input: {
    userId?: string;
    organizations?: unknown[];
    flags?: { personalOrganizations: boolean; teamOrganizations: boolean };
    personalOrganizationId?: string | null;
  } = {},
) {
  return {
    user: {
      id: input.userId ?? SESSION_USER_ID,
      email: 'a@b.test',
      firstName: 'A',
      lastName: null,
      onboardingCompleted: false,
    },
    activeOrganization: null,
    myPermissions: ['organization:read'],
    globalRole: null,
    organizations: input.organizations ?? [],
    deploymentFlags: input.flags ?? {
      personalOrganizations: false,
      teamOrganizations: true,
    },
    personalOrganizationId: input.personalOrganizationId ?? null,
  };
}

/** Switch both the deployment flags and the live context to a hybrid session. */
function useHybridSession(organizations: unknown[] = []) {
  const flags = { personalOrganizations: true, teamOrganizations: true };
  deploymentFlagsRef.value = flags;
  hydratedContextRef.value = {
    ...hydratedContextRef.value,
    deploymentFlags: flags,
    organizations,
    personalOrganizationId: 'org_personal_1',
  };
  liveContextRef.value = makeLiveContext({
    organizations,
    flags,
    personalOrganizationId: 'org_personal_1',
  });
}

function personalOrg() {
  return {
    id: 'org_personal_1',
    name: 'Personal',
    slug: null,
    type: 'PERSONAL' as const,
    status: 'ACTIVE' as const,
    logoUrl: null,
    createdAt: TS,
    updatedAt: TS,
  };
}

describe('OnboardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    /*
     * `queryClient` is a module singleton, so cache entries survive between
     * tests in this file. The wizard now reads the organization list THROUGH
     * that cache (ONB-10), so without this a list left behind by an earlier
     * test answers a later one.
     */
    queryClient.clear();
    deploymentFlagsRef.value = { personalOrganizations: false, teamOrganizations: true };
    // Default: team-only deployment, context LOADED. Without this the readiness
    // gate renders instead of the wizard — which is the whole point of ONB-2.
    liveContextRef.value = makeLiveContext();
    liveContextRef.isPending = false;
    liveContextRef.isError = false;
    hydratedContextRef.value = {
      user: {
        id: 'usr_1',
        email: 'a@b.test',
        firstName: 'A',
        lastName: null,
        onboardingCompleted: true,
      },
      activeOrganization: null,
      myPermissions: ['organization:read'],
      globalRole: null,
      organizations: [],
      deploymentFlags: { personalOrganizations: false, teamOrganizations: true },
      personalOrganizationId: null,
    };
    switchToOrganization.mockImplementation(async () => ctxWithActive(teamOrg('acme')));
    switchToPersonal.mockImplementation(async () => ctxWithActive(personalOrg()));
    listMyOrganizations.mockResolvedValue([]);
    createOrganization.mockImplementation(async () => {
      const org = {
        id: 'org_new',
        name: 'Acme Inc.',
        slug: 'acme',
        status: 'active' as const,
        logoUrl: null,
      };
      listMyOrganizations.mockResolvedValue([org]);
      return org;
    });
    // A just-activated org already has an assignable role, so invites reuse it.
    listRoles.mockResolvedValue({ rows: [memberRole()] });
    createRole.mockResolvedValue(memberRole('rol_created'));
    inviteMember.mockResolvedValue({ id: 'mem_1', email: 'a@acme.com' });
    useOnboardingStore.getState().reset();
  });

  it('renders the page container', async () => {
    renderWithProviders(<OnboardingPage />);
    expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
  });

  // The wipe itself now happens in `requireOnboardingWorkspace` (see
  // route-guards.test.ts), BEFORE this page renders — that is the ONB-4 fix:
  // done from an effect, the previous user's name painted for a frame first.
  // What this asserts is the half the page still owns: once the store belongs
  // to the new user, nothing of the old one is on screen.
  it("shows nothing of a previous user's wizard once the store is claimed", async () => {
    const store = useOnboardingStore.getState();
    store.claimForUser('usr_previous');
    store.patch({ firstName: 'Prev', lastName: 'User', teamSize: '2–10' });
    store.setStepIndex(2);

    // What the guard does before this page is allowed to render.
    store.claimForUser('usr_next');
    liveContextRef.value = makeLiveContext({ userId: 'usr_next' });

    renderWithProviders(<OnboardingPage />);

    await screen.findByTestId('onboarding-page');
    expect(screen.queryByDisplayValue('Prev')).not.toBeInTheDocument();
    const state = useOnboardingStore.getState();
    expect(state.forUserId).toBe('usr_next');
    expect(state.stepIndex).toBe(0);
    expect(state.data.firstName).toBe('');
  });

  it('creates the org once and navigates to its dashboard', async () => {
    const user = userEvent.setup();
    seedDoneStep(['a@acme.com']);
    renderWithProviders(<OnboardingPage />);

    await user.click(await screen.findByTestId('onboarding-finish'));

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(createOrganization).toHaveBeenCalledTimes(1);
    expect(switchToOrganization).toHaveBeenCalledWith('org_new');
    expect(useOnboardingStore.getState().createdOrganizationId).toBe('org_new');
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ params: { organizationSlug: 'acme' }, replace: true }),
    );
  });

  it('does NOT re-create the org on a retry after a partial failure', async () => {
    const user = userEvent.setup();
    seedDoneStep(['a@acme.com']);
    listMyOrganizations.mockResolvedValue([
      { id: 'org_existing', name: 'Existing', slug: 'existing-slug', status: 'active' },
    ]);
    // Simulate a prior attempt that already created the org (id + slug stored).
    useOnboardingStore.getState().setCreatedOrganizationId('org_existing');
    useOnboardingStore.getState().setCreatedOrganizationSlug('existing-slug');
    switchToOrganization.mockImplementationOnce(async () =>
      ctxWithActive(teamOrg('existing-slug')),
    );
    renderWithProviders(<OnboardingPage />);

    await user.click(await screen.findByTestId('onboarding-finish'));

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(createOrganization).not.toHaveBeenCalled();
    expect(switchToOrganization).toHaveBeenCalledWith('org_existing');
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ params: { organizationSlug: 'existing-slug' } }),
    );
  });

  it('activates the sole existing team org instead of personal (invited/pre-provisioned user)', async () => {
    const user = userEvent.setup();
    // Hybrid deployment; the wizard creates nothing. The user ALREADY belongs
    // to one team (invited or seeded) and has a personal org provisioned.
    useHybridSession([teamOrg('acme')]);
    const store = useOnboardingStore.getState();
    store.reset();
    store.claimForUser(SESSION_USER_ID);
    store.setStepIndex(4); // hybrid+team steps: welcome/profile/questions/invite/done
    renderWithProviders(<OnboardingPage />);

    await user.click(await screen.findByTestId('onboarding-finish'));

    // Their team is the destination — NOT the personal fallback that used to
    // hide the workspace they were brought here to join.
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(createOrganization).not.toHaveBeenCalled();
    expect(switchToOrganization).toHaveBeenCalledWith('org_acme');
    expect(switchToPersonal).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ params: { organizationSlug: 'acme' }, replace: true }),
    );
  });

  it('falls back to personal when several teams exist (no unambiguous destination)', async () => {
    const user = userEvent.setup();
    useHybridSession([teamOrg('acme'), teamOrg('beta')]);
    const store = useOnboardingStore.getState();
    store.reset();
    store.claimForUser(SESSION_USER_ID);
    store.setStepIndex(4);
    renderWithProviders(<OnboardingPage />);

    await user.click(await screen.findByTestId('onboarding-finish'));

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(switchToOrganization).not.toHaveBeenCalled();
    expect(switchToPersonal).toHaveBeenCalledTimes(1);
  });

  it('returns the user to the guarded deep link after finishing (?redirect=)', async () => {
    const user = userEvent.setup();
    searchRef.value = { redirect: '/organization/acme/settings' };
    try {
      seedDoneStep();
      renderWithProviders(<OnboardingPage />);

      await user.click(await screen.findByTestId('onboarding-finish'));

      await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
      expect(navigate).toHaveBeenCalledWith({
        to: '/organization/acme/settings',
        replace: true,
      });
    } finally {
      searchRef.value = {};
    }
  });

  it('ignores an unsafe redirect and falls back to the resolved workspace', async () => {
    const user = userEvent.setup();
    searchRef.value = { redirect: 'https://evil.example/phish' };
    try {
      seedDoneStep();
      renderWithProviders(<OnboardingPage />);

      await user.click(await screen.findByTestId('onboarding-finish'));

      await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({ params: { organizationSlug: 'acme' }, replace: true }),
      );
    } finally {
      searchRef.value = {};
    }
  });

  it('persists the typed profile name BEFORE refetching me/context (greeting consistency)', async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    const { authApi } = await import('@/shared/api/auth-api.ts');
    const { hydrateSessionContext } = await import('@/shared/tenancy/session-context.ts');
    const { setAccessToken, clearAccessToken } = await import('@/shared/auth/token.ts');
    setAccessToken(FAKE_JWT);
    vi.mocked(authApi.updateProfile).mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 20)); // let hydrate overtake if unordered
      order.push('updateProfile');
    });
    vi.mocked(hydrateSessionContext).mockImplementationOnce(async () => {
      order.push('hydrate');
      return hydratedContextRef.value;
    });
    try {
      seedDoneStep();
      useOnboardingStore.getState().patch({ firstName: 'Ada', lastName: 'Lovelace' });
      renderWithProviders(<OnboardingPage />);

      await user.click(await screen.findByTestId('onboarding-finish'));

      await waitFor(() => expect(navigate).toHaveBeenCalled());
      // The PATCH must land before the refetch, or the refreshed context still
      // carries firstName: null and the dashboard greets by email prefix.
      expect(order).toEqual(['updateProfile', 'hydrate']);
    } finally {
      clearAccessToken();
    }
  });

  it('creates the org when persisted createdOrganizationId is stale (404 guard)', async () => {
    const user = userEvent.setup();
    seedDoneStep();
    listMyOrganizations.mockResolvedValue([]);
    useOnboardingStore.getState().setCreatedOrganizationId('org_stale');
    useOnboardingStore.getState().setCreatedOrganizationSlug('acme');
    renderWithProviders(<OnboardingPage />);

    await user.click(await screen.findByTestId('onboarding-finish'));

    await waitFor(() => expect(createOrganization).toHaveBeenCalledTimes(1));
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ params: { organizationSlug: 'acme' } }),
    );
  });

  it('still finishes when an invite fails (best-effort, no trap)', async () => {
    const user = userEvent.setup();
    inviteMember.mockRejectedValueOnce(new Error('bad invite'));
    seedDoneStep(['good@acme.com', 'bad@acme.com']);
    renderWithProviders(<OnboardingPage />);

    await user.click(await screen.findByTestId('onboarding-finish'));

    // Org created exactly once, user is sent through despite the invite failure.
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(createOrganization).toHaveBeenCalledTimes(1);
  });

  it('invites teammates as members via POST /memberships with a real role id', async () => {
    // Regression: the finish step hit the non-existent POST /invitations (404).
    // It now creates INVITED memberships (inviteMember) with a real role_id,
    // AFTER the token has switched to the new org.
    const user = userEvent.setup();
    seedDoneStep(['a@acme.com', 'b@acme.com']);
    renderWithProviders(<OnboardingPage />);

    await user.click(await screen.findByTestId('onboarding-finish'));

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    // Token switched to the new org before inviting.
    expect(switchToOrganization).toHaveBeenCalledWith('org_new');
    expect(inviteMember).toHaveBeenCalledTimes(2);
    expect(inviteMember).toHaveBeenCalledWith({
      email: 'a@acme.com',
      roleId: 'rol_member',
    });
    expect(inviteMember).toHaveBeenCalledWith({
      email: 'b@acme.com',
      roleId: 'rol_member',
    });
    // The org already had an assignable role, so none was provisioned.
    expect(createRole).not.toHaveBeenCalled();
  });

  it('provisions a default Member role when the fresh org seeds only Owner', async () => {
    // A freshly created org has only the system Owner role — nothing to invite
    // anyone as — so the finish step provisions a "Member" role first.
    const user = userEvent.setup();
    listRoles.mockResolvedValueOnce({
      rows: [{ ...memberRole('rol_owner'), name: 'Owner', isSystem: true }],
    });
    createRole.mockResolvedValueOnce(memberRole('rol_provisioned'));
    seedDoneStep(['a@acme.com']);
    renderWithProviders(<OnboardingPage />);

    await user.click(await screen.findByTestId('onboarding-finish'));

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(createRole).toHaveBeenCalledTimes(1);
    expect(inviteMember).toHaveBeenCalledWith({
      email: 'a@acme.com',
      roleId: 'rol_provisioned',
    });
  });

  it('finishes even when no invite role can be provisioned (best-effort)', async () => {
    // Fresh org has only Owner AND createRole fails → resolveInviteRoleId throws;
    // invites are all counted failed but the wizard still completes.
    const user = userEvent.setup();
    listRoles.mockResolvedValueOnce({
      rows: [{ ...memberRole('rol_owner'), name: 'Owner', isSystem: true }],
    });
    createRole.mockRejectedValueOnce(new Error('nope'));
    seedDoneStep(['a@acme.com']);
    renderWithProviders(<OnboardingPage />);

    await user.click(await screen.findByTestId('onboarding-finish'));

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(inviteMember).not.toHaveBeenCalled();
  });

  it('finishes both mode to personal dashboard without creating a team org', async () => {
    useHybridSession();
    const user = userEvent.setup();
    const store = useOnboardingStore.getState();
    store.reset();
    store.claimForUser(SESSION_USER_ID);
    store.patch({ firstName: 'Ada', lastName: 'Lovelace' });
    store.setStepIndex(3);
    renderWithProviders(<OnboardingPage />);

    await user.click(await screen.findByTestId('onboarding-finish'));

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(createOrganization).not.toHaveBeenCalled();
    expect(switchToPersonal).toHaveBeenCalledTimes(1);
    // Lands DIRECTLY on the personal dashboard — no bounce through `/`.
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: '/dashboard', replace: true }),
    );
  });

  // Regression: personal orgs are *enabled* for the deployment, but this user has
  // none provisioned (core-be provisions best-effort, so it can be missing).
  // me/context reports `personalOrganizationId: null` — finishing onboarding must
  // NOT fire `switch-to-personal` (it would 404 and trap the user), and should
  // still land on the `/` resolver.
  it('skips switch-to-personal when the deployment enables personal but the user has none', async () => {
    useHybridSession();
    hydratedContextRef.value.personalOrganizationId = null;
    const user = userEvent.setup();
    const store = useOnboardingStore.getState();
    store.reset();
    store.claimForUser(SESSION_USER_ID);
    store.patch({ firstName: 'Ada', lastName: 'Lovelace' });
    store.setStepIndex(3);
    renderWithProviders(<OnboardingPage />);

    await user.click(await screen.findByTestId('onboarding-finish'));

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(createOrganization).not.toHaveBeenCalled();
    expect(switchToPersonal).not.toHaveBeenCalled();
    // Onboarding is complete, so the resolver routes this personal-mode session to
    // `/dashboard` directly (the personal workspace self-heals on the next read);
    // the old `/` fallback only fired when the resolver still wanted onboarding.
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: '/dashboard', replace: true }),
    );
  });

  // Mode coverage: personal-only never creates a team org; the personal workspace
  // exists, so finishing lands DIRECTLY on `/dashboard`.
  it('personal-only mode finishes directly to the personal dashboard', async () => {
    const personalOnly = { personalOrganizations: true, teamOrganizations: false };
    deploymentFlagsRef.value = personalOnly;
    hydratedContextRef.value.deploymentFlags = personalOnly;
    hydratedContextRef.value.personalOrganizationId = 'org_personal_1';
    liveContextRef.value = makeLiveContext({
      flags: personalOnly,
      personalOrganizationId: 'org_personal_1',
    });
    const user = userEvent.setup();
    const store = useOnboardingStore.getState();
    store.reset();
    store.claimForUser(SESSION_USER_ID);
    store.patch({ firstName: 'Ada', lastName: 'Lovelace' });
    store.setStepIndex(3);
    renderWithProviders(<OnboardingPage />);

    await user.click(await screen.findByTestId('onboarding-finish'));

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(createOrganization).not.toHaveBeenCalled();
    expect(switchToPersonal).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: '/dashboard', replace: true }),
    );
  });

  // ── ONB-1: invites keyed off the ACTIVATED org, not the created one ────────

  // personal-and-team mode where the user ALREADY belongs to a team:
  // deriveOnboardingSteps shows the invite step, but the wizard creates no org.
  // Gating the send on the *created* org id therefore skipped every invite —
  // and the success toast still told the user their workspace was ready.
  it('sends the invites into the existing team it activated (creates no org)', async () => {
    const user = userEvent.setup();
    useHybridSession([teamOrg('acme')]);
    const successSpy = vi.spyOn(notify, 'success').mockImplementation(() => '');
    const warningSpy = vi.spyOn(notify, 'warning').mockImplementation(() => '');
    try {
      const store = useOnboardingStore.getState();
      store.reset();
      store.claimForUser(SESSION_USER_ID);
      store.patch({ invites: ['a@acme.com', 'b@acme.com', 'c@acme.com'] });
      store.setStepIndex(4); // welcome/profile/questions/invite/done
      renderWithProviders(<OnboardingPage />);

      await user.click(await screen.findByTestId('onboarding-finish'));

      await waitFor(() => expect(navigate).toHaveBeenCalled());
      expect(createOrganization).not.toHaveBeenCalled();
      expect(switchToOrganization).toHaveBeenCalledWith('org_acme');
      // All three go out. This is exactly what silently sent nothing before.
      expect(inviteMember).toHaveBeenCalledTimes(3);
      expect(inviteMember).toHaveBeenCalledWith({
        email: 'c@acme.com',
        roleId: 'rol_member',
      });
      expect(successSpy).toHaveBeenCalledTimes(1);
      // The toast NAMES how many invitations went out — "your workspace is
      // ready" alone left the user with no confirmation that the teammates
      // they had just typed were invited at all.
      expect(successSpy).toHaveBeenCalledWith(expect.stringContaining('3'));
      expect(successSpy.mock.calls[0]?.[0]).toMatch(/invitation/i);
      expect(warningSpy).not.toHaveBeenCalled();
    } finally {
      successSpy.mockRestore();
      warningSpy.mockRestore();
    }
  });

  it('warns rather than claiming success when there is no team to invite into', async () => {
    // Several teams → activation falls back to the personal workspace, which
    // cannot hold invited members. Nothing can be sent, so the user is told
    // instead of being shown a success toast that lies.
    const user = userEvent.setup();
    useHybridSession([teamOrg('acme'), teamOrg('beta')]);
    const successSpy = vi.spyOn(notify, 'success').mockImplementation(() => '');
    const warningSpy = vi.spyOn(notify, 'warning').mockImplementation(() => '');
    try {
      const store = useOnboardingStore.getState();
      store.reset();
      store.claimForUser(SESSION_USER_ID);
      store.patch({ invites: ['a@acme.com', 'b@acme.com'] });
      store.setStepIndex(4);
      renderWithProviders(<OnboardingPage />);

      await user.click(await screen.findByTestId('onboarding-finish'));

      await waitFor(() => expect(navigate).toHaveBeenCalled());
      expect(switchToPersonal).toHaveBeenCalledTimes(1);
      expect(inviteMember).not.toHaveBeenCalled();
      expect(warningSpy).toHaveBeenCalledTimes(1);
      expect(successSpy).not.toHaveBeenCalled();
    } finally {
      successSpy.mockRestore();
      warningSpy.mockRestore();
    }
  });

  // ── Single-flight: one gesture, one set of writes ──────────────────────────

  it('drops a double-click on Finish — one org created, one invite sent', async () => {
    seedDoneStep(['a@acme.com']);
    renderWithProviders(<OnboardingPage />);
    const finishButton = await screen.findByTestId('onboarding-finish');

    // userEvent/fireEvent flush React between clicks, so `disabled={submitting}`
    // lands and even an unguarded button passes. Both clicks must be dispatched
    // inside ONE act batch to reproduce the frame where the button is still live.
    await act(async () => {
      finishButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      finishButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(createOrganization).toHaveBeenCalledTimes(1);
    expect(switchToOrganization).toHaveBeenCalledTimes(1);
    expect(inviteMember).toHaveBeenCalledTimes(1);
  });

  it('drops a Finish click made while the post-finish navigation is in flight', async () => {
    /*
     * The window `finishingRef` alone did not cover. Its `finally` releases the
     * latch (and `submitting`) as soon as `navigateAfterOnboarding` has *started*
     * the navigation — `void navigate`, not awaited — while the destination's
     * guard chain is still doing async network work. The wizard is still on
     * screen with a live button for all of it, and a second click re-ran the
     * whole finish: `completeOnboarding`, the profile PATCH, the org switch and
     * every invitation a second time, so the user got duplicate invitations or a
     * bogus "couldn't be sent" warning right after being told it worked.
     */
    const user = userEvent.setup();
    const { authApi } = await import('@/shared/api/auth-api.ts');
    const { setAccessToken, clearAccessToken } = await import('@/shared/auth/token.ts');
    setAccessToken(FAKE_JWT);
    try {
      seedDoneStep(['a@acme.com']);
      // A name to PATCH: persistOnboardingResult skips the call outright when
      // both name fields are blank, and the duplicate PATCH is half the bug.
      useOnboardingStore.getState().patch({ firstName: 'Ada' });
      renderWithProviders(<OnboardingPage />);
      const finishButton = await screen.findByTestId('onboarding-finish');

      await user.click(finishButton);
      await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));

      // Navigation has only been *started*: nothing here unmounts the wizard, so
      // this is exactly the frame the real router leaves live while its guards
      // resolve — and the button is enabled again, not stuck.
      expect(finishButton).toBeEnabled();

      await user.click(finishButton);
      // A duplicate run is nothing but immediately-resolved mocks, so two turns
      // of the macrotask queue is far more than it needs to reach its own
      // writes. Unguarded, every count below comes back as 2.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(inviteMember).toHaveBeenCalledTimes(1);
      expect(authApi.completeOnboarding).toHaveBeenCalledTimes(1);
      expect(authApi.updateProfile).toHaveBeenCalledTimes(1);
      expect(switchToOrganization).toHaveBeenCalledTimes(1);
      expect(createOrganization).toHaveBeenCalledTimes(1);
      // Repeating the gesture still takes the user where they asked to go — the
      // gate skips the writes, it does not leave a button that does nothing.
      expect(navigate).toHaveBeenCalledTimes(2);
      expect(navigate).toHaveBeenLastCalledWith(
        expect.objectContaining({ params: { organizationSlug: 'acme' }, replace: true }),
      );
      expect(finishButton).toBeEnabled();
    } finally {
      clearAccessToken();
    }
  });

  it('still finishes on a retry after a failed attempt (the gate is not a stuck button)', async () => {
    /*
     * The other half of the gate above: it must arm on SUCCESS only. Armed on
     * every attempt — or held past the failure path — a first attempt that blew
     * up would leave a brand-new user staring at an "Enter dashboard" button
     * that had quietly stopped doing anything, with no way out of the wizard.
     */
    const user = userEvent.setup();
    const { authApi } = await import('@/shared/api/auth-api.ts');
    const { setAccessToken, clearAccessToken } = await import('@/shared/auth/token.ts');
    setAccessToken(FAKE_JWT);
    createOrganization.mockRejectedValueOnce(new Error('workspace create failed'));
    try {
      seedDoneStep(['a@acme.com']);
      renderWithProviders(<OnboardingPage />);
      const finishButton = await screen.findByTestId('onboarding-finish');

      await user.click(finishButton);

      // Failure surfaces in place, and the control is live again for the retry.
      expect(await screen.findByTestId('onboarding-finish-error')).toBeInTheDocument();
      expect(finishButton).toBeEnabled();
      expect(navigate).not.toHaveBeenCalled();
      expect(authApi.completeOnboarding).not.toHaveBeenCalled();

      await user.click(finishButton);

      await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
      expect(createOrganization).toHaveBeenCalledTimes(2); // the failure, then the retry
      expect(authApi.completeOnboarding).toHaveBeenCalledTimes(1);
      expect(inviteMember).toHaveBeenCalledTimes(1);
    } finally {
      clearAccessToken();
    }
  });

  // ── Containment: one crashing step body is not the whole wizard ────────────

  it('contains a crashing step body instead of blanking the wizard', async () => {
    // The boundary reports through console.error by design; silence it here.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    doneStepThrows.value = true;
    try {
      seedDoneStep();
      renderWithProviders(<OnboardingPage />);

      // The step body is replaced by the retryable section fallback…
      expect(await screen.findByTestId('onboarding-step-error')).toBeInTheDocument();
      // …while the wizard shell around it survives. Uncontained, this throw
      // escalates to the route boundary and takes the whole screen with it.
      expect(screen.getByTestId('onboarding-page')).toBeInTheDocument();
      expect(screen.getByTestId('onboarding-step-title')).toBeInTheDocument();
      expect(screen.getByTestId('onboarding-back')).toBeInTheDocument();
      expect(screen.getByTestId('onboarding-finish')).toBeInTheDocument();
    } finally {
      doneStepThrows.value = false;
      consoleSpy.mockRestore();
    }
  });

  // ── ONB-10: one read of the organization list, through the shared cache ────

  it('reads the organization list ONCE across the finish path', async () => {
    const user = userEvent.setup();
    // The resume shape both readers care about: a created-org id is persisted,
    // so the mount effect checks it still exists AND resolveOrganizationForFinish
    // checks again a moment later. Both used to call the API directly.
    listMyOrganizations.mockResolvedValue([
      { id: 'org_existing', name: 'Existing', slug: 'existing-slug', status: 'active' },
    ]);
    seedDoneStep();
    useOnboardingStore.getState().setCreatedOrganizationId('org_existing');
    useOnboardingStore.getState().setCreatedOrganizationSlug('existing-slug');
    switchToOrganization.mockImplementationOnce(async () =>
      ctxWithActive(teamOrg('existing-slug')),
    );
    renderWithProviders(<OnboardingPage />);

    await screen.findByTestId('onboarding-finish');
    await waitFor(() => expect(listMyOrganizations).toHaveBeenCalled());
    await user.click(screen.getByTestId('onboarding-finish'));
    await waitFor(() => expect(navigate).toHaveBeenCalled());

    // Two readers, one request — and it is in the cache the picker reads.
    expect(listMyOrganizations).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(['organizations'])).toEqual([
      { id: 'org_existing', name: 'Existing', slug: 'existing-slug', status: 'active' },
    ]);
  });

  // ── ONB-11: a failed profile save is best-effort, not invisible ────────────

  it('warns the user when the name could not be saved', async () => {
    const user = userEvent.setup();
    const warningSpy = vi.spyOn(notify, 'warning').mockImplementation(() => '');
    const { setAccessToken, clearAccessToken } = await import('@/shared/auth/token.ts');
    setAccessToken(FAKE_JWT);
    const { authApi } = await import('@/shared/api/auth-api.ts');
    vi.mocked(authApi.updateProfile).mockRejectedValueOnce(new Error('patch failed'));
    try {
      seedDoneStep();
      useOnboardingStore.getState().patch({ firstName: 'Ada', lastName: 'Lovelace' });
      renderWithProviders(<OnboardingPage />);

      await user.click(await screen.findByTestId('onboarding-finish'));

      // Onboarding still succeeds — the save is best-effort by contract...
      await waitFor(() => expect(navigate).toHaveBeenCalled());
      // ...but the user is told, instead of being greeted by their email prefix
      // on the dashboard with nothing anywhere to explain it.
      await waitFor(() =>
        expect(warningSpy).toHaveBeenCalledWith(
          expect.stringContaining('save your name'),
          expect.objectContaining({ id: 'onboarding-profile-save' }),
        ),
      );
    } finally {
      clearAccessToken();
    }
  });

  // ── ONB-2: nothing renders or submits on an unloaded me/context ────────────

  /** Put the wizard in the state ONB-2 describes: me/context failed to load. */
  function failMeContext() {
    liveContextRef.value = null;
    liveContextRef.isPending = false;
    liveContextRef.isError = true;
  }

  it('renders a retry instead of a wizard when me/context fails', async () => {
    // Before: `useDeploymentFlags` fell back to the permissive
    // DEFAULT_DEPLOYMENT_FLAGS and the steps were derived from a null context,
    // so the user got a plausible-looking wizard built on nothing.
    seedDoneStep();
    failMeContext();
    renderWithProviders(<OnboardingPage />);

    expect(await screen.findByTestId('onboarding-context-gate')).toBeInTheDocument();
    expect(screen.getByTestId('retry-error')).toBeInTheDocument();
    // No step list, no step body, and above all no way to finish.
    expect(screen.queryByTestId('onboarding-step-title')).not.toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-step-motion')).not.toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-finish')).not.toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-next')).not.toBeInTheDocument();
  });

  it('never stamps onboarding complete while me/context is failed', async () => {
    // The damaging half of ONB-2: the wizard ran to the end and POSTed
    // /users/me/onboarding/complete — which is not reversible from the UI —
    // leaving the user "onboarded" with no workspace.
    const user = userEvent.setup();
    const { authApi } = await import('@/shared/api/auth-api.ts');
    seedDoneStep(['a@acme.com']);
    failMeContext();
    renderWithProviders(<OnboardingPage />);

    await screen.findByTestId('onboarding-context-gate');
    // With the gate there is no finish button at all. The click is guarded so
    // this test still reproduces the old behaviour when run against the
    // unfixed component, where the button is present and pressing it commits.
    const finishButton = screen.queryByTestId('onboarding-finish');
    if (finishButton) await user.click(finishButton);

    expect(authApi.completeOnboarding).not.toHaveBeenCalled();
    expect(createOrganization).not.toHaveBeenCalled();
    expect(inviteMember).not.toHaveBeenCalled();
    expect(switchToOrganization).not.toHaveBeenCalled();
    expect(switchToPersonal).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('retries me/context in place instead of stranding the user', async () => {
    const user = userEvent.setup();
    seedDoneStep();
    failMeContext();
    renderWithProviders(<OnboardingPage />);

    await user.click(await screen.findByTestId('retry-button'));
    expect(refetchMeContext).toHaveBeenCalledTimes(1);
  });

  it('shows a skeleton, not a step list, while me/context is still loading', async () => {
    seedDoneStep();
    liveContextRef.value = null;
    liveContextRef.isPending = true;
    liveContextRef.isError = false;
    renderWithProviders(<OnboardingPage />);

    expect(await screen.findByTestId('onboarding-context-gate')).toBeInTheDocument();
    expect(screen.getByTestId('query-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-finish')).not.toBeInTheDocument();
  });

  it('does not fall back to a shorter flow when me/context fails', async () => {
    // Hybrid deployment, user already in a team: with the context LOADED step 3
    // is the invite step. Derived from a null context the invite step vanishes,
    // so index 3 clamps to 'done' — the old build showed a finished-looking
    // wizard that never asked for invites and let the user commit it.
    useHybridSession([teamOrg('acme')]);
    const store = useOnboardingStore.getState();
    store.reset();
    store.claimForUser(SESSION_USER_ID);
    store.setStepIndex(3);
    failMeContext();
    renderWithProviders(<OnboardingPage />);

    expect(await screen.findByTestId('onboarding-context-gate')).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-invite-email')).not.toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-finish')).not.toBeInTheDocument();
  });

  it('does not mention invitations when the flow sent none', async () => {
    // team-only default: the wizard creates the org, and no teammates were typed.
    const user = userEvent.setup();
    const successSpy = vi.spyOn(notify, 'success').mockImplementation(() => '');
    try {
      seedDoneStep();
      renderWithProviders(<OnboardingPage />);

      await user.click(await screen.findByTestId('onboarding-finish'));

      await waitFor(() => expect(navigate).toHaveBeenCalled());
      expect(successSpy).toHaveBeenCalledTimes(1);
      expect(successSpy.mock.calls[0]?.[0]).not.toMatch(/invitation/i);
    } finally {
      successSpy.mockRestore();
    }
  });

  // Regression (ONB-3): `stepIndex` is persisted and was NOT re-clamped when the
  // step list shrank, so the indicator marked every dot done with none current,
  // `aria-current="step"` vanished, and the first Back click was a no-op.
  it('clamps a stale persisted step index for the indicator and Back', async () => {
    const store = useOnboardingStore.getState();
    store.claimForUser('usr_clamp');
    store.setStepIndex(99); // far past the end of any step list

    renderWithProviders(<OnboardingPage />);
    await screen.findByTestId('onboarding-page');

    // Exactly one dot is current — the last real step, not "none".
    await waitFor(() =>
      expect(document.querySelectorAll('[aria-current="step"]')).toHaveLength(1),
    );
  });

  // Regression (ONB-6): the slug was free text with a live URL preview and no
  // validation, so an uppercase or spaced value passed Continue and only failed
  // at Finish, two steps away, as a generic toast.
  it('blocks Continue on an invalid workspace slug', async () => {
    const store = useOnboardingStore.getState();
    store.reset();
    store.claimForUser(SESSION_USER_ID);
    store.patch({ organizationName: 'Acme Inc.', organizationSlug: 'Not A Slug' });
    store.setStepIndex(3); // welcome/profile/questions/WORKSPACE/invite/done

    renderWithProviders(<OnboardingPage />);
    await screen.findByTestId('onboarding-organization-slug');

    expect(screen.getByTestId('onboarding-next')).toBeDisabled();
  });

  it('allows Continue once the slug is valid', async () => {
    const store = useOnboardingStore.getState();
    store.reset();
    store.claimForUser(SESSION_USER_ID);
    store.patch({ organizationName: 'Acme Inc.', organizationSlug: 'acme-inc' });
    store.setStepIndex(3);

    renderWithProviders(<OnboardingPage />);
    await screen.findByTestId('onboarding-organization-slug');

    expect(screen.getByTestId('onboarding-next')).not.toBeDisabled();
  });
});
