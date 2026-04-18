import { test, expect } from '@playwright/test';

const DOCTOR = {
  email: 'doctor@ceph.test',
  password: 'Doctor@1234',
};

test.describe('Authentication Flow', () => {

  test('login page loads and shows form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h1, h2').first()).toBeVisible();
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"], input[name="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    // Expect error toast or inline message
    await expect(page.locator('[role="alert"], .toast, [class*="error"]').first()).toBeVisible({ timeout: 8000 });
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"], input[name="email"]', DOCTOR.email);
    await page.fill('input[type="password"]', DOCTOR.password);
    await page.click('button[type="submit"]');
    // Should redirect away from /login
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('register page loads', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
  });

  test('logout clears session and redirects to login', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[type="email"], input[name="email"]', DOCTOR.email);
    await page.fill('input[type="password"]', DOCTOR.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/^(?!.*\/login)/, { timeout: 10_000 });

    // Click logout — text or icon-based logout button
    const logoutBtn = page.locator('button:has-text("Logout"), button:has-text("Sign out"), [aria-label*="logout"]');
    await logoutBtn.first().click();
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 });
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 });
  });
});
