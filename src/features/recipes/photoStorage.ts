// R-36b task 3 — the recipe-photos upload/clear API, the data layer between
// the client resize (photoResize.ts) and the editor UI (task 4).
//
// `recipes.photo_url` stores the OBJECT PATH `<recipe_id>/full.webp`, not a
// URL (see the bucket migration's header). Setting it is a plain single-table
// update done client-side after the upload resolves — invariant 3 only
// requires an RPC for mutations spanning MORE THAN ONE table, and this one
// doesn't: the bucket write and the `recipes` row are two independently
// consistent systems.
//
// Neither half can be rolled back into the other, so both orderings are chosen
// to make a half-failure SELF-CORRECTING rather than reconciled by a sweeper:
// the keys are stable, so a retried set overwrites whatever the failed attempt
// left behind, and a retried clear removes it. The weekly reaper (Task 5) is
// NOT a backstop for these — it only reaps prefixes whose `recipes` row is
// gone, and in every half-failure here the row is still there. See its header.
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
 *
 * `updated_at` is written in the SAME statement, and that is load-bearing, not
 * bookkeeping: the object key is stable, so a replace reuses the byte-identical
 * URL and both the browser and the Storage CDN would keep serving the old image
 * forever. `publicPhotoUrl` cache-busts on `updated_at`, so the column has to
 * move for the new photo to be visible at all. Nothing else bumps it — there is
 * no `updated_at` trigger anywhere in the schema; `save_recipe` sets it
 * explicitly, and so does this. Still a single-table update, so invariant 3
 * (multi-table mutations must be an RPC) is untouched.
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
    .update({ photo_url: fullKey(recipeId), updated_at: new Date().toISOString() })
    .eq('id', recipeId);
  if (error) throw error;
}

/**
 * Removes both objects, THEN nulls `photo_url` — never the other order.
 * `storage.remove` resolves `{ error }` rather than throwing, so a failed
 * remove (network blip, a stray RLS denial) is caught by the `if (error)
 * throw` below and the column update is never reached, so `photo_url` still
 * points at a live object and nothing is stranded.
 *
 * The residual half-failure is the other way round — objects removed, the
 * column update failed — which leaves a dangling `photo_url`. That degrades
 * gracefully and self-corrects: `RecipePhoto` falls back to the placeholder on
 * the image's `onError`, and retrying the clear (or setting a new photo, which
 * overwrites the same stable keys) fixes the column. The alternative order
 * (null the column first) fails much worse: it can leave a live, still-billed
 * object with nothing pointing at it, unreachable by any code path — the reaper
 * cannot see it either, since it only prunes prefixes with no matching
 * `recipes` row and the recipe row still exists here.
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
 * replace — `setRecipePhoto` bumps `updated_at` for exactly this reason).
 * `null` when the recipe has no photo. Pass `variant: 'thumb'` for the small
 * list/card rendition.
 *
 * `photo_url` is read as a presence flag only; BOTH keys are re-derived from
 * the recipe id, the same way the uploader built them. Deriving the thumb by
 * string-replacing `full.webp` in the stored path would quietly return the
 * full-size key if the column ever held anything else. The `?v=` value is
 * URL-encoded: PostgREST returns `updated_at` as `…+00:00`, and a raw `+` in a
 * query string decodes as a space.
 */
export function publicPhotoUrl(
  recipe: Pick<Recipe, 'id' | 'photo_url' | 'updated_at'>,
  variant: 'full' | 'thumb' = 'full',
): string | null {
  if (!recipe.photo_url) return null;
  const path = variant === 'thumb' ? thumbKey(recipe.id) : fullKey(recipe.id);
  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${publicUrl}?v=${encodeURIComponent(recipe.updated_at)}`;
}
