import { beforeEach, describe, expect, it, vi } from 'vitest';

// `./api` imports `@/lib/supabase`, which throws on module load when the
// VITE_SUPABASE_* env vars aren't set (Tier-1 tests run in Node, no env).
// Stub it with a chainable builder so the transitive import loads and the
// paged-search test can assert on the recorded calls.
const calls: Record<string, unknown> = {};
// `importIngredientFromOFF` writes to `ingredients` (insert().select().single())
// then `ensureMyIngredientRef` writes to `user_ingredient_refs` (upsert()).
// Both go through this one shared builder (`from` always returns it,
// matching the existing pattern below) — `insert` records the payload so
// tests can assert exactly what would hit the DB.
let insertResult: { data: unknown; error: unknown } = { data: null, error: null };
const builder = {
  select: vi.fn(() => builder),
  or: vi.fn((v: string) => {
    calls.or = v;
    return builder;
  }),
  order: vi.fn((column: string, opts?: unknown) => {
    calls.order = [...((calls.order as unknown[]) ?? []), [column, opts]];
    return builder;
  }),
  limit: vi.fn((n: number) => {
    calls.limit = n;
    return Promise.resolve({ data: [{ id: '1' }], error: null });
  }),
  insert: vi.fn((payload: unknown) => {
    calls.insertPayload = payload;
    return builder;
  }),
  single: vi.fn(() => Promise.resolve(insertResult)),
  eq: vi.fn(() => builder),
  upsert: vi.fn((row: unknown, opts: unknown) => {
    calls.upsertRow = row;
    calls.upsertOpts = opts;
    return Promise.resolve({ error: null });
  }),
};
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(() => builder) },
}));

import {
  ingredientDisplayName,
  importIngredientFromOFF,
  listPoolIngredients,
  type Ingredient,
  type ManualIngredientInput,
} from './api';
import type { OFFSearchResult } from '@/lib/openfoodfacts';

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

// The list page holds the pool in memory (one query) so its five filter chips
// can carry real counts — hence a deterministic, bounded, unfiltered fetch.
describe('listPoolIngredients', () => {
  it('fetches the pool in a deterministic order, under an explicit ceiling', async () => {
    calls.order = undefined;
    const rows = await listPoolIngredients();
    expect(calls.order).toEqual([
      ['is_verified', { ascending: false }],
      ['name', undefined],
      ['id', undefined],
    ]);
    expect(calls.limit).toBe(1000);
    expect(rows).toEqual([{ id: '1' }]);
  });
});

// A pool item OFF reports as fully known — every sub-macro present and
// non-null. `overrides` mirrors it unchanged (the "review & save" path where
// the user didn't touch anything).
const product: OFFSearchResult = {
  code: '5000112637922',
  name: 'Coca-Cola',
  brand: 'Coca-Cola',
  thumbnailUrl: null,
  kcalPer100g: 42,
  proteinPer100g: 0,
  carbsPer100g: 10.6,
  fatPer100g: 0,
  fiberPer100g: 0,
  sugarPer100g: 10.6,
  satFatPer100g: 0,
  saltPer100g: 0.01,
};

const overridesFromProduct: ManualIngredientInput = {
  name: product.name,
  brand: product.brand,
  unit_type: 'gram',
  kcal_per_unit: product.kcalPer100g,
  protein_g_per_unit: product.proteinPer100g,
  carbs_g_per_unit: product.carbsPer100g,
  fat_g_per_unit: product.fatPer100g,
  fiber_g_per_unit: product.fiberPer100g,
  sugar_g_per_unit: product.sugarPer100g,
  saturated_fat_g_per_unit: product.satFatPer100g,
  salt_g_per_unit: product.saltPer100g,
};

describe('importIngredientFromOFF', () => {
  beforeEach(() => {
    insertResult = { data: null, error: null };
    calls.insertPayload = undefined;
    calls.upsertRow = undefined;
    // `single()` resolves with whatever `insert()` was just called with, plus
    // an id — good enough to prove what got written without a real DB.
    builder.single.mockImplementation(() =>
      Promise.resolve({
        data: { id: 'ing-1', ...(calls.insertPayload as object) },
        error: null,
      }),
    );
  });

  it('writes OFF\'s values unchanged for a normal import', async () => {
    await importIngredientFromOFF('user-1', product, overridesFromProduct);
    const payload = calls.insertPayload as Record<string, unknown>;
    expect(payload.sugar_g_per_unit).toBe(10.6);
    expect(payload.saturated_fat_g_per_unit).toBe(0);
    expect(payload.salt_g_per_unit).toBe(0.01);
    expect(payload.brand).toBe('Coca-Cola');
    expect(payload.name).toBe('Coca-Cola');
  });

  it('writes null (not OFF\'s number) when the user clears a sub-macro', async () => {
    const overrides: ManualIngredientInput = {
      ...overridesFromProduct,
      sugar_g_per_unit: null,
      saturated_fat_g_per_unit: null,
      salt_g_per_unit: null,
    };
    await importIngredientFromOFF('user-1', product, overrides);
    const payload = calls.insertPayload as Record<string, unknown>;
    expect(payload.sugar_g_per_unit).toBeNull();
    expect(payload.saturated_fat_g_per_unit).toBeNull();
    expect(payload.salt_g_per_unit).toBeNull();
  });

  it('writes null, not a false 0, when OFF reports 0 and the user clears the field', async () => {
    // OFF genuinely reports salt as 0 (`saltPer100g: 0` on `product`) — the
    // false-zero trap: `0 ?? product.saltPer100g` in the old `??`-merge code
    // would have kept OFF's 0 even when the user cleared the field. The
    // column's contract (U-1 / R-33 wave 6) is null = unknown, never 0, so
    // a deliberate clear must survive as null.
    const overrides: ManualIngredientInput = {
      ...overridesFromProduct,
      saturated_fat_g_per_unit: null, // OFF reported 0 for this too
      salt_g_per_unit: null, // OFF reported 0
    };
    await importIngredientFromOFF('user-1', product, overrides);
    const payload = calls.insertPayload as Record<string, unknown>;
    expect(payload.saturated_fat_g_per_unit).toBeNull();
    expect(payload.salt_g_per_unit).toBeNull();
  });

  it("writes the user's edited values, not OFF's, when they differ", async () => {
    const overrides: ManualIngredientInput = {
      ...overridesFromProduct,
      name: 'Coca-Cola Zero',
      brand: 'Coca-Cola Company',
      sugar_g_per_unit: 0,
      salt_g_per_unit: 0.02,
    };
    await importIngredientFromOFF('user-1', product, overrides);
    const payload = calls.insertPayload as Record<string, unknown>;
    expect(payload.name).toBe('Coca-Cola Zero');
    expect(payload.brand).toBe('Coca-Cola Company');
    expect(payload.sugar_g_per_unit).toBe(0);
    expect(payload.salt_g_per_unit).toBe(0.02);
  });
});
