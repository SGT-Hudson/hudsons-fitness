import { describe, it, expect } from 'vitest';
import { RECIPE_MEAL_TYPES, recipeMealTypeSchema, toRecipeMealTypes } from './mealTypes';

describe('recipe meal-type vocabulary', () => {
  it('is exactly the 5 locked keys (must match the DB CHECK)', () => {
    expect([...RECIPE_MEAL_TYPES]).toEqual(['breakfast', 'lunch', 'snack', 'dinner', 'dessert']);
  });

  it('zod enum accepts known keys and rejects unknown', () => {
    expect(recipeMealTypeSchema.safeParse('dinner').success).toBe(true);
    expect(recipeMealTypeSchema.safeParse('brunch').success).toBe(false);
  });

  it('toRecipeMealTypes drops unknown values and handles null', () => {
    expect(toRecipeMealTypes(['dinner', 'brunch', 'snack'])).toEqual(['dinner', 'snack']);
    expect(toRecipeMealTypes(null)).toEqual([]);
    expect(toRecipeMealTypes(undefined)).toEqual([]);
  });
});
