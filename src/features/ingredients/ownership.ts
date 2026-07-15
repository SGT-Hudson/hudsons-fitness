/**
 * Who may edit an ingredient (R-01 — ingredients are a shared pool, mirrors
 * `canEditRecipe` in `features/recipes/ownership.ts`).
 *
 * A user's library is a set of *refs* into a shared pool; you can hold a ref
 * to an ingredient someone else created. Direct table writes under RLS
 * (`updateIngredient`) are the write path here — there is no `save_ingredient`
 * RPC — but the same ownership boundary applies: only the creator may edit,
 * and the UI must not offer it for a pooled row you do not own (a deep link
 * to a foreign row must redirect, not render an editor that fails on save).
 *
 * Unlike `recipes.created_by_user_id` (NOT NULL), `ingredients.created_by_user_id`
 * IS nullable: `null` means a system seed (~230 baseline rows), a third
 * ownership state recipes don't have. An orphaned ingredient (its creator
 * dropped their ref via `hide_owned_ingredient`) is re-owned by the ANON user
 * rather than nulled. Both `null` and the ANON uid simply match nobody's real
 * uid and fall out of this check with no special case — the RLS policy
 * (`auth.uid() = created_by_user_id`) agrees: `auth.uid()` can never equal
 * `null`. The `userId` guard is what keeps a signed-out render from matching
 * a `null`-owned system row.
 *
 * NOT the rule for removing an ingredient from your library: `hide_owned_ingredient`
 * only drops YOUR ref row and is deliberately ungated — pooled ingredients you
 * do not own must stay removable.
 */
export function canEditIngredient(
  ing: { created_by_user_id: string | null },
  userId: string | null | undefined,
): boolean {
  return !!userId && ing.created_by_user_id === userId;
}
