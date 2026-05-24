# Planner — all meal periods visible + macros at the bottom — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the weekly planner, render every meal period of the week (empty ones included, each with "+ Añadir") sourced from `week.meal_times`, and move the per-day macro summary from the top to the bottom of each day card.

**Architecture:** `fetchActiveWeek` starts returning the week's `meal_times`. `WeekGrid` gains a `mealTimes: string[]` prop and renders one `SlotCell` per period (index → `meal_index`, value → `meal_time`), filling each with that day's slots (empty otherwise); any slot whose `meal_index` is outside `mealTimes` is rendered in a trailing "orphan" period so no data is hidden. `<DaySummary>` moves to the end of each day card. Pure-display change — no data model, macro, or edge changes.

**Tech Stack:** React 18 + TS, Vite, TanStack Query, react-i18next, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-24-planner-periods-and-layout-design.md`

---

## File Structure

- **Modify** `src/features/planner/api.ts` — add `meal_times: string[]` to `ActiveWeek` + the `fetchActiveWeek` select/mapping.
- **Modify** `src/features/planning/components/WeekGrid.tsx` — add `mealTimes` prop; render all periods from it (+ orphan slots); move `<DaySummary>` to the bottom.
- **Create** `src/features/planning/components/WeekGrid.test.tsx` — Tier-2 tests.
- **Modify** `src/pages/PlanificadorPage.tsx` — pass `mealTimes={week.data.meal_times}`.

---

## Task 1: `fetchActiveWeek` returns `meal_times`

**Files:**
- Modify: `src/features/planner/api.ts`

- [ ] **Step 1: Add `meal_times` to the `ActiveWeek` type**

In `src/features/planner/api.ts`, add the field to the `ActiveWeek` interface:

```ts
export interface ActiveWeek {
  id: string;
  week_start: string;
  source_template_id: string | null;
  source_template_name: string | null;
  has_diverged: boolean;
  meal_times: string[];
  slots: WeekSlotWithRecipe[];
}
```

- [ ] **Step 2: Select `meal_times` in `fetchActiveWeek`**

In the `fetchActiveWeek` `.select(...)` string, add `meal_times` to the top-level week
columns. Change the first line of the select from:

```
      `id, week_start, source_template_id, has_diverged,
```
to:
```
      `id, week_start, meal_times, source_template_id, has_diverged,
```

- [ ] **Step 3: Carry it through the raw cast + return**

In the `const raw = data as unknown as { ... }` type, add `meal_times: string[];`. In
the returned object (the `return { id: raw.id, ... }`), add:

```ts
    meal_times: raw.meal_times ?? [],
```

- [ ] **Step 4: Typecheck**

Run: `cd /d/dev/hudsons-fitness/.claude/worktrees/planner-periods-layout && pnpm typecheck`
Expected: PASS (WeekGrid still compiles; it doesn't consume `meal_times` until Task 2, and `PlanificadorPage` doesn't pass it until Task 3 — the new field is optional to consumers).

- [ ] **Step 5: Commit**

```bash
git add src/features/planner/api.ts
git commit -m "feat(planner): return week.meal_times from fetchActiveWeek"
```

---

## Task 2: `WeekGrid` renders all periods + macros at the bottom

**Files:**
- Modify: `src/features/planning/components/WeekGrid.tsx`
- Create: `src/features/planning/components/WeekGrid.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/planning/components/WeekGrid.test.tsx`:

```tsx
import '@/i18n';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WeekGrid } from './WeekGrid';
import type { WeekSlotWithRecipe } from '@/features/planner/api';
import { ZERO_MACROS } from '@/features/recipes/macros';

// SlotCell renders the (closed) RecipePickerDialog, which transitively imports the
// Supabase client; stub the recipe data hook so the import chain stays inert.
vi.mock('@/features/recipes/hooks', () => ({
  useRecipes: () => ({ data: [], isLoading: false }),
}));

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const slot = (over: Partial<WeekSlotWithRecipe>): WeekSlotWithRecipe => ({
  id: 'id', date: '2026-05-25', meal_index: 0, meal_time: '08:00',
  recipe_id: 'r', recipe_name: 'Avena', servings: 1, display_order: 0,
  macros: ZERO_MACROS, ...over,
});

const noop = () => {};

describe('WeekGrid — all periods visible', () => {
  it('renders every meal period from mealTimes, including empty ones', () => {
    renderWithClient(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-25"
        mealTimes={['08:00', '13:00', '17:00', '21:00']}
        slots={[slot({ id: 's1', meal_index: 0, recipe_name: 'Avena' })]}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
      />,
    );
    // Monday (the weekStart day) shows all 4 period labels even though only one is filled
    expect(screen.getAllByText('08:00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('13:00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('17:00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('21:00').length).toBeGreaterThan(0);
    // Empty periods expose the add affordance (one "add" control per period per day)
    expect(screen.getAllByText(/Añadir/i).length).toBeGreaterThanOrEqual(4 * 7);
  });

  it('renders the day summary AFTER the meal periods (bottom of the card)', () => {
    const { container } = renderWithClient(
      <WeekGrid
        weekStart="2026-05-25"
        todayIso="2026-05-25"
        mealTimes={['08:00']}
        slots={[]}
        targets={{ kcal: 2000, proteinG: 150, carbsG: 200, fatG: 65, fiberG: 30 }}
        phaseType="cut"
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
      />,
    );
    // First day card: the kcal unit ("Kcal") from DaySummary must appear after the
    // first add affordance in DOM order.
    const card = container.querySelector('.grid > div') as HTMLElement;
    const html = card.innerHTML;
    expect(html.indexOf('Añadir')).toBeGreaterThan(-1);
    expect(html.toLowerCase().indexOf('kcal')).toBeGreaterThan(html.indexOf('Añadir'));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- WeekGrid`
Expected: FAIL — `WeekGrid` doesn't accept `mealTimes` yet and only renders filled periods (empty periods/labels missing; summary still at top).

- [ ] **Step 3: Rewrite WeekGrid to render periods from `mealTimes` + move the summary**

Replace the body of `src/features/planning/components/WeekGrid.tsx` with:

```tsx
import { useTranslation } from 'react-i18next';
import { addDays, parseISO } from 'date-fns';
import { SlotCell, type SlotEntry } from './SlotCell';
import { DaySummary } from './DaySummary';
import { aggregateDayMacros } from '@/features/planning/daySummary';
import { ZERO_MACROS, type Macros } from '@/features/recipes/macros';
import { formatDate, type Locale } from '@/lib/dates';
import type { PhaseType } from '@/lib/macroStatus';
import type { WeekSlotWithRecipe } from '@/features/planner/api';

interface Props {
  weekStart: string;
  slots: WeekSlotWithRecipe[];
  mealTimes: string[];
  todayIso: string;
  onAdd: (
    date: string,
    mealIndex: number,
    mealTime: string | null,
    recipe: { id: string; name: string },
    servings: number,
  ) => void | Promise<void>;
  onUpdate: (
    slotId: string,
    recipe: { id: string; name: string },
    servings: number,
  ) => void | Promise<void>;
  onRemove: (slotId: string) => void | Promise<void>;
  busy?: boolean;
  targets?: Macros;
  phaseType?: PhaseType;
}

interface Period {
  mealIndex: number;
  mealTime: string | null;
  entries: SlotEntry[];
}

function toEntry(s: WeekSlotWithRecipe): SlotEntry {
  return { id: s.id, recipe_id: s.recipe_id, recipe_name: s.recipe_name, servings: s.servings };
}

export function WeekGrid({
  weekStart,
  slots,
  mealTimes,
  todayIso,
  onAdd,
  onUpdate,
  onRemove,
  busy,
  targets,
  phaseType,
}: Props) {
  const { t, i18n } = useTranslation('planning');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;

  const weekStartDate = parseISO(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => {
    const iso = formatDate(addDays(weekStartDate, i), 'yyyy-MM-dd', locale);
    return { date: iso, isPast: iso < todayIso };
  });

  const slotsByDay = new Map<string, WeekSlotWithRecipe[]>();
  for (const s of slots) {
    const arr = slotsByDay.get(s.date) ?? [];
    arr.push(s);
    slotsByDay.set(s.date, arr);
  }

  const dayTotals = aggregateDayMacros(slots.map((s) => ({ key: s.date, macros: s.macros })));

  function periodsFor(date: string): Period[] {
    const daySlots = slotsByDay.get(date) ?? [];
    // One period per configured meal time (always shown, even empty).
    const periods: Period[] = mealTimes.map((time, i) => ({
      mealIndex: i,
      mealTime: time,
      entries: daySlots.filter((s) => s.meal_index === i).map(toEntry),
    }));
    // Orphan slots: meal_index beyond the configured meal_times (divergent week) —
    // grouped + appended so no planned data is hidden.
    const orphans = new Map<string, Period>();
    for (const s of daySlots) {
      if (s.meal_index < mealTimes.length) continue;
      const key = `${s.meal_index}|${s.meal_time ?? ''}`;
      const b = orphans.get(key) ?? { mealIndex: s.meal_index, mealTime: s.meal_time, entries: [] };
      b.entries.push(toEntry(s));
      orphans.set(key, b);
    }
    const orphanList = Array.from(orphans.values()).sort(
      (a, b) => a.mealIndex - b.mealIndex || (a.mealTime ?? '').localeCompare(b.mealTime ?? ''),
    );
    return [...periods, ...orphanList];
  }

  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <div className="grid gap-2 min-w-max" style={{ gridTemplateColumns: `repeat(7, minmax(170px, 1fr))` }}>
        {days.map((day) => {
          const date = parseISO(day.date);
          const isToday = day.date === todayIso;
          const periods = periodsFor(day.date);
          return (
            <div
              key={day.date}
              className={
                'rounded-md border bg-card p-2 space-y-2 ' +
                (isToday ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : '') +
                (day.isPast ? ' opacity-70' : '')
              }
            >
              <div className="flex items-baseline justify-between gap-2 pb-1 border-b">
                <span className="text-xs font-semibold uppercase tracking-wide">
                  {formatDate(date, 'EEE', locale)}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatDate(date, 'd MMM', locale)}
                </span>
              </div>

              {periods.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">{t('week.noSlots')}</p>
              ) : (
                periods.map((p) => (
                  <SlotCell
                    key={`${day.date}-${p.mealIndex}-${p.mealTime ?? ''}`}
                    mealLabel={p.mealTime ? p.mealTime.slice(0, 5) : undefined}
                    entries={p.entries}
                    busy={busy}
                    onAdd={(recipeId, recipeName, servings) =>
                      onAdd(day.date, p.mealIndex, p.mealTime, { id: recipeId, name: recipeName }, servings)
                    }
                    onUpdate={(slotId, recipeId, recipeName, servings) =>
                      onUpdate(slotId, { id: recipeId, name: recipeName }, servings)
                    }
                    onRemove={(slotId) => onRemove(slotId)}
                  />
                ))
              )}

              <DaySummary
                totals={dayTotals.get(day.date) ?? ZERO_MACROS}
                targets={targets}
                phaseType={phaseType}
                className="pt-2 border-t mt-1"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- WeekGrid`
Expected: PASS (all periods render incl. empty; summary after periods).

- [ ] **Step 5: Commit**

```bash
git add src/features/planning/components/WeekGrid.tsx src/features/planning/components/WeekGrid.test.tsx
git commit -m "feat(planner): show all meal periods (empty included) + macros at the bottom"
```

---

## Task 3: `PlanificadorPage` passes `mealTimes`

**Files:**
- Modify: `src/pages/PlanificadorPage.tsx`

- [ ] **Step 1: Pass the prop**

In `src/pages/PlanificadorPage.tsx`, in the `<WeekGrid … />` usage (the one inside
`week.data && (…)`), add the `mealTimes` prop next to the existing `targets`/`phaseType`:

```tsx
          <WeekGrid
            weekStart={week.data.week_start}
            slots={week.data.slots}
            mealTimes={week.data.meal_times}
            todayIso={today}
            busy={busy}
            targets={targets}
            phaseType={phaseType}
            onAdd={async (date, mealIndex, mealTime, recipe, servings) => {
              // ...unchanged body...
            }}
            onUpdate={/* unchanged */ undefined as never}
            onRemove={/* unchanged */ undefined as never}
          />
```

(Only ADD the `mealTimes={week.data.meal_times}` line — leave the existing `onAdd`/
`onUpdate`/`onRemove`/other props exactly as they are. The placeholder comments above
are not literal; do not change the existing handlers.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/PlanificadorPage.tsx
git commit -m "feat(planner): wire week.meal_times into WeekGrid"
```

---

## Task 4: Final verification gate + PR

- [ ] **Step 1: Full gate**

Run: `pnpm lint && pnpm typecheck && pnpm build && pnpm test`
Expected: all green (lint 0 errors; typecheck clean; build ok; full suite incl. the new WeekGrid tests).

- [ ] **Step 2: Manual spot-check (`pnpm dev`)**

- Planner shows ALL meal periods per day; empty periods show "+ Añadir" and accept a recipe.
- The macro summary sits at the BOTTOM of each day card.
- Adding to a previously-empty period persists (slot created with the right meal_index/meal_time).

- [ ] **Step 3: Push + open PR to develop**

```bash
git push -u origin claude/planner-periods-layout
gh pr create --base develop --title "feat(planner): all meal periods visible + macros at the bottom" --body "<summary + 'Implements docs/superpowers/specs/2026-05-24-planner-periods-and-layout-design.md'>"
```

---

## Self-Review (completed)

- **Spec coverage:** all periods from `meal_times` (Tasks 1+2), empty periods with add (Task 2), orphan slots (Task 2), summary moved to bottom (Task 2), `fetchActiveWeek` returns `meal_times` (Task 1), page wiring (Task 3), out-of-scope items untouched. ✓
- **Placeholder scan:** the only non-literal block is the Task 3 snippet, explicitly marked "ADD only this line; do not change existing handlers" — the real change is the single `mealTimes={week.data.meal_times}` line. No TBD/TODO elsewhere.
- **Type consistency:** `mealTimes: string[]` defined in Task 2's Props matches the `week.data.meal_times` (`string[]`) from Task 1's `ActiveWeek`; `Period`/`SlotEntry`/`toEntry` are self-consistent; `onAdd` signature unchanged from the current component.
- **Test import note:** the WeekGrid test mocks `@/features/recipes/hooks` (SlotCell → closed RecipePickerDialog → RecipeAutocomplete → Supabase), mirroring the existing `RecipePickerDialog.test.tsx` pattern.
