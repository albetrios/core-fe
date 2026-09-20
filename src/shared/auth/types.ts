import { z } from 'zod';

/**
 * Global (platform-wide) role, as defined by core-be.
 *
 * - `super_admin` / `admin`: platform staff (admin console — out of scope for the
 *   non-admin organization app, but modelled for completeness).
 * - `user`: a normal end user; organization-level permissions are governed by
 *   org-scoped permission codes (see {@link OrganizationPermission} in `@/core/rbac/policies.ts`),
 *   not by this global role.
 */
const roleSchema = z.enum(['super_admin', 'admin', 'user']);
export type Role = z.infer<typeof roleSchema>;

/**
 * The authenticated user as surfaced to the client.
 *
 * `organizationId` is optional: the active organization is tracked separately in the
 * organization store ({@link useOrganizationStore}) since a user may belong to several orgs.
 */
export const authUserSchema = z.object({
  id: z.string(),
  email: z.email(),
  role: roleSchema,
  organizationId: z.string().optional(),
  name: z.string().optional(),
  jobTitle: z.string().optional(),
  avatarUrl: z.string().optional(),
});

export type AuthUser = z.infer<typeof authUserSchema>;

export type AuthTokenResponse = { accessToken: string };
