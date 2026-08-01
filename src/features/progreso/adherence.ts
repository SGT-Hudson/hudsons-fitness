// Nutrition adherence, per day, as calendar cells (R-38 / D-F29).
//
// The denominator is the PHASE's kcal target for that day, not the meal plan:
// the plan measures fidelity to a plan that may itself have been wrong, while
// the phase target is the number the user signed up for. It is cheap to
// reconstruct historically because `computeDailyMacroTargets` derives kcal from
// the phase alone — `kcal_value` in absolute mode, `estimate + kcal_value` in
// tdee_delta mode, where the estimate is the most recent one on or before that
// day (carried forward up to `MAX_ESTIMATE_CARRY_DAYS`, see `targetKcalOnDate`).
// Neither weight nor body fat enters kcal (they only enter protein), so no
// per-day weight lookup is needed.
//
// Dependency-free and deterministic, so it is unit-tested in isolation (Tier-1).

export type AdherenceState =
  /** A target existed, kcal were logged, |deviation| <= ON_TARGET_PCT. */
  | 'enObjetivo'
  /** A target existed, kcal were logged, ON_TARGET_PCT < |deviation| <= NEAR_PCT. */
  | 'cerca'
  /** A target existed, kcal were logged, |deviation| > NEAR_PCT. */
  | 'lejos'
  /** A target existed but nothing was logged that day. */
  | 'sinRegistrar'
  /** No phase was in force (or a tdee_delta phase had no estimate within
   *  MAX_ESTIMATE_CARRY_DAYS of the date). */
  | 'sinObjetivo'
  /** Before the first snapshot row: the app was not recording yet. Not drawn. */
  | 'sinDatos';

export interface AdherenceDay {
  /** ISO `yyyy-MM-dd`. */
  date: string;
  targetKcal: number | null;
  consumedKcal: number | null;
  /** Signed percent: positive = ate over target. */
  deviationPct: number | null;
  state: AdherenceState;
}

/** The slice of `phases` this module needs. */
export interface AdherencePhase {
  start_date: string;
  end_date: string | null;
  kcal_mode: string;
  kcal_value: number;
}

export interface AdherenceInput {
  /** Inclusive ISO start of the window. */
  from: string;
  /** Inclusive ISO end of the window. */
  to: string;
  /** Oldest `logged_on` on record; null when there are no snapshots at all. */
  firstSnapshotDate: string | null;
  /** `consumed_kcal` by `logged_on`. A present key with a null value means
   *  "the snapshot ran and found nothing logged". */
  consumedByDate: Map<string, number | null>;
  phases: AdherencePhase[];
  /** `estimated_tdee_kcal` by `computed_on`. Only tdee_delta phases read it,
   *  and they may read a prior date's entry — see `targetKcalOnDate`. */
  tdeeByDate: Map<string, number>;
}

/** Within this percent of target, the day counts as hit. */
export const ON_TARGET_PCT = 10;
/** Beyond this percent, the day is a clear miss. */
export const NEAR_PCT = 20;
/** How many days a `tdee_estimates` row may be carried forward as "today's"
 *  estimate in tdee_delta mode. The estimator runs daily, so a gap under a
 *  week is just a missed cron run — the last estimate is still the number
 *  the app itself was showing at the time. Past a week the trail has gone
 *  cold and inventing a target would be worse than admitting there isn't
 *  one. */
export const MAX_ESTIMATE_CARRY_DAYS = 7;

/** ISO date strings sort lexicographically, so plain comparison is a date
 *  comparison — no Date objects and no timezone in the boundary test. */
export function phaseOnDate(
  phases: AdherencePhase[],
  date: string,
): AdherencePhase | null {
  return (
    phases.find(
      (p) =>
        p.start_date <= date && (p.end_date == null || p.end_date >= date),
    ) ?? null
  );
}

/** `date` minus `days`, in UTC — same day-arithmetic convention as
 *  `eachDayISO` below, for the same DST reason. */
function isoDateMinusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** The most recent `tdee_estimates` row on or before `date`, walking
 *  backward day by day and stopping at `MAX_ESTIMATE_CARRY_DAYS`. The live
 *  app reads the *latest* estimate when it shows today's target — reading
 *  only that exact date's row when reconstructing history would be a
 *  stricter rule than what the user actually experienced, so this carries
 *  the last known estimate forward, capped so a long gap still reports
 *  honestly instead of inventing a target. */
function latestEstimateOnOrBefore(
  tdeeByDate: Map<string, number>,
  date: string,
): number | null {
  for (let back = 0; back <= MAX_ESTIMATE_CARRY_DAYS; back += 1) {
    const estimate = tdeeByDate.get(isoDateMinusDays(date, back));
    if (estimate != null) return estimate;
  }
  return null;
}

export function targetKcalOnDate(
  phases: AdherencePhase[],
  date: string,
  tdeeByDate: Map<string, number>,
): number | null {
  const phase = phaseOnDate(phases, date);
  if (!phase) return null;
  if (phase.kcal_mode === 'absolute') return phase.kcal_value;
  const tdee = latestEstimateOnOrBefore(tdeeByDate, date);
  if (tdee == null) return null;
  return tdee + phase.kcal_value;
}

/** Walk in UTC: local-midnight arithmetic silently repeats or skips a day
 *  across a DST boundary, and this walk is 182 days long. */
function eachDayISO(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function buildAdherenceDays(input: AdherenceInput): AdherenceDay[] {
  const { from, to, firstSnapshotDate, consumedByDate, phases, tdeeByDate } = input;

  return eachDayISO(from, to).map((date): AdherenceDay => {
    if (firstSnapshotDate == null || date < firstSnapshotDate) {
      return { date, targetKcal: null, consumedKcal: null, deviationPct: null, state: 'sinDatos' };
    }

    const targetKcal = targetKcalOnDate(phases, date, tdeeByDate);
    const consumedKcal = consumedByDate.get(date) ?? null;

    if (targetKcal == null || targetKcal <= 0) {
      return { date, targetKcal: null, consumedKcal, deviationPct: null, state: 'sinObjetivo' };
    }
    if (consumedKcal == null) {
      return { date, targetKcal, consumedKcal: null, deviationPct: null, state: 'sinRegistrar' };
    }

    const deviationPct = ((consumedKcal - targetKcal) / targetKcal) * 100;
    const abs = Math.abs(deviationPct);
    const state: AdherenceState =
      abs <= ON_TARGET_PCT ? 'enObjetivo' : abs <= NEAR_PCT ? 'cerca' : 'lejos';
    return { date, targetKcal, consumedKcal, deviationPct, state };
  });
}

/** Monday = 0 … Sunday = 6, read in UTC to match `eachDayISO`. */
function weekdayIndex(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * Reshape the flat day list into 7 rows (Mon…Sun) by N week columns, padding
 * both ends with nulls so every row is the same length.
 *
 * The reshape is done here, in JS, rather than left to CSS grid auto-flow: the
 * component then renders a plain row-major loop, and the layout is assertable
 * in a jsdom test instead of depending on styles jsdom cannot see.
 */
export function toWeekGrid(days: AdherenceDay[]): (AdherenceDay | null)[][] {
  const rows: (AdherenceDay | null)[][] = [[], [], [], [], [], [], []];
  if (days.length === 0) return rows;

  const lead = weekdayIndex(days[0].date);
  const cells: (AdherenceDay | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...days,
  ];
  const columns = Math.ceil(cells.length / 7);
  while (cells.length < columns * 7) cells.push(null);

  for (let i = 0; i < cells.length; i += 1) {
    rows[i % 7].push(cells[i]);
  }
  return rows;
}
