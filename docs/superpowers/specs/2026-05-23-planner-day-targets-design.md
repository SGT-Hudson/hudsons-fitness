# U-5 — Planner day totals vs. target — Design

**Status:** design — awaiting user review before plan
**Triage item:** U-5 (see `2026-05-23-notes-triage.md`)
**Depends on:** none (targets + macro core already exist). **Touches:** the shared
macro-status classifier, so it also changes the **Diario** `DayTotalsCard` (intended
consistency — see §9).

## 1. Goal

While building a week in the **planner** and a template in the **template editor**,
show each day's running **macro totals vs. the user's daily target** with phase-aware
over/under feedback, so the user immediately sees whether a day is short or over. The
same enhanced bar/colour treatment is applied to the existing Diario `DayTotalsCard`
for one consistent visual language across the three nutrition surfaces.

Targets already exist (`computePhaseTargets` / `computeDailyMacroTargets`, R-05); the
macro arithmetic already exists (`@/core/macros`). U-5 is **wiring + a shared summary
component + an extended status classifier** — no new SQL macro math, no edge changes.

## 2. Where it appears

| Surface | Container | Placement |
|---|---|---|
| **Planner** (`WeekGrid`) | per-day card | summary block **at the top** of each day card, under the date header (fixed height regardless of how many meals follow) |
| **Template editor** (`TemplateGrid`) | meal-time × day matrix | a **"Total" row** directly under the day-name header, one summary cell per day column |
| **Diario** (`DayTotalsCard`) | existing card | inherits the new bar/overflow rendering + classifier (no layout move) |

One shared presentational component (working name `<DaySummary>`) renders the
planner card-top block and each template total cell. `DayTotalsCard` keeps its larger
hero layout but reuses the shared **`<MacroBar>`** primitive so bars/overflow look
identical everywhere.

## 3. What the summary shows

Five rows, top to bottom: **Kcal**, **Prot**, **Carbs**, **Grasa**, **Fibra**.

- **Kcal** is the lead line: number followed by the unit, e.g. `1 850 / 2 000 Kcal`
  (unit word *after* the value — not a left-hand label like the macro rows). No
  delta text (no "−150" / "+200"): the `consumed / target` pair + colour already
  convey direction.
- **Macro rows**: left label (`Prot` / `Carbs` / `Grasa` / `Fibra`) + right
  `consumed / target` value, with a progress bar below.
- Each row's bar is colour-coded by the classifier (§4) and renders an **overflow
  segment** when over (§5).
- **Avisos** render only when present; the **`?`** help affordance lives *inside* an
  aviso (no aviso ⇒ no `?`). The only aviso is **"⚠ Falta grasa"** (§4, fat floor).

## 4. Status model (extends `classifyMacro`)

`classifyMacro` (today in `src/features/diario/targetStatus.ts`) is **relocated to a
neutral pure module `src/lib/macroStatus.ts`** (no deps; now shared by `diario` +
`planning`) and extended. Colours are derived from a `tone`; the base colour and the
overflow-segment colour are both a function of the tone (§5).

### 4.1 Kcal — phase-aware bands (absolute kcal margins)

Let `d = consumed − target`.

| Phase | blue | green | amber | red |
|---|---|---|---|---|
| **cut** (target = ceiling) | `d < −50` | `−50 ≤ d ≤ +50` | `+50 < d ≤ +100` | `d > +100` |
| **bulk** (target = floor) | — | `−50 ≤ d ≤ +200` | `d > +200` (*superávit alto*) | `d < −50` (*no llegas*) |
| **maintenance** | `d < −band` | within `±band` | — | `d > +band` |

- `band = target × KCAL_MAINTENANCE_BAND_PCT/100` (existing ±5%, **unchanged**).
- New constants: `KCAL_CUT_GREEN_MARGIN = 50`, `KCAL_CUT_AMBER_MARGIN = 100`,
  `KCAL_BULK_GREEN_UNDER_MARGIN = 50`, `KCAL_BULK_SURPLUS_HIGH_MARGIN = 200`.
- **Bulk red applies always** (incl. the live "today" Diario day): for a bulk, "not
  there yet" is the failure direction — there is **no** in-progress/settled
  distinction, which keeps the classifier pure (phase-only).

### 4.2 Macros

| Macro | under | met / in-range | over |
|---|---|---|---|
| **Protein** (floor) | grey (neutral "remaining") | green | green + **dark-green** excess |
| **Fibra** (floor) | **grey, informational — NO amber, NO aviso** | green | green + **dark-green** excess |
| **Carbs** (info) | grey | grey | grey + **dark-red** excess |
| **Grasa** | see below | — | grey + **dark-red** excess |

**Grasa is now a health floor** (essential-fat minimum), three zones:

- `consumed < essentialFatFloorG` → **red** + aviso **"⚠ Falta grasa"** (with `?`)
  and a **min-line tick** on the bar at the floor position (tick shown *only while the
  aviso is shown*).
- `essentialFatFloorG ≤ consumed ≤ target` → grey (informational; above the floor,
  fat is flexible).
- `consumed > target` → grey + dark-red excess.

`essentialFatFloorG = round(0.20 × target.kcal / 9)` — **20 % of target energy**
(reuses the %-of-energy basis already adopted for U-3 recipe filters). Derived from
the target, never stored (hard invariant #5 spirit).

## 5. Bar + overflow rendering (`<MacroBar>`)

Pure presentational primitive. Inputs: `consumed`, `target`, `tone`, optional
`minFloor` (for fat).

- **Not over** (`consumed ≤ target`): single fill, width `consumed/target × 100%`,
  colour = base(tone). Optional white target tick at the right edge; amber **min-tick**
  at `minFloor/target × 100%` when `minFloor` given (fat-low case only).
- **Over** (`consumed > target`): bar normalised to `consumed`. White target tick at
  `target/consumed × 100%`. Two segments: base colour up to the tick, **excess colour**
  from the tick to the end.
- **Excess colour = darker shade of the tone:**

| tone | base | excess |
|---|---|---|
| `onTarget` / `floorMet` (green) | green | dark-green (prot/fibra over = good) |
| `slightOver` / `surplusHigh` (amber) | amber | dark-amber |
| `overBudget` / `fatOver` / `carbOver` (red/grey) | red *(kcal)* or grey *(carbs/grasa)* | **dark-red** |

This is the agreed visual: prot/fibra overshoot reads **dark green** (positive);
kcal/carbs/grasa overshoot reads **dark red** (to watch); cut-kcal tolerance band
reads **amber** then dark-amber.

## 6. Data flow (macros into the planner & templates)

Recipes do **not** store macros; they are computed from ingredients via the core. Both
grids today load only `recipe_id/name/servings`.

1. **Extend the fetch** to also pull each slot's recipe ingredients — mirror the
   existing `fetchWeekShopping` select (`recipe_ingredients(quantity, per_serving,
   ingredient(unit_type, *_per_unit…))`). Planner: extend/parallel `fetchActiveWeek`.
   Template editor: the analogous template-slot fetch.
2. **Pure aggregation helper** (working name `aggregateDayMacros`, in
   `src/features/planning/`): for each slot, `recipePerServingMacros(recipe)` `scale`d
   by `slot.servings`, then `add`-reduced per day → `Macros` per day. Uses only
   `@/core/macros`. Unit-tested in isolation.
3. **Target**: reuse the DiarioPage wiring — `useActivePhase` + latest measurement
   (`weight_kg`, `body_fat_pct`) + latest TDEE → `computePhaseTargets` → one daily
   `Macros` target, applied to **every** day (planner and template editor alike). When
   no active phase / no weight, render totals **without** targets (bars become plain
   fills, no tones — same "no targets" degradation `DayTotalsCard` already has).

## 7. Components / files

- `src/lib/macroStatus.ts` — relocated + extended `classifyMacro` (+ tone enum, base
  & excess colour maps, kcal margin constants, `essentialFatFloorG` helper). Pure.
- `src/components/ui/` or `src/features/planning/` — `<MacroBar>` primitive.
- `src/features/planning/components/DaySummary.tsx` — the shared kcal+macros block.
- `src/features/planning/daySummary.ts` (or `aggregateDayMacros` co-located) — pure
  per-day aggregation.
- Wire into `WeekGrid` (top of each day card) and `TemplateGrid` (total row).
- Refactor `DayTotalsCard` to consume `macroStatus` + `<MacroBar>` (replacing its
  inline `BAR_TONE`/`classifyMacro` import and bar markup).
- Extend planner/template fetch + hooks for ingredient data.

## 8. i18n

ES/EN under `planning` (+ reuse in `diario`): `summary.kcalUnit` ("Kcal"),
`summary.fatLow` ("Falta grasa"), `summary.fatLowHelp` (tooltip: essential fat = 20 %
of kcal, role of fat), `summary.totalRow` ("Total"), `summary.emptyDay` ("Día sin
comidas todavía"). No raw strings.

## 9. Diario impact (intended, must be called out)

Because the classifier is shared, these Diario behaviours **change**:

- **Fibra**: the current low-fiber **amber + "below min" text is removed** — fiber
  under target becomes silent/informational everywhere (per user: "no me avises de que
  estoy comiendo poca fibra").
- **Grasa**: gains the essential-fat floor → a "Falta grasa" state the Diario didn't
  have before.
- **Kcal**: cut now shows a green ±50 "on-target" band (instead of blue all the way to
  target) and a +50…+100 amber tolerance before red; bulk-under now shows red.
- Overflow bars (dark-red / dark-green excess) replace the current clamp-at-100 %.

`DayTotalsCard.test.tsx` and `targetStatus.test.ts` move/expand accordingly.

## 10. Out of scope

- **Meal-cell restyle** (separated meal cards) → deferred to **U-8**.
- No click-to-expand day detail (inline summary is sufficient).
- No change to the logging `MealType` enum, the plan-materialization RPC, or any edge
  function. **Display-only feature → no parity-net changes.**

## 11. Testing

- **Tier-1 (pure, table-driven):** `macroStatus` — every kcal band per phase
  (cut/bulk/maintenance boundary values: −51/−50/+50/+100/+101 etc.), fat floor
  (below/at/above 20 %E), protein/fibra over→floorMet+excess, fibra under→informational
  (no amber), carbs/grasa over→dark-red excess. `aggregateDayMacros` (per-serving
  scaling, multi-slot sum, empty day = ZERO_MACROS).
- **Tier-2 (component):** `<MacroBar>` over vs under widths + tick positions;
  `<DaySummary>` renders aviso+`?` only when fat low, min-tick only with aviso;
  `WeekGrid`/`TemplateGrid` show a per-day/per-column summary; "no targets" degradation.
- **Diario:** update `DayTotalsCard` tests for the new fiber/fat/kcal behaviour.

## 12. Risks / notes

- **Shared-classifier blast radius** (§9): the Diario visibly changes. This is the
  agreed consistency goal, but it is the main review point.
- **Heavier planner/template query**: now pulls ingredient rows for every recipe in
  the view (same shape `fetchWeekShopping` already fetches) — acceptable; both are
  RLS-scoped, read-only.
- **`<MacroBar>` overflow normalises to `consumed`**, so an over-day's base segment
  visually shrinks; the white target tick is what anchors "where 100 % was". Confirmed
  acceptable during design.
- Keep the kcal margin numbers (50 / 100 / 200) as **named constants** in
  `macroStatus.ts` so they're trivially tunable.
