import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildExerciseImageUrl } from './images';

// Read PINNED_SHA from build-seed.ts as TEXT (not an import) so scripts/** is
// never pulled into the typed src program (it is exempt from typecheck/lint).
const buildSeedPath = fileURLToPath(
  new URL('../../../../scripts/exercise-catalog/build-seed.ts', import.meta.url),
);
const pinnedSha = (() => {
  const src = readFileSync(buildSeedPath, 'utf8');
  const m = src.match(/export const PINNED_SHA = '([0-9a-f]+)'/);
  if (!m) throw new Error('PINNED_SHA not found in build-seed.ts');
  return m[1];
})();

const BASE = `https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@${pinnedSha}/exercises`;

describe('buildExerciseImageUrl', () => {
  it('builds a CDN URL from a relative path', () => {
    expect(buildExerciseImageUrl('Bench_Press/0.jpg')).toBe(
      `${BASE}/Bench_Press/0.jpg`,
    );
  });

  it('normalizes a leading slash', () => {
    expect(buildExerciseImageUrl('/Bench_Press/0.jpg')).toBe(
      `${BASE}/Bench_Press/0.jpg`,
    );
  });

  it('returns an empty string for an empty path', () => {
    expect(buildExerciseImageUrl('')).toBe('');
  });

  it('pins the same SHA as build-seed PINNED_SHA', () => {
    expect(buildExerciseImageUrl('x.jpg')).toContain(pinnedSha);
  });
});
