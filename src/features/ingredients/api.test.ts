import { describe, expect, it, vi } from 'vitest';

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

import { searchLocalIngredientsPage } from './api';

describe('searchLocalIngredientsPage', () => {
  it('computes range from page/pageSize and returns rows + total', async () => {
    const res = await searchLocalIngredientsPage('rice', { page: 3, pageSize: 10 });
    expect(calls.range).toEqual([20, 29]);
    expect(calls.or).toContain('name.ilike.%rice%');
    expect(res).toEqual({ rows: [{ id: '1' }], total: 42 });
  });

  it('omits the or-filter for an empty query', async () => {
    calls.or = undefined;
    await searchLocalIngredientsPage('   ', { page: 1, pageSize: 5 });
    expect(calls.or).toBeUndefined();
    expect(calls.range).toEqual([0, 4]);
  });
});
