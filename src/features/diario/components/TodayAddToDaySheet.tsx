import { isoDate } from '@/lib/dates';
import { useDayContext } from '../useDayContext';
import { AddToDaySheet, type AddSheetSelection } from './AddToDaySheet';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselected item — the sheet opens straight on its ración step. */
  selection?: AddSheetSelection | null;
}

/**
 * `AddToDaySheet` wired to **today** — the same sheet, not a second one. It
 * exists because the sheet needs the day's context (slot subtotals, totals,
 * phase targets) to draw its balance footer, and that context is Diario's to
 * assemble: a page outside Diario (the Recetas list's "+ añadir al diario", and
 * the recipe read view) should not have to know how targets are computed. The
 * derivation itself is `useDayContext`, shared with Diario.
 *
 * Mount it only while the sheet is open — it holds four queries.
 */
export function TodayAddToDaySheet({ open, onOpenChange, selection }: Props) {
  const date = isoDate();
  const { mealSubtotals, defaultAddSlot, totals, targets, phaseLabel } = useDayContext(date);

  return (
    <AddToDaySheet
      open={open}
      onOpenChange={onOpenChange}
      loggedOn={date}
      initialMealType={defaultAddSlot}
      mealSubtotals={mealSubtotals}
      totals={totals}
      targets={targets}
      phaseLabel={phaseLabel}
      initialSelection={selection ?? null}
    />
  );
}
