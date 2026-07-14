// Shaping (not statistics) for the `/progress/history` screen: the flat list of
// measurements becomes newest-first month groups, each row carrying its weight
// change against the previous measurement.
//
// The delta here is a plain point-to-point subtraction between two logged
// weights — deliberately NOT a trend. Rates, smoothing and 7-day windows belong
// to `trend.ts` (and MA5 to the DB view); nothing of that kind is recomputed.

import type { BodyMeasurement } from './api';

export interface HistoryRow {
  measurement: BodyMeasurement;
  /**
   * kg change against the previous measurement that has a weight. `null` for
   * the oldest row of the loaded range (no predecessor is loaded) and for rows
   * with no weight of their own.
   */
  deltaKg: number | null;
}

export interface MonthGroup {
  /** 'YYYY-MM' — the React key. */
  key: string;
  /** First day of the month ('YYYY-MM-01'), ready for `formatDate`. */
  monthStart: string;
  /** Newest first. */
  rows: HistoryRow[];
}

/**
 * Group measurements by calendar month, newest month first and newest row
 * first inside each. Input order does not matter.
 */
export function groupMeasurementsByMonth(measurements: BodyMeasurement[]): MonthGroup[] {
  // Deltas are chronological, so walk ascending, then flip for presentation.
  const ascending = [...measurements].sort((a, b) =>
    a.measured_on.localeCompare(b.measured_on),
  );

  const rows: HistoryRow[] = [];
  let previousWeightKg: number | null = null;
  for (const measurement of ascending) {
    const weight = measurement.weight_kg;
    const deltaKg =
      weight != null && previousWeightKg != null ? weight - previousWeightKg : null;
    if (weight != null) previousWeightKg = weight;
    rows.push({ measurement, deltaKg });
  }

  const byMonth = new Map<string, HistoryRow[]>();
  for (const row of rows) {
    const key = row.measurement.measured_on.slice(0, 7);
    const bucket = byMonth.get(key);
    if (bucket) bucket.push(row);
    else byMonth.set(key, [row]);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, monthRows]) => ({
      key,
      monthStart: `${key}-01`,
      rows: [...monthRows].reverse(),
    }));
}
