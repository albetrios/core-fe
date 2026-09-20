import { z } from 'zod';

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
};

// `InvitationStatus` still backs the accept-invite status badge
// (OrganizationBadges); the full invitation resource/type was removed with the
// dead /invitations subsystem — invites are INVITED memberships (see Member).
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export type RoleSummary = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
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

/** Assignable (non-system) permissions a custom role may grant. */
export const ASSIGNABLE_ROLE_PERMISSIONS = [
  'organization:read',
  'organization:update',
  'membership:read',
  'membership:manage',
  'invitation:manage',
  'role:read',
  'role:manage',
  'api-key:read',
  'api-key:manage',
  'subscription:read',
  'subscription:manage',
] as const;

/** Form input for creating or editing a custom role. */
export const roleInputSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(40),
  description: z.string().min(2, 'Add a short description').max(160),
  permissions: z.array(z.string()).min(1, 'Select at least one permission'),
});
export type RoleInput = z.infer<typeof roleInputSchema>;
