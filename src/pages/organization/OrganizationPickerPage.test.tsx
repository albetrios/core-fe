import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryClient } from '@/core/http/queryClient.ts';
import { myOrganizationsQueryKey } from '@/shared/tenancy/my-organization-summaries.ts';
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
  });

  /*
   * The guard chain that decided the user belongs here already resolved their
   * organization list, so a warm arrival should render rows on the FIRST paint
   * rather than two skeletons. The seed is the LIST's own cache now — the list
   * no longer rides along with me/context.
   */
  it('renders rows immediately from the warm organization-list cache', async () => {
    queryClient.setQueryData(myOrganizationsQueryKey, [
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
    ]);
    // Never resolves: anything on screen came from the placeholder, not a fetch.
    listMock.mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<OrganizationPickerPage />);

    expect(
      await screen.findByTestId('organization-picker-option-acme'),
    ).toBeInTheDocument();
  });
});
