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
/** Sibling of ORG_API, not a child: the permission catalog is platform-wide, not org-scoped. */
const PERMISSIONS_API = `${API_BASE_PATH}/tenancy/permissions`;

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

/**
 * The caller's permission codes in the active organization, filtered to the ones
 * this client knows about.
 *
 * @remarks
 * Reads `me/context` rather than a dedicated endpoint, so it shares that request's
 * cache. Codes core-be returns that are not in the client's union are dropped by
 * `toOrganizationPermissions` — a newer backend never breaks an older client.
 *
 * @returns The granted codes, or an empty list outside an organization.
 */
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
  // The live pending invitation, present only on INVITED rows. Optional so a
  // response from before core-be sent it still parses.
  invitation: z
    .object({ id: publicId('inv'), expires_at: isoDateString })
    .nullable()
    .optional(),
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
    invitation: w.invitation
      ? { id: w.invitation.id, expiresAt: w.invitation.expires_at }
      : null,
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
 * accept. Requires `membership:manage`.
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

// Invitations are created as INVITED memberships (see `inviteMember` above), and
// each INVITED row carries its live invitation (`Member.invitation`). There is
// no list or create route under /organization/invitations — only resend and
// revoke, keyed by that invitation's id. Accepting (`acceptInvitation`) is the
// invitee's side and lives above.

const resentInvitationWire = z.object({
  invitation: z.object({
    id: publicId('inv'),
    email: z.string(),
    expires_at: isoDateString,
  }),
});

/**
 * Send a pending invitation again.
 *
 * @remarks
 * The invitee gets a fresh link and core-be's default expiry (7 days). core-be
 * refuses once the invitation has expired, been accepted or been revoked, and
 * rate-limits the route strictly. Requires `invitation:manage`.
 */
export async function resendInvitation(
  invitationId: string,
): Promise<{ email: string; expiresAt: string }> {
  const res = await apiClient.post<unknown>(
    `${ORG_API}/invitations/${encodeURIComponent(invitationId)}/resend`,
    {},
  );
  const { invitation } = resentInvitationWire.parse(res.data);
  return { email: invitation.email, expiresAt: invitation.expires_at };
}

/**
 * Revoke a pending invitation.
 *
 * @remarks
 * core-be revokes it and removes the invited membership in one step, so the row
 * leaves the members list. Removing the membership alone left the invitation
 * unrevoked: the invitee's link then failed with "not found" instead of saying
 * the invitation was revoked. Requires `invitation:manage`.
 */
export async function revokeInvitation(invitationId: string): Promise<{ id: string }> {
  await apiClient.delete<unknown>(
    `${ORG_API}/invitations/${encodeURIComponent(invitationId)}`,
  );
  return { id: invitationId };
}

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
    // Drop codes this build does not model rather than widening the type — an unknown code
    // cannot be rendered in the picker or round-tripped through a save.
    permissions: toOrganizationPermissions(w.permissions ?? []),
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

  // The two calls are not atomic, and the second one genuinely fails: core-be refuses any
  // code the caller does not personally hold. Left alone that surfaced an error while a
  // zero-permission role stayed behind — a role the user never asked for and did not know
  // existed. Roll the creation back so a failed write leaves nothing behind, and report the
  // original failure rather than the cleanup's.
  try {
    await apiClient.put<unknown>(`${ORG_API}/roles/${role.id}/permissions`, {
      permission_codes: input.permissions,
    });
  } catch (error) {
    await deleteRole(role.id).catch(() => undefined);
    throw error;
  }
  // Read the stored set back rather than echoing the request: the response is what the
  // cache and the UI should believe.
  return { ...role, permissions: await getRolePermissions(role.id) };
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

  // `PUT .../permissions` is a full replace and can be refused independently of the PATCH
  // above, so an edit can half-apply: renamed, but not re-permissioned. Nothing can be rolled
  // back here (the previous name is already gone), so surface the failure and let the caller
  // invalidate — the mutation hooks do — rather than reporting a success that is half true.
  await apiClient.put<unknown>(`${ORG_API}/roles/${input.id}/permissions`, {
    permission_codes: input.permissions,
  });
  return { ...role, permissions: await getRolePermissions(input.id) };
}

/**
 * Delete a custom role.
 *
 * @remarks
 * core-be refuses this for a seeded (`is_system`) role, so the caller should offer it
 * only for roles the organization created. The route answers 204 with no body; the id
 * is echoed back so callers can evict it from the roles cache.
 *
 * @param roleId - Public id of the role to delete.
 * @returns The deleted role's id.
 */
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
export async function getRolePermissions(
  roleId: string,
): Promise<OrganizationPermission[]> {
  const res = await apiClient.get<unknown>(`${ORG_API}/roles/${roleId}/permissions`);
  return toOrganizationPermissions(
    parseListTolerant(rolePermissionWire, res.data, 'role permissions').map(
      (row) => row.permission_code,
    ),
  );
}

const permissionCatalogWire = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  category: z.string(),
});

/** One assignable permission, as the role builder and API-key scope picker render it. */
export interface PermissionCatalogEntry {
  code: OrganizationPermission;
  /** Human label supplied by core-be (e.g. "Manage API Keys") — no client i18n key needed. */
  name: string;
  category: string;
}

/**
 * The permission catalog core-be actually enforces (`GET /tenancy/permissions`, auth-only).
 *
 * Replaces a hardcoded client list that had drifted to 11 of the backend's codes, silently
 * making the missing ones — both webhook codes among them — undelegatable through the roles
 * UI. Unknown codes are dropped (`toOrganizationPermissions`) so a backend that adds one
 * ahead of the client cannot break the picker.
 */
export async function listPermissionCatalog(): Promise<PermissionCatalogEntry[]> {
  const res = await apiClient.get<unknown>(PERMISSIONS_API);
  return parseListTolerant(permissionCatalogWire, res.data, 'permission catalog')
    .filter((row): row is typeof row & { code: OrganizationPermission } =>
      VALID_PERMISSIONS.has(row.code),
    )
    .map((row) => ({ code: row.code, name: row.name, category: row.category }));
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
