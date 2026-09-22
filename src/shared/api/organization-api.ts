import { z } from 'zod';

import { API_BASE_PATH } from '@/core/config/constants.ts';
import { apiClient } from '@/core/http/fetch-client.ts';
import type { OrganizationPermission } from '@/core/rbac/policies.ts';
import { organizationPermissionSchema } from '@/core/types/permissions.ts';
import { isoDateString, publicId } from '@/core/types/wire.ts';
import { parseListTolerant } from '@/lib/parse-list-tolerant.ts';
import type {
  ApiKey,
  ApiKeyWithSecret,
  Member,
  MembershipStatus,
  OrgRole,
  RoleSummary,
} from '@/shared/api/organization-contracts.ts';
import { AppError } from '@/shared/errors/AppError.ts';
import { FRONTEND_ERROR_CODES } from '@/shared/errors/frontend-error-codes.ts';
import { fetchMeContext } from '@/shared/tenancy/me-context.ts';

import { fetchListPage, type ListPage, type ListPageParams } from './fetch-list-page.ts';

/** Active-org scoped tenancy base (active org comes from the token, not the URL). */
const ORG_API = `${API_BASE_PATH}/tenancy/organization`;
const INVITATIONS_API = `${API_BASE_PATH}/tenancy/invitations`;

const VALID_PERMISSIONS = new Set<string>(organizationPermissionSchema.options);

/**
 * Keeps only the permission codes this build knows about.
 *
 * Exported so a caller that already holds a me-context can reuse the same
 * filter instead of paying a second `me/context` round trip for it.
 */
export function toOrganizationPermissions(codes: string[]): OrganizationPermission[] {
  return codes.filter((p): p is OrganizationPermission => VALID_PERMISSIONS.has(p));
}

export async function getMyPermissions(): Promise<OrganizationPermission[]> {
  const ctx = await fetchMeContext();
  return toOrganizationPermissions(ctx.myPermissions);
}

export interface AcceptedInvitation {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
}

const acceptedInvitationWire = z.object({
  organization_id: publicId('org'),
  organization_name: z.string().optional(),
  organization_slug: z.string().nullable().optional(),
});

export async function acceptInvitation(
  invitationId: string,
  token: string,
): Promise<AcceptedInvitation> {
  const res = await apiClient.post<unknown>(
    `${INVITATIONS_API}/${encodeURIComponent(invitationId)}/accept`,
    { token },
    { skip401: true },
  );
  const wire = acceptedInvitationWire.parse(res.data);
  return {
    organizationId: wire.organization_id,
    organizationName: wire.organization_name ?? '',
    organizationSlug: wire.organization_slug ?? '',
  };
}

// ── Members ──

const membershipUserWire = z.object({
  id: publicId('usr'),
  email: z.string(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});
const membershipWire = z.object({
  id: z.string(),
  user_id: publicId('usr'),
  role_id: publicId('rol'),
  status: z.enum(['ACTIVE', 'INVITED', 'SUSPENDED']),
  joined_at: isoDateString.nullable(),
  last_active_at: isoDateString.nullable().optional(),
  user: membershipUserWire,
  role: z.object({ id: publicId('rol'), name: z.string() }),
});
type MembershipWire = z.infer<typeof membershipWire>;

function toMembershipStatus(status: MembershipWire['status']): MembershipStatus {
  if (status === 'ACTIVE') return 'active';
  if (status === 'SUSPENDED') return 'suspended';
  return 'invited';
}

function toOrgRole(name: string): OrgRole {
  const n = name.toLowerCase();
  if (n === 'owner' || n === 'admin' || n === 'viewer') return n;
  return 'member';
}

function toMember(w: MembershipWire): Member {
  const fullName = [w.user.first_name, w.user.last_name].filter(Boolean).join(' ');
  return {
    id: w.id,
    userId: w.user_id,
    name: fullName.length > 0 ? fullName : w.user.email,
    email: w.user.email,
    role: toOrgRole(w.role.name),
    roleId: w.role.id,
    roleName: w.role.name,
    status: toMembershipStatus(w.status),
    avatarUrl: w.user.avatar_url ?? undefined,
    joinedAt: w.joined_at ?? '',
    lastActiveAt: w.last_active_at ?? undefined,
  };
}

/**
 * One page of the active organization's members. Windowed server-side (search
 * `q` + keyset cursor) so a large org never ships its whole roster to the
 * browser; callers accumulate pages via `useInfiniteQuery`.
 */
export async function listMembers(
  params: ListPageParams = {},
): Promise<ListPage<Member>> {
  const page = await fetchListPage(
    `${ORG_API}/memberships`,
    membershipWire,
    'memberships',
    params,
  );
  return { ...page, rows: page.rows.map(toMember) };
}

export async function updateMemberRole(input: {
  membershipId: string;
  role: OrgRole;
  roleId?: string;
}): Promise<Member> {
  if (!input.roleId) {
    throw new AppError(
      FRONTEND_ERROR_CODES.MEMBER_ROLE_REQUIRED,
      400,
      FRONTEND_ERROR_CODES.MEMBER_ROLE_REQUIRED,
    );
  }
  const res = await apiClient.patch<unknown>(
    `${ORG_API}/memberships/${input.membershipId}`,
    { role_id: input.roleId },
  );
  return toMember(membershipWire.parse(res.data));
}

export async function updateMemberStatus(input: {
  membershipId: string;
  status: MembershipStatus;
}): Promise<Member> {
  const res = await apiClient.patch<unknown>(
    `${ORG_API}/memberships/${input.membershipId}`,
    { status: input.status.toUpperCase() },
  );
  return toMember(membershipWire.parse(res.data));
}

export async function removeMember(membershipId: string): Promise<{ id: string }> {
  await apiClient.delete<unknown>(`${ORG_API}/memberships/${membershipId}`);
  return { id: membershipId };
}

/**
 * Invite a member by email (core-be REQ-1). There is no separate "invitation"
 * resource: `POST /organization/memberships` provisions/resolves the user and
 * creates an **INVITED** membership with the given role, emailing an invite
 * token. The invitee then appears in the members list as `invited` until they
 * accept. Requires `invitation:manage`.
 */
export async function inviteMember(input: {
  email: string;
  roleId: string;
}): Promise<Member> {
  const res = await apiClient.post<unknown>(`${ORG_API}/memberships`, {
    email: input.email,
    role_id: input.roleId,
  });
  return toMember(membershipWire.parse(res.data));
}

// Invitations are INVITED memberships (see `inviteMember` above), not a
// standalone resource. The old /organization/invitations list/create/revoke/
// resend calls were removed — core-be has no such route (they 404'd). The
// separate accept-invite flow (`acceptInvitation`) is unrelated and lives above.

// ── Roles ──

const roleWire = z.object({
  id: publicId('rol'),
  name: z.string(),
  description: z.string().nullable().optional(),
  is_system: z.boolean(),
  permissions: z.array(z.string()).optional(),
  member_count: z.number().int().nonnegative().optional(),
});
type RoleWire = z.infer<typeof roleWire>;

function toRoleSummary(w: RoleWire): RoleSummary {
  return {
    id: w.id,
    name: w.name,
    description: w.description ?? '',
    permissions: w.permissions ?? [],
    memberCount: w.member_count ?? 0,
    isSystem: w.is_system,
  };
}

/** One page of the active organization's roles (windowed: search `q` + keyset cursor). */
export async function listRoles(
  params: ListPageParams = {},
): Promise<ListPage<RoleSummary>> {
  const page = await fetchListPage(`${ORG_API}/roles`, roleWire, 'roles', params);
  return { ...page, rows: page.rows.map(toRoleSummary) };
}

/**
 * Create a custom role. core-be splits this into two calls: `POST /roles`
 * accepts only `{ name, description }` (a `.strict()` body — sending
 * `permissions` 400s), and the permission set is applied via
 * `PUT /roles/:id/permissions` with `permission_codes`. We chain them and
 * return the role with the permissions we just assigned.
 */
export async function createRole(input: {
  name: string;
  description: string;
  permissions: string[];
}): Promise<RoleSummary> {
  const created = await apiClient.post<unknown>(`${ORG_API}/roles`, {
    name: input.name,
    description: input.description,
  });
  const role = toRoleSummary(roleWire.parse(created.data));

  if (input.permissions.length === 0) return role;

  await apiClient.put<unknown>(`${ORG_API}/roles/${role.id}/permissions`, {
    permission_codes: input.permissions,
  });
  return { ...role, permissions: input.permissions };
}

/**
 * Update a custom role. Same two-step contract as {@link createRole}: `PATCH
 * /roles/:id` takes only `{ name, description }` (its `.strict()` body 400s on
 * `permissions`), and the permission set is replaced via `PUT
 * /roles/:id/permissions` with `permission_codes`.
 */
export async function updateRole(input: {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}): Promise<RoleSummary> {
  const res = await apiClient.patch<unknown>(`${ORG_API}/roles/${input.id}`, {
    name: input.name,
    description: input.description,
  });
  const role = toRoleSummary(roleWire.parse(res.data));

  await apiClient.put<unknown>(`${ORG_API}/roles/${input.id}/permissions`, {
    permission_codes: input.permissions,
  });
  return { ...role, permissions: input.permissions };
}

export async function deleteRole(roleId: string): Promise<{ id: string }> {
  await apiClient.delete<unknown>(`${ORG_API}/roles/${roleId}`);
  return { id: roleId };
}

const rolePermissionWire = z.object({ permission_code: z.string() });

/**
 * The permission codes granted to one role. The roles LIST omits permissions
 * (only `GET /roles/:id/permissions` returns them), so editing a role must read
 * them here to pre-fill — otherwise a save would wipe the role's real grants.
 */
export async function getRolePermissions(roleId: string): Promise<string[]> {
  const res = await apiClient.get<unknown>(`${ORG_API}/roles/${roleId}/permissions`);
  return parseListTolerant(rolePermissionWire, res.data, 'role permissions').map(
    (row) => row.permission_code,
  );
}

// ── API keys ──

/**
 * One API-key row as core-be serializes it
 * (`organization-api-key.serializer.ts`). The masked prefix is `key_prefix` on
 * the wire — this schema asked for `prefix`, so the first organization to own a
 * key got a parse failure instead of a list. An empty organization parsed fine,
 * which is why the mismatch survived: the only state anyone had seen was the
 * empty one.
 */
const apiKeyWire = z.object({
  id: z.string(),
  name: z.string(),
  key_prefix: z.string(),
  created_at: isoDateString,
  last_used_at: isoDateString.nullable().optional(),
  expires_at: isoDateString.nullable().optional(),
});
type ApiKeyWire = z.infer<typeof apiKeyWire>;

function toApiKey(w: ApiKeyWire): ApiKey {
  return {
    id: w.id,
    name: w.name,
    prefix: w.key_prefix,
    createdAt: w.created_at,
    lastUsedAt: w.last_used_at ?? undefined,
    expiresAt: w.expires_at ?? undefined,
  };
}

/** One page of the active organization's API keys (windowed: search `q` + keyset cursor). */
export async function listApiKeys(
  params: ListPageParams = {},
): Promise<ListPage<ApiKey>> {
  const page = await fetchListPage(`${ORG_API}/api-keys`, apiKeyWire, 'api-keys', params);
  return { ...page, rows: page.rows.map(toApiKey) };
}

/**
 * Create an API key. The full secret comes back exactly once.
 *
 * `scopes` is REQUIRED and the body is `.strict()` server-side, so a request
 * without it is rejected 400 before it reaches the handler — which is what the
 * earlier shape of this fetcher did, and why nothing ever called it. The scopes
 * are permission codes, and core-be additionally refuses any the caller does not
 * hold themselves (`assertCallerCanGrantPermissionCodes`).
 *
 * `expires_in_days` is a NUMBER of days (1–365) or omitted for a key that never
 * expires — not the string the old shape sent.
 */
export async function createApiKey(input: {
  name: string;
  scopes: string[];
  expiresInDays: number | null;
}): Promise<ApiKeyWithSecret> {
  const res = await apiClient.post<unknown>(`${ORG_API}/api-keys`, {
    name: input.name,
    scopes: input.scopes,
    ...(input.expiresInDays === null ? {} : { expires_in_days: input.expiresInDays }),
  });
  // `{ api_key, raw_key }`, not a flat row with a `secret` field.
  const wire = z.object({ api_key: apiKeyWire, raw_key: z.string() }).parse(res.data);
  return { ...toApiKey(wire.api_key), secret: wire.raw_key };
}

export async function renameApiKey(input: { id: string; name: string }): Promise<ApiKey> {
  const res = await apiClient.patch<unknown>(`${ORG_API}/api-keys/${input.id}`, {
    name: input.name,
  });
  return toApiKey(apiKeyWire.parse(res.data));
}

export async function revokeApiKey(keyId: string): Promise<{ id: string }> {
  await apiClient.delete<unknown>(`${ORG_API}/api-keys/${keyId}`);
  return { id: keyId };
}
