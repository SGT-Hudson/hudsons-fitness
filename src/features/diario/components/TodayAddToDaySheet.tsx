import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { isoDate } from '@/lib/dates';
import { roundMacro } from '@/features/recipes/macros';
import { useActivePhase } from '@/features/phases/hooks';
import { computePhaseTargets } from '@/features/phases/targets';
import { useLatestMeasurement } from '@/features/measurements/hooks';
import { useLatestTdee } from '@/features/tdee/hooks';
import type { PhaseType } from '@/core/nutritionTone';
import { useMealLogsForDay } from '../hooks';
import { computeMealLogMacros, sumMacros } from '../macros';
import type { MealType } from '../api';
import { AddToDaySheet, type AddSheetSelection } from './AddToDaySheet';
import { ADD_SHEET_MEAL_TYPES, type MealSubtotals } from './MealSlotSelector';

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
 * the recipe read view next) should not have to know how targets are computed.
 *
 * Mount it only while the sheet is open — it holds four queries.
 */
export function TodayAddToDaySheet({ open, onOpenChange, selection }: Props) {
  const { t: tPhases } = useTranslation('objetivos');
  const date = isoDate();

  const logs = useMealLogsForDay(date);
  const activePhase = useActivePhase();
  const latestMeasurement = useLatestMeasurement();
  const latestTdee = useLatestTdee();

  const entries = useMemo(() => logs.data ?? [], [logs.data]);

  const mealSubtotals = useMemo<MealSubtotals>(() => {
    const out: MealSubtotals = {};
    for (const mt of ADD_SHEET_MEAL_TYPES) {
      const items = entries.filter((l) => (l.meal_type as MealType) === mt);
      if (items.length > 0) {
        out[mt] = roundMacro(sumMacros(items.map(computeMealLogMacros)).kcal);
      }
    }
    return out;
  }, [entries]);

  // Land on the first still-empty slot, as Diario's own header action does.
  const initialMealType = useMemo<MealType>(
    () =>
      ADD_SHEET_MEAL_TYPES.find(
        (mt) => !entries.some((l) => (l.meal_type as MealType) === mt),
      ) ?? 'breakfast',
    [entries],
  );

  const totals = useMemo(
    () => sumMacros(entries.map((l) => computeMealLogMacros(l))),
    [entries],
  );

  const targets = useMemo(() => {
    if (!activePhase.data || !latestMeasurement.data?.weight_kg) return undefined;
    return (
      computePhaseTargets(
        activePhase.data,
        latestMeasurement.data.weight_kg,
        latestMeasurement.data.body_fat_pct,
        latestTdee.data?.estimated_tdee_kcal ?? null,
      ) ?? undefined
    );
  }, [activePhase.data, latestMeasurement.data, latestTdee.data]);

  const phaseType = activePhase.data?.phase_type as PhaseType | undefined;
  const phaseLabel = phaseType ? tPhases(`phases.type.${phaseType}`) : undefined;

  return (
    <AddToDaySheet
      open={open}
      onOpenChange={onOpenChange}
      loggedOn={date}
      initialMealType={initialMealType}
      mealSubtotals={mealSubtotals}
      totals={totals}
      targets={targets}
      phaseLabel={phaseLabel}
      initialSelection={selection}
    />
  );
}
