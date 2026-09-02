import { type APIRequestContext, expect, test } from '@playwright/test';

import { expectApiStatus } from '@/tests/utils/e2e-api-retry.ts';
import { createSessionViaEmailCode } from '@/tests/utils/e2e-session.ts';

/**
 * Session-lifecycle & health contract e2e against core-be on :3000.
 */
const API = '/api/v1';

let api: APIRequestContext;

async function sessionToken(): Promise<string> {
  return (await createSessionViaEmailCode(api)).accessToken;
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: 'http://localhost:3000' });
});
test.afterAll(async () => {
  await api?.dispose();
});

test.describe('core-be — health & session lifecycle', () => {
  test.describe.configure({ mode: 'serial' });

  test('[+] /livez and /readyz report healthy', async () => {
    await expectApiStatus(() => api.get('/livez'), 200);
    await expectApiStatus(() => api.get('/readyz'), 200);
  });

  test('[-] an unknown API route → 404', async () => {
    await expectApiStatus(() => api.get(`${API}/this-route-does-not-exist`), 404);
  });

  test('[-] me/context with a malformed bearer token → 401', async () => {
    await expectApiStatus(
      () =>
        api.get(`${API}/auth/me/context`, {
          headers: { Authorization: 'Bearer not.a.valid.jwt' },
        }),
      401,
    );
  });

  test('[+/-] logout returns 201 and revokes the session', async () => {
    const token = await sessionToken();
    const auth = { Authorization: `Bearer ${token}` };

    expect((await api.get(`${API}/auth/me/context`, { headers: auth })).status()).toBe(
      200,
    );
    expect((await api.post(`${API}/auth/logout`, { headers: auth })).status()).toBe(201);
    expect((await api.get(`${API}/auth/me/context`, { headers: auth })).status()).toBe(
      401,
    );
  });

  test('[+] /readyz reports every dependency connected', async () => {
    const res = await api.get('/readyz');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    // Readiness aggregates the backing services — all must be connected.
    expect(body.database).toBe('connected');
    expect(body.redis).toBe('connected');
    expect(body.bullmq).toBe('connected');
  });

  test('[-] logout without an Authorization header → 401', async () => {
    await expectApiStatus(() => api.post(`${API}/auth/logout`), 401);
  });

  test('[-] switch-to-organization without auth → 401', async () => {
    await expectApiStatus(
      () =>
        api.post(`${API}/auth/switch-to-organization`, {
          data: { organization_id: 'org_zzzzzzzzzzzzzzzzzzzzz' },
        }),
      401,
    );
  });

  test('[-] me/context with an empty Bearer value → 401', async () => {
    await expectApiStatus(
      () =>
        api.get(`${API}/auth/me/context`, {
          headers: { Authorization: 'Bearer ' },
        }),
      401,
    );
  });
});
