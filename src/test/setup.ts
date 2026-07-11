// Tier-2 (R-16) component-test setup. Only the `*.test.tsx` files run under
// jsdom (see vitest.config.ts environmentMatchGlobs); this registers the
// jest-dom matchers and clears the DOM between tests. Tier-1 `*.test.ts`
// stays in Node and never loads this (it's a setupFile, but jest-dom's
// matchers are inert without a DOM and the cleanup is a no-op there).
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom implements no matchMedia, and `useMediaQuery` (ResponsiveDialog, and so
// every drawer/dialog built on it) calls it during render. Default to "no match"
// — i.e. the mobile branch — which is also the mobile-first default the app
// assumes. Tests that need the desktop branch override this themselves.
// Guarded on `window` itself: this setup file also loads for the Tier-1
// (`*.test.ts`) suites, which run in Node with no DOM at all.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

// jsdom implements none of the Pointer Capture API, and vaul grabs the pointer
// on `pointerdown` to drive its drag-to-dismiss. Without these, ANY realistic
// click inside a mobile Drawer throws `setPointerCapture is not a function` —
// an unhandled error that fails the run even when every assertion passed. The
// drag gesture itself is not testable in jsdom; capturing is a no-op here.
if (typeof Element !== 'undefined' && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
}

afterEach(() => {
  cleanup();
});
