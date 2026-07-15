import { describe, it, expect } from 'vitest';
import { canEditRecipe } from './ownership';

describe('canEditRecipe — R-01 shared pool', () => {
  it('lets the creator edit their own recipe', () => {
    expect(canEditRecipe({ created_by_user_id: 'u-1' }, 'u-1')).toBe(true);
  });

  it('refuses a pooled recipe someone else created (save_recipe would 400)', () => {
    expect(canEditRecipe({ created_by_user_id: 'u-2' }, 'u-1')).toBe(false);
  });

  // hide_owned_recipe re-owns an orphaned recipe to the ANON user rather than
  // nulling the column, so it just matches nobody.
  it('refuses an orphaned recipe re-owned by the anon user', () => {
    const ANON = '00000000-0000-0000-0000-00000000a0a0';
    expect(canEditRecipe({ created_by_user_id: ANON }, 'u-1')).toBe(false);
  });

  it('refuses when there is no signed-in user', () => {
    expect(canEditRecipe({ created_by_user_id: 'u-1' }, undefined)).toBe(false);
    expect(canEditRecipe({ created_by_user_id: 'u-1' }, null)).toBe(false);
  });
});
