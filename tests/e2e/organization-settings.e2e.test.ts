import { expect, type Page, type PlaywrightWorkerArgs, test } from '@playwright/test';

import { navigateInApp } from '@/tests/utils/e2e-auth.ts';
import { uniqueE2eEmail } from '@/tests/utils/e2e-faker.ts';
import { byTestId, gotoApp, openSettingsHash } from '@/tests/utils/e2e-hybrid.ts';
import {
  createSessionViaEmailCode,
  verifyDatabaseConnection,
} from '@/tests/utils/e2e-session.ts';
import { createTeamOrganization } from '@/tests/utils/e2e-tenancy.ts';

/**
 * Organization settings UI — the team-org admin surfaces (general, members,
 * roles, integrations/webhooks+API keys). The HTTP contracts live in
 * `tenancy-api.e2e.test.ts`; this drives the panels a team owner actually sees.
 */

/**
 * Provision a team org via the API and hydrate the team-scoped browser session,
 * landing on its dashboard. Returns `null` when the env can't provision one.
 */
async function landOnTeamDashboard(
  page: Page,
  playwright: PlaywrightWorkerArgs['playwright'],
): Promise<{ slug: string } | null> {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:3000' });
  try {
    const { accessToken } = await createSessionViaEmailCode(api);
    const { org, teamToken } = await createTeamOrganization(api, accessToken);
    if (!org) return null;

    await gotoApp(page, '/login');
    await page.waitForFunction(() => globalThis.__coreFeEstablishSession != null, null, {
      timeout: 10_000,
    });
    await page.evaluate(async (token) => {
      const establish = globalThis.__coreFeEstablishSession;
      if (!establish) throw new Error('__coreFeEstablishSession missing');
      await establish(token);
    }, teamToken);

    if (!org.slug) throw new Error('team org slug missing');
    await navigateInApp(page, `/organization/${org.slug}/dashboard`);
    await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
    return { slug: org.slug };
  } finally {
    await api.dispose();
  }
}

test.describe('Organization settings', () => {
  test.beforeEach(async () => {
    test.skip(
      !(await verifyDatabaseConnection()),
      'DATABASE_URL must reach core-be Postgres (mail_outbox)',
    );
  });

  test('general section renders the org profile panel', async ({ page, playwright }) => {
    const ctx = await landOnTeamDashboard(page, playwright);
    test.skip(ctx === null, 'team org could not be provisioned in this environment');

    await openSettingsHash(page, 'organization', 'general');
    await expect(page.getByTestId('settings-section-org-general')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('members section lists the creating owner', async ({ page, playwright }) => {
    const ctx = await landOnTeamDashboard(page, playwright);
    test.skip(ctx === null, 'team org could not be provisioned in this environment');

    await openSettingsHash(page, 'organization', 'members');
    await expect(page.getByTestId('settings-organization-members')).toBeVisible({
      timeout: 15000,
    });
    // a11y guard: the section heading is exposed.
    await expect(
      page.getByTestId('settings-organization-members').getByRole('heading', {
        name: 'Members',
      }),
    ).toBeVisible();
    // The creating owner is the sole member row.
    await expect(page.getByTestId('members-list')).toBeVisible();
    await expect(page.getByTestId('members-list').getByRole('listitem')).toHaveCount(1);
  });

  /**
   * A QA sweep reported the invite dialog's Email field as unusable: the
   * recipient "is not retained" and an invite "cannot be prepared reliably".
   * The field was sound — the report read the `value` ATTRIBUTE (and
   * `defaultValue`), which stay empty for text a user types, while the `value`
   * PROPERTY carried the address all along.
   *
   * So the guard is the round trip, driven the way a person drives it:
   * key-by-key typing (not `fill()`, which sets the property in one shot and
   * would hide a per-keystroke reset), the property read the report should have
   * taken, and then the request core-be actually receives. Asserting on the
   * REQUEST rather than on the resulting roster keeps this about the field: a
   * fresh team org sits on a one-seat plan, so the invite itself is answered
   * 409 `seat_limit_reached` here — a plan verdict, not a lost recipient.
   */
  test('the invite dialog sends the recipient a user typed', async ({
    page,
    playwright,
  }) => {
    const ctx = await landOnTeamDashboard(page, playwright);
    test.skip(ctx === null, 'team org could not be provisioned in this environment');

    await openSettingsHash(page, 'organization', 'members');
    await expect(page.getByTestId('settings-organization-members')).toBeVisible({
      timeout: 15000,
    });

    await byTestId(page, 'invite-member-open').click();
    await expect(page.getByTestId('invite-member-form')).toBeVisible({ timeout: 15000 });

    const recipient = uniqueE2eEmail('invite-retained');
    const emailField = byTestId(page, 'invite-member-email');
    await emailField.click();
    await page.keyboard.type(recipient, { delay: 20 });

    // The property — what the form submits, and what the report read past.
    await expect(emailField).toHaveValue(recipient);
    // a11y guard: a retained, valid address leaves the field un-flagged.
    await expect(emailField).toHaveAttribute('aria-invalid', /false|^$/);

    const invite = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().includes('/tenancy/organization/memberships'),
      { timeout: 15000 },
    );
    await byTestId(page, 'invite-member-submit').click();
    expect((await invite).postDataJSON()).toMatchObject({ email: recipient });
  });

  /**
   * The integrations panel listed and revoked API keys but offered no way to
   * make one, so the section opened on an empty state with no next action.
   *
   * This drives the whole round trip because two wire mismatches sat behind
   * that missing button and neither was visible from an empty organization:
   * the create body omitted the REQUIRED `scopes` and sent `expires_in_days`
   * as a string (a 400 before it reached the handler), and the row schema
   * asked for `prefix` where core-be sends `key_prefix` (a parse failure the
   * moment an organization owned its first key). The final assertion — the new
   * key rendered in the LIST — is what pins the second one.
   */
  test('an API key can be created, revealed once, and then listed', async ({
    page,
    playwright,
  }) => {
    const ctx = await landOnTeamDashboard(page, playwright);
    test.skip(ctx === null, 'team org could not be provisioned in this environment');

    await openSettingsHash(page, 'account', 'integrations');
    await expect(page.getByTestId('settings-organization-integrations')).toBeVisible({
      timeout: 15000,
    });

    await byTestId(page, 'apikey-create-open').click();
    await expect(page.getByTestId('apikey-create-dialog')).toBeVisible({
      timeout: 10000,
    });
    await byTestId(page, 'apikey-name').fill('Production server');
    await byTestId(page, 'apikey-scope-organization:read').click();
    await byTestId(page, 'apikey-create').click();

    // The secret is shown exactly once, and Done is held until acknowledged —
    // core-be stores only a hash, so a stray dismissal costs a rotation.
    const secret = page.getByTestId('apikey-secret');
    await expect(secret).toBeVisible({ timeout: 15000 });
    await expect(secret).toHaveText(/^ak_\w+/);
    await expect(page.getByTestId('apikey-secret-done')).toBeDisabled();

    await byTestId(page, 'apikey-secret-ack').click();
    await expect(page.getByTestId('apikey-secret-done')).toBeEnabled();
    await byTestId(page, 'apikey-secret-done').click();

    await expect(
      page.getByTestId('apikeys-list').getByText('Production server'),
    ).toBeVisible({ timeout: 15000 });
  });

  test('roles section lists the seeded organization roles', async ({
    page,
    playwright,
  }) => {
    const ctx = await landOnTeamDashboard(page, playwright);
    test.skip(ctx === null, 'team org could not be provisioned in this environment');

    await openSettingsHash(page, 'organization', 'roles');
    await expect(page.getByTestId('settings-organization-roles')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('roles-list')).toBeVisible();
  });
});
