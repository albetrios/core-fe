import { type APIRequestContext, expect, test } from '@playwright/test';

import {
  fetchMeContextWire,
  type ProbedDeployment,
  probeLiveDeployment,
  skipUnlessDeploymentMode,
} from '@/tests/utils/e2e-deployment-mode.ts';
import {
  createSessionViaEmailCode,
  verifyDatabaseConnection,
} from '@/tests/utils/e2e-session.ts';
import { bearerHeaders, createTeamOrganization } from '@/tests/utils/e2e-tenancy.ts';

/**
 * Team-only deployment contract (core-be env):
 * `PERSONAL_ORGANIZATION_ENABLED=false`, `TEAM_ORGANIZATION_ENABLED=true`.
 *
 * Skips automatically when the live server is not in this mode.
 */
const API = '/api/v1';
const REQUIRED_MODE = 'team-only' as const;

let api: APIRequestContext;
let liveDeployment: ProbedDeployment | null = null;

test.beforeAll(async ({ playwright }) => {
  test.skip(!(await verifyDatabaseConnection()), 'Postgres mail_outbox required');
  api = await playwright.request.newContext({ baseURL: 'http://localhost:3000' });
  const { accessToken } = await createSessionViaEmailCode(api);
  liveDeployment = await probeLiveDeployment(api, accessToken);
});

test.afterAll(async () => {
  await api?.dispose();
});

test.beforeEach(() => {
  skipUnlessDeploymentMode(liveDeployment, REQUIRED_MODE);
});

test.describe('deployment — team-only', () => {
  test('me/context advertises team orgs enabled and personal orgs disabled', async () => {
    const { accessToken } = await createSessionViaEmailCode(api);
    const probed = await probeLiveDeployment(api, accessToken);
    expect(probed.flags).toEqual({
      personalOrganizations: false,
      teamOrganizations: true,
    });
    expect(probed.mode).toBe(REQUIRED_MODE);
  });

  test('new user has no personal organization id and no PERSONAL org in inventory', async () => {
    const { accessToken } = await createSessionViaEmailCode(api);
    const ctx = await fetchMeContextWire(api, accessToken);
    expect(ctx.user.personal_organization_id ?? null).toBeNull();
    expect(ctx.organizations.some((o) => o.type === 'PERSONAL')).toBe(false);
  });

  test('user can create a TEAM organization', async () => {
    const { accessToken } = await createSessionViaEmailCode(api);
    const { createStatus, org } = await createTeamOrganization(api, accessToken);
    expect(createStatus).toBe(201);
    expect(org?.id).toMatch(/^org_/);
    expect(org?.slug).toBeTruthy();
  });

  test('team org owner can list billing subscriptions after switch', async () => {
    const { accessToken } = await createSessionViaEmailCode(api);
    const { org, teamToken } = await createTeamOrganization(api, accessToken);
    expect(org).not.toBeNull();

    const res = await api.get(`${API}/billing/subscriptions`, {
      headers: bearerHeaders(teamToken),
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });
});
