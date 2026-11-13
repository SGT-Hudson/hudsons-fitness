import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Tier-4 (R-32): runs the real fetch helpers against the LOCAL Supabase
// stack to validate their PostgREST select strings. Separate from
// vitest.config.ts on purpose — `pnpm test` must stay hermetic and stack-free.
const url = process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:56321';
const anonKey = process.env.SUPABASE_TEST_ANON_KEY ?? '';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  // envDir points at a directory with no .env* files, so Vite cannot load
  // `.env.test.local` (production credentials) in mode=test. First defence;
  // the setup file's host assertion is the second. This is a root-level Vite
  // option, not a `test` one.
  envDir: path.resolve(__dirname, './src/test/integration'),
  test: {
    environment: 'node',
    include: ['src/test/integration/**/*.itest.ts'],
    setupFiles: ['./src/test/integration/setup.ts'],
    // One worker: every case talks to the same local Postgres.
    minWorkers: 1,
    maxWorkers: 1,
    // Explicit env beats any .env file. `@/lib/supabase` reads these.
    env: {
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_PUBLISHABLE_KEY: anonKey,
    },
  },
});
