// Tier-2 (R-16) component-test setup. Only the `*.test.tsx` files run under
// jsdom (see vitest.config.ts environmentMatchGlobs); this registers the
// jest-dom matchers and clears the DOM between tests. Tier-1 `*.test.ts`
// stays in Node and never loads this (it's a setupFile, but jest-dom's
// matchers are inert without a DOM and the cleanup is a no-op there).
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
