import { describe, it, expect, vi } from 'vitest';

// `schema.ts` reaches `./api` for MEAL_TYPE_ORDER, and that module builds the
// Supabase client at import time — which throws without VITE_SUPABASE_* (green
// locally, red in CI). Stub it; nothing here talks to the network.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import { firstMealLogError, mealLogFormSchema } from './schema';

// The meal-log form's numeric boundary. Two things are pinned here:
//
//  - **the decimal comma** (`parseDecimalInput`): the servings / quantity /
//    custom-macro inputs render as `NumberField` (`type="text"`), so `30,5`
//    now reaches the schema and must parse to 30.5, not 305 and not NaN;
//  - **the gates that used to be the browser's.** The custom inputs carried
//    `min={0}`, which stops being enforced on `type="text"` — so a negative
//    macro is zod's to refuse now, or it would save silently.
//
// Blank semantics are UNCHANGED: a blank custom sub-macro is `null` (unknown,
// never 0) and a blank kcal is still the `customKcalRequired` failure.

function custom(over: Record<string, string> = {}) {
  return {
    mealType: 'breakfast',
    source: 'custom' as const,
    hasRecipe: false,
    hasIngredient: false,
    servings: '1',
    quantity: '',
    customName: 'Batido',
    customKcal: '250',
    customProtein: '',
    customCarbs: '',
    customFat: '',
    customFiber: '',
    notes: '',
    ...over,
  };
}

function firstIssue(form: ReturnType<typeof custom>, path: string) {
  const res = mealLogFormSchema.safeParse(form);
  expect(res.success).toBe(false);
  if (res.success) return null;
  return res.error.issues.find((i) => i.path[0] === path)?.message ?? null;
}

describe('mealLogFormSchema — the decimal comma', () => {
  it('accepts a comma in the custom kcal and macros', () => {
    expect(
      mealLogFormSchema.safeParse(custom({ customKcal: '250,5', customProtein: '30,5' })).success,
    ).toBe(true);
  });

  it('accepts a comma in a recipe serving count and an ingredient quantity', () => {
    expect(
      mealLogFormSchema.safeParse({
        ...custom(),
        source: 'recipe',
        hasRecipe: true,
        servings: '1,5',
      }).success,
    ).toBe(true);
    expect(
      mealLogFormSchema.safeParse({
        ...custom(),
        source: 'ingredient',
        hasIngredient: true,
        quantity: '82,4',
      }).success,
    ).toBe(true);
  });

  it('rejects an ambiguous separator pair rather than guessing', () => {
    expect(firstIssue(custom({ customKcal: '1,234.5' }), 'customKcal')).toBe('customKcalRequired');
  });
});

describe('mealLogFormSchema — blank semantics (unchanged)', () => {
  it('a blank custom kcal is still the required failure', () => {
    expect(firstIssue(custom({ customKcal: '  ' }), 'customKcal')).toBe('customKcalRequired');
  });

  it('a blank custom macro is legal — it means unknown, and stays blank', () => {
    expect(mealLogFormSchema.safeParse(custom({ customProtein: '' })).success).toBe(true);
  });
});

describe('mealLogFormSchema — the gates that replaced `min={0}`', () => {
  it.each(['customKcal', 'customProtein', 'customCarbs', 'customFat', 'customFiber'])(
    'refuses a negative %s',
    (field) => {
      expect(firstIssue(custom({ [field]: '-5' }), field)).toBe('customMacroInvalid');
    },
  );

  it('surfaces customMacroInvalid through firstMealLogError', () => {
    expect(firstMealLogError({ customProtein: { message: 'customMacroInvalid' } })).toBe(
      'customMacroInvalid',
    );
  });

  it('a missing name still wins over a negative macro', () => {
    expect(
      firstMealLogError({
        customName: { message: 'customNameRequired' },
        customProtein: { message: 'customMacroInvalid' },
      }),
    ).toBe('customNameRequired');
  });
});
