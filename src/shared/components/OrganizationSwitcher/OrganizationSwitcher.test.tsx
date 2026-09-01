import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeContext, OrganizationType } from '@/shared/tenancy/me-context.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { ORG_SWITCH_TOAST_ID, OrganizationSwitcher } from './OrganizationSwitcher.tsx';

const {
  useMeContextMock,
  switchToPersonalMock,
  deploymentFlagsMock,
  notifyErrorMock,
  reportErrorMock,
} = vi.hoisted(() => ({
  useMeContextMock: vi.fn(),
  switchToPersonalMock: vi.fn(),
  deploymentFlagsMock: {
    personalOrganizations: true,
    teamOrganizations: true,
  },
  notifyErrorMock: vi.fn(),
  reportErrorMock: vi.fn(),
}));

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
  meContextQueryKey: ['auth', 'me-context'],
}));
vi.mock('@/shared/hooks/useDeploymentFlags/index.ts', () => ({
  useDeploymentFlags: () => deploymentFlagsMock,
  useDeploymentMode: () => {
    const { personalOrganizations, teamOrganizations } = deploymentFlagsMock;
    if (personalOrganizations && !teamOrganizations) return 'personal-only';
    if (!personalOrganizations && teamOrganizations) return 'team-only';
    return 'personal-and-team';
  },
}));
vi.mock('@/shared/tenancy/switch.ts', () => ({
  switchToPersonal: switchToPersonalMock,
  switchToOrganization: vi.fn(),
}));

function org(id: string, name: string, slug: string | null, type: OrganizationType) {
  return {
    id,
    name,
    slug,
    type,
    status: 'ACTIVE' as const,
    logoUrl: null,
    createdAt: 't',
    updatedAt: 't',
  };
}

const ACME = org('org_acme', 'Acme Inc.', 'acme', 'TEAM');
const PERSONAL = org('org_personal', 'Personal', null, 'PERSONAL');
const CTX = {
  activeOrganization: ACME,
  organizations: [
    { ...ACME, isActive: true },
    { ...PERSONAL, isActive: false },
  ],
  deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
  personalOrganizationId: PERSONAL.id,
} as unknown as MeContext;

beforeEach(() => {
  vi.clearAllMocks();
  deploymentFlagsMock.personalOrganizations = true;
  deploymentFlagsMock.teamOrganizations = true;
  switchToPersonalMock.mockResolvedValue(undefined);
  useMeContextMock.mockReturnValue({ data: CTX, isLoading: false });
});

describe('OrganizationSwitcher', () => {
  it('shows the active organization name', async () => {
    renderWithProviders(<OrganizationSwitcher />);
    expect(await screen.findByText('Acme Inc.')).toBeInTheDocument();
  });

  it('gives the trigger an accessible name (not the initial+name concatenation)', async () => {
    renderWithProviders(<OrganizationSwitcher />);
    const trigger = await screen.findByTestId('organization-switcher-trigger');
    expect(trigger).toHaveAccessibleName(/switch organization.*acme inc\./i);
  });

  it('lists every organization (incl. personal) plus the create action', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrganizationSwitcher />);
    await user.click(await screen.findByTestId('organization-switcher-trigger'));
    expect(
      await screen.findByTestId('organization-switcher-option-personal'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('organization-switcher-create')).toBeInTheDocument();
  });

  it('lists team organizations without a personal section in team-only mode', async () => {
    deploymentFlagsMock.personalOrganizations = false;
    deploymentFlagsMock.teamOrganizations = true;

    const user = userEvent.setup();
    renderWithProviders(<OrganizationSwitcher />);
    await user.click(await screen.findByTestId('organization-switcher-trigger'));
    expect(
      screen.queryByTestId('organization-switcher-option-personal'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('organization-switcher-option-acme')).toBeInTheDocument();
    expect(screen.getByTestId('organization-switcher-create')).toBeInTheDocument();
  });

  it('reports a failed me/context instead of passing in silence (X-1)', async () => {
    // A rejected fetch used to leave the trigger reading "Select organization"
    // over an empty list. It now toasts — and NOT `throwOnError`, because
    // replacing the switcher with an error card reflows the whole header.
    renderWithProviders(<OrganizationSwitcher />);
    await screen.findByTestId('organization-switcher-trigger');
    expect(useMeContextMock).toHaveBeenCalledWith({ notifyOnError: true });
    expect(useMeContextMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ throwOnError: true }),
    );
  });

  it('switching to the personal org calls switchToPersonal', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrganizationSwitcher />);
    await user.click(await screen.findByTestId('organization-switcher-trigger'));
    await user.click(await screen.findByTestId('organization-switcher-option-personal'));
    await waitFor(() => expect(switchToPersonalMock).toHaveBeenCalledTimes(1));
  });

  it('sends one switch for a double-click landing in the same frame', async () => {
    // Switching re-mints the GLOBAL access token, so a duplicate is not a wasted
    // round trip — two in-flight switches race for which tenant the token ends up
    // scoped to. `switch.ts` drops the stale response; this stops the request.
    switchToPersonalMock.mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    renderWithProviders(<OrganizationSwitcher />);
    await user.click(await screen.findByTestId('organization-switcher-trigger'));
    const option = await screen.findByTestId('organization-switcher-option-personal');

    // `fireEvent`/`user.click` flush React between calls, so `disabled` lands and
    // a guardless build still passes. Both go out in ONE act batch.
    await act(() => {
      option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return Promise.resolve();
    });

    await waitFor(() => expect(switchToPersonalMock).toHaveBeenCalledTimes(1));
    expect(switchToPersonalMock).toHaveBeenCalledTimes(1);
  });

  describe('SHELL-2 — a switch that is working says so, and a switch that fails says so', () => {
    /** Hold the switch open so the in-flight frame can be asserted on. */
    function pendingSwitch() {
      switchToPersonalMock.mockImplementation(() => new Promise(() => {}));
    }

    it('spins the pressed row and locks the trigger while the switch is in flight', async () => {
      pendingSwitch();
      const user = userEvent.setup();
      renderWithProviders(<OrganizationSwitcher />);
      await user.click(await screen.findByTestId('organization-switcher-trigger'));
      await user.click(
        await screen.findByTestId('organization-switcher-option-personal'),
      );

      // `switchToPersonal()` resolves before any navigation starts, so the
      // RouteProgressBar never moves — without these the screen is simply inert
      // for a whole round trip.
      expect(
        await screen.findByTestId('organization-switcher-option-spinner'),
      ).toBeInTheDocument();
      const trigger = screen.getByTestId('organization-switcher-trigger');
      expect(trigger).toBeDisabled();
      expect(trigger).toHaveAttribute('aria-busy', 'true');
    });

    it('surfaces and reports a failed switch instead of swallowing it', async () => {
      switchToPersonalMock.mockRejectedValue(new Error('Switch failed'));
      const user = userEvent.setup();
      renderWithProviders(<OrganizationSwitcher />);
      await user.click(await screen.findByTestId('organization-switcher-trigger'));
      await user.click(
        await screen.findByTestId('organization-switcher-option-personal'),
      );

      // The bare `.catch(() => undefined)` meant a failure was indistinguishable
      // from a slow success: no toast, nothing in Sentry, still on the old org.
      await waitFor(() => expect(notifyErrorMock).toHaveBeenCalledTimes(1));
      expect(notifyErrorMock).toHaveBeenCalledWith(
        'Switch failed',
        expect.objectContaining({ id: ORG_SWITCH_TOAST_ID }),
      );
      expect(reportErrorMock).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ scope: 'organization-switcher' }),
      );
    });

    it('re-arms the menu after a failed switch so the user can try again', async () => {
      switchToPersonalMock.mockRejectedValue(new Error('Switch failed'));
      const user = userEvent.setup();
      renderWithProviders(<OrganizationSwitcher />);
      await user.click(await screen.findByTestId('organization-switcher-trigger'));
      await user.click(
        await screen.findByTestId('organization-switcher-option-personal'),
      );
      await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());

      // The latch is a single-flight guard, not a one-shot fuse — and the menu is
      // still open, so the retry is one click away rather than four.
      await waitFor(() =>
        expect(screen.getByTestId('organization-switcher-trigger')).not.toBeDisabled(),
      );
      await user.click(screen.getByTestId('organization-switcher-option-personal'));
      await waitFor(() => expect(switchToPersonalMock).toHaveBeenCalledTimes(2));
    });

    it('does not arm the latch when the already-active org is picked again', async () => {
      const user = userEvent.setup();
      renderWithProviders(<OrganizationSwitcher />);
      await user.click(await screen.findByTestId('organization-switcher-trigger'));
      await user.click(await screen.findByTestId('organization-switcher-option-acme'));

      expect(switchToPersonalMock).not.toHaveBeenCalled();
      expect(
        screen.queryByTestId('organization-switcher-option-spinner'),
      ).not.toBeInTheDocument();
    });
  });
});
