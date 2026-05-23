# U-5 — Planner day totals vs. target — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each day's macro totals vs. the user's daily target — with phase-aware over/under colours — in the weekly planner and the template editor, and apply the same bar/colour treatment to the Diario `DayTotalsCard`.

**Architecture:** A single pure status module (`src/lib/macroStatus.ts`, relocated + extended from `diario/targetStatus.ts`) classifies each macro into a tone + an overflow descriptor. A pure `<MacroBar>` primitive renders the fill + overflow segment + ticks. A pure `aggregateDayMacros` helper sums per-slot macros into per-day totals. A shared `<DaySummary>` composes the kcal line + macro rows and is wired into `WeekGrid` (per-day card), `TemplateGrid` (a "Total" row), and re-used by `DayTotalsCard`. Macros reach the planner by extending the active-week fetch with ingredient per-unit fields; the template editor fetches per-serving macros for its recipe ids. Display-only — no SQL macro math, no edge/parity changes.

**Tech Stack:** React 18 + TS, Vite, TanStack Query, react-i18next, Tailwind, Vitest + Testing Library. Macro arithmetic from `@/core/macros`. Targets from `computePhaseTargets`.

**Spec:** `docs/superpowers/specs/2026-05-23-planner-day-targets-design.md`

---

## File Structure

- **Create** `src/lib/macroStatus.ts` — pure tone classifier (moved from `diario/targetStatus.ts`, extended: kcal phase bands, fat floor, fiber-informational, overflow descriptor, kcal margin constants, `essentialFatFloorG`).
- **Create** `src/lib/macroStatus.test.ts` — table-driven tests.
- **Create** `src/components/ui/MacroBar.tsx` — pure bar primitive (fill + overflow segment + target/min ticks + colour maps).
- **Create** `src/components/ui/MacroBar.test.tsx`.
- **Create** `src/features/planning/daySummary.ts` — `aggregateDayMacros` pure helper.
- **Create** `src/features/planning/daySummary.test.ts`.
- **Create** `src/features/planning/components/DaySummary.tsx` — shared kcal+macros block (uses macroStatus + MacroBar).
- **Create** `src/features/planning/components/DaySummary.test.tsx`.
- **Create** `src/features/planning/useDailyTarget.ts` — hook returning the user's current daily `Macros` target + `phaseType` + `proteinBasis` (extracted from `DiarioPage`'s inline wiring, so planner/template/diario share it).
- **Modify** `src/features/planner/api.ts` — extend `fetchActiveWeek` select with ingredient per-unit fields; attach `macros: Macros` to each `WeekSlotWithRecipe`.
- **Modify** `src/features/planning/components/WeekGrid.tsx` — render `<DaySummary>` at the top of each day card; accept `targets`/`phaseType`.
- **Modify** `src/pages/PlanificadorPage.tsx` — pass the daily target into `WeekGrid`.
- **Create** `src/features/templates/recipeMacros.ts` + hook in `src/features/templates/hooks.ts` — `fetchRecipeMacrosByIds(ids) → Map<id, Macros>` (per-serving) for the editor.
- **Modify** `src/features/planning/components/TemplateGrid.tsx` — render a "Total" summary row; accept per-recipe macros + targets.
- **Modify** `src/pages/PlantillaEditorPage.tsx` — fetch recipe macros for the template's recipe ids; pass target + macros into `TemplateGrid`.
- **Modify** `src/features/diario/components/DayTotalsCard.tsx` + `DayTotalsCard.test.tsx` — consume `macroStatus` + `<MacroBar>` (replaces inline `classifyMacro` import, `BAR_TONE`, bar markup).
- **Delete** `src/features/diario/targetStatus.ts` + `targetStatus.test.ts` (moved to `lib/`).
- **Modify** `src/i18n/es/planning.json`, `src/i18n/en/planning.json` — new `summary.*` keys.
- **Modify** `src/i18n/es/diario.json`, `src/i18n/en/diario.json` — remove `totals.fiberBelowMin` usage (fiber no longer warns).

---

## Task 1: Relocate `targetStatus.ts` → `lib/macroStatus.ts` (pure move, no behaviour change)

**Files:**
- Create: `src/lib/macroStatus.ts` (move content of `src/features/diario/targetStatus.ts` verbatim)
- Create: `src/lib/macroStatus.test.ts` (move content of `src/features/diario/targetStatus.test.ts` verbatim; update import path)
- Modify: `src/features/diario/components/DayTotalsCard.tsx:7-12` (import from `@/lib/macroStatus`)
- Delete: `src/features/diario/targetStatus.ts`, `src/features/diario/targetStatus.test.ts`

- [ ] **Step 1: Copy the file unchanged**

Copy `src/features/diario/targetStatus.ts` to `src/lib/macroStatus.ts` byte-for-byte. Copy `src/features/diario/targetStatus.test.ts` to `src/lib/macroStatus.test.ts`, changing only the import:

```ts
import { classifyMacro, KCAL_MAINTENANCE_BAND_PCT } from './macroStatus';
```

- [ ] **Step 2: Repoint the one consumer**

In `DayTotalsCard.tsx`, change:

```ts
import { classifyMacro, type MacroKey, type MacroTone, type PhaseType } from '../targetStatus';
```
to:
```ts
import { classifyMacro, type MacroKey, type MacroTone, type PhaseType } from '@/lib/macroStatus';
```

- [ ] **Step 3: Delete the originals**

```bash
git rm src/features/diario/targetStatus.ts src/features/diario/targetStatus.test.ts
```

- [ ] **Step 4: Verify nothing else imports the old path**

Run: `rg "features/diario/targetStatus|from '\.\./targetStatus'" src`
Expected: no matches.

- [ ] **Step 5: Run typecheck + tests**

Run: `pnpm typecheck && pnpm test -- macroStatus DayTotalsCard`
Expected: PASS (pure move; behaviour identical).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: relocate targetStatus → lib/macroStatus (shared by planner + diario)"
```

---

## Task 2: Add kcal margin constants + `essentialFatFloorG`

**Files:**
- Modify: `src/lib/macroStatus.ts`
- Modify: `src/lib/macroStatus.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/macroStatus.test.ts`:

```ts
import { essentialFatFloorG, ESSENTIAL_FAT_PCT_OF_KCAL } from './macroStatus';

describe('essentialFatFloorG', () => {
  it('is 20% of target kcal converted to grams (9 kcal/g), rounded', () => {
    expect(ESSENTIAL_FAT_PCT_OF_KCAL).toBe(20);
    // 2000 kcal → 400 kcal from fat → 44.4 g → 44
    expect(essentialFatFloorG(2000)).toBe(44);
    // 3000 kcal → 600 → 66.7 → 67
    expect(essentialFatFloorG(3000)).toBe(67);
  });
  it('is 0 for a non-positive target', () => {
    expect(essentialFatFloorG(0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- macroStatus`
Expected: FAIL ("essentialFatFloorG is not a function").

- [ ] **Step 3: Implement**

Add to `src/lib/macroStatus.ts` (near the existing `KCAL_MAINTENANCE_BAND_PCT`):

```ts
/** Absolute kcal margins (named so they're trivially tunable). */
export const KCAL_CUT_GREEN_MARGIN = 50 as const;
export const KCAL_CUT_AMBER_MARGIN = 100 as const;
export const KCAL_BULK_GREEN_UNDER_MARGIN = 50 as const;
export const KCAL_BULK_SURPLUS_HIGH_MARGIN = 200 as const;

/** Essential-fat floor as a percent of target energy (U-5). */
export const ESSENTIAL_FAT_PCT_OF_KCAL = 20 as const;

/** Essential-fat minimum in grams, derived from target kcal (9 kcal/g). */
export function essentialFatFloorG(targetKcal: number): number {
  if (!Number.isFinite(targetKcal) || targetKcal <= 0) return 0;
  return Math.round((ESSENTIAL_FAT_PCT_OF_KCAL / 100) * targetKcal / 9);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- macroStatus`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/macroStatus.ts src/lib/macroStatus.test.ts
git commit -m "feat(macroStatus): kcal margin constants + essentialFatFloorG (20%E)"
```

---

## Task 3: Extend the tone model (new `MacroTone`, `ExcessKind`, richer `MacroStatus`)

**Files:**
- Modify: `src/lib/macroStatus.ts`
- Modify: `src/lib/macroStatus.test.ts`

This rewrites `classifyMacro`'s body to the U-5 model. The signature gains an options arg for the fat floor.

- [ ] **Step 1: Write the failing tests**

Replace the existing `describe('classifyMacro' …)` blocks in `src/lib/macroStatus.test.ts` with the U-5 table tests:

```ts
import { classifyMacro } from './macroStatus';

const F = (consumed: number, target: number, phase: 'cut'|'maintenance'|'bulk', floor?: number) =>
  classifyMacro('kcal', consumed, target, phase, { essentialFatFloorG: floor });

describe('classifyMacro — kcal cut bands (target 2000)', () => {
  it('< -50 under → budget (blue), no excess', () => {
    const s = F(1850, 2000, 'cut');
    expect(s.tone).toBe('budget'); expect(s.excess).toBeNull();
  });
  it('within ±50 → onTarget (green)', () => {
    expect(F(1960, 2000, 'cut').tone).toBe('onTarget'); // -40
    expect(F(2040, 2000, 'cut').tone).toBe('onTarget'); // +40
  });
  it('+50..+100 → slightOver (amber) with tolerance excess', () => {
    const s = F(2080, 2000, 'cut');
    expect(s.tone).toBe('slightOver'); expect(s.excess).toBe('tolerance'); expect(s.overG).toBe(80);
  });
  it('> +100 → over (red) with bad excess', () => {
    const s = F(2150, 2000, 'cut');
    expect(s.tone).toBe('over'); expect(s.excess).toBe('bad'); expect(s.overG).toBe(150);
  });
});

describe('classifyMacro — kcal bulk bands (target 3000)', () => {
  it('< -50 → over (red), under (no excess)', () => {
    const s = F(2600, 3000, 'bulk');
    expect(s.tone).toBe('over'); expect(s.excess).toBeNull();
  });
  it('-50..+200 → onTarget (green); over within band shows no dark excess', () => {
    expect(F(2970, 3000, 'bulk').tone).toBe('onTarget'); // -30
    const over = F(3100, 3000, 'bulk');                  // +100
    expect(over.tone).toBe('onTarget'); expect(over.excess).toBeNull();
  });
  it('> +200 → surplusHigh (amber) with tolerance excess', () => {
    const s = F(3350, 3000, 'bulk');
    expect(s.tone).toBe('surplusHigh'); expect(s.excess).toBe('tolerance');
  });
});

describe('classifyMacro — kcal maintenance (target 2200, ±5% ≈ ±110)', () => {
  it('within band → onTarget', () => { expect(F(2150, 2200, 'maintenance').tone).toBe('onTarget'); });
  it('under band → budget', () => { expect(F(2000, 2200, 'maintenance').tone).toBe('budget'); });
  it('over band → over with bad excess', () => {
    const s = F(2400, 2200, 'maintenance');
    expect(s.tone).toBe('over'); expect(s.excess).toBe('bad');
  });
});

describe('classifyMacro — protein floor (target 150)', () => {
  it('under → neutral (grey), no warning', () => {
    expect(classifyMacro('proteinG', 120, 150, 'cut').tone).toBe('neutral');
  });
  it('met → floorMet (green)', () => {
    expect(classifyMacro('proteinG', 150, 150, 'cut').tone).toBe('floorMet');
  });
  it('over → floorMet with good excess (dark green)', () => {
    const s = classifyMacro('proteinG', 158, 150, 'cut');
    expect(s.tone).toBe('floorMet'); expect(s.excess).toBe('good'); expect(s.overG).toBe(8);
  });
});

describe('classifyMacro — fiber is informational (target 30)', () => {
  it('under → neutral (grey), NOT amber, no warning', () => {
    expect(classifyMacro('fiberG', 12, 30, 'cut').tone).toBe('neutral');
  });
  it('over → floorMet with good excess', () => {
    expect(classifyMacro('fiberG', 35, 30, 'cut').excess).toBe('good');
  });
});

describe('classifyMacro — carbs informational (target 200)', () => {
  it('under/at → neutral, no excess', () => {
    expect(classifyMacro('carbsG', 180, 200, 'cut').tone).toBe('neutral');
  });
  it('over → neutral with bad excess (dark red)', () => {
    const s = classifyMacro('carbsG', 240, 200, 'cut');
    expect(s.tone).toBe('neutral'); expect(s.excess).toBe('bad');
  });
});

describe('classifyMacro — fat floor (target 65, essential floor 44)', () => {
  it('below floor → fatLow (red) with minFloorG set', () => {
    const s = classifyMacro('fatG', 30, 65, 'cut', { essentialFatFloorG: 44 });
    expect(s.tone).toBe('fatLow'); expect(s.minFloorG).toBe(44); expect(s.excess).toBeNull();
  });
  it('between floor and target → neutral', () => {
    expect(classifyMacro('fatG', 55, 65, 'cut', { essentialFatFloorG: 44 }).tone).toBe('neutral');
  });
  it('over target → neutral with bad excess', () => {
    expect(classifyMacro('fatG', 78, 65, 'cut', { essentialFatFloorG: 44 }).excess).toBe('bad');
  });
});

describe('classifyMacro — no target → neutral flat', () => {
  it('returns neutral with zeros', () => {
    const s = classifyMacro('kcal', 100, 0, 'cut');
    expect(s.tone).toBe('neutral'); expect(s.fillPct).toBe(0); expect(s.excess).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- macroStatus`
Expected: FAIL (tones `onTarget`/`neutral`/`fatLow`/`excess`/`overG` don't exist yet).

- [ ] **Step 3: Rewrite the types + classifier**

Replace the type block and `classifyMacro` in `src/lib/macroStatus.ts` with:

```ts
export type MacroKey = 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG';
export type PhaseType = 'cut' | 'maintenance' | 'bulk';

export type MacroTone =
  | 'budget'      // blue  — comfortably in budget (cut under, maintenance under-band)
  | 'onTarget'    // green — kcal within the on-target band
  | 'floorMet'    // green — protein/fiber floor met or exceeded
  | 'slightOver'  // amber — cut kcal +50..+100 tolerance
  | 'surplusHigh' // amber — bulk kcal > +200
  | 'over'        // red   — cut > +100 / maintenance > +5% / bulk under (not there yet)
  | 'fatLow'      // red   — fat below the essential floor
  | 'neutral';    // grey  — informational (carbs; protein/fiber under; fat in [floor,target]; no target)

/** Colour of the over-target segment: good (dark green), bad (dark red), tolerance (dark amber), or none. */
export type ExcessKind = 'good' | 'bad' | 'tolerance' | null;

export interface MacroStatus {
  /** target - consumed; negative when over. */
  remaining: number;
  /** clamp(consumed/target, 0, 1) * 100 — the in-budget fill. */
  fillPct: number;
  /** max(0, consumed - target). */
  overG: number;
  tone: MacroTone;
  excess: ExcessKind;
  /** Fat only: the essential floor in grams, set when fat is low (drives the min tick). */
  minFloorG?: number;
}

export const KCAL_MAINTENANCE_BAND_PCT = 5 as const;

export function classifyMacro(
  key: MacroKey,
  consumed: number,
  target: number | undefined,
  phaseType: PhaseType | undefined,
  opts?: { essentialFatFloorG?: number },
): MacroStatus {
  if (target == null || target <= 0) {
    return { remaining: 0, fillPct: 0, overG: 0, tone: 'neutral', excess: null };
  }
  const remaining = target - consumed;
  const fillPct = Math.max(0, Math.min(consumed / target, 1)) * 100;
  const overG = Math.max(0, consumed - target);

  if (key === 'kcal') {
    const d = consumed - target;
    const pt = phaseType ?? 'cut';
    if (pt === 'bulk') {
      if (d < -KCAL_BULK_GREEN_UNDER_MARGIN) return { remaining, fillPct, overG, tone: 'over', excess: null };
      if (d > KCAL_BULK_SURPLUS_HIGH_MARGIN) return { remaining, fillPct, overG, tone: 'surplusHigh', excess: 'tolerance' };
      return { remaining, fillPct, overG, tone: 'onTarget', excess: null };
    }
    if (pt === 'maintenance') {
      const band = (target * KCAL_MAINTENANCE_BAND_PCT) / 100;
      if (d > band) return { remaining, fillPct, overG, tone: 'over', excess: 'bad' };
      if (d < -band) return { remaining, fillPct, overG, tone: 'budget', excess: null };
      return { remaining, fillPct, overG, tone: 'onTarget', excess: null };
    }
    // cut
    if (d > KCAL_CUT_AMBER_MARGIN) return { remaining, fillPct, overG, tone: 'over', excess: 'bad' };
    if (d > KCAL_CUT_GREEN_MARGIN) return { remaining, fillPct, overG, tone: 'slightOver', excess: 'tolerance' };
    if (d < -KCAL_CUT_GREEN_MARGIN) return { remaining, fillPct, overG, tone: 'budget', excess: null };
    return { remaining, fillPct, overG, tone: 'onTarget', excess: null };
  }

  if (key === 'proteinG' || key === 'fiberG') {
    if (consumed >= target) return { remaining, fillPct, overG, tone: 'floorMet', excess: overG > 0 ? 'good' : null };
    return { remaining, fillPct, overG, tone: 'neutral', excess: null }; // under = informational (no warning)
  }

  if (key === 'fatG') {
    const floor = opts?.essentialFatFloorG ?? 0;
    if (floor > 0 && consumed < floor) {
      return { remaining, fillPct, overG, tone: 'fatLow', excess: null, minFloorG: floor };
    }
    return { remaining, fillPct, overG, tone: 'neutral', excess: overG > 0 ? 'bad' : null };
  }

  // carbsG — informational; over is mildly bad
  return { remaining, fillPct, overG, tone: 'neutral', excess: overG > 0 ? 'bad' : null };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- macroStatus`
Expected: PASS (all bands).

- [ ] **Step 5: Commit**

```bash
git add src/lib/macroStatus.ts src/lib/macroStatus.test.ts
git commit -m "feat(macroStatus): U-5 phase-aware kcal bands, fat floor, fiber-informational, overflow descriptor"
```

> NOTE: `DayTotalsCard` still imports the old `MacroTone` names (`overBudget`, `floorUnderSoft`, …) and will not typecheck after this task. It is fully rewritten in **Task 11** — until then run `pnpm test` scoped (`-- macroStatus MacroBar daySummary DaySummary`). The plan finishes with a green full `pnpm typecheck && pnpm build && pnpm test`.

---

## Task 4: `<MacroBar>` primitive

**Files:**
- Create: `src/components/ui/MacroBar.tsx`
- Create: `src/components/ui/MacroBar.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/ui/MacroBar.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MacroBar } from './MacroBar';

function widths(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-seg]')).map(
    (el) => (el as HTMLElement).style.width,
  );
}

describe('MacroBar', () => {
  it('renders a single base fill when not over', () => {
    const { container } = render(<MacroBar consumed={92} target={100} tone="budget" excess={null} />);
    expect(widths(container)).toEqual(['92%']);
    expect(container.querySelector('[data-tick="target"]')).toBeNull();
  });

  it('renders base-to-tick + excess segment when over, with a target tick', () => {
    // consumed 220 / target 200 → tick at 200/220 = 90.909%
    const { container } = render(<MacroBar consumed={220} target={200} tone="neutral" excess="bad" />);
    const segs = widths(container);
    expect(segs[0]).toMatch(/^90\.9/);
    expect(segs[1]).toMatch(/^9\.0/);
    expect(container.querySelector('[data-tick="target"]')).not.toBeNull();
    expect(container.querySelector('[data-excess="bad"]')).not.toBeNull();
  });

  it('renders a min-floor tick when minFloorG is given (fat low)', () => {
    // floor 44 / target 65 = 67.69%
    const { container } = render(
      <MacroBar consumed={30} target={65} tone="fatLow" excess={null} minFloorG={44} />,
    );
    const tick = container.querySelector('[data-tick="min"]') as HTMLElement | null;
    expect(tick).not.toBeNull();
    expect(tick!.style.left).toMatch(/^67\.6/);
  });

  it('does nothing for a non-positive target', () => {
    const { container } = render(<MacroBar consumed={50} target={0} tone="neutral" excess={null} />);
    expect(widths(container)).toEqual(['0%']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- MacroBar`
Expected: FAIL ("Cannot find module './MacroBar'").

- [ ] **Step 3: Implement**

`src/components/ui/MacroBar.tsx`:

```tsx
import { cn } from '@/lib/utils';
import type { MacroTone, ExcessKind } from '@/lib/macroStatus';

const BASE_TONE: Record<MacroTone, string> = {
  budget: 'bg-sky-600 dark:bg-sky-500',
  onTarget: 'bg-emerald-600 dark:bg-emerald-500',
  floorMet: 'bg-emerald-600 dark:bg-emerald-500',
  slightOver: 'bg-amber-500 dark:bg-amber-400',
  surplusHigh: 'bg-amber-500 dark:bg-amber-400',
  over: 'bg-destructive',
  fatLow: 'bg-destructive',
  neutral: 'bg-muted-foreground/50',
};

const EXCESS_TONE: Record<Exclude<ExcessKind, null>, string> = {
  good: 'bg-emerald-900 dark:bg-emerald-800', // dark green — exceeding a floor is positive
  bad: 'bg-red-900 dark:bg-red-800',          // dark red — over budget / carbs / fat
  tolerance: 'bg-amber-700 dark:bg-amber-600', // dark amber — kcal tolerance / surplus-high
};

interface Props {
  consumed: number;
  target: number;
  tone: MacroTone;
  excess: ExcessKind;
  /** Fat only: essential floor in grams; renders an amber min-tick. */
  minFloorG?: number;
  className?: string;
}

/**
 * Pure macro progress bar. Not over: a single base-tone fill. Over: the bar
 * normalises to `consumed`, the base tone fills up to the target tick, and the
 * over-target segment uses the excess colour (or the base colour when
 * `excess` is null, e.g. an on-target marginal overshoot).
 */
export function MacroBar({ consumed, target, tone, excess, minFloorG, className }: Props) {
  const valid = Number.isFinite(target) && target > 0;
  const over = valid && consumed > target;
  const denom = over ? consumed : target;
  const basePct = valid ? Math.max(0, Math.min(consumed, target)) / denom * 100 : 0;
  const overPct = over ? (consumed - target) / denom * 100 : 0;
  const tickPct = valid ? (target / denom) * 100 : 100;
  const minPct = valid && minFloorG ? (minFloorG / denom) * 100 : null;

  return (
    <div className={cn('relative h-1.5 rounded-full bg-muted overflow-hidden flex', className)}>
      <span data-seg className={cn('h-full', BASE_TONE[tone])} style={{ width: `${basePct}%` }} />
      {over && (
        <span
          data-seg
          data-excess={excess ?? undefined}
          className={cn('h-full', excess ? EXCESS_TONE[excess] : BASE_TONE[tone])}
          style={{ width: `${overPct}%` }}
        />
      )}
      {over && (
        <span data-tick="target" className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-foreground/80" style={{ left: `${tickPct}%` }} />
      )}
      {minPct != null && (
        <span data-tick="min" className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-amber-500" style={{ left: `${minPct}%` }} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- MacroBar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/MacroBar.tsx src/components/ui/MacroBar.test.tsx
git commit -m "feat(ui): MacroBar primitive (fill + overflow segment + target/min ticks)"
```

---

## Task 5: `aggregateDayMacros` pure helper

**Files:**
- Create: `src/features/planning/daySummary.ts`
- Create: `src/features/planning/daySummary.test.ts`

The helper takes a flat list of `{ groupKey, macros }` and sums macros per group key. `groupKey` is the day (planner: ISO date; template: `day_of_week`). It is generic so both surfaces reuse it.

- [ ] **Step 1: Write the failing test**

`src/features/planning/daySummary.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { aggregateDayMacros } from './daySummary';
import { ZERO_MACROS, type Macros } from '@/core/macros';

const m = (kcal: number, p = 0, c = 0, f = 0, fib = 0): Macros => ({
  kcal, proteinG: p, carbsG: c, fatG: f, fiberG: fib,
});

describe('aggregateDayMacros', () => {
  it('sums macros per group key', () => {
    const out = aggregateDayMacros([
      { key: 'Mon', macros: m(300, 20) },
      { key: 'Mon', macros: m(200, 10) },
      { key: 'Tue', macros: m(500, 40) },
    ]);
    expect(out.get('Mon')).toEqual(m(500, 30));
    expect(out.get('Tue')).toEqual(m(500, 40));
  });

  it('returns an empty map for no items', () => {
    expect(aggregateDayMacros([]).size).toBe(0);
  });

  it('a key with one zero item totals ZERO_MACROS', () => {
    expect(aggregateDayMacros([{ key: 'X', macros: ZERO_MACROS }]).get('X')).toEqual(ZERO_MACROS);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- daySummary`
Expected: FAIL ("Cannot find module './daySummary'").

- [ ] **Step 3: Implement**

`src/features/planning/daySummary.ts`:

```ts
import { add, ZERO_MACROS, type Macros } from '@/core/macros';

export interface DayMacroItem {
  key: string;
  macros: Macros;
}

/** Field-wise sum of each item's macros, grouped by `key`. */
export function aggregateDayMacros(items: DayMacroItem[]): Map<string, Macros> {
  const out = new Map<string, Macros>();
  for (const { key, macros } of items) {
    out.set(key, add(out.get(key) ?? ZERO_MACROS, macros));
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- daySummary`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/planning/daySummary.ts src/features/planning/daySummary.test.ts
git commit -m "feat(planning): aggregateDayMacros pure helper"
```

---

## Task 6: Extend `fetchActiveWeek` with ingredient macro data → per-slot `macros`

**Files:**
- Modify: `src/features/planner/api.ts`

The active-week fetch currently selects only `recipe (id, name)`. Add the recipe's ingredients with per-unit macro fields, compute each slot's macros (`recipePerServingMacros(recipe) × slot.servings`) in the mapping, and attach `macros: Macros` to `WeekSlotWithRecipe`.

- [ ] **Step 1: Extend the type + select + mapping**

In `src/features/planner/api.ts`:

1. Add the import:
```ts
import { computeRecipeMacros, type Macros } from '@/features/recipes/macros';
```

2. Add `macros` to the interface:
```ts
export interface WeekSlotWithRecipe {
  id: string;
  date: string;
  meal_index: number;
  meal_time: string | null;
  recipe_id: string;
  recipe_name: string;
  servings: number;
  display_order: number;
  macros: Macros; // U-5: per-slot macros (recipe per-serving × servings)
}
```

3. Extend the `select` in `fetchActiveWeek` so the recipe carries its ingredients:
```ts
       meal_plan_week_slots (
         id, date, meal_index, meal_time, recipe_id, servings, display_order,
         recipe:recipes (
           id, name, servings,
           recipe_ingredients (
             quantity, per_serving,
             ingredient:ingredients (
               unit_type, kcal_per_unit, protein_g_per_unit,
               carbs_g_per_unit, fat_g_per_unit, fiber_g_per_unit
             )
           )
         )
       )
```

4. In the `RawSlot` interface add the nested recipe-with-ingredients shape, and in the `.map((s) => …)` body compute macros:
```ts
        const recipe = Array.isArray(s.recipe) ? s.recipe[0] : s.recipe;
        const recipeServings = Number(recipe?.servings) > 0 ? Number(recipe?.servings) : 1;
        const rows = (recipe?.recipe_ingredients ?? []).map((ri) => {
          const ing = Array.isArray(ri.ingredient) ? ri.ingredient[0] : ri.ingredient;
          return {
            quantity: Number(ri.quantity),
            perServing: ri.per_serving,
            ingredient: {
              unit_type: ing?.unit_type ?? 'g',
              kcal_per_unit: Number(ing?.kcal_per_unit ?? 0),
              protein_g_per_unit: Number(ing?.protein_g_per_unit ?? 0),
              carbs_g_per_unit: Number(ing?.carbs_g_per_unit ?? 0),
              fat_g_per_unit: Number(ing?.fat_g_per_unit ?? 0),
              fiber_g_per_unit: Number(ing?.fiber_g_per_unit ?? 0),
            },
          };
        });
        const perServing = computeRecipeMacros({ servings: recipeServings, rows }).perServing;
        const slotServings = Number(s.servings);
        const macros = {
          kcal: perServing.kcal * slotServings,
          proteinG: perServing.proteinG * slotServings,
          carbsG: perServing.carbsG * slotServings,
          fatG: perServing.fatG * slotServings,
          fiberG: perServing.fiberG * slotServings,
        };
        return {
          id: s.id, date: s.date, meal_index: s.meal_index, meal_time: s.meal_time,
          recipe_id: s.recipe_id, recipe_name: recipe?.name ?? '?',
          servings: slotServings, display_order: s.display_order, macros,
        };
```

(Update the `RawSlot.recipe` type to include `servings` + `recipe_ingredients`. Mirror the shapes already declared in `fetchWeekShopping` in the same file.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (note: `DayTotalsCard` is still mid-migration from Task 3 — if its error surfaces, it is fixed in Task 11; scope with `pnpm exec tsc --noEmit` is acceptable to keep going, but the final gate is a clean typecheck after Task 11).

- [ ] **Step 3: Commit**

```bash
git add src/features/planner/api.ts
git commit -m "feat(planner): carry per-slot macros on the active-week fetch"
```

---

## Task 7: `useDailyTarget` hook (shared target wiring)

**Files:**
- Create: `src/features/planning/useDailyTarget.ts`

Extract the target computation that `DiarioPage` does inline (active phase + latest measurement + latest TDEE → `computePhaseTargets`) into one hook so planner + template + diario share it.

- [ ] **Step 1: Implement (thin composition of existing hooks — no new logic)**

`src/features/planning/useDailyTarget.ts`:

```ts
import { useMemo } from 'react';
import { useActivePhase } from '@/features/phases/hooks';
import { useLatestMeasurement } from '@/features/measurements/hooks';
import { useLatestTdee } from '@/features/tdee/hooks';
import { computePhaseTargets } from '@/features/phases/targets';
import type { Macros } from '@/features/recipes/macros';
import type { PhaseType } from '@/lib/macroStatus';
import type { ProteinBasis } from '@/features/diario/components/DayTotalsCard';

export interface DailyTarget {
  targets?: Macros;
  phaseType?: PhaseType;
  proteinBasis: ProteinBasis;
}

/** The user's current daily macro target (phase + latest weight), shared by
 *  the planner, template editor, and diario. Mirrors DiarioPage's wiring. */
export function useDailyTarget(): DailyTarget {
  const activePhase = useActivePhase();
  const latestMeasurement = useLatestMeasurement();
  const latestTdee = useLatestTdee();

  const targets = useMemo(() => {
    if (!activePhase.data || !latestMeasurement.data?.weight_kg) return undefined;
    return (
      computePhaseTargets(
        activePhase.data,
        latestMeasurement.data.weight_kg,
        latestMeasurement.data.body_fat_pct,
        latestTdee.data?.estimated_tdee_kcal ?? null,
      ) ?? undefined
    );
  }, [activePhase.data, latestMeasurement.data, latestTdee.data]);

  return {
    targets,
    phaseType: activePhase.data?.phase_type as PhaseType | undefined,
    proteinBasis: latestMeasurement.data?.body_fat_pct != null ? 'lean' : 'fallback',
  };
}
```

> Verify the exact hook names/paths against `DiarioPage.tsx` imports (`useActivePhase`, the latest-measurement hook, the latest-TDEE hook) and match them — DiarioPage is the source of truth for these.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck` (scoped acceptable until Task 11).

- [ ] **Step 3: Commit**

```bash
git add src/features/planning/useDailyTarget.ts
git commit -m "feat(planning): useDailyTarget hook (shared phase target wiring)"
```

---

## Task 8: `<DaySummary>` component

**Files:**
- Create: `src/features/planning/components/DaySummary.tsx`
- Create: `src/features/planning/components/DaySummary.test.tsx`

Renders the kcal line + 4 macro rows (Prot/Carbs/Grasa/Fibra) using `classifyMacro` + `<MacroBar>`. Shows the "Falta grasa" aviso + `?` only when fat is low; passes `minFloorG` to the fat bar then. When `targets` is undefined, renders plain totals (bars with `neutral` tone, no avisos).

- [ ] **Step 1: Write the failing test**

`src/features/planning/components/DaySummary.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DaySummary } from './DaySummary';
import type { Macros } from '@/core/macros';

const target: Macros = { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 65, fiberG: 30 };

describe('DaySummary', () => {
  it('shows the Falta grasa aviso + help only when fat is below the essential floor', () => {
    const totals: Macros = { kcal: 1850, proteinG: 120, carbsG: 180, fatG: 30, fiberG: 12 };
    render(<DaySummary totals={totals} targets={target} phaseType="cut" />);
    expect(screen.getByText(/falta grasa/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /grasa.*ayuda|ayuda|info/i })).toBeInTheDocument();
  });

  it('shows NO aviso when fat is adequate', () => {
    const totals: Macros = { kcal: 1990, proteinG: 152, carbsG: 195, fatG: 63, fiberG: 31 };
    render(<DaySummary totals={totals} targets={target} phaseType="cut" />);
    expect(screen.queryByText(/falta grasa/i)).not.toBeInTheDocument();
  });

  it('renders kcal as "value / target Kcal" with the unit after the number', () => {
    const totals: Macros = { kcal: 1850, proteinG: 0, carbsG: 0, fatG: 50, fiberG: 0 };
    render(<DaySummary totals={totals} targets={target} phaseType="cut" />);
    expect(screen.getByText(/1\s?850/)).toBeInTheDocument();
    expect(screen.getByText(/Kcal/i)).toBeInTheDocument();
  });

  it('renders without targets (plain totals, no aviso)', () => {
    const totals: Macros = { kcal: 1200, proteinG: 60, carbsG: 100, fatG: 30, fiberG: 10 };
    render(<DaySummary totals={totals} phaseType={undefined} />);
    expect(screen.queryByText(/falta grasa/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- DaySummary`
Expected: FAIL ("Cannot find module './DaySummary'").

- [ ] **Step 3: Implement**

`src/features/planning/components/DaySummary.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { roundMacro, type Macros } from '@/features/recipes/macros';
import { MacroBar } from '@/components/ui/MacroBar';
import {
  classifyMacro,
  essentialFatFloorG,
  type MacroKey,
  type MacroTone,
  type PhaseType,
} from '@/lib/macroStatus';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const TEXT_TONE: Record<MacroTone, string> = {
  budget: 'text-sky-600 dark:text-sky-400',
  onTarget: 'text-emerald-600 dark:text-emerald-400',
  floorMet: 'text-emerald-600 dark:text-emerald-400',
  slightOver: 'text-amber-600 dark:text-amber-400',
  surplusHigh: 'text-amber-600 dark:text-amber-400',
  over: 'text-destructive',
  fatLow: 'text-destructive',
  neutral: 'text-muted-foreground',
};

interface Props {
  totals: Macros;
  targets?: Macros;
  phaseType?: PhaseType;
  className?: string;
}

export function DaySummary({ totals, targets, phaseType, className }: Props) {
  const { t } = useTranslation('planning');
  const fatFloor = targets ? essentialFatFloorG(targets.kcal) : 0;

  const kcal = classifyMacro('kcal', totals.kcal, targets?.kcal, phaseType);
  const macroRows: { key: MacroKey; label: string; consumed: number; target?: number }[] = [
    { key: 'proteinG', label: t('summary.protein'), consumed: totals.proteinG, target: targets?.proteinG },
    { key: 'carbsG', label: t('summary.carbs'), consumed: totals.carbsG, target: targets?.carbsG },
    { key: 'fatG', label: t('summary.fat'), consumed: totals.fatG, target: targets?.fatG },
    { key: 'fiberG', label: t('summary.fiber'), consumed: totals.fiberG, target: targets?.fiberG },
  ];

  return (
    <div className={cn('space-y-2', className)}>
      {/* kcal line: number + unit after */}
      <div className="space-y-1">
        <div className={cn('text-sm font-bold tabular-nums leading-tight', TEXT_TONE[kcal.tone])}>
          {roundMacro(totals.kcal)}
          {targets && <span className="text-muted-foreground font-normal"> / {roundMacro(targets.kcal)}</span>}
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-normal ml-1">
            {t('summary.kcalUnit')}
          </span>
        </div>
        {targets && (
          <MacroBar consumed={totals.kcal} target={targets.kcal} tone={kcal.tone} excess={kcal.excess} />
        )}
      </div>

      {macroRows.map((r) => {
        const s = classifyMacro(r.key, r.consumed, r.target, phaseType, { essentialFatFloorG: fatFloor });
        return (
          <div key={r.key} className="space-y-0.5">
            <div className="flex justify-between items-baseline text-[10px] uppercase tracking-wide text-muted-foreground">
              <span>{r.label}</span>
              <span className={cn('tabular-nums', s.tone === 'fatLow' && 'text-destructive', s.tone === 'floorMet' && 'text-emerald-600 dark:text-emerald-400')}>
                {roundMacro(r.consumed)}{r.target != null && <> / {roundMacro(r.target)}</>}
              </span>
            </div>
            {r.target != null && (
              <MacroBar consumed={r.consumed} target={r.target} tone={s.tone} excess={s.excess} minFloorG={s.minFloorG} />
            )}
            {s.tone === 'fatLow' && (
              <div className="flex items-center gap-1 text-[10px] font-semibold text-destructive">
                <span>{t('summary.fatLow')}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label={t('summary.fatLowHelpLabel')} className="opacity-80">
                      <HelpCircle className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[200px] text-xs">{t('summary.fatLowHelp')}</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

> Verify the tooltip component path/exports against the project's UI kit (`src/components/ui/tooltip`). If the project has no tooltip primitive, fall back to a native `title` attribute on the `<button>` and drop the `Tooltip*` import — the aviso text itself is the primary signal.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- DaySummary`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/planning/components/DaySummary.tsx src/features/planning/components/DaySummary.test.tsx
git commit -m "feat(planning): DaySummary block (kcal line + macro rows + fat-low aviso)"
```

---

## Task 9: Wire `<DaySummary>` into the planner (`WeekGrid` + `PlanificadorPage`)

**Files:**
- Modify: `src/features/planning/components/WeekGrid.tsx`
- Modify: `src/pages/PlanificadorPage.tsx`

- [ ] **Step 1: Accept targets + per-day totals in `WeekGrid`**

In `WeekGrid.tsx`:
1. Imports:
```ts
import { DaySummary } from './DaySummary';
import { aggregateDayMacros } from '@/features/planning/daySummary';
import type { Macros } from '@/features/recipes/macros';
import type { PhaseType } from '@/lib/macroStatus';
```
2. Add to `Props`:
```ts
  targets?: Macros;
  phaseType?: PhaseType;
```
3. Build per-day totals once (from the slot `macros` added in Task 6):
```ts
  const dayTotals = aggregateDayMacros(slots.map((s) => ({ key: s.date, macros: s.macros })));
```
4. Inside each day card, immediately after the header `<div className="flex items-baseline …">…</div>`, insert:
```tsx
              <DaySummary
                totals={dayTotals.get(day.date) ?? ZERO_MACROS}
                targets={targets}
                phaseType={phaseType}
                className="pb-2 border-b"
              />
```
(import `ZERO_MACROS` from `@/features/recipes/macros`.)

- [ ] **Step 2: Pass the target from the page**

In `PlanificadorPage.tsx`:
1. Import + call the hook:
```ts
import { useDailyTarget } from '@/features/planning/useDailyTarget';
```
```ts
  const { targets, phaseType } = useDailyTarget();
```
2. Add the two props to the `<WeekGrid … />` usage:
```tsx
            targets={targets}
            phaseType={phaseType}
```

- [ ] **Step 3: Typecheck + run planning tests**

Run: `pnpm typecheck` (scoped until Task 11) `&& pnpm test -- WeekGrid DaySummary`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/planning/components/WeekGrid.tsx src/pages/PlanificadorPage.tsx
git commit -m "feat(planner): per-day totals vs target at the top of each day card"
```

---

## Task 10: Wire the template editor (`fetchRecipeMacrosByIds` + `TemplateGrid` total row)

**Files:**
- Create: `src/features/templates/recipeMacros.ts`
- Modify: `src/features/templates/hooks.ts`
- Modify: `src/features/planning/components/TemplateGrid.tsx`
- Modify: `src/pages/PlantillaEditorPage.tsx`

- [ ] **Step 1: Fetch per-serving macros for a set of recipe ids**

`src/features/templates/recipeMacros.ts`:

```ts
import { supabase } from '@/lib/supabase';
import { computeRecipeMacros, type Macros } from '@/features/recipes/macros';

/** Per-serving macros for each recipe id, computed from its ingredients. */
export async function fetchRecipeMacrosByIds(ids: string[]): Promise<Map<string, Macros>> {
  const out = new Map<string, Macros>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase
    .from('recipes')
    .select(
      `id, servings,
       recipe_ingredients (
         quantity, per_serving,
         ingredient:ingredients (
           unit_type, kcal_per_unit, protein_g_per_unit,
           carbs_g_per_unit, fat_g_per_unit, fiber_g_per_unit
         )
       )`,
    )
    .in('id', ids);
  if (error) throw error;
  for (const r of (data ?? []) as unknown as Array<{
    id: string; servings: number;
    recipe_ingredients: Array<{ quantity: number; per_serving: boolean; ingredient: any }>;
  }>) {
    const rows = (r.recipe_ingredients ?? []).map((ri) => {
      const ing = Array.isArray(ri.ingredient) ? ri.ingredient[0] : ri.ingredient;
      return {
        quantity: Number(ri.quantity),
        perServing: ri.per_serving,
        ingredient: {
          unit_type: ing?.unit_type ?? 'g',
          kcal_per_unit: Number(ing?.kcal_per_unit ?? 0),
          protein_g_per_unit: Number(ing?.protein_g_per_unit ?? 0),
          carbs_g_per_unit: Number(ing?.carbs_g_per_unit ?? 0),
          fat_g_per_unit: Number(ing?.fat_g_per_unit ?? 0),
          fiber_g_per_unit: Number(ing?.fiber_g_per_unit ?? 0),
        },
      };
    });
    const servings = Number(r.servings) > 0 ? Number(r.servings) : 1;
    out.set(r.id, computeRecipeMacros({ servings, rows }).perServing);
  }
  return out;
}
```

- [ ] **Step 2: Hook**

Append to `src/features/templates/hooks.ts`:

```ts
import { fetchRecipeMacrosByIds } from './recipeMacros';

export function useRecipeMacros(recipeIds: string[]) {
  const key = [...new Set(recipeIds)].sort();
  return useQuery({
    enabled: key.length > 0,
    queryKey: ['recipes', 'macros', key],
    queryFn: () => fetchRecipeMacrosByIds(key),
  });
}
```
(ensure `useQuery` is imported in that file.)

- [ ] **Step 3: `TemplateGrid` total row**

In `TemplateGrid.tsx`:
1. Imports:
```ts
import { DaySummary } from './DaySummary';
import { aggregateDayMacros } from '@/features/planning/daySummary';
import { scale, ZERO_MACROS, type Macros } from '@/features/recipes/macros';
import type { PhaseType } from '@/lib/macroStatus';
```
2. Add to `Props`:
```ts
  recipeMacros?: Map<string, Macros>; // per-serving macros by recipe id
  targets?: Macros;
  phaseType?: PhaseType;
```
3. Compute per-day totals from the in-memory slots:
```ts
  const dayTotals = aggregateDayMacros(
    slots.map((s) => ({
      key: String(s.day_of_week),
      macros: scale(recipeMacros?.get(s.recipe_id) ?? ZERO_MACROS, s.servings),
    })),
  );
```
4. After the day-name header row (the `{DAY_KEYS.map((dk) => …)}` block), add a "Total" row: a left label cell + one `DaySummary` per day column:
```tsx
        <div className="text-xs text-muted-foreground self-start pt-2 pr-2 text-right font-semibold uppercase tracking-wide">
          {t('summary.totalRow')}
        </div>
        {DAY_KEYS.map((_, dayIdx) => (
          <div key={`total-${dayIdx}`} className="rounded-md border bg-card p-2">
            <DaySummary
              totals={dayTotals.get(String(dayIdx)) ?? ZERO_MACROS}
              targets={targets}
              phaseType={phaseType}
            />
          </div>
        ))}
```

- [ ] **Step 4: Fetch + pass from the page**

In `PlantillaEditorPage.tsx`:
1. Imports:
```ts
import { useRecipeMacros } from '@/features/templates/hooks';
import { useDailyTarget } from '@/features/planning/useDailyTarget';
```
2. After `const [slots, setSlots] = useState…`:
```ts
  const recipeMacros = useRecipeMacros(slots.map((s) => s.recipe_id));
  const { targets, phaseType } = useDailyTarget();
```
3. Pass to `<TemplateGrid …>`:
```tsx
          recipeMacros={recipeMacros.data}
          targets={targets}
          phaseType={phaseType}
```

- [ ] **Step 5: Typecheck + run**

Run: `pnpm typecheck` (scoped until Task 11) `&& pnpm test -- TemplateGrid DaySummary`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/templates/recipeMacros.ts src/features/templates/hooks.ts src/features/planning/components/TemplateGrid.tsx src/pages/PlantillaEditorPage.tsx
git commit -m "feat(templates): per-day Total row vs target in the template editor"
```

---

## Task 11: Refactor `DayTotalsCard` onto `macroStatus` + `<MacroBar>`

**Files:**
- Modify: `src/features/diario/components/DayTotalsCard.tsx`
- Modify: `src/features/diario/components/DayTotalsCard.test.tsx`
- Modify: `src/i18n/es/diario.json`, `src/i18n/en/diario.json` (drop `fiberBelowMin` usage)

This realigns the diario to the new model: fiber no longer warns, fat gains the floor, kcal uses the new bands, bars use `<MacroBar>` (with overflow). Keep the card's hero kcal layout + protein-basis note + TDEE badge.

- [ ] **Step 1: Update the test for the new behaviour**

In `DayTotalsCard.test.tsx`, replace assertions that expect the old fiber amber/`fiberBelowMin` text with: a low-fiber day shows fiber neutrally with **no** warning text; a low-fat day shows the "Falta grasa" aviso. Example additions:

```tsx
it('does not warn on low fiber (informational)', () => {
  render(<DayTotalsCard totals={{ kcal: 1500, proteinG: 100, carbsG: 150, fatG: 50, fiberG: 5 }}
    targets={{ kcal: 2000, proteinG: 150, carbsG: 200, fatG: 65, fiberG: 30 }} phaseType="cut" />);
  expect(screen.queryByText(/bajo el mínimo/i)).not.toBeInTheDocument();
});

it('warns when fat is below the essential floor', () => {
  render(<DayTotalsCard totals={{ kcal: 1500, proteinG: 100, carbsG: 150, fatG: 20, fiberG: 25 }}
    targets={{ kcal: 2000, proteinG: 150, carbsG: 200, fatG: 65, fiberG: 30 }} phaseType="cut" />);
  expect(screen.getByText(/falta grasa/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- DayTotalsCard`
Expected: FAIL (old fiber text still rendered / fat aviso missing / type errors from removed tones).

- [ ] **Step 3: Refactor the card**

In `DayTotalsCard.tsx`:
- Remove the local `BAR_TONE` map and the inline bar `<div>`; render `<MacroBar>` instead inside `MacroBlock`, passing the `classifyMacro` result (`tone`, `excess`, `minFloorG`).
- Pass `essentialFatFloorG(targets.kcal)` into the fat block's `classifyMacro` call.
- Replace fiber's `floorUnderWarn` sub-text branch: fiber under target now shows the plain `remainingG` text (or nothing) — never `fiberBelowMin`.
- Add the fat-low aviso (reuse the `summary.fatLow` semantics; the diario can keep its own `totals.fatLow` key — see Step 4).
- Update the kcal hero to read tones from the new set (`over`/`onTarget`/`budget`/`slightOver`/`surplusHigh`); map `TEXT_TONE` to the new `MacroTone` union (same colours as in `DaySummary`).

Keep the hero number, `proteinBasis` note, TDEE badge, and the no-targets hint exactly as they are.

- [ ] **Step 4: i18n cleanup**

In `diario.json` (es + en): keep the `totals.*` keys still used; add `totals.fatLow` ("Falta grasa" / "Low fat") + `totals.fatLowHelp`; the `fiberBelowMin` key may remain unused (harmless) or be removed.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test -- DayTotalsCard`
Expected: PASS.

- [ ] **Step 6: Full typecheck (the migration is now complete)**

Run: `pnpm typecheck`
Expected: PASS (no remaining references to old tone names).

- [ ] **Step 7: Commit**

```bash
git add src/features/diario/components/DayTotalsCard.tsx src/features/diario/components/DayTotalsCard.test.tsx src/i18n/es/diario.json src/i18n/en/diario.json
git commit -m "refactor(diario): DayTotalsCard onto macroStatus + MacroBar (fiber informational, fat floor)"
```

---

## Task 12: i18n strings for `summary.*`

**Files:**
- Modify: `src/i18n/es/planning.json`, `src/i18n/en/planning.json`

- [ ] **Step 1: Add the keys (ES)**

Add a `summary` object to `src/i18n/es/planning.json`:

```json
  "summary": {
    "kcalUnit": "Kcal",
    "protein": "Prot",
    "carbs": "Carbs",
    "fat": "Grasa",
    "fiber": "Fibra",
    "fatLow": "⚠ Falta grasa",
    "fatLowLabel": "Por qué falta grasa",
    "fatLowHelp": "Estás por debajo del mínimo de grasa saludable (20% de tus kcal). La grasa es esencial para las hormonas y para absorber vitaminas.",
    "totalRow": "Total",
    "emptyDay": "Día sin comidas todavía"
  }
```

- [ ] **Step 2: Add the keys (EN)**

Mirror in `src/i18n/en/planning.json`:

```json
  "summary": {
    "kcalUnit": "Kcal",
    "protein": "Protein",
    "carbs": "Carbs",
    "fat": "Fat",
    "fiber": "Fiber",
    "fatLow": "⚠ Low fat",
    "fatLowLabel": "Why low fat",
    "fatLowHelp": "You are below the healthy fat minimum (20% of your kcal). Fat is essential for hormones and for absorbing vitamins.",
    "totalRow": "Total",
    "emptyDay": "No meals yet"
  }
```

(Adjust the `aria-label` key referenced in `DaySummary` to `summary.fatLowLabel`.)

- [ ] **Step 3: Verify no missing keys**

Run: `pnpm test -- DaySummary DayTotalsCard` and `pnpm dev` spot-check the planner + template editor + diario render the labels (not raw keys).

- [ ] **Step 4: Commit**

```bash
git add src/i18n/es/planning.json src/i18n/en/planning.json
git commit -m "i18n(planning): day-summary strings (kcal unit, macro labels, fat-low aviso)"
```

---

## Task 13: Final verification gate

- [ ] **Step 1: Full suite**

Run: `pnpm lint && pnpm typecheck && pnpm build && pnpm test`
Expected: all green (CI-enforced before merge — hard invariant #4).

- [ ] **Step 2: Manual spot-check (`pnpm dev`)**

- Planner: each day card shows the kcal line + 4 macro bars at the top; an over-budget day shows a dark-red excess; a low-fat day shows "Falta grasa" + min tick + `?`.
- Template editor: the "Total" row updates as recipes are added; an empty day shows 0 kcal.
- Diario: fiber no longer warns; a low-fat day warns; kcal bands match the phase.
- No-targets state (no active phase / no weight): plain totals, no avisos.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin claude/u5-planner-day-targets
gh pr create --base develop --title "feat(nutrition): U-5 day totals vs target (planner, templates, diario)" --body "<summary + 'Implements docs/superpowers/specs/2026-05-23-planner-day-targets-design.md'>"
```

---

## Self-Review (completed)

- **Spec coverage:** placement (Tasks 9/10 planner+template), kcal phase bands (Task 3), fat floor 20%E (Tasks 2/3), protein/fiber floors + fiber-informational (Task 3), overflow dark-red/dark-green/dark-amber (Tasks 3/4), aviso-with-`?` only when present (Task 8), min-line tick (Tasks 4/8), data via extended fetch + recipe-macros fetch (Tasks 6/10), target wiring (Task 7), Diario consistency (Task 11), i18n (Task 12). ✓ All spec sections map to a task.
- **Placeholder scan:** no TBD/TODO; every code step has concrete code.
- **Type consistency:** `MacroTone`/`ExcessKind`/`MacroStatus` defined in Task 3 are used identically in `MacroBar` (Task 4) and `DaySummary` (Task 8); `Macros` per-slot added in Task 6 is consumed in Task 9; `aggregateDayMacros` signature (Task 5) matches its callers (Tasks 9/10).
- **Known cross-task window:** Tasks 3→11 leave `DayTotalsCard` temporarily mis-typed (old tone names); the plan calls this out and the final gate (Task 13) requires a clean `pnpm typecheck`. Verify the exact hook/Tooltip paths flagged in Tasks 7 & 8 against the codebase during execution.
