import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_ROUTES } from '@/core/config/constants.ts';
import type { AuthUser } from '@/shared/auth/types.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

import { useHasPermission, useRequirePermission } from './useRBAC.ts';

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, useNavigate: () => navigateMock };
});

const USER = { id: 'usr_1', email: 'u@e.com', role: 'user' } as AuthUser;

describe('useHasPermission', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null });
    useOrganizationStore.getState().clearOrganization();
  });

  it('is false when signed out', () => {
    const { result } = renderHook(() => useHasPermission('organization:read'));
    expect(result.current).toBe(false);
  });

  it('reflects the active organization permission set', () => {
    useAuthStore.setState({ user: USER });
    useOrganizationStore.getState().setPermissions(['membership:read']);

    expect(renderHook(() => useHasPermission('membership:read')).result.current).toBe(
      true,
    );
    expect(renderHook(() => useHasPermission('role:manage')).result.current).toBe(false);
  });

  it('super_admin bypasses the permission set', () => {
    useAuthStore.setState({ user: { ...USER, role: 'super_admin' } as AuthUser });
    expect(renderHook(() => useHasPermission('role:manage')).result.current).toBe(true);
  });
});

describe('useRequirePermission', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    useAuthStore.setState({ user: null });
    useOrganizationStore.getState().clearOrganization();
  });

  it('redirects to /unauthorized when signed out', () => {
    renderHook(() => useRequirePermission('organization:read'));
    expect(navigateMock).toHaveBeenCalledWith({
      to: AUTH_ROUTES.UNAUTHORIZED,
      replace: true,
    });
  });

  it('redirects when the active organization lacks the permission', () => {
    useAuthStore.setState({ user: USER });
    useOrganizationStore.getState().setPermissions(['membership:read']);

    renderHook(() => useRequirePermission('role:manage'));
    expect(navigateMock).toHaveBeenCalledWith({
      to: AUTH_ROUTES.UNAUTHORIZED,
      replace: true,
    });
  });

  it('does not redirect when the permission is held', () => {
    useAuthStore.setState({ user: USER });
    useOrganizationStore.getState().setPermissions(['membership:read']);

    renderHook(() => useRequirePermission('membership:read'));
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('does not redirect for super_admin regardless of the permission set', () => {
    useAuthStore.setState({ user: { ...USER, role: 'super_admin' } as AuthUser });

    renderHook(() => useRequirePermission('role:manage'));
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('re-evaluates when the permission set changes', () => {
    useAuthStore.setState({ user: USER });
    useOrganizationStore.getState().setPermissions(['membership:read']);

    const { rerender } = renderHook(
      ({ permission }: { permission: 'membership:read' | 'role:manage' }) =>
        useRequirePermission(permission),
      { initialProps: { permission: 'membership:read' as const } },
    );
    expect(navigateMock).not.toHaveBeenCalled();

    rerender({ permission: 'role:manage' });
    expect(navigateMock).toHaveBeenCalledWith({
      to: AUTH_ROUTES.UNAUTHORIZED,
      replace: true,
    });
  });
});
