import type { NavigateFunction } from 'react-router-dom';
import { recipeToEditorState } from './components/RecipeEditorForm';
import type { RecipeWithIngredients } from './api';

/**
 * "Duplicar" — the one mechanism, reused everywhere the action appears (the
 * editor's own button, and the read view's — R-33 wave 5 task 3). It works on
 * ANY recipe regardless of ownership: it is how you copy someone else's pooled
 * recipe (R-01) into your own library, since a pooled recipe cannot be edited
 * in place (`save_recipe` scopes its UPDATE to `created_by_user_id`).
 *
 * It hands the new-recipe route a full `EditorState` (via router `state`, not
 * a query param — the state is a whole ingredients array, not a scalar) built
 * from the source recipe, `recipeToEditorState` included: the create page
 * seeds its form from `location.state.duplicate` instead of a blank state when
 * present. That is what carries the prep time over too — `recipeToEditorState`
 * already reads it (see its own comment); a duplicate that dropped it would
 * silently wipe the copy's prep time on its first save.
 */
export function navigateToRecipeDuplicate(
  navigate: NavigateFunction,
  recipe: RecipeWithIngredients,
  newName: string,
): void {
  const dup = recipeToEditorState(recipe);
  navigate('/recipes/new', { state: { duplicate: { ...dup, name: newName } } });
}
