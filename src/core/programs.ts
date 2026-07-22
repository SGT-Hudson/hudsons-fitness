/**
 * Pure cyclic-program math + routine→session prefill. No clock (callers
 * pass ISO dates), no I/O. Dates are plain calendar dates (YYYY-MM-DD);
 * timezone is the caller's concern. Spec §5.
 */

export interface ProgramDaySlot {
  dayIndex: number;
  isRest: boolean;
  routineId: string | null;
}

export interface RoutineExercisePrescription {
  exerciseId: string;
  position: number;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number | null;
  targetRpe: number | null;
  warmupSets: { pct: number; reps: number }[];
  lastWorkingWeightKg: number | null;
}

/** Whole-day number for an ISO calendar date (UTC midnight epoch days). */
function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Add `n` whole days to an ISO date, returning a new ISO date. */
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** 0-based position in the cycle for a date. Floored modulo so dates
 *  before the anchor still map into 0..cycleLength-1. Returns 0 for a
 *  non-positive cycle length (caller treats as unscheduled). */
export function cycleDayForDate(anchorISO: string, dateISO: string, cycleLength: number): number {
  if (cycleLength <= 0) return 0;
  const delta = dayNumber(dateISO) - dayNumber(anchorISO);
  return ((delta % cycleLength) + cycleLength) % cycleLength;
}

/** The slot scheduled for a date, or null if the program has no days. */
export function scheduledSlotForDate(
  days: ProgramDaySlot[],
  anchorISO: string,
  dateISO: string,
): ProgramDaySlot | null {
  if (days.length === 0) return null;
  const idx = cycleDayForDate(anchorISO, dateISO, days.length);
  return days.find((s) => s.dayIndex === idx) ?? null;
}

export interface ProjectedDay {
  dateISO: string;
  slot: ProgramDaySlot | null;
}

/** Project the cycle onto `count` consecutive days starting at `fromISO`. */
export function projectCycle(
  days: ProgramDaySlot[],
  anchorISO: string,
  fromISO: string,
  count: number,
): ProjectedDay[] {
  const out: ProjectedDay[] = [];
  for (let i = 0; i < count; i += 1) {
    const dateISO = addDays(fromISO, i);
    out.push({ dateISO, slot: scheduledSlotForDate(days, anchorISO, dateISO) });
  }
  return out;
}

export interface NextScheduledRoutine {
  dateISO: string;
  routineId: string;
  /** 0 = today, 1 = tomorrow… */
  daysAhead: number;
}

/**
 * The next day of the cycle that trains a routine, scanning forward from
 * `fromISO` (inclusive) over one full cycle. Rest days and slots whose
 * routine no longer exists are skipped; `knownRoutineIds`, when given,
 * defines "exists". Returns null when the program never trains — no days,
 * an all-rest cycle, or every scheduled routine deleted. R-31.
 */
export function nextScheduledRoutine(
  days: ProgramDaySlot[],
  anchorISO: string,
  fromISO: string,
  knownRoutineIds?: ReadonlySet<string>,
): NextScheduledRoutine | null {
  if (days.length === 0) return null;
  for (const { dateISO, slot } of projectCycle(days, anchorISO, fromISO, days.length)) {
    if (!slot || slot.isRest || !slot.routineId) continue;
    if (knownRoutineIds && !knownRoutineIds.has(slot.routineId)) continue;
    return {
      dateISO,
      routineId: slot.routineId,
      daysAhead: dayNumber(dateISO) - dayNumber(fromISO),
    };
  }
  return null;
}

export interface PrefillSet {
  setIndex: number;
  isWarmup: boolean;
  reps: number | null;       // concrete reps (warm-ups); null for working sets
  weightKg: number | null;   // concrete computed weight (warm-ups); null for working sets
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number | null;
  targetRpe: number | null;
}

/** Warm-up load = working weight × pct, rounded to the nearest `roundKg`
 *  (default 2.5 kg — barbell-friendly). Returns 0 for non-positive / invalid
 *  inputs (caller renders a blank weight to fill in). */
export function warmupWeightKg(workingWeightKg: number, pct: number, roundKg = 2.5): number {
  if (!Number.isFinite(workingWeightKg) || workingWeightKg <= 0 || !Number.isFinite(pct) || pct <= 0) return 0;
  return Math.round((workingWeightKg * (pct / 100)) / roundKg) * roundKg;
}

export interface PrefillExercise {
  exerciseId: string;
  sets: PrefillSet[];
}

/** Expand a routine's prescriptions into set rows for the editor:
 *  warmup rows first (isWarmup:true with computed weight), then targetSets
 *  working rows (isWarmup:false, weight null), all with a continuous
 *  setIndex starting at 1 per exercise (ordered by position). Spec §5. */
export function prefillSetsFromRoutine(
  exercises: RoutineExercisePrescription[],
): PrefillExercise[] {
  return [...exercises]
    .sort((a, b) => a.position - b.position)
    .map((ex) => {
      const sets: PrefillSet[] = [];
      let idx = 1;

      // Warmup sets
      for (const w of ex.warmupSets) {
        sets.push({
          setIndex: idx++,
          isWarmup: true,
          reps: w.reps,
          weightKg:
            ex.lastWorkingWeightKg != null
              ? warmupWeightKg(ex.lastWorkingWeightKg, w.pct)
              : null,
          targetRepsMin: ex.targetRepsMin,
          targetRepsMax: ex.targetRepsMax,
          restSeconds: ex.restSeconds,
          targetRpe: ex.targetRpe,
        });
      }

      // Working sets
      for (let i = 0; i < ex.targetSets; i++) {
        sets.push({
          setIndex: idx++,
          isWarmup: false,
          reps: null,
          weightKg: null,
          targetRepsMin: ex.targetRepsMin,
          targetRepsMax: ex.targetRepsMax,
          restSeconds: ex.restSeconds,
          targetRpe: ex.targetRpe,
        });
      }

      return { exerciseId: ex.exerciseId, sets };
    });
}
