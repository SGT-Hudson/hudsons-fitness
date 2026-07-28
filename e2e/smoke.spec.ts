import { expect, test } from '@playwright/test';

const ROUTES = [
  '/diary',
  '/planner',
  '/templates',
  '/recipes',
  '/recipes/ingredients',
  '/training',
  '/routine',
  '/exercises',
  '/progress',
  '/progress/goals',
  '/settings',
] as const;

// Known-benign console errors. Growing this list requires a comment per entry
// justifying why the error is noise, not signal. Warnings are not collected.
const CONSOLE_ALLOWLIST: RegExp[] = [];

for (const route of ROUTES) {
  test(`renders ${route}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      if (CONSOLE_ALLOWLIST.some((re) => re.test(msg.text()))) return;
      errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${String(err)}`));

    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('error-boundary-fallback')).toHaveCount(0);

    // Let data queries land so late console errors are caught too.
    await page.waitForLoadState('networkidle');
    expect(errors, `console/page errors on ${route}:\n${errors.join('\n')}`).toEqual([]);
  });
}
