import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/http/fetch-client.ts', () => ({
  apiClient: { get: vi.fn() },
}));

import { apiClient } from '@/core/http/fetch-client.ts';
import { queryClient } from '@/core/http/queryClient.ts';

import { meContextQueryKey } from './me-context.ts';
import {
  fetchMyOrganizationSummaries,
  invalidateMyOrganizationSummaries,
  myOrganizationsQueryKey,
} from './my-organization-summaries.ts';

const ACME_ID = `org_${'a'.repeat(21)}`;
const BETA_ID = `org_${'b'.repeat(21)}`;

function wireRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: 'Acme',
    slug: 'acme',
    type: 'TEAM',
    status: 'ACTIVE',
    logo_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  vi.resetAllMocks();
  queryClient.clear();
});

describe('fetchMyOrganizationSummaries', () => {
  it('maps each row like me/context does and flags the active organization', async () => {
    queryClient.setQueryData(meContextQueryKey, { activeOrganization: { id: BETA_ID } });
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [
        wireRow(ACME_ID, { logo_url: 'https://cdn.test/acme.png' }),
        wireRow(BETA_ID, { name: 'Beta', slug: null, type: 'PERSONAL' }),
      ],
    });

    const result = await fetchMyOrganizationSummaries();

    // snake_case logo_url maps to logoUrl; a personal org keeps its null slug.
    expect(result).toEqual([
      expect.objectContaining({
        id: ACME_ID,
        slug: 'acme',
        logoUrl: 'https://cdn.test/acme.png',
        isActive: false,
      }),
      expect.objectContaining({
        id: BETA_ID,
        slug: null,
        type: 'PERSONAL',
        logoUrl: null,
        isActive: true,
      }),
    ]);
  });

  it('returns an empty list when the body is not an array', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: null });

    await expect(fetchMyOrganizationSummaries()).resolves.toEqual([]);
  });

  it('drops an invalid row instead of failing the whole list', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [wireRow(ACME_ID), { id: 'org-bad' }],
    });

    const result = await fetchMyOrganizationSummaries();

    expect(result.map((org) => org.id)).toEqual([ACME_ID]);
    expect(warn).toHaveBeenCalled();
  });

  it('follows cursor pagination so a user in more than 25 organizations sees them all', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({
        data: [wireRow(ACME_ID)],
        meta: { pagination: { has_more: true, next: 'cur1' } },
      })
      .mockResolvedValueOnce({
        data: [wireRow(BETA_ID, { slug: 'beta' })],
        meta: { pagination: { has_more: false, next: null } },
      });

    const result = await fetchMyOrganizationSummaries();

    expect(result.map((org) => org.id)).toEqual([ACME_ID, BETA_ID]);
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(vi.mocked(apiClient.get).mock.calls[0]?.[0]).toContain('limit=100');
    expect(vi.mocked(apiClient.get).mock.calls[1]?.[0]).toContain('after=cur1');
  });
});

describe('invalidateMyOrganizationSummaries', () => {
  it('marks the one cached list stale, so the next read refetches', () => {
    queryClient.setQueryData(myOrganizationsQueryKey, []);

    invalidateMyOrganizationSummaries();

    expect(queryClient.getQueryState(myOrganizationsQueryKey)?.isInvalidated).toBe(true);
  });
});
