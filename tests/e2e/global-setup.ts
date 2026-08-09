import pg from 'pg';

import { PRODUCT_NAME, PRODUCT_NAMESPACE } from '@/lib/product-identity.ts';
import {
  probeE2eAuthHeaders,
  writeCachedE2eAuthHeaders,
} from '@/tests/utils/e2e-captcha.ts';

/**
 * Fail fast when core-be is not running. All E2E specs require GET /readyz on :3000.
 * Auto-detects Postgres for mail_outbox reads when DATABASE_URL is unset.
 */
const CORE_BE_READY_URL = 'http://localhost:3000/readyz';

/**
 * Local-compose fallbacks, derived from {@link PRODUCT_NAMESPACE} rather than hardcoded.
 *
 * The backend's compose file provisions `POSTGRES_USER/PASSWORD/DB` from the product
 * stem, so a derived product's database is named after ITS namespace. Hardcoding
 * `core` here meant a renamed product could never auto-detect Postgres — and because
 * the failure path below only warned, the suite then passed green while every
 * authenticated journey silently no-oped.
 */
const DATABASE_URL_CANDIDATES = [
  process.env.DATABASE_URL,
  process.env.E2E_DATABASE_URL,
  `postgresql://${PRODUCT_NAMESPACE}:${PRODUCT_NAMESPACE}@localhost:5432/${PRODUCT_NAMESPACE}`,
  `postgresql://postgres:postgres@localhost:5432/${PRODUCT_NAMESPACE}`,
].filter((url): url is string => Boolean(url));

async function detectDatabaseUrl(): Promise<string | undefined> {
  for (const url of [...new Set(DATABASE_URL_CANDIDATES)]) {
    const client = new pg.Client({ connectionString: url });
    try {
      await client.connect();
      await client.query('SELECT 1');
      return url;
    } catch {
      // try next candidate
    } finally {
      await client.end().catch(() => undefined);
    }
  }
  return undefined;
}

export default async function globalSetup(): Promise<void> {
  try {
    const res = await fetch(CORE_BE_READY_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      throw new Error(`GET ${CORE_BE_READY_URL} returned ${res.status}`);
    }
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      [
        'E2E requires core-be on http://localhost:3000 (GET /readyz must succeed).',
        'Start core-be, then run pnpm test:e2e.',
        `Probe failed: ${detail}`,
      ].join('\n'),
      { cause },
    );
  }

  if (!(process.env.DATABASE_URL || process.env.E2E_DATABASE_URL)) {
    const detected = await detectDatabaseUrl();
    if (detected) {
      process.env.DATABASE_URL = detected;
      console.info(`E2E: using Postgres at ${detected} for email-code helpers`);
    } else if (process.env.E2E_ALLOW_NO_DATABASE === 'true') {
      console.warn(
        [
          'WARNING: no Postgres — running with E2E_ALLOW_NO_DATABASE=true.',
          'Every authenticated journey (email-code sign-in, logout, org switch, invite)',
          'will SKIP. This run does not cover auth.',
        ].join(' '),
      );
    } else {
      // Deliberately fatal. This used to warn and continue, so a run with no database
      // reported GREEN while silently skipping every authenticated journey — the worst
      // possible failure mode for a suite whose job is to prove auth works. Opt out
      // explicitly with E2E_ALLOW_NO_DATABASE=true when you only want anonymous specs.
      throw new Error(
        [
          `E2E could not connect to Postgres for auth.mail_outbox (${PRODUCT_NAME} email-code helpers).`,
          '',
          'Without it every authenticated journey silently skips, so this is fatal',
          'rather than a warning — a green run would misreport auth coverage.',
          '',
          'Fix one of:',
          `  • start the backend's local Postgres (compose provisions ${PRODUCT_NAMESPACE}/${PRODUCT_NAMESPACE}/${PRODUCT_NAMESPACE})`,
          '  • export DATABASE_URL or E2E_DATABASE_URL',
          '  • export E2E_ALLOW_NO_DATABASE=true to accept an auth-free run',
          '',
          `Tried: ${[...new Set(DATABASE_URL_CANDIDATES)].join(', ')}`,
        ].join('\n'),
      );
    }
  }

  const authHeaders = await probeE2eAuthHeaders('http://localhost:3000');
  writeCachedE2eAuthHeaders(authHeaders);

  const sendCodeProbe = await fetch('http://localhost:3000/api/v1/auth/email/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ email: `e2e-probe-${Date.now()}@probe.local` }),
    signal: AbortSignal.timeout(10_000),
  });
  if (sendCodeProbe.status === 429) {
    throw new Error(
      [
        'E2E auth probe: POST /auth/email/send-code returned 429 (rate limited).',
        'Restart core-be after pulling latest (development/test lift strict public auth caps),',
        'or wait ~60s and flush Redis rate-limit keys: redis-cli FLUSHDB',
        'CI runs core-be with NODE_ENV=test.',
      ].join(' '),
    );
  }
  if (sendCodeProbe.status !== 201) {
    throw new Error(
      `E2E auth probe: POST /auth/email/send-code returned ${sendCodeProbe.status} — ${await sendCodeProbe.text()}`,
    );
  }

  console.info(
    `E2E: captcha headers resolved (${Object.keys(authHeaders).join(', ')}) for public auth POSTs`,
  );
}
