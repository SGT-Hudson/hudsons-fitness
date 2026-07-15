import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Macros } from '@/features/recipes/macros';
import { roundMacro } from '@/features/recipes/macros';
import { useActivePhase } from '@/features/phases/hooks';
import { computePhaseTargets } from '@/features/phases/targets';
import { useLatestMeasurement } from '@/features/measurements/hooks';
import { useLatestTdee } from '@/features/tdee/hooks';
import type { PhaseType } from '@/core/nutritionTone';
import { useMealLogsForDay } from './hooks';
import { computeMealLogMacros, sumMacros } from './macros';
import { MEAL_TYPE_ORDER, type MealLogWithJoins, type MealType } from './api';
import { ADD_SHEET_MEAL_TYPES, type MealSubtotals } from './components/MealSlotSelector';

export interface DayContext {
  /** The day's meal-log query — `isLoading` / `isError` included. */
  logs: ReturnType<typeof useMealLogsForDay>;
  activePhase: ReturnType<typeof useActivePhase>;
  latestMeasurement: ReturnType<typeof useLatestMeasurement>;
  latestTdee: ReturnType<typeof useLatestTdee>;
  /** The day's entries (`[]` while loading). */
  entries: MealLogWithJoins[];
  /** Entries bucketed by meal slot, in `MEAL_TYPE_ORDER`. */
  grouped: Map<MealType, MealLogWithJoins[]>;
  /** Per-slot kcal subtotal for the add-sheet's meal-slot selector. */
  mealSubtotals: MealSubtotals;
  /** First still-empty real meal slot — the add-sheet's default. */
  defaultAddSlot: MealType;
  totals: Macros;
  targets?: Macros;
  phaseType?: PhaseType;
  /** Active phase label for the sheet's header subline (e.g. "Definición"). */
  phaseLabel?: string;
}

/**
 * Everything a caller needs to open the add-to-day sheet on a given day: the
 * day's entries, the per-slot subtotals, the running totals, the phase targets
 * behind the balance footer, and the slot the sheet should land on.
 *
 * It exists because two surfaces need the same day context — Diario itself and
 * `TodayAddToDaySheet` (the connector the Recetas list and the recipe read view
 * mount) — and the derivation is Diario's to own, not something a page outside
 * Diario should re-implement.
 *
 * Four queries; every consumer mounts it only where it needs the context.
 */
export function useDayContext(date: string): DayContext {
  const { t: tPhases } = useTranslation('objetivos');

  const logs = useMealLogsForDay(date);
  const activePhase = useActivePhase();
  const latestMeasurement = useLatestMeasurement();
  const latestTdee = useLatestTdee();

  const entries = useMemo(() => logs.data ?? [], [logs.data]);

  const grouped = useMemo(() => {
    const map = new Map<MealType, MealLogWithJoins[]>();
    for (const mt of MEAL_TYPE_ORDER) map.set(mt, []);
    for (const log of entries) {
      const mt = (log.meal_type as MealType) ?? 'other';
      const list = map.get(mt) ?? [];
      list.push(log);
      map.set(mt, list);
    }
    return map;
  }, [entries]);

  // Built from the SAME helpers as the meal cards' subtotal so the two always
  // match.
  const mealSubtotals = useMemo<MealSubtotals>(() => {
    const out: MealSubtotals = {};
    for (const mt of ADD_SHEET_MEAL_TYPES) {
      const items = grouped.get(mt) ?? [];
      if (items.length > 0) {
        out[mt] = roundMacro(sumMacros(items.map(computeMealLogMacros)).kcal);
      }
    }
    return out;
  }, [grouped]);

  // The first still-empty real meal, so the sheet lands on a sensible slot
  // instead of a hardcoded breakfast.
  const defaultAddSlot: MealType = useMemo(
    () => ADD_SHEET_MEAL_TYPES.find((mt) => (grouped.get(mt)?.length ?? 0) === 0) ?? 'breakfast',
    [grouped],
  );

  const totals = useMemo(() => sumMacros(entries.map((l) => computeMealLogMacros(l))), [entries]);

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

  return {
    logs,
    activePhase,
    latestMeasurement,
    latestTdee,
    entries,
    grouped,
    mealSubtotals,
    defaultAddSlot,
    totals,
    targets,
    phaseType,
    phaseLabel,
  };
}
