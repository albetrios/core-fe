import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryClient } from '@/core/http/queryClient.ts';
import { fetchAllPages } from '@/shared/api/fetch-all-pages.ts';
import { myOrganizationsQueryKey } from '@/shared/tenancy/my-organization-summaries.ts';
import { renderWithProviders } from '@/tests/utils/renderWithProviders.tsx';

import { OrganizationPickerPage } from './OrganizationPickerPage.tsx';

// Only the paginated fetch is stubbed: the list still goes through the same
// fetcher, mapper and cache the guard chain and the switcher use. (Stubbing
// `fetch-client` instead cycles back through the core kernel and leaves the
// real `apiClient` bound.)
vi.mock('@/shared/api/fetch-all-pages.ts', () => ({ fetchAllPages: vi.fn() }));

const fetchPagesMock = vi.mocked(fetchAllPages);

const ACME_ID = `org_${'a'.repeat(21)}`;
const PERSONAL_ID = `org_${'p'.repeat(21)}`;

function wireRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: 'Acme Inc.',
    slug: 'acme',
    type: 'TEAM',
    status: 'ACTIVE',
    logo_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('OrganizationPickerPage', () => {
  beforeEach(() => {
    fetchPagesMock.mockReset();
    queryClient.clear();
  });

  it('lists the organizations to pick from', async () => {
    fetchPagesMock.mockResolvedValue([wireRow(ACME_ID)]);
    renderWithProviders(<OrganizationPickerPage />);

    expect(await screen.findByTestId('organization-page')).toBeInTheDocument();
    expect(
      await screen.findByTestId('organization-picker-option-acme'),
    ).toBeInTheDocument();
  });

  it('leaves out a personal organization, which has no slug to link to', async () => {
    // The old fetcher turned the null slug into '' and rendered a row linking to
    // `/organization//dashboard`.
    fetchPagesMock.mockResolvedValue([
      wireRow(ACME_ID),
      wireRow(PERSONAL_ID, { name: 'Personal', slug: null, type: 'PERSONAL' }),
    ]);
    renderWithProviders(<OrganizationPickerPage />);

    expect(
      await screen.findByTestId('organization-picker-option-acme'),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId(/^organization-picker-option-/)).toHaveLength(1);
  });

  it('shows an error state with a retry when the fetch fails', async () => {
    fetchPagesMock.mockRejectedValue(new Error('network down'));
    renderWithProviders(<OrganizationPickerPage />);

    expect(await screen.findByTestId('organization-picker-error')).toBeInTheDocument();
    expect(screen.getByTestId('organization-picker-retry')).toBeInTheDocument();
    expect(screen.queryByTestId('organization-picker-empty')).not.toBeInTheDocument();
  });

  it('shows an empty state when the user has no organizations', async () => {
    fetchPagesMock.mockResolvedValue([]);
    renderWithProviders(<OrganizationPickerPage />);

    expect(await screen.findByTestId('organization-picker-empty')).toBeInTheDocument();
  });

  /*
   * The guard chain that decided the user belongs here already resolved their
   * organization list, so a warm arrival should render rows on the FIRST paint
   * rather than two skeletons. The picker now reads that same cache entry.
   */
  it('renders rows immediately from the warm organization-list cache', async () => {
    queryClient.setQueryData(myOrganizationsQueryKey, [
      {
        id: ACME_ID,
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
    // Never resolves: anything on screen came from the cache, not a fetch.
    fetchPagesMock.mockImplementation(() => new Promise(() => {}));

    // The app's own client, which the guard chain filled — as in the app.
    renderWithProviders(<OrganizationPickerPage />, { queryClient });

    expect(
      await screen.findByTestId('organization-picker-option-acme'),
    ).toBeInTheDocument();
  });
});
