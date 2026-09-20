import { expect, test } from '@playwright/test';

import {
  navigateInApp,
  registerNewUserAndGoToDashboard,
} from '@/tests/utils/e2e-auth.ts';
import { expectLoginFormReady, gotoApp } from '@/tests/utils/e2e-hybrid.ts';
import { verifyDatabaseConnection } from '@/tests/utils/e2e-session.ts';

test.describe('Accept invite', () => {
  test('a signed-out visitor is sent to sign-in with the invite preserved', async ({
    page,
  }) => {
    // `/accept-invite/$invitationId` is auth-required (INV-4, `requireAuth` in the
    // route's `beforeLoad`): the recipient of an invite email is usually NOT signed
    // in, and that is the common path — so a guest goes to sign-in FIRST, with the
    // whole link (token included) carried as the post-login redirect. The page's
    // error card is for a signed-in user; a guest never sees it.
    await gotoApp(page, '/accept-invite/inv_expired?token=tok_e2e_guest');

    await expect(page).toHaveURL(/\/login\?redirect=/, { timeout: 10000 });
    const redirect = new URL(page.url()).searchParams.get('redirect') ?? '';
    expect(redirect).toContain('/accept-invite/inv_expired');
    expect(redirect).toContain('token=tok_e2e_guest');
    await expectLoginFormReady(page);
  });

  test('malformed invitation id in URL shows 404', async ({ page }) => {
    await gotoApp(page, '/accept-invite/not-a-valid-invitation-id');
    await expect(page.getByTestId('not-found-page')).toBeVisible({ timeout: 10000 });
  });

  test('accept-invite without an invitation id falls through to 404', async ({
    page,
  }) => {
    // The route is /accept-invite/$invitationId — a bare /accept-invite has no
    // match and lands on the splat 404.
    await gotoApp(page, '/accept-invite');
    await expect(page.getByTestId('not-found-page')).toBeVisible({ timeout: 10000 });
  });

  test('a signed-in user with an unusable invite gets the error card and a way back', async ({
    page,
  }) => {
    test.skip(
      !(await verifyDatabaseConnection()),
      'DATABASE_URL must reach core-be Postgres (mail_outbox)',
    );
    await registerNewUserAndGoToDashboard(page);

    // No `?token` — the page reports it without spending an API call.
    await navigateInApp(page, '/accept-invite/inv_expired');
    await expect(page.getByTestId('accept-invite-page')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('accept-invite-error')).toBeVisible({ timeout: 10000 });

    // The sign-in affordance is a real anchor to /login (hybrid: testid + role).
    const signIn = page.getByTestId('accept-invite-login');
    await expect(signIn).toHaveAttribute('href', /\/login$/);
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
  });
});
