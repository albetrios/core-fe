import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queryClient } from '@/core/http/queryClient.ts';
import { billingQueryKeys } from '@/shared/api/billing-query-keys.ts';
import { orgQueryKeys } from '@/shared/api/organization-query-keys.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

import { type MeContext, meContextQueryKey } from './me-context.ts';
import {
  myOrganizationsQueryKey,
  type MyOrganizationSummary,
} from './my-organization-summaries.ts';

const { postMock, setAccessTokenMock, captureMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  setAccessTokenMock: vi.fn(),
  captureMock: vi.fn(),
}));
vi.mock('@/core/http/fetch-client.ts', () => ({ apiClient: { post: postMock } }));
vi.mock('@/shared/auth/token.ts', () => ({ setAccessToken: setAccessTokenMock }));
vi.mock('@/shared/auth/refresh-timer.ts', () => ({ scheduleTokenRefresh: vi.fn() }));
vi.mock('@/shared/analytics/capture.ts', () => ({ captureAnalyticsEvent: captureMock }));

import { switchToOrganization, switchToPersonal } from './switch.ts';

const TEAM_ID = 'org_abcdefghij0123456789x';
const PERSONAL_ID = 'org_personalij0123456789x';
const TS = '2026-01-01T00:00:00.000Z';

/**
 * The organization list is its own cache now, not part of the context — so a
 * switch has to re-derive each row's `isActive` there. These rows seed it.
 */
const BASE_ORGS: MyOrganizationSummary[] = [
  {
    id: TEAM_ID,
    name: 'Acme',
    slug: 'acme',
    type: 'TEAM',
    status: 'ACTIVE',
    logoUrl: null,
    createdAt: TS,
    updatedAt: TS,
    isActive: true,
  },
  {
    id: PERSONAL_ID,
    name: 'Personal',
    slug: null,
    type: 'PERSONAL',
    status: 'ACTIVE',
    logoUrl: null,
    createdAt: TS,
    updatedAt: TS,
    isActive: false,
  },
];

const BASE_CTX: MeContext = {
  user: {
    id: 'usr_abcdefghij0123456789x',
    email: 'ada@acme.test',
    isEmailVerified: true,
    isMfaEnabled: false,
    firstName: 'Ada',
    lastName: null,
    avatarUrl: null,
    status: 'ACTIVE',
    createdAt: TS,
    updatedAt: TS,
  },
  activeOrganization: {
    id: TEAM_ID,
    name: 'Acme',
    slug: 'acme',
    type: 'TEAM',
    status: 'ACTIVE',
    logoUrl: null,
    createdAt: TS,
    updatedAt: TS,
  },
  myPermissions: ['membership:manage'],
  globalRole: null,
  deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
  personalOrganizationId: PERSONAL_ID,
};

const PERSONAL_WIRE = {
  id: PERSONAL_ID,
  name: 'Personal',
  slug: null,
  type: 'PERSONAL',
  status: 'ACTIVE',
  logo_url: null,
  created_at: TS,
  updated_at: TS,
};

beforeEach(() => {
  postMock.mockReset();
  setAccessTokenMock.mockReset();
  captureMock.mockReset();
  useOrganizationStore.getState().clearOrganization();
  queryClient.setQueryData(meContextQueryKey, structuredClone(BASE_CTX));
  queryClient.setQueryData(myOrganizationsQueryKey, structuredClone(BASE_ORGS));
});

afterEach(() => {
  queryClient.clear();
});

describe('tenancy/switch', () => {
  it('re-mints the token + applies the inline delta (live switch-to-personal)', async () => {
    postMock.mockResolvedValue({
      data: {
        access_token: 'new_tok',
        active_organization: PERSONAL_WIRE,
        my_permissions: ['organization:read'],
        global_role: null,
      },
    });

    const result = await switchToPersonal();

    expect(postMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/switch-to-personal'),
      {},
    );
    expect(setAccessTokenMock).toHaveBeenCalledWith('new_tok');
    expect(result?.activeOrganization?.id).toBe(PERSONAL_ID);
    expect(result?.myPermissions).toEqual(['organization:read']);
    // Every row's `isActive` is derived from the context this switch just
    // changed, so the list cache must be re-derived in place — not left stale,
    // and not refetched: the membership set did not change, only which is active.
    const orgs = queryClient.getQueryData<MyOrganizationSummary[]>(
      myOrganizationsQueryKey,
    );
    expect(orgs?.find((o) => o.id === PERSONAL_ID)?.isActive).toBe(true);
    expect(orgs?.find((o) => o.id === TEAM_ID)?.isActive).toBe(false);
    // user + org list are stable across a switch
    expect(result?.user.email).toBe('ada@acme.test');
    expect(orgs).toHaveLength(2);
    // org store is derived from the switched context
    expect(useOrganizationStore.getState().organizationType).toBe('PERSONAL');
    expect(useOrganizationStore.getState().organizationId).toBe(PERSONAL_ID);
    // analytics fires with the personal target.
    expect(captureMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ target_type: 'PERSONAL', switch_target: 'personal' }),
    );
  });

  it('skips the POST when the caller has no personal organization (would 404)', async () => {
    // Personal orgs enabled for the deployment, but this user has none provisioned
    // (core-be provisions best-effort) → me/context reports `personalOrganizationId:
    // null`. Firing switch-to-personal here would 404 on the server, so short-circuit.
    queryClient.setQueryData(meContextQueryKey, {
      ...structuredClone(BASE_CTX),
      personalOrganizationId: null,
    });

    const result = await switchToPersonal();

    expect(result).toBeUndefined();
    expect(postMock).not.toHaveBeenCalled();
    expect(setAccessTokenMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it('switches org context, derives the store, applies the role + analytics (live)', async () => {
    postMock.mockResolvedValue({
      data: {
        access_token: 't2',
        active_organization: {
          ...PERSONAL_WIRE,
          id: TEAM_ID,
          type: 'TEAM',
          slug: 'acme',
        },
        my_permissions: ['membership:manage'],
        global_role: 'super_admin',
      },
    });

    const result = await switchToOrganization(TEAM_ID);

    expect(postMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/switch-to-organization'),
      { organization_id: TEAM_ID },
    );
    // The `if (result)` block ran: deriveOrgContext synced the store to the team.
    expect(useOrganizationStore.getState().organizationType).toBe('TEAM');
    expect(useOrganizationStore.getState().organizationId).toBe(TEAM_ID);
    // global_role is applied via the `??` fallback (a `&&` mutant would null it).
    expect(result?.globalRole).toBe('super_admin');
    // analytics fires with the org id + resolved type.
    expect(captureMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        target_organization_id: TEAM_ID,
        target_type: 'TEAM',
        switch_target: 'organization',
      }),
    );
  });

  it('keeps each org cache isolated and intact across a switch (#4 — instant switch-back)', async () => {
    // Seed the org we are leaving. Keys carry the org id, so they belong to it
    // alone and must SURVIVE the switch — that is what makes switching back
    // instant. The new org reads a different (here empty) key.
    queryClient.setQueryData(orgQueryKeys.members(TEAM_ID), [{ id: 'm_team' }]);
    queryClient.setQueryData(billingQueryKeys.activeSubscription(TEAM_ID), {
      id: 'sub_team',
    });

    postMock.mockResolvedValue({
      data: {
        access_token: 't3',
        active_organization: PERSONAL_WIRE,
        my_permissions: [],
        global_role: null,
      },
    });

    await switchToPersonal();

    // The left org's data is NOT purged — switching back serves it from cache.
    expect(queryClient.getQueryData(orgQueryKeys.members(TEAM_ID))).toEqual([
      { id: 'm_team' },
    ]);
    expect(
      queryClient.getQueryData(billingQueryKeys.activeSubscription(TEAM_ID)),
    ).toEqual({ id: 'sub_team' });
    // The new scope is a structurally distinct key — no cross-tenant bleed.
    expect(queryClient.getQueryData(orgQueryKeys.members(PERSONAL_ID))).toBeUndefined();
    // me-context is still updated by the switch.
    expect(queryClient.getQueryData(meContextQueryKey)).toBeDefined();
  });

  it('never lets two tenants share a cache entry (structural key isolation)', async () => {
    queryClient.setQueryData(orgQueryKeys.members('org_a'), [{ id: 'a' }]);
    queryClient.setQueryData(orgQueryKeys.members('org_b'), [{ id: 'b' }]);

    postMock.mockResolvedValue({
      data: {
        access_token: 't4',
        active_organization: { ...PERSONAL_WIRE, id: TEAM_ID },
        my_permissions: [],
        global_role: null,
      },
    });

    await switchToOrganization(TEAM_ID);

    // Each org keeps its own rows regardless of the active org.
    expect(queryClient.getQueryData(orgQueryKeys.members('org_a'))).toEqual([
      { id: 'a' },
    ]);
    expect(queryClient.getQueryData(orgQueryKeys.members('org_b'))).toEqual([
      { id: 'b' },
    ]);
  });

  it('drops a superseded switch so the latest org wins the token (race guard)', async () => {
    const ORG_A = 'org_aaaaaaaaaaaaaaaaaaaaa';
    const ORG_B = 'org_bbbbbbbbbbbbbbbbbbbbb';
    const wireFor = (id: string) => ({
      id,
      name: 'Acme',
      slug: 'acme',
      type: 'TEAM' as const,
      status: 'ACTIVE' as const,
      logo_url: null,
      created_at: TS,
      updated_at: TS,
    });

    let resolveA!: (v: unknown) => void;
    let resolveB!: (v: unknown) => void;
    const pendingA = new Promise((r) => {
      resolveA = r;
    });
    const pendingB = new Promise((r) => {
      resolveB = r;
    });
    postMock.mockReturnValueOnce(pendingA).mockReturnValueOnce(pendingB);

    // Two switches initiated back-to-back: A first (older), then B (latest).
    const switchA = switchToOrganization(ORG_A);
    const switchB = switchToOrganization(ORG_B);

    // The latest switch (B) resolves first and applies its token + context.
    resolveB({
      data: {
        access_token: 'tok_b',
        active_organization: wireFor(ORG_B),
        my_permissions: [],
        global_role: null,
      },
    });
    await switchB;

    // The superseded switch (A) resolves LATE — it must be discarded, never
    // clobber the token back to the previous tenant.
    resolveA({
      data: {
        access_token: 'tok_a',
        active_organization: wireFor(ORG_A),
        my_permissions: [],
        global_role: null,
      },
    });
    const staleResult = await switchA;

    expect(staleResult).toBeUndefined();
    expect(setAccessTokenMock).toHaveBeenCalledWith('tok_b');
    expect(setAccessTokenMock).not.toHaveBeenCalledWith('tok_a');
    expect(setAccessTokenMock).toHaveBeenCalledTimes(1);
    expect(
      queryClient.getQueryData<MeContext>(meContextQueryKey)?.activeOrganization?.id,
    ).toBe(ORG_B);
  });
});
