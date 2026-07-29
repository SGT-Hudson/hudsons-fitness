# R-37 Interactive TDEE Calculator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standing TDEE calculator — one pure formula module, one shared component body, two frames (the `/tdee` route from More, and a sheet inside the phase editor that can apply its result to the kcal field).

**Architecture:** A pure `src/features/tdee/formulas.ts` owns the activity table, Katch-McArdle and the compose-with-guards function; it reuses `mifflinStJeor` from `src/lib/macros.ts` rather than re-deriving it. `TdeeCalculator.tsx` is a presentational body that holds its own input state and receives every piece of server data as props — it never imports a hook or `@/lib/supabase`, which is what keeps its Tier-2 test green in CI. The two frames (`TdeePage`, and `PhaseEditorPage` → `PhaseEditorForm`) are the only places that call hooks.

**Tech Stack:** React 18 + TS + Vite, react-i18next (statically bundled namespaces), Tailwind + shadcn-derived UI kit (`Card`, `Button`, `NumberField`, `SegmentedControl`, `ResponsiveDialog`, `PageShell`), Vitest (Tier-1 node / Tier-2 jsdom), Playwright (e2e smoke).

## Global Constraints

- **Metric only** (kg / cm / g). No imperial anywhere.
- **Nothing is stored.** No migration, no RPC, no new column, no new fetcher. BMR stays derived (hard invariant 5).
- **No AI/Claude attribution** in commits, code comments or PR text. Plain conventional commits.
- **Numbers rendered in JSX go through `useNum()`** (`int` for kcal, `dec`/`qty` otherwise) or through a `{{n, number}}` placeholder inside a `t()` string. `Math.round(...)`, `roundMacro(...)`, `toLocaleString(...)` and `new Intl.NumberFormat(...)` directly inside JSX are **ESLint errors** (`eslint.config.js:34-59`).
- **Copy lives in i18n**, both `src/i18n/es/*.json` and `src/i18n/en/*.json`, always mirrored. ES is the fallback language and the tone reference.
- **All new keys for this feature go in the `objetivos` namespace** under a new top-level `tdee` block — except the More-page row label, which must be a flat key in the `nav` namespace (that page's `t` is bound to `'nav'`).
- The body component `TdeeCalculator` must **not** import `@/lib/supabase`, any `use*` data hook, or `@/features/tdee/api` as a value import (that module imports supabase at module scope). `import type` from it is fine — types are erased.
- Test commands: `pnpm test` (Vitest, ~2 min), `pnpm lint`, `pnpm build`. Run all three before the final commit.
- Work happens in the existing worktree `/home/hudson/dev/hudsons-fitness/.claude/worktrees/r37-tdee` on branch `claude/r37-tdee-calculator`. Never push to `develop`/`main`.

---

## File Structure

**Create**
- `src/features/tdee/formulas.ts` — pure: activity table, Katch-McArdle, compose-with-guards.
- `src/features/tdee/formulas.test.ts` — Tier-1.
- `src/features/tdee/components/TdeeCalculator.tsx` — the shared body (props in, no hooks).
- `src/features/tdee/components/TdeeCalculator.test.tsx` — Tier-2.
- `src/pages/TdeePage.tsx` — frame A: route `/tdee`, `PageShell`, read-only.

**Modify**
- `src/i18n/es/objetivos.json`, `src/i18n/en/objetivos.json` — new `tdee` block.
- `src/i18n/es/nav.json`, `src/i18n/en/nav.json` — `tdee` row label.
- `src/app/router.tsx` — import + `/tdee` route inside the Shared block.
- `src/app/router.test.tsx` — mock + route case.
- `src/pages/MorePage.tsx` — fifth row.
- `src/pages/MorePage.test.tsx` — extend the rows assertion.
- `e2e/smoke.spec.ts` — add `/tdee` to `ROUTES`.
- `src/features/phases/components/PhaseEditorForm.tsx` — frame B: sheet state, trigger beside the kcal field, apply → `setValue`, `preview` render prop gains a context arg.
- `src/features/phases/components/PhasePreview.tsx` — optional trigger inside the amber `needsTdee` notice.
- `src/features/phases/components/PhasePreview.test.tsx` — cover the new trigger.
- `src/pages/PhaseEditorPage.tsx` — owns the new hooks, feeds both frames.
- `CLAUDE.md` — the e2e smoke route count 11 → 12.
- `docs/roadmap.md` — R-37 status.

---

### Task 1: The pure formula module

**Files:**
- Create: `src/features/tdee/formulas.ts`
- Test: `src/features/tdee/formulas.test.ts`

**Interfaces:**
- Consumes: `mifflinStJeor` from `src/lib/macros.ts:124` — `({ weightKg, heightCm, ageYears, sex: 'male'|'female'|'other' }) => number`.
- Produces (used by Tasks 2 and 4):
  - `type TdeeSex = 'male' | 'female' | 'other'`
  - `type ActivityKey = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'`
  - `const ACTIVITY_LEVELS: readonly { key: ActivityKey; multiplier: number }[]`
  - `interface TdeeFormulaInputs { sex: TdeeSex; ageYears: number | null; heightCm: number | null; weightKg: number | null; activity: ActivityKey }`
  - `interface TdeeFormulaResult { bmrKcal: number; tdeeKcal: number; multiplier: number }`
  - `function computeFormulaTdee(inputs: TdeeFormulaInputs): TdeeFormulaResult | null`
  - `function computeKatchTdee(opts: { weightKg: number | null; bodyFatPct: number | null; activity: ActivityKey }): TdeeFormulaResult | null`

- [ ] **Step 1: Write the failing test**

Create `src/features/tdee/formulas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mifflinStJeor } from '@/lib/macros';
import {
  ACTIVITY_LEVELS,
  computeFormulaTdee,
  computeKatchTdee,
  type TdeeFormulaInputs,
} from './formulas';

// R-37 Tier-1. The calculator is the only thing in the app that turns a
// formula into a kcal target the user can apply, so the arithmetic is pinned
// exactly: a changed multiplier or a changed Katch constant must turn a test
// red (mutation-bite requirement, see the plan's Step 2 below).

const base: TdeeFormulaInputs = {
  sex: 'male',
  ageYears: 36,
  heightCm: 180,
  weightKg: 80,
  activity: 'sedentary',
};
// Mifflin, male, 80 kg / 180 cm / 36 y:
//   10*80 + 6.25*180 - 5*36 + 5 = 800 + 1125 - 180 + 5 = 1750

describe('ACTIVITY_LEVELS', () => {
  it('is the canonical five-row table, in ascending order', () => {
    expect(ACTIVITY_LEVELS.map((l) => l.key)).toEqual([
      'sedentary',
      'light',
      'moderate',
      'active',
      'very_active',
    ]);
    expect(ACTIVITY_LEVELS.map((l) => l.multiplier)).toEqual([
      1.2, 1.375, 1.55, 1.725, 1.9,
    ]);
  });
});

describe('computeFormulaTdee', () => {
  it('returns the Mifflin BMR alongside the multiplied TDEE', () => {
    const result = computeFormulaTdee(base);
    expect(result).not.toBeNull();
    expect(result!.bmrKcal).toBe(1750);
    expect(result!.bmrKcal).toBe(
      mifflinStJeor({ weightKg: 80, heightCm: 180, ageYears: 36, sex: 'male' }),
    );
    expect(result!.multiplier).toBe(1.2);
    expect(result!.tdeeKcal).toBeCloseTo(2100, 10);
  });

  it('applies every activity multiplier', () => {
    for (const level of ACTIVITY_LEVELS) {
      const result = computeFormulaTdee({ ...base, activity: level.key });
      expect(result!.multiplier).toBe(level.multiplier);
      expect(result!.tdeeKcal).toBeCloseTo(1750 * level.multiplier, 10);
    }
  });

  it('follows mifflinStJeor for female and other', () => {
    // base = 800 + 1125 - 180 = 1745 ; female/other = base - 161 = 1584
    expect(computeFormulaTdee({ ...base, sex: 'female' })!.bmrKcal).toBe(1584);
    expect(computeFormulaTdee({ ...base, sex: 'other' })!.bmrKcal).toBe(1584);
  });

  it('returns null when an input is missing', () => {
    expect(computeFormulaTdee({ ...base, weightKg: null })).toBeNull();
    expect(computeFormulaTdee({ ...base, heightCm: null })).toBeNull();
    expect(computeFormulaTdee({ ...base, ageYears: null })).toBeNull();
  });

  it('returns null for a cleared field (useDecimalDraft commits 0)', () => {
    // The body's inputs commit 0 on blank, so 0 must never render a confident
    // number — this is the guard that keeps an emptied weight from painting one.
    expect(computeFormulaTdee({ ...base, weightKg: 0 })).toBeNull();
    expect(computeFormulaTdee({ ...base, heightCm: 0 })).toBeNull();
    expect(computeFormulaTdee({ ...base, ageYears: 0 })).toBeNull();
  });

  it('returns null for non-sensible values', () => {
    expect(computeFormulaTdee({ ...base, weightKg: -1 })).toBeNull();
    expect(computeFormulaTdee({ ...base, ageYears: 120 })).toBeNull();
    expect(computeFormulaTdee({ ...base, ageYears: 200 })).toBeNull();
  });
});

describe('computeKatchTdee', () => {
  it('matches a hand-computed case', () => {
    // lean = 80 * (1 - 20/100) = 64 kg
    // BMR  = 370 + 21.6 * 64 = 370 + 1382.4 = 1752.4
    // TDEE = 1752.4 * 1.55 = 2716.22
    const result = computeKatchTdee({
      weightKg: 80,
      bodyFatPct: 20,
      activity: 'moderate',
    });
    expect(result!.bmrKcal).toBeCloseTo(1752.4, 10);
    expect(result!.multiplier).toBe(1.55);
    expect(result!.tdeeKcal).toBeCloseTo(2716.22, 10);
  });

  it('returns null without a usable body-fat reading', () => {
    expect(
      computeKatchTdee({ weightKg: 80, bodyFatPct: null, activity: 'moderate' }),
    ).toBeNull();
    expect(
      computeKatchTdee({ weightKg: 80, bodyFatPct: 0, activity: 'moderate' }),
    ).toBeNull();
    expect(
      computeKatchTdee({ weightKg: 80, bodyFatPct: 100, activity: 'moderate' }),
    ).toBeNull();
    expect(
      computeKatchTdee({ weightKg: null, bodyFatPct: 20, activity: 'moderate' }),
    ).toBeNull();
    expect(
      computeKatchTdee({ weightKg: 0, bodyFatPct: 20, activity: 'moderate' }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd /home/hudson/dev/hudsons-fitness/.claude/worktrees/r37-tdee
pnpm vitest run src/features/tdee/formulas.test.ts
```

Expected: FAIL — `Failed to resolve import "./formulas"`.

- [ ] **Step 3: Write the implementation**

Create `src/features/tdee/formulas.ts`:

```ts
import { mifflinStJeor } from '@/lib/macros';

/**
 * R-37 — the formula side of TDEE. Pure, no DB, nothing stored (hard
 * invariant 5): every number here is recomputed on render from inputs the
 * user can edit in place.
 *
 * This is deliberately the WEAKER estimator. R-07's Kalman filter
 * (`src/core/tdee.ts`) learns real expenditure from logged intake and weight
 * and beats any population formula; this module exists only for the cold
 * start, when there is no adaptive estimate to lean on yet.
 *
 * `mifflinStJeor` is imported, not reimplemented — a third copy of that
 * arithmetic (the edge function already holds a second) would be a liability.
 */

export type TdeeSex = 'male' | 'female' | 'other';

export type ActivityKey =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';

export interface ActivityLevel {
  key: ActivityKey;
  multiplier: number;
}

/** The standard Harris/Mifflin activity factors, ascending. */
export const ACTIVITY_LEVELS: readonly ActivityLevel[] = [
  { key: 'sedentary', multiplier: 1.2 },
  { key: 'light', multiplier: 1.375 },
  { key: 'moderate', multiplier: 1.55 },
  { key: 'active', multiplier: 1.725 },
  { key: 'very_active', multiplier: 1.9 },
] as const;

export function activityMultiplier(key: ActivityKey): number {
  return ACTIVITY_LEVELS.find((l) => l.key === key)!.multiplier;
}

export interface TdeeFormulaInputs {
  sex: TdeeSex;
  ageYears: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activity: ActivityKey;
}

export interface TdeeFormulaResult {
  bmrKcal: number;
  tdeeKcal: number;
  multiplier: number;
}

/**
 * Mifflin-St Jeor BMR × activity factor, or `null` when any input is missing
 * or non-sensible — the same contract as `estimatedBmr` (`src/lib/macros.ts`),
 * so the caller simply renders nothing.
 *
 * The `<= 0` guards are load-bearing, not defensive noise: `useDecimalDraft`
 * commits `0` when a field is cleared, so without them an emptied weight would
 * paint a confident, meaningless number instead of blanking the result.
 */
export function computeFormulaTdee(
  inputs: TdeeFormulaInputs,
): TdeeFormulaResult | null {
  const { sex, ageYears, heightCm, weightKg, activity } = inputs;
  if (weightKg == null || weightKg <= 0) return null;
  if (heightCm == null || heightCm <= 0) return null;
  if (ageYears == null || ageYears <= 0 || ageYears >= 120) return null;

  const bmrKcal = mifflinStJeor({ weightKg, heightCm, ageYears, sex });
  const multiplier = activityMultiplier(activity);
  return { bmrKcal, tdeeKcal: bmrKcal * multiplier, multiplier };
}

/**
 * Katch-McArdle: `BMR = 370 + 21.6 × leanKg`, then the same activity factor.
 * A secondary reading only — it runs on `body_fat_pct`, the noisiest input in
 * the system (the D-A6 / D-D5 guardrail), so the UI shows it smaller and
 * labelled with the date of the measurement it used.
 *
 * `bodyFatPct` is a PERCENT (18.2), matching the `body_measurements` column
 * and `computeDailyMacroTargets`' `1 - bodyFatPct / 100`.
 */
export function computeKatchTdee(opts: {
  weightKg: number | null;
  bodyFatPct: number | null;
  activity: ActivityKey;
}): TdeeFormulaResult | null {
  const { weightKg, bodyFatPct, activity } = opts;
  if (weightKg == null || weightKg <= 0) return null;
  if (bodyFatPct == null || bodyFatPct <= 0 || bodyFatPct >= 100) return null;

  const leanKg = weightKg * (1 - bodyFatPct / 100);
  const bmrKcal = 370 + 21.6 * leanKg;
  const multiplier = activityMultiplier(activity);
  return { bmrKcal, tdeeKcal: bmrKcal * multiplier, multiplier };
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
pnpm vitest run src/features/tdee/formulas.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Prove the tests bite (mutation check — do not skip)**

Temporarily make each of these three edits **one at a time** in `formulas.ts`, re-running `pnpm vitest run src/features/tdee/formulas.test.ts` after each, then revert it:

1. `{ key: 'light', multiplier: 1.375 }` → `1.35` — expect the `ACTIVITY_LEVELS` and "applies every activity multiplier" tests to go RED.
2. `370 + 21.6 * leanKg` → `370 + 21.4 * leanKg` — expect the Katch hand-computed test to go RED.
3. Delete the line `if (weightKg == null || weightKg <= 0) return null;` from `computeFormulaTdee` — expect the "cleared field" and "non-sensible values" tests to go RED.

If any mutation leaves the suite green, the test is not pinning what it claims — fix the test before continuing. Confirm the file is back to its original state with `git diff src/features/tdee/formulas.ts` showing only the intended implementation.

- [ ] **Step 6: Commit**

```bash
git add src/features/tdee/formulas.ts src/features/tdee/formulas.test.ts
git commit -m "feat(tdee): pure formula module for the TDEE calculator (R-37)"
```

---

### Task 2: The calculator body + its copy

**Files:**
- Create: `src/features/tdee/components/TdeeCalculator.tsx`
- Test: `src/features/tdee/components/TdeeCalculator.test.tsx`
- Modify: `src/i18n/es/objetivos.json`, `src/i18n/en/objetivos.json`

**Interfaces:**
- Consumes: `ACTIVITY_LEVELS`, `computeFormulaTdee`, `computeKatchTdee`, `TdeeSex`, `ActivityKey`, `TdeeFormulaInputs` from Task 1.
- Produces (used by Tasks 3 and 4):
  ```ts
  export interface TdeeCalculatorData {
    sex: TdeeSex | null;
    ageYears: number | null;
    heightCm: number | null;
    weightKg: number | null;
    bodyFat: { pct: number; measuredOn: string } | null;
    adaptiveTdeeKcal: number | null;
    adaptiveConfidence: 'low' | 'medium' | 'high' | null;
  }
  export function TdeeCalculator(props: {
    data: TdeeCalculatorData;
    onApply?: (tdeeKcal: number) => void;
  }): JSX.Element;
  ```
  `onApply` receives the **rounded whole-kcal** formula TDEE. When it is omitted the apply button is not rendered (read-only frame).

- [ ] **Step 1: Add the copy (both languages, mirrored)**

In `src/i18n/es/objetivos.json`, add a new top-level `"tdee"` key as a sibling of the existing `"phases"` key:

```json
  "tdee": {
    "title": "Calculadora de TDEE",
    "intro": "Una estimación de partida, calculada con una fórmula. Cuando lleves un par de semanas registrando comidas y peso, la app calculará tu gasto real y este número pasará a segundo plano.",
    "yourData": "Tus datos",
    "dataHint": "Puedes cambiarlos aquí para probar escenarios: solo viven en esta pantalla y no tocan tu perfil. Para cambiarlos de verdad, ve a Ajustes.",
    "reset": "Volver a mis datos",
    "sexLabel": "Sexo",
    "sexMale": "Hombre",
    "sexFemale": "Mujer",
    "sexOther": "Otro",
    "age": "Edad",
    "ageUnit": "años",
    "height": "Altura",
    "weight": "Peso",
    "activityLabel": "Nivel de actividad",
    "activity": {
      "sedentary": "Sedentario",
      "light": "Ligero",
      "moderate": "Moderado",
      "active": "Activo",
      "very_active": "Muy activo"
    },
    "activityDescription": {
      "sedentary": "Trabajo sentado y poco más: nada de ejercicio estructurado.",
      "light": "Ejercicio suave 1-3 días por semana, o un trabajo de pie.",
      "moderate": "Entreno 3-5 días por semana, o bastante movimiento diario.",
      "active": "Entreno duro 6-7 días por semana, o trabajo físico.",
      "very_active": "Trabajo físico duro más entreno diario, o doble sesión."
    },
    "multiplier": "× {{n, number}}",
    "bmr": "Metabolismo basal (Mifflin-St Jeor)",
    "tdeeLabel": "Gasto diario estimado",
    "kcalUnit": "kcal",
    "incomplete": "Completa peso, altura y edad para ver la estimación.",
    "katch": "Katch-McArdle: {{n, number}} kcal",
    "katchNote": "Usa el % de grasa medido el {{date}}.",
    "adaptiveTitle": "Tu TDEE medido: {{n, number}} kcal",
    "adaptiveAbove": "{{n, number}} kcal por encima de esta fórmula.",
    "adaptiveBelow": "{{n, number}} kcal por debajo de esta fórmula.",
    "adaptiveSame": "Coincide con esta fórmula.",
    "adaptiveBody": "Este número sale de tu ingesta y tu peso reales, no de una fórmula de población: cuando existe, manda él.",
    "adaptiveLow": "Aún en calentamiento: el número medido se sigue ajustando.",
    "adaptiveMedium": "Precisión media: el número medido todavía se está afinando.",
    "noAdaptive": "Todavía no hay un TDEE medido. Con un par de semanas de registro, la app calculará el tuyo y este pasará a segundo plano.",
    "apply": "Usar {{n, number}} kcal como objetivo fijo",
    "applyHint": "Cambia la fase a modo «kcal fijas» con este valor.",
    "open": "Calcular mi TDEE"
  }
```

In `src/i18n/en/objetivos.json`, add the mirrored block in the same position:

```json
  "tdee": {
    "title": "TDEE calculator",
    "intro": "A formula-based starting point. Once you have logged meals and weight for a couple of weeks, the app works out your real expenditure and this number moves to second place.",
    "yourData": "Your data",
    "dataHint": "Change them here to try scenarios: they only live on this screen and never touch your profile. To change them for real, go to Settings.",
    "reset": "Back to my data",
    "sexLabel": "Sex",
    "sexMale": "Male",
    "sexFemale": "Female",
    "sexOther": "Other",
    "age": "Age",
    "ageUnit": "years",
    "height": "Height",
    "weight": "Weight",
    "activityLabel": "Activity level",
    "activity": {
      "sedentary": "Sedentary",
      "light": "Light",
      "moderate": "Moderate",
      "active": "Active",
      "very_active": "Very active"
    },
    "activityDescription": {
      "sedentary": "Seated work and little else: no structured exercise.",
      "light": "Easy exercise 1-3 days a week, or a job on your feet.",
      "moderate": "Training 3-5 days a week, or plenty of daily movement.",
      "active": "Hard training 6-7 days a week, or physical work.",
      "very_active": "Hard physical work plus daily training, or two-a-days."
    },
    "multiplier": "× {{n, number}}",
    "bmr": "Basal metabolic rate (Mifflin-St Jeor)",
    "tdeeLabel": "Estimated daily expenditure",
    "kcalUnit": "kcal",
    "incomplete": "Fill in weight, height and age to see the estimate.",
    "katch": "Katch-McArdle: {{n, number}} kcal",
    "katchNote": "Uses the body-fat % measured on {{date}}.",
    "adaptiveTitle": "Your measured TDEE: {{n, number}} kcal",
    "adaptiveAbove": "{{n, number}} kcal above this formula.",
    "adaptiveBelow": "{{n, number}} kcal below this formula.",
    "adaptiveSame": "Matches this formula.",
    "adaptiveBody": "That number comes from your real intake and weight, not a population formula: when it exists, it wins.",
    "adaptiveLow": "Still warming up: the measured number is still settling.",
    "adaptiveMedium": "Medium confidence: the measured number is still being refined.",
    "noAdaptive": "There is no measured TDEE yet. After a couple of weeks of logging, the app will work out yours and this one moves to second place.",
    "apply": "Use {{n, number}} kcal as a fixed target",
    "applyHint": "Switches the phase to fixed-kcal mode with this value.",
    "open": "Work out my TDEE"
  }
```

Verify both files still parse:

```bash
node -e "JSON.parse(require('fs').readFileSync('src/i18n/es/objetivos.json','utf8'));JSON.parse(require('fs').readFileSync('src/i18n/en/objetivos.json','utf8'));console.log('ok')"
```

- [ ] **Step 2: Write the failing test**

Create `src/features/tdee/components/TdeeCalculator.test.tsx`:

```tsx
// @vitest-environment jsdom
//
// R-37 Tier-2. The body is pure — the frames own the hooks and pass data in —
// so there is no supabase mock and no QueryClientProvider here. What this pins:
//  - the result recomputes live as the inputs are typed;
//  - the Katch line appears only when a body-fat reading came in;
//  - the adaptive-comparison strip appears only when a measured TDEE exists;
//  - apply hands back the ROUNDED formula TDEE (the value the phase editor
//    writes into kcal_value), and is absent without an onApply callback.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';
import { TdeeCalculator, type TdeeCalculatorData } from './TdeeCalculator';

// 80 kg / 180 cm / 36 y male → Mifflin 1750; sedentary (1.2) → 2100 kcal.
function data(over: Partial<TdeeCalculatorData> = {}): TdeeCalculatorData {
  return {
    sex: 'male',
    ageYears: 36,
    heightCm: 180,
    weightKg: 80,
    bodyFat: null,
    adaptiveTdeeKcal: null,
    adaptiveConfidence: null,
    ...over,
  };
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('TdeeCalculator', () => {
  it('shows the Mifflin BMR and the sedentary TDEE from the seeded data', () => {
    render(<TdeeCalculator data={data()} />);
    expect(screen.getByTestId('tdee-bmr')).toHaveTextContent('1.750');
    expect(screen.getByTestId('tdee-result')).toHaveTextContent('2.100');
  });

  it('recomputes when the activity level changes', async () => {
    const user = userEvent.setup();
    render(<TdeeCalculator data={data()} />);
    await user.click(screen.getByRole('radio', { name: /Muy activo/ }));
    // 1750 × 1.9 = 3325
    expect(screen.getByTestId('tdee-result')).toHaveTextContent('3.325');
  });

  it('recomputes when the weight is edited, and withholds the result when cleared', async () => {
    const user = userEvent.setup();
    render(<TdeeCalculator data={data()} />);
    const weight = screen.getByLabelText(/Peso/);
    await user.clear(weight);
    expect(screen.queryByTestId('tdee-result')).toBeNull();
    expect(screen.getByTestId('tdee-incomplete')).toBeInTheDocument();
    await user.type(weight, '90');
    // Mifflin male 90/180/36 = 900 + 1125 - 180 + 5 = 1850 ; ×1.2 = 2220
    expect(screen.getByTestId('tdee-result')).toHaveTextContent('2.220');
  });

  it('renders no Katch line without a body-fat reading, and one with it', () => {
    const { unmount } = render(<TdeeCalculator data={data()} />);
    expect(screen.queryByTestId('tdee-katch')).toBeNull();
    unmount();

    render(
      <TdeeCalculator
        data={data({ bodyFat: { pct: 20, measuredOn: '2026-05-18' } })}
      />,
    );
    // lean 64 kg → 370 + 21.6×64 = 1752.4 ; ×1.2 = 2102.88 → 2.103
    expect(screen.getByTestId('tdee-katch')).toHaveTextContent('2.103');
    expect(screen.getByTestId('tdee-katch')).toHaveTextContent('2026');
  });

  it('renders the forward-looking note when there is no adaptive estimate', () => {
    render(<TdeeCalculator data={data()} />);
    expect(screen.getByTestId('tdee-no-adaptive')).toBeInTheDocument();
    expect(screen.queryByTestId('tdee-adaptive')).toBeNull();
  });

  it('renders the comparison strip when an adaptive estimate exists', () => {
    render(
      <TdeeCalculator
        data={data({ adaptiveTdeeKcal: 2400, adaptiveConfidence: 'high' })}
      />,
    );
    const strip = screen.getByTestId('tdee-adaptive');
    expect(strip).toHaveTextContent('2.400');
    // 2400 - 2100 = 300 above
    expect(strip).toHaveTextContent('300');
    expect(screen.queryByTestId('tdee-no-adaptive')).toBeNull();
  });

  it('surfaces a low-confidence caveat on the strip', () => {
    render(
      <TdeeCalculator
        data={data({ adaptiveTdeeKcal: 2400, adaptiveConfidence: 'low' })}
      />,
    );
    expect(screen.getByTestId('tdee-adaptive')).toHaveTextContent(
      i18n.t('objetivos:tdee.adaptiveLow'),
    );
  });

  it('renders no apply button without an onApply callback', () => {
    render(<TdeeCalculator data={data()} />);
    expect(screen.queryByTestId('tdee-apply')).toBeNull();
  });

  it('applies the rounded formula TDEE', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<TdeeCalculator data={data()} onApply={onApply} />);
    await user.click(screen.getByTestId('tdee-apply'));
    expect(onApply).toHaveBeenCalledWith(2100);
  });

  it('restores the seeded data after an edit', async () => {
    const user = userEvent.setup();
    render(<TdeeCalculator data={data()} />);
    const weight = screen.getByLabelText(/Peso/);
    await user.clear(weight);
    await user.type(weight, '90');
    expect(screen.getByTestId('tdee-result')).toHaveTextContent('2.220');
    await user.click(screen.getByTestId('tdee-reset'));
    expect(screen.getByTestId('tdee-result')).toHaveTextContent('2.100');
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
pnpm vitest run src/features/tdee/components/TdeeCalculator.test.tsx
```

Expected: FAIL — `Failed to resolve import "./TdeeCalculator"`.

- [ ] **Step 4: Write the component**

Create `src/features/tdee/components/TdeeCalculator.tsx`:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NumberField } from '@/components/ui/NumberField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useDecimalDraft } from '@/components/ui/useDecimalDraft';
import { useNum } from '@/hooks/useNum';
import { formatDate, type Locale } from '@/lib/dates';
import { cn } from '@/lib/utils';
import {
  ACTIVITY_LEVELS,
  computeFormulaTdee,
  computeKatchTdee,
  type ActivityKey,
  type TdeeSex,
} from '../formulas';

/**
 * R-37 — the calculator body, shared by both frames: the `/tdee` route (no
 * apply) and the phase editor's sheet (apply). It holds its own input state
 * and receives every server-derived value as a prop.
 *
 * The props-in shape is deliberate: a component that transitively imports
 * `@/lib/supabase` renders fine locally and fails in CI, where no env is
 * present. So the frames call the hooks; this file imports none.
 *
 * Editing an input NEVER writes back to the profile. That is the point of the
 * tool ("what if I weighed 78?"), and it keeps Settings as the single owner of
 * profile edits.
 */

export interface TdeeCalculatorData {
  sex: TdeeSex | null;
  ageYears: number | null;
  heightCm: number | null;
  weightKg: number | null;
  /** Latest reading with a body fat %, for the secondary Katch line. */
  bodyFat: { pct: number; measuredOn: string } | null;
  /** R-07's adaptive estimate, when the filter has produced one. */
  adaptiveTdeeKcal: number | null;
  adaptiveConfidence: 'low' | 'medium' | 'high' | null;
}

interface Props {
  data: TdeeCalculatorData;
  /**
   * Present only in the phase-editor frame. Receives the formula TDEE rounded
   * to whole kcal — the value written into `kcal_value`.
   */
  onApply?: (tdeeKcal: number) => void;
}

export function TdeeCalculator({ data, onApply }: Props) {
  const { t, i18n } = useTranslation('objetivos');
  const num = useNum();
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;

  const [sex, setSex] = useState<TdeeSex>(data.sex ?? 'male');
  const [ageYears, setAgeYears] = useState<number | null>(data.ageYears);
  const [heightCm, setHeightCm] = useState<number | null>(data.heightCm);
  const [weightKg, setWeightKg] = useState<number | null>(data.weightKg);
  const [activity, setActivity] = useState<ActivityKey>('moderate');

  // `useDecimalDraft` keeps what the user typed (including a comma) visible
  // while committing a parsed number upward; a cleared field commits 0, which
  // `computeFormulaTdee` treats as "no answer".
  const age = useDecimalDraft(ageYears == null ? '' : String(ageYears), setAgeYears);
  const height = useDecimalDraft(
    heightCm == null ? '' : String(heightCm),
    setHeightCm,
  );
  const weight = useDecimalDraft(
    weightKg == null ? '' : String(weightKg),
    setWeightKg,
  );

  function reset() {
    setSex(data.sex ?? 'male');
    setAgeYears(data.ageYears);
    setHeightCm(data.heightCm);
    setWeightKg(data.weightKg);
  }

  const result = computeFormulaTdee({ sex, ageYears, heightCm, weightKg, activity });
  const katch = computeKatchTdee({
    weightKg,
    bodyFatPct: data.bodyFat?.pct ?? null,
    activity,
  });

  const adaptive = data.adaptiveTdeeKcal;
  const diff = adaptive != null && result != null ? adaptive - result.tdeeKcal : null;
  const confidenceNote =
    data.adaptiveConfidence === 'low'
      ? t('tdee.adaptiveLow')
      : data.adaptiveConfidence === 'medium'
        ? t('tdee.adaptiveMedium')
        : null;

  return (
    <div className="flex flex-col gap-3 md:gap-3.5">
      <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
        {t('tdee.intro')}
      </p>

      {/* ── 1. Your data ── */}
      <Card className="space-y-3.5 p-3.5 md:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">
            {t('tdee.yourData')}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            data-testid="tdee-reset"
            className="h-8 text-[12px] text-muted-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {t('tdee.reset')}
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label id="tdee-sex-label">{t('tdee.sexLabel')}</Label>
          <SegmentedControl
            labelledBy="tdee-sex-label"
            value={sex}
            onChange={setSex}
            options={[
              { value: 'male' as const, label: t('tdee.sexMale') },
              { value: 'female' as const, label: t('tdee.sexFemale') },
              { value: 'other' as const, label: t('tdee.sexOther') },
            ]}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <NumberField
            id="tdee-age"
            label={t('tdee.age')}
            suffix={t('tdee.ageUnit')}
            {...age}
          />
          <NumberField id="tdee-height" label={t('tdee.height')} suffix="cm" {...height} />
          <NumberField id="tdee-weight" label={t('tdee.weight')} suffix="kg" {...weight} />
        </div>

        <p className="text-[11.5px] leading-[1.45] text-muted-foreground">
          {t('tdee.dataHint')}
        </p>
      </Card>

      {/* ── 2. Activity level ── */}
      <Card className="space-y-2 p-3.5 md:p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">
          {t('tdee.activityLabel')}
        </p>
        <div role="radiogroup" aria-label={t('tdee.activityLabel')} className="flex flex-col gap-1.5">
          {ACTIVITY_LEVELS.map((level) => {
            const on = level.key === activity;
            return (
              <button
                key={level.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setActivity(level.key)}
                className={cn(
                  'flex items-start gap-2.5 rounded-[12px] border px-3 py-2.5 text-left transition-colors',
                  on
                    ? 'border-accent-line bg-accent-soft'
                    : 'hover:bg-muted/60',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">
                    {t(`tdee.activity.${level.key}`)}
                  </p>
                  <p className="text-[11.5px] leading-[1.4] text-muted-foreground">
                    {t(`tdee.activityDescription.${level.key}`)}
                  </p>
                </div>
                <span className="tnum shrink-0 pt-0.5 text-[11.5px] text-text-dim">
                  {t('tdee.multiplier', { n: level.multiplier })}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* ── 3. The result ── */}
      <Card className="space-y-2 p-3.5 md:p-4">
        {result == null ? (
          <p
            role="status"
            data-testid="tdee-incomplete"
            className="rounded-md bg-amber-soft px-3 py-2 text-xs leading-[1.45] text-amber-ink"
          >
            {t('tdee.incomplete')}
          </p>
        ) : (
          <>
            <p className="text-[11.5px] text-muted-foreground">
              {t('tdee.bmr')}{' '}
              <span className="tnum font-semibold text-foreground" data-testid="tdee-bmr">
                {num.int(result.bmrKcal)}
              </span>{' '}
              {t('tdee.kcalUnit')}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">
              {t('tdee.tdeeLabel')}
            </p>
            <p className="tnum text-[30px] font-bold leading-none" data-testid="tdee-result">
              {num.int(result.tdeeKcal)}{' '}
              <span className="text-[15px] font-medium text-muted-foreground">
                {t('tdee.kcalUnit')}
              </span>
            </p>

            {katch != null && data.bodyFat != null && (
              <p className="text-[11.5px] leading-[1.45] text-muted-foreground" data-testid="tdee-katch">
                {t('tdee.katch', { n: Math.round(katch.tdeeKcal) })}{' '}
                {t('tdee.katchNote', {
                  date: formatDate(data.bodyFat.measuredOn, 'd MMM yyyy', locale),
                })}
              </p>
            )}

            {onApply && (
              <div className="space-y-1 pt-1">
                <Button
                  type="button"
                  onClick={() => onApply(Math.round(result.tdeeKcal))}
                  data-testid="tdee-apply"
                  className="h-11 w-full"
                >
                  {t('tdee.apply', { n: Math.round(result.tdeeKcal) })}
                </Button>
                <p className="text-[11px] text-muted-foreground">{t('tdee.applyHint')}</p>
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── The honesty block ── */}
      {adaptive != null ? (
        <Card className="space-y-1 p-3.5 md:p-4" data-testid="tdee-adaptive">
          <p className="text-[13px] font-semibold">
            {t('tdee.adaptiveTitle', { n: Math.round(adaptive) })}
          </p>
          {diff != null && (
            <p className="text-[11.5px] text-muted-foreground">
              {Math.round(diff) === 0
                ? t('tdee.adaptiveSame')
                : diff > 0
                  ? t('tdee.adaptiveAbove', { n: Math.round(diff) })
                  : t('tdee.adaptiveBelow', { n: Math.round(-diff) })}
            </p>
          )}
          <p className="text-[11.5px] leading-[1.45] text-muted-foreground">
            {t('tdee.adaptiveBody')}
          </p>
          {confidenceNote && (
            <p className="text-[11.5px] leading-[1.45] text-amber-ink">{confidenceNote}</p>
          )}
        </Card>
      ) : (
        <p
          className="text-[11.5px] leading-[1.45] text-muted-foreground"
          data-testid="tdee-no-adaptive"
        >
          {t('tdee.noAdaptive')}
        </p>
      )}
    </div>
  );
}
```

Note on the ESLint locale guard: `Math.round(...)` appears here only **inside `t()` interpolation arguments and an `onApply` call**, never as a bare JSX expression container — that is exactly what the rule's selector allows (it matches `JSXExpressionContainer > CallExpression` only). Numbers rendered directly go through `num.int(...)`.

- [ ] **Step 5: Run the test and iterate until green**

```bash
pnpm vitest run src/features/tdee/components/TdeeCalculator.test.tsx
```

Expected: PASS, 10 tests. If a Spanish thousands separator assertion fails, check what `num.int(2100)` actually produced (`formatDecimal` with `digits: 0`, `es-ES` → `2.100`) and fix the assertion to the real output — do **not** loosen it to a substring that would pass on the wrong number.

- [ ] **Step 6: Commit**

```bash
git add src/features/tdee/components/TdeeCalculator.tsx \
        src/features/tdee/components/TdeeCalculator.test.tsx \
        src/i18n/es/objetivos.json src/i18n/en/objetivos.json
git commit -m "feat(tdee): shared calculator body with live recompute (R-37)"
```

---

### Task 3: Frame A — the `/tdee` route from More

**Files:**
- Create: `src/pages/TdeePage.tsx`
- Modify: `src/app/router.tsx`, `src/app/router.test.tsx`, `src/pages/MorePage.tsx`, `src/pages/MorePage.test.tsx`, `src/i18n/es/nav.json`, `src/i18n/en/nav.json`, `e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `TdeeCalculator`, `TdeeCalculatorData` (Task 2); `useProfile` (`src/features/profile/hooks.ts`), `useLatestMeasurement` / `useRecentMeasurements` (`src/features/measurements/hooks.ts`), `useLatestTdee` (`src/features/tdee/hooks.ts`), `tdeeConfidenceBand` (`src/features/tdee/api.ts`), `ageYearsFromBirthDate` (`src/lib/macros.ts`), `todayInTZ` (`src/lib/dates.ts`).
- Produces: `export function TdeePage()`; the exported helper `buildCalculatorData` is **not** shared — Task 4 duplicates the small hook-reading block in its own frame rather than importing a page.

- [ ] **Step 1: Write the page**

Create `src/pages/TdeePage.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { PageShell } from '@/components/layout/PageShell';
import { TdeeCalculator, type TdeeCalculatorData } from '@/features/tdee/components/TdeeCalculator';
import { tdeeConfidenceBand } from '@/features/tdee/api';
import { useLatestTdee } from '@/features/tdee/hooks';
import { useProfile } from '@/features/profile/hooks';
import { useLatestMeasurement, useRecentMeasurements } from '@/features/measurements/hooks';
import { ageYearsFromBirthDate } from '@/lib/macros';
import { todayInTZ } from '@/lib/dates';
import type { TdeeSex } from '@/features/tdee/formulas';

/**
 * R-37 frame A: the standing calculator, reached from More. No apply action —
 * there is nothing here to apply to, which is what makes this the
 * play-with-scenarios mode. The apply-capable twin is the sheet inside the
 * phase editor.
 *
 * A route rather than a sheet on More: without a URL the back button would
 * leave More entirely instead of closing the sheet.
 */
export function TdeePage() {
  const { t } = useTranslation('objetivos');
  const profile = useProfile();
  const latest = useLatestMeasurement();
  const recent = useRecentMeasurements(30);
  const latestTdee = useLatestTdee();

  const today = todayInTZ();
  const sex = profile.data?.sex;
  // The most recent reading that actually carries a body fat %, scanned
  // client-side out of the list the app already loads — a secondary display
  // reading does not justify a new query.
  const withBodyFat = recent.data?.find((m) => m.body_fat_pct != null) ?? null;

  const data: TdeeCalculatorData = {
    sex: sex === 'male' || sex === 'female' || sex === 'other' ? (sex as TdeeSex) : null,
    ageYears: profile.data?.birth_date
      ? ageYearsFromBirthDate(profile.data.birth_date, today)
      : null,
    heightCm: profile.data?.height_cm ?? null,
    weightKg: latest.data?.weight_kg ?? null,
    bodyFat:
      withBodyFat?.body_fat_pct != null
        ? { pct: withBodyFat.body_fat_pct, measuredOn: withBodyFat.measured_on }
        : null,
    adaptiveTdeeKcal: latestTdee.data?.estimated_tdee_kcal ?? null,
    adaptiveConfidence: tdeeConfidenceBand(latestTdee.data),
  };

  // The shell renders unconditionally, before the queries land: the e2e smoke
  // suite asserts an <h1> on every route, and a loading branch without one
  // would fail it.
  return (
    <PageShell title={t('tdee.title')} back="/more">
      <div className="max-w-2xl">
        <TdeeCalculator data={data} />
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 2: Register the route**

In `src/app/router.tsx`, add the import next to the other page imports (after `import { MorePage } from '@/pages/MorePage';`, line ~28):

```tsx
import { TdeePage } from '@/pages/TdeePage';
```

and the route inside the `{/* Shared */}` block, immediately after the `/more` route (line ~173):

```tsx
            <Route path="/tdee" element={<TdeePage />} />
```

- [ ] **Step 3: Add the More row and its label**

In `src/pages/MorePage.tsx`: extend the lucide import on line 3 to include `Calculator` (keep it alphabetical):

```tsx
import { Apple, Calculator, ChevronRight, LayoutTemplate, Settings, Target } from 'lucide-react';
```

and add a fifth entry to `ROWS`, after `goals` and before `settings`:

```tsx
  { key: 'tdee', route: '/tdee', icon: Calculator, chip: 'bg-accent-soft text-accent-ink' },
```

In `src/i18n/es/nav.json`, add after `"goals": "Objetivos",`:

```json
  "tdee": "Calculadora de TDEE",
```

In `src/i18n/en/nav.json`, in the same position:

```json
  "tdee": "TDEE calculator",
```

- [ ] **Step 4: Update the two existing tests that pin these surfaces**

In `src/pages/MorePage.test.tsx`, extend the rows test (currently at `:39-51`) — rename it and add the new assertion:

```tsx
  it('renders hub rows: Ingredientes, Plantillas, Objetivos, Calculadora de TDEE, Ajustes', () => {
```

and, inside it, next to the existing `getByRole('link', …)` assertions, add:

```tsx
    expect(
      screen.getByRole('link', { name: 'Calculadora de TDEE' }),
    ).toHaveAttribute('href', '/tdee');
```

In `src/app/router.test.tsx`, add a page mock next to the others (the `MorePage` mock is at `:55`):

```tsx
vi.mock('@/pages/TdeePage', () => ({ TdeePage: () => <div>TdeePage</div> }));
```

and a case following the existing per-route pattern (see `:196-199`):

```tsx
  it('renders the TDEE calculator at /tdee', async () => {
    renderAt('/tdee');
    expect(await screen.findByText('TdeePage')).toBeInTheDocument();
  });
```

If the neighbouring cases in that file use a different helper name or a different await style, **copy theirs verbatim** rather than this sketch — read `src/app/router.test.tsx:180-210` first and match it exactly.

- [ ] **Step 5: Add the route to the e2e smoke sweep**

In `e2e/smoke.spec.ts`, add one entry to `ROUTES` after `'/progress/goals',`:

```ts
  '/tdee',
```

- [ ] **Step 6: Run the tests**

```bash
pnpm vitest run src/pages/MorePage.test.tsx src/app/router.test.tsx
pnpm typecheck
```

Expected: PASS on both suites, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/TdeePage.tsx src/app/router.tsx src/app/router.test.tsx \
        src/pages/MorePage.tsx src/pages/MorePage.test.tsx \
        src/i18n/es/nav.json src/i18n/en/nav.json e2e/smoke.spec.ts
git commit -m "feat(tdee): standing calculator route from More (R-37)"
```

---

### Task 4: Frame B — the phase-editor sheet, with apply

**Files:**
- Modify: `src/features/phases/components/PhaseEditorForm.tsx`, `src/features/phases/components/PhasePreview.tsx`, `src/features/phases/components/PhasePreview.test.tsx`, `src/pages/PhaseEditorPage.tsx`

**Interfaces:**
- Consumes: `TdeeCalculator`, `TdeeCalculatorData` (Task 2); `ResponsiveDialog` (`src/components/ui/ResponsiveDialog.tsx`, props `{ open, onOpenChange, title, variant, className?, children }`).
- Produces: `PhaseEditorForm`'s `preview` prop signature becomes
  `preview?: (draft: PhaseDraft, ctx: { openTdeeCalculator: () => void }) => ReactNode`,
  and it gains `tdeeCalculator?: TdeeCalculatorData`. `PhasePreview` gains
  `onOpenTdeeCalculator?: () => void`.

**Why the state lives in the form:** applying must write `kcal_mode` and
`kcal_value` through react-hook-form's `setValue`, which only
`PhaseEditorForm` holds. The preview is rendered by the *page* through a render
prop, so the second trigger reaches the same sheet via a context argument
rather than a second piece of state.

- [ ] **Step 1: Add the optional trigger to the amber notice**

In `src/features/phases/components/PhasePreview.tsx`, add to its `Props`:

```tsx
  /**
   * R-37: an exit from the `needsTdee` dead end. Rendered only inside that
   * amber notice — the other two hints (no weight, incomplete fields) are not
   * things a TDEE estimate fixes.
   */
  onOpenTdeeCalculator?: () => void;
```

Destructure it in the component signature, then extend the amber block (currently `:139-147`) so the button appears only for the `needsTdee` branch. Replace:

```tsx
        {targets == null ? (
          <p
            role="status"
            className="rounded-md bg-amber-soft px-3 py-2 text-xs leading-[1.45] text-amber-ink"
          >
            {hint}
          </p>
```

with:

```tsx
        {targets == null ? (
          <div
            role="status"
            className="space-y-2 rounded-md bg-amber-soft px-3 py-2 text-xs leading-[1.45] text-amber-ink"
          >
            <p>{hint}</p>
            {needsTdee && onOpenTdeeCalculator && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenTdeeCalculator}
                data-testid="phase-preview-open-tdee"
                className="h-8 border-amber-line bg-card text-[12px] text-amber-ink"
              >
                {t('tdee.open')}
              </Button>
            )}
          </div>
```

Add `import { Button } from '@/components/ui/button';` if the file does not already import it, and derive the branch flag next to the existing `hint` computation (`:60-67`):

```tsx
  const needsTdee =
    targets == null && weightKg != null && complete && draft.kcal_mode === 'tdee_delta';
```

- [ ] **Step 2: Cover it in the existing preview test**

Append to `src/features/phases/components/PhasePreview.test.tsx`:

```tsx
  it('offers the TDEE calculator only from the needsTdee dead end', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    // No weight → a different hint, no exit.
    const { unmount } = render(
      <PhasePreview
        draft={draft({ kcal_mode: 'tdee_delta', kcal_value: -300 })}
        weightKg={undefined}
        estimatedTdeeKcal={null}
        onOpenTdeeCalculator={onOpen}
      />,
    );
    expect(screen.queryByTestId('phase-preview-open-tdee')).toBeNull();
    unmount();

    // Delta mode with no estimate → the dead end, with a way out.
    render(
      <PhasePreview
        draft={draft({ kcal_mode: 'tdee_delta', kcal_value: -300 })}
        weightKg={80}
        estimatedTdeeKcal={null}
        onOpenTdeeCalculator={onOpen}
      />,
    );
    await user.click(screen.getByTestId('phase-preview-open-tdee'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
```

Add `vi` to the `vitest` import and `import userEvent from '@testing-library/user-event';` at the top of that file if they are not there yet (`PhaseRow.test.tsx:1-8` shows the idiom). If the file's `draft()` helper does not accept `kcal_mode`/`kcal_value` overrides, it does — it takes `Partial<PhaseDraft>`.

- [ ] **Step 3: Run it, watch it fail, then pass**

```bash
pnpm vitest run src/features/phases/components/PhasePreview.test.tsx
```

Expected before Step 1's edit is complete: FAIL (`Unable to find element by data-testid`). After: PASS.

- [ ] **Step 4: Wire the sheet into the form**

In `src/features/phases/components/PhaseEditorForm.tsx`:

Add imports:

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog';
import {
  TdeeCalculator,
  type TdeeCalculatorData,
} from '@/features/tdee/components/TdeeCalculator';
```

(`useEffect` is already imported on line 1 — extend that line rather than adding a second import of `react`.)

Extend `Props` (`:122-145`):

```tsx
  /**
   * R-37: everything the TDEE calculator needs, read by the PAGE and passed
   * through. The form itself calls no data hook — same division of labour as
   * the preview slot.
   */
  tdeeCalculator?: TdeeCalculatorData;
```

and change the `preview` prop's type to:

```tsx
  preview?: (
    draft: PhaseDraft,
    ctx: { openTdeeCalculator: () => void },
  ) => ReactNode;
```

Destructure `tdeeCalculator` in the component signature (`:147-153`), and add the sheet state right after the `useForm` block:

```tsx
  const [tdeeOpen, setTdeeOpen] = useState(false);
```

Add the apply handler next to `submit` (`:195`):

```tsx
  /**
   * Apply writes BOTH fields, together. In `tdee_delta` mode `kcal_value` is
   * the delta, so dropping a TDEE into it would be plain wrong — and the
   * situation that brings the user here is precisely "no adaptive TDEE, so
   * delta mode is unusable". The button's label names the consequence, so the
   * mode switch is disclosed rather than silent.
   */
  function applyTdee(tdeeKcal: number) {
    setValue('kcal_mode', 'absolute', { shouldDirty: true });
    setValue('kcal_value', String(tdeeKcal), { shouldDirty: true });
    setTdeeOpen(false);
  }
```

Change the preview call (`:249-251`) to pass the context:

```tsx
      {preview && (
        <aside className="md:order-2 md:sticky md:top-4">
          {preview(draft, { openTdeeCalculator: () => setTdeeOpen(true) })}
        </aside>
      )}
```

Add the primary trigger inside the kcal row (`:378-388`), after the `{kcalSuffix}` span — it is present in **both** modes, because `blankForm()` starts a new phase in `absolute` mode, so a first-time user never sees the amber notice and would otherwise never find the tool:

```tsx
              {tdeeCalculator && !notesOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTdeeOpen(true)}
                  data-testid="phase-open-tdee"
                  className="ml-auto h-9"
                >
                  <Calculator className="h-4 w-4" aria-hidden="true" />
                  {t('tdee.open')}
                </Button>
              )}
```

Finally, mount the sheet just before the form's closing `</form>` tag:

```tsx
      {tdeeCalculator && (
        <ResponsiveDialog
          open={tdeeOpen}
          onOpenChange={setTdeeOpen}
          title={t('tdee.title')}
          variant="panel"
        >
          <div className="overflow-y-auto p-4">
            <h2 className="mb-3 text-[15px] font-semibold">{t('tdee.title')}</h2>
            <TdeeCalculator data={tdeeCalculator} onApply={applyTdee} />
          </div>
        </ResponsiveDialog>
      )}
```

(`variant="panel"` hands padding to the caller — hence the wrapping `div`. `ResponsiveDialog`'s `title` is rendered sr-only, so the visible `h2` is the caller's job; it is an `h2`, not an `h1`, because the page already owns the `h1` the e2e suite asserts.)

- [ ] **Step 5: Feed both frames from the page**

In `src/pages/PhaseEditorPage.tsx`, add the imports:

```tsx
import { useProfile } from '@/features/profile/hooks';
import { useLatestMeasurement, useRecentMeasurements } from '@/features/measurements/hooks';
import { tdeeConfidenceBand } from '@/features/tdee/api';
import { ageYearsFromBirthDate } from '@/lib/macros';
import type { TdeeCalculatorData } from '@/features/tdee/components/TdeeCalculator';
import type { TdeeSex } from '@/features/tdee/formulas';
```

(`useLatestMeasurement` is already imported on line 19 — extend that import rather than duplicating it. `isoDate` is already imported and `const today = isoDate();` already exists at `:62`.)

Add the two new queries next to the existing ones (`:54-55`):

```tsx
  const profile = useProfile();
  const recentMeasurements = useRecentMeasurements(30);
```

Build the calculator data after `const today = isoDate();` (`:62`):

```tsx
  // R-37: the calculator sheet's data, read here so `PhaseEditorForm` stays
  // free of data hooks (and so its component test needs no supabase mock).
  const sex = profile.data?.sex;
  const withBodyFat = recentMeasurements.data?.find((m) => m.body_fat_pct != null) ?? null;
  const tdeeCalculator: TdeeCalculatorData = {
    sex: sex === 'male' || sex === 'female' || sex === 'other' ? (sex as TdeeSex) : null,
    ageYears: profile.data?.birth_date
      ? ageYearsFromBirthDate(profile.data.birth_date, today)
      : null,
    heightCm: profile.data?.height_cm ?? null,
    weightKg: latestMeasurement.data?.weight_kg ?? null,
    bodyFat:
      withBodyFat?.body_fat_pct != null
        ? { pct: withBodyFat.body_fat_pct, measuredOn: withBodyFat.measured_on }
        : null,
    adaptiveTdeeKcal: latestTdee.data?.estimated_tdee_kcal ?? null,
    adaptiveConfidence: tdeeConfidenceBand(latestTdee.data),
  };
```

Note: `const today` currently sits **after** the early returns at `:68-78`; keep the new block after it too, and make sure nothing above the early returns references it. If placing it there trips the rules-of-hooks lint (the two new `use*` calls must sit **above** the early returns, alongside the existing queries), move only the `useProfile` / `useRecentMeasurements` calls up to `:54-55` and leave the plain-object construction where it is.

Pass both into the form (`:161-186`) — add the new prop and thread the context through the preview render prop:

```tsx
          tdeeCalculator={notesOnly ? undefined : tdeeCalculator}
          preview={
            notesOnly
              ? undefined
              : (draft, ctx) => (
                  <PhasePreview
                    draft={draft}
                    weightKg={latestMeasurement.data?.weight_kg}
                    bodyFatPct={latestMeasurement.data?.body_fat_pct}
                    estimatedTdeeKcal={latestTdee.data?.estimated_tdee_kcal ?? null}
                    onOpenTdeeCalculator={ctx.openTdeeCalculator}
                  />
                )
          }
```

(A notes-only phase gets neither trigger: its targets are history, and nothing in it is editable.)

- [ ] **Step 6: Typecheck and run the touched suites**

```bash
pnpm typecheck
pnpm vitest run src/features/phases src/pages/ObjetivosPage.phases.test.tsx
```

Expected: no type errors; suites PASS. `src/pages/ObjetivosPage.phases.test.tsx` mounts the heavier page path — if it fails because a newly-called hook is unmocked, add the mock there following the file's existing `vi.mock` style.

- [ ] **Step 7: Commit**

```bash
git add src/features/phases/components/PhaseEditorForm.tsx \
        src/features/phases/components/PhasePreview.tsx \
        src/features/phases/components/PhasePreview.test.tsx \
        src/pages/PhaseEditorPage.tsx
git commit -m "feat(phases): open the TDEE calculator from the kcal field and the delta dead end (R-37)"
```

---

### Task 5: Docs, full verification, browser pass

**Files:**
- Modify: `CLAUDE.md`, `docs/roadmap.md`

- [ ] **Step 1: Update the route count**

In `CLAUDE.md`, in the commands block, change:

```
pnpm test:e2e:local    # Playwright smoke over 11 spine routes — needs a running local stack (R-32)
```

to:

```
pnpm test:e2e:local    # Playwright smoke over 12 spine routes — needs a running local stack (R-32)
```

- [ ] **Step 2: Update the roadmap entry**

In `docs/roadmap.md`, find the `R-37` entry and mark it shipped in the same style the file already uses for shipped items (read two or three neighbouring shipped entries first and copy their exact formatting — do not invent a new convention). Keep it to one line plus, if the file's convention includes it, a pointer to this plan.

- [ ] **Step 3: Run the full gate**

```bash
cd /home/hudson/dev/hudsons-fitness/.claude/worktrees/r37-tdee
pnpm lint && pnpm build && pnpm test
```

All three must pass. `pnpm test` takes roughly two minutes. Do not report success on a partial run — run the whole suite, and paste the real summary line.

- [ ] **Step 4: Real-browser pass (jsdom cannot see CSS)**

Start the dev server and look at both frames at a phone width and a desktop width:

```bash
pnpm dev
```

Check, at 390 px and at 1280 px:
1. `/more` shows the new row with its icon and chip, and it navigates to `/tdee`.
2. `/tdee` renders header, three blocks and the honesty block; the five activity rows do not clip or overflow; editing weight repaints the number as you type.
3. `/progress/goals/phases/new` → the trigger beside the kcal field opens the sheet; the sheet scrolls on mobile (`h-[88vh]`) and docks right on desktop; apply closes it, flips the mode segmented control to fixed kcal and writes the number into the field.
4. Switch the mode to delta on a profile with no adaptive TDEE → the amber notice shows its exit button, and it opens the same sheet.
5. Switch language to English in Settings and re-check `/tdee`: no missing-key strings, the decimal separator follows the language (`2,100` in EN, `2.100` in ES).

- [ ] **Step 5: Run the e2e smoke locally**

This needs the local Supabase stack running (it is already up per the session state; if not, start it from this worktree).

```bash
pnpm test:e2e:local
```

Expected: 12/12 green, including the new `/tdee` route.

- [ ] **Step 6: Commit and check the tree is clean**

```bash
git add CLAUDE.md docs/roadmap.md
git commit -m "docs: record the TDEE calculator route (R-37)"
git status --short   # must print nothing
```

---

## Self-review notes

- **Spec coverage:** standing tool (Task 3) ✓; Mifflin headline + Katch secondary with its measurement date (Tasks 1-2) ✓; one body two frames (Tasks 2-4) ✓; apply sets both `kcal_mode` and `kcal_value` with a consequence-naming label (Task 4) ✓; nothing stored — no migration, no RPC, no new fetcher (whole plan) ✓; edge function's `1.4` seed untouched ✓; three blocks with live recompute (Task 2) ✓; honesty block both ways (Task 2) ✓; hooks called by frames only (Tasks 3-4) ✓; two triggers, one sheet (Task 4) ✓; missing-data handling — withheld result, absent Katch line, absent strip (Tasks 1-2) ✓; Tier-1 with mutation proof, Tier-2 with injected data, e2e route (Tasks 1-3) ✓.
- **Out of scope, deliberately absent:** no change to `recalculate-tdee`, `src/core/tdee.ts` or any `tdee_*` table; no persisted activity level; no other formulas; no goal-weight projection.
- **Known risk:** `src/pages/ObjetivosPage.phases.test.tsx` mounts the phase editor page and may need two more `vi.mock`s once the page calls `useProfile` and `useRecentMeasurements` (Task 4, Step 6 covers it).
