import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Tier-1 unit tests (D-F1 ruling): pure-logic only, Node environment,
// no DOM / network / Supabase. See docs/decisions.md D-F1, docs/roadmap.md R-16.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'supabase/functions/**/*.test.ts',
    ],
  },
});
