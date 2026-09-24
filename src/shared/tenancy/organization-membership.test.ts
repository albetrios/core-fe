import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queryClient } from '@/core/http/queryClient.ts';
import { getMyPermissions } from '@/shared/api/organization-api.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

import { meContextQueryKey } from './me-context.ts';
import type * as MyOrganizationSummariesModule from './my-organization-summaries.ts';
import {
  ensurePermissionsFor,
  findMembershipBySlug,
  resetPermissionCacheForTests,
} from './organization-membership.ts';

vi.mock('@/shared/api/organization-api.ts', () => ({
  getMyPermissions: vi.fn().mockResolvedValue(['organization:read']),
}));

/*
 * Both legs are stubbed. `ensure*` calls `fetch*` INSIDE its own module, so a
 * partial mock of the export never intercepts that call — what is under test
 * here is the resolver's own contract: serve from the cached list, and on a miss
 * refetch once before concluding the user is not a member.
 */
const { ensureSummaries, fetchSummaries } = vi.hoisted(() => ({
  ensureSummaries: vi.fn(),
  fetchSummaries: vi.fn(),
}));
vi.mock('./my-organization-summaries.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof MyOrganizationSummariesModule>();
  return {
    ...actual,
    ensureMyOrganizationSummaries: ensureSummaries,
    fetchMyOrganizationSummaries: fetchSummaries,
  };
});
describe('findMembershipBySlug (team URL resolution, FE-22)', () => {
  const ACME = {
    id: 'org_acme',
    name: 'Acme Inc.',
    slug: 'acme',
    type: 'TEAM' as const,
    status: 'ACTIVE' as const,
    logoUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isActive: true,
  };

  beforeEach(() => {
    // Default: the caller is a member of Acme and nothing else, from both legs.
    ensureSummaries.mockReset().mockResolvedValue([ACME]);
    fetchSummaries.mockReset().mockResolvedValue([ACME]);
  });

  afterEach(() => {
    queryClient.removeQueries({ queryKey: meContextQueryKey });
  });

  it('resolves a slug to the canonical org when the user is a member', async () => {
    // The full parsed shape, schema defaults included — the resolver returns a
    // canonical `Organization`, not the raw summary row.
    await expect(findMembershipBySlug('acme')).resolves.toEqual({
      id: 'org_acme',
      name: 'Acme Inc.',
      slug: 'acme',
      status: 'active',
      logoUrl: null,
    });
  });

  it('resolves from the warm list cache without a network call (happy path)', async () => {
    fetchSummaries.mockClear();
    ensureSummaries.mockResolvedValueOnce([
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

    await expect(findMembershipBySlug('acme')).resolves.toMatchObject({
      id: 'org_acme',
      slug: 'acme',
    });
    // Runs on EVERY organization-route navigation — a warm cache must not refetch.
    expect(fetchSummaries).not.toHaveBeenCalled();
  });

  it('returns null for an unknown slug (existence never leaked → 404)', async () => {
    await expect(findMembershipBySlug('ghost')).resolves.toBeNull();
  });

  // A cache MISS is not proof of non-membership: the workspace onboarding created
  // seconds ago is absent from a list fetched before it existed. Refetch once and
  // let the fresh answer decide, rather than 404-ing a real member.
  it('refetches on a cache miss instead of 404-ing a freshly created workspace', async () => {
    ensureSummaries.mockResolvedValueOnce([]);
    fetchSummaries.mockResolvedValueOnce([
      {
        id: 'org_new',
        name: 'New Co',
        slug: 'new-co',
        type: 'TEAM',
        status: 'ACTIVE',
        logoUrl: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        isActive: true,
      },
    ]);

    await expect(findMembershipBySlug('new-co')).resolves.toMatchObject({
      id: 'org_new',
      slug: 'new-co',
    });
    expect(fetchSummaries).toHaveBeenCalledTimes(1);
  });
});

describe('ensurePermissionsFor (per-organization refetch)', () => {
  beforeEach(() => {
    resetPermissionCacheForTests();
    useOrganizationStore.getState().clearOrganization();
    vi.mocked(getMyPermissions).mockClear();
  });

  it('loads permissions on first call', async () => {
    await ensurePermissionsFor('org_acme');
    expect(getMyPermissions).toHaveBeenCalledTimes(1);
    expect(useOrganizationStore.getState().permissions).toEqual(['organization:read']);
  });

  it('does not refetch for the same organization', async () => {
    await ensurePermissionsFor('org_acme');
    await ensurePermissionsFor('org_acme');
    expect(getMyPermissions).toHaveBeenCalledTimes(1);
  });

  it('refetches when the organization changes — org A permissions never leak into org B', async () => {
    await ensurePermissionsFor('org_acme');
    await ensurePermissionsFor('org_globex');
    expect(getMyPermissions).toHaveBeenCalledTimes(2);
  });

  it('clears prior-org grants when a cross-org refetch fails (2.2 fail-closed)', async () => {
    await ensurePermissionsFor('org_acme');
    expect(useOrganizationStore.getState().permissions).toEqual(['organization:read']);

    vi.mocked(getMyPermissions).mockRejectedValueOnce(new Error('network'));
    await expect(ensurePermissionsFor('org_globex')).rejects.toThrow('network');

    // Org A's grants must NOT survive the failed switch to org B.
    expect(useOrganizationStore.getState().permissions).toEqual([]);
  });
});
