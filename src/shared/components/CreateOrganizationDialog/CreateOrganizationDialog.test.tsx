import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkspaceSwitchStore } from '@/shared/store/useWorkspaceSwitchStore/index.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { CreateOrganizationDialog } from './CreateOrganizationDialog.tsx';

const navigateMock = vi.fn();

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useNavigate: () => navigateMock };
});

const switchToOrganization = vi.fn();
vi.mock('@/shared/tenancy/switch.ts', () => ({
  switchToOrganization: (...args: unknown[]) => switchToOrganization(...args),
}));

const hydrateSessionContext = vi.fn();
vi.mock('@/shared/tenancy/session-context.ts', () => ({
  hydrateSessionContext: (...args: unknown[]) => hydrateSessionContext(...args),
}));

const createOrganization = vi.fn();
vi.mock('@/shared/tenancy/my-organizations.ts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createOrganization: (...args: unknown[]) => createOrganization(...args),
  };
});

const notifyError = vi.fn();
const notifySuccess = vi.fn();
const notifyWarning = vi.fn();
vi.mock('@/shared/notify/index.ts', () => ({
  notify: {
    error: (...args: unknown[]) => notifyError(...args),
    success: (...args: unknown[]) => notifySuccess(...args),
    warning: (...args: unknown[]) => notifyWarning(...args),
    info: vi.fn(),
    dismiss: vi.fn(),
  },
}));

describe('CreateOrganizationDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useWorkspaceSwitchStore.getState().endSwitch();
    navigateMock.mockResolvedValue(undefined);
    switchToOrganization.mockResolvedValue(undefined);
    hydrateSessionContext.mockResolvedValue({ organizations: [] });
    createOrganization.mockResolvedValue({
      id: 'org_new',
      name: 'New Org',
      slug: 'new-org',
    });
  });

  it('creates the organization and navigates to its dashboard', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateOrganizationDialog open onOpenChange={() => {}} />);

    await user.type(
      await screen.findByTestId('create-organization-dialog-name'),
      'New Org',
    );
    await user.click(screen.getByTestId('create-organization-dialog-submit'));

    await vi.waitFor(() => {
      expect(switchToOrganization).toHaveBeenCalledWith('org_new');
      expect(navigateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '/organization/$organizationSlug/dashboard',
          params: { organizationSlug: 'new-org' },
        }),
      );
    });
    // A push, not a replace: created from inside an organization, a replace
    // overwrote that organization's history entry, so Back from the new one
    // skipped past the organization the user had been in.
    expect(navigateMock.mock.calls.at(-1)?.[0]).not.toHaveProperty('replace', true);
  });

  /**
   * QA-7: an invalid Workspace URL stopped the submit and said nothing. The
   * dialog stayed open, the page did not move, and there was not one
   * `role="alert"` anywhere on the form — so pressing Create looked like a
   * dead button. The name field beside it had always explained itself.
   */
  describe('an invalid Workspace URL says so', () => {
    it('explains the refusal instead of failing silently', async () => {
      const user = userEvent.setup();
      renderWithProviders(<CreateOrganizationDialog open onOpenChange={() => {}} />);

      await user.type(
        await screen.findByTestId('create-organization-dialog-name'),
        'QA Org',
      );
      // What a user types under a label reading "Workspace URL" when they have
      // the organization's name in their head.
      await user.type(
        screen.getByTestId('create-organization-dialog-slug'),
        'QA Org 4877!',
      );
      await user.click(screen.getByTestId('create-organization-dialog-submit'));

      const error = await screen.findByTestId('create-organization-dialog-slug-error');
      expect(error).toHaveTextContent('Lowercase letters, numbers, and hyphens only');
      expect(error).toHaveAttribute('role', 'alert');
      expect(screen.getByTestId('create-organization-dialog-slug')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      // Nothing was created — the refusal itself was always right.
      expect(createOrganization).not.toHaveBeenCalled();
    });

    it('names the length when length is what is wrong', async () => {
      // The charset and length rules used to be one regex, so a 60-character
      // all-lowercase slug was told to use lowercase letters. Harmless while
      // the message was invisible; misdirection once it is on screen.
      const user = userEvent.setup();
      renderWithProviders(<CreateOrganizationDialog open onOpenChange={() => {}} />);

      await user.type(
        await screen.findByTestId('create-organization-dialog-name'),
        'QA Org',
      );
      await user.type(
        screen.getByTestId('create-organization-dialog-slug'),
        'a'.repeat(51),
      );
      await user.click(screen.getByTestId('create-organization-dialog-submit'));

      expect(
        await screen.findByTestId('create-organization-dialog-slug-error'),
      ).toHaveTextContent('Workspace URL cannot be longer than 50 characters');
      expect(createOrganization).not.toHaveBeenCalled();
    });

    it('clears the message once the URL is valid, and creates', async () => {
      const user = userEvent.setup();
      renderWithProviders(<CreateOrganizationDialog open onOpenChange={() => {}} />);

      await user.type(
        await screen.findByTestId('create-organization-dialog-name'),
        'QA Org',
      );
      const slug = screen.getByTestId('create-organization-dialog-slug');
      await user.type(slug, 'QA Org');
      await user.click(screen.getByTestId('create-organization-dialog-submit'));
      await screen.findByTestId('create-organization-dialog-slug-error');

      await user.clear(slug);
      await user.type(slug, 'qa-org');
      await user.click(screen.getByTestId('create-organization-dialog-submit'));

      await vi.waitFor(() =>
        expect(createOrganization).toHaveBeenCalledWith({
          name: 'QA Org',
          slug: 'qa-org',
        }),
      );
      expect(
        screen.queryByTestId('create-organization-dialog-slug-error'),
      ).not.toBeInTheDocument();
    });

    it('still treats an empty Workspace URL as "pick one for me"', async () => {
      // The field is optional; making its failure visible must not make blank
      // a failure.
      const user = userEvent.setup();
      renderWithProviders(<CreateOrganizationDialog open onOpenChange={() => {}} />);

      await user.type(
        await screen.findByTestId('create-organization-dialog-name'),
        'QA Org',
      );
      await user.click(screen.getByTestId('create-organization-dialog-submit'));

      await vi.waitFor(() =>
        expect(createOrganization).toHaveBeenCalledWith({
          name: 'QA Org',
          slug: undefined,
        }),
      );
      expect(
        screen.queryByTestId('create-organization-dialog-slug-error'),
      ).not.toBeInTheDocument();
    });
  });

  // ── SET-6: only the create is a form-level failure ────────────────────────

  it('keeps the user on the form and shows the real error when the create fails', async () => {
    // A create failure IS the user's problem to fix — surface what actually
    // went wrong rather than a generic "check the form".
    const user = userEvent.setup();
    createOrganization.mockRejectedValueOnce(new Error('Slug already taken'));
    const onOpenChange = vi.fn();
    renderWithProviders(<CreateOrganizationDialog open onOpenChange={onOpenChange} />);

    await user.type(
      await screen.findByTestId('create-organization-dialog-name'),
      'New Org',
    );
    await user.click(screen.getByTestId('create-organization-dialog-submit'));

    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1));
    // Still open, so the user can correct it — and nothing was provisioned.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(switchToOrganization).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('does not send the user back to the form when a POST-create step fails', async () => {
    // Regression: one catch wrapped create + hydrate + switch + invalidate +
    // navigate, so a failure AFTER the org existed showed a form-validation
    // error and kept the dialog open. The user "fixed" the form, resubmitted,
    // and created a duplicate organization.
    const user = userEvent.setup();
    switchToOrganization.mockRejectedValueOnce(new Error('switch failed'));
    const onOpenChange = vi.fn();
    renderWithProviders(<CreateOrganizationDialog open onOpenChange={onOpenChange} />);

    await user.type(
      await screen.findByTestId('create-organization-dialog-name'),
      'New Org',
    );
    await user.click(screen.getByTestId('create-organization-dialog-submit'));

    await vi.waitFor(() => expect(notifyWarning).toHaveBeenCalledTimes(1));
    // The org exists, so it is reported as created…
    expect(notifySuccess).toHaveBeenCalledTimes(1);
    // …the dialog closes so it cannot be resubmitted…
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // …and the failure is NOT dressed up as a form error.
    expect(notifyError).not.toHaveBeenCalled();
    expect(createOrganization).toHaveBeenCalledTimes(1);
  });

  // Regression (QA-V3-2): the dialog closes before a four-await hop (context
  // re-read, token re-mint, cache invalidation, navigation), so the screen
  // underneath stayed on the OLD workspace — still ticked in the switcher — and
  // the create looked like it had failed and then auto-switched by itself.
  it('covers the post-create hop with the workspace-switch overlay', async () => {
    const user = userEvent.setup();
    let switchingDuringHop: string | null = null;
    switchToOrganization.mockImplementation(() => {
      switchingDuringHop = useWorkspaceSwitchStore.getState().switchingTo;
      return Promise.resolve(undefined);
    });
    renderWithProviders(<CreateOrganizationDialog open onOpenChange={() => {}} />);

    await user.type(
      await screen.findByTestId('create-organization-dialog-name'),
      'New Org',
    );
    await user.click(screen.getByTestId('create-organization-dialog-submit'));

    await vi.waitFor(() => expect(navigateMock).toHaveBeenCalled());
    expect(switchingDuringHop).toBe('New Org');
    // …and released once the hop lands, whatever the outcome.
    await vi.waitFor(() =>
      expect(useWorkspaceSwitchStore.getState().switchingTo).toBeNull(),
    );
  });

  it('releases the overlay when the post-create hop fails', async () => {
    const user = userEvent.setup();
    switchToOrganization.mockRejectedValueOnce(new Error('switch failed'));
    renderWithProviders(<CreateOrganizationDialog open onOpenChange={() => {}} />);

    await user.type(
      await screen.findByTestId('create-organization-dialog-name'),
      'New Org',
    );
    await user.click(screen.getByTestId('create-organization-dialog-submit'));

    await vi.waitFor(() => expect(notifyWarning).toHaveBeenCalledTimes(1));
    expect(useWorkspaceSwitchStore.getState().switchingTo).toBeNull();
  });

  it('drops a double-click on Create — one organization', async () => {
    // The submit CREATES an organization. `isSubmitting` only disables the
    // button after React re-renders, so both clicks must be dispatched inside
    // one act batch to reproduce the live frame.
    renderWithProviders(<CreateOrganizationDialog open onOpenChange={() => {}} />);
    const user = userEvent.setup();
    await user.type(
      await screen.findByTestId('create-organization-dialog-name'),
      'New Org',
    );
    const submit = screen.getByTestId('create-organization-dialog-submit');

    await act(async () => {
      submit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      submit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => expect(navigateMock).toHaveBeenCalled());
    expect(createOrganization).toHaveBeenCalledTimes(1);
    expect(switchToOrganization).toHaveBeenCalledTimes(1);
  });
});
