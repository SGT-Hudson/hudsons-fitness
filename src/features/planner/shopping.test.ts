import { describe, expect, it } from 'vitest';
import { aggregateShoppingList, roundShoppingQuantity } from './shopping';
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
    recipeServings: 1,
    slotServings: 1,
    ingredients: [line()],
    ...over,
  };
}

describe('aggregateShoppingList', () => {
  it('divides a non-per-serving line across the recipe servings, then scales by slot servings', () => {
    // 500 g rice in a 5-serving recipe, 2 servings planned → 500/5 * 2 = 200 g
    const result = aggregateShoppingList([
      slot({
        recipeServings: 5,
        slotServings: 2,
        ingredients: [line({ quantity: 500 })],
      }),
    ]);
    expect(result).toEqual([
      { ingredientId: 'i1', name: 'Arroz', brand: null, unitType: 'gram', totalQuantity: 200 },
    ]);
  });

  it('does NOT divide a per_serving line by recipe servings (counted per plate × slot servings)', () => {
    // 70 g rice per_serving in a 5-serving recipe, 2 servings planned → 70 * 2 = 140 g
    const result = aggregateShoppingList([
      slot({
        recipeServings: 5,
        slotServings: 2,
        ingredients: [line({ quantity: 70, perServing: true })],
      }),
    ]);
    expect(result[0].totalQuantity).toBe(140);
  });

  it('sums the same ingredient across multiple slots into one line', () => {
    const result = aggregateShoppingList([
      slot({ recipeServings: 1, slotServings: 1, ingredients: [line({ quantity: 100 })] }),
      slot({ recipeServings: 2, slotServings: 4, ingredients: [line({ quantity: 100 })] }),
    ]);
    // 100 + (100/2*4 = 200) = 300
    expect(result).toHaveLength(1);
    expect(result[0].totalQuantity).toBe(300);
  });

  it('rounds grams to whole numbers and units to one decimal', () => {
    const result = aggregateShoppingList([
      slot({
        recipeServings: 3,
        slotServings: 1,
        ingredients: [
          line({ ingredientId: 'g', name: 'Harina', quantity: 700 }), // 233.33 → 233
          line({ ingredientId: 'u', name: 'Huevo', unitType: 'unit', quantity: 1 }), // 0.333 → 0.3
        ],
      }),
    ]);
    const harina = result.find((r) => r.ingredientId === 'g')!;
    const huevo = result.find((r) => r.ingredientId === 'u')!;
    expect(harina.totalQuantity).toBe(233);
    expect(huevo.totalQuantity).toBe(0.3);
  });

  it('drops zero/invalid contributions and treats recipeServings <= 0 as 1', () => {
    const result = aggregateShoppingList([
      slot({ ingredients: [line({ quantity: 0 })] }), // contributes nothing → excluded
      slot({
        recipeServings: 0, // guarded to 1
        slotServings: 1,
        ingredients: [line({ ingredientId: 'x', name: 'Sal', quantity: 12 })],
      }),
    ]);
    expect(result).toEqual([
      { ingredientId: 'x', name: 'Sal', brand: null, unitType: 'gram', totalQuantity: 12 },
    ]);
  });

  it('sorts output by name then brand', () => {
    const result = aggregateShoppingList([
      slot({
        ingredients: [
          line({ ingredientId: 'b', name: 'Zanahoria', quantity: 50 }),
          line({ ingredientId: 'a', name: 'Ajo', quantity: 10 }),
          line({ ingredientId: 'c', name: 'Ajo', brand: 'Marca', quantity: 10 }),
        ],
      }),
    ]);
    expect(result.map((r) => r.ingredientId)).toEqual(['a', 'c', 'b']);
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
