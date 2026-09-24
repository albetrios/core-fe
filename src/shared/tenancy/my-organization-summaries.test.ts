import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/http/fetch-client.ts', () => ({
  apiClient: { get: vi.fn() },
  // The app's query retry policy asks this of every failure; none here is a 401.
  isUnauthorized: () => false,
}));

import { apiClient } from '@/core/http/fetch-client.ts';
import { queryClient } from '@/core/http/queryClient.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

import { meContextQueryKey, organizationWire, toOrganization } from './me-context.ts';
import {
  ensureMyOrganizationSummaries,
  fetchMyOrganizationSummaries,
  invalidateMyOrganizationSummaries,
  myOrganizationsQueryKey,
  prefetchMyOrganizationSummaries,
  useMyOrganizationSummaries,
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

/** A cached row, through the same parse and mapper the fetcher uses. */
function summary(id: string, slug: string) {
  return toOrganization(organizationWire.parse(wireRow(id, { slug })));
}

afterEach(() => {
  vi.resetAllMocks();
  queryClient.clear();
  useOrganizationStore.getState().clearOrganization();
});

describe('fetchMyOrganizationSummaries', () => {
  it('maps each row like me/context does, and leaves which one is active to the reader', async () => {
    // An active organization in me/context must not reach the rows: the list is
    // requested alongside me/context now, so it cannot depend on its answer.
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
      }),
      expect.objectContaining({
        id: BETA_ID,
        slug: null,
        type: 'PERSONAL',
        logoUrl: null,
      }),
    ]);
    for (const organization of result) {
      expect(organization).not.toHaveProperty('isActive');
    }
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

describe('prefetchMyOrganizationSummaries', () => {
  it('sends one request, and a read made while it is in flight joins it', async () => {
    let answer!: (value: unknown) => void;
    vi.mocked(apiClient.get).mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    prefetchMyOrganizationSummaries();
    const read = ensureMyOrganizationSummaries();
    answer({ data: [wireRow(ACME_ID)] });

    await expect(read).resolves.toEqual([expect.objectContaining({ id: ACME_ID })]);
    expect(apiClient.get).toHaveBeenCalledOnce();
  });

  it('sends nothing when the list is already cached', async () => {
    queryClient.setQueryData(myOrganizationsQueryKey, []);

    prefetchMyOrganizationSummaries();
    await ensureMyOrganizationSummaries();

    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('swallows a failure, and the next read fetches again', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('offline'));

      prefetchMyOrganizationSummaries();
      // The house retry policy runs its course, then the query rests in error
      // with nothing cached. No rejection escapes: Vitest fails the run on one.
      await vi.advanceTimersByTimeAsync(10_000);
      expect(queryClient.getQueryState(myOrganizationsQueryKey)?.status).toBe('error');

      vi.mocked(apiClient.get).mockResolvedValue({ data: [wireRow(ACME_ID)] });
      await expect(ensureMyOrganizationSummaries()).resolves.toEqual([
        expect.objectContaining({ id: ACME_ID }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useMyOrganizationSummaries', () => {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  it('flags the organization the store holds, without writing the flag into the cache', () => {
    const cached = [summary(ACME_ID, 'acme'), summary(BETA_ID, 'beta')];
    queryClient.setQueryData(myOrganizationsQueryKey, cached);
    useOrganizationStore.getState().setOrganization(BETA_ID, 'beta');

    const { result } = renderHook(() => useMyOrganizationSummaries(), { wrapper });

    expect(result.current.data?.map(({ id, isActive }) => [id, isActive])).toEqual([
      [ACME_ID, false],
      [BETA_ID, true],
    ]);
    expect(queryClient.getQueryData(myOrganizationsQueryKey)).toBe(cached);
  });

  it('moves the flag the moment the store moves, without a request', () => {
    queryClient.setQueryData(myOrganizationsQueryKey, [
      summary(ACME_ID, 'acme'),
      summary(BETA_ID, 'beta'),
    ]);
    useOrganizationStore.getState().setOrganization(ACME_ID, 'acme');
    const { result } = renderHook(() => useMyOrganizationSummaries(), { wrapper });
    expect(result.current.data?.find((organization) => organization.isActive)?.id).toBe(
      ACME_ID,
    );

    act(() => {
      useOrganizationStore.getState().setOrganization(BETA_ID, 'beta');
    });

    expect(result.current.data?.find((organization) => organization.isActive)?.id).toBe(
      BETA_ID,
    );
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('flags nothing while no organization is active', () => {
    queryClient.setQueryData(myOrganizationsQueryKey, [summary(ACME_ID, 'acme')]);

    const { result } = renderHook(() => useMyOrganizationSummaries(), { wrapper });

    expect(result.current.data?.map((organization) => organization.isActive)).toEqual([
      false,
    ]);
  });
});

describe('invalidateMyOrganizationSummaries', () => {
  it('marks the one cached list stale, so the next read refetches', () => {
    queryClient.setQueryData(myOrganizationsQueryKey, []);

    invalidateMyOrganizationSummaries();

    expect(queryClient.getQueryState(myOrganizationsQueryKey)?.isInvalidated).toBe(true);
  });
});
