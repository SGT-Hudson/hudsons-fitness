import { describe, expect, it, vi } from 'vitest';

// `./api` imports `@/lib/supabase`, which throws on module load when the
// VITE_SUPABASE_* env vars aren't set (Tier-1 tests run in Node, no env).
// The tests below only exercise pure helpers — stub supabase so the
// transitive import doesn't fail to load.
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

import { ingredientDisplayName, type Ingredient } from './api';

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
