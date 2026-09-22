import { describe, expect, it, vi } from 'vitest';

import type { AccessContext } from './policies.ts';
import {
  hasAllPermissions,
  hasAnyPermission,
  hasGlobalRole,
  hasPermission,
} from './policies.ts';

// The empty-list footgun warning is gated on platformConfig.debugLogging
// (env-driven, off by default) — turn it on so the warn path is exercised.
vi.mock('@/core/config/env.ts', () => ({
  platformConfig: { debugLogging: true },
}));

const ctx = (over: Partial<AccessContext> = {}): AccessContext => ({
  role: 'user',
  permissions: [],
  ...over,
});

describe('hasPermission', () => {
  it('grants when the active-org permission set includes the code', () => {
    expect(
      hasPermission(ctx({ permissions: ['membership:read'] }), 'membership:read'),
    ).toBe(true);
  });

  it('denies when the permission is not in the set', () => {
    expect(
      hasPermission(ctx({ permissions: ['membership:read'] }), 'membership:manage'),
    ).toBe(false);
  });

  // super_admin is a platform-admin role (the admin console), not an organization
  // capability: core-be's requireOrganizationPermission has no global-role branch, so a
  // bypass here would only unlock controls the API answers with 403.
  it('super_admin is still governed by org permissions', () => {
    expect(hasPermission(ctx({ role: 'super_admin' }), 'organization:delete')).toBe(
      false,
    );
  });

  it('super_admin is granted a permission it actually holds', () => {
    expect(
      hasPermission(
        ctx({ role: 'super_admin', permissions: ['organization:delete'] }),
        'organization:delete',
      ),
    ).toBe(true);
  });

  it('global admin is still governed by org permissions', () => {
    expect(hasPermission(ctx({ role: 'admin' }), 'organization:delete')).toBe(false);
  });
});

describe('hasAllPermissions', () => {
  it('returns true when all permissions are granted', () => {
    expect(
      hasAllPermissions(ctx({ permissions: ['role:read', 'role:manage'] }), [
        'role:read',
        'role:manage',
      ]),
    ).toBe(true);
  });

  it('returns false when any permission is missing', () => {
    expect(
      hasAllPermissions(ctx({ permissions: ['role:read'] }), [
        'role:read',
        'role:manage',
      ]),
    ).toBe(false);
  });

  it('returns true for an empty list but warns about the footgun when debug logging is on (2.4)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(hasAllPermissions(ctx(), [])).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('hasAnyPermission', () => {
  it('returns true when at least one permission is granted', () => {
    expect(
      hasAnyPermission(ctx({ permissions: ['api-key:read'] }), [
        'api-key:manage',
        'api-key:read',
      ]),
    ).toBe(true);
  });

  it('returns false when none are granted', () => {
    expect(
      hasAnyPermission(ctx({ permissions: [] }), ['api-key:manage', 'api-key:read']),
    ).toBe(false);
  });

  it('returns false for an empty list', () => {
    expect(hasAnyPermission(ctx(), [])).toBe(false);
  });
});

describe('hasGlobalRole', () => {
  it('matches an allowed global role', () => {
    expect(hasGlobalRole('admin', ['super_admin', 'admin'])).toBe(true);
  });

  it('rejects a non-allowed global role', () => {
    expect(hasGlobalRole('user', ['super_admin', 'admin'])).toBe(false);
  });
});
