import type { ReactNode } from 'react';

import { hasPermission, type OrganizationPermission } from '@/core/rbac/policies.ts';
import { useAuthStore } from '@/shared/store/useAuthStore/index.ts';
import { useOrganizationStore } from '@/shared/store/useOrganizationStore/index.ts';

interface PermissionGuardProps {
  /** Required org-scoped permission to render children. */
  permission: OrganizationPermission;
  /** Content to show if permission is granted. */
  children: ReactNode;
  /** Optional fallback when permission is denied (defaults to nothing). */
  fallback?: ReactNode;
  /**
   * What to render while the permission set has not been answered yet — a
   * disabled placeholder of the same size, so the control does not pop in a
   * moment later (SET-23). Defaults to `fallback`.
   */
  pending?: ReactNode;
}

/**
 * Declarative RBAC guard component. Renders `children` only when the user holds
 * the required org-scoped permission in the active organization; otherwise
 * renders `fallback`.
 *
 * @example
 * <PermissionGuard permission="membership:manage">
 *   <InviteMemberButton />
 * </PermissionGuard>
 */
export function PermissionGuard({
  permission,
  children,
  fallback = null,
  pending,
}: PermissionGuardProps) {
  const user = useAuthStore((s) => s.user);
  const permissions = useOrganizationStore((s) => s.permissions);
  const resolved = useOrganizationStore((s) => s.permissionsResolved);

  if (!resolved) {
    return (
      <span data-testid="permission-guard" data-state="pending" className="contents">
        {pending ?? fallback}
      </span>
    );
  }

  if (!(user && hasPermission({ role: user.role, permissions }, permission))) {
    return (
      <span data-testid="permission-guard" className="contents">
        {fallback}
      </span>
    );
  }

  return (
    <span data-testid="permission-guard" className="contents">
      {children}
    </span>
  );
}
