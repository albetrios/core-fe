import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMock, postMock, putMock, patchMock, deleteMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  patchMock: vi.fn(),
  deleteMock: vi.fn(),
}));
const { uploadFileMock } = vi.hoisted(() => ({ uploadFileMock: vi.fn() }));
vi.mock('./uploads-api.ts', () => ({ uploadFile: uploadFileMock }));
vi.mock('@/core/http/fetch-client.ts', () => ({
  apiClient: {
    get: getMock,
    post: postMock,
    put: putMock,
    patch: patchMock,
    delete: deleteMock,
  },
}));

import {
  createApiKey,
  createRole,
  deleteRole,
  getMyPermissions,
  getRolePermissions,
  inviteMember,
  listApiKeys,
  listMembers,
  listPermissionCatalog,
  listRoles,
  removeMember,
  removeOrganizationLogo,
  revokeApiKey,
  toOrganizationPermissions,
  updateMemberRole,
  updateMemberStatus,
  updateRole,
  uploadOrganizationLogo,
} from './organization-api.ts';

const TS = '2026-01-01T00:00:00.000Z';

const USR = 'usr_abcdefghij0123456789x';
const ROL = 'rol_abcdefghij0123456789x';
const WIRE_MEMBER = {
  id: 'mem_abcdefghij0123456789x',
  user_id: USR,
  role_id: ROL,
  status: 'ACTIVE',
  joined_at: '2026-01-01T00:00:00.000Z',
  last_active_at: null,
  user: {
    id: USR,
    email: 'ada@acme.test',
    first_name: 'Ada',
    last_name: 'Byron',
    avatar_url: null,
  },
  role: { id: ROL, name: 'Owner' },
};

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  putMock.mockReset();
  patchMock.mockReset();
  deleteMock.mockReset();
});

describe('organization-api memberships (live)', () => {
  it('maps the membership wire to the flat Member domain shape', async () => {
    getMock.mockResolvedValue({ data: [WIRE_MEMBER] });
    const { rows } = await listMembers();
    const [member] = rows;
    expect(member).toMatchObject({
      id: 'mem_abcdefghij0123456789x',
      userId: USR,
      name: 'Ada Byron',
      email: 'ada@acme.test',
      role: 'owner',
      status: 'active',
      joinedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(member?.avatarUrl).toBeUndefined();
    expect(getMock).toHaveBeenCalledWith(
      expect.stringContaining('/tenancy/organization/memberships'),
    );
  });

  it('windows the list: forwards q + limit and surfaces the keyset cursor', async () => {
    getMock.mockResolvedValue({
      data: [WIRE_MEMBER],
      meta: { pagination: { has_more: true, next: 'cur_1', per_page: 25 } },
    });
    const page = await listMembers({ q: 'ada' });
    expect(page.rows).toHaveLength(1);
    expect(page.next).toBe('cur_1');
    expect(page.hasMore).toBe(true);
    const url = getMock.mock.calls[0]?.[0] as string;
    expect(url).toContain('q=ada');
    expect(url).toContain('limit=25');
  });

  it('falls back to email for a nameless user and buckets custom roles as member', async () => {
    getMock.mockResolvedValue({
      data: [
        {
          ...WIRE_MEMBER,
          user: { ...WIRE_MEMBER.user, first_name: null, last_name: null },
          role: { id: ROL, name: 'Billing Manager' },
        },
      ],
    });
    const [member] = (await listMembers()).rows;
    expect(member?.name).toBe('ada@acme.test');
    expect(member?.role).toBe('member');
  });

  it('updateMemberRole posts the immutable role_id', async () => {
    patchMock.mockResolvedValue({ data: WIRE_MEMBER });
    await updateMemberRole({ membershipId: 'mem_x', role: 'admin', roleId: ROL });
    expect(patchMock).toHaveBeenCalledWith(
      expect.stringContaining('/memberships/mem_x'),
      {
        role_id: ROL,
      },
    );
  });

  it('updateMemberRole requires a role id', async () => {
    await expect(
      updateMemberRole({ membershipId: 'mem_x', role: 'admin' }),
    ).rejects.toMatchObject({ code: 'MEMBER_ROLE_REQUIRED' });
  });

  it('updateMemberStatus posts the uppercase status and maps the result', async () => {
    patchMock.mockResolvedValue({ data: { ...WIRE_MEMBER, status: 'SUSPENDED' } });
    const member = await updateMemberStatus({
      membershipId: 'mem_x',
      status: 'suspended',
    });
    expect(patchMock).toHaveBeenCalledWith(
      expect.stringContaining('/memberships/mem_x'),
      {
        status: 'SUSPENDED',
      },
    );
    expect(member.status).toBe('suspended');
  });

  it('removeMember deletes and returns the id', async () => {
    deleteMock.mockResolvedValue({ data: null });
    expect(await removeMember('mem_x')).toEqual({ id: 'mem_x' });
    expect(deleteMock).toHaveBeenCalledWith(
      expect.stringContaining('/memberships/mem_x'),
    );
  });

  it('inviteMember posts email + role_id to /memberships (not /invitations)', async () => {
    // Regression: the old createInvitation hit a non-existent /invitations
    // endpoint (404). core-be adds an INVITED member via POST /memberships.
    postMock.mockResolvedValue({
      data: { ...WIRE_MEMBER, status: 'INVITED', joined_at: null },
    });
    const member = await inviteMember({ email: 'new@acme.test', roleId: ROL });
    expect(postMock).toHaveBeenCalledWith(expect.stringContaining('/memberships'), {
      email: 'new@acme.test',
      role_id: ROL,
    });
    expect(postMock.mock.calls[0]?.[0]).not.toContain('/invitations');
    expect(member.status).toBe('invited');
  });
});

const ROLE_WIRE = {
  id: ROL,
  name: 'Admin',
  description: 'Org admins',
  is_system: true,
  permissions: ['membership:manage'],
  member_count: 3,
};

describe('organization-api roles (live)', () => {
  it('maps the role wire to RoleSummary', async () => {
    getMock.mockResolvedValue({ data: [ROLE_WIRE] });
    const [role] = (await listRoles()).rows;
    expect(role).toMatchObject({
      id: ROL,
      name: 'Admin',
      description: 'Org admins',
      isSystem: true,
      memberCount: 3,
      permissions: ['membership:manage'],
    });
  });

  it('defaults missing permissions / member_count / description', async () => {
    getMock.mockResolvedValue({ data: [{ id: ROL, name: 'Viewer', is_system: true }] });
    const [role] = (await listRoles()).rows;
    expect(role?.permissions).toEqual([]);
    expect(role?.memberCount).toBe(0);
    expect(role?.description).toBe('');
  });

  it('createRole POSTs name+description then PUTs permission_codes (two-step)', async () => {
    // Regression: core-be's create body is `.strict()` and rejects `permissions`
    // (400). Permissions are applied via PUT /roles/:id/permissions.
    postMock.mockResolvedValue({ data: { ...ROLE_WIRE, is_system: false } });
    putMock.mockResolvedValue({ data: null });
    // The stored set is read back after the PUT rather than echoing the request.
    getMock.mockResolvedValue({ data: [{ permission_code: 'role:read' }] });
    const role = await createRole({
      name: 'X',
      description: 'd',
      permissions: ['role:read'],
    });
    expect(postMock).toHaveBeenCalledWith(expect.stringContaining('/roles'), {
      name: 'X',
      description: 'd',
    });
    expect(putMock).toHaveBeenCalledWith(
      expect.stringContaining(`/roles/${ROL}/permissions`),
      { permission_codes: ['role:read'] },
    );
    expect(role.permissions).toEqual(['role:read']);
  });

  // The two calls are not atomic and the second one genuinely fails — core-be refuses any
  // code the caller does not hold. Leaving the role behind meant an error message plus a
  // zero-permission role the user never asked for.
  it('createRole rolls the role back when the permissions PUT is refused', async () => {
    postMock.mockResolvedValue({ data: { ...ROLE_WIRE, is_system: false } });
    putMock.mockRejectedValue(new Error('forbidden'));
    deleteMock.mockResolvedValue({ data: null });

    await expect(
      createRole({ name: 'X', description: 'd', permissions: ['role:read'] }),
    ).rejects.toThrow('forbidden');

    expect(deleteMock).toHaveBeenCalledWith(expect.stringContaining(`/roles/${ROL}`));
  });

  it('createRole reports the original failure even when the rollback also fails', async () => {
    postMock.mockResolvedValue({ data: { ...ROLE_WIRE, is_system: false } });
    putMock.mockRejectedValue(new Error('forbidden'));
    deleteMock.mockRejectedValue(new Error('cleanup exploded'));

    await expect(
      createRole({ name: 'X', description: 'd', permissions: ['role:read'] }),
    ).rejects.toThrow('forbidden');
  });

  it('createRole skips the permissions PUT when none are selected', async () => {
    postMock.mockResolvedValue({ data: { ...ROLE_WIRE, is_system: false } });
    await createRole({ name: 'X', description: 'd', permissions: [] });
    expect(putMock).not.toHaveBeenCalled();
  });

  it('updateRole PATCHes name+description then PUTs permission_codes (two-step)', async () => {
    // Same strict-body contract as createRole: the PATCH rejects `permissions`.
    patchMock.mockResolvedValue({ data: { ...ROLE_WIRE, is_system: false } });
    putMock.mockResolvedValue({ data: null });
    getMock.mockResolvedValue({
      data: [{ permission_code: 'role:read' }, { permission_code: 'membership:manage' }],
    });
    const role = await updateRole({
      id: ROL,
      name: 'X',
      description: 'd',
      permissions: ['role:read', 'membership:manage'],
    });
    expect(patchMock).toHaveBeenCalledWith(expect.stringContaining(`/roles/${ROL}`), {
      name: 'X',
      description: 'd',
    });
    expect(putMock).toHaveBeenCalledWith(
      expect.stringContaining(`/roles/${ROL}/permissions`),
      { permission_codes: ['role:read', 'membership:manage'] },
    );
    // The stored set, read back — not the requested one echoed. The cache must never claim a
    // role is more capable than the server says it is.
    expect(role.permissions).toEqual(['role:read', 'membership:manage']);
    expect(getMock).toHaveBeenCalledWith(
      expect.stringContaining(`/roles/${ROL}/permissions`),
    );
  });

  it('getRolePermissions maps the wire rows to permission_code strings', async () => {
    // The roles LIST omits permissions; the edit dialog reads them here.
    getMock.mockResolvedValue({
      data: [
        { permission_code: 'membership:read' },
        { permission_code: 'membership:manage' },
      ],
    });
    const perms = await getRolePermissions(ROL);
    expect(getMock).toHaveBeenCalledWith(
      expect.stringContaining(`/roles/${ROL}/permissions`),
    );
    expect(perms).toEqual(['membership:read', 'membership:manage']);
  });

  it('deleteRole deletes and returns the id', async () => {
    deleteMock.mockResolvedValue({ data: null });
    expect(await deleteRole('rol_x')).toEqual({ id: 'rol_x' });
    expect(deleteMock).toHaveBeenCalledWith(expect.stringContaining('/roles/rol_x'));
  });
});

/**
 * One API-key row exactly as core-be's `organization-api-key.serializer.ts`
 * emits it. The masked prefix is `key_prefix` — this fixture used to say
 * `prefix`, which matched the frontend schema rather than the server, so the
 * pair agreed with each other and with nothing else. An organization with no
 * keys parsed fine either way, which is why it went unnoticed.
 */
const KEY_WIRE = {
  id: 'key_1',
  name: 'CI token',
  key_prefix: 'core_live_abcd',
  created_at: TS,
  last_used_at: null,
  expires_at: null,
};

describe('organization-api api-keys (live)', () => {
  it('maps the api-key wire to ApiKey', async () => {
    getMock.mockResolvedValue({ data: [KEY_WIRE] });
    const [key] = (await listApiKeys()).rows;
    expect(key).toMatchObject({
      id: 'key_1',
      name: 'CI token',
      prefix: 'core_live_abcd',
      createdAt: TS,
    });
    expect(key?.expiresAt).toBeUndefined();
  });

  it('createApiKey sends scopes and a NUMBER of days, and unwraps raw_key', async () => {
    // Three corrections in one call, all of which the old shape got wrong:
    // `scopes` is REQUIRED and the body is `.strict()` server-side;
    // `expires_in_days` is a number of days, not a string; and the response is
    // `{ api_key, raw_key }`, not a flat row carrying a `secret`.
    postMock.mockResolvedValue({
      data: { api_key: KEY_WIRE, raw_key: 'core_live_abcd_secret' },
    });
    const created = await createApiKey({
      name: 'CI token',
      scopes: ['organization:read'],
      expiresInDays: 30,
    });
    expect(created.secret).toBe('core_live_abcd_secret');
    expect(created.prefix).toBe('core_live_abcd');
    expect(postMock).toHaveBeenCalledWith(expect.stringContaining('/api-keys'), {
      name: 'CI token',
      scopes: ['organization:read'],
      expires_in_days: 30,
    });
  });

  it('createApiKey OMITS expires_in_days for a key that never expires', async () => {
    // core-be caps the field at 365, so "never" cannot be a larger number.
    postMock.mockResolvedValue({
      data: { api_key: KEY_WIRE, raw_key: 'core_live_abcd_secret' },
    });
    await createApiKey({
      name: 'Forever',
      scopes: ['organization:read'],
      expiresInDays: null,
    });
    expect(postMock).toHaveBeenCalledWith(expect.stringContaining('/api-keys'), {
      name: 'Forever',
      scopes: ['organization:read'],
    });
  });

  it('revokeApiKey deletes and returns the id', async () => {
    deleteMock.mockResolvedValue({ data: null });
    expect(await revokeApiKey('key_1')).toEqual({ id: 'key_1' });
    expect(deleteMock).toHaveBeenCalledWith(expect.stringContaining('/api-keys/key_1'));
  });
});

describe('organization-api permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toOrganizationPermissions drops codes this build does not know', () => {
    // A newer backend can grant a code this frontend has no policy for. Passing it
    // through would put an unrenderable permission into the store.
    expect(
      toOrganizationPermissions(['organization:read', 'not:a:real:permission']),
    ).toEqual(['organization:read']);
  });

  it('getMyPermissions reads the filtered codes off me/context', async () => {
    // The network fallback for when no me/context is cached — the guard chain
    // normally has one, and reads it directly (see ensurePermissionsFor).
    getMock.mockResolvedValue({
      data: {
        user: {
          id: USR,
          email: 'owner@example.com',
          first_name: null,
          last_name: null,
          avatar_url: null,
          status: 'ACTIVE',
          is_email_verified: true,
          is_mfa_enabled: false,
          onboarding_completed: true,
          created_at: TS,
          updated_at: TS,
        },
        active_organization: null,
        active_organization_id: null,
        my_permissions: ['organization:read', 'nope:nope'],
        global_role: null,
        organizations: [],
        deployment_flags: { personal_organizations: true, team_organizations: true },
        personal_organization_id: null,
      },
    });

    expect(await getMyPermissions()).toEqual(['organization:read']);
    expect(getMock).toHaveBeenCalledWith(expect.stringContaining('/auth/me/context'));
  });
});

describe('organization-api permission catalog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the catalog core-be enforces', async () => {
    getMock.mockResolvedValue({
      data: [
        { code: 'organization:read', name: 'View Organization', category: 'tenancy' },
        { code: 'webhook:manage', name: 'Manage Webhooks', category: 'notify' },
      ],
    });

    const rows = await listPermissionCatalog();

    expect(getMock).toHaveBeenCalledWith(expect.stringContaining('/tenancy/permissions'));
    expect(rows).toEqual([
      { code: 'organization:read', name: 'View Organization', category: 'tenancy' },
      { code: 'webhook:manage', name: 'Manage Webhooks', category: 'notify' },
    ]);
  });

  // A backend that adds a permission ahead of this client must not break the picker: the
  // unknown code is dropped rather than rendered as an unselectable mystery row.
  it('drops codes this build does not model', async () => {
    getMock.mockResolvedValue({
      data: [
        { code: 'organization:read', name: 'View Organization', category: 'tenancy' },
        { code: 'quantum:entangle', name: 'Entangle', category: 'future' },
      ],
    });

    const rows = await listPermissionCatalog();

    expect(rows.map((row) => row.code)).toEqual(['organization:read']);
  });
});

describe('organization-api logo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads the bytes, then attaches the FINAL key', async () => {
    uploadFileMock.mockResolvedValue({ key: 'organization-logos/org_a/abc.png' });
    putMock.mockResolvedValue({ data: null });

    const file = new File(['bytes'], 'logo.png', { type: 'image/png' });
    await uploadOrganizationLogo({ file, organizationId: 'org_a' });

    expect(uploadFileMock).toHaveBeenCalledWith({
      file,
      purpose: 'organization-logo',
      organizationId: 'org_a',
    });
    expect(putMock).toHaveBeenCalledWith(expect.stringContaining('/organization/logo'), {
      key: 'organization-logos/org_a/abc.png',
    });
  });

  // Nothing is attached unless the bytes actually landed — a failed upload must leave the
  // existing logo alone rather than pointing the organization at a key that is not there.
  it('does not attach when the upload fails', async () => {
    uploadFileMock.mockRejectedValue(new Error('storage refused'));

    await expect(
      uploadOrganizationLogo({
        file: new File(['b'], 'logo.png', { type: 'image/png' }),
        organizationId: 'org_a',
      }),
    ).rejects.toThrow('storage refused');
    expect(putMock).not.toHaveBeenCalled();
  });

  it('clears the logo through the delete route', async () => {
    deleteMock.mockResolvedValue({ data: null });

    await removeOrganizationLogo();

    expect(deleteMock).toHaveBeenCalledWith(
      expect.stringContaining('/organization/logo'),
    );
  });
});
