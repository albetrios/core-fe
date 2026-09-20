import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryClient } from '@/core/http/queryClient.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';
import type * as MeContextModule from '@/shared/tenancy/me-context.ts';
import { meContextQueryKey } from '@/shared/tenancy/me-context.ts';

import {
  ensureSessionContext,
  hydrateSessionContext,
  invalidateSessionContext,
  resetSessionContextForTests,
} from './session-context.ts';

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
});
