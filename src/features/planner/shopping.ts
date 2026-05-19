// Pure shopping-list aggregation for the planned week. Mirrors the
// `@/core/macros` per-serving scaling rule exactly (non-`per_serving` lines
// divide across the recipe's servings; `per_serving` lines are counted whole
// per plate) so a planned slot's grocery quantities stay consistent with how
// the same recipe's macros are computed. Dependency-free + deterministic so
// it is unit-tested in isolation (R-16 Tier-1).

export interface ShoppingSlotInput {
  /** The recipe's own `servings` count. */
  recipeServings: number;
  /** How many servings of this recipe the planned slot calls for. */
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

export function aggregateShoppingList(
  slots: ShoppingSlotInput[],
): ShoppingItem[] {
  const acc = new Map<string, ShoppingItem>();

  for (const slot of slots) {
    const recipeServings =
      Number(slot.recipeServings) > 0 ? Number(slot.recipeServings) : 1;
    const slotServings = Number(slot.slotServings);
    if (!Number.isFinite(slotServings) || slotServings <= 0) continue;

    for (const ri of slot.ingredients) {
      const qty = Number(ri.quantity);
      if (!Number.isFinite(qty) || qty <= 0) continue;

      const perServingAmount = ri.perServing ? qty : qty / recipeServings;
      const contribution = perServingAmount * slotServings;
      if (contribution <= 0) continue;

      const existing = acc.get(ri.ingredientId);
      if (existing) {
        existing.totalQuantity += contribution;
      } else {
        acc.set(ri.ingredientId, {
          ingredientId: ri.ingredientId,
          name: ri.name,
          brand: ri.brand,
          unitType: ri.unitType,
          totalQuantity: contribution,
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
