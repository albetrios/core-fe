import { expect, type Page } from '@playwright/test';

import { installE2eCaptchaHeadersOnAuthApi } from '@/tests/utils/e2e-captcha.ts';
import {
  e2eDisplayName,
  e2eOrganizationName,
  e2eTeamOrgProfile,
  uniqueE2eEmail,
} from '@/tests/utils/e2e-faker.ts';
import {
  clickTestId,
  expectLoginFormReady,
  fillEmailVerificationCode,
  fillTestId,
  gotoApp,
} from '@/tests/utils/e2e-hybrid.ts';
import {
  createSessionViaEmailCode,
  e2eAuthHeaders,
  pollVerificationCodeFromMailOutbox,
  requireDatabaseUrl,
} from '@/tests/utils/e2e-session.ts';

type CoreFeRouter = {
  navigate: (opts: { to: string }) => Promise<void> | void;
};

type CoreFeEstablishSession = (accessToken: string) => Promise<void>;

declare global {
  var __coreFeRouter: CoreFeRouter | undefined;
  var __coreFeEstablishSession: CoreFeEstablishSession | undefined;
}

/**
 * Client-side navigation without a full reload — avoids racing `silentRefresh()`
 * against synchronous `requireAuth` on cold `page.goto`. Requires the dev-only
 * hook in `src/main.tsx`.
 */
export async function navigateInApp(page: Page, path: string): Promise<void> {
  await page.evaluate(async (to) => {
    const r = globalThis.__coreFeRouter;
    if (!r) throw new Error('__coreFeRouter is not exposed (dev-only)');
    await r.navigate({ to });
  }, path);
}

/**
 * Creates a session via core-be email send-code + login (proxied through the Vite dev server).
 * Returns the email used. Requires core-be on :3000 and DATABASE_URL for code retrieval.
 */
export async function authenticateViaEmailCode(page: Page): Promise<{ email: string }> {
  const email = uniqueE2eEmail('e2e');
  const send = await page.request.post('/api/v1/auth/email/send-code', {
    data: { email },
    headers: e2eAuthHeaders(),
  });
  expect(
    send.ok(),
    `send-code failed: ${send.status()} ${await send.text()}`,
  ).toBeTruthy();

  const code = await pollVerificationCodeFromMailOutbox(email);

  const login = await page.request.post('/api/v1/auth/email/login', {
    data: { email, code },
    headers: e2eAuthHeaders(),
  });
  expect(
    login.ok(),
    `email/login failed: ${login.status()} ${await login.text()}`,
  ).toBeTruthy();

  const body = (await login.json()) as { data: { access_token: string } };
  await page.goto('/login');
  await page.waitForFunction(() => globalThis.__coreFeEstablishSession != null, null, {
    timeout: 10_000,
  });
  await page.evaluate(async (token) => {
    const establish = globalThis.__coreFeEstablishSession;
    if (!establish) throw new Error('__coreFeEstablishSession is not exposed (dev-only)');
    await establish(token);
  }, body.data.access_token);

  return { email };
}

/**
 * Walks the onboarding wizard through to a dashboard when the user still needs it.
 * Skips workspace/invite steps when they are hidden for the deployment mode.
 */
export async function completeOnboardingWizard(page: Page): Promise<void> {
  await expect(page.getByTestId('onboarding-page')).toBeVisible({ timeout: 10000 });

  await clickTestId(page, 'onboarding-next');

  // Profile step splits into first/last name (onboarding-first-name /
  // onboarding-last-name); firstName is what gates the Continue button.
  await fillTestId(page, 'onboarding-first-name', e2eDisplayName());
  await clickTestId(page, 'onboarding-next');

  await clickTestId(page, 'onboarding-next');

  const orgName = page.getByTestId('onboarding-organization-name');
  if (await orgName.isVisible().catch(() => false)) {
    await orgName.fill(e2eOrganizationName());
    await clickTestId(page, 'onboarding-next');
  }

  const inviteEmail = page.getByTestId('onboarding-invite-email');
  if (await inviteEmail.isVisible().catch(() => false)) {
    await clickTestId(page, 'onboarding-next');
  }

  await clickTestId(page, 'onboarding-finish');
  await expect(page).toHaveURL(/\/organization\/[^/]+\/dashboard|\/dashboard/, {
    timeout: 15000,
  });
}

/**
 * Signs in through the unified `/login` email-code UI and lands on onboarding or a dashboard.
 * Requires core-be on :3000 (Vite proxies `/api` in dev) and DATABASE_URL for code retrieval.
 */
export async function loginViaEmailCodeUI(
  page: Page,
  email = uniqueE2eEmail('e2e-ui'),
): Promise<{ email: string }> {
  requireDatabaseUrl();
  await gotoApp(page, '/login');
  await installE2eCaptchaHeadersOnAuthApi(page);
  await fillTestId(page, 'auth-email', email);
  await clickTestId(page, 'auth-email-submit');
  await expect(page.getByTestId('auth-email-verify-panel')).toBeVisible({
    timeout: 10000,
  });

  const code = await pollVerificationCodeFromMailOutbox(email);
  await fillEmailVerificationCode(page, code);

  await expect(page).toHaveURL(
    /\/onboarding|\/organization\/[^/]+\/dashboard|\/dashboard/,
    { timeout: 20000 },
  );

  return { email };
}

/**
 * Email-code UI sign-in, then onboarding when needed, ending on a dashboard shell.
 * Uses API send-code/login (refresh cookie) then SPA hydrate — reliable across browsers.
 * For explicit `/login` UI coverage see `loginViaEmailCodeUI` and auth.e2e tests.
 */
export async function registerNewUserAndGoToDashboard(page: Page): Promise<void> {
  await authenticateViaEmailCodeAndLand(page);
}

/**
 * API email-code session, then client navigation to `/` (refresh cookie hydrates the SPA).
 */
export async function authenticateViaEmailCodeAndLand(
  page: Page,
): Promise<{ email: string }> {
  const { email } = await authenticateViaEmailCode(page);
  // Client-side nav keeps the in-memory access token; a full reload would require the refresh cookie.
  await navigateInApp(page, '/');
  await expect(page).toHaveURL(
    /\/onboarding|\/organization\/[^/]+\/dashboard|\/dashboard/,
    { timeout: 15000 },
  );
  if (page.url().includes('/onboarding')) {
    await completeOnboardingWizard(page);
  }
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
  return { email };
}

/**
 * Creates a team org through the in-app switcher (requires an authenticated AppLayout session).
 */
export async function createTeamOrgViaSwitcher(
  page: Page,
  opts?: { name?: string; slug?: string },
): Promise<{ slug: string }> {
  const { name, slug } = e2eTeamOrgProfile({ label: 'team-e2e', ...opts });

  await clickTestId(page, 'organization-switcher-trigger');
  await clickTestId(page, 'organization-switcher-create');
  await expect(page.getByTestId('create-organization-dialog-form')).toBeVisible({
    timeout: 10000,
  });
  await fillTestId(page, 'create-organization-dialog-name', name);
  await fillTestId(page, 'create-organization-dialog-slug', slug);
  await clickTestId(page, 'create-organization-dialog-submit');
  await expect(page).toHaveURL(new RegExp(`/organization/${slug}/dashboard`), {
    timeout: 15000,
  });
  await expect(page.getByTestId('dashboard-page')).toBeVisible();
  return { slug };
}

/** Opens the org switcher and selects an option by slug (`personal` for personal org). */
export async function selectOrganizationInSwitcher(
  page: Page,
  slug: string,
): Promise<void> {
  await clickTestId(page, 'organization-switcher-trigger');
  await clickTestId(page, `organization-switcher-option-${slug}`);
}

export { createSessionViaEmailCode, expectLoginFormReady, uniqueE2eEmail };
