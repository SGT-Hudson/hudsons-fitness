import { describe, it, expect } from 'vitest';
import { canEditIngredient } from './ownership';

describe('canEditIngredient — R-01 shared pool (mirrors canEditRecipe)', () => {
  it('lets the creator edit their own ingredient', () => {
    expect(canEditIngredient({ created_by_user_id: 'u-1' }, 'u-1')).toBe(true);
  });

  it('refuses a pooled ingredient someone else created (a direct-write update would violate RLS)', () => {
    expect(canEditIngredient({ created_by_user_id: 'u-2' }, 'u-1')).toBe(false);
  });

  // hide_owned_ingredient re-owns an orphaned ingredient to the ANON user
  // rather than nulling the column, so it just matches nobody.
  it('refuses an orphaned ingredient re-owned by the anon user', () => {
    const ANON = '00000000-0000-0000-0000-00000000a0a0';
    expect(canEditIngredient({ created_by_user_id: ANON }, 'u-1')).toBe(false);
  });

  it('refuses when there is no signed-in user', () => {
    expect(canEditIngredient({ created_by_user_id: 'u-1' }, undefined)).toBe(false);
    expect(canEditIngredient({ created_by_user_id: 'u-1' }, null)).toBe(false);
  });

  // Unlike recipes, ingredients has a genuine THIRD ownership state: `null`
  // means a system seed (~230 baseline rows) — nobody may edit it, and
  // `auth.uid() = created_by_user_id` can never match `null` either.
  it('refuses a system-seeded ingredient (created_by_user_id is null)', () => {
    expect(canEditIngredient({ created_by_user_id: null }, 'u-1')).toBe(false);
  });
});
