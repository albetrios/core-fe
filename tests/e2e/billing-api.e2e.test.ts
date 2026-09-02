import { type APIRequestContext, expect, test } from '@playwright/test';

import { createSessionViaEmailCode } from '@/tests/utils/e2e-session.ts';
import {
  bearerHeaders,
  createTeamOrganization,
  idempotencyKey,
} from '@/tests/utils/e2e-tenancy.ts';

/**
 * Billing contract e2e against core-be on :3000.
 */
const API = '/api/v1';

let api: APIRequestContext;

async function sessionToken(): Promise<string> {
  return (await createSessionViaEmailCode(api)).accessToken;
}

/** Ensures the team has a billing customer (paid plan subscription) when plans are seeded. */
async function ensureTeamSubscription(teamToken: string): Promise<void> {
  const plansRes = await api.get(`${API}/billing/plans`);
  const plansBody = (await plansRes.json()) as {
    data: Array<{ id: string; price_monthly: string }>;
  };
  const plan =
    plansBody.data.find((p) => Number(p.price_monthly) > 0) ?? plansBody.data[0];
  if (!plan) return;

  const createRes = await api.post(`${API}/billing/subscriptions`, {
    headers: {
      ...bearerHeaders(teamToken, true),
    },
    data: { plan_id: plan.id, billing_cycle: 'monthly' },
  });
  expect([201, 409]).toContain(createRes.status());
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: 'http://localhost:3000' });
});
test.afterAll(async () => {
  await api?.dispose();
});

test.describe('core-be — billing', () => {
  test.describe.configure({ mode: 'serial' });

  test('[+] GET /billing/plans is public and returns a plan list envelope', async () => {
    const res = await api.get(`${API}/billing/plans`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ id: string; price_monthly: string; currency: string }>;
      meta: { request_id?: string };
    };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.request_id).toBeTruthy();
    if (body.data.length === 0) {
      test.info().annotations.push({
        type: 'note',
        description:
          'No billing plans seeded in this environment — envelope shape verified only',
      });
      return;
    }
    const plan = body.data[0]!;
    expect(plan.id).toMatch(/^pln_[a-z0-9]{21}$/);
    expect(typeof plan.price_monthly).toBe('string');
    expect(plan.currency).toBeTruthy();
  });

  test('[-] GET /billing/plans/{unknown} → 404', async () => {
    const res = await api.get(`${API}/billing/plans/pln_${'z'.repeat(21)}`);
    expect(res.status()).toBe(404);
  });

  test('[-] GET /billing/subscriptions without auth → 401', async () => {
    expect((await api.get(`${API}/billing/subscriptions`)).status()).toBe(401);
  });

  test('[-] GET /billing/subscriptions on a personal org → 403 (billing gated)', async () => {
    const token = await sessionToken();
    const res = await api.get(`${API}/billing/subscriptions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(403);
  });

  test('[+] team org owner can list subscriptions after switch', async () => {
    const { accessToken } = await createSessionViaEmailCode(api);
    const { org, teamToken } = await createTeamOrganization(api, accessToken);
    test.skip(!org, 'team org creation unavailable');

    const res = await api.get(`${API}/billing/subscriptions`, {
      headers: { Authorization: `Bearer ${teamToken}` },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('[+] team org owner can create a subscription and read payment-setup', async () => {
    const { accessToken } = await createSessionViaEmailCode(api);
    const { org, teamToken } = await createTeamOrganization(api, accessToken);
    test.skip(!org, 'team org creation unavailable');

    const plansRes = await api.get(`${API}/billing/plans`);
    const plansBody = (await plansRes.json()) as {
      data: Array<{ id: string; price_monthly: string }>;
    };
    const plan =
      plansBody.data.find((p) => Number(p.price_monthly) > 0) ?? plansBody.data[0];
    if (!plan) {
      test.skip(true, 'no billing plans seeded');
      return;
    }

    const createRes = await api.post(`${API}/billing/subscriptions`, {
      headers: {
        Authorization: `Bearer ${teamToken}`,
        'X-Idempotency-Key': idempotencyKey(),
      },
      data: { plan_id: plan.id, billing_cycle: 'monthly' },
    });
    expect([201, 409]).toContain(createRes.status());

    let subscriptionId: string | undefined;
    if (createRes.status() === 201) {
      const created = (await createRes.json()) as { data: { id: string } };
      subscriptionId = created.data.id;
    } else {
      const listRes = await api.get(`${API}/billing/subscriptions`, {
        headers: { Authorization: `Bearer ${teamToken}` },
      });
      const list = (await listRes.json()) as { data: Array<{ id: string }> };
      subscriptionId = list.data[0]?.id;
    }
    test.skip(!subscriptionId, 'no subscription to probe');

    const setupRes = await api.get(
      `${API}/billing/subscriptions/${subscriptionId}/payment-setup`,
      { headers: { Authorization: `Bearer ${teamToken}` } },
    );
    expect(setupRes.status()).toBe(200);
    const setup = (await setupRes.json()) as { data: { client_secret: string | null } };
    expect(setup.data).toHaveProperty('client_secret');
  });

  test('[+] team org owner can list invoices and payment methods', async () => {
    const { accessToken } = await createSessionViaEmailCode(api);
    const { org, teamToken } = await createTeamOrganization(api, accessToken);
    test.skip(!org, 'team org creation unavailable');

    const invoicesRes = await api.get(`${API}/billing/invoices`, {
      headers: bearerHeaders(teamToken),
    });
    expect(invoicesRes.status()).toBe(200);
    const invoicesBody = (await invoicesRes.json()) as { data: unknown[] };
    expect(Array.isArray(invoicesBody.data)).toBe(true);

    const methodsRes = await api.get(`${API}/billing/payment-methods`, {
      headers: bearerHeaders(teamToken),
    });
    expect(methodsRes.status()).toBe(200);
    const methodsBody = (await methodsRes.json()) as { data: unknown[] };
    expect(Array.isArray(methodsBody.data)).toBe(true);
  });

  test('[+] team org owner can create payment-method setup', async () => {
    const { accessToken } = await createSessionViaEmailCode(api);
    const { org, teamToken } = await createTeamOrganization(api, accessToken);
    test.skip(!org, 'team org creation unavailable');

    await ensureTeamSubscription(teamToken);

    const res = await api.post(`${API}/billing/payment-methods/setup`, {
      headers: {
        ...bearerHeaders(teamToken),
        'X-Idempotency-Key': idempotencyKey(),
      },
    });
    expect([200, 201, 422, 503]).toContain(res.status());
    if (res.status() === 200 || res.status() === 201) {
      const body = (await res.json()) as { data: { client_secret: string | null } };
      expect(body.data).toHaveProperty('client_secret');
    }
  });

  test('[-] GET /billing/invoices without auth → 401', async () => {
    expect((await api.get(`${API}/billing/invoices`)).status()).toBe(401);
  });

  test('[-] GET /billing/payment-methods without auth → 401', async () => {
    expect((await api.get(`${API}/billing/payment-methods`)).status()).toBe(401);
  });

  test('[-] POST /billing/payment-methods/setup without auth → 401', async () => {
    const res = await api.post(`${API}/billing/payment-methods/setup`, {
      headers: { 'X-Idempotency-Key': idempotencyKey() },
    });
    expect(res.status()).toBe(401);
  });

  test('[-] GET payment-setup for unknown subscription id → 404', async () => {
    const { accessToken } = await createSessionViaEmailCode(api);
    const { org, teamToken } = await createTeamOrganization(api, accessToken);
    test.skip(!org, 'team org creation unavailable');

    const res = await api.get(
      `${API}/billing/subscriptions/sub_${'z'.repeat(21)}/payment-setup`,
      { headers: bearerHeaders(teamToken) },
    );
    expect(res.status()).toBe(404);
  });

  test('[-] POST subscription with unknown plan_id → 4xx', async () => {
    const { accessToken } = await createSessionViaEmailCode(api);
    const { org, teamToken } = await createTeamOrganization(api, accessToken);
    test.skip(!org, 'team org creation unavailable');

    const res = await api.post(`${API}/billing/subscriptions`, {
      headers: bearerHeaders(teamToken, true),
      data: { plan_id: `pln_${'z'.repeat(21)}`, billing_cycle: 'monthly' },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('[-] duplicate subscription create is idempotent-safe (409 or 201)', async () => {
    const { accessToken } = await createSessionViaEmailCode(api);
    const { org, teamToken } = await createTeamOrganization(api, accessToken);
    test.skip(!org, 'team org creation unavailable');

    const plansRes = await api.get(`${API}/billing/plans`);
    const plansBody = (await plansRes.json()) as {
      data: Array<{ id: string; price_monthly: string }>;
    };
    const plan =
      plansBody.data.find((p) => Number(p.price_monthly) > 0) ?? plansBody.data[0];
    if (!plan) {
      test.skip(true, 'no billing plans seeded');
      return;
    }

    const idem = idempotencyKey();
    const body = { plan_id: plan.id, billing_cycle: 'monthly' as const };
    const first = await api.post(`${API}/billing/subscriptions`, {
      headers: { ...bearerHeaders(teamToken), 'X-Idempotency-Key': idem },
      data: body,
    });
    const second = await api.post(`${API}/billing/subscriptions`, {
      headers: { ...bearerHeaders(teamToken), 'X-Idempotency-Key': idem },
      data: body,
    });
    expect([201, 409]).toContain(first.status());
    expect([201, 409]).toContain(second.status());
    expect(second.status()).toBe(first.status());
  });

  test('[-] POST /billing/subscriptions without auth → 401', async () => {
    const res = await api.post(`${API}/billing/subscriptions`, {
      headers: { 'X-Idempotency-Key': idempotencyKey() },
      data: { plan_id: `pln_${'z'.repeat(21)}`, billing_cycle: 'monthly' },
    });
    expect(res.status()).toBe(401);
  });

  // Billing is gated to team orgs — a personal-org token must never read billing
  // data (subscriptions is proven 403 above; invoices/payment-methods share the
  // gate). Assert the personal org is denied and never leaks a 200 with data.
  test('[-] GET /billing/invoices on a personal org is gated (no 200 leak)', async () => {
    const token = await sessionToken();
    const res = await api.get(`${API}/billing/invoices`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([403, 404]).toContain(res.status());
  });

  test('[-] GET /billing/payment-methods on a personal org is gated (no 200 leak)', async () => {
    const token = await sessionToken();
    const res = await api.get(`${API}/billing/payment-methods`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([403, 404]).toContain(res.status());
  });
});
