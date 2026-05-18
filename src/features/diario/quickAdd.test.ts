import { describe, it, expect } from 'vitest';
import { buildQuickAddList, type QuickAddRow } from './quickAdd';

const NOW = new Date('2026-05-18T12:00:00Z');

function row(recipeId: string, daysAgo: number, kcal = 300): QuickAddRow {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return {
    recipeId,
    name: `R${recipeId}`,
    kcalPerServing: kcal,
    loggedOn: d.toISOString().slice(0, 10),
  };
}

describe('buildQuickAddList', () => {
  it('empty input → empty list', () => {
    expect(buildQuickAddList([], { now: NOW })).toEqual([]);
  });

  it('dedupes by recipe, most-recent first within the recent window', () => {
    const out = buildQuickAddList(
      [row('a', 1), row('b', 2), row('a', 5)],
      { now: NOW },
    );
    expect(out.map((i) => i.recipeId)).toEqual(['a', 'b']);
  });

  it('backfills with most-frequent when recent window is thin', () => {
    const rows = [
      row('a', 1), // recent
      row('b', 40), row('b', 41), row('b', 42), // frequent, outside recent window
      row('c', 50), // single, old
    ];
    const out = buildQuickAddList(rows, { now: NOW, cap: 3, recentWindowDays: 14 });
    expect(out.map((i) => i.recipeId)).toEqual(['a', 'b', 'c']);
  });

  it('respects the cap', () => {
    const rows = [row('a', 1), row('b', 2), row('c', 3), row('d', 4)];
    expect(buildQuickAddList(rows, { now: NOW, cap: 2 }).length).toBe(2);
  });

  it('a row logged exactly on the cutoff date counts as recent', () => {
    // recentWindowDays 14, NOW 2026-05-18 → cutoff 2026-05-04
    const out = buildQuickAddList(
      [row('a', 14), row('b', 20)],
      { now: NOW, recentWindowDays: 14 },
    );
    // 'a' is exactly on the cutoff (>= inclusive) → recent, before backfill 'b'
    expect(out.map((i) => i.recipeId)).toEqual(['a', 'b']);
  });

  it('carries name + kcalPerServing through', () => {
    const [item] = buildQuickAddList([row('a', 1, 540)], { now: NOW });
    expect(item).toEqual({ recipeId: 'a', name: 'Ra', kcalPerServing: 540 });
  });
});
