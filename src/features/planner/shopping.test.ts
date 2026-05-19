import { describe, expect, it } from 'vitest';
import {
  aggregateTotals,
  buildRecipeShopping,
  roundShoppingQuantity,
} from './shopping';
import type { ShoppingSlotInput } from './shopping';

function line(over: Partial<ShoppingSlotInput['ingredients'][number]> = {}) {
  return {
    ingredientId: 'i1',
    name: 'Arroz',
    brand: null,
    unitType: 'gram',
    quantity: 100,
    perServing: false,
    ...over,
  };
}

function slot(over: Partial<ShoppingSlotInput> = {}): ShoppingSlotInput {
  return {
    recipeId: 'r1',
    recipeName: 'Curry',
    recipeServings: 5,
    slotServings: 1,
    ingredients: [line()],
    ...over,
  };
}

describe('buildRecipeShopping', () => {
  it('cooks whole batches: consumed 7 of a 5-serving recipe → 2 batches, 3 leftover', () => {
    const [r] = buildRecipeShopping([
      slot({ slotServings: 7, ingredients: [line({ quantity: 500 })] }),
    ]);
    expect(r.consumedServings).toBe(7);
    expect(r.recipeServings).toBe(5);
    expect(r.batches).toBe(2);
    expect(r.producedServings).toBe(10);
    expect(r.leftoverServings).toBe(3);
    // normal line: whole-recipe quantity (500) × 2 batches
    expect(r.ingredients[0].quantity).toBe(1000);
  });

  it('scales a per_serving line by recipe servings × batches', () => {
    const [r] = buildRecipeShopping([
      slot({ slotServings: 7, ingredients: [line({ quantity: 70, perServing: true })] }),
    ]);
    // per batch = 70 × 5 servings; × 2 batches = 700
    expect(r.ingredients[0].quantity).toBe(700);
  });

  it('has zero leftover when consumption is an exact multiple of the yield', () => {
    const [r] = buildRecipeShopping([slot({ slotServings: 10 })]);
    expect(r.batches).toBe(2);
    expect(r.leftoverServings).toBe(0);
  });

  it('sums consumed servings across multiple slots of the same recipe', () => {
    const [r] = buildRecipeShopping([
      slot({ slotServings: 3 }),
      slot({ slotServings: 4 }),
    ]);
    expect(r.consumedServings).toBe(7);
    expect(r.batches).toBe(2);
  });

  it('guards recipeServings <= 0 to 1 (cook one batch per consumed serving)', () => {
    const [r] = buildRecipeShopping([slot({ recipeServings: 0, slotServings: 3 })]);
    expect(r.recipeServings).toBe(1);
    expect(r.batches).toBe(3);
  });

  it('drops recipes with no positive consumption and invalid ingredient lines', () => {
    const out = buildRecipeShopping([
      slot({ recipeId: 'zero', slotServings: 0 }), // nothing eaten → excluded
      slot({
        recipeId: 'r2',
        recipeName: 'Avena',
        slotServings: 2,
        ingredients: [line({ quantity: 0 }), line({ ingredientId: 'ok', quantity: 80 })],
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].recipeId).toBe('r2');
    expect(out[0].ingredients.map((i) => i.ingredientId)).toEqual(['ok']);
  });

  it('groups by recipe id and sorts by recipe name', () => {
    const out = buildRecipeShopping([
      slot({ recipeId: 'b', recipeName: 'Bowl', slotServings: 1 }),
      slot({ recipeId: 'a', recipeName: 'Avena', slotServings: 1 }),
    ]);
    expect(out.map((r) => r.recipeName)).toEqual(['Avena', 'Bowl']);
  });
});

describe('aggregateTotals', () => {
  it('sums the same ingredient across recipes (raw) then rounds, sorted by name', () => {
    const recipes = buildRecipeShopping([
      slot({
        recipeId: 'x',
        recipeName: 'X',
        recipeServings: 1,
        slotServings: 1,
        ingredients: [line({ ingredientId: 'i1', name: 'Arroz', quantity: 1000 })],
      }),
      slot({
        recipeId: 'y',
        recipeName: 'Y',
        recipeServings: 1,
        slotServings: 1,
        ingredients: [
          line({ ingredientId: 'i1', name: 'Arroz', quantity: 500 }),
          line({ ingredientId: 'i2', name: 'Zanahoria', quantity: 50 }),
        ],
      }),
    ]);
    const totals = aggregateTotals(recipes);
    expect(totals).toEqual([
      { ingredientId: 'i1', name: 'Arroz', brand: null, unitType: 'gram', totalQuantity: 1500 },
      { ingredientId: 'i2', name: 'Zanahoria', brand: null, unitType: 'gram', totalQuantity: 50 },
    ]);
  });

  it('excludes hidden (always-have-it) ingredients from the total', () => {
    const recipes = buildRecipeShopping([
      slot({
        recipeServings: 1,
        slotServings: 1,
        ingredients: [
          line({ ingredientId: 'salt', name: 'Sal', quantity: 5 }),
          line({ ingredientId: 'keep', name: 'Pollo', quantity: 200 }),
        ],
      }),
    ]);
    const totals = aggregateTotals(recipes, new Set(['salt']));
    expect(totals.map((t) => t.ingredientId)).toEqual(['keep']);
  });

  it('rounds grams to whole numbers and units to one decimal', () => {
    const recipes = buildRecipeShopping([
      slot({
        recipeId: 'r',
        recipeName: 'R',
        recipeServings: 3,
        slotServings: 1,
        ingredients: [
          line({ ingredientId: 'g', name: 'Harina', quantity: 700, perServing: true }),
          line({ ingredientId: 'u', name: 'Huevo', unitType: 'unit', quantity: 0.1, perServing: true }),
        ],
      }),
    ]);
    // batches=1, perServing → ×3 servings: harina 700*3=2100; huevo 0.1*3=0.3
    const totals = aggregateTotals(recipes);
    expect(totals.find((t) => t.ingredientId === 'g')!.totalQuantity).toBe(2100);
    expect(totals.find((t) => t.ingredientId === 'u')!.totalQuantity).toBe(0.3);
  });
});

describe('roundShoppingQuantity', () => {
  it('rounds gram quantities to whole numbers', () => {
    expect(roundShoppingQuantity(233.33, 'gram')).toBe(233);
  });
  it('rounds unit quantities to one decimal', () => {
    expect(roundShoppingQuantity(0.333, 'unit')).toBe(0.3);
  });
});
