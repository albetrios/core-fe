import { beforeEach, describe, expect, it } from 'vitest';

import { PRODUCT_NAMESPACE } from '@/lib/product-identity.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

import type { MeContext } from './me-context.ts';
import {
  deriveOrgContext,
  getActiveOrganizationId,
  syncOrganizationFromRoute,
} from './organization-context.ts';

const TEAM_CTX: MeContext = {
  user: {
    id: 'usr_abcdefghij0123456789x',
    email: 'ada@acme.test',
    isEmailVerified: true,
    isMfaEnabled: false,
    firstName: 'Ada',
    lastName: null,
    avatarUrl: null,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  activeOrganization: {
    id: 'org_abcdefghij0123456789x',
    name: 'Acme',
    slug: 'acme',
    type: 'TEAM',
    status: 'ACTIVE',
    logoUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  myPermissions: ['organization:read', 'definitely-not-a-real-permission'],
  globalRole: null,
  organizations: [],
  deploymentFlags: { personalOrganizations: true, teamOrganizations: true },
  personalOrganizationId: null,
};

describe('organization context (URL → derived store)', () => {
  beforeEach(() => {
    useOrganizationStore.getState().clearOrganization();
    localStorage.clear();
  });

  it('syncs the store from the route param without persisting org to storage', () => {
    syncOrganizationFromRoute('org_acme', 'acme');

    expect(useOrganizationStore.getState().organizationId).toBe('org_acme');
    expect(useOrganizationStore.getState().organizationSlug).toBe('acme');
    // The active org lives in the URL + derived store only — never localStorage.
    // A persisted `${PRODUCT_NAMESPACE}-last-organization` pointer used to survive logout and
    // expose the previous user's org to the next sign-in on this browser.
    expect(localStorage.getItem(`${PRODUCT_NAMESPACE}-last-organization`)).toBeNull();
  });

  it('does not reset the store when the organization is unchanged', () => {
    syncOrganizationFromRoute('org_acme', 'acme');
    useOrganizationStore.getState().setPermissions(['organization:read']);

    syncOrganizationFromRoute('org_acme', 'acme');

    // Same organization → permissions survive (no spurious setOrganization).
    expect(useOrganizationStore.getState().permissions).toEqual(['organization:read']);
  });

  it('getActiveOrganizationId reads the derived cache', () => {
    expect(getActiveOrganizationId()).toBeNull();
    syncOrganizationFromRoute('org_globex', 'globex');
    expect(getActiveOrganizationId()).toBe('org_globex');
  });
});

describe('deriveOrgContext (me/context → derived store)', () => {
  beforeEach(() => useOrganizationStore.getState().clearOrganization());

  it('derives id/slug/type/status + filters unknown permissions', () => {
    deriveOrgContext(TEAM_CTX);
    const s = useOrganizationStore.getState();
    expect(s.organizationId).toBe('org_abcdefghij0123456789x');
    expect(s.organizationSlug).toBe('acme');
    expect(s.organizationType).toBe('TEAM');
    expect(s.organizationStatus).toBe('active');
    // Unknown permission codes are dropped (RBAC matches known codes only).
    expect(s.permissions).toEqual(['organization:read']);
    expect(s.deploymentFlags).toEqual({
      personalOrganizations: true,
      teamOrganizations: true,
    });
    expect(s.personalOrganizationId).toBeNull();
  });

  it('clears the active-org context when there is no active org', () => {
    deriveOrgContext(TEAM_CTX);
    deriveOrgContext({ ...TEAM_CTX, activeOrganization: null, myPermissions: [] });
    const s = useOrganizationStore.getState();
    expect(s.organizationId).toBeNull();
    expect(s.organizationType).toBeNull();
    expect(s.permissions).toEqual([]);
  });
});
