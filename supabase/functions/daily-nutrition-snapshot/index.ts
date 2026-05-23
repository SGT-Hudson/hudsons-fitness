// daily-nutrition-snapshot
//
// Cron: 0 1 * * * UTC (≈ 02:00 CET / 03:00 CEST).
//
// For each profile, calls the shared `materialize_plan_for_date` SECURITY
// INVOKER RPC (R-12 / D-D6 — the single source of truth, same RPC the Diario
// page calls) so days that were never opened still get from_plan meal_logs
// created, then computes planned vs consumed macros for previousDayInTZ
// (Madrid) and upserts into public.daily_nutrition_history. POST body may
// include `{ "date": "YYYY-MM-DD" }` to recompute a specific day; otherwise
// defaults to yesterday.
//
// Macro/date math comes from the shared pure camelCase core via
// `../_shared/macros.ts` (D-F3 / R-17). snake_case appears ONLY at the
// `daily_nutrition_history` write boundary, via `toSnakeMacros`.

// Version pinned once in supabase/functions/deno.json (D-F3 / R-17).
import { createClient } from '@supabase/supabase-js';
import {
  add,
  ingredientMacros,
  previousDayInTZ,
  recipePerServingMacros,
  scale,
  toSnakeMacros,
  ZERO_MACROS,
  EMPTY_SNAKE,
  addSub,
  ingredientSub,
  scaleSub,
  computeRecipeSub,
  isComplete,
  ZERO_SUB,
  type CoreIngredient,
  type CoreIngredientSub,
  type CoreRecipe,
  type CoreRecipeSub,
  type Macros,
  type SubMacros,
  type PartialSub,
  type Numeric,
} from '../_shared/macros.ts';

// snake_case row shapes as PostgREST returns them, plus a mapper into the
// camelCase core shape (the core is runtime-agnostic; the DB rows are snake).
interface IngredientRow {
  unit_type: string;
  kcal_per_unit: Numeric;
  protein_g_per_unit: Numeric;
  carbs_g_per_unit: Numeric;
  fat_g_per_unit: Numeric;
  fiber_g_per_unit: Numeric | null;
  sugar_g_per_unit?: Numeric | null;
  saturated_fat_g_per_unit?: Numeric | null;
}

interface RecipeIngredientRow {
  quantity: Numeric;
  per_serving: boolean;
  ingredient: IngredientRow;
}

interface RecipeRow {
  servings: Numeric;
  recipe_ingredients: RecipeIngredientRow[];
}

function toCoreIngredient(ing: IngredientRow): CoreIngredient {
  return {
    unitType: ing.unit_type,
    kcalPerUnit: ing.kcal_per_unit,
    proteinGPerUnit: ing.protein_g_per_unit,
    carbsGPerUnit: ing.carbs_g_per_unit,
    fatGPerUnit: ing.fat_g_per_unit,
    fiberGPerUnit: ing.fiber_g_per_unit,
  };
}

function toCoreRecipe(recipe: RecipeRow): CoreRecipe {
  return {
    servings: recipe.servings,
    ingredients: (recipe.recipe_ingredients ?? []).map((ri) => ({
      quantity: ri.quantity,
      perServing: ri.per_serving,
      ingredient: toCoreIngredient(ri.ingredient),
    })),
  };
}

// --- U-1 sub-macro mappers (parallel to the macro ones above) ---------------
function toCoreIngredientSub(ing: IngredientRow): CoreIngredientSub {
  return {
    unitType: ing.unit_type,
    sugarGPerUnit: ing.sugar_g_per_unit ?? null,
    satFatGPerUnit: ing.saturated_fat_g_per_unit ?? null,
  };
}

function toCoreRecipeSub(recipe: RecipeRow): CoreRecipeSub {
  return {
    servings: recipe.servings,
    ingredients: (recipe.recipe_ingredients ?? []).map((ri) => ({
      quantity: ri.quantity,
      perServing: ri.per_serving,
      ingredient: toCoreIngredientSub(ri.ingredient),
    })),
  };
}

function recipePerServingSub(recipe: RecipeRow): SubMacros {
  return computeRecipeSub(toCoreRecipeSub(recipe)).perServing;
}

/** Custom-log value → PartialSub: null = unknown (missing 1). */
function customSubField(v: Numeric | null): PartialSub {
  return v === null || v === undefined ? { known: 0, missing: 1 } : { known: Number(v), missing: 0 };
}

interface SlotRow {
  servings: Numeric;
  recipe: RecipeRow | null;
}

interface MealLogRow {
  servings: Numeric | null;
  quantity: Numeric | null;
  custom_kcal: Numeric | null;
  custom_protein_g: Numeric | null;
  custom_carbs_g: Numeric | null;
  custom_fat_g: Numeric | null;
  custom_fiber_g: Numeric | null;
  custom_sugar_g: Numeric | null;
  custom_saturated_fat_g: Numeric | null;
  recipe: RecipeRow | null;
  ingredient: IngredientRow | null;
}

const RECIPE_SELECT =
  'recipe:recipes(servings, recipe_ingredients(quantity, per_serving, ingredient:ingredients(unit_type, kcal_per_unit, protein_g_per_unit, carbs_g_per_unit, fat_g_per_unit, fiber_g_per_unit, sugar_g_per_unit, saturated_fat_g_per_unit)))';

const INGREDIENT_SELECT =
  'ingredient:ingredients(unit_type, kcal_per_unit, protein_g_per_unit, carbs_g_per_unit, fat_g_per_unit, fiber_g_per_unit, sugar_g_per_unit, saturated_fat_g_per_unit)';

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let body: { date?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const targetDate = body.date ?? previousDayInTZ();

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id');
  if (profilesError) {
    return new Response(JSON.stringify({ error: profilesError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results: Array<{
    user_id: string;
    ok: boolean;
    materialized?: number;
    error?: string;
  }> = [];

  for (const profile of profiles ?? []) {
    try {
      // Single source of truth for materialization: the
      // `materialize_plan_for_date` SECURITY INVOKER RPC (R-12 / D-D6),
      // shared with the client. Called here via the service-role client
      // with an explicit per-profile p_user_id. The prior hand-mirrored
      // Deno copy of the materialization logic is removed.
      const { data: materialized, error: materializeError } = await supabase.rpc(
        'materialize_plan_for_date',
        { p_user_id: profile.id, p_date: targetDate },
      );
      if (materializeError) throw materializeError;
      const { planned, plannedSub, hadActivePlan } = await computePlanned(
        supabase,
        profile.id,
        targetDate,
      );
      const { consumed, consumedSub } = await computeConsumed(supabase, profile.id, targetDate);

      // snake_case appears ONLY here — the DB write boundary (D-F3 / D-C4).
      const plannedSnake = planned ? toSnakeMacros(planned) : null;
      const consumedSnake = consumed ? toSnakeMacros(consumed) : null;

      const { error: upsertError } = await supabase
        .from('daily_nutrition_history')
        .upsert(
          {
            user_id: profile.id,
            logged_on: targetDate,
            planned_kcal: plannedSnake?.kcal ?? null,
            planned_protein_g: plannedSnake?.protein_g ?? null,
            planned_carbs_g: plannedSnake?.carbs_g ?? null,
            planned_fat_g: plannedSnake?.fat_g ?? null,
            planned_fiber_g: plannedSnake?.fiber_g ?? null,
            consumed_kcal: consumedSnake?.kcal ?? null,
            consumed_protein_g: consumedSnake?.protein_g ?? null,
            consumed_carbs_g: consumedSnake?.carbs_g ?? null,
            consumed_fat_g: consumedSnake?.fat_g ?? null,
            consumed_fiber_g: consumedSnake?.fiber_g ?? null,
            // U-1: known-sum grams + per-field completeness flag (NULL grams +
            // complete=true when there was nothing to sum).
            planned_sugar_g: plannedSub ? plannedSub.sugarG.known : null,
            planned_sugar_complete: plannedSub ? isComplete(plannedSub.sugarG) : true,
            planned_saturated_fat_g: plannedSub ? plannedSub.satFatG.known : null,
            planned_saturated_fat_complete: plannedSub ? isComplete(plannedSub.satFatG) : true,
            consumed_sugar_g: consumedSub ? consumedSub.sugarG.known : null,
            consumed_sugar_complete: consumedSub ? isComplete(consumedSub.sugarG) : true,
            consumed_saturated_fat_g: consumedSub ? consumedSub.satFatG.known : null,
            consumed_saturated_fat_complete: consumedSub ? isComplete(consumedSub.satFatG) : true,
            had_active_plan: hadActivePlan,
            computed_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,logged_on' },
        );
      if (upsertError) throw upsertError;
      results.push({
        user_id: profile.id,
        ok: true,
        materialized: typeof materialized === 'number' ? materialized : 0,
      });
    } catch (err) {
      results.push({
        user_id: profile.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return new Response(JSON.stringify({ date: targetDate, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// NOTE (R-12 / D-D6): the server-side mirror of `materializePlanForDate`
// that used to live here was deleted. Materialization is now the single
// `materialize_plan_for_date` SECURITY INVOKER RPC, called above via the
// service-role client. `computePlanned` / `computeConsumed` (the read-only
// macro aggregation) stay edge-side.

async function computePlanned(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  date: string,
): Promise<{ planned: Macros | null; plannedSub: SubMacros | null; hadActivePlan: boolean }> {
  const { data: weeks, error: weekError } = await supabase
    .from('meal_plan_weeks')
    .select('id')
    .eq('user_id', userId)
    .lte('week_start', date)
    .order('week_start', { ascending: false })
    .limit(1);
  if (weekError) throw weekError;
  if (!weeks || weeks.length === 0)
    return { planned: null, plannedSub: null, hadActivePlan: false };

  const { data: slots, error: slotsError } = await supabase
    .from('meal_plan_week_slots')
    .select(`servings, ${RECIPE_SELECT}`)
    .eq('plan_week_id', weeks[0].id)
    .eq('date', date);
  if (slotsError) throw slotsError;
  if (!slots || slots.length === 0)
    return { planned: null, plannedSub: null, hadActivePlan: false };

  let total: Macros = ZERO_MACROS;
  let totalSub: SubMacros = ZERO_SUB;
  for (const slot of slots as unknown as SlotRow[]) {
    if (!slot.recipe) continue;
    const servings = Number(slot.servings);
    total = add(total, scale(recipePerServingMacros(toCoreRecipe(slot.recipe)), servings));
    totalSub = addSub(totalSub, scaleSub(recipePerServingSub(slot.recipe), servings));
  }
  return { planned: total, plannedSub: totalSub, hadActivePlan: true };
}

async function computeConsumed(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  date: string,
): Promise<{ consumed: Macros | null; consumedSub: SubMacros | null }> {
  const { data: logs, error } = await supabase
    .from('meal_logs')
    .select(
      `servings, quantity, custom_kcal, custom_protein_g, custom_carbs_g, custom_fat_g, custom_fiber_g, custom_sugar_g, custom_saturated_fat_g, ${RECIPE_SELECT}, ${INGREDIENT_SELECT}`,
    )
    .eq('user_id', userId)
    .eq('logged_on', date);
  if (error) throw error;
  if (!logs || logs.length === 0) return { consumed: null, consumedSub: null };

  let total: Macros = ZERO_MACROS;
  let totalSub: SubMacros = ZERO_SUB;
  for (const log of logs as unknown as MealLogRow[]) {
    if (log.recipe) {
      const servings = Number(log.servings ?? 1);
      total = add(total, scale(recipePerServingMacros(toCoreRecipe(log.recipe)), servings));
      totalSub = addSub(totalSub, scaleSub(recipePerServingSub(log.recipe), servings));
    } else if (log.ingredient && log.quantity != null) {
      const qty = Number(log.quantity);
      total = add(total, ingredientMacros(toCoreIngredient(log.ingredient), qty));
      totalSub = addSub(totalSub, ingredientSub(toCoreIngredientSub(log.ingredient), qty));
    } else {
      // custom log line: snake_case columns → camelCase core envelope.
      const empty = EMPTY_SNAKE;
      total = add(total, {
        kcal: Number(log.custom_kcal ?? empty.kcal),
        proteinG: Number(log.custom_protein_g ?? empty.protein_g),
        carbsG: Number(log.custom_carbs_g ?? empty.carbs_g),
        fatG: Number(log.custom_fat_g ?? empty.fat_g),
        fiberG: Number(log.custom_fiber_g ?? empty.fiber_g),
      });
      totalSub = addSub(totalSub, {
        sugarG: customSubField(log.custom_sugar_g),
        satFatG: customSubField(log.custom_saturated_fat_g),
      });
    }
  }
  return { consumed: total, consumedSub: totalSub };
}
