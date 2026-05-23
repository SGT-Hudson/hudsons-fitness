# Planner — all meal periods visible + macros at the bottom — Design

**Status:** design — awaiting user review before plan
**Origin:** user change request (2026-05-24), follow-up to U-5.
**Depends on:** U-5 (per-slot macros + `<DaySummary>`), already in `develop`/`main`.
**Scope:** the weekly planner only (`WeekGrid`). No template-editor change, no data-model change, no migration, no edge/parity impact.

## 1. Goal

Two planner UX changes:

1. **All meal periods always visible.** Today the planner only renders meal buckets
   that already contain a recipe, so empty periods can't be filled. Render **every**
   meal period of the week — empty ones included, each with its "+ Añadir" affordance —
   so the user can add food to any period.
2. **Macros at the bottom.** Move the per-day `<DaySummary>` block from the **top** of
   each day card to the **bottom** (it sat at the top in U-5). With every day now
   showing the same fixed set of periods, the summary still lines up across days.

## 2. Source of meal periods (locked 2026-05-24)

The set of periods is **`meal_plan_weeks.meal_times` (`string[]`)** — the ordered meal
times stored on the week (populated when a template is applied). A period at array
index `i` has **`meal_index = i`** and **`meal_time = meal_times[i]`**, matching how
slots are already keyed (`meal_index` + `meal_time`).

- `fetchActiveWeek` (`features/planner/api.ts`) currently does **not** select
  `meal_times`; add it to the select and to the `ActiveWeek` type.
- **Editing periods (add/remove/reorder meal times) stays out of scope** — that remains
  the template's responsibility. The planner only displays and fills the week's periods.
- **Empty `meal_times`:** if a week has no meal times (weeks normally inherit them from
  their source template, so this is rare), the grid shows the day headers + the macros
  footer with no period rows — the existing "empty week" page state still applies when
  there are no slots at all.

## 3. `WeekGrid` changes (the only component touched)

`features/planning/components/WeekGrid.tsx`:

1. **New prop** `mealTimes: string[]` (from `week.meal_times`), passed by
   `PlanificadorPage`.
2. **Render periods from `mealTimes`, not from existing slots.** For each day, for each
   `(i, time)` in `mealTimes`, render one `SlotCell`:
   - `mealIndex = i`, `mealTime = time`.
   - entries = the day's slots filtered by `meal_index === i` (and `meal_time === time`),
     ordered by `display_order` — same `SlotEntry` shape as today.
   - empty period → `SlotCell` renders just its label + "+ Añadir" (already its behaviour
     when `entries` is empty).
   - `onAdd(date, i, time, recipe, servings)` / `onUpdate` / `onRemove` wire exactly as
     today (the page's `addSlot` computes `display_order` from same-slot count).
3. **Orphan slots (edge):** any slot whose `meal_index` is **not** covered by
   `mealTimes` (e.g. a divergent week edited after the template changed) is rendered in
   an extra trailing period per day (grouped by its `meal_index|meal_time`), so no
   planned data is hidden. Sorted after the `mealTimes` periods.
4. **Move `<DaySummary>` to the bottom.** Render the meal periods first, then the
   `<DaySummary totals={dayTotals.get(day.date) ?? ZERO_MACROS} targets={targets}
   phaseType={phaseType} />` at the **end** of each day card, with a top separator
   (`className="pt-2 border-t mt-1"` replacing the previous `pb-2 border-b`). The
   `aggregateDayMacros` computation is unchanged.

The per-day macro aggregation, `DaySummary`, `MacroBar`, and the macro classifier are
all unchanged — this is purely how `WeekGrid` lays out periods + where the summary sits.

## 4. `PlanificadorPage` change

`src/pages/PlanificadorPage.tsx`: pass `mealTimes={week.data.meal_times}` to
`<WeekGrid>` (alongside the existing `targets`/`phaseType` from `useDailyTarget`).

## 5. Out of scope

- Editing/adding/removing meal periods from the planner (template's job).
- Template editor (`TemplateGrid`) — unchanged (it already shows all periods).
- Any macro/target logic, data model, RPC, or edge change.

## 6. Testing

- **Tier-2 (`WeekGrid`):**
  - Given a week with `meal_times = ['08:00','13:00','17:00','21:00']` and slots only in
    a couple of periods, the grid renders **all four** periods per day (empty ones show
    "+ Añadir").
  - The `<DaySummary>` renders **after** the meal periods (assert DOM order: summary node
    comes after the last `SlotCell` within a day card).
  - Adding to an empty period calls `onAdd` with the correct `meal_index` + `meal_time`.
  - Orphan slot (meal_index beyond `mealTimes`) still appears.
- Existing `WeekGrid`/planner tests updated for the new `mealTimes` prop.

## 7. Risks / notes

- **`mealTimes` prop is now required** by `WeekGrid`; update its call site + any test
  renders. Keep it a plain `string[]` (default `[]` tolerated).
- **Reversal of a U-5 decision** (summary was top, now bottom) — intentional; the
  always-visible periods keep day heights aligned so the footer still lines up.
- Display-only: no CI-gated migration/edge step; normal `claude/*` → develop PR flow.
