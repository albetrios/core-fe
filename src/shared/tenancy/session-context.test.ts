import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryClient } from '@/core/http/queryClient.ts';
import { fetchAllPages } from '@/shared/api/fetch-all-pages.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import type * as MeContextModule from '@/shared/tenancy/me-context.ts';
import { meContextQueryKey } from '@/shared/tenancy/me-context.ts';

import { myOrganizationsQueryKey } from './my-organization-summaries.ts';
import {
  ensureSessionContext,
  hydrateSessionContext,
  invalidateSessionContext,
  resetSessionContextForTests,
} from './session-context.ts';

// The organization list request that hydration sends alongside me/context.
vi.mock('@/shared/api/fetch-all-pages.ts', () => ({ fetchAllPages: vi.fn() }));

vi.mock('./me-context.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof MeContextModule>();
  return {
    ...actual,
    fetchMeContext: vi.fn().mockResolvedValue({
      user: { id: 'u1', email: 'a@b.test', firstName: 'A', lastName: 'B' },
      organizations: [],
      activeOrganization: null,
      myPermissions: [],
      globalRole: 'user',
      deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
    }),
  };
});

import { fetchMeContext } from './me-context.ts';

describe('session-context', () => {
  beforeEach(() => {
    queryClient.clear();
    vi.mocked(fetchMeContext).mockClear();
    vi.mocked(fetchAllPages).mockReset().mockResolvedValue([]);
  });

  it('hydrateSessionContext fetches and caches me/context', async () => {
    const ctx = await hydrateSessionContext();
    expect(ctx.user.id).toBe('u1');
    expect(queryClient.getQueryData(meContextQueryKey)).toEqual(ctx);
    expect(fetchMeContext).toHaveBeenCalledOnce();
  });

  it('does not publish context when the auth operation is no longer current', async () => {
    useOrganizationStore.getState().setOrganization('new-org', 'new-org', 'active');
    await expect(hydrateSessionContext(() => false)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(queryClient.getQueryData(meContextQueryKey)).toBeUndefined();
    expect(useOrganizationStore.getState().organizationId).toBe('new-org');
  });

  it('checks freshness after fetching and preserves a newer cached context', async () => {
    const older = await fetchMeContext();
    const newer = { ...older, user: { ...older.user, id: 'new-user' } };
    let release!: (value: typeof older) => void;
    vi.mocked(fetchMeContext).mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    let current = true;
    const pending = hydrateSessionContext(() => current);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    current = false;
    queryClient.setQueryData(meContextQueryKey, newer);
    release(older);
    await rejected;
    expect(queryClient.getQueryData(meContextQueryKey)).toEqual(newer);
  });

  it.each([
    ['hydrate', hydrateSessionContext],
    ['ensure', ensureSessionContext],
  ] as const)(
    'rejects an invalidated default %s read instead of returning it to routing',
    async (_name, load) => {
      const older = await fetchMeContext();
      let release!: (value: typeof older) => void;
      vi.mocked(fetchMeContext).mockReturnValueOnce(
        new Promise((resolve) => {
          release = resolve;
        }),
      );
      const pending = load();
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      invalidateSessionContext();
      useOrganizationStore.getState().setOrganization('new-org', 'new-org', 'active');
      release(older);
      await rejected;
      expect(queryClient.getQueryData(meContextQueryKey)).toBeUndefined();
      expect(useOrganizationStore.getState().organizationId).toBe('new-org');
    },
  );

  it('invalidateSessionContext removes the cache entry', async () => {
    await hydrateSessionContext();
    invalidateSessionContext();
    expect(queryClient.getQueryData(meContextQueryKey)).toBeUndefined();
  });

  it('resetSessionContextForTests clears cache', async () => {
    await hydrateSessionContext();
    resetSessionContextForTests();
    expect(queryClient.getQueryData(meContextQueryKey)).toBeUndefined();
  });

  // Regression: the post-auth guard chain must reuse the me/context that
  // establishSession just cached instead of refetching — a redundant fetch keeps
  // the login form mounted during the destination route's beforeLoad ("flash of
  // login" between the OTP code and the dashboard).
  it('ensureSessionContext returns the cached context WITHOUT refetching', async () => {
    await hydrateSessionContext(); // establishSession-style seed
    vi.mocked(fetchMeContext).mockClear();

    const ctx = await ensureSessionContext();

    expect(ctx.user.id).toBe('u1');
    expect(fetchMeContext).not.toHaveBeenCalled();
  });

  it('ensureSessionContext fetches once when the cache is empty (cold boot)', async () => {
    expect(queryClient.getQueryData(meContextQueryKey)).toBeUndefined();

    const ctx = await ensureSessionContext();

    expect(ctx.user.id).toBe('u1');
    expect(fetchMeContext).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(meContextQueryKey)).toEqual(ctx);
  });

  describe('the organization list', () => {
    // The organization guard needs the list as well as me/context. Sent after
    // me/context lands, it cost a cold load one extra round trip.
    it('is requested alongside me/context, not after it', async () => {
      const ctx = await fetchMeContext();
      vi.mocked(fetchMeContext).mockClear();
      let release!: (value: typeof ctx) => void;
      vi.mocked(fetchMeContext).mockReturnValueOnce(
        new Promise((resolve) => {
          release = resolve;
        }),
      );

      const pending = hydrateSessionContext();

      // me/context is still in flight, and the list request is already out.
      await vi.waitFor(() => expect(fetchAllPages).toHaveBeenCalledOnce());
      expect(fetchMeContext).toHaveBeenCalledOnce();
      release(ctx);
      await pending;
      await vi.waitFor(() =>
        expect(queryClient.getQueryData(myOrganizationsQueryKey)).toEqual([]),
      );
    });

    it('is not requested again when the session already holds it', async () => {
      queryClient.setQueryData(myOrganizationsQueryKey, []);

      await hydrateSessionContext();

      expect(fetchAllPages).not.toHaveBeenCalled();
    });

    it('is dropped with the context, so the next sign-in is not served it', async () => {
      await hydrateSessionContext();
      await vi.waitFor(() =>
        expect(queryClient.getQueryData(myOrganizationsQueryKey)).toEqual([]),
      );

      invalidateSessionContext();

      expect(queryClient.getQueryData(myOrganizationsQueryKey)).toBeUndefined();
    });

    it('never lands when the session ends while it is still in flight', async () => {
      let release!: (rows: unknown[]) => void;
      vi.mocked(fetchAllPages).mockReturnValueOnce(
        new Promise((resolve) => {
          release = resolve;
        }),
      );
      await hydrateSessionContext();

      invalidateSessionContext();
      release([]);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(queryClient.getQueryData(myOrganizationsQueryKey)).toBeUndefined();
    });
  });
});
