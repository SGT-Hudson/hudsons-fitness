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

export interface PrefillSet {
  setIndex: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number | null;
  targetRpe: number | null;
}

export interface PrefillExercise {
  exerciseId: string;
  sets: PrefillSet[];
}

/** Expand a routine's prescriptions into empty set rows for the editor:
 *  targetSets rows per exercise (ordered by position), targets carried,
 *  weight left to runtime. Spec §5. */
export function prefillSetsFromRoutine(
  exercises: RoutineExercisePrescription[],
): PrefillExercise[] {
  return [...exercises]
    .sort((a, b) => a.position - b.position)
    .map((ex) => ({
      exerciseId: ex.exerciseId,
      sets: Array.from({ length: ex.targetSets }, (_, i) => ({
        setIndex: i + 1,
        targetRepsMin: ex.targetRepsMin,
        targetRepsMax: ex.targetRepsMax,
        restSeconds: ex.restSeconds,
        targetRpe: ex.targetRpe,
      })),
    }));
}
