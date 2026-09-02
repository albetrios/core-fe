import type { APIRequestContext } from '@playwright/test';

import { e2eTeamOrgProfile } from './e2e-faker.ts';

const API = '/api/v1';

export const idempotencyKey = (): string => crypto.randomUUID();

export function bearerHeaders(token: string, withIdem = false): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    ...(withIdem ? { 'X-Idempotency-Key': idempotencyKey() } : {}),
  };
}

export type TeamOrg = { id: string; slug: string | null; name?: string };

/** Create a TEAM org and optionally switch the token into it. */
export async function createTeamOrganization(
  api: APIRequestContext,
  token: string,
  opts?: { name?: string; slug?: string },
): Promise<{ createStatus: number; org: TeamOrg | null; teamToken: string }> {
  const { name, slug } = e2eTeamOrgProfile({ label: 'team', ...opts });
  const create = await api.post(`${API}/tenancy/organizations`, {
    headers: bearerHeaders(token, true),
    data: { name, slug },
  });
  const org = create.ok() ? ((await create.json()) as { data: TeamOrg }).data : null;
  let teamToken = token;
  if (org) {
    const sw = await api.post(`${API}/auth/switch-to-organization`, {
      headers: bearerHeaders(token),
      data: { organization_id: org.id },
    });
    if (sw.ok()) {
      teamToken = ((await sw.json()) as { data: { access_token: string } }).data
        .access_token;
    }
  }
  return { createStatus: create.status(), org, teamToken };
}

async function resolveMemberRoleId(
  api: APIRequestContext,
  teamToken: string,
): Promise<string> {
  const rolesRes = await api.get(`${API}/tenancy/organization/roles`, {
    headers: bearerHeaders(teamToken),
  });
  if (!rolesRes.ok()) {
    throw new Error(`list roles failed: ${rolesRes.status()} ${await rolesRes.text()}`);
  }
  const roles = (await rolesRes.json()) as {
    data: Array<{ id: string; name: string }>;
  };
  const memberRole =
    roles.data.find((role) => role.name.toLowerCase() === 'admin') ??
    roles.data.find((role) => role.name.toLowerCase() === 'member') ??
    roles.data.find((role) => role.name.toLowerCase() !== 'owner') ??
    roles.data[0];
  if (!memberRole?.id) {
    throw new Error('createTeamInvitation: no assignable role in team org');
  }
  return memberRole.id;
}

/** Creates a pending member invitation in the active team org (owner must have switched in). */
export async function createTeamInvitation(
  api: APIRequestContext,
  ownerToken: string,
  inviteeEmail: string,
  opts?: { slug?: string; name?: string },
): Promise<{ invitationId: string; orgSlug: string; teamToken: string }> {
  const { org, teamToken } = await createTeamOrganization(api, ownerToken, opts);
  if (!org?.slug) {
    throw new Error('createTeamInvitation: team org slug missing');
  }
  const roleId = await resolveMemberRoleId(api, teamToken);
  const res = await api.post(`${API}/tenancy/organization/memberships`, {
    headers: bearerHeaders(teamToken, true),
    data: { email: inviteeEmail, role_id: roleId },
  });
  if (res.status() !== 201) {
    if (res.status() === 409) {
      const body = (await res.json()) as { error?: { reason?: string } };
      if (body.error?.reason === 'seat_limit_reached') {
        throw new Error('SEAT_LIMIT_REACHED');
      }
    }
    throw new Error(
      `create membership invite failed: ${res.status()} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as {
    data: { invitation?: { id: string } | null };
  };
  const invitationId = body.data.invitation?.id;
  if (!invitationId) {
    throw new Error(
      'createTeamInvitation: invitation id missing from membership response',
    );
  }
  return { invitationId, orgSlug: org.slug, teamToken };
}
