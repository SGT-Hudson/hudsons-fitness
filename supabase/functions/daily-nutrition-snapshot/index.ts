// daily-nutrition-snapshot
//
// Cron: 0 1 * * * UTC (≈ 02:00 CET / 03:00 CEST).
//
// For each profile, computes planned vs consumed macros for `previousDayInTZ`
// (Madrid) and upserts into public.daily_nutrition_history. POST body may
// include `{ "date": "YYYY-MM-DD" }` to recompute a specific day; otherwise
// defaults to yesterday.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  add,
  ingredientMacros,
  previousDayInTZ,
  recipePerServingMacros,
  scale,
  ZERO,
  type MacrosTotals,
  type RecipeRow,
} from '../_shared/macros.ts';

interface SlotRow {
  servings: number | string;
  recipe: RecipeRow | null;
}

interface MealLogRow {
  servings: number | string | null;
  quantity: number | string | null;
  custom_kcal: number | string | null;
  custom_protein_g: number | string | null;
  custom_carbs_g: number | string | null;
  custom_fat_g: number | string | null;
  custom_fiber_g: number | string | null;
  recipe: RecipeRow | null;
  ingredient:
    | {
        unit_type: string;
        kcal_per_unit: number | string;
        protein_g_per_unit: number | string;
        carbs_g_per_unit: number | string;
        fat_g_per_unit: number | string;
        fiber_g_per_unit: number | string | null;
      }
    | null;
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

  const results: Array<{ user_id: string; ok: boolean; error?: string }> = [];

  for (const profile of profiles ?? []) {
    try {
      const { planned, hadActivePlan } = await computePlanned(supabase, profile.id, targetDate);
      const consumed = await computeConsumed(supabase, profile.id, targetDate);

      const { error: upsertError } = await supabase
        .from('daily_nutrition_history')
        .upsert(
          {
            user_id: profile.id,
            logged_on: targetDate,
            planned_kcal: planned?.kcal ?? null,
            planned_protein_g: planned?.protein_g ?? null,
            planned_carbs_g: planned?.carbs_g ?? null,
            planned_fat_g: planned?.fat_g ?? null,
            planned_fiber_g: planned?.fiber_g ?? null,
            consumed_kcal: consumed?.kcal ?? null,
            consumed_protein_g: consumed?.protein_g ?? null,
            consumed_carbs_g: consumed?.carbs_g ?? null,
            consumed_fat_g: consumed?.fat_g ?? null,
            consumed_fiber_g: consumed?.fiber_g ?? null,
            had_active_plan: hadActivePlan,
            computed_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,logged_on' },
        );
      if (upsertError) throw upsertError;
      results.push({ user_id: profile.id, ok: true });
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

async function computePlanned(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  date: string,
): Promise<{ planned: MacrosTotals | null; hadActivePlan: boolean }> {
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

  let total = ZERO;
  for (const slot of slots as unknown as SlotRow[]) {
    if (!slot.recipe) continue;
    const perServing = recipePerServingMacros(slot.recipe);
    total = add(total, scale(perServing, Number(slot.servings)));
  }
  return { planned: total, hadActivePlan: true };
}

async function computeConsumed(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  date: string,
): Promise<MacrosTotals | null> {
  const { data: logs, error } = await supabase
    .from('meal_logs')
    .select(
      `servings, quantity, custom_kcal, custom_protein_g, custom_carbs_g, custom_fat_g, custom_fiber_g, ${RECIPE_SELECT}, ${INGREDIENT_SELECT}`,
    )
    .eq('user_id', userId)
    .eq('logged_on', date);
  if (error) throw error;
  if (!logs || logs.length === 0) return null;

  let total = ZERO;
  for (const log of logs as unknown as MealLogRow[]) {
    if (log.recipe) {
      total = add(total, scale(recipePerServingMacros(log.recipe), Number(log.servings ?? 1)));
    } else if (log.ingredient && log.quantity != null) {
      total = add(total, ingredientMacros(log.ingredient, Number(log.quantity)));
    } else {
      total = add(total, {
        kcal: Number(log.custom_kcal ?? 0),
        protein_g: Number(log.custom_protein_g ?? 0),
        carbs_g: Number(log.custom_carbs_g ?? 0),
        fat_g: Number(log.custom_fat_g ?? 0),
        fiber_g: Number(log.custom_fiber_g ?? 0),
      });
    }
  }
  return total;
}
