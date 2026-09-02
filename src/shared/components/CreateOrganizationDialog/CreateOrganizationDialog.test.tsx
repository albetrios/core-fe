import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    vi.clearAllMocks();
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
          replace: true,
        }),
      );
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
