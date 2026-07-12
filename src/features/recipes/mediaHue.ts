// R-33 wave 5 — deterministic hue for the recipe media placeholder.
// `recipes.photo_url` is dead (no bucket, no upload); every recipe "image" is
// a diagonal-stripe tint instead. The tint's hue is derived from the recipe
// id so the same recipe always renders the same colour — across reloads,
// devices, and sessions — without persisting anything new. Range mirrors the
// design canvas's stripe fill (recetas-web.jsx RecipeCard, recetas-mobile.jsx
// row, receta-editor-web.jsx RecetaVistaWebV2 hero all sample hues in
// roughly 15–135), so the placeholder stays inside the app's palette.
const HUE_MIN = 15;
const HUE_MAX = 135;

/** Pure djb2-style string hash, folded into the canvas's hue band. */
export function recipeMediaHue(recipeId: string): number {
  let hash = 5381;
  for (let i = 0; i < recipeId.length; i += 1) {
    hash = (hash * 33) ^ recipeId.charCodeAt(i);
  }
  return HUE_MIN + (Math.abs(hash) % (HUE_MAX - HUE_MIN + 1));
}
