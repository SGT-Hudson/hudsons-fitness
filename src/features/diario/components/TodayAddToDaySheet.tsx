import { useMemo } from 'react';
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
 * The identity of a selection: the sheet only needs to (re)open on it when the
 * item behind it changes, not when the caller happens to rebuild the object.
 */
function selectionKey(selection: AddSheetSelection | null | undefined): string {
  if (!selection) return '';
  if (selection.kind === 'recipe') return `recipe:${selection.recipe.id}`;
  if (selection.kind === 'ingredient') return `ingredient:${selection.ingredient.id}`;
  return 'custom';
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

  // `initialSelection` is a dependency of the sheet's reset effect: an object
  // rebuilt on a parent re-render would re-fire it and snap the user's chosen
  // meal slot back to the default mid-flow. Freeze it here, keyed on the item's
  // identity, so no call site has to remember to memoise.
  const key = selectionKey(selection);
  const stableSelection = useMemo<AddSheetSelection | null>(
    () => selection ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` IS the selection's identity
    [key],
  );

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
      initialSelection={stableSelection}
    />
  );
}
