import { z } from 'zod';

/**
 * Organization-scoped permission codes, mirroring core-be's permission reference.
 *
 * These are granted to a user by their membership/role **within a specific
 * organization** and are resolved server-side. The client mirrors them only to
 * drive UX (hiding/disabling actions, gating routes) — never as the security
 * boundary. The backend always re-checks.
 *
 * Lives in `core/types/` (not `core/rbac/`) so the `lib` layer — e.g. the
 * route-island page manifest — can reference the permission type without
 * importing the RBAC engine (see fe-file-structure.mdc → Import Rules).
 */
export const organizationPermissionSchema = z.enum([
  'organization:read',
  'organization:update',
  'organization:delete',
  'membership:read',
  'membership:manage',
  'invitation:manage',
  'role:read',
  'role:manage',
  'api-key:read',
  'api-key:manage',
  'notification-policy:read',
  'notification-policy:manage',
  'subscription:read',
  'subscription:manage',
  'webhook:read',
  'webhook:manage',
  'audit-log:read',
  'upload:manage',
]);

export type OrganizationPermission = z.infer<typeof organizationPermissionSchema>;
