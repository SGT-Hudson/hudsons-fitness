// Shared pure cron-liveness core (R-18 / D-F5).
//
// Dependency-free freshness logic for the cron liveness healthcheck. Lives in
// the runtime-agnostic core (same rationale as `src/core/dates.ts`): the
// `cron-healthcheck` edge function imports it via a relative path under Deno,
// and Vitest imports it via `@/core/liveness` under Node, so the "is the data
// stale?" predicate has ONE implementation with deterministic unit tests
// (frozen-clock pattern — every fn takes the reference "today" explicitly,
// nothing reads the wall clock here).
//
// Only the standard `Date` global is used (no `date-fns`, no `Intl` — callers
// pass already-TZ-resolved YYYY-MM-DD strings; the Madrid TZ resolution is
// done by `src/core/dates.ts`'s `todayInTZ()` at the edge boundary).

/**
 * Whole calendar days between two YYYY-MM-DD dates (`to - from`), using UTC
 * midnights so DST never shifts the count. Negative if `to` precedes `from`.
 * Both inputs are plain calendar dates (no time component), which is exactly
 * the shape of `daily_nutrition_history.logged_on` /
 * `tdee_estimates.computed_on` and of `todayInTZ()`.
 */
export function daysBetweenISO(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.split('-').map(Number);
  const [ty, tm, td] = toISO.split('-').map(Number);
  const fromMs = Date.UTC(fy, fm - 1, fd);
  const toMs = Date.UTC(ty, tm - 1, td);
  return Math.round((toMs - fromMs) / 86_400_000);
}

/**
 * Staleness thresholds, in whole calendar days, for each tracked table.
 *
 * Cadence reasoning (see PR body / operations.md Cron runbook):
 *  - `daily-nutrition-snapshot` runs `0 1 * * *` UTC and writes the row for the
 *    *previous* Europe/Madrid day, so the freshest `logged_on` is inherently
 *    ~1 day behind "today in Madrid" even when perfectly healthy. The
 *    healthcheck itself runs `0 6 * * *` UTC, after all three cron jobs.
 *  - Allowing 1 day of inherent snapshot lag + tolerating exactly one
 *    transient missed run (anti-flap) + the ±1h UTC/DST drift (D-F4) gives a
 *    DAILY_HISTORY threshold of 2 days: a single missed daily run does NOT
 *    alert; two consecutive missed days DO. This is the failure mode D-F5
 *    targets (missing Vault secret / pg_cron skipped-overrun → silent
 *    under-run, also the free-tier keep-alive).
 *  - `tdee_estimates` is legitimately sparser: `recalculate-tdee` skips users
 *    with <10 intake days (`insufficient_intake`), so its freshest
 *    `computed_on` can lag the snapshot for data reasons, not cron death. It
 *    is therefore a secondary signal with a more lenient 4-day threshold.
 */
export const STALE_AFTER_DAYS = {
  daily_history: 2,
  tdee_estimates: 4,
} as const;

export type TrackedTable = keyof typeof STALE_AFTER_DAYS;

export interface FreshnessInput {
  table: TrackedTable;
  /** Newest date present in the table (YYYY-MM-DD), or null if the table is empty. */
  latestISO: string | null;
  /** Reference "today" (YYYY-MM-DD), Europe/Madrid-resolved by the caller. */
  todayISO: string;
}

export interface FreshnessResult {
  table: TrackedTable;
  latestISO: string | null;
  /** Whole days between `latestISO` and `todayISO`; null when the table is empty. */
  ageDays: number | null;
  thresholdDays: number;
  /** True when the data is older than its threshold OR the table is empty. */
  stale: boolean;
  reason: 'ok' | 'stale' | 'empty';
}

/**
 * Pure staleness predicate for one table. Empty tables are treated as STALE
 * (`reason: 'empty'`): a totally empty `daily_nutrition_history` after the
 * jobs have had time to run is itself a dead-cron signal, not a healthy state.
 * A future date (clock skew / manual backfill) yields ageDays < 0 → never
 * stale on the lower bound, which is the correct, non-flapping behavior.
 */
export function evaluateFreshness(input: FreshnessInput): FreshnessResult {
  const thresholdDays = STALE_AFTER_DAYS[input.table];
  if (input.latestISO === null) {
    return {
      table: input.table,
      latestISO: null,
      ageDays: null,
      thresholdDays,
      stale: true,
      reason: 'empty',
    };
  }
  const ageDays = daysBetweenISO(input.latestISO, input.todayISO);
  const stale = ageDays > thresholdDays;
  return {
    table: input.table,
    latestISO: input.latestISO,
    ageDays,
    thresholdDays,
    stale,
    reason: stale ? 'stale' : 'ok',
  };
}

/**
 * Roll up per-table results into an alert decision.
 *
 * `daily_history` is the PRIMARY liveness signal (the snapshot job is the one
 * that also keeps the free-tier project alive); a stale-or-empty
 * `daily_history` always alerts. A stale `tdee_estimates` alone is a softer
 * secondary signal (it can lag for legitimate data reasons) — it contributes
 * to the alert only when `daily_history` is ALSO stale, so a healthy snapshot
 * with sparse TDEE data does not flap. The single stale-tdee-only case is
 * surfaced in the message for the operator but does not raise the alert.
 */
export interface AlertDecision {
  alert: boolean;
  results: FreshnessResult[];
  message: string;
}

export function decideAlert(results: FreshnessResult[]): AlertDecision {
  const daily = results.find((r) => r.table === 'daily_history');
  const tdee = results.find((r) => r.table === 'tdee_estimates');

  const dailyStale = daily?.stale === true;
  const alert = dailyStale;

  const parts = results.map((r) => {
    if (r.reason === 'empty') return `${r.table}=EMPTY`;
    return `${r.table}=${r.ageDays}d/${r.thresholdDays}d${r.stale ? ' STALE' : ''}`;
  });

  let headline: string;
  if (alert) {
    headline = 'CRON LIVENESS ALERT: daily_nutrition_history is stale — the daily cron is not running';
  } else if (tdee?.stale === true) {
    headline =
      'cron liveness OK (daily snapshot fresh); note: tdee_estimates is stale (often legitimate — sparse intake data, not necessarily a dead cron)';
  } else {
    headline = 'cron liveness OK';
  }

  return { alert, results, message: `${headline} [${parts.join(', ')}]` };
}
