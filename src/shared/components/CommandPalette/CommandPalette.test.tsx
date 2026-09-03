import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import { useUIStore } from '@/shared/store/useUIStore/index.ts';
import type { MeContext } from '@/shared/tenancy/me-context.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { CommandPalette, PALETTE_LOGOUT_TOAST_ID } from './CommandPalette.tsx';
import { PALETTE_SWITCH_TOAST_ID } from './CommandPaletteOrgGroup.tsx';

const {
  useMeContextMock,
  navigateMock,
  logoutMock,
  switchToPersonalMock,
  notifyErrorMock,
  reportErrorMock,
} = vi.hoisted(() => ({
  useMeContextMock: vi.fn(),
  navigateMock: vi.fn(),
  logoutMock: vi.fn(),
  switchToPersonalMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  reportErrorMock: vi.fn(),
}));
vi.mock('@/shared/auth/service.ts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, logout: logoutMock };
});
vi.mock('@/shared/tenancy/switch.ts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, switchToPersonal: switchToPersonalMock };
});
vi.mock('@/shared/notify/index.ts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const notify = actual.notify as Record<string, unknown>;
  return { ...actual, notify: { ...notify, error: notifyErrorMock } };
});
vi.mock('@/shared/errors/errorHandler.ts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, reportError: reportErrorMock };
});
vi.mock('@/shared/hooks/useMeContext/index.ts', () => ({
  useMeContext: useMeContextMock,
}));
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, useNavigate: () => navigateMock };
});

/** Minimal me/context the palette reads: active-org type + the org list. */
function meContext(orgType: 'TEAM' | 'PERSONAL'): MeContext {
  return {
    activeOrganization: { type: orgType },
    organizations: [],
  } as unknown as MeContext;
}

/** A personal workspace has NO slug — that is the whole point of SHELL-12. */
const PERSONAL_ORG = {
  id: 'org_personal',
  name: 'Ada Lovelace',
  slug: null,
  type: 'PERSONAL' as const,
  isActive: false,
};
const TEAM_ORG = {
  id: 'org_acme',
  name: 'Acme Inc.',
  slug: 'acme',
  type: 'TEAM' as const,
  isActive: true,
};

function meContextWithBoth(): MeContext {
  return {
    activeOrganization: { type: 'TEAM' },
    organizations: [TEAM_ORG, PERSONAL_ORG],
  } as unknown as MeContext;
}

describe('CommandPalette', () => {
  beforeAll(() => {
    // cmdk scrolls the selected item into view; jsdom has no scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    useUIStore.setState({ commandPaletteOpen: true });
    useOrganizationStore.setState({ permissions: [] });
    useMeContextMock.mockReturnValue({ data: meContext('TEAM') });
    navigateMock.mockClear();
    navigateMock.mockResolvedValue(undefined);
    // Reset call counts too, not just implementations: these are module-level
    // mocks, so a `toHaveBeenCalledTimes` assertion otherwise counts earlier
    // tests' calls and only fails when the file runs as a whole.
    logoutMock.mockReset();
    logoutMock.mockResolvedValue(undefined);
    switchToPersonalMock.mockReset();
    switchToPersonalMock.mockResolvedValue(undefined);
    notifyErrorMock.mockClear();
    reportErrorMock.mockClear();
    useOrganizationStore.setState({
      deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
    });
  });

  it('renders navigation and settings commands when open', async () => {
    renderWithProviders(<CommandPalette />);

    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('User settings')).toBeInTheDocument();
    expect(screen.getByText('Organization settings')).toBeInTheDocument();
  });

  it('navigates to organization settings when the command is selected', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette />);

    await user.click(await screen.findByText('Organization settings'));

    expect(navigateMock).toHaveBeenCalledWith(expect.objectContaining({ to: '.' }));
  });

  // F2: settings destinations are searchable in the palette (were "No results").
  it('lists settings destinations as searchable commands', async () => {
    useOrganizationStore.setState({ permissions: ['organization:read'] });
    renderWithProviders(<CommandPalette />);

    // Account sections need only a signed-in user; Billing needs organization:read.
    expect(await screen.findByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
  });

  it('finds a settings section by keyword (billing → Billing)', async () => {
    useOrganizationStore.setState({ permissions: ['organization:read'] });
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette />);

    await user.type(
      await screen.findByPlaceholderText('Type a command or search...'),
      'billing',
    );

    expect(await screen.findByText('Billing')).toBeInTheDocument();
    expect(screen.queryByText('Profile')).not.toBeInTheDocument();
  });

  it('navigates to a settings section when selected', async () => {
    useOrganizationStore.setState({ permissions: ['organization:read'] });
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette />);

    await user.click(await screen.findByText('Billing'));

    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: '.', hash: expect.stringContaining('billing') }),
    );
  });

  // Regression (F4): Organization settings has no sections on a personal workspace
  // (it would just fall back to account/profile), so the command must be hidden.
  it('hides Organization settings on a personal workspace', async () => {
    useMeContextMock.mockReturnValue({ data: meContext('PERSONAL') });
    renderWithProviders(<CommandPalette />);

    expect(await screen.findByText('User settings')).toBeInTheDocument();
    expect(screen.queryByText('Organization settings')).not.toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    useUIStore.setState({ commandPaletteOpen: false });
    renderWithProviders(<CommandPalette />);
    expect(screen.queryByText('User settings')).not.toBeInTheDocument();
  });

  describe('SHELL-7 — closing the palette hands focus back', () => {
    /**
     * Mirrors CommandPaletteLazy: the palette is UNMOUNTED the instant `open`
     * flips false. That is the whole bug — an effect body that waits for a
     * render with `open === false` never gets one, so only cleanup can restore.
     */
    function Harness({ showOpener = true }: { showOpener?: boolean }) {
      const open = useUIStore((s) => s.commandPaletteOpen);
      return (
        <>
          {showOpener ? (
            <button type="button" data-testid="opener">
              Search
            </button>
          ) : null}
          {open ? <CommandPalette /> : null}
        </>
      );
    }

    it('returns focus to whatever had it, instead of dropping it on <body>', async () => {
      useUIStore.setState({ commandPaletteOpen: false });
      renderWithProviders(<Harness />);

      const opener = await screen.findByTestId('opener');
      opener.focus();
      expect(document.activeElement).toBe(opener);

      act(() => useUIStore.getState().setCommandPaletteOpen(true));
      await screen.findByPlaceholderText(/type a command or search/i);

      // Close exactly as the app does — the component is removed, not re-rendered.
      act(() => useUIStore.getState().setCommandPaletteOpen(false));

      expect(document.activeElement).toBe(opener);
      expect(document.activeElement).not.toBe(document.body);
    });

    it('does not fight for focus when the trigger is gone (navigated away)', async () => {
      useUIStore.setState({ commandPaletteOpen: false });
      const { rerender } = renderWithProviders(<Harness />);

      const opener = await screen.findByTestId('opener');
      opener.focus();
      act(() => useUIStore.getState().setCommandPaletteOpen(true));
      await screen.findByPlaceholderText(/type a command or search/i);

      // Selecting a palette item navigates away, so the trigger is gone by the
      // time the palette closes — exactly the case a naive restore would focus
      // a detached node and drop focus anyway.
      rerender(<Harness showOpener={false} />);
      expect(opener.isConnected).toBe(false);

      expect(() =>
        act(() => useUIStore.getState().setCommandPaletteOpen(false)),
      ).not.toThrow();

      // Whatever holds focus, it is a node that is actually in the document.
      expect(document.activeElement?.isConnected).toBe(true);
    });
  });

  describe('SHELL-12 — the personal workspace is listed, and a failed logout is not silent', () => {
    it('lists the personal workspace even though it has no slug', async () => {
      useMeContextMock.mockReturnValue({ data: meContextWithBoth() });
      renderWithProviders(<CommandPalette />);

      // `.filter((org) => org.slug)` dropped exactly this row.
      expect(await screen.findByText(/Ada Lovelace/)).toBeInTheDocument();
      expect(screen.getByText(/Acme Inc\./)).toBeInTheDocument();
    });

    it('switches to the personal workspace by its own route', async () => {
      useMeContextMock.mockReturnValue({ data: meContextWithBoth() });
      const user = userEvent.setup();
      renderWithProviders(<CommandPalette />);

      await user.click(await screen.findByText(/Ada Lovelace/));

      // No slug to drive the org guard, so the switch has to happen first.
      await waitFor(() => expect(switchToPersonalMock).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(navigateMock).toHaveBeenCalledWith(
          expect.objectContaining({ to: '/dashboard' }),
        ),
      );
    });

    it('hides the personal workspace where the deployment has none', async () => {
      useMeContextMock.mockReturnValue({ data: meContextWithBoth() });
      useOrganizationStore.setState({
        deploymentFlags: { personalOrganizations: false, teamOrganizations: true },
      });
      renderWithProviders(<CommandPalette />);

      await screen.findByText('Dashboard');
      expect(screen.queryByText(/Ada Lovelace/)).not.toBeInTheDocument();
    });

    it('sends one switch for a double-select landing in the same frame', async () => {
      // Closing the palette in `runCommand` does not help: both handlers run
      // before React unmounts the row. Measured at 2 POSTs in the browser.
      switchToPersonalMock.mockImplementation(() => new Promise(() => {}));
      useMeContextMock.mockReturnValue({ data: meContextWithBoth() });
      renderWithProviders(<CommandPalette />);

      const row = await screen.findByText(/Ada Lovelace/);
      await act(() => {
        row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return Promise.resolve();
      });

      await waitFor(() => expect(switchToPersonalMock).toHaveBeenCalledTimes(1));
      expect(switchToPersonalMock).toHaveBeenCalledTimes(1);
    });

    it('surfaces and reports a failed workspace switch', async () => {
      // I added this failure path when I added the personal row; without a test
      // it is exactly the kind of catch that quietly stops working.
      switchToPersonalMock.mockRejectedValue(
        new Error('Workspace switch is unavailable'),
      );
      useMeContextMock.mockReturnValue({ data: meContextWithBoth() });
      const user = userEvent.setup();
      renderWithProviders(<CommandPalette />);

      await user.click(await screen.findByText(/Ada Lovelace/));

      await waitFor(() => expect(notifyErrorMock).toHaveBeenCalledTimes(1));
      expect(notifyErrorMock).toHaveBeenCalledWith(
        'Workspace switch is unavailable',
        expect.objectContaining({ id: PALETTE_SWITCH_TOAST_ID }),
      );
      expect(reportErrorMock).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ scope: 'command-palette-org-switch' }),
      );
    });

    it('marks an active personal workspace as current and does not switch to it', async () => {
      useMeContextMock.mockReturnValue({
        data: {
          activeOrganization: { type: 'PERSONAL' },
          organizations: [
            { ...TEAM_ORG, isActive: false },
            { ...PERSONAL_ORG, isActive: true },
          ],
        } as unknown as MeContext,
      });
      const user = userEvent.setup();
      renderWithProviders(<CommandPalette />);

      // Rendered as the current workspace, not as a switch target.
      const row = await screen.findByText(/Ada Lovelace \(current\)/);
      await user.click(row);

      expect(switchToPersonalMock).not.toHaveBeenCalled();
      expect(navigateMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ to: '/dashboard' }),
      );
    });

    it('hides the group entirely when only one workspace is selectable', async () => {
      // Personal orgs off + a single team org: the old guard counted the raw
      // list and rendered a heading over one dead "current" row.
      useMeContextMock.mockReturnValue({
        data: {
          activeOrganization: { type: 'TEAM' },
          organizations: [TEAM_ORG, PERSONAL_ORG],
        } as unknown as MeContext,
      });
      useOrganizationStore.setState({
        deploymentFlags: { personalOrganizations: false, teamOrganizations: true },
      });
      renderWithProviders(<CommandPalette />);

      await screen.findByText('Dashboard');
      expect(screen.queryByText(/Acme Inc\./)).not.toBeInTheDocument();
    });

    it('surfaces and reports a failed logout instead of swallowing it', async () => {
      logoutMock.mockRejectedValue(new Error('Sign-out failed'));
      const user = userEvent.setup();
      renderWithProviders(<CommandPalette />);

      await user.click(await screen.findByText('Log out'));

      // `.catch(() => {})` made a sign-out that never happened look like one
      // that did: palette closed, nothing said, still signed in.
      await waitFor(() => expect(notifyErrorMock).toHaveBeenCalledTimes(1));
      expect(notifyErrorMock).toHaveBeenCalledWith(
        'Sign-out failed',
        expect.objectContaining({ id: PALETTE_LOGOUT_TOAST_ID }),
      );
      expect(reportErrorMock).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ scope: 'command-palette-logout' }),
      );
    });
  });

  describe('SHELL-12 — a switch in flight is visible while it runs', () => {
    /** A switch the test controls: resolve it to finish the round trip. */
    function deferredSwitch() {
      let settle = () => {};
      switchToPersonalMock.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            settle = resolve;
          }),
      );
      return () => act(async () => settle());
    }

    it('holds the palette open and spins the row while the switch runs', async () => {
      const finish = deferredSwitch();
      useMeContextMock.mockReturnValue({ data: meContextWithBoth() });
      const user = userEvent.setup();
      renderWithProviders(<CommandPalette />);

      await user.click(await screen.findByText(/Ada Lovelace/));

      // The whole point: dismissing on select left the screen unchanged for a
      // full round trip with nothing to show for it.
      const row = screen.getByTestId('command-palette-org-personal');
      expect(row).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByTestId('command-palette-item-spinner')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await finish();
    });

    it('dismisses the palette only once the switch resolves', async () => {
      const finish = deferredSwitch();
      useMeContextMock.mockReturnValue({ data: meContextWithBoth() });
      const user = userEvent.setup();
      renderWithProviders(<CommandPalette />);

      await user.click(await screen.findByText(/Ada Lovelace/));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await finish();

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('takes the other workspaces out of reach while one switch runs', async () => {
      const finish = deferredSwitch();
      useMeContextMock.mockReturnValue({
        data: {
          activeOrganization: { type: 'TEAM' },
          organizations: [
            { ...TEAM_ORG, isActive: false },
            { ...PERSONAL_ORG, isActive: false },
          ],
        } as unknown as MeContext,
      });
      const user = userEvent.setup();
      renderWithProviders(<CommandPalette />);

      await user.click(await screen.findByText(/Ada Lovelace/));

      // The latch would drop a second pick silently, which reads as a dead
      // click. Say so in the UI instead.
      expect(screen.getByTestId('command-palette-org-acme')).toHaveAttribute(
        'data-disabled',
        'true',
      );

      await finish();
    });

    it('re-arms the row when the switch fails', async () => {
      switchToPersonalMock.mockRejectedValue(
        new Error('Workspace switch is unavailable'),
      );
      useMeContextMock.mockReturnValue({ data: meContextWithBoth() });
      const user = userEvent.setup();
      renderWithProviders(<CommandPalette />);

      await user.click(await screen.findByText(/Ada Lovelace/));

      // A failed switch leaves the user where they were, so the palette stays
      // up and the row goes back to being pickable.
      await waitFor(() => expect(notifyErrorMock).toHaveBeenCalledTimes(1));
      expect(
        screen.queryByTestId('command-palette-item-spinner'),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('command-palette-org-personal')).not.toHaveAttribute(
        'aria-busy',
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
