# R-33 wave 7 — Progreso — plan

Spec: `docs/superpowers/specs/2026-07-14-r33-wave7-progreso.md` (read it — it is
the contract; this plan only sequences it).

Ships as **two PRs**. PR-A = the page composition. PR-B = the history route +
the measurement sheet.

## Global constraints

Binding on every task. A violation is a failed review.

1. **The maths is authoritative and FROZEN.** `measurements/trend.ts`,
   `eta.ts`, `composition.ts`, `interpolate.ts` and `lib/macros.ts`
   (`computeTargetWeightKg`, `estimatedBmr`) are unit-tested and correct. This
   wave **restyles what renders them**. Do not reimplement a rate, an ETA, a
   lean-mass split or a BMR in a component.
2. **MA5 comes from the DB.** `body_measurements_smoothed.weight_kg_5day_avg`.
   **Never write a JS moving average.** The canvas's `ma()` helper is a toy.
3. **Port layout, NEVER maths, from the canvas.** Its numbers are hard-coded
   fixtures (`PG`, `PG_RAW`, `PG_HIST`) and its helpers are noise generators.
4. **Nothing that works today may disappear.** Specifically: the **ETA line**
   in the hero and **edit/delete** of a measurement (spec §1). The canvas draws
   neither; the canvas is a mock, not a feature list.
5. **D-D4:** the time range is **local component state, never URL state.**
6. **Do not build** (strip-list): ETA *banner*, energy-balance card, custom
   date-range picker, báscula/manual source toggle, photo attach, streak chip.
   No streak data exists — inventing one is out of scope.
7. Every new string in **ES and EN** (`src/i18n/{es,en}/metricas.json`). The
   artboards are ES-only.
8. Public repo: **no AI/Claude attribution anywhere.** Plain conventional commits.
9. `pnpm lint` + `pnpm build` + `pnpm test` green. jsdom cannot see CSS — a
   green suite is not a visual pass.

## PR-A tasks

### Task A1 — The time range: rename + one shared segmented control

The foundation; everything else consumes it.

- `measurements/hooks.ts:14` — `TimeRange` becomes **`'1m' | '6m' | '1y' | 'all'`**
  and `fromDateForRange` moves with it (`1m` = 30d, `6m` = ~182d, `1y`, `all`).
  This is a **behaviour change**, not copy: the old `90d` preset is gone.
  ⚠️ Every consumer defaults to `'90d'` today (`WeightChart:28`,
  `CompositionChart:45`, `ProgresoPage`'s `useSmoothedMeasurements('90d')`,
  `MacrosChart`). Pick the new default deliberately — **`'6m'`** — and change
  them all; a stale `'90d'` string will not typecheck, which is the point.
- New **`src/components/ui/SegmentedControl.tsx`** — `role="radiogroup"` +
  `role="radio"` + `aria-checked`, the pattern already used at
  `IngredientEditorForm.tsx:268`. Labels `1M / 6M / 1A / Todo` come from i18n
  (`metricas:charts.range.*`), not hardcoded.
- **Retire `TimeRangePills`.** `UnitToggle` (%/kg) stays — it is a different
  control — but re-skin it on the same primitive if it fits cleanly.
- Tier-1 test: the range → from-date mapping.

### Task A2 — Chart tokens, and the two charts

- **New tokens** in `src/index.css`: `--comp-fat`, `--comp-muscle`,
  `--comp-water`. Today the composition colours are hardcoded per chart and the
  canvas contradicts itself between mobile and web. One set, both charts.
- **`WeightChart`** — restyle: raw points + MA5 line + dashed target
  `ReferenceLine` (from `computeTargetWeightKg`, already passed in). Keep
  recharts. Consume the new `SegmentedControl`.
- **`CompositionChart`** — **three lines: grasa, músculo, agua** (the mobile
  design; Gonzalo). **Delete the stacked fat/lean area** — it hides agua and
  músculo, which the app stores. The three `TrendChart` sparkline cards and the
  `%`/`kg` `UnitToggle` stay; `composition.ts` stays.
- Both charts get an **expand affordance** that opens the chart in a
  `ResponsiveDialog` (`variant="panel"`) — the canvas's expanded sheets. Same
  chart component, bigger; do not fork a second chart.

### Task A3 — The hero and the composition card

- **`LatestMeasurementCard`** — restyle to the P0 hero: MA5 headline (33px
  mobile / 44px desktop, `.tnum`, unit as a dim span), the phase-toned kg/week
  chip, the **"camino de la fase"** progress bar (inicio / hoy / objetivo — the
  plain bar, **no draggable knob**; P0 dropped it), the **existing ETA line**
  (constraint 4), BMR, last-measurement info.
  Its test (`LatestMeasurementCard.test.tsx`) pins the headline, the rate and
  the ETA line — **it must stay green**; update selectors, never delete the
  assertions.
- **Composition card** — grasa / músculo / agua tiles with their 7-day deltas
  (`compositionDelta` + `deltaTone` from `trend.ts` — do not recompute), each
  tile tapping through to the expanded composition chart.

### Task A4 — The page, and the tab drift

- **`ProgresoPage`** — the P0 order: hero → composición → charts → historial
  card (last 5) → `MacrosChart`. `PageShell` gains `subtitle` + `actions` (the
  "Nueva medición" button). ⚠️ **`actions` renders on desktop only** —
  `PageHeaderV2` is CSS-hidden below `md`, so the mobile affordance must be
  re-created in the body (see the comment at `IngredientesPage.tsx:180`).
  The screen is **shorter than the artboard** — no ETA banner, no
  energy-balance card, nothing invented to fill the gap.
- **`ProgressTabs`** — drifted: it hardcodes `border-foreground` where the
  redesigned `RecipesTabs.tsx:9` uses `border-nutri text-nutri`. Align it.
  (Shared with `ObjetivosPage` — wave 8 — so do not break it.)
- **New Tier-2 `ProgresoPage.test.tsx`** — the page has **no test today**.
  Pin the composition. ⚠️ `PageShell` mounts the mobile header AND
  `PageHeaderV2` at once (CSS hides one), so page tests must use `getAllBy*`.
  ⚠️ A `.test.tsx` that renders a supabase-importing component fails in CI
  without env unless the data hooks are mocked — mock them.

### Task A5 — Verification

- Full `pnpm lint && pnpm build && pnpm test`, run **by me**, not on a
  subagent's report.
- **Real-browser pass** (agent-browser + the QA user): mobile 390px and desktop,
  **light and dark**, against the artboards. jsdom cannot see CSS — this is what
  finds the layout bugs.
- Confirm the range filter actually refetches (1M vs Todo change the series).

## PR-B (after PR-A merges)

- `/progress/history` — month-grouped history: per-month count, row = date /
  time / weight / fat % / delta, skipped days dimmed, note in guillemets,
  first-ever-measurement footer. **Edit and delete live here** (constraint 4).
  Retires `MeasurementsList`.
- `MeasurementDialog` → **`ResponsiveDialog`** (sheet on mobile, centred dialog
  on desktop). Fields, zod schema, error codes and the `NumberField` decimal
  boundary unchanged. ⚠️ **Diario's `BodyQuickMeasureCard` reuses this dialog** —
  its test must stay green.
