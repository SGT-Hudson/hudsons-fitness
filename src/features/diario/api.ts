import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database';
import type { Ingredient } from '@/features/ingredients/api';

export type MealLog = Tables<'meal_logs'>;
export type MealType = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'other';

export const MEAL_TYPE_ORDER: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner', 'other'];

export interface RecipeIngredientJoin {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
  per_serving: boolean;
  display_order: number;
  ingredient: Ingredient;
}

export interface RecipeForMealLog {
  id: string;
  name: string;
  servings: number;
  deleted_at: string | null;
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
         id, name, servings, deleted_at,
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

// Materializes plan slots into meal_logs for a given date. The plan is the
// default truth: anything in the plan counts as eaten unless the user has
// already deleted/edited that specific slot. Idempotent — slots that already
// have a corresponding meal_log (matched by plan_week_slot_id) are skipped, so
// it's safe to call on every page load.
//
// Returns how many logs were inserted (0 if everything was already in sync).
export async function materializePlanForDate(
  userId: string,
  loggedOn: string,
): Promise<number> {
  const { data: weeks, error: weekError } = await supabase
    .from('meal_plan_weeks')
    .select('id')
    .eq('user_id', userId)
    .lte('week_start', loggedOn)
    .order('week_start', { ascending: false })
    .limit(1);
  if (weekError) throw weekError;
  if (!weeks || weeks.length === 0) return 0;

  const { data: slots, error: slotsError } = await supabase
    .from('meal_plan_week_slots')
    .select('id, meal_index, recipe_id, servings')
    .eq('plan_week_id', weeks[0].id)
    .eq('date', loggedOn);
  if (slotsError) throw slotsError;
  if (!slots || slots.length === 0) return 0;

  const { data: existing, error: existingError } = await supabase
    .from('meal_logs')
    .select('plan_week_slot_id')
    .eq('user_id', userId)
    .eq('logged_on', loggedOn)
    .not('plan_week_slot_id', 'is', null);
  if (existingError) throw existingError;
  const usedSlotIds = new Set(
    (existing ?? []).map((r) => r.plan_week_slot_id).filter((s): s is string => !!s),
  );

  const missing = slots.filter((s) => !usedSlotIds.has(s.id));
  if (missing.length === 0) return 0;

  const rows: TablesInsert<'meal_logs'>[] = missing.map((s) => ({
    user_id: userId,
    logged_on: loggedOn,
    meal_type: MEAL_TYPE_ORDER[s.meal_index] ?? 'other',
    recipe_id: s.recipe_id,
    servings: Number(s.servings),
    from_plan: true,
    plan_week_slot_id: s.id,
  }));

  const { error: insertError } = await supabase.from('meal_logs').insert(rows);
  if (insertError) throw insertError;
  return rows.length;
}
