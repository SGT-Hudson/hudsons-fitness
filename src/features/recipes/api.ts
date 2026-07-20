import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';
import type { Ingredient } from '@/features/ingredients/api';
import {
  computeRecipeMacros,
  computeRecipeSub,
  type Macros,
  type RecipeRowMacrosInput,
} from './macros';
import { recipeLabels, type RecipeLabels } from './labels';

export type Recipe = Tables<'recipes'>;
export type RecipeIngredient = Tables<'recipe_ingredients'>;
export type RecipeStep = Tables<'recipe_steps'>;

export interface RecipeWithIngredients extends Recipe {
  recipe_ingredients: Array<RecipeIngredient & { ingredient: Ingredient }>;
  recipe_steps: RecipeStep[];
}

export interface RecipeListItem {
  id: string;
  name: string;
  servings: number;
  description: string | null;
  updated_at: string;
  ingredient_count: number;
  meal_types: string[];
  // R-01: the pool's owner. A library is a set of refs, so this is NOT always
  // the listing user — `save_recipe` only lets the creator edit, so the card
  // menu needs it to know whether to offer "editar" at all (see ownership.ts).
  created_by_user_id: string;
  // R-33 wave 5: minutes, or null when no time was ever recorded (the card
  // omits the stat entirely rather than rendering 0 or a guess).
  prep_time_minutes: number | null;
  // U-3: per-serving nutrition labels (goal filters + warning badges), computed
  // in-memory from the joined ingredient macros via the shared core.
  labels: RecipeLabels;
  // R-33 wave 2 PR-B task 1: the per-serving macros computeRecipeMacros
  // already produces (above `labels` is derived from it) — kept here so the
  // diario ración-projection step can read a recipe's contribution off this
  // already-fetched list with zero extra network cost.
  perServing: Macros;
}

// Ingredient macro shape pulled per row for U-3 label computation.
type RowIngredient = RecipeRowMacrosInput['ingredient'];

// My library (R-01 spec §7) — join user_recipe_refs on auth.uid().
// The recipe pool is openly readable post-R-01, but this listing
// intentionally shows only "what I have" (the recipes editor / dashboard
// surface). Pool discovery is a separate explicit "browse library" flow.
export async function listRecipes(userId: string): Promise<RecipeListItem[]> {
  // U-3: pull each recipe's ingredient macros (incl. sugar/sat-fat) so the page
  // can compute goal-filter labels + warning badges in-memory via the shared
  // core. Heavier than a count, but fine at personal-library scale (spec §2.4);
  // denormalised macro columns are the escape hatch if libraries ever grow.
  const { data, error } = await supabase
    .from('user_recipe_refs')
    .select(
      `recipe:recipes (
         id, name, servings, description, updated_at, meal_types, prep_time_minutes,
         created_by_user_id,
         recipe_ingredients (
           quantity, per_serving,
           ingredient:ingredients (
             unit_type, kcal_per_unit, protein_g_per_unit, carbs_g_per_unit,
             fat_g_per_unit, fiber_g_per_unit, sugar_g_per_unit, saturated_fat_g_per_unit
           )
         )
       )`,
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  type MacroRow = {
    quantity: number;
    per_serving: boolean;
    ingredient: RowIngredient | RowIngredient[] | null;
  };
  type Row = {
    recipe:
      | (Pick<
          Recipe,
          | 'id'
          | 'name'
          | 'servings'
          | 'description'
          | 'updated_at'
          | 'meal_types'
          | 'prep_time_minutes'
          | 'created_by_user_id'
        > & {
          recipe_ingredients: MacroRow[] | null;
        })
      | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const out: RecipeListItem[] = [];
  for (const r of rows) {
    if (!r.recipe) continue;
    const ri = r.recipe.recipe_ingredients ?? [];
    const macroRows: RecipeRowMacrosInput[] = ri
      .map((row) => {
        const ing = Array.isArray(row.ingredient) ? row.ingredient[0] : row.ingredient;
        return ing
          ? { ingredient: ing, quantity: Number(row.quantity), perServing: row.per_serving }
          : null;
      })
      .filter((x): x is RecipeRowMacrosInput => x !== null);
    const opts = { servings: Number(r.recipe.servings) || 1, rows: macroRows };
    const perServing = computeRecipeMacros(opts).perServing;
    const labels = recipeLabels(perServing, computeRecipeSub(opts).perServing);
    out.push({
      id: r.recipe.id,
      name: r.recipe.name,
      servings: r.recipe.servings,
      description: r.recipe.description,
      updated_at: r.recipe.updated_at,
      ingredient_count: ri.length,
      meal_types: r.recipe.meal_types ?? [],
      prep_time_minutes: r.recipe.prep_time_minutes ?? null,
      created_by_user_id: r.recipe.created_by_user_id,
      labels,
      perServing,
    });
  }
  out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return out;
}

// Pool SELECT is open under R-01; the recipe is reachable whether or not
// the caller has a ref. Diary entries for anon-owned recipes still
// resolve here — the never-orphan win.
export async function fetchRecipe(recipeId: string): Promise<RecipeWithIngredients> {
  const { data, error } = await supabase
    .from('recipes')
    .select(
      `*,
       recipe_ingredients (
         id, recipe_id, ingredient_id, quantity, per_serving, display_order, created_at,
         ingredient:ingredients (*)
       ),
       recipe_steps (
         id, recipe_id, display_order, text, created_at
       )`,
    )
    .eq('id', recipeId)
    .single();
  if (error) throw error;
  type RawJoin = RecipeIngredient & { ingredient: Ingredient | Ingredient[] };
  const raw = data as unknown as Recipe & {
    recipe_ingredients: RawJoin[];
    recipe_steps: RecipeStep[];
  };
  const rows = (raw.recipe_ingredients ?? [])
    .map((ri) => ({
      ...ri,
      ingredient: Array.isArray(ri.ingredient) ? ri.ingredient[0] : ri.ingredient,
    }))
    .sort((a, b) => a.display_order - b.display_order);
  const steps = (raw.recipe_steps ?? []).slice().sort((a, b) => a.display_order - b.display_order);
  return { ...raw, recipe_ingredients: rows, recipe_steps: steps };
}

export interface SaveRecipePayload {
  recipeId: string | null;
  name: string;
  servings: number;
  description: string | null;
  steps: Array<{ text: string; display_order: number }>;
  mealTypes: string[];
  // R-33 wave 5: minutes, or null for "no time recorded". ALWAYS sent, never
  // omitted — the RPC writes it unconditionally, so null genuinely clears it.
  prepTimeMinutes: number | null;
  ingredients: Array<{
    ingredient_id: string;
    quantity: number;
    per_serving: boolean;
    display_order: number;
  }>;
}

// Client signature unchanged; the server-side RPC body (migration
// 20260520120050) now ALSO inserts the creator's user_recipe_refs on
// CREATE — atomic with the recipes/recipe_ingredients writes, per D-C5.
export async function saveRecipe(payload: SaveRecipePayload): Promise<string> {
  const { data, error } = await supabase.rpc('save_recipe', {
    p_recipe_id: payload.recipeId,
    p_name: payload.name,
    p_servings: payload.servings,
    p_description: payload.description,
    p_steps: payload.steps,
    p_ingredients: payload.ingredients,
    p_meal_types: payload.mealTypes,
    p_prep_time_minutes: payload.prepTimeMinutes,
  });
  if (error) throw error;
  return data as string;
}

// R-01: replaces the old `softDeleteRecipe` (deleted_at flag, dropped in
// migration 20260520120030). The hide RPC just drops my reference row
// (R-25 — the pooled recipe and its ownership are untouched).
export async function hideOwnedRecipe(recipeId: string): Promise<void> {
  const { error } = await supabase.rpc('hide_owned_recipe', { p_recipe_id: recipeId });
  if (error) throw error;
}
