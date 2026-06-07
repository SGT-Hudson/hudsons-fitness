// free-exercise-db images, served via jsDelivr at the SHA build-seed pins.
// SHA is duplicated from scripts/exercise-catalog/build-seed.ts PINNED_SHA
// INTENTIONALLY: that script is dev-only and never bundled into the app, so it
// must not be imported into runtime code. A unit test (images.test.ts) reads
// PINNED_SHA from build-seed.ts as text and asserts the two stay equal, so they
// cannot drift silently.
const SHA = 'b0eed061e1c832b3ed815fbaa4b45b3cdc14df49';
const BASE = `https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@${SHA}/exercises`;

/** Build a CDN URL from a stored relative image path (e.g. "Bench_Press/0.jpg").
 *  A leading slash is tolerated; an empty path returns an empty string. */
export function buildExerciseImageUrl(relativePath: string): string {
  if (relativePath === '') return '';
  const normalized = relativePath.startsWith('/')
    ? relativePath.slice(1)
    : relativePath;
  return `${BASE}/${normalized}`;
}
