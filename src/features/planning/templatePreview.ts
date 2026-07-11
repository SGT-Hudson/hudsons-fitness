import type { GridSlot } from '@/features/templates/filledGrid';

/** A week slot reduced to what the save-as-template preview needs. */
export interface PreviewSlot extends GridSlot {
  /** The slot's own time ('08:00:00' | null) — NOT the source template's. */
  meal_time: string | null;
}

/** `save_week_as_template`'s fallback when Monday carries no timed slot. */
export const DEFAULT_TEMPLATE_MEAL_TIMES = ['08:00', '13:00', '17:00', '21:00'];

/**
 * The `default_meal_times` a week would become as a template — mirrors
 * `save_week_as_template`: Monday's distinct, sorted `meal_time` values, with
 * the four default times when Monday has none.
 *
 * The week's OWN `meal_times` cannot stand in for this: they come from the
 * source template (`source_template_id` is ON DELETE SET NULL, so they are
 * empty once it is deleted) and they describe what the week was OFFERED, not
 * what Monday actually holds — the preview would then promise a card the RPC
 * never creates.
 */
export function previewMealTimes(slots: PreviewSlot[]): string[] {
  const mondayTimes = slots
    .filter((s) => s.day_of_week === 0 && s.meal_time != null)
    .map((s) => s.meal_time as string);
  const distinct = [...new Set(mondayTimes)].sort();
  return distinct.length > 0 ? distinct : [...DEFAULT_TEMPLATE_MEAL_TIMES];
}
