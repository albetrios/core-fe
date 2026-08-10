import { expect, test } from '@playwright/test';

import { PRODUCT_NAME } from '@/lib/product-identity.ts';

test.describe('production shell', () => {
  test('login page renders with manifest and theme', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('login-page')).toBeVisible({ timeout: 15_000 });

    const manifest = page.locator('link[rel="manifest"]');
    await expect(manifest).toHaveAttribute('href', '/manifest.webmanifest');

    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveAttribute('content', '#0a0a0a');
  });

  test('manifest.webmanifest is valid JSON with app icons', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      name: string;
      theme_color: string;
      icons: Array<{ src: string }>;
    };
    expect(body.name).toContain(PRODUCT_NAME);
    expect(body.theme_color).toBe('#0a0a0a');
    expect(body.icons.some((i) => i.src.includes('app-icon'))).toBeTruthy();
  });

  test('app-icon.svg loads', async ({ request }) => {
    const res = await request.get('/app-icon.svg');
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type']).toMatch(/svg/);
  });
});
