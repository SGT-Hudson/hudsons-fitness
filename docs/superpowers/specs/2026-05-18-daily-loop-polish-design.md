# Daily-loop polish — design spec

**Date:** 2026-05-18
**Status:** approved (brainstorming) — ready for implementation planning
**Scope:** UX/presentational polish of the everyday Diario + Progreso loop.
**Not** a roadmap R-id item; net-new polish spawned outside the conventions
review. **No schema changes, no migrations, no edge-fn changes.** Honors the
hard invariants (metric-only; BMR/target-weight are derived-never-stored;
DB canonical; doc-discipline #7).

Three independent themes, implemented as **three sequenced PRs** with a
review checkpoint between each:

1. **Targets view** (`DayTotalsCard`) — option **B1**
2. **Faster logging** (`DiarioPage`) — option **L1**
3. **Trend-truth** (Progreso) — option **T1 + T1b**, phase-aware Δ

Themes 1 and 2 both edit `DiarioPage`/its children, so they are ordered
(1 then 2) to avoid churn. Theme 3 is isolated to the measurements/progreso
features. Each PR must pass `pnpm lint` + `pnpm build` + `pnpm test`
(CI-enforced) and ship its new pure logic with Vitest coverage (the existing
cross-cutting R-16 rule). ES/EN i18n added per theme. On each merge, update
the matching `docs/features.md` section (never before — invariant #7).

Mockups validated via the brainstorming visual companion are persisted under
`.superpowers/brainstorm/` (gitignored).

---

## Theme 1 — Meaningful targets view (B1)

### Problem

`DayTotalsCard` (`src/features/diario/components/DayTotalsCard.tsx`) renders
every macro identically: the progress bar turns `bg-destructive` (red) for
**any** value over target. This is semantically wrong — over-protein and
over-fiber are *good*; on a **cut** the goal is to be *under* the kcal
target. The card actively discourages correct behavior, and it never shows
the single number the user acts on during the day: **what's left**.

### Design

**Locked layout (B1):** a phase-aware **kcal-remaining hero** (big number)
on top, then a **2×2 grid** of macro blocks below. Each macro block keeps
today's `consumed/target` big number, a semantic-colored progress bar, and a
new one-line "remaining" sub-label.

**New pure module** `src/features/diario/targetStatus.ts` (+ `.test.ts`):

```
type MacroKind = 'kcal' | 'protein' | 'fiber' | 'carbs' | 'fat';
type PhaseType = 'cut' | 'maintenance' | 'bulk';
type Tone = 'budget' | 'overBudget' | 'floorMet' | 'floorUnder'
          | 'flex' | 'toGo';

interface MacroStatus {
  remaining: number;     // target - consumed (may be negative)
  fillPct: number;       // clamp(consumed/target, 0..1) * 100
  tone: Tone;            // drives color + which i18n sub-label
}

function classifyMacro(
  kind: MacroKind,
  consumed: number,
  target: number | undefined,
  phaseType: PhaseType | undefined,
): MacroStatus
```

Rules:

- **kcal** — phase-aware:
  - `cut`: a **budget**. `consumed ≤ target` → `budget` (blue, "N restantes /
    en margen"). `consumed > target` → `overBudget` (red, "+N de más").
  - `bulk`: a **goal**. `consumed < target` → `toGo` (blue, "faltan N").
    `consumed ≥ target` → `floorMet` (green, "✓ objetivo").
  - `maintenance`: a target **band**. within `±KCAL_MAINTENANCE_BAND_PCT`
    (named const, 5%) → `floorMet` (green). Outside → `budget`/`toGo` tone
    by sign (neutral, no red).
- **protein** — floor. `≥ target` → `floorMet` (green, "✓ cubierto +N g").
  `< target` → `floorUnder` rendered **neutral** (not alarming): blue
  "faltan N g". Bar caps at 100%.
- **fiber** — floor with a health-minimum. `≥ target` → `floorMet` (green).
  `< target` → `floorUnder` (amber, "−N bajo el mínimo"). (Fiber under is
  the one floor we flag amber; protein under is just "remaining".)
- **carbs**, **fat** — `flex` (grey, informational): show "N restantes" /
  "+N", never a judgment color. (Fat is technically a derived target but is
  treated informational here — a deliberate polish simplification, recorded
  so it isn't mistaken for an oversight.)
- **No target** (no active phase or no measurement) → `classifyMacro`
  returns `flex` and the card shows consumed-only with the existing
  `totals.targetsHint`; the hero is hidden.

**Hero:** kcal-remaining big number with a phase-aware label —
`cut`/`maintenance` "kcal restantes" (negative → "kcal de más", red);
`bulk` "kcal para el objetivo". Hidden when no target.

**Props:** `DayTotalsCard` gains `phaseType?: PhaseType`. `DiarioPage`
already holds `activePhase.data` → pass `activePhase.data?.phase_type`.
`proteinBasis` note and the `tdeeConfidence` badge logic are unchanged.

**Files:** rework `DayTotalsCard.tsx`; new `targetStatus.ts` (+ test);
`DiarioPage.tsx` passes `phaseType`; `i18n/{es,en}/diario.json` new keys
under `totals.*` (restantes, enMargen, deMas, cubierto, bajoMinimo, faltan,
heroLabelCut, heroLabelBulk).

### Testing

- Tier-1: `classifyMacro` truth table — over-protein → `floorMet`; cut
  under-kcal → `budget`; cut over-kcal → `overBudget`; fiber under →
  `floorUnder`; carbs/fat → `flex`; no target → `flex`.
- Tier-2: `DayTotalsCard` renders green (not red) for over-protein; blue
  (not red) for cut under-kcal; amber for fiber under-min; hint + no hero
  when targets absent.

---

## Theme 2 — Faster logging (L1)

### Problem

Every entry goes through the full `MealLogDialog`. Empty meal sections
(`DiarioPage` does `if (items.length === 0) return null`) don't render at
all, so an empty Dinner has no "+" and no entry point. There is no
quick-add of foods you eat repeatedly, and no per-meal subtotal.

### Design

**Locked layout (L1):** always render every `MEAL_TYPE_ORDER` section
(even empty). Each section header shows the meal name, a **per-meal kcal
subtotal** (`— sin registros` when empty), and a "+". Directly under the
header sits a **quick-add chip strip** (recent + frequent recipes). Tapping
a chip logs **1 serving** to that meal instantly and shows an **undo toast**
(no dialog).

**Quick-add source — recent + frequent blend, no schema.** New query
`fetchRecentRecipesForQuickAdd(userId)` in `src/features/diario/api.ts`:
the user's `meal_logs` joined to `recipes` over the last ~60 days, where
`recipe_id is not null` and `recipes.deleted_at is null` (interim until
R-01), returning `{ recipeId, name, kcalPerServing, loggedOn }` rows.

**New pure module** `src/features/diario/quickAdd.ts` (+ `.test.ts`):

```
function buildQuickAddList(
  rows: QuickAddRow[],
  opts: { now: Date; cap?: number; recentWindowDays?: number },
): QuickAddItem[]   // cap default 6, recentWindowDays default 14
```

1. **Recent:** distinct recipes by most-recent `loggedOn` within
   `recentWindowDays`, newest first.
2. **Backfill:** if fewer than `cap`, append the most-*frequent* recipes
   over the whole window (log-count desc), excluding ones already included.
3. Cap at `cap`. Deterministic; unit-tested with a frozen clock.

**Hooks** (`src/features/diario/hooks.ts`):

- `useQuickAddRecipes()` — query + `buildQuickAddList`.
- `useQuickAddMealLog()` — wraps `createMealLog`; **suppresses** the generic
  `toastCreated`; on success shows an undo toast:
  `toast({ title: t('quickAdd.added',{name}), durationMs: 6000, action:
  <ToastAction onClick={() => deleteMealLog(insertedId)}>
  {t('quickAdd.undo')}</ToastAction> })`. Requires `createMealLog` to return
  the inserted row id — confirm it does `.select().single()`; add if missing
  (small, safe).

**Component split.** `DiarioPage.tsx` (~205 lines) will grow; extract the
per-meal card into `src/features/diario/components/MealSection.tsx`
(header + subtotal + entries + `<QuickAddStrip>`), keeping `DiarioPage` a
composition. New `src/features/diario/components/QuickAddStrip.tsx`
(horizontal-scroll chips; `mealType` + `date` props).

**Edge cases:** empty quick-add list (new user / no history) → strip
hidden. Recipe with null kcal → chip shows name, kcal blank. Undo after the
toast expired → entry stays; user deletes via the normal edit affordance.
Undo deletes only the just-created row by id. Quick-add rows are
`from_plan = false` and never collide with plan materialization.

**Files:** `DiarioPage.tsx` (restructure: render all sections, subtotals);
new `MealSection.tsx`, `QuickAddStrip.tsx`, `quickAdd.ts` (+ test); `api.ts`
+ `hooks.ts` additions; `i18n/{es,en}/diario.json` (`quickAdd.*`,
`mealSubtotal`, `noEntries`).

### Testing

- Tier-1: `buildQuickAddList` — recency ordering, dedup, frequency
  backfill, cap, empty input (frozen clock).
- Tier-2: `QuickAddStrip` chip click fires the mutation and renders an undo
  action; undo invokes delete with the right id.

---

## Theme 3 — Trend-truth on Progreso (T1 + T1b, phase-aware Δ)

### Problem

`LatestMeasurementCard` shows absolute snapshot values with no movement —
contradicting the app's founding rationale ("a single weigh-in lies; only
the smoothed trend tells you whether composition is actually moving"). The
weight chart has no goal reference.

### Design

**Locked layout (T1 + T1b):**

- **Weight headline:** label "Peso · tendencia (media 5d)", a hero = big
  **smoothed** (5-day-avg) weight + unit + **rate/week** (colored), then a
  conditional sub-line: "−N desde el inicio · faltan M al objetivo (Z)".
- **BMR (T1b):** a quiet `label → value` line directly under the weight
  hero (BMR is derived from weight, so they belong together), **no Δ**,
  existing help text. Reuse `estimatedBmr(...)` exactly as today.
- **Composition grid:** 3-up (Grasa / Músculo / Agua), each value + a
  small colored Δ.
- Preserve the existing stale-measurement amber banner, notes line,
  loading state, and the no-`latest` empty state.

**Data sources (all existing):**

- Smoothed weight: `useSmoothedMeasurements(...)` (the weight chart already
  uses it).
- Since-start: latest smoothed − `profile.initial_weight_kg` (the A7
  anchor; via the profile hook).
- To-goal + reference line: `computeTargetWeightKg({ currentWeightKg,
  currentBodyFatPct, targetBodyFatPct })` (`src/lib/macros.ts`).
  `targetBodyFatPct` ← the single per-user `goals` row (read-only
  `useGoal()` from the objetivos feature). **Rendered only when a goal is
  set AND latest `body_fat_pct` exists**; otherwise the clause and the
  reference line are silently omitted.

**New pure module** `src/features/measurements/trend.ts` (+ `.test.ts`):

```
const TREND_LOOKBACK_DAYS = 7;

// rate over the smoothed series: latest vs the point closest to 7d earlier
function smoothedRatePerWeek(series, now): number | null

// per composition field: latest minus the most-recent prior measurement
// ≥ TREND_LOOKBACK_DAYS older with that field non-null (fallback: nearest
// prior non-null; null if none)
function compositionDelta(measurements, field, now): number | null

// phase-aware tone (user decision: phase-aware)
function deltaTone(
  metric: 'weight' | 'bodyFat' | 'muscle' | 'water',
  deltaSign: -1 | 0 | 1,
  phaseType?: 'cut' | 'maintenance' | 'bulk',
): 'good' | 'bad' | 'neutral'
```

`deltaTone` rules:

- **weight:** `cut` → ↓ good / ↑ bad; `bulk` → ↑ good / ↓ bad;
  `maintenance` → ~0 good, drift neutral; **no active phase → neutral**.
- **bodyFat:** ↓ good / ↑ bad whenever an active phase exists; neutral if
  none.
- **muscle:** ↑ good / ↓ bad — **always** (phase-independent).
- **water:** **always neutral**.
- **BMR:** no Δ at all.

`ProgresoPage` gains a read-only `useActivePhase()` dependency (it is
phase-free today; this is the deliberate, user-approved trade for
meaningful coloring). `null` phase → the neutral fallbacks above.

**WeightChart:** add an optional dashed horizontal reference line + label
at the derived target weight (Recharts `ReferenceLine`, consistent with the
R-11 chart work), gated on a `targetWeightKg?` prop; absent → no line.

**Files:** rework `LatestMeasurementCard.tsx` (T1b); new `trend.ts`
(+ test); `WeightChart.tsx` (reference line); `ProgresoPage.tsx` (wire
smoothed series, profile, goal, active phase, pass `targetWeightKg`);
`i18n/{es,en}/metricas.json` (rate/week, sinceStart, toGoal, trend label).

### Testing

- Tier-1: `smoothedRatePerWeek` (gap handling, insufficient history → null);
  `compositionDelta` (7-day lookback, nulls, fallback); `deltaTone` full
  matrix incl. no-phase fallbacks (frozen clock where time-based).
- Tier-2: `LatestMeasurementCard` — conditional clauses (no goal → no
  to-goal/line; no bf% → omitted), BMR delta-free, phase-aware Δ colors.

---

## Out of scope (YAGNI)

- Goal-date **projection / plateau prediction** — explicitly excluded; the
  reference line plots an already-derived value, no extrapolation. (Remains
  an uncommitted `features.md` product idea.)
- **Favorites/starred** quick-add — would need schema; excluded to keep the
  no-schema guardrail. Recent+frequent blend covers the need.
- Daily-summary **push notification** — separate uncommitted idea; the
  in-page kcal-remaining hero is the polish-scope answer.
- Any new domain, table, RPC, edge function, or migration.

## Sequencing & integration

1. PR #1 — Theme 1 (DayTotalsCard + `targetStatus.ts` + DiarioPage prop).
2. PR #2 — Theme 2 (MealSection/QuickAddStrip extraction + `quickAdd.ts` +
   hooks/api). Built on PR #1's DiarioPage.
3. PR #3 — Theme 3 (LatestMeasurementCard + `trend.ts` + WeightChart +
   ProgresoPage wiring).

Each: own short-lived branch → PR → CI green (lint+build+test) → review
checkpoint → merge; then update the relevant `docs/features.md` section.
Optionally track the three as roadmap entries (R-19/R-20/R-21) or a single
"daily-loop polish" sprint line — a docs decision at planning time, not a
blocker.
