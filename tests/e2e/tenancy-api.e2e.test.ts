import { type APIRequestContext, expect, test } from '@playwright/test';

import {
  e2eOrganizationName,
  e2eOrganizationSlug,
  e2eRoleName,
  e2eTeamOrgProfile,
} from '@/tests/utils/e2e-faker.ts';
import { createSessionViaEmailCode, uniqueE2eEmail } from '@/tests/utils/e2e-session.ts';
import {
  bearerHeaders,
  createTeamOrganization,
  idempotencyKey,
} from '@/tests/utils/e2e-tenancy.ts';

/**
 * Tenancy contract e2e against core-be on :3000.
 */
const API = '/api/v1';

let api: APIRequestContext;

async function sessionToken(): Promise<string> {
  return (await createSessionViaEmailCode(api)).accessToken;
}

/** Create a TEAM org and switch the token into it; returns the team-scoped token + org. */
async function createTeamAndSwitch(token: string) {
  const { createStatus, org, teamToken } = await createTeamOrganization(api, token);
  return { createStatus, org, teamToken };
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: 'http://localhost:3000' });
});
test.afterAll(async () => {
  await api?.dispose();
});

test.describe('core-be — organization lifecycle', () => {
  test.describe.configure({ mode: 'serial' });

  test('[+] create a TEAM organization (with X-Idempotency-Key)', async () => {
    const token = await sessionToken();
    const { name, slug } = e2eTeamOrgProfile({ label: 'acme' });
    const res = await api.post(`${API}/tenancy/organizations`, {
      headers: bearerHeaders(token, true),
      data: { name, slug },
    });
    expect(res.status()).toBe(201);
    const { data } = await res.json();
    expect(data.type).toBe('TEAM');
    expect(data.slug).toBe(slug);
  });

  test('[-] create organization WITHOUT X-Idempotency-Key → 422', async () => {
    const token = await sessionToken();
    const res = await api.post(`${API}/tenancy/organizations`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: e2eOrganizationName(), slug: e2eOrganizationSlug('noidem') },
    });
    expect(res.status()).toBe(422);
  });

  test('[-] create organization with a duplicate slug → 409', async () => {
    const token = await sessionToken();
    const slug = e2eOrganizationSlug('dup');
    const first = await api.post(`${API}/tenancy/organizations`, {
      headers: bearerHeaders(token, true),
      data: { name: e2eOrganizationName(), slug },
    });
    expect(first.status()).toBe(201);
    const second = await api.post(`${API}/tenancy/organizations`, {
      headers: bearerHeaders(token, true),
      data: { name: e2eOrganizationName(), slug },
    });
    expect(second.status()).toBe(409);
  });

  test('[-] create organization with an invalid slug → 4xx', async () => {
    const token = await sessionToken();
    const res = await api.post(`${API}/tenancy/organizations`, {
      headers: bearerHeaders(token, true),
      data: { name: e2eOrganizationName(), slug: 'Not A Valid Slug!' },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('[+] current organization + by-slug lookup resolve for a team', async () => {
    const token = await sessionToken();
    const { org, teamToken } = await createTeamAndSwitch(token);
    test.skip(!org, 'team creation unavailable on this deployment');

    const current = await api.get(`${API}/tenancy/organization`, {
      headers: bearerHeaders(teamToken),
    });
    expect(current.status()).toBe(200);
    expect((await current.json()).data.id).toBe(org?.id);

    if (org?.slug) {
      const bySlug = await api.get(`${API}/tenancy/organizations/by-slug/${org.slug}`, {
        headers: bearerHeaders(teamToken),
      });
      expect(bySlug.status()).toBe(200);
    }
  });

  test('[-] by-slug lookup for a nonexistent slug → 404', async () => {
    const token = await sessionToken();
    const res = await api.get(
      `${API}/tenancy/organizations/by-slug/${e2eOrganizationSlug('nope')}`,
      {
        headers: bearerHeaders(token),
      },
    );
    expect(res.status()).toBe(404);
  });

  test('[+] idempotency replay: same key + body returns the same org', async () => {
    const token = await sessionToken();
    const key = idempotencyKey();
    const { name, slug } = e2eTeamOrgProfile({ label: 'replay' });
    const headers = { Authorization: `Bearer ${token}`, 'X-Idempotency-Key': key };
    const body = { name, slug };
    const first = await api.post(`${API}/tenancy/organizations`, { headers, data: body });
    const second = await api.post(`${API}/tenancy/organizations`, {
      headers,
      data: body,
    });
    expect(first.status()).toBe(201);
    const id1 = ((await first.json()) as { data: { id: string } }).data.id;
    const id2 = ((await second.json()) as { data: { id: string } }).data.id;
    expect(id2).toBe(id1); // a replay returns the original resource, not a duplicate
  });

  test('[+] tenant isolation: a fresh user sees only their own orgs', async () => {
    const tokenA = await sessionToken();
    const { org } = await createTeamAndSwitch(tokenA);
    test.skip(!org, 'team creation unavailable on this deployment');

    const tokenB = await sessionToken();
    const listB = await api.get(`${API}/tenancy/organizations`, {
      headers: bearerHeaders(tokenB),
    });
    const ids = ((await listB.json()) as { data: Array<{ id: string }> }).data.map(
      (o) => o.id,
    );
    expect(ids).not.toContain(org?.id);
  });
});

test.describe('core-be — roles, members & permission catalog', () => {
  test.describe.configure({ mode: 'serial' });

  test('[+] permission catalog lists the org permission codes', async () => {
    const token = await sessionToken();
    const res = await api.get(`${API}/tenancy/permissions`, {
      headers: bearerHeaders(token),
    });
    expect(res.status()).toBe(200);
    const codes = ((await res.json()) as { data: Array<{ code: string }> }).data.map(
      (p) => p.code,
    );
    expect(codes).toContain('organization:read');
    expect(codes).toContain('membership:manage');
  });

  test('[+] a team lists roles, memberships and api-keys', async () => {
    const token = await sessionToken();
    const { org, teamToken } = await createTeamAndSwitch(token);
    test.skip(!org, 'team creation unavailable on this deployment');

    const roles = await api.get(`${API}/tenancy/organization/roles`, {
      headers: bearerHeaders(teamToken),
    });
    expect(roles.status()).toBe(200);
    expect((await roles.json()).data.length).toBeGreaterThanOrEqual(1); // system Owner role

    const members = await api.get(`${API}/tenancy/organization/memberships`, {
      headers: bearerHeaders(teamToken),
    });
    expect(members.status()).toBe(200);
    expect((await members.json()).data.length).toBeGreaterThanOrEqual(1); // the owner

    const keys = await api.get(`${API}/tenancy/organization/api-keys`, {
      headers: bearerHeaders(teamToken),
    });
    expect(keys.status()).toBe(200);
  });

  test('[+] create a custom role in a team', async () => {
    const token = await sessionToken();
    const { org, teamToken } = await createTeamAndSwitch(token);
    test.skip(!org, 'team creation unavailable on this deployment');

    const res = await api.post(`${API}/tenancy/organization/roles`, {
      headers: bearerHeaders(teamToken, true),
      data: { name: e2eRoleName(), description: 'created by e2e' },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).data.is_system).toBe(false);
  });

  test('[-] create a role with an empty name → 4xx', async () => {
    const token = await sessionToken();
    const { org, teamToken } = await createTeamAndSwitch(token);
    test.skip(!org, 'team creation unavailable on this deployment');

    const res = await api.post(`${API}/tenancy/organization/roles`, {
      headers: bearerHeaders(teamToken, true),
      data: { name: '' },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('core-be — personal-org guards (422)', () => {
  test.describe.configure({ mode: 'serial' });

  test('[-] cannot add a member to a personal org → 422', async () => {
    const token = await sessionToken(); // token is scoped to the personal org
    const res = await api.post(`${API}/tenancy/organization/memberships`, {
      headers: bearerHeaders(token, true),
      data: { email: uniqueE2eEmail(), role_id: 'rol_zzzzzzzzzzzzzzzzzzzzz' },
    });
    expect(res.status()).toBe(422);
  });

  test('[-] cannot create a role in a personal org → 422', async () => {
    const token = await sessionToken();
    const res = await api.post(`${API}/tenancy/organization/roles`, {
      headers: bearerHeaders(token, true),
      data: { name: 'Should Fail' },
    });
    expect(res.status()).toBe(422);
  });
});

test.describe('core-be — tenancy auth guards (401)', () => {
  // Every tenancy surface rejects an unauthenticated caller before any body or
  // membership check — no org data leaks to anonymous requests.
  test('[-] create organization without auth → 401', async () => {
    const res = await api.post(`${API}/tenancy/organizations`, {
      headers: { 'X-Idempotency-Key': idempotencyKey() },
      data: { name: e2eOrganizationName(), slug: e2eOrganizationSlug() },
    });
    expect(res.status()).toBe(401);
  });

  test('[-] list roles without auth → 401', async () => {
    expect((await api.get(`${API}/tenancy/organization/roles`)).status()).toBe(401);
  });

  test('[-] list memberships without auth → 401', async () => {
    expect((await api.get(`${API}/tenancy/organization/memberships`)).status()).toBe(401);
  });

  test('[-] permission catalog without auth → 401', async () => {
    expect((await api.get(`${API}/tenancy/permissions`)).status()).toBe(401);
  });

  test('[-] by-slug lookup without auth → 401 (no tenant enumeration)', async () => {
    const res = await api.get(
      `${API}/tenancy/organizations/by-slug/${e2eOrganizationSlug()}`,
    );
    expect(res.status()).toBe(401);
  });
});
