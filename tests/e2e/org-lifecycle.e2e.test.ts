import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '@playwright/test';

import {
  createTeamOrgViaSwitcher,
  registerNewUserAndGoToDashboard,
} from '@/tests/utils/e2e-auth.ts';
import { openSettingsHash } from '@/tests/utils/e2e-hybrid.ts';
import {
  createSessionViaEmailCode,
  pollInvitationTokenFromMailOutbox,
  uniqueE2eEmail,
  verifyDatabaseConnection,
} from '@/tests/utils/e2e-session.ts';

const HOST = 'http://localhost:3000';
const API = `${HOST}/api/v1`;

/**
 * Organization lifecycle edges beyond create/switch: rename, member role
 * change, and member removal — none had an E2E pin.
 */
test.describe('Organization lifecycle — rename, role change, removal', () => {
  test.beforeEach(async () => {
    test.skip(
      !(await verifyDatabaseConnection()),
      'DATABASE_URL must reach core-be Postgres (auth.mail_outbox)',
    );
  });

  test('renaming the organization updates the switcher without a slug change', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await registerNewUserAndGoToDashboard(page);
    const switcher = page.getByTestId('organization-switcher-trigger').first();
    const switcherShown = await switcher
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!switcherShown, 'org switcher hidden (team orgs disabled)');
    const { slug } = await createTeamOrgViaSwitcher(page);

    await openSettingsHash(page, 'organization', 'general');
    await expect(page.getByTestId('settings-section-org-general')).toBeVisible({
      timeout: 10_000,
    });

    const renamed = `Renamed ${slug.slice(-5)}`;
    await page.getByTestId('org-name').fill(renamed);
    await page.getByTestId('org-general-save').click();

    // The slug is immutable from this panel; the URL must keep it.
    await expect(page).toHaveURL(new RegExp(`/organization/${slug}/`));
    await page.keyboard.press('Escape');
    await expect(
      page.getByTestId('organization-switcher-trigger').locator('visible=true').first(),
    ).toContainText(renamed, { timeout: 15_000 });
  });

  test('an invited member can be promoted and then removed by the owner', async ({
    page,
    playwright,
  }) => {
    test.setTimeout(180_000);
    const inviteeEmail = uniqueE2eEmail('lifecycle-invitee');
    let inviteeApi: APIRequestContext | undefined;

    try {
      await registerNewUserAndGoToDashboard(page);
      const switcher = page.getByTestId('organization-switcher-trigger').first();
      const switcherShown = await switcher
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      test.skip(!switcherShown, 'org switcher hidden (team orgs disabled)');
      await createTeamOrgViaSwitcher(page);

      // Invite through the real dialog.
      await openSettingsHash(page, 'organization', 'members');
      await expect(page.getByTestId('settings-organization-members')).toBeVisible({
        timeout: 10_000,
      });
      await page.getByTestId('invite-member-open').click();
      await page.getByTestId('invite-member-email').fill(inviteeEmail);
      await page.getByTestId('invite-member-submit').click();
      await expect(page.getByTestId('members-list').getByText(inviteeEmail)).toBeVisible({
        timeout: 15_000,
      });

      // Accept via API as the invitee — both the invitation id and the raw
      // token live only in the emailed accept link.
      const invitationToken = await pollInvitationTokenFromMailOutbox(inviteeEmail);
      const invitationId = await pollInvitationIdFromMailOutbox(inviteeEmail);
      inviteeApi = await playwright.request.newContext({ baseURL: HOST });
      const invitee = await createSessionViaEmailCode(inviteeApi, inviteeEmail);
      const accept = await inviteeApi.post(
        `${API}/tenancy/invitations/${invitationId}/accept`,
        {
          headers: { Authorization: `Bearer ${invitee.accessToken}` },
          data: { token: invitationToken },
        },
      );
      expect(accept.ok(), `accept failed: ${accept.status()}`).toBe(true);

      // Owner promotes the member to admin. Close and reopen the panel instead
      // of reloading: an authenticated reload currently trips the
      // double-refresh CSRF race (see cross-tab/locale-rtl fixmes), and a
      // remount refetches the roster just as well.
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('settings-organization-members')).toBeHidden();
      await openSettingsHash(page, 'organization', 'members');
      await expect(page.getByTestId('settings-organization-members')).toBeVisible({
        timeout: 10_000,
      });
      const membersList = page.getByTestId('members-list');
      const row = membersList.getByRole('listitem').filter({ hasText: inviteeEmail });
      const actions = page.getByRole('button', {
        name: `Actions for ${inviteeEmail}`,
      });

      await actions.click();
      await page.getByRole('menuitemradio', { name: /admin/i }).click();
      await expect(row).toContainText(/admin/i, { timeout: 15_000 });

      // And removes them; the row disappears.
      await actions.click();
      await page.getByRole('menuitem', { name: /remove/i }).click();
      // Removal always routes through the shared ConfirmDialog.
      await page.getByTestId('confirm-accept').click({ timeout: 10_000 });
      await expect(row).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await inviteeApi?.dispose();
    }
  });
});

/** Reads the invitation id out of the emailed accept link. */
async function pollInvitationIdFromMailOutbox(email: string): Promise<string> {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const result = await client.query<{ html: string }>(
        `SELECT html FROM auth.mail_outbox
         WHERE to_addresses @> $1::jsonb AND html ILIKE '%Accept Invitation%'
         ORDER BY id DESC LIMIT 1`,
        [JSON.stringify([email])],
      );
      const match = /\/accept-invite\/([A-Za-z0-9_-]+)/.exec(result.rows[0]?.html ?? '');
      if (match?.[1]) return match[1];
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } finally {
    await client.end();
  }
  throw new Error(`no invitation id in outbox for ${email}`);
}
