import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  redirect: vi.fn((opts: unknown) => {
    throw { __isRedirect: true, ...(opts as Record<string, unknown>) };
  }),
  notFound: vi.fn(() => {
    throw { __isNotFound: true };
  }),
}));

vi.mock('@/shared/auth/service.ts', () => ({
  awaitAuthBootstrap: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/shared/store/useAuthStore/index.ts', () => {
  let state = { user: null as unknown, isAuthenticated: false, isLoading: false };
  return {
    useAuthStore: {
      getState: () => state,
      __setState: (s: typeof state) => {
        state = s;
      },
    },
  };
});

vi.mock('@/shared/store/useOrganizationStore/index.ts', () => {
  let state = { permissions: [] as string[], organizationSlug: undefined as unknown };
  return {
    useOrganizationStore: {
      getState: () => state,
      __setState: (s: typeof state) => {
        state = s;
      },
    },
  };
});

vi.mock('@/core/rbac/policies.ts', async (importOriginal) => {
  return importOriginal();
});

import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

import { redirectIfAuthenticated, requireAuth, requirePermission } from './guards.ts';

const setAuth = (useAuthStore as unknown as { __setState: (s: unknown) => void })
  .__setState;
const setOrganization = (
  useOrganizationStore as unknown as { __setState: (s: unknown) => void }
).__setState;

describe('requireAuth', () => {
  beforeEach(() => {
    setAuth({ user: null, isAuthenticated: false, isLoading: false });
  });

  it('throws redirect when not authenticated', async () => {
    await expect(requireAuth()).rejects.toThrow();
  });

  it('does not throw when authenticated', async () => {
    setAuth({ user: { id: '1', role: 'user' }, isAuthenticated: true, isLoading: false });
    await expect(requireAuth()).resolves.toBeUndefined();
  });
});

describe('redirectIfAuthenticated', () => {
  it('does not throw for guests (login form renders)', async () => {
    setAuth({ user: null, isAuthenticated: false, isLoading: false });
    await expect(redirectIfAuthenticated()).resolves.toBeUndefined();
  });

  it('redirects signed-in users to / (resolver picks the destination)', async () => {
    setAuth({
      user: { id: '1', email: 'u@test.com', role: 'user' },
      isAuthenticated: true,
      isLoading: false,
    });
    await expect(redirectIfAuthenticated()).rejects.toMatchObject({ to: '/' });
  });
});

describe('requirePermission', () => {
  beforeEach(() => {
    setAuth({ user: null, isAuthenticated: false, isLoading: false });
    setOrganization({ permissions: [] });
  });

  it('throws redirect to login when not authenticated', async () => {
    await expect(requirePermission('membership:read')).rejects.toMatchObject({
      to: '/login',
    });
  });

  it('throws redirect to unauthorized when lacking permission', async () => {
    setAuth({
      user: { id: '1', email: 'u@test.com', role: 'user' },
      isAuthenticated: true,
      isLoading: false,
    });
    setOrganization({ permissions: ['membership:read'] });
    await expect(requirePermission('membership:manage')).rejects.toMatchObject({
      to: '/unauthorized',
    });
  });

  it('does not throw when the active org grants the permission', async () => {
    setAuth({
      user: { id: '1', email: 'u@test.com', role: 'user' },
      isAuthenticated: true,
      isLoading: false,
    });
    setOrganization({ permissions: ['membership:manage'] });
    await expect(requirePermission('membership:manage')).resolves.toBeUndefined();
  });

  // super_admin is a platform-admin role, not an organization capability: core-be grants it
  // nothing org-scoped, so letting it through here would only reach a 403.
  it('throws for super_admin without the org permission', async () => {
    setAuth({
      user: { id: '1', email: 'sa@test.com', role: 'super_admin' },
      isAuthenticated: true,
      isLoading: false,
    });
    setOrganization({ permissions: [] });
    await expect(requirePermission('organization:delete')).rejects.toBeDefined();
  });

  it('does not throw for super_admin that holds the org permission', async () => {
    setAuth({
      user: { id: '1', email: 'sa@test.com', role: 'super_admin' },
      isAuthenticated: true,
      isLoading: false,
    });
    setOrganization({ permissions: ['organization:delete'] });
    await expect(requirePermission('organization:delete')).resolves.toBeUndefined();
  });

  it('fails closed when the synced org context does not match the route org (2.1)', async () => {
    setAuth({
      user: { id: '1', email: 'u@test.com', role: 'user' },
      isAuthenticated: true,
      isLoading: false,
    });
    // Store synced to acme, but the route is for globex → deny even with the grant.
    setOrganization({ permissions: ['membership:manage'], organizationSlug: 'acme' });
    await expect(
      requirePermission('membership:manage', undefined, 'globex'),
    ).rejects.toMatchObject({ to: '/unauthorized' });
  });

  it('allows when the expected org slug matches the synced context (2.1)', async () => {
    setAuth({
      user: { id: '1', email: 'u@test.com', role: 'user' },
      isAuthenticated: true,
      isLoading: false,
    });
    setOrganization({ permissions: ['membership:manage'], organizationSlug: 'acme' });
    await expect(
      requirePermission('membership:manage', undefined, 'acme'),
    ).resolves.toBeUndefined();
  });
});
