import { isNotFound, isRedirect } from '@tanstack/react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryClient } from '@/core/http/queryClient.ts';
import { useOnboardingStore } from '@/shared/store/useOnboardingStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { type MeContext, meContextQueryKey } from '@/shared/tenancy/me-context.ts';
import type * as MyOrganizationsModule from '@/shared/tenancy/my-organizations.ts';
import { resetPermissionCacheForTests } from '@/shared/tenancy/organization-membership.ts';

import {
  requireActiveOrganization,
  requireOnboardingWorkspace,
  requireOrganizationContext,
  requirePersonalOrganizationsDeployment,
  requireProvisionedPersonalDashboard,
  requireProvisionedTeamWorkspace,
  requireTeamOrganizationsDeployment,
} from './route-guards.ts';

vi.mock('@/shared/tenancy/session-context.ts', () => ({
  ensureSessionContext: vi.fn(),
}));

vi.mock('@/core/config/env.ts', () => ({
  platformConfig: {
    disabledModules: new Set<string>(),
    deploymentOverrides: { personalOrganizations: null, teamOrganizations: null },
  },
}));

import { platformConfig } from '@/core/config/env.ts';
import { ensureSessionContext } from '@/shared/tenancy/session-context.ts';

vi.mock('@/shared/tenancy/my-organizations.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof MyOrganizationsModule>();
  return {
    ...actual,
    listMyOrganizations: vi
      .fn()
      .mockResolvedValue([{ id: 'org_acme', name: 'Acme Inc.', slug: 'acme' }]),
  };
});

vi.mock('@/shared/api/organization-api.ts', () => ({
  getMyPermissions: vi.fn().mockResolvedValue(['organization:read']),
}));

const { switchToOrganizationMock } = vi.hoisted(() => ({
  switchToOrganizationMock: vi.fn(),
}));
vi.mock('@/shared/tenancy/switch.ts', () => ({
  switchToOrganization: switchToOrganizationMock,
}));

function seedActiveOrg(id: string) {
  queryClient.setQueryData(meContextQueryKey, {
    activeOrganization: { id },
    organizations: [
      {
        id: 'org_acme',
        name: 'Acme Inc.',
        slug: 'acme',
        type: 'TEAM',
        status: 'ACTIVE',
        logoUrl: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        isActive: true,
      },
    ],
  } as unknown as MeContext);
}

function thrownBy(fn: () => void): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('requireOrganizationContext', () => {
  beforeEach(() => {
    resetPermissionCacheForTests();
    useOrganizationStore.getState().clearOrganization();
    queryClient.removeQueries({ queryKey: meContextQueryKey });
    switchToOrganizationMock.mockReset();
    switchToOrganizationMock.mockResolvedValue(undefined);
    localStorage.clear();
  });

  it('throws notFound for a malformed slug — no fetch, no existence leak', async () => {
    await expect(requireOrganizationContext('NOT-A-SLUG')).rejects.toSatisfy(isNotFound);
  });

  it('throws notFound when the user is not a member of the organization', async () => {
    await expect(requireOrganizationContext('stranger')).rejects.toSatisfy(isNotFound);
  });

  it('syncs the derived store from the URL and loads permissions for members', async () => {
    const organization = await requireOrganizationContext('acme');

    expect(organization.slug).toBe('acme');
    expect(useOrganizationStore.getState().organizationId).toBe('org_acme');
    expect(useOrganizationStore.getState().organizationSlug).toBe('acme');
    expect(useOrganizationStore.getState().permissions).toEqual(['organization:read']);
  });

  it('switches the active org when the URL targets a different org (FE-24)', async () => {
    seedActiveOrg('org_personal');
    await requireOrganizationContext('acme');
    expect(switchToOrganizationMock).toHaveBeenCalledWith('org_acme');
  });

  it('does not switch when the URL org is already the active one', async () => {
    seedActiveOrg('org_acme');
    await requireOrganizationContext('acme');
    expect(switchToOrganizationMock).not.toHaveBeenCalled();
  });
});

describe('requireActiveOrganization', () => {
  beforeEach(() => {
    useOrganizationStore.getState().clearOrganization();
  });

  it('passes for active organizations when the store matches the URL slug', () => {
    useOrganizationStore.getState().setOrganization('org_acme', 'acme', 'active');
    expect(() => requireActiveOrganization('acme')).not.toThrow();
  });

  it('throws notFound when org context is not synced for the URL slug', () => {
    useOrganizationStore.getState().setOrganization('org_acme', 'other', 'active');
    expect(() => requireActiveOrganization('acme')).toThrow();
  });

  it('redirects suspended organizations to the suspended page', () => {
    useOrganizationStore.getState().setOrganization('org_acme', 'acme', 'suspended');
    const thrown = thrownBy(() => requireActiveOrganization('acme'));
    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({
      options: {
        to: '/organization/$organizationSlug/suspended',
        params: { organizationSlug: 'acme' },
      },
    });
  });
});

describe('deployment mode guards', () => {
  beforeEach(() => {
    useOrganizationStore.getState().clearOrganization();
    platformConfig.deploymentOverrides = {
      personalOrganizations: null,
      teamOrganizations: null,
    };
  });

  it('requireTeamOrganizationsDeployment redirects personal-only to /dashboard', () => {
    useOrganizationStore
      .getState()
      .setDeploymentContext(
        { personalOrganizations: true, teamOrganizations: false },
        'org_personal',
      );
    const thrown = thrownBy(() => requireTeamOrganizationsDeployment());
    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({ options: { to: '/dashboard' } });
  });

  it('requirePersonalOrganizationsDeployment redirects team-only to /', () => {
    useOrganizationStore
      .getState()
      .setDeploymentContext(
        { personalOrganizations: false, teamOrganizations: true },
        null,
      );
    const thrown = thrownBy(() => requirePersonalOrganizationsDeployment());
    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({ options: { to: '/' } });
  });

  it('passes when both deployment modes are enabled', () => {
    useOrganizationStore
      .getState()
      .setDeploymentContext(
        { personalOrganizations: true, teamOrganizations: true },
        'org_personal',
      );
    expect(() => requireTeamOrganizationsDeployment()).not.toThrow();
    expect(() => requirePersonalOrganizationsDeployment()).not.toThrow();
  });

  it('env override restricts pre-network even when the store holds permissive defaults', () => {
    // Cold navigation: store still has DEFAULT_DEPLOYMENT_FLAGS (both true) because
    // me/context has not hydrated yet — only the env override should restrict.
    platformConfig.deploymentOverrides = {
      personalOrganizations: null,
      teamOrganizations: false,
    };
    const thrown = thrownBy(() => requireTeamOrganizationsDeployment());
    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({ options: { to: '/dashboard' } });
  });

  it('team-only env override redirects the personal dashboard guard to /', () => {
    platformConfig.deploymentOverrides = {
      personalOrganizations: false,
      teamOrganizations: null,
    };
    const thrown = thrownBy(() => requirePersonalOrganizationsDeployment());
    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({ options: { to: '/' } });
  });
});

describe('workspace provision guards', () => {
  beforeEach(() => {
    vi.mocked(ensureSessionContext).mockReset();
  });

  it('requireProvisionedPersonalDashboard redirects to onboarding when no orgs yet', async () => {
    vi.mocked(ensureSessionContext).mockResolvedValue({
      user: { onboardingCompleted: false } as MeContext['user'],
      activeOrganization: null,
      organizations: [],
      deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
    } as MeContext);

    await expect(requireProvisionedPersonalDashboard()).rejects.toSatisfy(isRedirect);
    await expect(requireProvisionedPersonalDashboard()).rejects.toMatchObject({
      options: { to: '/onboarding' },
    });
  });

  it('requireProvisionedPersonalDashboard passes when personal org is active', async () => {
    vi.mocked(ensureSessionContext).mockResolvedValue({
      user: { onboardingCompleted: true } as MeContext['user'],
      activeOrganization: { id: 'org_p', type: 'PERSONAL', slug: null, status: 'ACTIVE' },
      deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
    } as MeContext);

    await expect(requireProvisionedPersonalDashboard()).resolves.toBeUndefined();
  });

  it('requireProvisionedTeamWorkspace redirects to onboarding when no orgs yet', async () => {
    vi.mocked(ensureSessionContext).mockResolvedValue({
      user: { onboardingCompleted: false } as MeContext['user'],
      activeOrganization: null,
      organizations: [],
      deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
    } as MeContext);

    await expect(requireProvisionedTeamWorkspace()).rejects.toMatchObject({
      options: { to: '/onboarding' },
    });
  });

  it('requireProvisionedTeamWorkspace lets a personal-active session into a team slug', async () => {
    // Regression: this used to throw redirect({ to: '/dashboard' }) BEFORE the
    // slug chain could run switch-on-navigation, so the org switcher, command
    // palette, and direct team URLs were all dead ends once the personal org
    // was active — the user could never re-enter any team workspace.
    vi.mocked(ensureSessionContext).mockResolvedValue({
      user: { onboardingCompleted: true } as MeContext['user'],
      activeOrganization: { id: 'org_p', type: 'PERSONAL', slug: null, status: 'ACTIVE' },
      organizations: [],
      deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
    } as MeContext);

    await expect(requireProvisionedTeamWorkspace()).resolves.toBeUndefined();
  });

  it('onboarding redirects carry the guarded deep link as ?redirect=', async () => {
    vi.mocked(ensureSessionContext).mockResolvedValue({
      user: { onboardingCompleted: false } as MeContext['user'],
      activeOrganization: null,
      organizations: [],
      deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
    } as MeContext);

    await expect(
      requireProvisionedTeamWorkspace({ redirectFrom: '/organization/acme/dashboard' }),
    ).rejects.toMatchObject({
      options: {
        to: '/onboarding',
        search: { redirect: '/organization/acme/dashboard' },
      },
    });
    await expect(
      requireProvisionedPersonalDashboard({ redirectFrom: '/dashboard' }),
    ).rejects.toMatchObject({
      options: { to: '/onboarding', search: { redirect: '/dashboard' } },
    });
  });

  it('requireOnboardingWorkspace passes when onboarding is required (no orgs)', async () => {
    vi.mocked(ensureSessionContext).mockResolvedValue({
      user: { onboardingCompleted: false } as MeContext['user'],
      activeOrganization: null,
      organizations: [],
      deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
    } as MeContext);

    await expect(requireOnboardingWorkspace()).resolves.toBeUndefined();
  });

  // Regression (ONB-4): the wizard's persisted store is bound to the signed-in
  // user HERE, before the page renders. Done from an effect inside the page, a
  // store left by a different user on this browser painted their name and
  // workspace for a frame before the wipe.
  it('requireOnboardingWorkspace claims the wizard store before the page renders', async () => {
    const store = useOnboardingStore.getState();
    store.claimForUser('usr_previous');
    store.patch({ firstName: 'Prev' });
    store.setStepIndex(2);

    vi.mocked(ensureSessionContext).mockResolvedValue({
      user: { id: 'usr_next', onboardingCompleted: false } as MeContext['user'],
      activeOrganization: null,
      organizations: [],
      deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
    } as MeContext);

    await requireOnboardingWorkspace();

    const state = useOnboardingStore.getState();
    expect(state.forUserId).toBe('usr_next');
    expect(state.stepIndex).toBe(0);
    expect(state.data.firstName).toBe('');
  });

  it('requireOnboardingWorkspace redirects away when user already has org memberships', async () => {
    vi.mocked(ensureSessionContext).mockResolvedValue({
      user: { onboardingCompleted: true } as MeContext['user'],
      activeOrganization: null,
      organizations: [
        {
          id: 'org_p',
          type: 'PERSONAL',
          slug: null,
          status: 'ACTIVE',
          name: 'Personal',
          logoUrl: null,
          createdAt: 't',
          updatedAt: 't',
          isActive: false,
        },
      ],
      deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
    } as MeContext);

    await expect(requireOnboardingWorkspace()).rejects.toMatchObject({
      options: { to: '/dashboard' },
    });
  });

  it('requireOnboardingWorkspace redirects to dashboard when personal org is active', async () => {
    vi.mocked(ensureSessionContext).mockResolvedValue({
      user: { onboardingCompleted: true } as MeContext['user'],
      activeOrganization: { id: 'org_p', type: 'PERSONAL', slug: null, status: 'ACTIVE' },
      deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
    } as MeContext);

    await expect(requireOnboardingWorkspace()).rejects.toMatchObject({
      options: { to: '/dashboard' },
    });
  });

  it('requireOnboardingWorkspace redirects to team dashboard when team org is active', async () => {
    vi.mocked(ensureSessionContext).mockResolvedValue({
      user: { onboardingCompleted: true } as MeContext['user'],
      activeOrganization: {
        id: 'org_t',
        type: 'TEAM',
        slug: 'acme',
        status: 'ACTIVE',
      },
      // A member landing on the team dashboard can read the org.
      myPermissions: ['organization:read'],
      deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
    } as MeContext);

    await expect(requireOnboardingWorkspace()).rejects.toMatchObject({
      options: {
        to: '/organization/$organizationSlug/dashboard',
        params: { organizationSlug: 'acme' },
      },
    });
  });
});
