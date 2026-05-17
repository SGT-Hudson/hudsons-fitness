import { describe, it, expect } from 'vitest';
import {
  add,
  scale,
  ingredientMacros,
  computeRecipeMacros,
  recipePerServingMacros,
  roundMacro,
  ZERO_MACROS,
  type CoreIngredient,
  type CoreRecipe,
} from './macros';

// Direct coverage of the shared pure macro core (D-F3 / R-17). The client
// and edge wrappers delegate here; this asserts the core itself, including
// the `number | string` numeric coercion both runtimes rely on.

const ing: CoreIngredient = {
  unitType: 'gram',
  kcalPerUnit: 100,
  proteinGPerUnit: 10,
  carbsGPerUnit: 5,
  fatGPerUnit: 2,
  fiberGPerUnit: 1,
};

describe('add / scale', () => {
  it('add sums field-wise', () => {
    expect(
      add(
        { kcal: 1, proteinG: 2, carbsG: 3, fatG: 4, fiberG: 5 },
        { kcal: 10, proteinG: 20, carbsG: 30, fatG: 40, fiberG: 50 },
      ),
    ).toEqual({ kcal: 11, proteinG: 22, carbsG: 33, fatG: 44, fiberG: 55 });
  });

  it('scale multiplies every field by k', () => {
    expect(
      scale({ kcal: 1, proteinG: 2, carbsG: 3, fatG: 4, fiberG: 5 }, 3),
    ).toEqual({ kcal: 3, proteinG: 6, carbsG: 9, fatG: 12, fiberG: 15 });
  });
});

describe('ingredientMacros', () => {
  it('divides gram ingredients per 100', () => {
    expect(ingredientMacros(ing, 200)).toEqual({
      kcal: 200,
      proteinG: 20,
      carbsG: 10,
      fatG: 4,
      fiberG: 2,
    });
  });

  it('uses divisor 1 for unit ingredients', () => {
    expect(ingredientMacros({ ...ing, unitType: 'unit' }, 3).kcal).toBe(300);
  });

  it('coerces string nutrient values (PostgREST numerics) to numbers', () => {
    const strIng: CoreIngredient = {
      unitType: 'gram',
      kcalPerUnit: '100',
      proteinGPerUnit: '10',
      carbsGPerUnit: '5',
      fatGPerUnit: '2',
      fiberGPerUnit: '1',
    };
    expect(ingredientMacros(strIng, 100).kcal).toBe(100);
  });

  it('treats null fiber as 0', () => {
    expect(ingredientMacros({ ...ing, fiberGPerUnit: null }, 100).fiberG).toBe(0);
  });

  it('returns zeros for non-finite or non-positive quantity', () => {
    expect(ingredientMacros(ing, 0)).toEqual(ZERO_MACROS);
    expect(ingredientMacros(ing, -1)).toEqual(ZERO_MACROS);
    expect(ingredientMacros(ing, NaN)).toEqual(ZERO_MACROS);
  });
});

describe('computeRecipeMacros / recipePerServingMacros', () => {
  it('sums rows then divides totals by servings', () => {
    const recipe: CoreRecipe = {
      servings: 2,
      ingredients: [
        { quantity: 100, perServing: false, ingredient: ing },
        { quantity: 200, perServing: false, ingredient: ing },
      ],
    };
    const { total, perServing } = computeRecipeMacros(recipe);
    expect(total.kcal).toBe(300);
    expect(perServing.kcal).toBe(150);
    expect(recipePerServingMacros(recipe).kcal).toBe(150);
  });

  it('scales per_serving rows by servings before summing', () => {
    const recipe: CoreRecipe = {
      servings: 3,
      ingredients: [{ quantity: 10, perServing: true, ingredient: ing }],
    };
    expect(computeRecipeMacros(recipe).total.kcal).toBeCloseTo(30, 10);
    expect(recipePerServingMacros(recipe).kcal).toBeCloseTo(10, 10);
  });

  it('falls back to 1 serving when servings <= 0 and tolerates missing rows', () => {
    const recipe = { servings: 0 } as unknown as CoreRecipe;
    expect(recipePerServingMacros(recipe)).toEqual(ZERO_MACROS);
  });

  it('string servings (PostgREST numeric) coerces correctly', () => {
    const recipe: CoreRecipe = {
      servings: '2',
      ingredients: [{ quantity: '100', perServing: false, ingredient: ing }],
    };
    expect(computeRecipeMacros(recipe).perServing.kcal).toBe(50);
  });
});

describe('roundMacro', () => {
  it('rounds to one decimal place', () => {
    expect(roundMacro(1.24)).toBe(1.2);
    expect(roundMacro(1.25)).toBe(1.3);
    expect(roundMacro(199.999)).toBe(200);
    expect(roundMacro(0)).toBe(0);
  });
});
