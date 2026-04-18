import { test, expect, Page } from '@playwright/test';

const DOCTOR = { email: 'doctor@ceph.test', password: 'Doctor@1234' };

async function loginAs(page: Page, user = DOCTOR) {
  await page.goto('/login');
  await page.fill('input[type="email"], input[name="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/^(?!.*\/login)/, { timeout: 10_000 });
}

test.describe('Patient Management Flow', () => {

  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('patients list page loads', async ({ page }) => {
    await page.goto('/patients');
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('can navigate to new patient form', async ({ page }) => {
    await page.goto('/patients');
    const addBtn = page.locator('a[href*="/patients/new"], button:has-text("New Patient"), button:has-text("Add Patient")');
    await addBtn.first().click();
    await expect(page).toHaveURL(/\/patients\/new|\/patients\/create/);
    await expect(page.locator('input[name="firstName"], input[placeholder*="First"]')).toBeVisible();
  });

  test('create new patient and verify appears in list', async ({ page }) => {
    const uniqueName = `E2ETest_${Date.now()}`;
    await page.goto('/patients/new');

    await page.fill('input[name="firstName"], input[placeholder*="First"]', uniqueName);
    await page.fill('input[name="lastName"], input[placeholder*="Last"]', 'PlaywrightUser');
    // Fill date of birth
    const dobInput = page.locator('input[name="dateOfBirth"], input[type="date"]').first();
    await dobInput.fill('1990-01-15');

    await page.click('button[type="submit"]');
    
    // Should redirect back to patient list or detail
    await expect(page).not.toHaveURL(/\/new|\/create/, { timeout: 10_000 });
    // Patient name should appear somewhere
    await page.goto('/patients');
    await expect(page.locator(`text=${uniqueName}`)).toBeVisible({ timeout: 8000 });
  });

  test('patient detail page is accessible', async ({ page }) => {
    await page.goto('/patients');
    // Click first patient row/card
    const firstPatient = page.locator('table tbody tr, [class*="patient-card"], [class*="patient-row"]').first();
    await firstPatient.click();
    await expect(page).toHaveURL(/\/patients\//);
  });
});
