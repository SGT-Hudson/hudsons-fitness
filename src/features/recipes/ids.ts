/**
 * Client-only row identity for editor field arrays (ingredient rows, R-36
 * recipe steps). Never persisted — react-hook-form's `useFieldArray` needs a
 * stable key per row, and these ids exist only to give it one.
 *
 * Lives in its own module (not `RecipeEditorForm.tsx`, where it used to live)
 * because `RecipeEditorForm` imports `RecipeStepsField`, which also needs
 * `newRowId` — keeping it there made the two components import each other.
 */
let rowIdCounter = 0;
export function newRowId() {
  rowIdCounter += 1;
  return `row-${Date.now()}-${rowIdCounter}`;
}
