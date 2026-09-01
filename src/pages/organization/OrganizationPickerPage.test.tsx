import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryClient } from '@/core/http/queryClient.ts';
import { meContextQueryKey } from '@/shared/tenancy/me-context.ts';
import { listMyOrganizations } from '@/shared/tenancy/my-organizations.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { OrganizationPickerPage } from './OrganizationPickerPage.tsx';

vi.mock('@/shared/tenancy/my-organizations.ts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, listMyOrganizations: vi.fn() };
});

const listMock = vi.mocked(listMyOrganizations);

describe('OrganizationPickerPage', () => {
  beforeEach(() => {
    listMock.mockReset();
    queryClient.clear();
  });

  it('lists the organizations to pick from', async () => {
    listMock.mockResolvedValue([{ id: 'org_acme', name: 'Acme Inc.', slug: 'acme' }]);
    renderWithProviders(<OrganizationPickerPage />);

    expect(await screen.findByTestId('organization-page')).toBeInTheDocument();
    expect(
      await screen.findByTestId('organization-picker-option-acme'),
    ).toBeInTheDocument();
  });

  it('shows an error state with a retry when the fetch fails', async () => {
    listMock.mockRejectedValue(new Error('network down'));
    renderWithProviders(<OrganizationPickerPage />);

    expect(await screen.findByTestId('organization-picker-error')).toBeInTheDocument();
    expect(screen.getByTestId('organization-picker-retry')).toBeInTheDocument();
    expect(screen.queryByTestId('organization-picker-empty')).not.toBeInTheDocument();
  });

  it('shows an empty state when the user has no organizations', async () => {
    listMock.mockResolvedValue([]);
    renderWithProviders(<OrganizationPickerPage />);

    expect(await screen.findByTestId('organization-picker-empty')).toBeInTheDocument();
    // The create affordance is always available to escape the empty state.
    expect(screen.getByTestId('organization-picker-create')).toBeInTheDocument();
  });

  // PICK-1 as audited ("the error card sits unchanged for the whole round trip")
  // no longer reproduces: refetching resets the query to pending, so the card is
  // replaced by the loading skeletons. Pinned here because that IS the feedback,
  // and because a button that unmounts cannot be spammed — if a future change
  // keeps the card mounted during a refetch, this fails and the disabled state
  // has to come back with it.
  it('replaces the error card with loading state while it retries', async () => {
    listMock.mockRejectedValue(new Error('network down'));
    renderWithProviders(<OrganizationPickerPage />);

    const retry = await screen.findByTestId('organization-picker-retry');
    const user = userEvent.setup();

    // Hold the refetch open so the in-flight state is observable.
    listMock.mockImplementation(() => new Promise(() => {}));
    await user.click(retry);

    await waitFor(() =>
      expect(screen.queryByTestId('organization-picker-error')).not.toBeInTheDocument(),
    );
    expect(screen.queryByTestId('organization-picker-retry')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  // Regression (PICK-2): the `/` resolver already fetched me/context to decide
  // the user belongs here, and it carries the same organizations — so a warm
  // arrival should render rows on the FIRST paint, not two skeletons.
  it('renders rows immediately when me/context already has them', async () => {
    queryClient.setQueryData(meContextQueryKey, {
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
        },
      ],
    });
    // Never resolves: anything on screen came from the placeholder, not a fetch.
    listMock.mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<OrganizationPickerPage />);

    expect(
      await screen.findByTestId('organization-picker-option-acme'),
    ).toBeInTheDocument();
  });
});
