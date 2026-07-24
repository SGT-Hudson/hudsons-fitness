import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REGISTRY } from './registry';

const ROOT = path.resolve(__dirname, '../../..');

// Call sites deliberately outside the guard, with the reason. A bare `'*'`
// names no column and cannot break; these four also live inside page
// components, so they are not invocable without rendering.
const EXCLUDED: Record<string, string> = {
  'src/pages/ExerciseHistoryPage.tsx': "select('*') inside a page component",
  'src/pages/EntrenamientoPage.tsx': "select('*') inside a page component",
  'src/pages/RoutineEditorPage.tsx': "select('*') inside a page component",
  'src/pages/SessionEditorPage.tsx': "select('*') inside a page component",
};

/** A select string that names columns or an embed — i.e. one that can break. */
function hasExplicitSelect(body: string): boolean {
  for (const match of body.matchAll(/\.select\(\s*([^)]*)/g)) {
    const arg = match[1].trim();
    if (arg === '') continue; // bare .select()
    // A bare `'*'` names no column and cannot break, whether alone or followed
    // by an options object — `.select('*')` and `.select('*', { count: 'exact' })`
    // are equally out of scope. The trailing `(,|$)` is what tells the star apart
    // from an embed like `'*, routine_exercises(*)'`, which DOES name a relation.
    if (/^(['"`])\*\1\s*(,\s*\{|$)/.test(arg)) continue;
    return true;
  }
  return false;
}

function sourceFiles(): string[] {
  // `git ls-files src` then filter in JS: git pathspec globs treat `*` as
  // matching `/` too, so `src/**/*.ts` is not the glob it looks like. Listing
  // the tree and filtering here is unambiguous. Tracked files only, so an
  // untracked scratch file cannot fail the build.
  return execFileSync('git', ['ls-files', 'src'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    .filter((f) => !/\.(test|itest)\.tsx?$/.test(f));
}

/** Exported functions whose body carries an explicit select. */
function helpersNeedingCoverage(): { file: string; fn: string }[] {
  const found: { file: string; fn: string }[] = [];
  for (const file of sourceFiles()) {
    if (file in EXCLUDED) continue;
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    if (!source.includes('.select(')) continue;
    const marks = [...source.matchAll(/export (?:async )?function (\w+)/g)];
    marks.forEach((mark, i) => {
      const start = mark.index ?? 0;
      const end = i + 1 < marks.length ? (marks[i + 1].index ?? source.length) : source.length;
      if (hasExplicitSelect(source.slice(start, end))) found.push({ file, fn: mark[1] });
    });
  }
  return found;
}

describe('every helper with an explicit select is registered', () => {
  const registered = new Set(REGISTRY.map((c) => `${c.file}#${c.fn}`));

  it('has no unregistered helper', () => {
    const missing = helpersNeedingCoverage()
      .map((h) => `${h.file}#${h.fn}`)
      .filter((key) => !registered.has(key));
    expect(
      missing,
      `These helpers carry a select string that can break but have no case in src/test/integration/registry.ts. Add one, or add the file to EXCLUDED with a written reason:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('has no stale registry entry', () => {
    const live = new Set(helpersNeedingCoverage().map((h) => `${h.file}#${h.fn}`));
    const stale = [...registered].filter((key) => !live.has(key));
    expect(
      stale,
      `These registry cases name a helper that no longer carries an explicit select (renamed, deleted, or its select changed). Remove them:\n  ${stale.join('\n  ')}`,
    ).toEqual([]);
  });
});
