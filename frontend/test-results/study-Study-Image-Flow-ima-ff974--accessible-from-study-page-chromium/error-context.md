# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: study.spec.ts >> Study & Image Flow >> image upload form is accessible from study page
- Location: e2e\study.spec.ts:35:3

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
  2  | import path from 'path';
  3  | 
  4  | const DOCTOR = { email: 'doctor@ceph.test', password: 'Doctor@1234' };
  5  | 
  6  | async function loginAs(page: Page) {
  7  |   await page.goto('/login');
  8  |   await page.fill('input[type="email"], input[name="email"]', DOCTOR.email);
  9  |   await page.fill('input[type="password"]', DOCTOR.password);
  10 |   await page.click('button[type="submit"]');
> 11 |   await page.waitForURL(/^(?!.*\/login)/, { timeout: 10_000 });
     |              ^ TimeoutError: page.waitForURL: Timeout 10000ms exceeded.
  12 | }
  13 | 
  14 | test.describe('Study & Image Flow', () => {
  15 | 
  16 |   test.beforeEach(async ({ page }) => {
  17 |     await loginAs(page);
  18 |   });
  19 | 
  20 |   test('study page loads for a patient', async ({ page }) => {
  21 |     await page.goto('/patients');
  22 |     // Navigate to first patient
  23 |     const firstPatient = page.locator('table tbody tr, [class*="patient"]').first();
  24 |     await firstPatient.click();
  25 |     await page.waitForURL(/\/patients\//);
  26 |     
  27 |     // Navigate to studies
  28 |     const studyLink = page.locator('a:has-text("Studies"), a:has-text("Study"), button:has-text("Studies")').first();
  29 |     if (await studyLink.isVisible()) {
  30 |       await studyLink.click();
  31 |     }
  32 |     await expect(page.locator('h1, h2').first()).toBeVisible();
  33 |   });
  34 | 
  35 |   test('image upload form is accessible from study page', async ({ page }) => {
  36 |     // Navigate directly to a known study (if seeded)
  37 |     await page.goto('/patients');
  38 |     // This test relies on seed data being present
  39 |     const firstPatient = page.locator('table tbody tr, [class*="patient"]').first();
  40 |     const count = await firstPatient.count();
  41 |     if (count === 0) {
  42 |       test.skip();
  43 |       return;
  44 |     }
  45 |     await firstPatient.click();
  46 |     await page.waitForURL(/\/patients\//);
  47 |     // Look for an upload button
  48 |     const uploadBtn = page.locator('button:has-text("Upload"), label:has-text("Upload"), input[type="file"]');
  49 |     if (await uploadBtn.first().isVisible({ timeout: 3000 })) {
  50 |       await expect(uploadBtn.first()).toBeVisible();
  51 |     }
  52 |   });
  53 | });
  54 | 
```