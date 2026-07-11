import { describe, it, expect } from 'vitest';
import {
  previewMealTimes,
  DEFAULT_TEMPLATE_MEAL_TIMES,
  type PreviewSlot,
} from './templatePreview';

const slot = (day_of_week: number, meal_index: number, meal_time: string | null): PreviewSlot => ({
  day_of_week,
  meal_index,
  meal_time,
});

describe('previewMealTimes', () => {
  it("takes Monday's distinct times, sorted", () => {
    expect(
      previewMealTimes([
        slot(0, 1, '13:00:00'),
        slot(0, 0, '08:00:00'),
        slot(0, 0, '08:00:00'), // a second recipe in the same meal — one time
        slot(3, 2, '21:00:00'), // Thursday's times never reach the template default
      ]),
    ).toEqual(['08:00:00', '13:00:00']);
  });

  it('falls back to the four default times when Monday has no slot', () => {
    expect(previewMealTimes([slot(2, 0, '09:00:00')])).toEqual(DEFAULT_TEMPLATE_MEAL_TIMES);
  });

  it('falls back when the week has no slots at all', () => {
    expect(previewMealTimes([])).toEqual(DEFAULT_TEMPLATE_MEAL_TIMES);
  });

  it('ignores untimed Monday slots, and falls back when Monday has only those', () => {
    expect(previewMealTimes([slot(0, 0, null), slot(0, 1, '13:00:00')])).toEqual(['13:00:00']);
    expect(previewMealTimes([slot(0, 0, null)])).toEqual(DEFAULT_TEMPLATE_MEAL_TIMES);
  });

  // source_template_id is ON DELETE SET NULL: the week keeps its slots (and
  // their meal_time) but reports no template meal times. The RPC still derives
  // the new template's defaults from Monday — so the preview must too.
  it('derives from the slots even when the source template is gone', () => {
    expect(previewMealTimes([slot(0, 0, '07:30:00'), slot(0, 1, '12:15:00')])).toEqual([
      '07:30:00',
      '12:15:00',
    ]);
  });
});
