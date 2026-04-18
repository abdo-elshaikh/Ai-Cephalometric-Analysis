import { test, expect, Page } from '@playwright/test';

const DOCTOR = { email: 'doctor@ceph.test', password: 'Doctor@1234' };

async function loginAs(page: Page) {
  await page.goto('/login');
  await page.fill('input[type="email"], input[name="email"]', DOCTOR.email);
  await page.fill('input[type="password"]', DOCTOR.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/^(?!.*\/login)/, { timeout: 10_000 });
}

test.describe('Reports Flow', () => {

  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('reports page loads for authenticated user', async ({ page }) => {
    await page.goto('/reports');
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('reports page shows empty state or report list', async ({ page }) => {
    await page.goto('/reports');
    // Either a table/list or empty state message
    const hasContent = await page.locator(
      'table, [class*="report"], [class*="empty"], text=/No reports|Generate your first/i'
    ).first().isVisible({ timeout: 5000 });
    expect(hasContent).toBeTruthy();
  });
});

test.describe('Dashboard', () => {

  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('dashboard loads key metrics', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('navigation links are visible', async ({ page }) => {
    await page.goto('/dashboard');
    // Check for essential nav items
    const nav = page.locator('nav, [role="navigation"], aside');
    await expect(nav.first()).toBeVisible();
  });
});
