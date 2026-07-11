import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';
import { computeRecipeMacros, type Macros } from '@/features/recipes/macros';
import type { AppendRow } from '@/features/planning/appendMeal';
import type { TemplatePhase } from '@/features/templates/api';
import type { ShoppingSlotInput } from './shopping';

export type PlanWeek = Tables<'meal_plan_weeks'>;
export type PlanWeekSlot = Tables<'meal_plan_week_slots'>;

export interface WeekSlotWithRecipe {
  id: string;
  date: string;
  meal_index: number;
  meal_time: string | null;
  recipe_id: string;
  recipe_name: string;
  servings: number;
  display_order: number;
  macros: Macros; // U-5: per-slot macros (recipe per-serving × servings)
}

export interface ActiveWeek {
  id: string;
  week_start: string;
  source_template_id: string | null;
  source_template_name: string | null;
  has_diverged: boolean;
  meal_times: string[];
  slots: WeekSlotWithRecipe[];
}

export async function fetchActiveWeek(
  userId: string,
  weekStart: string,
): Promise<ActiveWeek | null> {
  const { data, error } = await supabase
    .from('meal_plan_weeks')
    .select(
      `id, week_start, source_template_id, has_diverged,
       source_template:meal_plan_templates (id, name, default_meal_times),
       meal_plan_week_slots (
         id, date, meal_index, meal_time, recipe_id, servings, display_order,
         recipe:recipes (
           id, name, servings,
           recipe_ingredients (
             quantity, per_serving,
             ingredient:ingredients (
               unit_type, kcal_per_unit, protein_g_per_unit,
               carbs_g_per_unit, fat_g_per_unit, fiber_g_per_unit
             )
           )
         )
       )`,
    )
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  interface RawIng {
    unit_type: string;
    kcal_per_unit: number;
    protein_g_per_unit: number;
    carbs_g_per_unit: number;
    fat_g_per_unit: number;
    fiber_g_per_unit: number;
  }
  interface RawRi {
    quantity: number;
    per_serving: boolean;
    ingredient: RawIng | RawIng[] | null;
  }
  interface RawRecipe {
    id: string;
    name: string;
    servings: number;
    recipe_ingredients: RawRi[];
  }
  interface RawSlot {
    id: string;
    date: string;
    meal_index: number;
    meal_time: string | null;
    recipe_id: string;
    servings: number;
    display_order: number;
    recipe: RawRecipe | RawRecipe[] | null;
  }
  const raw = data as unknown as {
    id: string;
    week_start: string;
    source_template_id: string | null;
    has_diverged: boolean;
    source_template:
      | { id: string; name: string; default_meal_times: string[] }
      | { id: string; name: string; default_meal_times: string[] }[]
      | null;
    meal_plan_week_slots: RawSlot[];
  };
  const tpl = Array.isArray(raw.source_template) ? raw.source_template[0] : raw.source_template;
  return {
    id: raw.id,
    week_start: raw.week_start,
    meal_times: tpl?.default_meal_times ?? [],
    source_template_id: raw.source_template_id,
    source_template_name: tpl?.name ?? null,
    has_diverged: raw.has_diverged,
    slots: raw.meal_plan_week_slots
      .map((s) => {
        const recipe = Array.isArray(s.recipe) ? s.recipe[0] : s.recipe;
        const recipeServings = Number(recipe?.servings) > 0 ? Number(recipe?.servings) : 1;
        const rows = (recipe?.recipe_ingredients ?? []).map((ri) => {
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
        const perServing = computeRecipeMacros({ servings: recipeServings, rows }).perServing;
        const slotServings = Number(s.servings);
        const macros = {
          kcal: perServing.kcal * slotServings,
          proteinG: perServing.proteinG * slotServings,
          carbsG: perServing.carbsG * slotServings,
          fatG: perServing.fatG * slotServings,
          fiberG: perServing.fiberG * slotServings,
        };
        return {
          id: s.id,
          date: s.date,
          meal_index: s.meal_index,
          meal_time: s.meal_time,
          recipe_id: s.recipe_id,
          recipe_name: recipe?.name ?? '?',
          servings: slotServings,
          display_order: s.display_order,
          macros,
        };
      })
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.meal_index - b.meal_index ||
          a.display_order - b.display_order,
      ),
  };
}

// Pulls one week's planned slots with everything the pure shopping
// aggregator needs (recipe servings + each ingredient line's
// quantity/per_serving + the ingredient's display fields). Read-only,
// RLS-scoped to the user; returns null when no week exists yet.
export async function fetchWeekShopping(
  userId: string,
  weekStart: string,
): Promise<ShoppingSlotInput[] | null> {
  const { data, error } = await supabase
    .from('meal_plan_weeks')
    .select(
      `id,
       meal_plan_week_slots (
         servings,
         recipe:recipes (
           id, name, servings,
           recipe_ingredients (
             quantity, per_serving,
             ingredient:ingredients (id, name, brand, unit_type)
           )
         )
       )`,
    )
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  interface RawIng {
    id: string;
    name: string;
    brand: string | null;
    unit_type: string;
  }
  interface RawRi {
    quantity: number;
    per_serving: boolean;
    ingredient: RawIng | RawIng[] | null;
  }
  interface RawRecipe {
    id: string;
    name: string;
    servings: number;
    recipe_ingredients: RawRi[];
  }
  interface RawSlot {
    servings: number;
    recipe: RawRecipe | RawRecipe[] | null;
  }
  const raw = data as unknown as { meal_plan_week_slots: RawSlot[] };

  return raw.meal_plan_week_slots.flatMap((s) => {
    const recipe = Array.isArray(s.recipe) ? s.recipe[0] : s.recipe;
    if (!recipe) return [];
    return [
      {
        recipeId: recipe.id,
        recipeName: recipe.name,
        recipeServings: Number(recipe.servings),
        slotServings: Number(s.servings),
        ingredients: (recipe.recipe_ingredients ?? [])
          .map((ri) => {
            const ing = Array.isArray(ri.ingredient)
              ? ri.ingredient[0]
              : ri.ingredient;
            if (!ing) return null;
            return {
              ingredientId: ing.id,
              name: ing.name,
              brand: ing.brand,
              unitType: ing.unit_type,
              quantity: Number(ri.quantity),
              perServing: ri.per_serving,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null),
      } satisfies ShoppingSlotInput,
    ];
  });
}

export async function applyTemplateToWeek(
  templateId: string,
  targetDate: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('apply_template_to_week', {
    p_template_id: templateId,
    p_target_date: targetDate,
  });
  if (error) throw error;
  return data as string;
}

export async function saveWeekAsTemplate(
  weekId: string,
  name: string,
  phaseType: TemplatePhase | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('save_week_as_template', {
    p_week_id: weekId,
    p_name: name,
    p_phase_type: phaseType,
  });
  if (error) throw error;
  return data as string;
}

export async function addWeekSlot(input: {
  plan_week_id: string;
  date: string;
  meal_index: number;
  meal_time: string | null;
  recipe_id: string;
  servings: number;
  display_order: number;
}): Promise<PlanWeekSlot> {
  const { data, error } = await supabase
    .from('meal_plan_week_slots')
    .insert(input)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateWeekSlot(
  id: string,
  patch: { servings?: number; recipe_id?: string },
): Promise<PlanWeekSlot> {
  const { data, error } = await supabase
    .from('meal_plan_week_slots')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteWeekSlot(id: string): Promise<void> {
  const { error } = await supabase.from('meal_plan_week_slots').delete().eq('id', id);
  if (error) throw error;
}

export async function copyWeekMeal(input: {
  plan_week_id: string;
  source_date: string;
  meal_index: number;
  target_dates: string[];
}): Promise<void> {
  const { error } = await supabase.rpc('copy_week_meal', {
    p_plan_week_id: input.plan_week_id,
    p_source_date: input.source_date,
    p_meal_index: input.meal_index,
    p_target_dates: input.target_dates,
  });
  if (error) throw error;
}

/**
 * Append (rather than replace) a meal onto other days: a single-table,
 * single-statement multi-row insert — atomic, so no RPC is needed (hard
 * invariant 3 governs mutations spanning more than one table). Replace still
 * goes through the `copy_week_meal` RPC, which deletes before it inserts.
 */
export async function appendWeekMeal(rows: AppendRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from('meal_plan_week_slots').insert(rows);
  if (error) throw error;
}
