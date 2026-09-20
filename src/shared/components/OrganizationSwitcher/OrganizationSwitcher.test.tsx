import type * as TanstackRouter from '@tanstack/react-router';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PRODUCT_NAME } from '@/lib/product-identity.ts';
import type { MeContext, OrganizationType } from '@/shared/tenancy/me-context.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { ORG_SWITCH_TOAST_ID, OrganizationSwitcher } from './OrganizationSwitcher.tsx';

const {
  useMeContextMock,
  switchToPersonalMock,
  navigateMock,
  deploymentFlagsMock,
  notifyErrorMock,
  reportErrorMock,
} = vi.hoisted(() => ({
  useMeContextMock: vi.fn(),
  switchToPersonalMock: vi.fn(),
  navigateMock: vi.fn(async () => undefined),
  deploymentFlagsMock: {
    personalOrganizations: true,
    teamOrganizations: true,
  },
  notifyErrorMock: vi.fn(),
  reportErrorMock: vi.fn(),
}));

/*
 * Only `useNavigate` is stubbed; the rest of the router is real because
 * renderWithProviders mounts a RouterProvider. The harness route tree has no
 * /dashboard, so a real navigation renders "Not Found" and unmounts the
 * switcher — which would make the post-success latch test pass for the wrong
 * reason, by removing the component whose mounted state is the point.
 */
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<TanstackRouter>();
  return { ...actual, useNavigate: () => navigateMock };
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

  // ── Trigger layout: a small field, or the sidebar's brand lockup ──────────

  describe('trigger layout', () => {
    it('is a compact outlined field by default, led by the organization initial', async () => {
      renderWithProviders(<OrganizationSwitcher />);
      const trigger = await screen.findByTestId('organization-switcher-trigger');

      expect(trigger).toHaveAttribute('data-layout', 'field');
      expect(trigger).toHaveAttribute('data-variant', 'outline');
      expect(trigger).toHaveClass('h-9');
      expect(trigger).toHaveTextContent('A');
    });

    it('tags the initial chip so the radius and shape axes reach it', async () => {
      // It carried a bare `rounded`, which no theme axis drives: the chip stayed
      // rounded under Sharp while every other tile in the app went square.
      renderWithProviders(<OrganizationSwitcher />);
      const trigger = await screen.findByTestId('organization-switcher-trigger');
      const chip = trigger.querySelector('[data-slot="icon-chip"]');

      expect(chip).toHaveTextContent('A');
      expect(chip?.className.split(/\s+/)).not.toContain('rounded');
    });

    it('ignores a caption outside the lockup — the field has one line', async () => {
      renderWithProviders(<OrganizationSwitcher caption={PRODUCT_NAME} />);
      await screen.findByTestId('organization-switcher-trigger');

      expect(
        screen.queryByTestId('organization-switcher-caption'),
      ).not.toBeInTheDocument();
    });

    it('becomes ONE brand lockup when given a leading mark', async () => {
      // The sidebar header: the product mark and the switcher used to be two
      // things stacked in a column — a logo top-aligned to an 11px caption with
      // the dropdown indented beneath — so nothing shared an edge or a baseline.
      renderWithProviders(
        <OrganizationSwitcher
          surface="sidebar"
          leading={<span data-testid="brand-mark" />}
          caption={PRODUCT_NAME}
        />,
      );
      const trigger = await screen.findByTestId('organization-switcher-trigger');

      expect(trigger).toHaveAttribute('data-layout', 'lockup');
      // The mark replaces the initial rather than sitting beside it…
      expect(trigger).toContainElement(screen.getByTestId('brand-mark'));
      expect(trigger.querySelector('[data-slot="icon-chip"]')).toBeNull();
      // …the name and the product caption stack as two lines of one row…
      expect(trigger).toHaveTextContent('Acme Inc.');
      expect(screen.getByTestId('organization-switcher-caption')).toHaveTextContent(
        PRODUCT_NAME,
      );
      // …and it is a borderless row, not a bordered field inside the header.
      expect(trigger).toHaveAttribute('data-variant', 'ghost');
      expect(trigger).toHaveClass('h-11');
    });

    it('keeps its accessible name in the lockup (the caption is not part of it)', async () => {
      renderWithProviders(
        <OrganizationSwitcher
          leading={<span aria-hidden="true" />}
          caption={PRODUCT_NAME}
        />,
      );

      expect(
        await screen.findByRole('button', { name: /switch organization.*acme inc\./i }),
      ).toBeInTheDocument();
    });

    it('opens a menu at least as wide as the trigger', async () => {
      // A fixed 16rem menu stopped short of the full-width lockup's end edge.
      const user = userEvent.setup();
      renderWithProviders(
        <OrganizationSwitcher leading={<span />} caption={PRODUCT_NAME} />,
      );

      await user.click(await screen.findByTestId('organization-switcher-trigger'));

      const menu = await screen.findByRole('menu');
      expect(menu.className).toContain(
        'w-[max(16rem,var(--radix-dropdown-menu-trigger-width))]',
      );
    });
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

    it('holds the menu open for the round trip, then closes it once the switch lands', async () => {
      /*
       * The other half of the deliberate hold-open. `onSelect` calls
       * `preventDefault()` so the menu survives the round trip and the pressed
       * row can act as the progress indicator — but the menu was UNCONTROLLED,
       * so nothing ever closed it again. Team → team is a param change on the
       * `$organizationSlug` shell this control lives inside, which keeps the
       * component mounted, so the menu hung open over the new dashboard.
       *
       * `useNavigate` is stubbed at module level ON PURPOSE (see the top of this
       * file). A real navigation renders "Not Found" and unmounts the switcher,
       * which would make this pass for the wrong reason — the menu would be gone
       * only because the whole control was gone.
       */
      let settle: (() => void) | undefined;
      switchToPersonalMock.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            settle = resolve;
          }),
      );

      const user = userEvent.setup();
      renderWithProviders(<OrganizationSwitcher />);
      await user.click(await screen.findByTestId('organization-switcher-trigger'));
      await user.click(
        await screen.findByTestId('organization-switcher-option-personal'),
      );

      // STILL OPEN mid-flight — the SHELL-2 behaviour this must not regress.
      // It also stops the assertion below passing for the trivial reason that
      // the menu never opened in the first place.
      expect(
        await screen.findByTestId('organization-switcher-option-spinner'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('organization-switcher-option-personal'),
      ).toBeInTheDocument();

      await act(async () => {
        settle?.();
        await Promise.resolve();
      });

      // ...and CLOSED once it settles. Nothing used to do this.
      await waitFor(() =>
        expect(
          screen.queryByTestId('organization-switcher-option-personal'),
        ).not.toBeInTheDocument(),
      );
      expect(screen.getByTestId('organization-switcher-trigger')).toHaveAttribute(
        'aria-expanded',
        'false',
      );
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

    /*
     * The half the failure test never covered. The latch used to be released
     * only in `.catch`, on the assumption that a successful switch unmounts the
     * switcher. It does not: this control lives in AppLayout, inside the
     * `$organizationSlug` shell, and team → team is a param change on that same
     * route — so it stays mounted with the latch still armed and the user
     * cannot switch again without reloading.
     */
    it('re-arms the latch after a SUCCESSFUL switch (the component stays mounted)', async () => {
      /*
       * `useNavigate` is stubbed to a no-op ON PURPOSE. The harness router has
       * no /dashboard route, so a real navigation renders "Not Found" and tears
       * the switcher out — which would make this test pass for the wrong reason,
       * by unmounting the component whose mounted state is the whole point.
       * Production keeps it mounted: team → team is a param change on the
       * `$organizationSlug` shell this control lives inside.
       */
      const user = userEvent.setup();
      renderWithProviders(<OrganizationSwitcher />);
      await user.click(await screen.findByTestId('organization-switcher-trigger'));
      await user.click(
        await screen.findByTestId('organization-switcher-option-personal'),
      );
      await waitFor(() => expect(switchToPersonalMock).toHaveBeenCalledTimes(1));

      // No error path here — this switch succeeded.
      expect(notifyErrorMock).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(screen.getByTestId('organization-switcher-trigger')).not.toBeDisabled(),
      );
      // ...and a second, different switch still goes out. The menu has to be
      // reopened first — unlike the failure path, a SUCCESSFUL switch closes it
      // (the user is on the destination org; the menu would just cover it).
      await user.click(screen.getByTestId('organization-switcher-trigger'));
      await user.click(
        await screen.findByTestId('organization-switcher-option-personal'),
      );
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
