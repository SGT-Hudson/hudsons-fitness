# Planner Aligned Matrix + Meal-Time Remove Button — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the week planner render as the template editor's aligned meal-time × day matrix, and restyle the meal-times editor's per-time remove control into a small solid-red button.

**Architecture:** Two independent presentational changes in `src/features/planning/components/`. `WeekGrid` is rewritten from seven per-day cards to a single CSS-grid matrix (gutter + 7 day columns) mirroring `TemplateGrid`, with per-cell today/past styling and union-built orphan rows. `MealTimesEditor` swaps its ghost remove button for the `destructive` variant at 24px. No schema/API/i18n/behavior changes.

**Tech Stack:** React 18 + TS, react-i18next, date-fns, Tailwind, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-24-planner-matrix-and-mealtime-x-design.md`

**Workspace:** isolated worktree `D:\dev\hf-planner-matrix` (branch `claude/planner-matrix-mealtime-x`, based on `origin/develop`). Run all commands from there.

---

## File Structure

- Modify: `src/features/planning/components/MealTimesEditor.tsx` — remove-button restyle
- Create: `src/features/planning/components/MealTimesEditor.test.tsx` — Tier-2 test
- Modify: `src/features/planning/components/WeekGrid.tsx` — matrix rewrite
- Modify: `src/features/planning/components/WeekGrid.test.tsx` — replace the summary-position test, add matrix/orphan/today-past tests

`PlanificadorPage.tsx` is **untouched** — `WeekGrid`'s props are unchanged.

---

## Task 1: Meal-time remove button → solid red 24px

**Files:**
- Create: `src/features/planning/components/MealTimesEditor.test.tsx`
- Modify: `src/features/planning/components/MealTimesEditor.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/planning/components/MealTimesEditor.test.tsx
import i18n from '@/i18n';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MealTimesEditor } from './MealTimesEditor';

beforeAll(() => {
  void i18n.changeLanguage('es'); // assertions use the Spanish copy
});

describe('MealTimesEditor', () => {
  it('removes a time when its remove button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MealTimesEditor times={['08:00', '13:00']} onChange={onChange} />);
    const removes = screen.getAllByRole('button', { name: 'Quitar' });
    expect(removes).toHaveLength(2);
    await user.click(removes[0]);
    expect(onChange).toHaveBeenCalledWith(['13:00']);
  });

  it('shows no remove button when only one time remains', () => {
    render(<MealTimesEditor times={['08:00']} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Quitar' })).toBeNull();
  });

  it('renders the remove button as a destructive (red) control', () => {
    render(<MealTimesEditor times={['08:00', '13:00']} onChange={() => {}} />);
    const remove = screen.getAllByRole('button', { name: 'Quitar' })[0];
    expect(remove.className).toContain('bg-destructive');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/features/planning/components/MealTimesEditor.test.tsx`
Expected: the third test FAILS — the current ghost button has no `bg-destructive` class. (First two pass.)

- [ ] **Step 3: Restyle the remove button**

In `src/features/planning/components/MealTimesEditor.tsx`, replace this block:

```tsx
            {times.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('editor.removeMeal')}
                onClick={() => removeAt(idx)}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
```

with:

```tsx
            {times.length > 1 && (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                aria-label={t('editor.removeMeal')}
                onClick={() => removeAt(idx)}
                className="h-6 w-6"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/features/planning/components/MealTimesEditor.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/planning/components/MealTimesEditor.tsx src/features/planning/components/MealTimesEditor.test.tsx
git commit -m "feat(planner): meal-time remove button → solid red 24px button"
```

---

## Task 2: WeekGrid aligned matrix

**Files:**
- Modify: `src/features/planning/components/WeekGrid.tsx`
- Modify: `src/features/planning/components/WeekGrid.test.tsx`

- [ ] **Step 1: Replace the test file with matrix expectations**

Overwrite `src/features/planning/components/WeekGrid.test.tsx` with:

```tsx
import i18n from '@/i18n';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

beforeAll(() => {
  void i18n.changeLanguage('es'); // jsdom defaults to English; assert Spanish copy
});

describe('WeekGrid — aligned matrix', () => {
  it('renders each configured meal time once in the gutter', () => {
    renderWithClient(
      <WeekGrid
        weekStart="2026-05-25" todayIso="2026-05-25"
        mealTimes={['08:00', '13:00', '17:00', '21:00']}
        slots={[slot({ id: 's1', meal_index: 0, recipe_name: 'Avena' })]}
        onAdd={noop} onUpdate={noop} onRemove={noop}
      />,
    );
    // Gutter holds one label per meal time (not one per day).
    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText('21:00')).toBeInTheDocument();
    // 4 periods × 7 days of add affordances.
    expect(screen.getAllByText(/Añadir/i).length).toBeGreaterThanOrEqual(4 * 7);
  });

  it('puts the TOTAL row before the meal periods', () => {
    const { container } = renderWithClient(
      <WeekGrid
        weekStart="2026-05-25" todayIso="2026-05-25"
        mealTimes={['08:00']} slots={[]}
        targets={{ kcal: 2000, proteinG: 150, carbsG: 200, fatG: 65, fiberG: 30 }}
        phaseType="cut"
        onAdd={noop} onUpdate={noop} onRemove={noop}
      />,
    );
    const html = container.innerHTML.toLowerCase();
    // The macro total (kcal) row is rendered above the meal "add" cells.
    expect(html.indexOf('kcal')).toBeGreaterThan(-1);
    expect(html.indexOf('kcal')).toBeLessThan(html.indexOf('añadir'));
  });

  it('shows a populated cell\'s recipe', () => {
    renderWithClient(
      <WeekGrid
        weekStart="2026-05-25" todayIso="2026-05-25"
        mealTimes={['08:00']}
        slots={[slot({ id: 's1', date: '2026-05-26', recipe_name: 'Tortilla' })]}
        onAdd={noop} onUpdate={noop} onRemove={noop}
      />,
    );
    expect(screen.getByText('Tortilla')).toBeInTheDocument();
  });

  it('renders an orphan slot (meal_index beyond mealTimes) in its own row', () => {
    renderWithClient(
      <WeekGrid
        weekStart="2026-05-25" todayIso="2026-05-25"
        mealTimes={['08:00']}
        slots={[slot({ id: 'o1', date: '2026-05-27', meal_index: 3, meal_time: '23:00', recipe_name: 'Snack' })]}
        onAdd={noop} onUpdate={noop} onRemove={noop}
      />,
    );
    expect(screen.getByText('23:00')).toBeInTheDocument();
    expect(screen.getByText('Snack')).toBeInTheDocument();
  });

  it('marks today (ring) and past days (dimmed)', () => {
    const { container } = renderWithClient(
      <WeekGrid
        weekStart="2026-05-25" todayIso="2026-05-27"
        mealTimes={['08:00']} slots={[]}
        targets={{ kcal: 2000, proteinG: 150, carbsG: 200, fatG: 65, fiberG: 30 }}
        onAdd={noop} onUpdate={noop} onRemove={noop}
      />,
    );
    // 2026-05-25/26 are past (before the 27th); the 27th is today.
    expect(container.querySelector('.ring-primary')).not.toBeNull();
    expect(container.querySelector('.opacity-60')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/features/planning/components/WeekGrid.test.tsx`
Expected: FAIL — the current per-day-card `WeekGrid` has no gutter labels rendered once, no `.ring-primary`, and `kcal` appears after `añadir` (summary is at the bottom).

- [ ] **Step 3: Rewrite `WeekGrid` as the matrix**

Overwrite `src/features/planning/components/WeekGrid.tsx` with:

```tsx
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, parseISO } from 'date-fns';
import { SlotCell, type SlotEntry } from './SlotCell';
import { DaySummary } from './DaySummary';
import { aggregateDayMacros } from '@/features/planning/daySummary';
import { ZERO_MACROS, type Macros } from '@/features/recipes/macros';
import { formatDate, type Locale } from '@/lib/dates';
import { cn } from '@/lib/utils';
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
  onCopyMeal?: (date: string, mealIndex: number) => void;
}

interface Row {
  mealIndex: number;
  mealTime: string | null;
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
  onCopyMeal,
}: Props) {
  const { t, i18n } = useTranslation('planning');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;

  const weekStartDate = parseISO(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => {
    const iso = formatDate(addDays(weekStartDate, i), 'yyyy-MM-dd', locale);
    return { date: iso, isToday: iso === todayIso, isPast: iso < todayIso };
  });

  // Row model: one row per configured meal time, then orphan rows (slots whose
  // meal_index is beyond the configured times — divergent weeks), built from the
  // union of (meal_index, meal_time) across the week so the matrix stays aligned.
  const rows: Row[] = mealTimes.map((time, i) => ({ mealIndex: i, mealTime: time }));
  const orphans = new Map<string, Row>();
  for (const s of slots) {
    if (s.meal_index < mealTimes.length) continue;
    const key = `${s.meal_index}|${s.meal_time ?? ''}`;
    if (!orphans.has(key)) orphans.set(key, { mealIndex: s.meal_index, mealTime: s.meal_time });
  }
  const orphanRows = Array.from(orphans.values()).sort(
    (a, b) => a.mealIndex - b.mealIndex || (a.mealTime ?? '').localeCompare(b.mealTime ?? ''),
  );
  const allRows = [...rows, ...orphanRows];

  const dayTotals = aggregateDayMacros(slots.map((s) => ({ key: s.date, macros: s.macros })));

  function entriesFor(date: string, row: Row): SlotEntry[] {
    return slots
      .filter(
        (s) =>
          s.date === date &&
          s.meal_index === row.mealIndex &&
          (s.meal_time ?? '') === (row.mealTime ?? ''),
      )
      .sort((a, b) => a.display_order - b.display_order)
      .map(toEntry);
  }

  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <div
        className="grid gap-2 min-w-max"
        style={{ gridTemplateColumns: `64px repeat(7, minmax(170px, 1fr))` }}
      >
        {/* Header row */}
        <div />
        {days.map((day) => {
          const date = parseISO(day.date);
          return (
            <div
              key={`h-${day.date}`}
              className={cn(
                'flex items-baseline justify-between gap-2 pb-1 border-b',
                day.isToday && 'border-b-2 border-primary',
                day.isPast && 'opacity-60',
              )}
            >
              <span
                className={cn(
                  'text-xs font-semibold uppercase tracking-wide',
                  day.isToday && 'text-primary',
                )}
              >
                {formatDate(date, 'EEE', locale)}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatDate(date, 'd MMM', locale)}
              </span>
            </div>
          );
        })}

        {/* TOTAL row */}
        <div className="text-xs text-muted-foreground self-start pt-2 pr-2 text-right font-semibold uppercase tracking-wide">
          {t('summary.totalRow')}
        </div>
        {days.map((day) => (
          <div
            key={`t-${day.date}`}
            className={cn(
              'rounded-md border bg-card p-2',
              day.isToday && 'ring-1 ring-primary',
              day.isPast && 'opacity-60',
            )}
          >
            <DaySummary
              totals={dayTotals.get(day.date) ?? ZERO_MACROS}
              targets={targets}
              phaseType={phaseType}
            />
          </div>
        ))}

        {/* Meal rows */}
        {allRows.map((row) => (
          <Fragment key={`row-${row.mealIndex}-${row.mealTime ?? ''}`}>
            <div className="text-xs text-muted-foreground tabular-nums self-center pr-2 text-right">
              {row.mealTime ? row.mealTime.slice(0, 5) : ''}
            </div>
            {days.map((day) => (
              <SlotCell
                key={`${day.date}-${row.mealIndex}-${row.mealTime ?? ''}`}
                entries={entriesFor(day.date, row)}
                busy={busy}
                className={cn(day.isToday && 'ring-1 ring-primary', day.isPast && 'opacity-60')}
                onAdd={(recipeId, recipeName, servings) =>
                  onAdd(day.date, row.mealIndex, row.mealTime, { id: recipeId, name: recipeName }, servings)
                }
                onUpdate={(slotId, recipeId, recipeName, servings) =>
                  onUpdate(slotId, { id: recipeId, name: recipeName }, servings)
                }
                onRemove={(slotId) => onRemove(slotId)}
                onCopy={onCopyMeal ? () => onCopyMeal(day.date, row.mealIndex) : undefined}
                copyLabel={t('slot.copy')}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/features/planning/components/WeekGrid.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/planning/components/WeekGrid.tsx src/features/planning/components/WeekGrid.test.tsx
git commit -m "feat(planner): align the week grid into a meal-time × day matrix"
```

---

## Task 3: Full verification

**Files:** none.

- [ ] **Step 1: Run the full gate**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all PASS (0 lint errors). Fix any failure before continuing.

- [ ] **Step 2: Eyeball the planner + template in the dev preview**

The change is visual. After the branch deploys its Vercel preview (on PR), confirm in the planner: meal-time rows align across days, the TOTAL row sits on top, today's column shows the indigo header + ring, past days are dimmed, and a divergent week's orphan meal still appears. In the template editor, confirm the meal-time ✕ is a small solid-red button.

- [ ] **Step 3: Push and open the PR into `develop`**

```bash
git push -u origin claude/planner-matrix-mealtime-x
gh pr create --base develop --title "feat(planner): aligned meal matrix + red meal-time remove button" --body "Implements docs/superpowers/specs/2026-05-24-planner-matrix-and-mealtime-x-design.md. WeekGrid becomes the template's aligned meal-time × day matrix (today/past styling, orphan rows); MealTimesEditor's remove ✕ becomes a solid-red 24px button. Presentational only."
```

Expected: CI green, then squash-merge per the ship flow (don't `--auto` while still pushing — memory *develop CI gate*).

---

## Notes for the implementer

- **Work in the worktree** `D:\dev\hf-planner-matrix` (branch `claude/planner-matrix-mealtime-x`).
- **`Fragment` import** is required (keyed fragments around each meal row); `WeekGrid`'s props are unchanged so `PlanificadorPage` needs no edits.
- **Today/past** is per-cell (`ring-1 ring-primary` on today's cells, `opacity-60` on past) — no day-card wrapper anymore.
- **Tier-2 tests** must keep the `vi.mock('@/features/recipes/hooks', …)` stub or CI fails on the missing Supabase env (memory *component test supabase env*).
- After `develop` merges, promote to `main` via a `release/*`→`main` merge-commit PR (same as the U-6 release), pending user approval.
