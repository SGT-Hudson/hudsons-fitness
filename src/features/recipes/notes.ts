import { supabase } from '@/lib/supabase';

/**
 * Private per-user recipe notes.
 *
 * These live on user_recipe_refs.note, never on the shared `recipes` row —
 * recipes are a pool (R-01) and the note is PII. That table is a single table
 * with `auth.uid() = user_id` RLS, so a plain update is correct here: the
 * RPC-only rule covers atomic multi-table mutations.
 */

/** Empty/whitespace clears the column; anything else is stored trimmed. */
export function normalizeNote(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

export interface RecipeNoteState {
  /** False when the recipe is not in the user's library — no ref row exists. */
  exists: boolean;
  note: string;
}

export async function fetchRecipeNote(recipeId: string): Promise<RecipeNoteState> {
  const { data, error } = await supabase
    .from('user_recipe_refs')
    .select('note')
    .eq('recipe_id', recipeId)
    .maybeSingle();
  if (error) throw error;
  return { exists: !!data, note: data?.note ?? '' };
}

export async function saveRecipeNote(recipeId: string, note: string): Promise<void> {
  const { error } = await supabase
    .from('user_recipe_refs')
    .update({ note: normalizeNote(note), updated_at: new Date().toISOString() })
    .eq('recipe_id', recipeId);
  if (error) throw error;
}
