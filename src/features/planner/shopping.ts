// Pure shopping-list aggregation for the planned week.
//
// You cook a recipe in WHOLE batches (a 5-serving curry can't be cooked
// 2/5ths), so for each recipe we sum the servings planned across the week,
// divide by the recipe's yield and round UP to whole batches, then shop for
// that many full recipes. Per-batch ingredient amounts follow the same rule
// as `@/core/macros`: a non-`per_serving` line's `quantity` IS the
// whole-batch amount; a `per_serving` line is `quantity × recipeServings`
// per batch. Dependency-free + deterministic → unit-tested (R-16 Tier-1).

export interface ShoppingSlotInput {
  recipeId: string;
  recipeName: string;
  /** The recipe's own `servings` yield per batch. */
  recipeServings: number;
  /** Servings of this recipe the planned slot calls for. */
  slotServings: number;
  ingredients: Array<{
    ingredientId: string;
    name: string;
    brand: string | null;
    unitType: string;
    quantity: number;
    perServing: boolean;
  }>;
}

export interface RecipeShoppingIngredient {
  ingredientId: string;
  name: string;
  brand: string | null;
  unitType: string;
  /** Raw (unrounded) amount to buy/cook for `batches` whole recipes. */
  quantity: number;
}

export interface RecipeShopping {
  recipeId: string;
  recipeName: string;
  /** Servings planned across the week. */
  consumedServings: number;
  /** The recipe's yield per batch. */
  recipeServings: number;
  /** Whole recipes to cook = ceil(consumed / yield). */
  batches: number;
  /** batches × recipeServings. */
  producedServings: number;
  /** producedServings − consumedServings (≥ 0). */
  leftoverServings: number;
  ingredients: RecipeShoppingIngredient[];
}

export interface ShoppingItem {
  ingredientId: string;
  name: string;
  brand: string | null;
  unitType: string;
  totalQuantity: number;
}

/** Grams round to whole units; per-unit ingredients keep one decimal. */
export function roundShoppingQuantity(qty: number, unitType: string): number {
  if (unitType === 'unit') return Math.round(qty * 10) / 10;
  return Math.round(qty);
}

interface Acc {
  recipeName: string;
  recipeServings: number;
  consumed: number;
  /** Ingredient definition taken once per recipe (identical across its slots). */
  lines: ShoppingSlotInput['ingredients'];
  order: number;
}

export function buildRecipeShopping(
  slots: ShoppingSlotInput[],
): RecipeShopping[] {
  const byRecipe = new Map<string, Acc>();
  let order = 0;

  for (const slot of slots) {
    const rs =
      Number(slot.recipeServings) > 0 ? Number(slot.recipeServings) : 1;
    const ss = Number(slot.slotServings);
    const existing = byRecipe.get(slot.recipeId);
    if (existing) {
      if (Number.isFinite(ss) && ss > 0) existing.consumed += ss;
    } else {
      byRecipe.set(slot.recipeId, {
        recipeName: slot.recipeName,
        recipeServings: rs,
        consumed: Number.isFinite(ss) && ss > 0 ? ss : 0,
        lines: slot.ingredients,
        order: order++,
      });
    }
  }

  const out: RecipeShopping[] = [];
  for (const [recipeId, a] of byRecipe) {
    if (a.consumed <= 0) continue;
    const batches = Math.ceil(a.consumed / a.recipeServings);
    const producedServings = batches * a.recipeServings;

    const ingredients: RecipeShoppingIngredient[] = [];
    for (const l of a.lines) {
      const q = Number(l.quantity);
      if (!Number.isFinite(q) || q <= 0) continue;
      const perBatch = l.perServing ? q * a.recipeServings : q;
      ingredients.push({
        ingredientId: l.ingredientId,
        name: l.name,
        brand: l.brand,
        unitType: l.unitType,
        quantity: perBatch * batches,
      });
    }

    out.push({
      recipeId,
      recipeName: a.recipeName,
      consumedServings: a.consumed,
      recipeServings: a.recipeServings,
      batches,
      producedServings,
      leftoverServings: producedServings - a.consumed,
      ingredients,
    });
  }

  return out.sort(
    (x, y) =>
      x.recipeName.localeCompare(y.recipeName) ||
      x.recipeId.localeCompare(y.recipeId),
  );
}

/**
 * Flatten the per-recipe (already batch-scaled, raw) amounts into one
 * deduplicated buy list. Sums raw, rounds once, drops hidden
 * "always have it" staples and any non-positive total.
 */
export function aggregateTotals(
  recipes: RecipeShopping[],
  hiddenIngredientIds: Set<string> = new Set(),
): ShoppingItem[] {
  const acc = new Map<string, ShoppingItem>();

  for (const r of recipes) {
    for (const ing of r.ingredients) {
      if (hiddenIngredientIds.has(ing.ingredientId)) continue;
      const existing = acc.get(ing.ingredientId);
      if (existing) {
        existing.totalQuantity += ing.quantity;
      } else {
        acc.set(ing.ingredientId, {
          ingredientId: ing.ingredientId,
          name: ing.name,
          brand: ing.brand,
          unitType: ing.unitType,
          totalQuantity: ing.quantity,
        });
      }
    }
  }

  return [...acc.values()]
    .map((item) => ({
      ...item,
      totalQuantity: roundShoppingQuantity(item.totalQuantity, item.unitType),
    }))
    .filter((item) => item.totalQuantity > 0)
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        (a.brand ?? '').localeCompare(b.brand ?? ''),
    );
}
