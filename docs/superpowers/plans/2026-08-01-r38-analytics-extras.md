# R-38 Progress Analytics Extras — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three analytics pieces to `/progress` — an energy-balance card, a Kalman projection on the weight chart, and a 26-week nutrition-adherence heatmap — with no schema change.

**Architecture:** All new logic is a dependency-free pure module (`adherence.ts`) that turns rows into grid cells; both new components are **props-in with no hooks**, so their Tier-2 tests need no Supabase mock; `ProgresoPage` is the only place that calls hooks and wires data. The ETA, computed today inside `LatestMeasurementCard`, moves into a shared `useGoalEta()` hook so the card and the chart read one number.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query, recharts, Tailwind CSS v4 (oklch tokens in `src/index.css`), i18next, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-01-r38-analytics-extras-design.md`

## Global Constraints

- **No schema change.** No migration, no RPC, no new column. The only new query is a `select('*')` on `tdee_estimates`.
- **Metric only** (kcal, kg, cm, g).
- **Numbers never go through `toFixed`.** Use `useNum()` (`dec` / `int` / `qty`) in JSX and `{{n, number}}` inside translated strings. An eslint guard enforces this.
- **`es-ES` does not group four digits**: `2100`, not `2.100`. `en-US` does (`2,100`). No test may assert a thousands separator on a 4-digit kcal figure.
- **No hardcoded colours.** Every colour is a CSS custom property in `src/index.css`, declared in **both** the light block (~line 105-200) and the `.dark` block (~line 222-300).
- **No AI/Claude attribution anywhere** — commit messages, comments, PR text. Plain conventional commits.
- **Both locales, always**: every new key lands in `src/i18n/es/metricas.json` **and** `src/i18n/en/metricas.json`.
- **Components that render data take it as props.** A component that calls a data hook drags `@/lib/supabase` into its Tier-2 test, which throws in CI where no `VITE_SUPABASE_*` exists.
- All work happens in the worktree `.claude/worktrees/r38-analytics` on branch `claude/r38-analytics`. Never commit to the main checkout.

## File Structure

| File | Responsibility | New? |
|---|---|---|
| `src/features/progreso/adherence.ts` | Pure: rows + phases + estimates → `AdherenceDay[]` → 7×N grid | create |
| `src/features/progreso/adherence.test.ts` | Tier-1 | create |
| `src/features/progreso/components/AdherenceHeatmap.tsx` | Props-in grid, legend, tap-detail line | create |
| `src/features/progreso/components/AdherenceHeatmap.test.tsx` | Tier-2 | create |
| `src/features/tdee/components/EnergyBalanceCard.tsx` | Props-in three-bar card | create |
| `src/features/tdee/components/EnergyBalanceCard.test.tsx` | Tier-2 | create |
| `src/features/tdee/api.ts` | `fetchTdeeEstimatesSince` | modify |
| `src/features/tdee/hooks.ts` | `useTdeeEstimates` | modify |
| `src/features/measurements/hooks.ts` | `useGoalEta` | modify |
| `src/features/measurements/components/LatestMeasurementCard.tsx` | consume `useGoalEta` instead of inlining | modify |
| `src/features/measurements/components/WeightChart.tsx` | optional `projection` prop | modify |
| `src/pages/ProgresoPage.tsx` | wire all three | modify |
| `src/index.css` | three `--adh-*` tokens, light + dark | modify |
| `src/i18n/{es,en}/metricas.json` | `adherence.*`, `energyBalance.*` | modify |

---

### Task 1: The adherence core

**Files:**
- Create: `src/features/progreso/adherence.ts`
- Test: `src/features/progreso/adherence.test.ts`

**Interfaces:**
- Consumes: nothing (dependency-free by design — Tier-1).
- Produces: `AdherenceState`, `AdherenceDay`, `AdherencePhase`, `AdherenceInput`, `ON_TARGET_PCT`, `NEAR_PCT`, `phaseOnDate`, `targetKcalOnDate`, `buildAdherenceDays`, `toWeekGrid`.

**Note — six states, not five.** The spec lists five. Planning surfaced a sixth: a day *before the first `daily_nutrition_history` row* is not the same as a day with a row whose `consumed_kcal` is null. The first is "the snapshot did not exist yet" and must not be drawn; the second is "you did not log". The sixth state is `sinDatos`. The spec is amended in Task 8.

- [ ] **Step 1: Write the failing test**

Create `src/features/progreso/adherence.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildAdherenceDays,
  phaseOnDate,
  targetKcalOnDate,
  toWeekGrid,
  type AdherencePhase,
} from './adherence';

const ABS: AdherencePhase = {
  start_date: '2026-03-01',
  end_date: '2026-03-31',
  kcal_mode: 'absolute',
  kcal_value: 2000,
};
const DELTA: AdherencePhase = {
  start_date: '2026-04-01',
  end_date: null,
  kcal_mode: 'tdee_delta',
  kcal_value: -500,
};

function build(over: Partial<Parameters<typeof buildAdherenceDays>[0]> = {}) {
  return buildAdherenceDays({
    from: '2026-03-01',
    to: '2026-03-03',
    firstSnapshotDate: '2026-03-01',
    consumedByDate: new Map(),
    phases: [ABS],
    tdeeByDate: new Map(),
    ...over,
  });
}

describe('phaseOnDate', () => {
  it('includes both boundary days', () => {
    expect(phaseOnDate([ABS], '2026-03-01')).toBe(ABS);
    expect(phaseOnDate([ABS], '2026-03-31')).toBe(ABS);
  });

  it('returns null the day before and the day after', () => {
    expect(phaseOnDate([ABS], '2026-02-28')).toBeNull();
    expect(phaseOnDate([ABS], '2026-04-01')).toBeNull();
  });

  it('treats a null end_date as open-ended', () => {
    expect(phaseOnDate([DELTA], '2027-01-01')).toBe(DELTA);
  });

  it('returns null inside a gap between two phases', () => {
    const later: AdherencePhase = { ...ABS, start_date: '2026-05-01', end_date: '2026-05-31' };
    expect(phaseOnDate([ABS, later], '2026-04-15')).toBeNull();
  });
});

describe('targetKcalOnDate', () => {
  it('uses kcal_value verbatim in absolute mode, ignoring any estimate', () => {
    expect(targetKcalOnDate([ABS], '2026-03-10', new Map([['2026-03-10', 9999]]))).toBe(2000);
  });

  it('adds the delta to that day’s own estimate in tdee_delta mode', () => {
    expect(targetKcalOnDate([DELTA], '2026-04-10', new Map([['2026-04-10', 2600]]))).toBe(2100);
  });

  it('returns null for a tdee_delta day with no estimate for that date', () => {
    expect(targetKcalOnDate([DELTA], '2026-04-10', new Map([['2026-04-09', 2600]]))).toBeNull();
  });
});

describe('buildAdherenceDays — state banding', () => {
  it('is enObjetivo at exactly 10 % over', () => {
    const [d] = build({ to: '2026-03-01', consumedByDate: new Map([['2026-03-01', 2200]]) });
    expect(d.state).toBe('enObjetivo');
    expect(d.deviationPct).toBeCloseTo(10, 6);
  });

  it('is enObjetivo at exactly 10 % under', () => {
    const [d] = build({ to: '2026-03-01', consumedByDate: new Map([['2026-03-01', 1800]]) });
    expect(d.state).toBe('enObjetivo');
    expect(d.deviationPct).toBeCloseTo(-10, 6);
  });

  it('tips to cerca just past 10 %', () => {
    const [d] = build({ to: '2026-03-01', consumedByDate: new Map([['2026-03-01', 2201]]) });
    expect(d.state).toBe('cerca');
  });

  it('is cerca at exactly 20 % and lejos just past it', () => {
    const [at] = build({ to: '2026-03-01', consumedByDate: new Map([['2026-03-01', 2400]]) });
    expect(at.state).toBe('cerca');
    const [past] = build({ to: '2026-03-01', consumedByDate: new Map([['2026-03-01', 2401]]) });
    expect(past.state).toBe('lejos');
  });

  it('bands under-eating by the same widths', () => {
    const [d] = build({ to: '2026-03-01', consumedByDate: new Map([['2026-03-01', 1500]]) });
    expect(d.state).toBe('lejos');
    expect(d.deviationPct).toBeCloseTo(-25, 6);
  });
});

describe('buildAdherenceDays — the non-numeric states', () => {
  it('marks a day with a target but no logged kcal as sinRegistrar', () => {
    const [d] = build({ to: '2026-03-01', consumedByDate: new Map([['2026-03-01', null]]) });
    expect(d.state).toBe('sinRegistrar');
    expect(d.targetKcal).toBe(2000);
  });

  it('treats a logged zero as a real number, not as missing', () => {
    const [d] = build({ to: '2026-03-01', consumedByDate: new Map([['2026-03-01', 0]]) });
    expect(d.state).toBe('lejos');
    expect(d.deviationPct).toBeCloseTo(-100, 6);
  });

  it('marks a day outside every phase as sinObjetivo', () => {
    const [d] = build({
      from: '2026-02-01',
      to: '2026-02-01',
      firstSnapshotDate: '2026-01-01',
      consumedByDate: new Map([['2026-02-01', 2000]]),
    });
    expect(d.state).toBe('sinObjetivo');
    expect(d.targetKcal).toBeNull();
  });

  it('marks days before the first snapshot as sinDatos, not sinRegistrar', () => {
    const [d] = build({
      from: '2026-03-01',
      to: '2026-03-01',
      firstSnapshotDate: '2026-03-05',
    });
    expect(d.state).toBe('sinDatos');
  });

  it('returns sinDatos when there is no snapshot at all', () => {
    const [d] = build({ to: '2026-03-01', firstSnapshotDate: null });
    expect(d.state).toBe('sinDatos');
  });
});

describe('buildAdherenceDays — the date walk', () => {
  it('emits every day in the inclusive range, in order', () => {
    const days = build({ from: '2026-03-01', to: '2026-03-03' });
    expect(days.map((d) => d.date)).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
  });

  it('crosses a DST boundary without dropping or repeating a day', () => {
    // Europe/Madrid springs forward on 2026-03-29.
    const days = build({ from: '2026-03-28', to: '2026-03-30' });
    expect(days.map((d) => d.date)).toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
  });
});

describe('toWeekGrid', () => {
  it('lays days out as 7 rows with Monday first and pads the leading gap', () => {
    // 2026-03-01 is a Sunday, so the first column holds 6 nulls then that day.
    const grid = toWeekGrid(build({ from: '2026-03-01', to: '2026-03-03' }));
    expect(grid).toHaveLength(7);
    expect(grid[0][0]).toBeNull(); // Monday of the first (partial) week
    expect(grid[6][0]?.date).toBe('2026-03-01'); // Sunday
    expect(grid[0][1]?.date).toBe('2026-03-02'); // Monday of week 2
    expect(grid[1][1]?.date).toBe('2026-03-03');
  });

  it('pads the trailing gap so every row has the same column count', () => {
    const grid = toWeekGrid(build({ from: '2026-03-01', to: '2026-03-03' }));
    const widths = new Set(grid.map((row) => row.length));
    expect(widths.size).toBe(1);
    expect(grid[6][1]).toBeNull(); // Sunday of the unfinished second week
  });

  it('returns seven empty rows for an empty input', () => {
    expect(toWeekGrid([])).toEqual([[], [], [], [], [], [], []]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /home/hudson/dev/hudsons-fitness/.claude/worktrees/r38-analytics
pnpm vitest run src/features/progreso/adherence.test.ts
```

Expected: FAIL — `Failed to resolve import "./adherence"`.

- [ ] **Step 3: Write the implementation**

Create `src/features/progreso/adherence.ts`:

```ts
// Nutrition adherence, per day, as calendar cells (R-38 / D-F29).
//
// The denominator is the PHASE's kcal target for that day, not the meal plan:
// the plan measures fidelity to a plan that may itself have been wrong, while
// the phase target is the number the user signed up for. It is cheap to
// reconstruct historically because `computeDailyMacroTargets` derives kcal from
// the phase alone — `kcal_value` in absolute mode, `estimate + kcal_value` in
// tdee_delta mode. Neither weight nor body fat enters kcal (they only enter
// protein), so no per-day weight lookup is needed.
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
  /** No phase was in force (or a tdee_delta phase had no estimate for the date). */
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
  /** `estimated_tdee_kcal` by `computed_on`. Only tdee_delta phases read it. */
  tdeeByDate: Map<string, number>;
}

/** Within this percent of target, the day counts as hit. */
export const ON_TARGET_PCT = 10;
/** Beyond this percent, the day is a clear miss. */
export const NEAR_PCT = 20;

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

export function targetKcalOnDate(
  phases: AdherencePhase[],
  date: string,
  tdeeByDate: Map<string, number>,
): number | null {
  const phase = phaseOnDate(phases, date);
  if (!phase) return null;
  if (phase.kcal_mode === 'absolute') return phase.kcal_value;
  const tdee = tdeeByDate.get(date);
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm vitest run src/features/progreso/adherence.test.ts
```

Expected: PASS, 20 tests.

- [ ] **Step 5: Prove the assertions bite**

Temporarily change `abs <= ON_TARGET_PCT` to `abs < ON_TARGET_PCT` and re-run. Expected: the two "exactly 10 %" tests FAIL. Revert. Then change `p.end_date >= date` to `p.end_date > date` and re-run. Expected: the boundary test FAILs. Revert.

A test that stays green against deliberately broken code is not a test.

- [ ] **Step 6: Commit**

```bash
git add src/features/progreso/adherence.ts src/features/progreso/adherence.test.ts
git commit -m "feat(progreso): pure adherence core for the R-38 heatmap"
```

---

### Task 2: The `--adh-*` colour tokens

**Files:**
- Modify: `src/index.css` (light block ~line 177-184; `.dark` block ~line 284-292; `@theme inline` block ~line 384-390)

**Interfaces:**
- Produces: CSS custom properties `--adh-on`, `--adh-near`, `--adh-far`, consumed by Task 3.

**Why new tokens rather than reusing `--tone-good` / `--excess-warn` / `--excess-bad`:** that trio was measured with the dataviz palette validator and scored a protanopia ΔE of **4.9** between "en objetivo" and "cerca" in dark mode — the most important pair in the grid, indistinguishable to a red-green colourblind reader. The three data states are *ordinal*, not categorical, so the fix is one accent for the hit plus **one amber hue in two steps** for the misses; two steps of a single hue separate by lightness, which no colour blindness collapses. The values below score ΔE 15.9 (light) and 14.4 (dark) on the worst adjacent pair.

**The ramp direction flips between modes on purpose.** On white, "far off" is the *darker* amber; on near-black, the *brighter* one. Do not "fix" this into a symmetric pair.

- [ ] **Step 1: Add the light-mode tokens**

In `src/index.css`, in the `app extensions` group of the light block, immediately after the `--heat-part:` line:

```css
  /* R-38 adherence heatmap. ORDINAL, not categorical: one accent for the hit,
     one amber hue in two lightness steps for the misses. Validated with the
     dataviz palette validator — worst adjacent pair ΔE 15.9 (protan), 15.9
     (normal). Three separate hues were tried first and scored ΔE 4.9 protan in
     dark mode between --adh-on and --adh-near. Do not re-hue these.
     The amber ramp's direction is inverted in .dark on purpose. */
  --adh-on:    oklch(0.52 0.13 148);
  --adh-near:  oklch(0.78 0.13 75);
  --adh-far:   oklch(0.62 0.13 75);
```

- [ ] **Step 2: Add the dark-mode tokens**

In the `.dark` block's `app extensions` group, after its `--heat-part:` line:

```css
  --adh-on:    oklch(0.74 0.14 148);
  --adh-near:  oklch(0.60 0.12 75);
  --adh-far:   oklch(0.80 0.14 75);
```

- [ ] **Step 3: Expose them to Tailwind**

In the `@theme inline` block, next to `--color-heat-part`:

```css
  --color-adh-on: var(--adh-on);
  --color-adh-near: var(--adh-near);
  --color-adh-far: var(--adh-far);
```

- [ ] **Step 4: Verify the build still compiles**

```bash
pnpm build
```

Expected: success, no CSS error.

- [ ] **Step 5: Commit**

```bash
git add src/index.css
git commit -m "feat(theme): adherence heatmap ordinal ramp tokens"
```

---

### Task 3: The heatmap component

**Files:**
- Create: `src/features/progreso/components/AdherenceHeatmap.tsx`
- Test: `src/features/progreso/components/AdherenceHeatmap.test.tsx`
- Modify: `src/i18n/es/metricas.json`, `src/i18n/en/metricas.json`

**Interfaces:**
- Consumes: `AdherenceDay`, `AdherenceState`, `toWeekGrid` from Task 1; the `--adh-*` tokens from Task 2.
- Produces: `AdherenceHeatmap({ days, loading }: { days: AdherenceDay[]; loading?: boolean })`.

**Props-in, no hooks** — other than `useTranslation`, `useNum` and its own `useState` for the selected cell. No data hook, so the test needs no Supabase mock.

- [ ] **Step 1: Add the i18n keys**

In `src/i18n/es/metricas.json`, add a top-level `adherence` object:

```json
  "adherence": {
    "title": "Adherencia",
    "subtitle": "Últimas 26 semanas · kcal frente al objetivo de fase",
    "empty": "Aún no hay días registrados.",
    "loading": "Cargando…",
    "weekdays": { "mon": "L", "tue": "M", "wed": "X", "thu": "J", "fri": "V", "sat": "S", "sun": "D" },
    "state": {
      "enObjetivo": "En objetivo",
      "cerca": "Cerca",
      "lejos": "Lejos",
      "sinRegistrar": "Sin registrar",
      "sinObjetivo": "Sin objetivo"
    },
    "cell": {
      "logged": "{{date}}: {{consumed, number}} de {{target, number}} kcal, {{state}}",
      "unlogged": "{{date}}: sin registrar, objetivo {{target, number}} kcal",
      "noTarget": "{{date}}: sin objetivo"
    },
    "detail": {
      "logged": "{{date}} · {{consumed, number}} / {{target, number}} kcal · {{deviation}} %",
      "unlogged": "{{date}} · sin registrar · objetivo {{target, number}} kcal",
      "noTarget": "{{date}} · sin fase activa",
      "hint": "Toca un día para ver el detalle."
    }
  },
```

In `src/i18n/en/metricas.json`, the same shape:

```json
  "adherence": {
    "title": "Adherence",
    "subtitle": "Last 26 weeks · kcal against the phase target",
    "empty": "No recorded days yet.",
    "loading": "Loading…",
    "weekdays": { "mon": "M", "tue": "T", "wed": "W", "thu": "T", "fri": "F", "sat": "S", "sun": "S" },
    "state": {
      "enObjetivo": "On target",
      "cerca": "Close",
      "lejos": "Off",
      "sinRegistrar": "Not logged",
      "sinObjetivo": "No target"
    },
    "cell": {
      "logged": "{{date}}: {{consumed, number}} of {{target, number}} kcal, {{state}}",
      "unlogged": "{{date}}: not logged, target {{target, number}} kcal",
      "noTarget": "{{date}}: no target"
    },
    "detail": {
      "logged": "{{date}} · {{consumed, number}} / {{target, number}} kcal · {{deviation}} %",
      "unlogged": "{{date}} · not logged · target {{target, number}} kcal",
      "noTarget": "{{date}} · no active phase",
      "hint": "Tap a day to see the detail."
    }
  },
```

- [ ] **Step 2: Write the failing test**

Create `src/features/progreso/components/AdherenceHeatmap.test.tsx`:

```tsx
// @vitest-environment jsdom
//
// R-38 Tier-2. The component is props-in — the page owns the hooks — so there
// is no supabase mock and no QueryClientProvider here. What this pins:
//  - one button per drawn day, and none for the sinDatos padding;
//  - the five legend entries are always named, so colour never stands alone;
//  - tapping a cell writes the detail line (the touch-friendly replacement for
//    a hover tooltip);
//  - the aria-label carries the numbers, not just the colour.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';
import { AdherenceHeatmap } from './AdherenceHeatmap';
import type { AdherenceDay } from '../adherence';

function day(over: Partial<AdherenceDay> & { date: string }): AdherenceDay {
  return {
    targetKcal: 2000,
    consumedKcal: 2000,
    deviationPct: 0,
    state: 'enObjetivo',
    ...over,
  };
}

const DAYS: AdherenceDay[] = [
  day({ date: '2026-03-02' }),
  day({ date: '2026-03-03', consumedKcal: 2300, deviationPct: 15, state: 'cerca' }),
  day({ date: '2026-03-04', consumedKcal: null, deviationPct: null, state: 'sinRegistrar' }),
  day({ date: '2026-03-05', targetKcal: null, consumedKcal: null, deviationPct: null, state: 'sinObjetivo' }),
];

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('AdherenceHeatmap', () => {
  it('draws one button per day and skips the padding', () => {
    render(<AdherenceHeatmap days={DAYS} />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('does not draw a button for a sinDatos day', () => {
    render(
      <AdherenceHeatmap
        days={[...DAYS, day({ date: '2026-03-06', state: 'sinDatos', targetKcal: null, consumedKcal: null, deviationPct: null })]}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('names all five states in the legend', () => {
    render(<AdherenceHeatmap days={DAYS} />);
    for (const label of ['En objetivo', 'Cerca', 'Lejos', 'Sin registrar', 'Sin objetivo']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('puts the numbers in the cell aria-label, not just the colour', () => {
    render(<AdherenceHeatmap days={DAYS} />);
    expect(
      screen.getByRole('button', { name: /2300 de 2000 kcal, Cerca/ }),
    ).toBeInTheDocument();
  });

  it('writes the detail line when a cell is tapped', async () => {
    const user = userEvent.setup();
    render(<AdherenceHeatmap days={DAYS} />);
    await user.click(screen.getByRole('button', { name: /2300 de 2000 kcal/ }));
    expect(screen.getByTestId('adherence-detail')).toHaveTextContent('2300 / 2000 kcal');
    expect(screen.getByTestId('adherence-detail')).toHaveTextContent('+15');
  });

  it('shows the hint until something is selected', () => {
    render(<AdherenceHeatmap days={DAYS} />);
    expect(screen.getByTestId('adherence-detail')).toHaveTextContent('Toca un día');
  });

  it('shows the empty copy when every day is sinDatos', () => {
    render(<AdherenceHeatmap days={[day({ date: '2026-03-02', state: 'sinDatos' })]} />);
    expect(screen.getByText('Aún no hay días registrados.')).toBeInTheDocument();
  });
});
```

Note the assertions say `2300`, not `2.300` — `es-ES` does not group four digits.

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm vitest run src/features/progreso/components/AdherenceHeatmap.test.tsx
```

Expected: FAIL — `Failed to resolve import "./AdherenceHeatmap"`.

- [ ] **Step 4: Write the implementation**

Create `src/features/progreso/components/AdherenceHeatmap.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, type Locale } from '@/lib/dates';
import { useNum } from '@/hooks/useNum';
import { cn } from '@/lib/utils';
import { toWeekGrid, type AdherenceDay, type AdherenceState } from '../adherence';

/** The five drawn states. `sinDatos` is deliberately absent: those cells are
 *  holes in the grid, not a colour. */
const FILL: Record<Exclude<AdherenceState, 'sinDatos'>, string> = {
  enObjetivo: 'var(--adh-on)',
  cerca: 'var(--adh-near)',
  lejos: 'var(--adh-far)',
  sinRegistrar: 'var(--heat-zero)',
  sinObjetivo: 'var(--heat-part)',
};

const LEGEND: Exclude<AdherenceState, 'sinDatos'>[] = [
  'enObjetivo',
  'cerca',
  'lejos',
  'sinRegistrar',
  'sinObjetivo',
];

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

interface Props {
  days: AdherenceDay[];
  loading?: boolean;
}

export function AdherenceHeatmap({ days, loading = false }: Props) {
  const { t, i18n } = useTranslation('metricas');
  const num = useNum();
  const locale: Locale = i18n.language?.startsWith('en') ? 'en' : 'es';
  const [selected, setSelected] = useState<AdherenceDay | null>(null);

  const grid = useMemo(() => toWeekGrid(days), [days]);
  const columns = grid[0]?.length ?? 0;
  const hasAnyData = days.some((d) => d.state !== 'sinDatos');

  function cellLabel(d: AdherenceDay): string {
    const date = formatDate(d.date, 'd MMM yyyy', locale);
    if (d.state === 'sinObjetivo') return t('adherence.cell.noTarget', { date });
    if (d.state === 'sinRegistrar') {
      return t('adherence.cell.unlogged', { date, target: d.targetKcal });
    }
    return t('adherence.cell.logged', {
      date,
      consumed: d.consumedKcal,
      target: d.targetKcal,
      state: t(`adherence.state.${d.state}`),
    });
  }

  function detailText(): string {
    if (!selected) return t('adherence.detail.hint');
    const date = formatDate(selected.date, 'd MMM yyyy', locale);
    if (selected.state === 'sinObjetivo') return t('adherence.detail.noTarget', { date });
    if (selected.state === 'sinRegistrar') {
      return t('adherence.detail.unlogged', { date, target: selected.targetKcal });
    }
    const dev = selected.deviationPct ?? 0;
    return t('adherence.detail.logged', {
      date,
      consumed: selected.consumedKcal,
      target: selected.targetKcal,
      // The sign is information, so it is written out rather than left to the
      // formatter, which drops a leading "+".
      deviation: `${dev >= 0 ? '+' : '−'}${num.dec(Math.abs(dev), 0)}`,
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('adherence.title')}</CardTitle>
        <p className="text-xs text-muted-foreground">{t('adherence.subtitle')}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {t('adherence.loading')}
          </p>
        ) : !hasAnyData ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {t('adherence.empty')}
          </p>
        ) : (
          <>
            <div className="flex gap-1.5">
              <div className="flex flex-col justify-between py-px text-[9px] leading-none text-muted-foreground">
                {WEEKDAY_KEYS.map((k) => (
                  <span key={k} className="h-[1em]">
                    {t(`adherence.weekdays.${k}`)}
                  </span>
                ))}
              </div>
              {/* Explicit column count from the JS-built grid: no auto-flow, no
                  measured pixels. The cells scale with the card. */}
              <div
                className="grid min-w-0 flex-1 gap-[2px]"
                style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
              >
                {grid.map((row, rowIndex) =>
                  row.map((d, colIndex) =>
                    d == null || d.state === 'sinDatos' ? (
                      <div key={`${rowIndex}-${colIndex}`} className="aspect-square" />
                    ) : (
                      <button
                        key={d.date}
                        type="button"
                        aria-label={cellLabel(d)}
                        aria-pressed={selected?.date === d.date}
                        onClick={() => setSelected(d)}
                        style={{ backgroundColor: FILL[d.state] }}
                        className={cn(
                          'aspect-square rounded-[2px] transition-shadow',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          d.state === 'sinRegistrar' && 'border border-dashed border-border',
                          selected?.date === d.date && 'ring-2 ring-ring',
                        )}
                      />
                    ),
                  ),
                )}
              </div>
            </div>

            <p
              data-testid="adherence-detail"
              aria-live="polite"
              className="text-xs tabular-nums text-muted-foreground"
            >
              {detailText()}
            </p>

            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {LEGEND.map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    style={{ backgroundColor: FILL[s] }}
                    className={cn(
                      'size-2.5 rounded-[2px]',
                      s === 'sinRegistrar' && 'border border-dashed border-border',
                    )}
                  />
                  {t(`adherence.state.${s}`)}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm vitest run src/features/progreso/components/AdherenceHeatmap.test.tsx
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/features/progreso/components/AdherenceHeatmap.tsx \
        src/features/progreso/components/AdherenceHeatmap.test.tsx \
        src/i18n/es/metricas.json src/i18n/en/metricas.json
git commit -m "feat(progreso): adherence heatmap component"
```

---

### Task 4: The TDEE-estimate history query

**Files:**
- Modify: `src/features/tdee/api.ts`, `src/features/tdee/hooks.ts`

**Interfaces:**
- Consumes: `TdeeEstimate` (already exported from `api.ts`).
- Produces: `fetchTdeeEstimatesSince(userId: string, fromDate: string | null): Promise<TdeeEstimate[]>` and `useTdeeEstimates(fromDate: string | null)`.

- [ ] **Step 1: Add the fetcher**

Append to `src/features/tdee/api.ts`:

```ts
/**
 * Every estimate the filter has emitted since `fromDate`, oldest first
 * (R-38): the adherence heatmap needs the estimate *of each day* to rebuild a
 * `tdee_delta` phase's historical kcal target. `null` means "all of them".
 */
export async function fetchTdeeEstimatesSince(
  userId: string,
  fromDate: string | null,
): Promise<TdeeEstimate[]> {
  let query = supabase
    .from('tdee_estimates')
    .select('*')
    .eq('user_id', userId)
    .order('computed_on', { ascending: true });
  if (fromDate) query = query.gte('computed_on', fromDate);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Add the hook**

Append to `src/features/tdee/hooks.ts` (and extend the existing import from `./api` to include `fetchTdeeEstimatesSince`):

```ts
export function useTdeeEstimates(fromDate: string | null) {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['tdee', 'estimates', user?.id, fromDate] as const,
    queryFn: () => fetchTdeeEstimatesSince(user!.id, fromDate),
  });
}
```

- [ ] **Step 3: Verify types and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/tdee/api.ts src/features/tdee/hooks.ts
git commit -m "feat(tdee): fetch the estimate history for a date range"
```

---

### Task 5: Wire the heatmap into `/progress`

**Files:**
- Modify: `src/pages/ProgresoPage.tsx`
- Test: `src/pages/ProgresoPage.test.tsx`

**Interfaces:**
- Consumes: `buildAdherenceDays` (Task 1), `AdherenceHeatmap` (Task 3), `useTdeeEstimates` (Task 4), plus the existing `useDailyNutritionHistory`, `usePhases`.
- Produces: nothing new.

**The window costs no extra network.** `fromDateForRange('6m')` is `today − 182 days` = exactly 26 weeks, and `useDailyNutritionHistory('6m')` is already `MacrosChart`'s default query — same key, shared cache.

- [ ] **Step 1: Add the imports and the derivation**

In `src/pages/ProgresoPage.tsx`, add to the imports:

```tsx
import { AdherenceHeatmap } from '@/features/progreso/components/AdherenceHeatmap';
import { useDailyNutritionHistory } from '@/features/progreso/hooks';
import { buildAdherenceDays } from '@/features/progreso/adherence';
import { usePhases } from '@/features/phases/hooks';
import { useTdeeEstimates } from '@/features/tdee/hooks';
import { fromDateForRange } from '@/features/measurements/hooks';
```

Inside the component, after the existing queries:

```tsx
  // The heatmap's window: 26 weeks, fixed, no control of its own.
  // `fromDateForRange('6m')` is today − 182 days = exactly 26 weeks, and this
  // is MacrosChart's default query key — the grid costs no extra request.
  const adherenceFrom = fromDateForRange('6m');
  const nutritionHistory = useDailyNutritionHistory('6m');
  const phases = usePhases();
  const tdeeEstimates = useTdeeEstimates(adherenceFrom);

  const adherenceDays = useMemo(() => {
    const rows = nutritionHistory.data ?? [];
    if (adherenceFrom == null) return [];
    return buildAdherenceDays({
      from: adherenceFrom,
      to: today,
      firstSnapshotDate: rows[0]?.logged_on ?? null,
      consumedByDate: new Map(rows.map((r) => [r.logged_on, r.consumed_kcal])),
      phases: phases.data ?? [],
      tdeeByDate: new Map(
        (tdeeEstimates.data ?? []).map((e) => [e.computed_on, e.estimated_tdee_kcal]),
      ),
    });
  }, [nutritionHistory.data, phases.data, tdeeEstimates.data, adherenceFrom, today]);
```

`rows[0]` is the oldest row: `fetchDailyNutritionHistory` orders `logged_on` ascending.

- [ ] **Step 2: Render it**

Immediately after `<MacrosChart />` in the JSX:

```tsx
        <AdherenceHeatmap
          days={adherenceDays}
          loading={nutritionHistory.isLoading || phases.isLoading || tdeeEstimates.isLoading}
        />
```

- [ ] **Step 3: Add the page-test mocks**

In `src/pages/ProgresoPage.test.tsx`, alongside the existing hook mocks, mock the two hooks the page newly calls. Follow the file's existing `vi.mock` style; the phases and estimates mocks return empty arrays so the grid renders its `sinObjetivo` state without any new fixture:

```tsx
vi.mock('@/features/phases/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/phases/hooks')>()),
  usePhases: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/features/tdee/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/tdee/hooks')>()),
  useTdeeEstimates: () => ({ data: [], isLoading: false }),
}));
```

If the file already mocks either module, extend the existing factory instead of adding a second `vi.mock` for the same path — a duplicate path silently wins over the first.

- [ ] **Step 4: Add a page-level assertion**

```tsx
  it('renders the adherence heatmap under the macros chart', () => {
    renderPage();
    expect(screen.getByText('Adherencia')).toBeInTheDocument();
  });
```

- [ ] **Step 5: Run the page tests**

```bash
pnpm vitest run src/pages/ProgresoPage.test.tsx
```

Expected: PASS, including the pre-existing tests.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ProgresoPage.tsx src/pages/ProgresoPage.test.tsx
git commit -m "feat(progreso): render the adherence heatmap on /progress"
```

---

### Task 6: The energy-balance card

**Files:**
- Create: `src/features/tdee/components/EnergyBalanceCard.tsx`
- Test: `src/features/tdee/components/EnergyBalanceCard.test.tsx`
- Modify: `src/pages/ProgresoPage.tsx`, `src/i18n/{es,en}/metricas.json`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `EnergyBalanceData = { tdeeKcal: number; avgIntakeKcal: number; bmrKcal: number | null }` and `EnergyBalanceCard({ data }: { data: EnergyBalanceData })`.

- [ ] **Step 1: Add the i18n keys**

`src/i18n/es/metricas.json`, top level:

```json
  "energyBalance": {
    "title": "Balance energético",
    "tdee": "Gasto · TDEE",
    "intake": "Ingesta media",
    "bmr": "Metabolismo basal",
    "balance": "{{n, number}} kcal/día",
    "unit": "kcal"
  },
```

`src/i18n/en/metricas.json`:

```json
  "energyBalance": {
    "title": "Energy balance",
    "tdee": "Expenditure · TDEE",
    "intake": "Average intake",
    "bmr": "Basal metabolic rate",
    "balance": "{{n, number}} kcal/day",
    "unit": "kcal"
  },
```

- [ ] **Step 2: Write the failing test**

Create `src/features/tdee/components/EnergyBalanceCard.test.tsx`:

```tsx
// @vitest-environment jsdom
//
// R-38 Tier-2. Props-in, so no supabase mock. What this pins:
//  - the three rows and their numbers;
//  - the balance is intake − expenditure, signed;
//  - an incomplete profile drops ONLY the BMR row, not the card.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '@/i18n';
import { EnergyBalanceCard, type EnergyBalanceData } from './EnergyBalanceCard';

function data(over: Partial<EnergyBalanceData> = {}): EnergyBalanceData {
  return { tdeeKcal: 2520, avgIntakeKcal: 2010, bmrKcal: 1840, ...over };
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('EnergyBalanceCard', () => {
  it('shows the three figures', () => {
    render(<EnergyBalanceCard data={data()} />);
    expect(screen.getByTestId('energy-tdee')).toHaveTextContent('2520');
    expect(screen.getByTestId('energy-intake')).toHaveTextContent('2010');
    expect(screen.getByTestId('energy-bmr')).toHaveTextContent('1840');
  });

  it('shows the deficit as a signed balance', () => {
    render(<EnergyBalanceCard data={data()} />);
    expect(screen.getByTestId('energy-balance')).toHaveTextContent('-510');
  });

  it('shows a surplus with a plus sign', () => {
    render(<EnergyBalanceCard data={data({ avgIntakeKcal: 2900 })} />);
    expect(screen.getByTestId('energy-balance')).toHaveTextContent('+380');
  });

  it('drops only the BMR row when the profile cannot produce one', () => {
    render(<EnergyBalanceCard data={data({ bmrKcal: null })} />);
    expect(screen.queryByTestId('energy-bmr')).not.toBeInTheDocument();
    expect(screen.getByTestId('energy-tdee')).toBeInTheDocument();
    expect(screen.getByTestId('energy-balance')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm vitest run src/features/tdee/components/EnergyBalanceCard.test.tsx
```

Expected: FAIL — `Failed to resolve import "./EnergyBalanceCard"`.

- [ ] **Step 4: Write the implementation**

Create `src/features/tdee/components/EnergyBalanceCard.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNum } from '@/hooks/useNum';
import { cn } from '@/lib/utils';

export interface EnergyBalanceData {
  /** `tdee_estimates.estimated_tdee_kcal` — the filter's expenditure estimate. */
  tdeeKcal: number;
  /** `tdee_estimates.avg_kcal_intake` — the intake the filter folded. */
  avgIntakeKcal: number;
  /** Derived by `estimatedBmr`; null when the profile is incomplete. */
  bmrKcal: number | null;
}

/**
 * Expenditure, intake and BMR as three bars normalized to the TDEE estimate —
 * the "why" behind the rate the hero reports. Props-in and hookless (beyond
 * i18n) so its Tier-2 test needs no Supabase mock; `ProgresoPage` owns the data.
 *
 * The card is not rendered at all without a TDEE estimate — there is nothing to
 * normalize against, and an empty frame is worse than no frame.
 */
export function EnergyBalanceCard({ data }: { data: EnergyBalanceData }) {
  const { t } = useTranslation('metricas');
  const num = useNum();
  const { tdeeKcal, avgIntakeKcal, bmrKcal } = data;

  const balance = Math.round(avgIntakeKcal - tdeeKcal);
  const rows: Array<{ id: string; label: string; value: number; muted: boolean }> = [
    { id: 'tdee', label: t('energyBalance.tdee'), value: tdeeKcal, muted: false },
    { id: 'intake', label: t('energyBalance.intake'), value: avgIntakeKcal, muted: false },
  ];
  if (bmrKcal != null) {
    rows.push({ id: 'bmr', label: t('energyBalance.bmr'), value: bmrKcal, muted: true });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-base">{t('energyBalance.title')}</CardTitle>
        <span
          data-testid="energy-balance"
          className="text-sm font-semibold tabular-nums text-accent-ink"
        >
          {`${balance >= 0 ? '+' : '-'}${num.int(Math.abs(balance))}`} {t('energyBalance.unit')}
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5 text-xs">
            <span className="w-[104px] shrink-0 text-muted-foreground">{row.label}</span>
            <span className="h-1.5 min-w-0 overflow-hidden rounded-full bg-muted">
              <span
                className={cn('block h-full rounded-full', row.muted ? 'bg-border' : 'bg-primary')}
                style={{ width: `${Math.min(100, (row.value / tdeeKcal) * 100)}%` }}
              />
            </span>
            <span
              data-testid={`energy-${row.id}`}
              className="shrink-0 text-right font-semibold tabular-nums"
            >
              {num.int(Math.round(row.value))}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm vitest run src/features/tdee/components/EnergyBalanceCard.test.tsx
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Wire it into the page**

In `src/pages/ProgresoPage.tsx`, add the imports:

```tsx
import { EnergyBalanceCard } from '@/features/tdee/components/EnergyBalanceCard';
import { useLatestTdee } from '@/features/tdee/hooks';
import { useProfile } from '@/features/profile/hooks';
import { estimatedBmr } from '@/lib/macros';
```

Derive the data:

```tsx
  const latestTdee = useLatestTdee();
  const profile = useProfile();

  const energyBalance = useMemo(() => {
    const e = latestTdee.data;
    if (!e) return null;
    return {
      tdeeKcal: e.estimated_tdee_kcal,
      avgIntakeKcal: e.avg_kcal_intake,
      bmrKcal: estimatedBmr({
        sex: profile.data?.sex,
        birthDate: profile.data?.birth_date,
        heightCm: profile.data?.height_cm,
        weightKg: latestQuery.data?.weight_kg,
        asOfISO: today,
      }),
    };
  }, [latestTdee.data, profile.data, latestQuery.data, today]);
```

Render it between `<CompositionCard />` and `<WeightChart />`:

```tsx
        {energyBalance && <EnergyBalanceCard data={energyBalance} />}
```

- [ ] **Step 7: Run the page tests**

```bash
pnpm vitest run src/pages/ProgresoPage.test.tsx
```

Expected: PASS. If the file does not already mock `useLatestTdee` / `useProfile`, extend the existing `vi.mock` factories for those paths rather than adding duplicates.

- [ ] **Step 8: Commit**

```bash
git add src/features/tdee/components/EnergyBalanceCard.tsx \
        src/features/tdee/components/EnergyBalanceCard.test.tsx \
        src/pages/ProgresoPage.tsx src/pages/ProgresoPage.test.tsx \
        src/i18n/es/metricas.json src/i18n/en/metricas.json
git commit -m "feat(progreso): energy balance card on /progress"
```

---

### Task 7: `useGoalEta` and the weight-chart projection

**Files:**
- Modify: `src/features/measurements/hooks.ts`, `src/features/measurements/components/LatestMeasurementCard.tsx`, `src/features/measurements/components/WeightChart.tsx`, `src/pages/ProgresoPage.tsx`
- Test: `src/features/measurements/components/WeightChart.test.tsx`

**Interfaces:**
- Consumes: `computeGoalEta`, `GoalEta` from `src/features/measurements/eta.ts`.
- Produces: `useGoalEta(targetWeightKg: number | null | undefined): GoalEta | null`; `WeightChart` prop `projection?: { toWeightKg: number; etaDate: string } | null`.

- [ ] **Step 1: Add the shared hook**

Append to `src/features/measurements/hooks.ts` (importing `computeGoalEta` and `GoalEta` from `./eta`, and `useLatestTdee` / `useTdeeState` from `@/features/tdee/hooks`):

```ts
/**
 * The goal-date ETA, in one place (R-38). `LatestMeasurementCard` used to build
 * this inline; the weight chart's projection needs the same number, and two
 * copies of a Kalman projection is one copy too many.
 *
 * Anchored at the filter's de-noised trend weight; rate = (avgIntake −
 * expenditure)/7700. Purely derived, never stored.
 */
export function useGoalEta(targetWeightKg: number | null | undefined): GoalEta | null {
  const tdeeState = useTdeeState();
  const latestTdee = useLatestTdee();
  const ts = tdeeState.data;
  const te = latestTdee.data;
  if (targetWeightKg == null || ts == null || te == null) return null;
  return computeGoalEta({
    currentWeightKg: ts.trend_weight_kg,
    targetWeightKg,
    avgIntakeKcal: te.avg_kcal_intake,
    expenditureKcal: te.estimated_tdee_kcal,
  });
}
```

- [ ] **Step 2: Make `LatestMeasurementCard` consume it**

In `src/features/measurements/components/LatestMeasurementCard.tsx`, replace the inline block (the `const ts = tdeeState.data;` … `: null;` assignment that produces `eta`) with:

```tsx
  const eta = useGoalEta(targetWeight);
```

Import `useGoalEta` from `../hooks`. Drop the now-unused `computeGoalEta` import and the `useLatestTdee` / `useTdeeState` calls **only if nothing else in the file uses them** — `latestTdee` may still feed other UI; check before deleting. Leave `etaText` and everything downstream untouched: this step must not change a single pixel.

- [ ] **Step 3: Verify the refactor changed no behaviour**

```bash
pnpm vitest run src/features/measurements/components/LatestMeasurementCard.test.tsx
```

Expected: PASS with **no test edits**. A behaviour-preserving refactor that needs its tests rewritten was not behaviour-preserving.

- [ ] **Step 4: Commit the refactor on its own**

```bash
git add src/features/measurements/hooks.ts \
        src/features/measurements/components/LatestMeasurementCard.tsx
git commit -m "refactor(measurements): extract useGoalEta from the hero card"
```

- [ ] **Step 5: Write the failing projection test**

Append to `src/features/measurements/components/WeightChart.test.tsx`:

```tsx
  it('appends the projection points when the target is inside the horizon', () => {
    render(<WeightChart targetWeightKg={78} projection={{ toWeightKg: 78, etaDate: '2026-06-01' }} />);
    expect(screen.getByTestId('weight-projection')).toBeInTheDocument();
  });

  it('draws no projection when none is supplied', () => {
    render(<WeightChart targetWeightKg={78} />);
    expect(screen.queryByTestId('weight-projection')).not.toBeInTheDocument();
  });
```

Follow the file's existing render helper and mocks rather than the bare `render` above if it defines one.

- [ ] **Step 6: Run the test to verify it fails**

```bash
pnpm vitest run src/features/measurements/components/WeightChart.test.tsx
```

Expected: FAIL — no `weight-projection` element.

- [ ] **Step 7: Implement the projection**

In `WeightChart.tsx`, extend the props:

```tsx
export function WeightChart({
  targetWeightKg,
  projection,
}: {
  targetWeightKg?: number | null;
  /** Drawn only for an `on_track` ETA; the page passes null otherwise. */
  projection?: { toWeightKg: number; etaDate: string } | null;
}) {
```

After `points` is built, add the projected series. The x-axis is categorical, so
the projection is two extra rows carrying a separate `projected` key:

```tsx
  /**
   * The dashed ray from today's trend weight to the target.
   *
   * Horizon cap: an ETA may legitimately land 700 days out
   * (`MAX_HORIZON_DAYS = 730`), which would squeeze months of real data into a
   * sliver. The projection extends the axis by at most the span the range
   * already covers. Inside that window the ray ends on the target; beyond it,
   * the ray runs to the edge with no end dot and the hero's ETA line keeps
   * carrying the date.
   */
  const chartData = useMemo(() => {
    if (!projection || points.length === 0) return points;
    const lastReal = [...points].reverse().find((p) => p.ma5 != null);
    if (!lastReal?.ma5) return points;

    const firstDate = new Date(`${points[0].date}T00:00:00Z`);
    const lastDate = new Date(`${lastReal.date}T00:00:00Z`);
    const spanDays = Math.max(
      1,
      Math.round((lastDate.getTime() - firstDate.getTime()) / 86_400_000),
    );
    const etaDate = new Date(`${projection.etaDate}T00:00:00Z`);
    const etaDays = Math.round((etaDate.getTime() - lastDate.getTime()) / 86_400_000);
    const withinHorizon = etaDays <= spanDays;

    const endDate = withinHorizon
      ? projection.etaDate
      : new Date(lastDate.getTime() + spanDays * 86_400_000).toISOString().slice(0, 10);
    const endWeight = withinHorizon
      ? projection.toWeightKg
      : lastReal.ma5 +
        ((projection.toWeightKg - lastReal.ma5) * spanDays) / Math.max(1, etaDays);

    return [
      ...points.map((p) => ({ ...p, projected: null as number | null })),
      { date: endDate, weight: null, ma5: null, projected: endWeight },
    ].map((row, i, all) =>
      // Anchor the dashed line at the last real MA5 so it starts on the curve
      // instead of floating.
      i === all.length - 2 ? { ...row, projected: lastReal.ma5 } : row,
    );
  }, [points, projection]);

  const projectionEndsOnTarget = useMemo(() => {
    const last = chartData[chartData.length - 1] as { date?: string } | undefined;
    return projection != null && last?.date === projection.etaDate;
  }, [chartData, projection]);
```

Feed `chartData` to `<ComposedChart data={...}>` in place of `points`, and add
inside the chart, after the MA5 `<Line>`:

```tsx
            {projection && (
              <Line
                data-testid="weight-projection"
                type="linear"
                dataKey="projected"
                stroke="var(--primary)"
                strokeWidth={1.6}
                strokeDasharray="2 5"
                strokeLinecap="round"
                dot={false}
                connectNulls
                tooltipType="none"
                isAnimationActive={false}
              />
            )}
            {projection && projectionEndsOnTarget && (
              <ReferenceDot
                x={projection.etaDate}
                y={projection.toWeightKg}
                r={3}
                fill="var(--card)"
                stroke="var(--primary)"
                strokeWidth={1.6}
                isFront
              />
            )}
```

Extend `yDomain` to include `projection?.toWeightKg` when it is set, so the ray
is never clipped.

- [ ] **Step 8: Run the test to verify it passes**

```bash
pnpm vitest run src/features/measurements/components/WeightChart.test.tsx
```

Expected: PASS. If recharts does not forward `data-testid` onto the rendered
path in this version, assert on the dashed path's presence instead — e.g.
`container.querySelector('path[stroke-dasharray="2 5"]')` — and update both new
tests to match. Do not add a wrapper `<g>` just to hold a test id.

- [ ] **Step 9: Wire it into the page**

In `src/pages/ProgresoPage.tsx`:

```tsx
import { addDays } from 'date-fns';
import { useGoalEta } from '@/features/measurements/hooks';
```

```tsx
  const goalEta = useGoalEta(targetWeightKg);
  const projection =
    goalEta?.status === 'on_track' && goalEta.daysToTarget != null && targetWeightKg != null
      ? { toWeightKg: targetWeightKg, etaDate: isoDate(addDays(new Date(), goalEta.daysToTarget)) }
      : null;
```

and pass it: `<WeightChart targetWeightKg={targetWeightKg} projection={projection} />`.

- [ ] **Step 10: Commit**

```bash
git add src/features/measurements/components/WeightChart.tsx \
        src/features/measurements/components/WeightChart.test.tsx \
        src/pages/ProgresoPage.tsx
git commit -m "feat(progreso): project the goal ETA on the weight chart"
```

---

### Task 8: Verification and doc reconciliation

**Files:**
- Modify: `docs/superpowers/specs/2026-08-01-r38-analytics-extras-design.md`

- [ ] **Step 1: Amend the spec with the sixth state**

In §4.2, add a row to the state table and a sentence after it:

```markdown
| `sinDatos` | the date precedes the first `daily_nutrition_history` row |
```

```markdown
`sinDatos` was not in the design draft; it surfaced while planning. A day before
the first snapshot row is not "you did not log" — the snapshot did not exist
yet — so it is a hole in the grid, not a colour. `toWeekGrid` pads with it and
`AdherenceHeatmap` renders no button for it.
```

Also update the sentence "Days before the first `daily_nutrition_history` row are **not drawn**." to name the state.

- [ ] **Step 2: Run the whole hermetic suite yourself**

```bash
cd /home/hudson/dev/hudsons-fitness/.claude/worktrees/r38-analytics
pnpm lint && pnpm build && pnpm test
```

Expected: all three clean. Do not trust a per-file green from an earlier step — run the full suite and read the summary line. Expect roughly 1834 + ~31 tests and about 2.5 minutes.

- [ ] **Step 3: Confirm the tree is clean**

```bash
git status --short
```

Expected: empty.

- [ ] **Step 4: Real-browser pass — required**

jsdom sees no CSS, so the grid's geometry and the whole palette are invisible to
every test above. Start the local stack and drive a real browser with a
`@playwright/test` script **run from inside the worktree** (from `/tmp` the
package does not resolve).

Check, at 390px and at desktop width:

1. The 26-week grid fits its card with no horizontal overflow and no clipped
   final column.
2. Cells are large enough to tap, and tapping one writes the detail line.
3. The five legend swatches are distinguishable in **light and dark**.
4. The dashed projection starts on the MA5 curve and does not squash the real
   series.
5. The energy-balance bars do not collide with their labels at 390px — the R-37
   bug was exactly this shape.

- [ ] **Step 5: Re-run the palette validator against resolved colours**

The spec's numbers came from converting the `oklch` tokens by hand against
`#ffffff` / `#15191d`. In the browser, read the computed fills off three real
cells and the real card surface:

```js
const cell = document.querySelector('[aria-label*="kcal"]');
getComputedStyle(cell).backgroundColor;
getComputedStyle(cell.closest('[class*="rounded"]')).backgroundColor;
```

Feed the resolved values to the dataviz validator in both modes and confirm the
CVD separation and normal-vision checks still PASS. If either fails, re-step
`--adh-near` / `--adh-far` in `src/index.css` — never by eye.

- [ ] **Step 6: Commit the spec amendment**

```bash
git add docs/superpowers/specs/2026-08-01-r38-analytics-extras-design.md
git commit -m "docs(spec): record the sinDatos adherence state"
```

- [ ] **Step 7: Open the PR**

Only once every step above is green and the browser pass is done — auto-merge
ships a `claude/*` PR the instant CI passes, so an early PR ships unfinished work.

```bash
git push -u origin claude/r38-analytics
gh pr create --base develop \
  --title "feat(progreso): R-38 analytics extras — energy balance, ETA projection, adherence heatmap" \
  --body "$(cat <<'BODY'
Implements R-38 minus the custom date-range filter (returned to the backlog).

- **Energy balance** — expenditure / intake / BMR as three bars normalized to the TDEE estimate, with the signed daily balance.
- **ETA projection** — the Kalman goal projection drawn on the weight chart, capped so a far ETA cannot squash the real series. `useGoalEta` now holds the one copy of that calculation.
- **Adherence heatmap** — 26 weeks of kcal against the *phase* target (not the meal plan), ±10 % on-target band, five drawn states plus an undrawn `sinDatos`.

No schema change. Palette is an ordinal ramp validated for colour-vision deficiency; a three-hue version scored ΔE 4.9 protan in dark mode and was rejected.

Spec: `docs/superpowers/specs/2026-08-01-r38-analytics-extras-design.md`
Plan: `docs/superpowers/plans/2026-08-01-r38-analytics-extras.md`
BODY
)"
```

---

## Self-Review

**Spec coverage.** §2 energy balance → Task 6. §3 projection + `useGoalEta` → Task 7. §4.1 denominator → Task 1 (`targetKcalOnDate`). §4.2 states/bands → Task 1. §4.3 data → Tasks 4 and 5. §4.4 pure core → Task 1. §4.5 grid → Tasks 1 (`toWeekGrid`) and 3. §4.6 colour → Task 2, re-validated in Task 8. §4.7 interaction/a11y → Task 3. §5 placement → Tasks 5 and 6; i18n → Tasks 3 and 6; tests → throughout; browser pass → Task 8. §6 non-goals → nothing implements them. **One divergence, deliberate and recorded:** the sixth `sinDatos` state, folded back into the spec in Task 8 Step 1.

**Type consistency.** `AdherenceDay`, `AdherenceState`, `AdherencePhase` and `toWeekGrid` are defined in Task 1 and used with those exact names in Task 3. `EnergyBalanceData` is defined and consumed in Task 6. `useTdeeEstimates(fromDate)` is defined in Task 4 and called with `adherenceFrom` in Task 5. `useGoalEta(targetWeightKg)` is defined in Task 7 Step 1 and called in Steps 2 and 9. `projection: { toWeightKg, etaDate }` has the same shape in the prop, the test and the page.
