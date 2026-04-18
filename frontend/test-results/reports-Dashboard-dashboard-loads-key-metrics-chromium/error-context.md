# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: reports.spec.ts >> Dashboard >> dashboard loads key metrics
- Location: e2e\reports.spec.ts:40:3

# Error details

```
TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - img [ref=e7]
    - heading "CephAnalysis" [level=1] [ref=e9]
    - paragraph [ref=e10]: AI-Powered Cephalometric Analysis Platform
  - generic [ref=e11]:
    - heading "Sign In" [level=2] [ref=e12]
    - generic [ref=e13]:
      - generic [ref=e14]:
        - generic [ref=e15]: Email address
        - textbox "doctor@clinic.com" [ref=e16]: doctor@ceph.test
      - generic [ref=e17]:
        - generic [ref=e18]: Password
        - textbox "••••••••" [ref=e19]: Doctor@1234
      - button "Sign In" [ref=e20] [cursor=pointer]
  - paragraph [ref=e21]:
    - text: Don't have an account?
    - link "Sign Up" [ref=e22] [cursor=pointer]:
      - /url: /register
  - paragraph [ref=e23]: HIPAA-compliant • Secure JWT authentication
```

# Test source

```ts
  1  | import { test, expect, Page } from '@playwright/test';
  2  | 
  3  | const DOCTOR = { email: 'doctor@ceph.test', password: 'Doctor@1234' };
  4  | 
  5  | async function loginAs(page: Page) {
  6  |   await page.goto('/login');
  7  |   await page.fill('input[type="email"], input[name="email"]', DOCTOR.email);
  8  |   await page.fill('input[type="password"]', DOCTOR.password);
  9  |   await page.click('button[type="submit"]');
> 10 |   await page.waitForURL(/^(?!.*\/login)/, { timeout: 10_000 });
     |              ^ TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
  11 | }
  12 | 
  13 | test.describe('Reports Flow', () => {
  14 | 
  15 |   test.beforeEach(async ({ page }) => {
  16 |     await loginAs(page);
  17 |   });
  18 | 
  19 |   test('reports page loads for authenticated user', async ({ page }) => {
  20 |     await page.goto('/reports');
  21 |     await expect(page.locator('h1, h2').first()).toBeVisible();
  22 |   });
  23 | 
  24 |   test('reports page shows empty state or report list', async ({ page }) => {
  25 |     await page.goto('/reports');
  26 |     // Either a table/list or empty state message
  27 |     const hasContent = await page.locator(
  28 |       'table, [class*="report"], [class*="empty"], text=/No reports|Generate your first/i'
  29 |     ).first().isVisible({ timeout: 5000 });
  30 |     expect(hasContent).toBeTruthy();
  31 |   });
  32 | });
  33 | 
  34 | test.describe('Dashboard', () => {
  35 | 
  36 |   test.beforeEach(async ({ page }) => {
  37 |     await loginAs(page);
  38 |   });
  39 | 
  40 |   test('dashboard loads key metrics', async ({ page }) => {
  41 |     await page.goto('/dashboard');
  42 |     await expect(page.locator('h1, h2').first()).toBeVisible();
  43 |   });
  44 | 
  45 |   test('navigation links are visible', async ({ page }) => {
  46 |     await page.goto('/dashboard');
  47 |     // Check for essential nav items
  48 |     const nav = page.locator('nav, [role="navigation"], aside');
  49 |     await expect(nav.first()).toBeVisible();
  50 |   });
  51 | });
  52 | 
```