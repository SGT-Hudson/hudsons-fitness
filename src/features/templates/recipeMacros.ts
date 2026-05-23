import { supabase } from '@/lib/supabase';
import { computeRecipeMacros, type Macros } from '@/features/recipes/macros';

/** Per-serving macros for each recipe id, computed from its ingredients. */
export async function fetchRecipeMacrosByIds(ids: string[]): Promise<Map<string, Macros>> {
  const out = new Map<string, Macros>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase
    .from('recipes')
    .select(
      `id, servings,
       recipe_ingredients (
         quantity, per_serving,
         ingredient:ingredients (
           unit_type, kcal_per_unit, protein_g_per_unit,
           carbs_g_per_unit, fat_g_per_unit, fiber_g_per_unit
         )
       )`,
    )
    .in('id', ids);
  if (error) throw error;
  for (const r of (data ?? []) as unknown as Array<{
    id: string; servings: number;
    recipe_ingredients: Array<{ quantity: number; per_serving: boolean; ingredient: any }>;
  }>) {
    const rows = (r.recipe_ingredients ?? []).map((ri) => {
      const ing = Array.isArray(ri.ingredient) ? ri.ingredient[0] : ri.ingredient;
      return {
        quantity: Number(ri.quantity),
        perServing: ri.per_serving,
        ingredient: {
          unit_type: ing?.unit_type ?? 'g',
          kcal_per_unit: Number(ing?.kcal_per_unit ?? 0),
          protein_g_per_unit: Number(ing?.protein_g_per_unit ?? 0),
          carbs_g_per_unit: Number(ing?.carbs_g_per_unit ?? 0),
          fat_g_per_unit: Number(ing?.fat_g_per_unit ?? 0),
          fiber_g_per_unit: Number(ing?.fiber_g_per_unit ?? 0),
        },
      };
    });
    const servings = Number(r.servings) > 0 ? Number(r.servings) : 1;
    out.set(r.id, computeRecipeMacros({ servings, rows }).perServing);
  }
  return out;
}
