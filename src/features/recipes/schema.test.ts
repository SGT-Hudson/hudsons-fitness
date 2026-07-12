// R-33 wave 5 — prep time at the form boundary (invariant 6: the DOM value is a
// string; the number/null the DB column takes is produced HERE, once).
// `prep_time_minutes` is nullable positive integer minutes: an empty input is
// "no time recorded" (a legitimate permanent state), 0 / negatives / fractions
// are not times and never reach the RPC — the zod schema rejects them and the
// check constraint is the backstop (Tier-3).
import { describe, it, expect } from 'vitest';
import {
  parsePrepTimeMinutes,
  recipeFormSchema,
  firstRecipeError,
  PREP_TIME_MAX_MINUTES,
} from './schema';

const validRows = [
  { rowId: 'r1', ingredient: { id: 'i1' }, quantity: '100', per_serving: false },
];

function form(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Tortilla',
    servings: '2',
    description: '',
    instructions: '',
    prepTime: '',
    mealTypes: [],
    rows: validRows,
    ...overrides,
  };
}

describe('parsePrepTimeMinutes', () => {
  it('maps an empty (or whitespace-only) input to null — "no time recorded"', () => {
    expect(parsePrepTimeMinutes('')).toBeNull();
    expect(parsePrepTimeMinutes('   ')).toBeNull();
  });

  it('parses a positive integer string to minutes', () => {
    expect(parsePrepTimeMinutes('35')).toBe(35);
    expect(parsePrepTimeMinutes(' 90 ')).toBe(90);
    expect(parsePrepTimeMinutes('1')).toBe(1);
  });

  it('rejects zero and negatives — they are not durations', () => {
    expect(parsePrepTimeMinutes('0')).toBe('invalid');
    expect(parsePrepTimeMinutes('-5')).toBe('invalid');
  });

  it('rejects non-integer and non-numeric input', () => {
    expect(parsePrepTimeMinutes('35.5')).toBe('invalid');
    expect(parsePrepTimeMinutes('1,5')).toBe('invalid');
    expect(parsePrepTimeMinutes('media hora')).toBe('invalid');
    expect(parsePrepTimeMinutes('35 min')).toBe('invalid');
  });

  // The overflow this cap exists for: `prep_time_minutes` is an int4, so a
  // value the form waves through lands in Postgres as `integer out of range`
  // — a raw driver error in the editor's error box, not a form message.
  it("rejects a value that would overflow the column's int4", () => {
    expect(parsePrepTimeMinutes('99999999999')).toBe('tooLarge');
    expect(parsePrepTimeMinutes('2147483648')).toBe('tooLarge');
  });

  it('accepts the cap itself and rejects one minute past it', () => {
    expect(parsePrepTimeMinutes(String(PREP_TIME_MAX_MINUTES))).toBe(PREP_TIME_MAX_MINUTES);
    expect(parsePrepTimeMinutes(String(PREP_TIME_MAX_MINUTES + 1))).toBe('tooLarge');
  });
});

describe('recipeFormSchema — prep time', () => {
  it('accepts a recipe with no prep time', () => {
    expect(recipeFormSchema.safeParse(form({ prepTime: '' })).success).toBe(true);
  });

  it('accepts a positive integer prep time', () => {
    expect(recipeFormSchema.safeParse(form({ prepTime: '35' })).success).toBe(true);
  });

  it.each(['0', '-5', '35.5', 'media hora'])('rejects %s', (prepTime) => {
    const res = recipeFormSchema.safeParse(form({ prepTime }));
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues.find((i) => i.path[0] === 'prepTime');
      expect(issue?.message).toBe('prepTimeInvalid');
    }
  });

  it('rejects an out-of-range prep time with its OWN code, not the generic one', () => {
    const res = recipeFormSchema.safeParse(form({ prepTime: '99999999999' }));
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues.find((i) => i.path[0] === 'prepTime');
      expect(issue?.message).toBe('prepTimeTooLarge');
    }
  });

  it('accepts the cap itself', () => {
    expect(
      recipeFormSchema.safeParse(form({ prepTime: String(PREP_TIME_MAX_MINUTES) })).success,
    ).toBe(true);
  });

  it('surfaces prepTimeTooLarge through firstRecipeError', () => {
    expect(firstRecipeError({ prepTime: { message: 'prepTimeTooLarge' } })).toBe(
      'prepTimeTooLarge',
    );
  });

  it('surfaces prepTimeInvalid through firstRecipeError, after the name/servings rules', () => {
    expect(firstRecipeError({ prepTime: { message: 'prepTimeInvalid' } })).toBe('prepTimeInvalid');
    // precedence: a missing name still wins over a bad prep time
    expect(
      firstRecipeError({
        name: { message: 'nameRequired' },
        prepTime: { message: 'prepTimeInvalid' },
      }),
    ).toBe('nameRequired');
  });
});
