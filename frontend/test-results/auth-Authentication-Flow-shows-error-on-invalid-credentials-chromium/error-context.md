# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Authentication Flow >> shows error on invalid credentials
- Location: e2e\auth.spec.ts:17:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[role="alert"], .toast, [class*="error"]').first()
Expected: visible
Timeout: 8000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 8000ms
  - waiting for locator('[role="alert"], .toast, [class*="error"]').first()

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
        - textbox "doctor@clinic.com" [ref=e16]: invalid@example.com
      - generic [ref=e17]:
        - generic [ref=e18]: Password
        - textbox "••••••••" [ref=e19]: wrongpassword
      - button "Sign In" [ref=e20] [cursor=pointer]
  - paragraph [ref=e21]:
    - text: Don't have an account?
    - link "Sign Up" [ref=e22] [cursor=pointer]:
      - /url: /register
  - paragraph [ref=e23]: HIPAA-compliant • Secure JWT authentication
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | const DOCTOR = {
  4  |   email: 'doctor@ceph.test',
  5  |   password: 'Doctor@1234',
  6  | };
  7  | 
  8  | test.describe('Authentication Flow', () => {
  9  | 
  10 |   test('login page loads and shows form', async ({ page }) => {
  11 |     await page.goto('/login');
  12 |     await expect(page.locator('h1, h2').first()).toBeVisible();
  13 |     await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
  14 |     await expect(page.locator('input[type="password"]')).toBeVisible();
  15 |   });
  16 | 
  17 |   test('shows error on invalid credentials', async ({ page }) => {
  18 |     await page.goto('/login');
  19 |     await page.fill('input[type="email"], input[name="email"]', 'invalid@example.com');
  20 |     await page.fill('input[type="password"]', 'wrongpassword');
  21 |     await page.click('button[type="submit"]');
  22 |     // Expect error toast or inline message
> 23 |     await expect(page.locator('[role="alert"], .toast, [class*="error"]').first()).toBeVisible({ timeout: 8000 });
     |                                                                                    ^ Error: expect(locator).toBeVisible() failed
  24 |   });
  25 | 
  26 |   test('successful login redirects to dashboard', async ({ page }) => {
  27 |     await page.goto('/login');
  28 |     await page.fill('input[type="email"], input[name="email"]', DOCTOR.email);
  29 |     await page.fill('input[type="password"]', DOCTOR.password);
  30 |     await page.click('button[type="submit"]');
  31 |     // Should redirect away from /login
  32 |     await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
  33 |   });
  34 | 
  35 |   test('register page loads', async ({ page }) => {
  36 |     await page.goto('/register');
  37 |     await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
  38 |   });
  39 | 
  40 |   test('logout clears session and redirects to login', async ({ page }) => {
  41 |     // Login first
  42 |     await page.goto('/login');
  43 |     await page.fill('input[type="email"], input[name="email"]', DOCTOR.email);
  44 |     await page.fill('input[type="password"]', DOCTOR.password);
  45 |     await page.click('button[type="submit"]');
  46 |     await page.waitForURL(/^(?!.*\/login)/, { timeout: 10_000 });
  47 | 
  48 |     // Click logout — text or icon-based logout button
  49 |     const logoutBtn = page.locator('button:has-text("Logout"), button:has-text("Sign out"), [aria-label*="logout"]');
  50 |     await logoutBtn.first().click();
  51 |     await expect(page).toHaveURL(/\/login/, { timeout: 8000 });
  52 |   });
  53 | 
  54 |   test('unauthenticated user is redirected to login', async ({ page }) => {
  55 |     await page.goto('/dashboard');
  56 |     await expect(page).toHaveURL(/\/login/, { timeout: 8000 });
  57 |   });
  58 | });
  59 | 
```