/**
 * Who may edit a recipe (R-01 — recipes are a shared pool).
 *
 * A user's library is a set of *refs*: you can hold a ref to a recipe someone
 * else created. `save_recipe` scopes its UPDATE to
 * `created_by_user_id = auth.uid()` and raises "recipe not found or not owned
 * by user" otherwise — so for a pooled recipe you did not create, an edit is a
 * guaranteed 400. The UI must not offer it.
 *
 * `created_by_user_id` is NOT NULL: an orphaned recipe (its creator dropped
 * their ref) is re-owned by the ANON user rather than nulled, so it simply
 * matches nobody's uid and falls out of this check with no special case. The
 * `userId` guard is what keeps a signed-out render from matching anything.
 *
 * NOT the rule for removing a recipe from your library: `hide_owned_recipe`
 * only drops YOUR ref row (R-25) and is deliberately ungated — pooled recipes
 * you do not own must stay removable.
 */
export function canEditRecipe(
  recipe: { created_by_user_id: string },
  userId: string | null | undefined,
): boolean {
  return !!userId && recipe.created_by_user_id === userId;
}
