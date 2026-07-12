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
  // Optional sub-macros — `null` means UNKNOWN, never 0 (U-1; salt joins the
  // same contract in R-33 wave 6).
  sugar_g_per_unit: number | null;
  saturated_fat_g_per_unit: number | null;
  salt_g_per_unit: number | null;
}

// Pool search (R-01 spec §7 — intentionally over the WHOLE pool, including
// items not in my library). Discovery is the point; the autocomplete in
// the recipe editor uses this. "Browse library" + the recipe-picker in the
// template editor are the explicit my-library affordances (spec §13 Q3 —
// asymmetry decided as intentional).
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
    .or(`name.ilike.%${safe}%,name_en.ilike.%${safe}%,brand.ilike.%${safe}%`)
    .order('is_verified', { ascending: false })
    .order('name')
    .limit(limit);
  if (error) throw error;
  return data;
}

// My library (R-01 spec §7) — join user_ingredient_refs on auth.uid().
// The user's private `note` lives on the ref row; this query does NOT
// pull it (callers that need the note query the ref table directly with
// the per-user RLS-isolated SELECT). Ordering by `ingredients.name`
// matches today's behavior.
export async function listIngredients(limit = 100): Promise<Ingredient[]> {
  const { data, error } = await supabase
    .from('user_ingredient_refs')
    .select('ingredient:ingredients(*)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  type Row = { ingredient: Ingredient | Ingredient[] | null };
  const rows = (data ?? []) as unknown as Row[];
  const out: Ingredient[] = [];
  for (const r of rows) {
    if (!r.ingredient) continue;
    const ing = Array.isArray(r.ingredient) ? r.ingredient[0] : r.ingredient;
    if (ing) out.push(ing);
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// Two atomic writes (`ingredients` + `user_ingredient_refs`) intentionally
// NOT wrapped in an RPC here — the ref insert is the caller's OWN row
// (no privilege escalation involved) and tolerates duplication via the
// unique constraint + `on conflict do nothing`. The window in which the
// pool item exists without my ref is < 1 RTT and the next page load
// reconciles via `listIngredients`. If we ever need true atomicity, the
// fix is a small INSERT RPC (D-C5) — not warranted today.
export async function createManualIngredient(
  userId: string,
  input: ManualIngredientInput,
): Promise<Ingredient> {
  // NOTE: manual rows leave `external_id` null. The `ingredients_external_consistency`
  // CHECK only allows external_id for source in (openfoodfacts, bedca), and a
  // barcode-scanned-but-not-in-OFF product is genuinely user-entered. R-21's
  // contribution path uses the in-memory scanned barcode directly (not this
  // row's external_id), so nothing here needs it.
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
    sugar_g_per_unit: input.sugar_g_per_unit,
    saturated_fat_g_per_unit: input.saturated_fat_g_per_unit,
    salt_g_per_unit: input.salt_g_per_unit,
  };
  const { data, error } = await supabase
    .from('ingredients')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  await ensureMyIngredientRef(userId, data.id);
  return data;
}

// `overrides` is the dialog's fully-parsed form (`ParsedIngredient` in
// IngredientFormFields.tsx — every key present, `null` on a sub-macro the
// user deliberately cleared). It is NOT a partial patch merged over `product`:
// a `??` merge here would silently discard the user's blanking whenever OFF's
// raw value happens to be falsy-but-present (e.g. `salt_100g: 0`), writing a
// false zero into a column whose whole contract is null-means-unknown (U-1;
// salt in R-33 wave 6). `product` is used only for `external_id` — every
// ingredient field comes from `overrides`, unconditionally.
export async function importIngredientFromOFF(
  userId: string,
  product: OFFSearchResult,
  overrides: ManualIngredientInput,
): Promise<Ingredient> {
  const payload: TablesInsert<'ingredients'> = {
    created_by_user_id: userId,
    source: 'openfoodfacts',
    external_id: product.code,
    unit_type: 'gram',
    name: overrides.name,
    brand: overrides.brand,
    kcal_per_unit: overrides.kcal_per_unit,
    protein_g_per_unit: overrides.protein_g_per_unit,
    carbs_g_per_unit: overrides.carbs_g_per_unit,
    fat_g_per_unit: overrides.fat_g_per_unit,
    fiber_g_per_unit: overrides.fiber_g_per_unit,
    sugar_g_per_unit: overrides.sugar_g_per_unit,
    saturated_fat_g_per_unit: overrides.saturated_fat_g_per_unit,
    salt_g_per_unit: overrides.salt_g_per_unit,
  };

  const { data, error } = await supabase
    .from('ingredients')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      // Pool row already exists for this (source, external_id) — recover
      // it and ensure the caller has a ref (they're importing it into
      // their library).
      const { data: existing, error: fetchError } = await supabase
        .from('ingredients')
        .select('*')
        .eq('source', 'openfoodfacts')
        .eq('external_id', product.code)
        .single();
      if (fetchError) throw fetchError;
      await ensureMyIngredientRef(userId, existing.id);
      return existing;
    }
    throw error;
  }
  await ensureMyIngredientRef(userId, data.id);
  return data;
}

// "Add to my library" / idempotent ref-ensure. The unique constraint +
// `on conflict do nothing` makes double-fire (two tabs) safe.
async function ensureMyIngredientRef(userId: string, ingredientId: string): Promise<void> {
  const { error } = await supabase
    .from('user_ingredient_refs')
    .upsert({ user_id: userId, ingredient_id: ingredientId }, {
      onConflict: 'user_id,ingredient_id',
      ignoreDuplicates: true,
    });
  if (error) throw error;
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

// R-01 (spec §6, §7): the "Remove from my library" / "Borrar"
// affordance. Replaces the old `deleteIngredient` + `IngredientInUseError`
// path — under the pool model, hard-delete is impossible (would break
// every recipe that references the item; recipe_ingredients FK keeps the
// pool row alive). Instead the RPC drops my ref and, if I am the owner,
// transfers pool ownership to the anon sentinel — see migration
// 20260520120040_r01_hide_rpcs.sql.
export async function hideOwnedIngredient(ingredientId: string): Promise<void> {
  const { error } = await supabase.rpc('hide_owned_ingredient', {
    p_ingredient_id: ingredientId,
  });
  if (error) throw error;
}

/**
 * Display-name picker for the bilingual library. Falls back to the ES-primary
 * `name` when the preferred locale column is null — mirrors `exerciseDisplayName`
 * (R-19). EN-only callers therefore never see an empty label for OFF/manual rows
 * (which leave `name_en` null).
 */
export function ingredientDisplayName(ing: Ingredient, lang: 'es' | 'en'): string {
  if (lang === 'en') return ing.name_en ?? ing.name;
  return ing.name;
}

/**
 * The whole pool, in one query (R-33 wave 6 — the Ingredientes list).
 *
 * Replaces the server-side paged search the list used to run: the redesigned
 * page carries five filter chips whose counts must be REAL numbers, and a
 * count-per-chip round trip (or a `count: 'exact'` per facet) is five requests
 * on every keystroke. The pool is a single shared catalogue (~235 rows today,
 * dominated by the ~230 `system` seeds), so one fetch feeds the rows, the five
 * counts and the in-memory pagination — see `ingredientFilter.ts`.
 *
 * `limit` is an explicit ceiling rather than PostgREST's implicit 1000-row cap:
 * if the pool ever outgrows it, the page silently truncating is the failure we
 * want to notice, and the fix is a server-side facet count (an RPC), not a
 * bigger number here.
 *
 * Order is deterministic (`is_verified desc, name asc, id asc`) — `name` is not
 * unique, hence the `id` tiebreaker.
 */
export async function listPoolIngredients(limit = 1000): Promise<Ingredient[]> {
  const { data, error } = await supabase
    .from('ingredients')
    .select('*')
    .order('is_verified', { ascending: false })
    .order('name')
    .order('id')
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/**
 * The ids of the ingredients in MY library — the `user_ingredient_refs` rows
 * RLS already scopes to `auth.uid()`. One query; the "mi biblioteca" chip and
 * the row menu's "quitar de mi biblioteca" both read it. Ids only: the pool
 * rows themselves come from `listPoolIngredients`.
 */
export async function listMyIngredientRefIds(): Promise<string[]> {
  const { data, error } = await supabase.from('user_ingredient_refs').select('ingredient_id');
  if (error) throw error;
  return (data ?? []).map((r) => r.ingredient_id);
}
