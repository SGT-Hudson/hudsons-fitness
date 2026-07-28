import { defineConfig, devices } from '@playwright/test';

// Fail closed (same stance as Tier-4): this suite only ever targets the local
// stack. `.env.test.local` in this repo holds production credentials — env for
// the e2e build must come from the shell, never from Vite env files.
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'e2e: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are unset. ' +
      'Run `pnpm test:e2e:local`, or export them pointing at the local stack.',
  );
}
const host = new URL(supabaseUrl).hostname;
if (host !== '127.0.0.1' && host !== 'localhost') {
  throw new Error(`e2e refuses to run against a non-local Supabase host: ${host}`);
}

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    // localStorage-based Supabase session ⇒ storageState is origin-scoped.
    // localhost and 127.0.0.1 are DIFFERENT origins — everything uses localhost.
    // Deliberately NOT the `pnpm preview` default (4173): a dev's already-
    // running preview — built from .env.local, which may point at production
    // — would otherwise be silently reused (reuseExistingServer below), and
    // the shell-env fail-closed guard above cannot see a server it didn't start.
    baseURL: 'http://localhost:4183',
    // The PWA service worker registers in production builds (vite preview
    // included) and would cache the shell across tests.
    serviceWorkers: 'block',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...devices['Pixel 7'],
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'smoke',
      testMatch: /smoke\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/user.json' },
    },
  ],
  webServer: {
    // Vite bakes VITE_* env in at build time, so the build happens here, with
    // the shell env this config just validated.
    command: 'pnpm build && pnpm preview --port 4183 --strictPort',
    url: 'http://localhost:4183',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
