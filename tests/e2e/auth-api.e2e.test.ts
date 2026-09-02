import { type APIRequestContext, expect, test } from '@playwright/test';

import {
  AUTH_EMAIL_CODE_LOGIN_PATH,
  AUTH_EMAIL_CODE_SEND_PATH,
} from '@/tests/utils/auth-api-paths.ts';
import { e2eTeamOrgProfile } from '@/tests/utils/e2e-faker.ts';
import {
  createSessionViaEmailCode,
  e2eAuthHeaders,
  uniqueE2eEmail,
} from '@/tests/utils/e2e-session.ts';

/**
 * Auth API contracts against core-be on http://localhost:3000.
 */
const HOST = 'http://localhost:3000';

let api: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: HOST });
});

test.afterAll(async () => {
  await api?.dispose();
});

test.describe('core-be server — auth & tenancy contracts', () => {
  test.describe.configure({ mode: 'serial' });

  test('[+] email send-code returns uniform 201 + request_id', async () => {
    const email = uniqueE2eEmail();
    const res = await api.post(AUTH_EMAIL_CODE_SEND_PATH, {
      data: { email },
      headers: e2eAuthHeaders(),
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.message).toBeTruthy();
    expect(body.data.expires_in_minutes).toBeGreaterThan(0);
    expect(body.meta.request_id).toBeTruthy();
  });

  test('[+] email login returns access_token + session_id + request_id', async () => {
    const { accessToken } = await createSessionViaEmailCode(api);
    expect(accessToken).toBeTruthy();
  });

  test('[+] me/context exposes the auto-created PERSONAL org (status ACTIVE)', async () => {
    const { accessToken } = await createSessionViaEmailCode(api);
    const ctx = await api.get('/api/v1/auth/me/context', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(ctx.status()).toBe(200);
    const { data } = await ctx.json();
    expect(data.active_organization.type).toBe('PERSONAL');
    expect(data.active_organization.status).toBe('ACTIVE');
    expect(Array.isArray(data.my_permissions)).toBe(true);
    expect(data.organizations.length).toBeGreaterThanOrEqual(1);
  });

  test('[+] list my organizations includes the personal org', async () => {
    const { accessToken } = await createSessionViaEmailCode(api);
    const list = await api.get('/api/v1/tenancy/organizations', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(list.status()).toBe(200);
    expect((await list.json()).data.length).toBeGreaterThanOrEqual(1);
  });

  test('[+] switch-to-personal re-mints an access token', async () => {
    const { accessToken } = await createSessionViaEmailCode(api);
    const sw = await api.post('/api/v1/auth/switch-to-personal', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect([200, 201]).toContain(sw.status());
    expect((await sw.json()).data.access_token).toBeTruthy();
  });

  test('[-] email login with bad code → 401 + error envelope', async () => {
    const email = uniqueE2eEmail();
    await api.post(AUTH_EMAIL_CODE_SEND_PATH, {
      data: { email },
      headers: e2eAuthHeaders(),
    });
    const res = await api.post(AUTH_EMAIL_CODE_LOGIN_PATH, {
      data: { email, code: 'ZZZZZZ' },
      headers: e2eAuthHeaders(),
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toBeTruthy();
  });

  test('[-] me/context without a Bearer token → 401', async () => {
    expect((await api.get('/api/v1/auth/me/context')).status()).toBe(401);
  });

  test('[-] protected tenancy route without auth → 401', async () => {
    expect((await api.get('/api/v1/tenancy/organizations')).status()).toBe(401);
  });

  test('[-] switch to a non-member organization → 403/404', async () => {
    const { accessToken } = await createSessionViaEmailCode(api);
    const sw = await api.post('/api/v1/auth/switch-to-organization', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { organization_id: 'org_zzzzzzzzzzzzzzzzzzzzz' },
    });
    expect([403, 404]).toContain(sw.status());
  });

  test('[-] refresh without the session cookie → 403', async () => {
    expect((await api.post('/api/v1/auth/refresh')).status()).toBe(403);
  });

  test('[+] switch into a team you own re-mints a token scoped to it', async () => {
    const { accessToken } = await createSessionViaEmailCode(api);
    const { name, slug } = e2eTeamOrgProfile({ label: 'owned' });
    const create = await api.post('/api/v1/tenancy/organizations', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      data: { name, slug },
    });
    expect(create.status()).toBe(201);
    const orgId = (await create.json()).data.id;

    const sw = await api.post('/api/v1/auth/switch-to-organization', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { organization_id: orgId },
    });
    expect([200, 201]).toContain(sw.status());
    const teamToken = (await sw.json()).data.access_token;

    const ctx = await api.get('/api/v1/auth/me/context', {
      headers: { Authorization: `Bearer ${teamToken}` },
    });
    expect((await ctx.json()).data.active_organization.id).toBe(orgId);
  });

  test('[+] oauth providers lists the configured social logins', async () => {
    const res = await api.get('/api/v1/auth/oauth/providers');
    expect(res.status()).toBe(200);
    const providers = ((await res.json()) as { data: { providers: string[] } }).data
      .providers;
    expect(providers).toContain('google');
  });

  test('[+] email send-code responds uniformly (no account enumeration)', async () => {
    const email = uniqueE2eEmail();
    await createSessionViaEmailCode(api, email);
    const known = await api.post(AUTH_EMAIL_CODE_SEND_PATH, {
      data: { email },
      headers: e2eAuthHeaders(),
    });
    const unknown = await api.post(AUTH_EMAIL_CODE_SEND_PATH, {
      data: { email: uniqueE2eEmail() },
      headers: e2eAuthHeaders(),
    });
    expect(known.status()).toBe(201);
    expect(unknown.status()).toBe(201);
    const knownBody = await known.json();
    const unknownBody = await unknown.json();
    expect(knownBody.data.message).toBe(unknownBody.data.message);
  });

  test('[-] email send-code with malformed address → 4xx', async () => {
    const res = await api.post(AUTH_EMAIL_CODE_SEND_PATH, {
      data: { email: 'not-an-email' },
      headers: e2eAuthHeaders(),
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('[-] email login without a prior send-code → 401', async () => {
    const res = await api.post(AUTH_EMAIL_CODE_LOGIN_PATH, {
      data: { email: uniqueE2eEmail(), code: 'ABCDEF' },
      headers: e2eAuthHeaders(),
    });
    expect(res.status()).toBe(401);
  });

  test('[-] me/context with Basic auth scheme → 401', async () => {
    const { accessToken } = await createSessionViaEmailCode(api);
    const res = await api.get('/api/v1/auth/me/context', {
      headers: { Authorization: `Basic ${accessToken}` },
    });
    expect(res.status()).toBe(401);
  });

  test('[-] send-code with a missing email field → 4xx validation envelope', async () => {
    const res = await api.post(AUTH_EMAIL_CODE_SEND_PATH, {
      data: {},
      headers: e2eAuthHeaders(),
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(body.meta.request_id).toBeTruthy();
  });

  test('[-] email login with a missing code field → 4xx validation', async () => {
    const res = await api.post(AUTH_EMAIL_CODE_LOGIN_PATH, {
      data: { email: uniqueE2eEmail() },
      headers: e2eAuthHeaders(),
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('[-] me/context with a garbage Bearer token → 401', async () => {
    const res = await api.get('/api/v1/auth/me/context', {
      headers: { Authorization: 'Bearer garbage.token.value' },
    });
    expect(res.status()).toBe(401);
  });

  test('[-] unknown /api/v1 route → 404 with uniform error envelope', async () => {
    const res = await api.get('/api/v1/this-route-does-not-exist-xyz');
    expect(res.status()).toBe(404);
    const body = await res.json();
    // Same envelope shape as every other error: { error, meta.request_id }.
    expect(body.error.code).toBe('not_found');
    expect(body.meta.request_id).toBeTruthy();
  });

  test('[-] logout twice on the same token → second call still safe', async () => {
    const { accessToken } = await createSessionViaEmailCode(api);
    const auth = { Authorization: `Bearer ${accessToken}` };
    expect((await api.post('/api/v1/auth/logout', { headers: auth })).status()).toBe(201);
    expect((await api.get('/api/v1/auth/me/context', { headers: auth })).status()).toBe(
      401,
    );
    const second = await api.post('/api/v1/auth/logout', { headers: auth });
    expect(second.status()).toBeLessThan(500);
  });
});
