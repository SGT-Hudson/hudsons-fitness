import { describe, expect, it, vi } from 'vitest';

// `./api` imports `@/lib/supabase`, which throws on module load when the
// VITE_SUPABASE_* env vars aren't set (Tier-1 tests run in Node, no env).
// Stub it with a chainable builder so the transitive import loads and the
// paged-search test can assert on the recorded calls.
const calls: Record<string, unknown> = {};
const builder = {
  select: vi.fn(() => builder),
  or: vi.fn((v: string) => {
    calls.or = v;
    return builder;
  }),
  order: vi.fn(() => builder),
  range: vi.fn((from: number, to: number) => {
    calls.range = [from, to];
    return Promise.resolve({ data: [{ id: '1' }], count: 42, error: null });
  }),
};
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(() => builder) },
}));

import { ingredientDisplayName, searchLocalIngredientsPage, type Ingredient } from './api';

const base = { name: 'Arroz blanco', name_en: 'White rice' } as Ingredient;

describe('ingredientDisplayName', () => {
  it('returns the ES name in es locale', () => {
    expect(ingredientDisplayName(base, 'es')).toBe('Arroz blanco');
  });
  it('returns the EN name in en locale', () => {
    expect(ingredientDisplayName(base, 'en')).toBe('White rice');
  });
  it('falls back to the ES name when name_en is null', () => {
    expect(ingredientDisplayName({ ...base, name_en: null }, 'en')).toBe('Arroz blanco');
  });
});

describe('searchLocalIngredientsPage', () => {
  it('computes range from page/pageSize and returns rows + total', async () => {
    const res = await searchLocalIngredientsPage('rice', { page: 3, pageSize: 10 });
    expect(calls.range).toEqual([20, 29]);
    expect(calls.or).toContain('name.ilike.%rice%');
    expect(calls.or).toContain('name_en.ilike.%rice%');
    expect(res).toEqual({ rows: [{ id: '1' }], total: 42 });
  });

  it('omits the or-filter for an empty query', async () => {
    calls.or = undefined;
    await searchLocalIngredientsPage('   ', { page: 1, pageSize: 5 });
    expect(calls.or).toBeUndefined();
    expect(calls.range).toEqual([0, 4]);
  });
});
