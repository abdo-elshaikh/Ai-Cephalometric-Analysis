import { test, expect } from '@playwright/test';

// Use a shared storage state if we had real auth, but for now we'll just login per test
// or mock the localStorage.
test.describe('Cephalometric Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    // Mock successful login state by injecting token before navigating
    await page.addInitScript(() => {
      window.localStorage.setItem('ceph_token', 'mock_jwt_token');
      window.localStorage.setItem('ceph_user', JSON.stringify({ id: 1, email: 'test@clinic.com', name: 'Dr. Test' }));
    });
    await page.goto('/');
  });

  test('should navigate to dashboard and create a new patient', async ({ page }) => {
    await expect(page).toHaveTitle(/CephAnalysis/i);
    
    // Check dashboard elements
    await expect(page.getByText('Dr. Test')).toBeVisible();
    await expect(page.getByText('Recent Patients')).toBeVisible();

    // Navigate to patients page
    await page.click('text=Patients');
    await expect(page).toHaveURL(/.*\/patients/);

    // Open add patient modal
    await page.click('button:has-text("Add Patient")');
    await expect(page.getByText('Register New Patient')).toBeVisible();

    // Fill form
    await page.fill('input[name="firstName"]', 'Jane');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.fill('input[name="dateOfBirth"]', '1995-05-15');
    await page.selectOption('select[name="gender"]', 'Female');

    // MOCK the API response for creating a patient so it doesn't fail if backend is down
    await page.route('**/api/patients', async route => {
      const json = { id: 999, mrn: 'PTN-999', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1995-05-15', gender: 'Female' };
      await route.fulfill({ json });
    });

    // Save
    await page.click('button:has-text("Save Patient")');

    // Wait for success toast
    await expect(page.getByText('Patient created successfully!')).toBeVisible();
  });

  test('should load analysis session and display canvas', async ({ page }) => {
    // Route mocking for a mock session
    await page.route('**/api/analysis/100', async route => {
      await route.fulfill({ json: { id: 100, status: 'Pending', landmarkCount: 0, measurementCount: 0, xRayImageId: 50 } });
    });
    await page.route('**/api/images/50', async route => {
      // Return a valid image payload
      await route.fulfill({ json: { id: 50, storageUrl: 'test.jpg' } });
    });
    await page.route('**/api/analysis/100/landmarks', async route => {
      await route.fulfill({ json: [] });
    });
    // Ensure the image request returns a dummy image
    await page.route('**/uploads/test.jpg', async route => {
      const buf = Buffer.from('R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=', 'base64'); // 1x1 transparent gif
      await route.fulfill({ body: buf, contentType: 'image/gif' });
    });

    await page.goto('/analysis/100');

    // Wait for viewer canvas
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // Check pipeline steps
    await expect(page.getByText('Step 1')).toBeVisible();
    await expect(page.getByText('Landmarks')).toBeVisible();

    // Check toolbar presence
    await expect(page.locator('button[title="Zoom in"]')).toBeVisible();
    await expect(page.locator('button[title="Zoom out"]')).toBeVisible();
  });
});
