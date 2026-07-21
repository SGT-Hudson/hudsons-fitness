// R-36b task 3 — the recipe-photos upload/clear API, the data layer between
// the client resize (photoResize.ts) and the editor UI (task 4).
//
// `recipes.photo_url` stores the OBJECT PATH `<recipe_id>/full.webp`, not a
// URL (see the bucket migration's header). Setting it is a plain single-table
// update done client-side after the upload resolves — invariant 3 only
// requires an RPC for mutations spanning MORE THAN ONE table, and this one
// doesn't: the bucket write and the `recipes` row are two independently
// consistent systems, reconciled by the weekly reaper (Task 5) if either half
// fails alone.
import { supabase } from '@/lib/supabase';
import type { Recipe } from './api';
import { resizeToWebp } from './photoResize';

const BUCKET = 'recipe-photos';

function fullKey(recipeId: string): string {
  return `${recipeId}/full.webp`;
}

function thumbKey(recipeId: string): string {
  return `${recipeId}/thumb.webp`;
}

/**
 * Resizes the picked file client-side, uploads both sizes (stable keys,
 * `upsert: true` so a replace overwrites in place — no orphan left behind),
 * then points `recipes.photo_url` at the full-size key. RLS restricts the
 * upload and the update to the recipe's real creator.
 */
export async function setRecipePhoto(recipeId: string, file: File): Promise<void> {
  const { full, thumb } = await resizeToWebp(file);

  const { error: fullError } = await supabase.storage
    .from(BUCKET)
    .upload(fullKey(recipeId), full, { upsert: true, contentType: 'image/webp' });
  if (fullError) throw fullError;

  const { error: thumbError } = await supabase.storage
    .from(BUCKET)
    .upload(thumbKey(recipeId), thumb, { upsert: true, contentType: 'image/webp' });
  if (thumbError) throw thumbError;

  const { error } = await supabase
    .from('recipes')
    .update({ photo_url: fullKey(recipeId) })
    .eq('id', recipeId);
  if (error) throw error;
}

/**
 * Removes both objects, THEN nulls `photo_url` — never the other order.
 * `storage.remove` resolves `{ error }` rather than throwing, so a failed
 * remove (network blip, a stray RLS denial) is caught by the `if (error)
 * throw` below and the column update is never reached. That leaves
 * `photo_url` pointing at an object that may or may not still exist — a
 * dangling pointer the weekly reaper (Task 5) self-heals by re-deriving state
 * from what's actually in the bucket. The alternative order (null first) can
 * leave a live, still-billed object with nothing pointing at it: a real,
 * silent orphan the reaper has no way to discover (it only prunes prefixes
 * with no matching `recipes` row, and the recipe row still exists here).
 */
export async function clearRecipePhoto(recipeId: string): Promise<void> {
  const { error: removeError } = await supabase.storage
    .from(BUCKET)
    .remove([fullKey(recipeId), thumbKey(recipeId)]);
  if (removeError) throw removeError;

  const { error } = await supabase
    .from('recipes')
    .update({ photo_url: null })
    .eq('id', recipeId);
  if (error) throw error;
}

/**
 * Public URL for a recipe's cover photo, cache-busted with `?v=<updated_at>`
 * (the CDN caches the stable path, so this is what forces a refetch after a
 * replace). `null` when the recipe has no photo. Pass `variant: 'thumb'` for
 * the small list/card rendition — same key with `full` swapped for `thumb`.
 */
export function publicPhotoUrl(
  recipe: Pick<Recipe, 'photo_url' | 'updated_at'>,
  variant: 'full' | 'thumb' = 'full',
): string | null {
  if (!recipe.photo_url) return null;
  const path = variant === 'thumb' ? recipe.photo_url.replace('full.webp', 'thumb.webp') : recipe.photo_url;
  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${publicUrl}?v=${recipe.updated_at}`;
}
