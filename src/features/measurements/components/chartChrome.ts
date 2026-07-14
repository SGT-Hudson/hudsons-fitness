import type { CSSProperties } from 'react';

/**
 * Shared recharts chrome for the Progreso charts, so the weight chart and the
 * composition chart cannot drift apart. Ports the canvas's chart styling only —
 * thin gridlines, dim tabular tick labels, a light tooltip card.
 */

/** Dim, tabular tick labels (`--text-dim` + `.tnum`), as the canvas draws them. */
export const AXIS_TICK = {
  fontSize: 10,
  fill: 'var(--text-dim)',
  className: 'tnum',
} as const;

export const TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 12,
};

/**
 * The one composition palette (R-33 wave 7). Fat is warm orange, muscle IS the
 * nutri green, water is cool blue — tokens, not literals, so both themes and
 * both charts stay in step. See `--comp-*` in `src/index.css`.
 */
export const COMPOSITION_COLORS = {
  fat: 'var(--comp-fat)',
  muscle: 'var(--comp-muscle)',
  water: 'var(--comp-water)',
} as const;

export type CompositionSeriesKey = keyof typeof COMPOSITION_COLORS;

/** Draw order of the three series (chart lines, legend, sparkline cards). */
export const COMPOSITION_SERIES: readonly CompositionSeriesKey[] = [
  'fat',
  'muscle',
  'water',
] as const;
