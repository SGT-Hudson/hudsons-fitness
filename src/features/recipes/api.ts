import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';
import type { Ingredient } from '@/features/ingredients/api';

export type Recipe = Tables<'recipes'>;
export type RecipeIngredient = Tables<'recipe_ingredients'>;

export interface RecipeWithIngredients extends Recipe {
  recipe_ingredients: Array<RecipeIngredient & { ingredient: Ingredient }>;
}

export interface RecipeListItem {
  id: string;
  name: string;
  servings: number;
  description: string | null;
  updated_at: string;
  ingredient_count: number;
}

export async function listRecipes(userId: string): Promise<RecipeListItem[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, name, servings, description, updated_at, recipe_ingredients(id)')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    servings: r.servings,
    description: r.description,
    updated_at: r.updated_at,
    ingredient_count: r.recipe_ingredients?.length ?? 0,
  }));
}

export async function fetchRecipe(recipeId: string): Promise<RecipeWithIngredients> {
  const { data, error } = await supabase
    .from('recipes')
    .select(
      `*,
       recipe_ingredients (
         id, recipe_id, ingredient_id, quantity, per_serving, display_order, created_at,
         ingredient:ingredients (*)
       )`,
    )
    .eq('id', recipeId)
    .is('deleted_at', null)
    .single();
  if (error) throw error;
  type RawJoin = RecipeIngredient & { ingredient: Ingredient | Ingredient[] };
  const raw = data as unknown as Recipe & { recipe_ingredients: RawJoin[] };
  const rows = (raw.recipe_ingredients ?? [])
    .map((ri) => ({
      ...ri,
      ingredient: Array.isArray(ri.ingredient) ? ri.ingredient[0] : ri.ingredient,
    }))
    .sort((a, b) => a.display_order - b.display_order);
  return { ...raw, recipe_ingredients: rows };
}

export interface SaveRecipePayload {
  recipeId: string | null;
  name: string;
  servings: number;
  description: string | null;
  instructions: string | null;
  ingredients: Array<{
    ingredient_id: string;
    quantity: number;
    per_serving: boolean;
    display_order: number;
  }>;
}

export async function saveRecipe(payload: SaveRecipePayload): Promise<string> {
  const { data, error } = await supabase.rpc('save_recipe', {
    p_recipe_id: payload.recipeId,
    p_name: payload.name,
    p_servings: payload.servings,
    p_description: payload.description,
    p_instructions: payload.instructions,
    p_ingredients: payload.ingredients,
  });
  if (error) throw error;
  return data as string;
}

export async function softDeleteRecipe(recipeId: string): Promise<void> {
  const { error } = await supabase
    .from('recipes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', recipeId);
  if (error) throw error;
}
