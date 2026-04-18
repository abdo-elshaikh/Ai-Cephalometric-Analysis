# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: patients.spec.ts >> Patient Management Flow >> patient detail page is accessible
- Location: e2e\patients.spec.ts:51:3

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
  5  | async function loginAs(page: Page, user = DOCTOR) {
  6  |   await page.goto('/login');
  7  |   await page.fill('input[type="email"], input[name="email"]', user.email);
  8  |   await page.fill('input[type="password"]', user.password);
  9  |   await page.click('button[type="submit"]');
> 10 |   await page.waitForURL(/^(?!.*\/login)/, { timeout: 10_000 });
     |              ^ TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
  11 | }
  12 | 
  13 | test.describe('Patient Management Flow', () => {
  14 | 
  15 |   test.beforeEach(async ({ page }) => {
  16 |     await loginAs(page);
  17 |   });
  18 | 
  19 |   test('patients list page loads', async ({ page }) => {
  20 |     await page.goto('/patients');
  21 |     await expect(page.locator('h1, h2').first()).toBeVisible();
  22 |   });
  23 | 
  24 |   test('can navigate to new patient form', async ({ page }) => {
  25 |     await page.goto('/patients');
  26 |     const addBtn = page.locator('a[href*="/patients/new"], button:has-text("New Patient"), button:has-text("Add Patient")');
  27 |     await addBtn.first().click();
  28 |     await expect(page).toHaveURL(/\/patients\/new|\/patients\/create/);
  29 |     await expect(page.locator('input[name="firstName"], input[placeholder*="First"]')).toBeVisible();
  30 |   });
  31 | 
  32 |   test('create new patient and verify appears in list', async ({ page }) => {
  33 |     const uniqueName = `E2ETest_${Date.now()}`;
  34 |     await page.goto('/patients/new');
  35 | 
  36 |     await page.fill('input[name="firstName"], input[placeholder*="First"]', uniqueName);
  37 |     await page.fill('input[name="lastName"], input[placeholder*="Last"]', 'PlaywrightUser');
  38 |     // Fill date of birth
  39 |     const dobInput = page.locator('input[name="dateOfBirth"], input[type="date"]').first();
  40 |     await dobInput.fill('1990-01-15');
  41 | 
  42 |     await page.click('button[type="submit"]');
  43 |     
  44 |     // Should redirect back to patient list or detail
  45 |     await expect(page).not.toHaveURL(/\/new|\/create/, { timeout: 10_000 });
  46 |     // Patient name should appear somewhere
  47 |     await page.goto('/patients');
  48 |     await expect(page.locator(`text=${uniqueName}`)).toBeVisible({ timeout: 8000 });
  49 |   });
  50 | 
  51 |   test('patient detail page is accessible', async ({ page }) => {
  52 |     await page.goto('/patients');
  53 |     // Click first patient row/card
  54 |     const firstPatient = page.locator('table tbody tr, [class*="patient-card"], [class*="patient-row"]').first();
  55 |     await firstPatient.click();
  56 |     await expect(page).toHaveURL(/\/patients\//);
  57 |   });
  58 | });
  59 | 
```