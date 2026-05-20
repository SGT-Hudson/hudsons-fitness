import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database';
import type { Ingredient } from '@/features/ingredients/api';
import { computeRecipeMacros } from '@/features/recipes/macros';
import type { QuickAddRow } from './quickAdd';

export type MealLog = Tables<'meal_logs'>;
export type MealType = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'other';

export const MEAL_TYPE_ORDER: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner', 'other'];

// Maps meal_index -> meal_type. Mirrors the SQL array indexing inside the
// `materialize_plan_for_date` RPC; kept here only as the canonical reference
// for UI ordering (the RPC is the single source of truth for materialization).

export interface RecipeIngredientJoin {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
  per_serving: boolean;
  display_order: number;
  ingredient: Ingredient;
}

// R-01: `deleted_at` is gone from `recipes` (migration
// 20260520120030). Anon-owned recipes (creator-hidden) still resolve via
// the open pool SELECT — historical diary entries against them keep
// rendering correctly (the never-orphan invariant).
export interface RecipeForMealLog {
  id: string;
  name: string;
  servings: number;
  recipe_ingredients: RecipeIngredientJoin[];
}

export interface MealLogWithJoins extends MealLog {
  recipe: RecipeForMealLog | null;
  ingredient: Ingredient | null;
}

export async function fetchMealLogsForDay(
  userId: string,
  loggedOn: string,
): Promise<MealLogWithJoins[]> {
  const { data, error } = await supabase
    .from('meal_logs')
    .select(
      `*,
       recipe:recipes (
         id, name, servings,
         recipe_ingredients (
           id, recipe_id, ingredient_id, quantity, per_serving, display_order,
           ingredient:ingredients (*)
         )
       ),
       ingredient:ingredients (*)`,
    )
    .eq('user_id', userId)
    .eq('logged_on', loggedOn)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as MealLogWithJoins[];
}

export interface CreateMealLogInput {
  loggedOn: string;
  mealType: MealType;
  source:
    | { kind: 'recipe'; recipeId: string; servings: number }
    | { kind: 'ingredient'; ingredientId: string; quantity: number }
    | {
        kind: 'custom';
        name: string;
        kcal: number;
        proteinG: number | null;
        carbsG: number | null;
        fatG: number | null;
        fiberG: number | null;
      };
  notes: string | null;
}

export async function createMealLog(
  userId: string,
  input: CreateMealLogInput,
): Promise<MealLog> {
  const base: TablesInsert<'meal_logs'> = {
    user_id: userId,
    logged_on: input.loggedOn,
    meal_type: input.mealType,
    notes: input.notes,
    from_plan: false,
  };
  let payload: TablesInsert<'meal_logs'>;
  if (input.source.kind === 'recipe') {
    payload = {
      ...base,
      recipe_id: input.source.recipeId,
      servings: input.source.servings,
    };
  } else if (input.source.kind === 'ingredient') {
    payload = {
      ...base,
      ingredient_id: input.source.ingredientId,
      quantity: input.source.quantity,
    };
  } else {
    payload = {
      ...base,
      custom_name: input.source.name,
      custom_kcal: input.source.kcal,
      custom_protein_g: input.source.proteinG,
      custom_carbs_g: input.source.carbsG,
      custom_fat_g: input.source.fatG,
      custom_fiber_g: input.source.fiberG,
    };
  }
  const { data, error } = await supabase
    .from('meal_logs')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateMealLog(
  id: string,
  patch: TablesUpdate<'meal_logs'>,
): Promise<MealLog> {
  const { data, error } = await supabase
    .from('meal_logs')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMealLog(id: string): Promise<void> {
  const { error } = await supabase.from('meal_logs').delete().eq('id', id);
  if (error) throw error;
}

// Materializes plan slots into meal_logs for a given date by delegating to
// the `materialize_plan_for_date` SECURITY INVOKER RPC (R-12 / D-D6) — the
// single source of truth for materialization, shared by this client and the
// `daily-nutrition-snapshot` edge cron. The RPC:
//   - picks the active week (latest `week_start <= date`) and its slots,
//   - inserts the missing ones as `from_plan` meal_logs carrying
//     `plan_week_slot_id`, race-safe via the partial unique index +
//     `ON CONFLICT DO NOTHING` (DB-level idempotency — safe on every page
//     load, concurrent cron, double-mount, two tabs),
//   - no-ops future dates (`date > today`, Europe/Madrid) so viewing
//     `/diario/<future-date>` can no longer materialize future plan slots.
// The prior hand-written client query/dedup logic (and its Deno mirror in
// the edge function) is removed; this is now the only client caller.
//
// Returns how many logs were inserted (0 if everything was already in sync,
// no active week/slots, or the date is in the future) — same return contract
// `useMaterializePlan` / DiarioPage already expect.
export async function materializePlanForDate(
  userId: string,
  loggedOn: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('materialize_plan_for_date', {
    p_user_id: userId,
    p_date: loggedOn,
  });
  if (error) throw error;
  return data ?? 0;
}

// Recent recipe meal-logs (last 60 days) for the quick-add blend. Reuses the
// same recipe→ingredients join as fetchMealLogsForDay so per-serving kcal is
// computed from the canonical recipe-macro path. Deleted recipes are excluded
// (interim until R-01).
export async function fetchQuickAddRecipeRows(
  userId: string,
  sinceISO: string,
): Promise<QuickAddRow[]> {
  const { data, error } = await supabase
    .from('meal_logs')
    .select(
      `logged_on,
       recipe:recipes (
         id, name, servings,
         recipe_ingredients (
           quantity, per_serving,
           ingredient:ingredients (*)
         )
       )`,
    )
    .eq('user_id', userId)
    .not('recipe_id', 'is', null)
    .gte('logged_on', sinceISO)
    .order('logged_on', { ascending: false })
    .limit(250);
  if (error) throw error;

  const rows: QuickAddRow[] = [];
  for (const r of (data ?? []) as unknown as Array<{
    logged_on: string;
    recipe: {
      id: string;
      name: string;
      servings: number;
      recipe_ingredients: {
        quantity: number;
        per_serving: boolean;
        ingredient: RecipeIngredientJoin['ingredient'];
      }[];
    } | null;
  }>) {
    if (!r.recipe) continue;
    const { perServing } = computeRecipeMacros({
      servings: r.recipe.servings,
      rows: r.recipe.recipe_ingredients.map((ri) => ({
        ingredient: ri.ingredient,
        quantity: Number(ri.quantity),
        perServing: ri.per_serving,
      })),
    });
    rows.push({
      recipeId: r.recipe.id,
      name: r.recipe.name,
      kcalPerServing: Math.round(perServing.kcal),
      loggedOn: r.logged_on,
    });
  }
  return rows;
}
