import { expect, test as setup } from '@playwright/test';

const STORAGE_STATE = 'e2e/.auth/user.json';

setup('log in and persist session', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill('e2e-smoke@hudsonsfitness.test');
  await page.locator('#password').fill('e2e-smoke-password');
  await page.locator('button[type=submit]').click();
  // Successful login navigates to /diary; RequireOnboarded would bounce a
  // non-onboarded profile to /onboarding, so this also proves the fixture.
  await page.waitForURL('**/diary');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });
});
