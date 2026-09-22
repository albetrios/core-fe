import { createHmac } from 'node:crypto';

import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { installE2eCaptchaHeadersOnAuthApi } from '@/tests/utils/e2e-captcha.ts';
import { fillTestId, gotoApp } from '@/tests/utils/e2e-hybrid.ts';
import {
  createSessionViaEmailCode,
  e2eAuthHeaders,
  echoedVerificationCode,
  pollVerificationCodeFromMailOutbox,
  requireDatabaseUrl,
  uniqueE2eEmail,
  verifyDatabaseConnection,
} from '@/tests/utils/e2e-session.ts';

const HOST = 'http://localhost:3000';
const API = `${HOST}/api/v1`;

/** RFC 6238 TOTP (SHA-1, 30s step, 6 digits) from a base32 secret. */
function totpAt(secret: string, timestepMs: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  let unpadded = secret.toUpperCase();
  while (unpadded.endsWith('=')) unpadded = unpadded.slice(0, -1);
  for (const ch of unpadded) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = Buffer.from(bits.match(/.{8}/g)?.map((b) => Number.parseInt(b, 2)) ?? []);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timestepMs / 30_000)));
  const digest = createHmac('sha1', bytes).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

/** A TOTP code from a window not used before (waits into the next step if needed). */
async function freshTotp(secret: string, used: Set<string>): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = totpAt(secret, Date.now());
    if (!used.has(code)) {
      used.add(code);
      return code;
    }
    // Same 30s window as a previously-used code — wait for the next one.
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error('could not mint an unused TOTP window');
}

/**
 * Request a fresh email verification code and wait for it to differ from the
 * last one seen. Retries through the per-email issue window (local caps vary).
 *
 * The code comes from the send-code response when core-be echoes it (its
 * local/TEST mode — `debug_verification_code`, the field the sign-in form
 * prefills from). Polling `mail_outbox` for it instead is a second system with
 * its own lag, and under a long suite that lag was the whole 90s: this helper
 * timed out while the backend had answered every request.
 */
async function freshEmailCode(
  api: APIRequestContext,
  email: string,
  previous: string | null,
): Promise<string> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const sent = await api.post(`${API}/auth/email/send-code`, {
      headers: e2eAuthHeaders(),
      data: { email },
    });
    const echoed = await echoedVerificationCode(sent);
    if (echoed && echoed !== previous) return echoed;
    if (!echoed) {
      try {
        const code = await pollVerificationCodeFromMailOutbox(email);
        if (code !== previous) return code;
      } catch {
        // outbox poll timed out — fall through to resend
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`no fresh sign-in code for ${email} within 90s`);
}

test.describe.serial('MFA — TOTP enrollment and challenge login', () => {
  test.describe.configure({ timeout: 180_000 });

  const email = uniqueE2eEmail('mfa-journey');
  const usedTotp = new Set<string>();
  let api: APIRequestContext;
  let secret = '';
  let signInCode: string | null = null;
  let recoveryCode: string | undefined;

  test.beforeAll(async ({ playwright }) => {
    test.skip(
      !(await verifyDatabaseConnection()),
      'DATABASE_URL must reach core-be Postgres (auth.mail_outbox)',
    );
    requireDatabaseUrl();
    api = await playwright.request.newContext({ baseURL: HOST });
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test('enrolls a TOTP factor through step-up + enroll + confirm', async () => {
    const session = await createSessionViaEmailCode(api, email);
    signInCode = await pollVerificationCodeFromMailOutbox(email);
    const bearer = { Authorization: `Bearer ${session.accessToken}` };

    // Bootstrap step-up: a fresh emailed code (the sign-in consumed the first).
    const stepUpCode = await freshEmailCode(api, email, signInCode);
    const stepUp = await api.post(`${API}/auth/step-up`, {
      headers: bearer,
      data: { code: stepUpCode },
    });
    expect(stepUp.ok(), `step-up failed: ${stepUp.status()}`).toBe(true);
    signInCode = stepUpCode;

    const enroll = await api.post(`${API}/auth/me/mfa/enroll`, {
      headers: bearer,
      data: { method_type: 'MFA_TOTP' },
    });
    expect(enroll.ok(), `enroll failed: ${enroll.status()}`).toBe(true);
    const enrollBody = (await enroll.json()) as {
      data?: { secret?: string };
      secret?: string;
    };
    secret = enrollBody.data?.secret ?? enrollBody.secret ?? '';
    expect(secret.length).toBeGreaterThan(15);

    const confirm = await api.post(`${API}/auth/me/mfa/enroll/confirm`, {
      headers: bearer,
      data: { code: await freshTotp(secret, usedTotp) },
    });
    expect(confirm.ok(), `confirm failed: ${confirm.status()}`).toBe(true);
    const confirmBody = (await confirm.json()) as {
      data?: { recovery_codes?: string[] };
      recovery_codes?: string[];
    };
    recoveryCode = (confirmBody.data?.recovery_codes ?? confirmBody.recovery_codes)?.[0];
    expect(recoveryCode).toBeTruthy();
  });

  test('email-code sign-in now routes through /mfa and a TOTP completes it', async ({
    page,
  }) => {
    test.skip(!secret, 'enrollment test did not run');

    await gotoApp(page, '/login');
    await installE2eCaptchaHeadersOnAuthApi(page);
    await fillTestId(page, 'auth-email', email);
    await page.getByTestId('auth-email-submit').click();
    await expect(page.getByTestId('auth-email-verify-panel')).toBeVisible({
      timeout: 15_000,
    });

    const loginCode = await freshEmailCode(api, email, signInCode);
    signInCode = loginCode;
    await page.getByTestId('auth-email-code').click();
    await page.keyboard.type(loginCode, { delay: 40 });

    // An MFA-enrolled account must NOT land in the app on the email factor alone.
    await expect(page.getByTestId('mfa-page')).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/mfa/);

    const mfaCalls: string[] = [];
    page.on('response', (r) => {
      if (/auth\/(mfa|refresh)/.test(r.url())) {
        mfaCalls.push(`${r.url().split('/api/v1')[1]} -> ${r.status()}`);
      }
    });
    await page.getByTestId('mfa-code').click();
    // input-otp auto-submits on the 6th character — no manual click needed.
    await page.keyboard.type(await freshTotp(secret, usedTotp), { delay: 40 });

    await expect(page, `mfa calls: ${mfaCalls.join(' | ')}`).toHaveURL(
      /\/organization\/[^/]+\/dashboard|\/dashboard/,
      { timeout: 30_000 },
    );
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15_000 });
  });

  test('a recovery code passes the MFA challenge when the authenticator is lost', async ({
    page,
  }) => {
    test.skip(!(secret && recoveryCode), 'enrollment test did not run');

    await gotoApp(page, '/login');
    await installE2eCaptchaHeadersOnAuthApi(page);
    await fillTestId(page, 'auth-email', email);
    await page.getByTestId('auth-email-submit').click();
    await expect(page.getByTestId('auth-email-verify-panel')).toBeVisible({
      timeout: 15_000,
    });

    const loginCode = await freshEmailCode(api, email, signInCode);
    signInCode = loginCode;
    await page.getByTestId('auth-email-code').click();
    await page.keyboard.type(loginCode, { delay: 40 });

    await expect(page.getByTestId('mfa-page')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('mfa-toggle-recovery').click();
    await page.getByTestId('mfa-code').click();
    await page.keyboard.type(recoveryCode ?? '', { delay: 40 });
    await page.getByTestId('mfa-submit').click();

    await expect(page).toHaveURL(/\/organization\/[^/]+\/dashboard|\/dashboard/, {
      timeout: 25_000,
    });
  });
});
