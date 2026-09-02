import { screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrganizationPermission } from '@/core/rbac/policies.ts';
import type { AuthUser } from '@/shared/auth/types.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { SettingsModal } from './SettingsModal.tsx';

vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));

const { useMeContextMock, notificationsPanelThrows } = vi.hoisted(() => ({
  useMeContextMock: vi.fn(),
  notificationsPanelThrows: { value: false },
}));
vi.mock('./account/AccountNotificationsPanel.tsx', async (importOriginal) => {
  const actual = await importOriginal<{ AccountNotificationsPanel: () => ReactNode }>();
  return {
    ...actual,
    AccountNotificationsPanel: () => {
      if (notificationsPanelThrows.value) throw new Error('Notifications panel crashed');
      return actual.AccountNotificationsPanel();
    },
  };
});
vi.mock('@/shared/hooks/useMeContext/index.ts', () => ({
  useMeContext: useMeContextMock,
  meContextQueryKey: ['auth', 'me-context'],
}));

const USER = { id: 'usr_1', email: 'u@e.com', role: 'user' } as AuthUser;
const ALL_PERMS: OrganizationPermission[] = [
  'organization:read',
  'membership:read',
  'role:read',
  'webhook:read',
];
const meCtx = (type: 'PERSONAL' | 'TEAM') => ({
  data: { activeOrganization: { type } },
  isPending: false,
  isLoading: false,
  isError: false,
});
/** Session context still in flight — the modal cannot know its own shape yet. */
const meCtxLoading = {
  data: undefined,
  isPending: true,
  isLoading: true,
  isError: false,
};

describe('SettingsModal', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: USER, isAuthenticated: true });
    useOrganizationStore.getState().clearOrganization();
    // default: context resolved with no active organization → permission-only
    // gating. (`isPending` matters now: see the SET-15 tests below.)
    useMeContextMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isLoading: false,
      isError: false,
    });
  });

  it('renders nothing without a settings hash', () => {
    renderWithProviders(<SettingsModal />);
    expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument();
  });

  it('opens at the section addressed by the hash', async () => {
    renderWithProviders(<SettingsModal />, {
      initialEntries: ['/#settings/account/profile'],
    });
    expect(await screen.findByTestId('settings-modal')).toBeInTheDocument();
    expect(screen.getByTestId('settings-section-profile')).toBeInTheDocument();
  });

  it('a team org shows member + role management in the nav', async () => {
    useOrganizationStore.getState().setOrganization('org_team', 'team');
    useOrganizationStore.getState().setPermissions(ALL_PERMS);
    useMeContextMock.mockReturnValue(meCtx('TEAM'));
    renderWithProviders(<SettingsModal />, {
      initialEntries: ['/#settings/organization/general'],
    });
    expect(
      await screen.findByTestId('settings-nav-organization-members'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('settings-nav-organization-roles')).toBeInTheDocument();
    expect(screen.getByTestId('settings-nav-account-billing')).toBeInTheDocument();
    expect(
      screen.queryByTestId('settings-nav-organization-billing'),
    ).not.toBeInTheDocument();
  });

  it('a personal org hides the entire organization settings group', async () => {
    useOrganizationStore.getState().setOrganization('org_personal', 'personal');
    useOrganizationStore.getState().setPermissions(ALL_PERMS);
    useMeContextMock.mockReturnValue(meCtx('PERSONAL'));
    renderWithProviders(<SettingsModal />, {
      initialEntries: ['/#settings/account/billing'],
    });
    expect(await screen.findByTestId('settings-nav-account-billing')).toBeInTheDocument();
    expect(
      screen.queryByTestId('settings-nav-organization-general'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('settings-nav-organization-members'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('settings-nav-organization-roles'),
    ).not.toBeInTheDocument();
  });

  it('redirects stale organization deep links to account profile with nav selected', async () => {
    useOrganizationStore.getState().setOrganization('org_personal', 'personal');
    useOrganizationStore.getState().setPermissions(ALL_PERMS);
    useOrganizationStore
      .getState()
      .setDeploymentContext(
        { personalOrganizations: true, teamOrganizations: false },
        'org_personal',
      );
    useMeContextMock.mockReturnValue(meCtx('PERSONAL'));
    const { router } = renderWithProviders(<SettingsModal />, {
      initialEntries: ['/#settings/organization/members'],
    });
    const profileNav = await screen.findByTestId('settings-nav-account-profile');
    expect(profileNav).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('settings-section-profile')).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.hash).toBe('settings/account/profile');
    });
  });

  it('rewrites malformed settings hashes to the canonical default deep link', async () => {
    const { router } = renderWithProviders(<SettingsModal />, {
      initialEntries: ['/#settings/account123/profile123123'],
    });
    expect(await screen.findByTestId('settings-section-profile')).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.hash).toBe('settings/account/profile');
    });
  });

  it('rewrites a bare settings hash to account profile', async () => {
    const { router } = renderWithProviders(<SettingsModal />, {
      initialEntries: ['/#settings'],
    });
    expect(await screen.findByTestId('settings-section-profile')).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.hash).toBe('settings/account/profile');
    });
  });

  it('preserves page query params when canonicalizing the settings hash', async () => {
    const { router } = renderWithProviders(<SettingsModal />, {
      initialEntries: ['/?foo=bar#settings/account123/profile123'],
    });
    expect(await screen.findByTestId('settings-section-profile')).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.hash).toBe('settings/account/profile');
      expect(router.state.location.search).toEqual({ foo: 'bar' });
    });
  });

  // A panel that throws must not take the settings modal — or the page behind
  // it — with it. The boundary lives in ActivePanel, one per section.
  it('contains a crashing panel inside the settings modal', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    notificationsPanelThrows.value = true;
    try {
      renderWithProviders(<SettingsModal />, {
        initialEntries: ['/#settings/account/notifications'],
      });

      // The section is replaced by a retryable fallback…
      expect(
        await screen.findByTestId('settings-panel-error-notifications'),
      ).toBeInTheDocument();
      // …while the modal shell around it survives: nav, header, the lot.
      expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
      expect(screen.getByTestId('settings-content')).toBeInTheDocument();
      expect(
        screen.queryByTestId('settings-section-notifications'),
      ).not.toBeInTheDocument();
    } finally {
      notificationsPanelThrows.value = false;
      consoleSpy.mockRestore();
    }
  });

  // ── SET-15: the rail does not guess its own shape ────────────────────────

  it('holds a skeleton rail until the session context lands', async () => {
    // Regression: WHICH organization sections exist depends on the org TYPE, and
    // an unknown type was read as "allow everything" — so the Organization group
    // painted in full and was then deleted in front of the user.
    useOrganizationStore.getState().setOrganization('org_x', 'acme');
    useOrganizationStore.getState().setPermissions(ALL_PERMS);
    useMeContextMock.mockReturnValue(meCtxLoading);
    renderWithProviders(<SettingsModal />, {
      initialEntries: ['/#settings/account/profile'],
    });

    // The modal is open and sized — it just does not claim a shape yet.
    expect(await screen.findByTestId('settings-modal')).toBeInTheDocument();
    expect(screen.getByTestId('settings-nav-loading')).toBeInTheDocument();
    expect(screen.getByTestId('settings-content-loading')).toBeInTheDocument();
    expect(
      screen.queryByTestId('settings-nav-organization-members'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('settings-nav-organization-roles'),
    ).not.toBeInTheDocument();
  });

  it('never opens an organization deep link before the org type is known', async () => {
    // The members panel used to render on the optimistic answer and then swap
    // itself for a fallback section a beat later.
    useOrganizationStore.getState().setOrganization('org_x', 'acme');
    useOrganizationStore.getState().setPermissions(ALL_PERMS);
    useMeContextMock.mockReturnValue(meCtxLoading);
    const { router } = renderWithProviders(<SettingsModal />, {
      initialEntries: ['/#settings/organization/members'],
    });

    expect(await screen.findByTestId('settings-nav-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-organization-members')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-content')).not.toBeInTheDocument();
    // …and the hash is untouched, so the link still resolves once the context is in.
    expect(router.state.location.hash).toBe('settings/organization/members');
  });

  it('renders normally once the context resolves, with no organization group', async () => {
    useOrganizationStore.getState().setOrganization('org_personal', 'personal');
    useOrganizationStore.getState().setPermissions(ALL_PERMS);
    useMeContextMock.mockReturnValue(meCtx('PERSONAL'));
    renderWithProviders(<SettingsModal />, {
      initialEntries: ['/#settings/account/profile'],
    });

    expect(await screen.findByTestId('settings-nav-account-profile')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-nav-loading')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('settings-nav-organization-members'),
    ).not.toBeInTheDocument();
  });
});
