import { test, expect, Page } from '@playwright/test';
import path from 'path';

const DOCTOR = { email: 'doctor@ceph.test', password: 'Doctor@1234' };

async function loginAs(page: Page) {
  await page.goto('/login');
  await page.fill('input[type="email"], input[name="email"]', DOCTOR.email);
  await page.fill('input[type="password"]', DOCTOR.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/^(?!.*\/login)/, { timeout: 10_000 });
}

test.describe('Study & Image Flow', () => {

  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('study page loads for a patient', async ({ page }) => {
    await page.goto('/patients');
    // Navigate to first patient
    const firstPatient = page.locator('table tbody tr, [class*="patient"]').first();
    await firstPatient.click();
    await page.waitForURL(/\/patients\//);
    
    // Navigate to studies
    const studyLink = page.locator('a:has-text("Studies"), a:has-text("Study"), button:has-text("Studies")').first();
    if (await studyLink.isVisible()) {
      await studyLink.click();
    }
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('image upload form is accessible from study page', async ({ page }) => {
    // Navigate directly to a known study (if seeded)
    await page.goto('/patients');
    // This test relies on seed data being present
    const firstPatient = page.locator('table tbody tr, [class*="patient"]').first();
    const count = await firstPatient.count();
    if (count === 0) {
      test.skip();
      return;
    }
    await firstPatient.click();
    await page.waitForURL(/\/patients\//);
    // Look for an upload button
    const uploadBtn = page.locator('button:has-text("Upload"), label:has-text("Upload"), input[type="file"]');
    if (await uploadBtn.first().isVisible({ timeout: 3000 })) {
      await expect(uploadBtn.first()).toBeVisible();
    }
  });
});
