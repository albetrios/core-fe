import { z } from 'zod';

import {
  type OrganizationPermission,
  organizationPermissionSchema,
} from '@/core/types/permissions.ts';

/**
 * Organization domain types and runtime form schemas.
 *
 * These mirror the core-be response shapes for memberships, invitations, roles,
 * and API keys. Wire shapes mirror core-be; see `@/shared/api/organization-api.ts`.
 */

/** Role a member holds within an organization. */

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';

export type MembershipStatus = 'active' | 'invited' | 'suspended';

export type Member = {
  id: string;
  userId: string;
  name: string;
  email: string;
  /** Coarse built-in bucket; custom roles may map to this lossy category. */
  role: OrgRole;
  /** Actual assigned role id and display name, including custom roles. */
  roleId: string;
  roleName: string;
  status: MembershipStatus;
  joinedAt: string;
  avatarUrl?: string;
  lastActiveAt?: string;
  /**
   * The live invitation behind an `invited` row: its id (for resend / cancel) and
   * when its link expires. `null` for everyone who has joined.
   */
  invitation: MemberInvitation | null;
};

/** A pending invitation as the members list reports it. */
export type MemberInvitation = {
  id: string;
  /** ISO-8601. Past this, core-be refuses to resend it; cancel and invite again. */
  expiresAt: string;
};

// `InvitationStatus` still backs the accept-invite status badge
// (OrganizationBadges); the full invitation resource/type was removed with the
// dead /invitations subsystem — invites are INVITED memberships (see Member).
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export type RoleSummary = {
  id: string;
  name: string;
  description: string;
  /** Known codes only — `toOrganizationPermissions` drops anything this build does not model. */
  permissions: OrganizationPermission[];
  memberCount: number;
  isSystem: boolean;
};

export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
};

/**
 * API key returned immediately after creation. The full `secret` is shown to the
 * user exactly once and is never retrievable again (mirrors the backend contract).
 */

export type ApiKeyWithSecret = ApiKey & {
  secret: string;
};

/**
 * Form input for creating or editing a custom role.
 *
 * The selectable permissions are NOT listed here: they come from core-be's own catalog
 * (`GET /tenancy/permissions`, via `useAssignablePermissions`) intersected with what the
 * caller holds. A hardcoded list had drifted to 11 of the backend's 18 codes, which made the
 * missing ones — both webhook codes among them — impossible to delegate through this UI.
 * `permissions` is typed against the permission union so an unknown code cannot be submitted.
 */
export const roleInputSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(40),
  description: z.string().min(2, 'Add a short description').max(160),
  permissions: z
    .array(organizationPermissionSchema)
    .min(1, 'Select at least one permission'),
});
export type RoleInput = z.infer<typeof roleInputSchema>;
