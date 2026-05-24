import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Tiered tests (D-F1 ruling, R-16):
//  - Tier-1 (`*.test.ts`): pure-logic only, **Node** environment, no DOM /
//    network / Supabase.
//  - Tier-2 (`*.test.tsx`): thin component layer for the high-value
//    math-at-boundary forms (rides R-09), runs under **jsdom**.
// One `pnpm test` runs both; the CI job stays `lint-build` (unchanged).
// `environmentMatchGlobs` keeps Tier-1 in Node and only the `.tsx` component
// tests in jsdom, so the pure-logic suites are unaffected.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['src/**/*.test.tsx', 'jsdom']],
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'supabase/functions/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
  },
});
