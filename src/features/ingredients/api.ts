import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database';
import type { OFFSearchResult } from '@/lib/openfoodfacts';

export type Ingredient = Tables<'ingredients'>;
export type IngredientUnitType = 'gram' | 'unit';
export type IngredientSource = 'manual' | 'openfoodfacts' | 'bedca' | 'system';

export interface ManualIngredientInput {
  name: string;
  brand: string | null;
  unit_type: IngredientUnitType;
  kcal_per_unit: number;
  protein_g_per_unit: number;
  carbs_g_per_unit: number;
  fat_g_per_unit: number;
  fiber_g_per_unit: number;
}

export async function searchLocalIngredients(query: string, limit = 15): Promise<Ingredient[]> {
  const trimmed = query.trim();
  if (trimmed === '') {
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .order('is_verified', { ascending: false })
      .order('name')
      .limit(limit);
    if (error) throw error;
    return data;
  }
  const safe = trimmed.replace(/[%_,]/g, '');
  const { data, error } = await supabase
    .from('ingredients')
    .select('*')
    .or(`name.ilike.%${safe}%,brand.ilike.%${safe}%`)
    .order('is_verified', { ascending: false })
    .order('name')
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function listIngredients(limit = 100): Promise<Ingredient[]> {
  const { data, error } = await supabase
    .from('ingredients')
    .select('*')
    .order('name')
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function createManualIngredient(
  userId: string,
  input: ManualIngredientInput,
): Promise<Ingredient> {
  const payload: TablesInsert<'ingredients'> = {
    created_by_user_id: userId,
    source: 'manual',
    name: input.name,
    brand: input.brand,
    unit_type: input.unit_type,
    kcal_per_unit: input.kcal_per_unit,
    protein_g_per_unit: input.protein_g_per_unit,
    carbs_g_per_unit: input.carbs_g_per_unit,
    fat_g_per_unit: input.fat_g_per_unit,
    fiber_g_per_unit: input.fiber_g_per_unit,
  };
  const { data, error } = await supabase
    .from('ingredients')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function importIngredientFromOFF(
  userId: string,
  product: OFFSearchResult,
  overrides?: Partial<ManualIngredientInput>,
): Promise<Ingredient> {
  const payload: TablesInsert<'ingredients'> = {
    created_by_user_id: userId,
    source: 'openfoodfacts',
    external_id: product.code,
    unit_type: 'gram',
    name: overrides?.name ?? product.name,
    brand: overrides?.brand ?? product.brand,
    kcal_per_unit: overrides?.kcal_per_unit ?? product.kcalPer100g,
    protein_g_per_unit: overrides?.protein_g_per_unit ?? product.proteinPer100g,
    carbs_g_per_unit: overrides?.carbs_g_per_unit ?? product.carbsPer100g,
    fat_g_per_unit: overrides?.fat_g_per_unit ?? product.fatPer100g,
    fiber_g_per_unit: overrides?.fiber_g_per_unit ?? product.fiberPer100g,
  };

  const { data, error } = await supabase
    .from('ingredients')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: existing, error: fetchError } = await supabase
        .from('ingredients')
        .select('*')
        .eq('source', 'openfoodfacts')
        .eq('external_id', product.code)
        .single();
      if (fetchError) throw fetchError;
      return existing;
    }
    throw error;
  }
  return data;
}

export async function updateIngredient(
  id: string,
  patch: TablesUpdate<'ingredients'>,
): Promise<Ingredient> {
  const { data, error } = await supabase
    .from('ingredients')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export class IngredientInUseError extends Error {
  constructor() {
    super('ingredient_in_use');
    this.name = 'IngredientInUseError';
  }
}

export async function deleteIngredient(id: string): Promise<void> {
  const { error } = await supabase.from('ingredients').delete().eq('id', id);
  if (error) {
    // Postgres foreign_key_violation — recipe_ingredients still references this row.
    if ((error as { code?: string }).code === '23503') {
      throw new IngredientInUseError();
    }
    throw error;
  }
}
