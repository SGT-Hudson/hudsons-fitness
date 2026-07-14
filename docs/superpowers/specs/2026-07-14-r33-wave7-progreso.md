# R-33 wave 7 — Progreso

**Status:** approved (Gonzalo, 2026-07-14). Implements §6 wave 7 of the R-33 UI
redesign spec, and **corrects three of its factual claims** (§1). **No schema
change** — this wave is composition + restyle only.

Canvas artboards (read-only, `/mnt/d/dev/claude-design-hudson-fitness`):
`progreso-explora-mobile.jsx` → `ProgresoP0Mobile` (**the chosen composition**),
its expanded-chart sheets (`GraficaPesoSheet`, `GraficaComposicionSheet`), the
full history screen (`HistorialMedicionesMobile`); `progreso-web.jsx` →
`ProgresoWebV2`; `progreso-objetivos-mobile-detail.jsx` + `medicion-modal.jsx`
→ the measurement sheet.

**Standing rule for this wave (Gonzalo, 2026-07-14): the mobile artboards are
the newer, correct design. Where the web artboard disagrees with mobile, mobile
wins** — port the mobile decision up to the web layout rather than shipping two
different stories for the same screen.

## 1. Three corrections to the R-33 spec

- **"MA5 smoothed weight" is not something this wave computes.** MA5 already
  exists **in the database**: the `body_measurements_smoothed` view carries
  `weight_kg_5day_avg` (`20260508080000_r00_baseline_schema.sql:360`). There is
  no JS moving-average helper and this wave must not add one — it consumes the
  view, as `useSmoothedMeasurements` already does.
- **The ETA is not a "not-yet-built" item.** `src/features/measurements/eta.ts`
  exists, is unit-tested, and `LatestMeasurementCard` **already renders an ETA
  line today** (`latest.eta.*`). The strip-list ("ETA banner → R-38") is about
  the canvas's big accent *banner*, not about the modest line that already
  ships. **The existing ETA line is kept.** Stripping it would delete working
  behaviour, which a restyle wave must never do.
- **Edit/delete of a measurement is not in the design.** The canvas draws no
  edit or delete affordance on any history row — but `MeasurementsList` has
  both today (`window.confirm` delete + row edit). **Both are kept** and move
  into the history screen. The canvas is a design mock, not a feature list.

## 2. What ships

### 2.1 `/progress` — the ProgresoP0 composition

Mobile order (and the web layout tells the *same* story, per the standing rule):

1. **Measurement hero** — MA5 weight headline, kg/week rate chip (phase-toned
   via the existing `trend.ts` `deltaTone`), the phase "camino" progress bar
   (inicio / hoy / objetivo), the existing ETA line, BMR, and last-measurement
   info. This is `LatestMeasurementCard` **restyled**, not rewritten: its maths
   (`smoothedRatePerWeek`, `computeTargetWeightKg`, `estimatedBmr`, `computeGoalEta`)
   is authoritative and stays.
   - The canvas's progress bar is the plain one — **no draggable knob** (P0
     dropped it on purpose).
2. **Composition card** — grasa / músculo / agua tiles with 7-day deltas, each
   tapping through to the expanded composition chart.
3. **History card** — the last 5 measurements, flat, plus a `Historial` button
   → the full history screen.

**The screen is simply shorter than the artboard.** The ETA *banner* and the
energy-balance card are R-38 and are not built; nothing is invented to fill the
gap (Gonzalo, 2026-07-14). Stack = hero → composición → historial.

### 2.2 The time filter — one label set, `1M / 6M / 1A / Todo`

The mobile artboard's segmented control wins (Gonzalo). Today the code has
`TimeRange = '30d' | '90d' | '1y' | 'all'` (`measurements/hooks.ts:14`). It
becomes **`'1m' | '6m' | '1y' | 'all'`**, and `fromDateForRange` moves with it.
That is a real data change (90d → 6m), not just copy.

- **D-D4 stays:** the range is **local component state, never URL state.**
- Extract the hand-rolled segmented control into **one shared component**
  (`role="radiogroup"` + `aria-checked`, per the existing pattern) and retire
  `TimeRangePills`.
- **No custom date-range picker** (R-38): the calendar button at the end of the
  canvas's filter is not built.

### 2.3 The charts

Both live inline as previews and open **expanded sheets** (`ResponsiveDialog`,
`variant="panel"` — vaul drawer on mobile, dialog on desktop; the shell every
other wave already uses).

- **Weight** — raw points + MA5 line + dashed target line (`ReferenceLine` at
  `computeTargetWeightKg`). This is `WeightChart` restyled.
- **Composition** — **three lines: grasa, músculo, agua** (the mobile design).
  The web artboard's stacked fat/lean area is **dropped**: it hides agua and
  músculo, which are data the app already stores. One chart, both breakpoints.
  `composition.ts` (leanPct/fatKg/…) stays for the unit toggle, which stays.
- Charts stay on **recharts** (the library already in use). Chart colours move
  onto new tokens `--comp-fat` / `--comp-muscle` / `--comp-water` — today they
  are hardcoded per-chart and the canvas itself is inconsistent about them.

### 2.4 `/progress/history` — the month-grouped history (new route)

Sub-flows are routes, not dialogs (the wave-5/6 pattern). The full history:
grouped by month with a per-month count, one row per measurement (date, time,
weight, fat %, delta), skipped days dimmed, the note rendered in guillemets, and
a footer with the first-ever measurement. **Edit and delete live here** (§1).

`MeasurementsList` (the flat 30-row table) is retired by it.

### 2.5 The measurement sheet

`MeasurementDialog` migrates from the plain shadcn `Dialog` to
**`ResponsiveDialog`** → bottom sheet on mobile, centred dialog on desktop, as
the canvas draws it. Fields, zod schema and error codes are unchanged; the
`NumberField` boundary (decimal comma, `bb7dbb9`) stays exactly as it is.

⚠️ **`BodyQuickMeasureCard` (Diario's right rail) reuses this dialog** —
whatever changes here changes the Diario flow too. Its test must stay green.

**Not built** (canvas draws them; all strip-list): the báscula/manual **source
toggle**, **photo attach**, and the **streak chip** (R-39 — there is no streak
data today; it would have to be invented).

### 2.6 Tone

`measurements/trend.ts` has its own `deltaTone` ('good' | 'bad' | 'neutral'),
separate from `core/nutritionTone.ts`. **They are not merged in this wave.**
`deltaTone` answers "is this delta good *for the active phase*", which is a
different question from the kcal/macro tone scale. Merging them is a refactor
with no user-visible payoff and is out of scope.

## 3. Test gate

- **The page has no test today** (no `ProgresoPage.test.tsx`, no chart tests, no
  `MeasurementsList` test). This wave adds Tier-2 coverage for the new page
  composition and the history grouping.
- Existing green tests that must stay green: `trend.test.ts`, `eta.test.ts`,
  `composition.test.ts`, `interpolate.test.ts`, `MeasurementDialog.test.tsx`
  (incl. the `82,4 → 82.4` comma case), `LatestMeasurementCard.test.tsx`,
  `BodyQuickMeasureCard.test.tsx`, `ProgressTabs.test.tsx`, `router.test.tsx`.
- The `TimeRange` rename touches every chart's preset state — pin the new range
  → from-date mapping in a Tier-1 test.
- **Real-browser pass, mandatory** (jsdom cannot see CSS): mobile 390px + desktop,
  light + dark, against the artboards.

## 4. Ship

Two PRs, as the previous waves:
- **PR-A** — the page composition: hero restyle, composition card, charts +
  shared segmented filter (incl. the `TimeRange` rename), chart tokens.
- **PR-B** — the history route (month grouping, edit/delete) + the measurement
  sheet on `ResponsiveDialog`, retiring `MeasurementsList`.

`ProgressTabs` also drifts (`border-foreground` where the redesigned
`RecipesTabs` uses `border-nutri text-nutri`) — fixed in PR-A.
