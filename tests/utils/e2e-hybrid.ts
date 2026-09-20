import { expect, type Page } from '@playwright/test';

import { PRODUCT_NAMESPACE } from '@/lib/product-identity.ts';
import { installE2eCaptchaHeadersOnAuthApi } from '@/tests/utils/e2e-captcha.ts';

/**
 * Stable English accessible names from `src/locales/en/*.json` for hybrid E2E
 * assertions. Actions still use `data-testid`; roles/labels guard a11y + i18n wiring.
 */
export const AUTH_LABELS = {
  email: /^email$/i,
  continue: /^continue$/i,
  verifyAndContinue: /verify & continue/i,
  enterVerificationCode: /enter verification code/i,
} as const;

export const LAYOUT_LABELS = {
  search: /^search$/i,
  userMenu: /user menu/i,
  notifications: /notification/i,
} as const;

/**
 * Primary locator for E2E actions — stable across design changes.
 *
 * Filtered to visible elements: shell testids (org switcher, user menu) exist
 * twice at desktop width — the desktop instance plus a hidden mobile-shell
 * twin — which breaks strict mode and can hand `.first()` the invisible one.
 */
export function byTestId(page: Page, testId: string) {
  return page.getByTestId(testId).locator('visible=true').first();
}

/** Fill/click via test id (preferred for interactions). */
export async function fillTestId(
  page: Page,
  testId: string,
  value: string,
): Promise<void> {
  await byTestId(page, testId).fill(value);
}

export async function clickTestId(page: Page, testId: string): Promise<void> {
  await byTestId(page, testId).click();
}

/**
 * Enters a 6-character email sign-in code into TotpCodeInput (alphanumeric).
 * Uses the hidden `input-otp` input — `keyboard.type` on the container is flaky in WebKit/Firefox.
 */
export async function fillEmailVerificationCode(
  page: Page,
  verificationCode: string,
): Promise<void> {
  const input = page.getByTestId('auth-email-code');
  // eslint-disable-next-line sonarjs/no-forced-browser-interaction -- the OTP field renders slot overlays above the real input; a plain click targets the overlay and never focuses it
  await input.click({ force: true });
  await input.pressSequentially(verificationCode, { delay: 20 });

  const verifyButton = page.getByTestId('auth-email-verify');
  await expect(verifyButton)
    .toBeEnabled({ timeout: 5000 })
    .catch(() => undefined);

  const leftLogin = page.waitForURL(/\/(onboarding|dashboard|organization\/)/, {
    timeout: 15000,
  });

  await Promise.race([leftLogin, page.waitForTimeout(800)]).catch(() => undefined);

  if (page.url().includes('/login') && (await verifyButton.isEnabled())) {
    await verifyButton.click();
    await leftLogin.catch(() => undefined);
  }
}

/**
 * Hybrid assertion: element is visible by test id AND exposed with the expected
 * accessible role/name (catches missing labels without brittle copy-only tests).
 */
export async function expectHybridVisible(
  page: Page,
  testId: string,
  accessible: { role: Parameters<Page['getByRole']>[0]; name: string | RegExp },
): Promise<void> {
  await expect(page.getByTestId(testId)).toBeVisible();
  await expect(page.getByRole(accessible.role, { name: accessible.name })).toBeVisible();
}

/** Navigate and wait for bootstrap/lazy-route spinners to clear. */
export async function gotoApp(
  page: Page,
  path: string,
  opts?: { timeout?: number },
): Promise<void> {
  // Passed as an arg: addInitScript serialises the callback into the browser, so
  // it cannot close over a Node-side import.
  await page.addInitScript((key: string) => {
    sessionStorage.setItem(key, '1');
  }, `${PRODUCT_NAMESPACE}-auth-skip-auto-google`);
  if (path === '/login' || path.startsWith('/login?')) {
    await installE2eCaptchaHeadersOnAuthApi(page);
  }
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  const timeout = opts?.timeout ?? 15000;
  const spinner = page.getByTestId('full-page-spinner');
  await spinner.waitFor({ state: 'hidden', timeout }).catch(() => undefined);
}

/**
 * Client-side navigation without reload — keeps in-memory access token after API login.
 * Requires dev hook `__coreFeRouter` from `main.tsx`.
 */
export async function navigateAuthenticated(
  page: Page,
  path: string,
  opts?: { timeout?: number },
): Promise<void> {
  await page.evaluate(async (to) => {
    const router = (
      globalThis as typeof globalThis & {
        __coreFeRouter?: { navigate: (opts: { to: string }) => Promise<void> | void };
      }
    ).__coreFeRouter;
    if (!router) throw new Error('__coreFeRouter is not exposed (dev-only)');
    await router.navigate({ to });
  }, path);
  const timeout = opts?.timeout ?? 15000;
  await page
    .getByTestId('full-page-spinner')
    .waitFor({ state: 'hidden', timeout })
    .catch(() => undefined);
}

/** Opens the hash-driven settings modal at `#settings/<scope>/<section>` without reloading. */
export async function openSettingsHash(
  page: Page,
  scope: 'account' | 'organization',
  section: string,
): Promise<void> {
  await page.evaluate(
    ({ scope: s, section: sec }) => {
      window.location.hash = `#settings/${s}/${sec}`;
    },
    { scope, section },
  );
  await expect(page.getByTestId('settings-modal')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('dialog')).toBeVisible();
}

/** Unified auth screen — email panel open by default on `/login`. */
export async function expectAuthScreenReady(page: Page): Promise<void> {
  // 15s across the board: after a logout hard-navigation the login island is a
  // cold lazy chunk, and the 5s default flaked under full-suite load.
  await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('auth-form')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('auth-email-panel')).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel(AUTH_LABELS.email)).toBeVisible();
}

/** Sends email verification code and opens the verification step. */
export async function submitAuthEmailForCode(page: Page, email: string): Promise<void> {
  await installE2eCaptchaHeadersOnAuthApi(page);
  await fillTestId(page, 'auth-email', email);
  await clickTestId(page, 'auth-email-submit');
  await expect(page.getByTestId('auth-email-verify-panel')).toBeVisible({
    timeout: 10000,
  });
}

/**
 * Waits until Turnstile has minted a token (or captcha is off) before auth form submit.
 * Prefer {@link installE2eCaptchaHeadersOnAuthApi} for E2E — this remains for Turnstile UI checks.
 */
export async function waitForAuthCaptchaReady(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const widget = document.querySelector('[data-testid="auth-captcha-widget"]');
        if (!widget) return true;
        const peek = (
          globalThis as typeof globalThis & {
            __coreFePeekTurnstileToken?: () => string | undefined;
          }
        ).__coreFePeekTurnstileToken;
        return typeof peek === 'function' && Boolean(peek());
      },
      { timeout: 15_000 },
    )
    .catch(() => undefined);
}

/** Completes email verification — waits for post-auth navigation. */
export async function verifyAuthEmailCode(
  page: Page,
  verificationCode: string,
): Promise<void> {
  await fillEmailVerificationCode(page, verificationCode);
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 15_000 });
}

/** Login page contract: default email OTP entry (hybrid). */
export async function expectLoginFormReady(page: Page): Promise<void> {
  await expectAuthScreenReady(page);
  await expectHybridVisible(page, 'auth-email-submit', {
    role: 'button',
    name: AUTH_LABELS.continue,
  });
}

/** App shell header controls — testid for click, role for a11y guard. */
export async function expectAppHeaderReady(page: Page): Promise<void> {
  await expect(page.getByTestId('header')).toBeVisible();
  await expectHybridVisible(page, 'search-trigger', {
    role: 'button',
    name: LAYOUT_LABELS.search,
  });
  await expectHybridVisible(page, 'user-menu-trigger', {
    role: 'button',
    name: LAYOUT_LABELS.userMenu,
  });
}
