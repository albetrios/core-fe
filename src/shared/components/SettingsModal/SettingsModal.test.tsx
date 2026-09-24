import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
  'subscription:read',
  'api-key:read',
];
const meCtx = (type: 'PERSONAL' | 'TEAM') => ({
  // `user` is required on MeContext whenever `data` is present, and the panels read it
  // unguarded (EmailVerificationBanner, the profile avatar). A fixture that omits it
  // stands in for a shape the API cannot return, and crashes the section under test.
  data: { activeOrganization: { type }, user: { avatarUrl: null } },
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
  // Every section is `lazy(() => import(...))`. Without this, the first case to
  // open a panel paid its cold transform (React Compiler pass included) inside
  // its 1 s `findByTestId` wait, and a busy machine overran it: account/account
  // and account/security, first in the table below, failed 3 runs out of 3 under
  // full CPU load. Importing the panels here moves that cost out of the assertions.
  beforeAll(async () => {
    await Promise.all([
      import('./account/AccountProfilePanel.tsx'),
      import('./account/AccountPanel.tsx'),
      import('./account/AccountSecurityPanel.tsx'),
      import('./account/AccountNotificationsPanel.tsx'),
      import('./account/AccountSessionsPanel.tsx'),
      import('./account/AccountBillingPanel.tsx'),
      import('./organization/OrganizationGeneralPanel.tsx'),
      import('./organization/OrganizationMembersPanel.tsx'),
      import('./organization/OrganizationRolesPanel.tsx'),
      import('./organization/OrganizationIntegrationsPanel.tsx'),
    ]);
    // Ten cold transforms at once, on a loaded machine, can outlast the 10 s
    // default hook timeout.
  }, 30_000);

  beforeEach(() => {
    useAuthStore.setState({ user: USER, isAuthenticated: true });
    useOrganizationStore.getState().clearOrganization();
    useMeContextMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isLoading: false,
      isError: false,
    });
  });

  it.each([
    ['account/account', 'settings-section-account'],
    ['account/security', 'settings-section-security'],
    ['account/sessions', 'settings-account-sessions'],
    ['account/billing', 'settings-account-billing'],
    ['organization/general', 'settings-section-org-general'],
    ['organization/members', 'settings-organization-members'],
    ['organization/roles', 'settings-organization-roles'],
    ['account/integrations', 'settings-organization-integrations'],
  ])(
    'loads the selected content inside the persistent shell: %s',
    async (section, id) => {
      useOrganizationStore.getState().setOrganization('org_team', 'acme');
      useOrganizationStore.getState().setPermissions(ALL_PERMS);
      useMeContextMock.mockReturnValue(meCtx('TEAM'));
      renderWithProviders(<SettingsModal />, {
        initialEntries: [`/#settings/${section}`],
      });
      expect(await screen.findByTestId(id)).toBeInTheDocument();
      expect(screen.getByTestId('settings-search')).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Close', exact: true })).toBeEnabled();
    },
  );

  it('can change sections while context is pending without losing the shell', async () => {
    useMeContextMock.mockReturnValue(meCtxLoading);
    const { router } = renderWithProviders(<SettingsModal />, {
      initialEntries: ['/#settings/account/profile'],
    });
    fireEvent.click(await screen.findByTestId('settings-nav-account-security'));
    await waitFor(() =>
      expect(router.state.location.hash).toBe('settings/account/security'),
    );
    expect(screen.getByTestId('settings-content-loading')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close', exact: true })).toBeEnabled();

    // Two things at once, because `onceAsync` caches each panel's chunk for the
    // whole file: only the first test to switch sections ever reaches this
    // fallback. (1) There is ONE skeleton and no visible copy — the line that
    // used to sit here advanced through three strings while a single panel
    // loaded. (2) The announcement survives, `sr-only` and polite, and still
    // NAMES the section, so a slow panel says which one rather than a bare
    // "Loading" (carried over from #329).
    expect(
      screen.queryByTestId('settings-content-loading-label'),
    ).not.toBeInTheDocument();
    const region = screen.getByTestId('settings-content-loading');
    const live = region.querySelector('output[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live).toHaveClass('sr-only');
    expect(live).toHaveTextContent(/Security/);
  });

  it('renders nothing without a settings hash', () => {
    renderWithProviders(<SettingsModal />);
    expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument();
  });

  it('is a sheet on phones and a gutter-ed, token-rounded dialog from sm up', async () => {
    // Regression, twice over: `w-full` with only a `max-w` left the modal flush
    // against both edges between 640px and 960px (every tablet), and an
    // unconditional `rounded-none` kept it square on desktop under EVERY radius
    // setting. The dialog slot is what squares it again under the Sharp shape.
    renderWithProviders(<SettingsModal />, {
      initialEntries: ['/#settings/account/profile'],
    });

    const dialog = await screen.findByTestId('settings-modal');
    expect(dialog).toHaveClass('sm:w-[calc(100%-2rem)]', 'sm:max-w-[960px]');
    expect(dialog).toHaveClass('sm:rounded-lg');
    expect(dialog).toHaveClass('3xl:h-[760px]', '3xl:max-w-[1120px]');
    expect(dialog).toHaveAttribute('data-slot', 'dialog-content');
    // Only the phone sheet is square by construction.
    const rounded = [...dialog.classList].filter((name) => name.includes('rounded-none'));
    expect(rounded.every((name) => !name.startsWith('sm:'))).toBe(true);
  });

  it('gives every pane the standard dialog inset, on the spacing scale', async () => {
    // One inset for the whole modal (it was 12px / 32px / 12px-over-16px), written
    // as scale steps so the theme's Density setting moves it with every other
    // dialog's `p-6`.
    renderWithProviders(<SettingsModal />, {
      initialEntries: ['/#settings/account/profile'],
    });

    const content = await screen.findByTestId('settings-content');
    expect(content).toHaveClass('px-4', 'sm:px-6', 'sm:pb-6');
    expect(content).not.toHaveClass('sm:px-8');

    // Phone sheet: the section picker starts on the content's gutter, so it and
    // the fields under it share a left edge.
    const picker = screen.getByTestId('settings-mobile-section').parentElement;
    expect(picker).toHaveClass('ps-4', 'sm:hidden');
    // Reserves room for the dialog's close button, which is pinned on the
    // logical end too — so the two mirror together under RTL. They did not: the
    // button was physical (`right-4`) while this was logical, which put them on
    // opposite sides in Arabic and Hebrew and ran the picker under the X; fixed
    // in `ui/dialog.tsx`, since every dialog had it. 14 rather than 12 leaves
    // the pane's own 16px gutter between the two instead of flush (QA-V3
    // suggestion 7: "the dropdown plus close icon feels tight").
    expect(picker).toHaveClass('pe-14');
    expect(picker).not.toHaveClass('pe-12');
    // And never physical — `validate:logical` is the CI half of this contract.
    expect(picker?.className ?? '').not.toMatch(/\bp[lr]-/);

    // The other side of that reservation: the button it makes room for. It sits
    // in vendored `ui/`, which `validate:logical` exempts — so nothing else
    // would catch it going back to upstream's physical `right-4`, and the
    // picker's logical inset would silently stop lining up under RTL.
    const close = screen.getByRole('button', { name: 'Close', exact: true });
    expect(close).toHaveClass('end-4');
    expect(close.className).not.toMatch(/\b(right|left)-4\b/);

    for (const pane of [content, picker]) {
      expect(pane?.className ?? '').not.toMatch(/\bp[xysetb]?-\[/);
    }
  });

  it('opens at the section addressed by the hash', async () => {
    renderWithProviders(<SettingsModal />, {
      initialEntries: ['/#settings/account/profile'],
    });
    expect(await screen.findByTestId('settings-modal')).toBeInTheDocument();
    expect(await screen.findByTestId('settings-section-profile')).toBeInTheDocument();
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
    expect(await screen.findByTestId('settings-section-profile')).toBeInTheDocument();
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

  it('keeps account navigation usable while organization context loads', async () => {
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
    expect(screen.getByTestId('settings-nav-account-profile')).toBeInTheDocument();
    expect(screen.getByTestId('settings-search')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Close', exact: true })).toBeEnabled();
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

    expect(await screen.findByTestId('settings-nav-account-profile')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-organization-members')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-content-loading')).toBeInTheDocument();
    // …and the hash is untouched, so the link still resolves once the context is in.
    expect(router.state.location.hash).toBe('settings/organization/members');
  });

  // ── The other half of "context ready": the permission set ─────────────────
  // Entering an organization clears the store's permissions a beat before the
  // real set lands (`ensurePermissionsFor` → `clearPermissions()`). For that beat
  // `permissions` is `[]` and `permissionsResolved` is false: "not known yet".

  it('never rewrites an organization deep link while permissions are unresolved', async () => {
    // Regression, measured in a browser: me/context already said TEAM, but the
    // store held 0 permissions for ~40 ms. The modal read that as an answer, hid
    // the Organization group, resolved the link to the fallback and REWROTE THE
    // URL to `account/profile` — 19 ms after the deep link, ~50 ms before the
    // permissions arrived. Permanently: the nav then showed the Organization
    // group, with the user parked on Profile.
    useOrganizationStore.getState().setOrganization('org_team', 'acme');
    useOrganizationStore.getState().clearPermissions();
    useMeContextMock.mockReturnValue(meCtx('TEAM'));
    const { router } = renderWithProviders(<SettingsModal />, {
      initialEntries: ['/#settings/organization/general'],
    });

    expect(await screen.findByTestId('settings-content-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-section-profile')).not.toBeInTheDocument();
    expect(router.state.location.hash).toBe('settings/organization/general');
  });

  it('opens that deep link once the permissions arrive', async () => {
    useOrganizationStore.getState().setOrganization('org_team', 'acme');
    useOrganizationStore.getState().clearPermissions();
    useMeContextMock.mockReturnValue(meCtx('TEAM'));
    const { router } = renderWithProviders(<SettingsModal />, {
      initialEntries: ['/#settings/organization/general'],
    });
    expect(await screen.findByTestId('settings-content-loading')).toBeInTheDocument();

    act(() => useOrganizationStore.getState().setPermissions(ALL_PERMS));

    expect(await screen.findByTestId('settings-section-org-general')).toBeInTheDocument();
    expect(screen.getByTestId('settings-nav-organization-members')).toBeInTheDocument();
    expect(router.state.location.hash).toBe('settings/organization/general');
  });

  it('still falls back when the ANSWER is no — a resolved set without the grant', async () => {
    // Waiting is not the same as allowing: once the set is resolved and the
    // section is genuinely out of reach, the link is canonicalized as before.
    useOrganizationStore.getState().setOrganization('org_team', 'acme');
    useOrganizationStore.getState().clearPermissions();
    useMeContextMock.mockReturnValue(meCtx('TEAM'));
    const { router } = renderWithProviders(<SettingsModal />, {
      initialEntries: ['/#settings/organization/general'],
    });
    expect(await screen.findByTestId('settings-content-loading')).toBeInTheDocument();

    act(() => useOrganizationStore.getState().setPermissions([]));

    await waitFor(() =>
      expect(router.state.location.hash).toBe('settings/account/profile'),
    );
    expect(await screen.findByTestId('settings-section-profile')).toBeInTheDocument();
  });

  it('does not wait for permissions that can never arrive (me/context has no data)', async () => {
    // The set is derived FROM me/context. A fetch that settled without data will
    // never produce one, and a modal stuck on its skeleton is worse than one
    // gated on whatever the store holds.
    useOrganizationStore.getState().clearPermissions();
    useMeContextMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isLoading: false,
      isError: true,
    });
    renderWithProviders(<SettingsModal />, {
      initialEntries: ['/#settings/account/profile'],
    });

    expect(await screen.findByTestId('settings-section-profile')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-content-loading')).not.toBeInTheDocument();
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
