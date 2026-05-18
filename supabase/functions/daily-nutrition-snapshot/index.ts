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
  type CoreIngredient,
  type CoreRecipe,
  type Macros,
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
  recipe: RecipeRow | null;
  ingredient: IngredientRow | null;
}

const RECIPE_SELECT =
  'recipe:recipes(servings, recipe_ingredients(quantity, per_serving, ingredient:ingredients(unit_type, kcal_per_unit, protein_g_per_unit, carbs_g_per_unit, fat_g_per_unit, fiber_g_per_unit)))';

const INGREDIENT_SELECT =
  'ingredient:ingredients(unit_type, kcal_per_unit, protein_g_per_unit, carbs_g_per_unit, fat_g_per_unit, fiber_g_per_unit)';

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
      const { planned, hadActivePlan } = await computePlanned(supabase, profile.id, targetDate);
      const consumed = await computeConsumed(supabase, profile.id, targetDate);

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
): Promise<{ planned: Macros | null; hadActivePlan: boolean }> {
  const { data: weeks, error: weekError } = await supabase
    .from('meal_plan_weeks')
    .select('id')
    .eq('user_id', userId)
    .lte('week_start', date)
    .order('week_start', { ascending: false })
    .limit(1);
  if (weekError) throw weekError;
  if (!weeks || weeks.length === 0) return { planned: null, hadActivePlan: false };

  const { data: slots, error: slotsError } = await supabase
    .from('meal_plan_week_slots')
    .select(`servings, ${RECIPE_SELECT}`)
    .eq('plan_week_id', weeks[0].id)
    .eq('date', date);
  if (slotsError) throw slotsError;
  if (!slots || slots.length === 0) return { planned: null, hadActivePlan: false };

  let total: Macros = ZERO_MACROS;
  for (const slot of slots as unknown as SlotRow[]) {
    if (!slot.recipe) continue;
    const perServing = recipePerServingMacros(toCoreRecipe(slot.recipe));
    total = add(total, scale(perServing, Number(slot.servings)));
  }
  return { planned: total, hadActivePlan: true };
}

async function computeConsumed(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  date: string,
): Promise<Macros | null> {
  const { data: logs, error } = await supabase
    .from('meal_logs')
    .select(
      `servings, quantity, custom_kcal, custom_protein_g, custom_carbs_g, custom_fat_g, custom_fiber_g, ${RECIPE_SELECT}, ${INGREDIENT_SELECT}`,
    )
    .eq('user_id', userId)
    .eq('logged_on', date);
  if (error) throw error;
  if (!logs || logs.length === 0) return null;

  let total: Macros = ZERO_MACROS;
  for (const log of logs as unknown as MealLogRow[]) {
    if (log.recipe) {
      total = add(
        total,
        scale(recipePerServingMacros(toCoreRecipe(log.recipe)), Number(log.servings ?? 1)),
      );
    } else if (log.ingredient && log.quantity != null) {
      total = add(total, ingredientMacros(toCoreIngredient(log.ingredient), Number(log.quantity)));
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
    }
  }
  return total;
}
