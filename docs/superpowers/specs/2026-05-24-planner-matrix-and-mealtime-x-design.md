# Planner aligned matrix + meal-time remove button — Design

**Status:** design — awaiting user review before plan
**Origin:** user request (2026-05-24), reference image `.brainstorm/comidas-alineadas.jpg`.
Two independent UI tweaks bundled (both touch the planning feature, no shared logic).

## 1. Goal

1. **Planner alignment.** Make the week planner (`WeekGrid`) use the same aligned
   matrix layout as the template editor (`TemplateGrid`) so meal-time rows line up
   across all seven days, instead of today's seven independent per-day cards.
2. **Meal-time remove button.** In the template editor's meal-times editor
   (`MealTimesEditor`), restyle the per-time remove control from a faint ghost icon
   into a small solid-red button so it reads as a clickable, destructive action.

No schema, API, RPC, i18n, or behavior changes — purely presentational.

## 2. Decisions (brainstorming 2026-05-24, confirmed via mockups)

1. **Matrix layout** mirrors `TemplateGrid`: a CSS grid `64px repeat(7, minmax(...))`
   — a left gutter column + 7 day columns. Equal-height grid rows give the alignment.
2. **Today / past = treatment A.** Today's column: indigo day-name header + 2px
   underline accent + a faint `ring-1` indigo outline on each of today's cells. Past
   days: cells dimmed (~`opacity-60`). Applied **per cell** (no day-card wrapper).
3. **Meal time lives in the gutter**, so the planner's `SlotCell`s no longer pass
   `mealLabel`. Side effect (intended): the copy-meal icon falls back to its
   hover/top-right position — now identical to the template editor.
4. **Orphan slots** (divergent weeks: a slot whose `meal_index` is beyond the
   configured `meal_times`) get their own aligned rows built from the **union** of
   orphan `(meal_index, meal_time)` across the week; each such row renders 7 cells and
   populates only the days that actually have that orphan. Nothing is hidden.
5. **No shared component extraction.** `WeekGrid` and `TemplateGrid` keep the same
   layout idiom but stay separate — their data models differ enough (dates / today /
   past / orphans / async mutations / copy vs. `day_of_week` / `recipeMacros`) that a
   shared abstraction would be parameter-heavy. YAGNI.
6. **Remove button = solid red, 24px.** `Button variant="destructive"` (theme red),
   `h-6 w-6` (down from `h-8 w-8`), white `X` icon at `h-3.5 w-3.5`. Still rendered
   only when `times.length > 1`. Template editor only (the planner has no meal-times
   editor).

## 3. `WeekGrid` — the matrix

`src/features/planning/components/WeekGrid.tsx`. Props are **unchanged**
(`weekStart, slots, mealTimes, todayIso, onAdd, onUpdate, onRemove, busy, targets,
phaseType, onCopyMeal`). Only the render structure changes.

### Row model
Replace the per-day `periodsFor(date)` loop with a single **week-level row list**
shared by all columns:

- **Configured rows:** one per `mealTimes[i]` → `{ mealIndex: i, mealTime: mealTimes[i] }`.
- **Orphan rows:** scan all `slots` with `meal_index >= mealTimes.length`; collect the
  distinct `(meal_index, meal_time)` keys, sort by `meal_index` then `meal_time`, and
  append each as a row.
- A cell's entries for `(day, row)` = `slots` where `s.date === day.date &&
  s.meal_index === row.mealIndex && (s.meal_time ?? '') === (row.mealTime ?? '')`,
  mapped to `SlotEntry` and sorted by `display_order`.

### Layout (grid children, in order)
- `gridTemplateColumns: 64px repeat(7, minmax(170px, 1fr))`, wrapped in
  `overflow-x-auto` + `min-w-max` (as today).
- **Header row:** empty gutter `<div/>` + 7 header cells. Each header shows
  `formatDate(date,'EEE')` over `formatDate(date,'d MMM')`. Today header: indigo text +
  bottom accent. Past header: dimmed.
- **TOTAL row:** gutter label `t('summary.totalRow')` + 7 cells each wrapping
  `<DaySummary totals={dayTotals.get(date) ?? ZERO_MACROS} targets={targets}
  phaseType={phaseType} />`. `dayTotals` from the existing `aggregateDayMacros(slots.map(
  s => ({ key: s.date, macros: s.macros })))`.
- **Meal rows:** for each row in the row model — a gutter cell showing the meal time
  (`mealTime?.slice(0,5)`), then 7 `SlotCell`s (no `mealLabel`) wired exactly as today
  (`onAdd/onUpdate/onRemove/onCopy/copyLabel/busy`), with `onCopy` →
  `onCopyMeal?.(day.date, row.mealIndex)`.

### Per-cell today/past classes
Compute `isToday = day.date === todayIso` and `isPast = day.date < todayIso` per day.
- Header cell: `isToday` → `text-primary` + accent underline; `isPast` → `opacity-60`.
- TOTAL and meal cells: `isToday` → `ring-1 ring-primary`; `isPast` → `opacity-60`.

The previous full-card `ring-2 ring-primary ring-offset-2` / per-card `week.noSlots`
empty message are dropped — empty cells simply show the `SlotCell` "+ add" button; the
page-level empty state stays in `PlanificadorPage` (`isEmpty`).

## 4. `MealTimesEditor` — remove button

`src/features/planning/components/MealTimesEditor.tsx`. Replace:

```tsx
<Button type="button" variant="ghost" size="icon"
        aria-label={t('editor.removeMeal')} onClick={() => removeAt(idx)}
        className="h-8 w-8">
  <X className="h-4 w-4" />
</Button>
```
with:
```tsx
<Button type="button" variant="destructive" size="icon"
        aria-label={t('editor.removeMeal')} onClick={() => removeAt(idx)}
        className="h-6 w-6">
  <X className="h-3.5 w-3.5" />
</Button>
```
Unchanged: only rendered when `times.length > 1`; same `onClick`, same aria-label.

## 5. Testing

Both changes are presentational; assertions stay behavior-level, not pixel-level.

- **`MealTimesEditor`** (Tier-2, new or extended): with ≥2 times, the remove control is
  a button with `aria-label = t('editor.removeMeal')` and clicking it drops that time
  (calls `onChange` with the time removed); with exactly 1 time, no remove control.
- **`WeekGrid`** (Tier-2, light): renders the meal-time gutter labels from `mealTimes`;
  the 7 day headers render; a populated `(day, meal)` cell shows its recipe; orphan
  slots (a slot at `meal_index` beyond `mealTimes`) still render in their own row.
  Mock `@/features/recipes/hooks` (`useRecipes`) so the supabase client isn't loaded in
  CI — see memory *component test supabase env* (this bit U-6's SlotCell test).
- Full gate green (lint, typecheck, all tests, build) before merge.

## 6. Risks / notes

- **Orphan handling** is the only non-obvious bit; the union-row approach keeps the grid
  aligned and shows every slot. Divergent weeks are uncommon, so this path is low-traffic
  but must not drop data.
- **Today/past per-cell styling** replaces the per-card ring/opacity — verify the today
  column still reads clearly against the `ring-1` (lighter than the old `ring-2`).
- **No new DB/i18n surface.** `summary.totalRow` already exists (used by `TemplateGrid`).
- Visual change — worth an eyeball in the develop preview before promoting to main.
