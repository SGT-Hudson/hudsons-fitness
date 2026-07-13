// R-33 wave 6 — auto-kcal (spec §3): a NEW pure helper beside `macros.ts` and
// `subMacros.ts`, not a change to either (both are FROZEN). Same rules as its
// neighbours: dependency-free, runtime-agnostic, no `@/` alias, no relative
// intra-core import — so it stays usable from a Deno edge function if one
// ever needs it, even though today only the Vite client (the ingredient
// editor, Task 2) calls it.
//
// Atwater factors: protein and carbs are 4 kcal/g, fat is 9 kcal/g. Fiber and
// the U-1 "of which" sub-macros (sugar, saturated fat, salt) are excluded —
// they are not independent energy contributions in the stored macro model
// (fiber already is one of the 5 primary fields in `macros.ts`; sugar/satFat
// are subsets of carbs/fat and would double-count if added here).
//
// This is a DERIVATION over live, in-progress form numbers — not a stored
// row. A blank/invalid macro field is not "unknown" here the way a null
// sub-macro column is (U-1 / Constraint 3 does not apply): it simply
// contributes 0 to the running total, exactly like typing 0.

export interface AutoKcalInputs {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Non-finite or negative contributes 0 — never NaN/negative into the sum. */
function contribution(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Atwater-derived kcal: `4·protein + 4·carbs + 9·fat`, rounded to the nearest
 * whole kcal. Every kcal DISPLAY in the app already rounds to a whole number
 * (`Math.round(...)` at each `*.kcal` render site — `RecipeCard`,
 * `RecipeMacrosCard`, `WeekSummaryCard`, `LatestMeasurementCard`'s BMR, etc.);
 * the `auto` chip's entire pitch is "reads like the number on a real label",
 * and labels are whole kcal. `kcal_per_unit` itself still tolerates a decimal
 * (the manual field allows `step="0.1"`) — rounding lives here, in the
 * derivation, not as a column constraint.
 */
export function deriveAutoKcal(inputs: AutoKcalInputs): number {
  const kcal =
    4 * contribution(inputs.proteinG) +
    4 * contribution(inputs.carbsG) +
    9 * contribution(inputs.fatG);
  return Math.round(kcal);
}
