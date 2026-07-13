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
  SERVINGS_MIN,
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

// The decimal-comma fix. A row quantity is fraction-capable (82,4 g of chicken),
// so it renders as a `NumberField` (`type="text" inputMode="decimal"`) and the
// comma reaches the schema. `servings` is deliberately NOT migrated — it keeps
// its integer spinner — and `prepTime` is integer minutes, so `1,5` there is
// still invalid (pinned above).
describe('recipeFormSchema — a row quantity with a decimal comma', () => {
  it('accepts 82,4 as a quantity', () => {
    expect(
      recipeFormSchema.safeParse(
        form({ rows: [{ ...validRows[0], quantity: '82,4' }] }),
      ).success,
    ).toBe(true);
  });

  it('still rejects a garbage / zero / ambiguous quantity', () => {
    for (const quantity of ['mucho', '0', '-5', '1,234.5']) {
      const res = recipeFormSchema.safeParse(
        form({ rows: [{ ...validRows[0], quantity }] }),
      );
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.find((i) => i.path[0] === 'rows')?.message).toBe(
          'rowInvalidQuantity',
        );
      }
    }
  });
});

// Servings is fraction-capable — `min={0.5} step="0.5"` on the input, and half a
// serving is a legitimate recipe — so it is a `NumberField` like every other
// decimal, and its `min` gate (which `type="text"` stopped enforcing) lives here.
describe('recipeFormSchema — servings', () => {
  it('accepts a decimal comma: 2,5 raciones', () => {
    const res = recipeFormSchema.safeParse(form({ servings: '2,5' }));
    expect(res.success).toBe(true);
  });

  it('accepts the half-serving floor itself', () => {
    expect(recipeFormSchema.safeParse(form({ servings: String(SERVINGS_MIN) })).success).toBe(true);
  });

  it.each(['0', '0,2', '-1', '', 'dos', '1,234.5'])('rejects %s', (servings) => {
    const res = recipeFormSchema.safeParse(form({ servings }));
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.find((i) => i.path[0] === 'servings')?.message).toBe(
        'servingsInvalid',
      );
    }
  });
});
