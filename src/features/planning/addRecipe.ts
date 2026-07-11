import { add, scale, ZERO_MACROS, type Macros } from '@/features/recipes/macros';

export interface DayProjection {
  /** The day WITHOUT the entry being added or edited. */
  base: Macros;
  /** What this serving contributes. */
  added: Macros;
  /** base + added — what the day becomes if the user confirms. */
  projected: Macros;
}

/**
 * Project a plan day's macros with a candidate recipe. Pure — the caller
 * supplies the day's totals and the recipe's per-serving macros, both of which
 * the planner already holds client-side (`useActiveWeek` slots carry macros,
 * `useRecipes` carries `perServing`). No fetch, no rounding: round at render.
 *
 * `replacing` is the macros of the entry being EDITED. It must come out of the
 * base, or the entry is counted twice (the same trap the Diario's ración step
 * solved with `racionBase`).
 */
export function projectDay({
  dayTotals,
  perServing,
  servings,
  replacing,
}: {
  dayTotals: Macros;
  perServing: Macros;
  servings: number;
  replacing?: Macros;
}): DayProjection {
  const base = replacing ? add(dayTotals, scale(replacing, -1)) : dayTotals;
  const added = servings > 0 ? scale(perServing, servings) : ZERO_MACROS;
  return { base, added, projected: add(base, added) };
}
