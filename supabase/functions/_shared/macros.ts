// Server-side mirror of src/features/recipes/macros.ts and src/features/diario/macros.ts.
// Kept in snake_case so it lines up with the columns of daily_nutrition_history.

export interface MacrosTotals {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export const ZERO: MacrosTotals = {
  kcal: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fiber_g: 0,
};

export interface IngredientRow {
  unit_type: string;
  kcal_per_unit: number | string;
  protein_g_per_unit: number | string;
  carbs_g_per_unit: number | string;
  fat_g_per_unit: number | string;
  fiber_g_per_unit: number | string | null;
}

export interface RecipeIngredientRow {
  quantity: number | string;
  per_serving: boolean;
  ingredient: IngredientRow;
}

export interface RecipeRow {
  servings: number | string;
  recipe_ingredients: RecipeIngredientRow[];
}

export function add(a: MacrosTotals, b: MacrosTotals): MacrosTotals {
  return {
    kcal: a.kcal + b.kcal,
    protein_g: a.protein_g + b.protein_g,
    carbs_g: a.carbs_g + b.carbs_g,
    fat_g: a.fat_g + b.fat_g,
    fiber_g: a.fiber_g + b.fiber_g,
  };
}

export function scale(m: MacrosTotals, k: number): MacrosTotals {
  return {
    kcal: m.kcal * k,
    protein_g: m.protein_g * k,
    carbs_g: m.carbs_g * k,
    fat_g: m.fat_g * k,
    fiber_g: m.fiber_g * k,
  };
}

export function ingredientMacros(ing: IngredientRow, quantity: number): MacrosTotals {
  if (!Number.isFinite(quantity) || quantity <= 0) return ZERO;
  const divisor = ing.unit_type === 'unit' ? 1 : 100;
  const factor = quantity / divisor;
  return {
    kcal: Number(ing.kcal_per_unit) * factor,
    protein_g: Number(ing.protein_g_per_unit) * factor,
    carbs_g: Number(ing.carbs_g_per_unit) * factor,
    fat_g: Number(ing.fat_g_per_unit) * factor,
    fiber_g: Number(ing.fiber_g_per_unit ?? 0) * factor,
  };
}

export function recipePerServingMacros(recipe: RecipeRow): MacrosTotals {
  const servings = Number(recipe.servings) > 0 ? Number(recipe.servings) : 1;
  const total = (recipe.recipe_ingredients ?? []).reduce<MacrosTotals>((acc, ri) => {
    const qty = ri.per_serving ? Number(ri.quantity) * servings : Number(ri.quantity);
    return add(acc, ingredientMacros(ri.ingredient, qty));
  }, ZERO);
  return {
    kcal: total.kcal / servings,
    protein_g: total.protein_g / servings,
    carbs_g: total.carbs_g / servings,
    fat_g: total.fat_g / servings,
    fiber_g: total.fiber_g / servings,
  };
}

// Date in a given IANA timezone, formatted YYYY-MM-DD.
export function isoDateInTZ(date: Date, tz = 'Europe/Madrid'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function previousDayInTZ(tz = 'Europe/Madrid'): string {
  const today = isoDateInTZ(new Date(), tz);
  const [y, m, d] = today.split('-').map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d) - 86_400_000);
  return yesterday.toISOString().slice(0, 10);
}

export function mondayOfTodayInTZ(tz = 'Europe/Madrid'): string {
  const today = isoDateInTZ(new Date(), tz);
  const [y, m, d] = today.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dow = utc.getUTCDay(); // 0 Sun..6 Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(Date.UTC(y, m - 1, d + diff));
  return monday.toISOString().slice(0, 10);
}
