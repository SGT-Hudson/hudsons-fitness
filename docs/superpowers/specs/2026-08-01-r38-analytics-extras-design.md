# R-38 — Progress analytics extras

- **Roadmap:** R-38 (spawned by the R-33 spec, 2026-07-02; strip-list of wave 7)
- **Decision:** D-F29 (to be written into `decisions.md` when this ships)
- **Date:** 2026-08-01
- **Schema impact:** none. No migration, no RPC, no new column.

## 0. Scope

R-38 as filed bundles four unrelated items. **Three ship here; one is dropped
back to the backlog.**

| Item | Verdict |
|---|---|
| Energy-balance visual | ships |
| ETA banner + projection | ships as the **projection**; the banner is not built |
| Nutrition adherence heatmap | ships |
| Custom date-range filter | **dropped back to the backlog** |

**Why the custom range is dropped (Gonzalo, 2026-08-01).** `1M / 6M / 1A / Todo`
covers the real cases. A date-range picker adds a component, a second kind of
range state, and a new cache-key shape for a rare need. It returns to R-38's
roadmap entry as the one un-built item.

**Why the ETA *banner* is not built.** The strip-list called for the canvas's
accent banner, but `LatestMeasurementCard` **already renders an ETA line today**
(`latest.eta.onTrack / stalled / wrongDirection`) off `computeGoalEta`.
Restyling a working line into a bigger card is cosmetics. The half of that item
that carries new information is the **projection on the weight chart**, and that
is what ships.

## 1. What already exists — do not re-derive

- `src/features/measurements/eta.ts` — `computeGoalEta`, unit-tested, already
  consumed by `LatestMeasurementCard`.
- `LatestMeasurementCard` already shows the MA5 trend weight, the kg/week rate
  chip, and `pathPct` ("camino de la fase").
- `daily_nutrition_history` — the `daily-nutrition-snapshot` edge function
  upserts **one row per user per day**, unconditionally. `consumed_*` is `null`
  when nothing was logged; `planned_*` is `null` and `had_active_plan` is false
  when there was no plan. Absence of a row therefore means "before the snapshot
  existed", not "nothing happened".
- `tdee_estimates` — `estimated_tdee_kcal`, `avg_kcal_intake`, one row per
  `computed_on`. `tdee_state.trend_weight_kg` is the filter's de-noised weight.
- `estimatedBmr` (`src/lib/macros.ts`) — derived, never stored.
- `usePhases()` already returns every phase with `start_date` / `end_date`.
- `fromDateForRange('6m')` is `today − 182 days` = **exactly 26 weeks**.

## 2. Energy-balance card

**Component.** `src/features/tdee/components/EnergyBalanceCard.tsx` —
**props-in, no hooks**. This is the R-37 rule: a hookless component's Tier-2
test does not need a Supabase mock ([[component-test-supabase-env]]). The page
wires the data.

**Content.** Three bars, each normalized to the TDEE estimate (the largest of
the three by construction), in the artboard's order:

| Row | Source |
|---|---|
| Gasto · TDEE | `tdee_estimates.estimated_tdee_kcal` |
| Ingesta media | `tdee_estimates.avg_kcal_intake` |
| BMR | `estimatedBmr({ sex, birthDate, heightCm, weightKg, asOfISO })` |

The card header carries the balance: `avg_kcal_intake − estimated_tdee_kcal`,
signed, in kcal/day.

**Degradation.** No TDEE estimate → the card does not render at all (there is
nothing to normalize against, and the page must not show an empty frame).
Profile incomplete → `estimatedBmr` returns `null` and **only the BMR row is
omitted**; the other two bars and the balance still render.

## 3. Weight-chart projection

**Shared ETA hook.** `LatestMeasurementCard` computes the ETA internally from
its own `useTdeeState` / `useLatestTdee` calls. `ProgresoPage` now needs the
same number to feed the chart. Extract `useGoalEta()` into
`src/features/measurements/hooks.ts`; `LatestMeasurementCard` consumes it
instead of inlining, and the page consumes it to build the projection prop.
One place where the ETA lives.

**Prop.** `WeightChart` gains `projection?: { toWeightKg: number; etaDate: string } | null`.

**Drawn only when `status === 'on_track'`.** `stalled` and `wrong_direction`
return `daysToTarget: null` — there is nothing to project, and drawing a ray
into a future the model does not predict would be a lie.

**Horizon cap.** An ETA can legitimately land 700 days out
(`MAX_HORIZON_DAYS = 730`), which would compress six months of real data into a
sliver. Rule: **the projection extends the x-axis by at most the span of the
visible range.** If the target falls inside that window, the dashed line
terminates in a hollow `ReferenceDot` at the target weight. If it falls beyond,
the dashed line runs to the right edge with **no** end dot, and the date stays
where it already is — in the hero's ETA line.

## 4. Adherence heatmap

### 4.1 What adherence means

**Denominator = the phase's kcal target for that day** — not the meal plan.
"Adherence to the plan" measures fidelity to a plan that may itself have been
wrong; the phase target is the number the user actually signed up for. It also
makes the grid dense rather than sparse, because a phase covers every day
whereas a meal plan does not.

The historical target is cheap to reconstruct, which is what makes this choice
affordable. `computeDailyMacroTargets` derives kcal as:

```
kcal = phase.kcal_mode === 'absolute' ? phase.kcal_value
                                      : estimatedTDEE + phase.kcal_value
```

**Neither weight nor body-fat enters the kcal target** (they only enter
protein). So a per-day kcal target needs the phase in force on that date, plus —
only for `tdee_delta` phases — that date's `tdee_estimates` row. The expensive
version of this idea was full per-day macros; the kcal-only version is two
extra lookups.

**Only kcal.** One cell holds one number.

### 4.2 The five states

| State | Condition |
|---|---|
| `enObjetivo` | target exists, logged, \|deviation\| ≤ 10 % |
| `cerca` | target exists, logged, 10 % < \|deviation\| ≤ 20 % |
| `lejos` | target exists, logged, \|deviation\| > 20 % |
| `sinRegistrar` | target exists, `consumed_kcal` is null |
| `sinObjetivo` | no phase in force that day (or a `tdee_delta` phase with no estimate for that date) |

`deviation = (consumed − target) / target`. Bands are **symmetric**: falling
short in a cut is not free, and an asymmetric band cannot be explained in a
five-chip legend.

**Why ±10 % and not ±5 %.** ±5 % of 2000 kcal is 100 kcal — the error bar on
weighing half a chicken breast by eye. At that width the calendar would read red
across weeks that were behaviourally fine, and stop meaning anything. ±10 %
(~200 kcal) prices in logging noise and lets the colour reward the habit, which
is what a calendar measures. The precision instruments already exist elsewhere:
`MacrosChart` with its target line, and the Kalman filter, which folds actual
daily intake with no band at all.

Days before the first `daily_nutrition_history` row are **not drawn**.

### 4.3 Data

| Need | Source | New? |
|---|---|---|
| consumed/planned per day | `useDailyNutritionHistory('6m')` | no — same query key as `MacrosChart`'s default, so **zero extra network** |
| phases with dates | `usePhases()` | no |
| per-day TDEE estimate | `useTdeeEstimates(fromDate)` | **yes** — new `fetchTdeeEstimatesSince` in `features/tdee/api.ts` |

The new select is `select('*')` on `tdee_estimates` filtered by `user_id` and
`computed_on >= fromDate`; the R-32 Tier-4 select-string guard covers it.

### 4.4 Pure core

`src/features/progreso/adherence.ts` — dependency-free, Tier-1:

```ts
buildAdherenceDays({ from, to, history, phases, tdeeByDate }): AdherenceDay[]
// AdherenceDay = { date, targetKcal, consumedKcal, deviationPct, state }
```

Tests must **bite** ([[prove-assertions-bite-by-mutation]]): exact boundaries at
10 % and 20 %, both signs, a `tdee_delta` day with and without an estimate,
a day on a phase boundary (`start_date` and `end_date` inclusive), a gap between
phases, and a logged day with `consumed_kcal = 0` (which is a real zero, not a
null).

### 4.5 Grid

`src/features/progreso/components/AdherenceHeatmap.tsx` — **props-in, no
hooks**, same rule as §2.

- 26 weeks, fixed. No range control of its own.
- Weeks in columns, days in rows, Monday first (both locales).
- CSS grid: `repeat(27, minmax(0, 1fr))` with `aspect-ratio: 1` cells — 27
  because the window's first Monday may precede `from`. **No measured pixels
  and no magic numbers**: the grid scales inside whatever width the card gets,
  which is precisely the class of bug jsdom cannot see ([[jsdom-cannot-see-css]]).

### 4.6 Colour — validated, not eyeballed

The three data states are **ordinal** (`enObjetivo → cerca → lejos`), not
categorical. Three separate hues were tried first and failed: with the app's
existing `--tone-good` / `--excess-warn` / `--excess-bad` trio the validator
reported a protanopia ΔE of **4.9** between "en objetivo" and "cerca" in dark
mode — the single most important pair in the grid, indistinguishable to a
red-green colourblind reader.

The fix is to stop asking three hues to do an ordinal job: **one accent for the
hit, one amber hue in two steps for the misses.** Two steps of one hue separate
by lightness, which no form of colour blindness collapses.

| State | Light | Dark |
|---|---|---|
| `enObjetivo` | `--tone-good` `oklch(0.52 0.13 148)` | `oklch(0.74 0.14 148)` |
| `cerca` | `oklch(0.78 0.13 75)` | `oklch(0.60 0.12 75)` |
| `lejos` | `oklch(0.62 0.13 75)` | `oklch(0.80 0.14 75)` |
| `sinRegistrar` | `--heat-zero` + 1px dashed `--border` | idem |
| `sinObjetivo` | `--heat-part`, no border | idem |

**The amber ramp's direction flips between modes on purpose.** On white, "far
off" is the *darker* amber; on near-black, "far off" is the *brighter* one. Dark
mode is selected, never an automatic inversion of light.

Validator results (`scripts/validate_palette.js`, surfaces `#ffffff` / `#15191d`):

- **Light** — CVD separation PASS (worst adjacent ΔE 15.9 protan), normal-vision
  PASS (15.9), chroma PASS. Contrast WARN on the mid amber (2.04:1).
- **Dark** — CVD PASS (14.4 deutan), normal-vision PASS (20.1), chroma PASS,
  contrast PASS.

Two results are deliberately accepted:

1. **The "lightness band" FAIL in both modes is out of scope.** That check
   exists so no series in a *categorical* palette dominates; the validator's own
   scope note routes ordinal ramps to lightness monotonicity instead. An ordinal
   ramp is supposed to vary lightness.
2. **The light-mode contrast WARN is not dismissed, it is relieved.** The skill
   requires visible labels or a table view; this design ships a named five-chip
   legend, a per-cell `aria-label`, and the tap-detail line below — the state is
   never carried by colour alone.

These are the *computed* values; the implementation must re-run the validator
against the colours as they actually resolve in the browser, since the tokens
are `oklch` and the surfaces are the real card, not `#ffffff` / `#15191d`
exactly.

### 4.7 Interaction and a11y

**Tapping a cell writes a detail line below the grid** — e.g.
`12 mar · 2 040 / 2 200 kcal · −7 %`. It does not open a floating tooltip:
hover does not exist on a phone, and a tooltip is a promise a touch screen
cannot keep. The detail line is also plain text, so it is assertable in a
Tier-2 test.

- A named legend for all five states is always present.
- Every cell carries an `aria-label` with its date, its numbers and its state
  name.
- The grid is keyboard-reachable; the detail line is an `aria-live="polite"`
  region.

## 5. Placement, i18n, tests

**Order on `/progress`:** hero → composición → **balance energético** →
peso (with projection) → chart de composición → historial → macros →
**heatmap**. The balance sits high because it explains the rate the hero
reports; the heatmap sits with `MacrosChart`, its natural neighbour.

**i18n:** namespace `metricas`, keys under `energyBalance.*` and `adherence.*`,
ES + EN. Numbers go through `useNum` / `formatDecimal` — never `toFixed`
([[decimal-point-in-display]]) — and no assertion may assume a thousands
separator, because `es-ES` does not group four digits
([[es-locale-no-grouping-4-digits]]).

**Tests:**

- Tier-1 — `adherence.test.ts` (§4.4), boundary-biting.
- Tier-2 — `EnergyBalanceCard.test.tsx`, `AdherenceHeatmap.test.tsx`, both
  props-in so neither needs a Supabase mock; update `ProgresoPage.test.tsx`.
- Tier-3 / Tier-4 — nothing new beyond the select-string guard picking up the
  new `tdee_estimates` query. No schema change.
- **A real-browser pass is required before this is called done.** The grid is
  pure geometry and the palette is resolved by CSS; jsdom sees neither.

## 6. Non-goals

- The custom date-range picker (§0).
- The ETA accent banner (§0).
- Adherence for macros other than kcal.
- Any change to how the Kalman filter or the snapshot cron work.
- Measurement streak / progress photos — those are R-39.
