import type { APIRequestContext } from '@playwright/test';
import pg from 'pg';

import { API_BASE_PATH, API_ENDPOINTS } from '@/core/config/constants.ts';

import { withApiRetry } from './e2e-api-retry.ts';
import { loadCachedE2eAuthHeaders } from './e2e-captcha.ts';
import { uniqueE2eEmail } from './e2e-faker.ts';

export { uniqueE2eEmail } from './e2e-faker.ts';

const API = API_BASE_PATH;

/** Public auth POST headers — resolved in global-setup from live core-be captcha policy. */
export function e2eAuthHeaders(): Record<string, string> {
  return loadCachedE2eAuthHeaders();
}

const VERIFICATION_CODE_HTML_REGEX = />([A-Z0-9]{6})</;

function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL ?? process.env.E2E_DATABASE_URL;
}

/** Throws when mail_outbox helpers cannot run (UI + API email-code E2E). */
export function requireDatabaseUrl(): string {
  const dbUrl = databaseUrl();
  if (!dbUrl) {
    throw new Error(
      'DATABASE_URL (or E2E_DATABASE_URL) is required for email-code E2E — set it to core-be Postgres (auth.mail_outbox).',
    );
  }
  return dbUrl;
}

export function hasDatabaseUrl(): boolean {
  return Boolean(databaseUrl());
}

/** Returns true when DATABASE_URL is set and Postgres accepts a connection. */
export async function verifyDatabaseConnection(): Promise<boolean> {
  const dbUrl = databaseUrl();
  if (!dbUrl) return false;
  const client = new pg.Client({ connectionString: dbUrl });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reads the latest non-scrubbed verification-code HTML for an address from auth.mail_outbox. */
export async function pollVerificationCodeFromMailOutbox(email: string): Promise<string> {
  const dbUrl = databaseUrl();
  if (!dbUrl) {
    throw new Error(
      'DATABASE_URL (or E2E_DATABASE_URL) is required to read email sign-in codes for API E2E helpers',
    );
  }

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const result = await client.query<{ html: string }>(
        `SELECT html FROM auth.mail_outbox
         WHERE to_addresses @> $1::jsonb AND html <> ''
         ORDER BY id DESC
         LIMIT 1`,
        [JSON.stringify([email])],
      );
      const html = result.rows[0]?.html ?? '';
      const match = VERIFICATION_CODE_HTML_REGEX.exec(html);
      if (match?.[1]) return match[1];
      await sleep(500);
    }
  } finally {
    await client.end();
  }

  throw new Error(`Timed out waiting for sign-in code email to ${email}`);
}

const INVITATION_TOKEN_REGEX = /[?&]token=([^&"'<>]+)/;

/** Reads the invitation accept token from the latest invitation email in auth.mail_outbox. */
export async function pollInvitationTokenFromMailOutbox(email: string): Promise<string> {
  const dbUrl = databaseUrl();
  if (!dbUrl) {
    throw new Error(
      'DATABASE_URL (or E2E_DATABASE_URL) is required to read invitation emails for E2E helpers',
    );
  }

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const result = await client.query<{ html: string }>(
        `SELECT html FROM auth.mail_outbox
         WHERE to_addresses @> $1::jsonb
           AND html <> ''
           AND html ILIKE '%Accept Invitation%'
         ORDER BY id DESC
         LIMIT 1`,
        [JSON.stringify([email])],
      );
      const html = result.rows[0]?.html ?? '';
      const match = INVITATION_TOKEN_REGEX.exec(html);
      if (match?.[1]) return decodeURIComponent(match[1]);
      await sleep(500);
    }
  } finally {
    await client.end();
  }

  throw new Error(`Timed out waiting for invitation email to ${email}`);
}

/**
 * Creates a session via passwordless email send-code + login against core-be on :3000.
 * Requires DATABASE_URL so the helper can read the code from auth.mail_outbox.
 */
export async function createSessionViaEmailCode(
  api: APIRequestContext,
  email = uniqueE2eEmail(),
): Promise<{ email: string; accessToken: string }> {
  const send = await withApiRetry(() =>
    api.post(`${API}${API_ENDPOINTS.AUTH.EMAIL_CODE_SEND}`, {
      data: { email },
      headers: e2eAuthHeaders(),
    }),
  );
  if (send.status() !== 201) {
    throw new Error(`send-code failed: ${send.status()} ${await send.text()}`);
  }

  const code = await pollVerificationCodeFromMailOutbox(email);

  const login = await withApiRetry(() =>
    api.post(`${API}${API_ENDPOINTS.AUTH.EMAIL_CODE_LOGIN}`, {
      data: { email, code },
      headers: e2eAuthHeaders(),
    }),
  );
  if (login.status() !== 201) {
    throw new Error(`email/login failed: ${login.status()} ${await login.text()}`);
  }

  const body = (await login.json()) as { data: { access_token: string } };
  const accessToken = body.data.access_token;

  // Stamp onboarding complete (idempotent) — mirrors the wizard's finish step.
  // Without it the fail-closed workspace guard bounces API-minted sessions to
  // `/onboarding` instead of the dashboard the specs navigate to.
  const complete = await withApiRetry(() =>
    api.post(`${API}${API_ENDPOINTS.AUTH.ONBOARDING_COMPLETE}`, {
      headers: { ...e2eAuthHeaders(), Authorization: `Bearer ${accessToken}` },
    }),
  );
  if (!complete.ok()) {
    throw new Error(
      `onboarding/complete failed: ${complete.status()} ${await complete.text()}`,
    );
  }

  return { email, accessToken };
}
