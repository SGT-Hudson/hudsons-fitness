# Muscle Activity Heatmap (F-4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/training/muscles` view that shades a front/back body silhouette (male/female) by per-muscle working-set volume over a chosen window, with a ranked `Muscle · N sets` list.

**Architecture:** New `exercises.secondary_muscles[]` column feeds a pure `core/muscleVolume.ts` (set-count, secondaries at 0.5). A `features/training/muscleMap/` feature fetches sets, aggregates via the core, and renders through a **pluggable body-art skin** (v1 = vendored MIT SVG). Visualization only.

**Tech Stack:** React 18 + Vite + TS, React Query, Supabase/PostgREST, Tailwind, react-i18next, Vitest (+ RTL/jsdom for Tier-2).

**Spec:** `docs/superpowers/specs/2026-05-26-muscle-heatmap-design.md`

---

## File Structure

- `supabase/migrations/20260530120000_f4_secondary_muscles.sql` — column + CHECK + re-tag 34 seeds (create)
- `src/types/database.ts` — add `secondary_muscles` to `exercises` Row/Insert/Update (modify)
- `src/core/muscleVolume.ts` + `.test.ts` — pure volume aggregation (create)
- `src/features/training/muscleMap/skins/types.ts` — skin interface + `MuscleCode` re-export (create)
- `src/features/training/muscleMap/skins/mitSkin/{bodyFront,bodyBack,bodyFemaleFront,bodyFemaleBack}.ts` — vendored SVG data (create)
- `src/features/training/muscleMap/skins/mitSkin/index.ts` — assembles `mitSkin: BodyArtSkin` + `slugToMuscle` (create)
- `src/features/training/muscleMap/skins/mitSkin/LICENSE` — upstream MIT text (create)
- `src/features/training/muscleMap/muscleColor.ts` — intensity→colour scale (create)
- `src/features/training/muscleMap/MuscleBody.tsx` + `.test.tsx` — art-agnostic body renderer (create)
- `src/features/training/muscleMap/api.ts` — windowed set fetch (create)
- `src/features/training/muscleMap/hooks.ts` — `useMuscleVolume(window)` (create)
- `src/features/training/muscleMap/MuscleActivityView.tsx` + `.test.tsx` — toggles + bodies + list (create)
- `src/pages/MuscleActivityPage.tsx` — thin page wrapper (create)
- `src/app/router.tsx` — add `/training/muscles` route (modify)
- `src/pages/EntrenamientoPage.tsx` — header link to the view (modify)
- `src/features/training/exercises/schema.ts` + editor — `secondary_muscles` multi-select (modify)
- `src/i18n/{es,en}/entrenamiento.json` — `muscleMap.*` keys (modify)

---

## Task 1: Migration — `secondary_muscles` column + re-tag seeds

**Files:**
- Create: `supabase/migrations/20260530120000_f4_secondary_muscles.sql`
- Modify: `src/types/database.ts` (exercises Row/Insert/Update)

- [ ] **Step 1: Write the migration**

```sql
-- F-4 — per-exercise secondary movers for the muscle heatmap.
-- App has no production users yet → re-tag the system seed in-place, no backfill.

alter table public.exercises
  add column if not exists secondary_muscles text[] not null default '{}';

alter table public.exercises
  drop constraint if exists exercises_secondary_muscles_valid;
alter table public.exercises
  add constraint exercises_secondary_muscles_valid check (
    secondary_muscles <@ array[
      'chest','back','shoulders','quads','hamstrings','glutes',
      'calves','biceps','triceps','core','forearms'
    ]::text[]
  );

-- Re-tag the 34 system seeds by English name (system rows only).
update public.exercises as e
set secondary_muscles = v.sec
from (values
  ('Back squat',                array['glutes','hamstrings','core']),
  ('Front squat',               array['glutes','core']),
  ('Deadlift',                  array['glutes','hamstrings','quads','forearms','core']),
  ('Romanian deadlift',         array['glutes','back','forearms']),
  ('Barbell hip thrust',        array['hamstrings']),
  ('Bench press',               array['shoulders','triceps']),
  ('Incline bench press',       array['shoulders','triceps']),
  ('Overhead press',            array['triceps','core']),
  ('Barbell row',               array['biceps','forearms','shoulders']),
  ('Dumbbell press',            array['shoulders','triceps']),
  ('Incline dumbbell press',    array['shoulders','triceps']),
  ('Dumbbell row',              array['biceps','forearms']),
  ('Dumbbell curl',             array['forearms']),
  ('Dumbbell triceps extension',array[]::text[]),
  ('Lateral raises',            array[]::text[]),
  ('Front raises',              array[]::text[]),
  ('Dumbbell rear delt fly',    array['back']),
  ('Arnold press',              array['triceps']),
  ('Leg press',                 array['glutes','hamstrings']),
  ('Leg extension',             array[]::text[]),
  ('Leg curl',                  array['calves']),
  ('Chest press machine',       array['shoulders','triceps']),
  ('Seated calf raise',         array[]::text[]),
  ('Lat pulldown',              array['biceps','forearms']),
  ('Cable row',                 array['biceps','forearms']),
  ('Cable triceps pushdown',    array[]::text[]),
  ('Cable biceps curl',         array['forearms']),
  ('Cable rear delt fly',       array['back']),
  ('Cable crunch',              array[]::text[]),
  ('Pull-ups',                  array['biceps','forearms']),
  ('Dips',                      array['triceps','shoulders']),
  ('Plank',                     array['shoulders']),
  ('Kettlebell swing',          array['hamstrings','back','core']),
  ('Goblet squat',              array['glutes','core'])
) as v(name_en, sec)
where e.source = 'system' and e.name_en = v.name_en;

-- ROLLBACK:
--   alter table public.exercises drop constraint if exists exercises_secondary_muscles_valid;
--   alter table public.exercises drop column if exists secondary_muscles;
```

- [ ] **Step 2: Apply to the dev/prod project via Supabase MCP `apply_migration`** (no local stack). Name `f4_secondary_muscles`. Confirm: `select name_en, secondary_muscles from exercises where source='system' order by name_en limit 5;` shows arrays.

- [ ] **Step 3: Update `src/types/database.ts`** — in the `exercises` table block add to Row: `secondary_muscles: string[]`; Insert: `secondary_muscles?: string[]`; Update: `secondary_muscles?: string[]`. (Find the `exercises:` block; mirror the existing `primary_muscle` lines.)

- [ ] **Step 4: Verify** `pnpm typecheck` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260530120000_f4_secondary_muscles.sql src/types/database.ts
git commit -m "feat(f4): exercises.secondary_muscles column + seed re-tag"
```

---

## Task 2: Pure volume core — `core/muscleVolume.ts` (TDD)

**Files:**
- Create: `src/core/muscleVolume.ts`, `src/core/muscleVolume.test.ts`

- [ ] **Step 1: Write the failing test** (`src/core/muscleVolume.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { computeMuscleVolume, SECONDARY_SET_WEIGHT, type SetInput } from './muscleVolume';

const s = (o: Partial<SetInput>): SetInput => ({
  performedOn: '2026-05-20', isWarmup: false,
  primaryMuscle: 'chest', secondaryMuscles: [], ...o,
});

describe('computeMuscleVolume', () => {
  it('primary +1, secondary +0.5 per working set', () => {
    const r = computeMuscleVolume(
      [s({ primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'triceps'] })], null);
    expect(r.byMuscle.chest).toBe(1);
    expect(r.byMuscle.shoulders).toBe(SECONDARY_SET_WEIGHT);
    expect(r.byMuscle.triceps).toBe(0.5);
    expect(r.totalWorkingSets).toBe(1);
    expect(r.maxMuscleValue).toBe(1);
  });

  it('excludes warm-up sets', () => {
    const r = computeMuscleVolume([s({ isWarmup: true })], null);
    expect(r.totalWorkingSets).toBe(0);
    expect(r.byMuscle.chest).toBe(0);
  });

  it('full_body → footnote count, not shaded; its secondaries ignored', () => {
    const r = computeMuscleVolume(
      [s({ primaryMuscle: 'full_body', secondaryMuscles: ['core'] })], null);
    expect(r.fullBodySetCount).toBe(1);
    expect(r.byMuscle.core).toBe(0);
    expect(r.totalWorkingSets).toBe(1);
  });

  it('null primary counts toward total but shades nothing', () => {
    const r = computeMuscleVolume([s({ primaryMuscle: null })], null);
    expect(r.totalWorkingSets).toBe(1);
    expect(r.maxMuscleValue).toBe(0);
  });

  it('windowStart is inclusive; earlier sets dropped', () => {
    const sets = [s({ performedOn: '2026-05-01' }), s({ performedOn: '2026-05-10' })];
    const r = computeMuscleVolume(sets, '2026-05-10');
    expect(r.byMuscle.chest).toBe(1);
  });

  it('all-time (null) keeps everything', () => {
    const r = computeMuscleVolume(
      [s({ performedOn: '2020-01-01' }), s({ performedOn: '2026-05-10' })], null);
    expect(r.byMuscle.chest).toBe(2);
  });

  it('empty input → zeros, max 0', () => {
    const r = computeMuscleVolume([], null);
    expect(r.totalWorkingSets).toBe(0);
    expect(r.maxMuscleValue).toBe(0);
    expect(r.fullBodySetCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run → fails** `pnpm test -- muscleVolume` → FAIL (module not found).

- [ ] **Step 3: Implement** (`src/core/muscleVolume.ts`)

```ts
export const SECONDARY_SET_WEIGHT = 0.5;

export const MUSCLE_CODES = [
  'chest','back','shoulders','quads','hamstrings','glutes',
  'calves','biceps','triceps','core','forearms',
] as const;
export type MuscleCode = (typeof MUSCLE_CODES)[number];

export interface SetInput {
  performedOn: string;
  isWarmup: boolean;
  primaryMuscle: MuscleCode | 'full_body' | null;
  secondaryMuscles: MuscleCode[];
}

export interface MuscleVolume {
  byMuscle: Record<MuscleCode, number>;
  fullBodySetCount: number;
  totalWorkingSets: number;
  maxMuscleValue: number;
}

function emptyByMuscle(): Record<MuscleCode, number> {
  return Object.fromEntries(MUSCLE_CODES.map((m) => [m, 0])) as Record<MuscleCode, number>;
}

export function computeMuscleVolume(
  sets: SetInput[],
  windowStart: string | null,
): MuscleVolume {
  const byMuscle = emptyByMuscle();
  let fullBodySetCount = 0;
  let totalWorkingSets = 0;

  for (const set of sets) {
    if (set.isWarmup) continue;
    if (windowStart !== null && set.performedOn < windowStart) continue;
    totalWorkingSets += 1;

    if (set.primaryMuscle === 'full_body') {
      fullBodySetCount += 1;
      continue;
    }
    if (set.primaryMuscle === null) continue;

    byMuscle[set.primaryMuscle] += 1;
    for (const sec of set.secondaryMuscles) {
      byMuscle[sec] += SECONDARY_SET_WEIGHT;
    }
  }

  const maxMuscleValue = Math.max(0, ...Object.values(byMuscle));
  return { byMuscle, fullBodySetCount, totalWorkingSets, maxMuscleValue };
}
```

- [ ] **Step 4: Run → passes** `pnpm test -- muscleVolume` → PASS.

- [ ] **Step 5: Commit** `git add src/core/muscleVolume.ts src/core/muscleVolume.test.ts && git commit -m "feat(f4): pure muscle-volume aggregation core"`

---

## Task 3: Body-art skin interface + vendored MIT skin

**Files:**
- Create: `src/features/training/muscleMap/skins/types.ts`
- Create: `src/features/training/muscleMap/skins/mitSkin/{bodyFront,bodyBack,bodyFemaleFront,bodyFemaleBack}.ts`
- Create: `src/features/training/muscleMap/skins/mitSkin/index.ts`, `LICENSE`

- [ ] **Step 1: Skin interface** (`skins/types.ts`)

```ts
import type { MuscleCode } from '@/core/muscleVolume';

export type Gender = 'male' | 'female';
export type Side = 'front' | 'back';

export interface BodyPart {
  slug: string;
  paths: string[]; // SVG path 'd' strings
}
export interface BodyArtSkin {
  id: string;
  viewBox(gender: Gender, side: Side): string;
  parts(gender: Gender, side: Side): BodyPart[];
  slugToMuscle: Partial<Record<string, MuscleCode>>;
}
```

- [ ] **Step 2: Vendor + transform the SVG data** (run from worktree root). Pulls the MIT source and rewrites each data file into our `BodyPart[]` shape (`{slug, paths}` instead of `{slug, color, path:{left,right}}`):

```bash
mkdir -p src/features/training/muscleMap/skins/mitSkin
base="https://raw.githubusercontent.com/soroojshehryar/react-muscle-highlighter/main"
node -e '
const https=require("https"),fs=require("fs");
const base=process.env.B||"https://raw.githubusercontent.com/soroojshehryar/react-muscle-highlighter/main";
const files={bodyFront:"assets/bodyFront.ts",bodyBack:"assets/bodyBack.ts",bodyFemaleFront:"assets/bodyFemaleFront.ts",bodyFemaleBack:"assets/bodyFemaleBack.ts"};
const get=u=>new Promise((res,rej)=>https.get(u,r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(d));}).on("error",rej));
(async()=>{
  for(const [name,path] of Object.entries(files)){
    const ts=await get(base+"/"+path);
    // eval the array by stripping import + type annotation
    const body=ts.replace(/^import.*$/m,"").replace(/export const \w+: BodyPart\[\] =/,"return ");
    const arr=Function('"use strict";'+body)();
    const out=arr.map(p=>({slug:p.slug,paths:Object.values(p.path).flat()}));
    fs.writeFileSync("src/features/training/muscleMap/skins/mitSkin/"+name+".ts",
      "import type { BodyPart } from \"../types\";\n\nexport const "+name+": BodyPart[] = "+JSON.stringify(out,null,0)+";\n");
    console.log(name,out.length,"parts");
  }
})();
'
```

- [ ] **Step 3: Write `LICENSE`** — fetch upstream MIT text:

```bash
curl -s "https://raw.githubusercontent.com/HichamELBSI/react-native-body-highlighter/main/LICENSE" \
  -o src/features/training/muscleMap/skins/mitSkin/LICENSE
head -1 src/features/training/muscleMap/skins/mitSkin/LICENSE  # expect "MIT License"
```

- [ ] **Step 4: Assemble the skin** (`skins/mitSkin/index.ts`)

```ts
import type { MuscleCode } from '@/core/muscleVolume';
import type { BodyArtSkin, BodyPart, Gender, Side } from '../types';
import { bodyFront } from './bodyFront';
import { bodyBack } from './bodyBack';
import { bodyFemaleFront } from './bodyFemaleFront';
import { bodyFemaleBack } from './bodyFemaleBack';

// MIT artwork from react-native-body-highlighter (see ./LICENSE).
const slugToMuscle: Partial<Record<string, MuscleCode>> = {
  chest: 'chest', abs: 'core', obliques: 'core', deltoids: 'shoulders',
  biceps: 'biceps', triceps: 'triceps', forearm: 'forearms',
  trapezius: 'back', 'upper-back': 'back', 'lower-back': 'back',
  gluteal: 'glutes', hamstring: 'hamstrings', quadriceps: 'quads',
  adductors: 'quads', calves: 'calves', tibialis: 'calves',
};

function parts(gender: Gender, side: Side): BodyPart[] {
  if (gender === 'female') return side === 'front' ? bodyFemaleFront : bodyFemaleBack;
  return side === 'front' ? bodyFront : bodyBack;
}

export const mitSkin: BodyArtSkin = {
  id: 'mit',
  viewBox: (_g, side) => (side === 'front' ? '0 0 724 1448' : '724 0 724 1448'),
  parts,
  slugToMuscle,
};

export const ACTIVE_SKIN: BodyArtSkin = mitSkin;
```

- [ ] **Step 5: Verify** `pnpm typecheck` → 0; `pnpm lint` → 0 errors (the generated data files are large but valid; if eslint complains about line length on the JSON, add `/* eslint-disable */` at the top of each `body*.ts` in Step 2's writeFileSync prefix).

- [ ] **Step 6: Commit** `git add src/features/training/muscleMap/skins && git commit -m "feat(f4): pluggable body-art skin + vendored MIT artwork"`

---

## Task 4: Colour scale + `MuscleBody` component

**Files:**
- Create: `src/features/training/muscleMap/muscleColor.ts`
- Create: `src/features/training/muscleMap/MuscleBody.tsx`, `MuscleBody.test.tsx`

- [ ] **Step 1: Colour helper** (`muscleColor.ts`)

```ts
function lerp(a: number, b: number, t: number) { return Math.round(a + (b - a) * t); }

/** value 0..max → grey→amber→red. Zero/no-data returns the neutral. */
export function muscleColor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return '#e5e7eb';
  const t = Math.min(1, value / max);
  if (t < 0.5) {
    const k = t / 0.5;
    return `rgb(${lerp(229, 253, k)},${lerp(231, 186, k)},${lerp(235, 116, k)})`;
  }
  const k = (t - 0.5) / 0.5;
  return `rgb(${lerp(253, 220, k)},${lerp(186, 38, k)},${lerp(116, 38, k)})`;
}

export const NEUTRAL_PART = '#e3e5e9';
```

- [ ] **Step 2: Failing test** (`MuscleBody.test.tsx`) — uses a tiny mock skin, asserts the hot muscle gets a red-ish fill and a cold one the neutral.

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MuscleBody } from './MuscleBody';

vi.mock('./skins/mitSkin', () => ({
  ACTIVE_SKIN: {
    id: 'test',
    viewBox: () => '0 0 10 10',
    parts: () => [
      { slug: 'chest', paths: ['M0 0h1v1h-1z'] },
      { slug: 'calves', paths: ['M2 2h1v1h-1z'] },
      { slug: 'head', paths: ['M4 4h1v1h-1z'] },
    ],
    slugToMuscle: { chest: 'chest', calves: 'calves' },
  },
}));

describe('MuscleBody', () => {
  it('shades by intensity; non-muscle parts use neutral', () => {
    const { container } = render(
      <MuscleBody
        intensityByMuscle={{ chest: 10, calves: 0 } as never}
        max={10}
        gender="male"
        side="front"
      />,
    );
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(3);
    // chest (max) → red-dominant
    expect(paths[0].getAttribute('fill')).toMatch(/rgb\(2\d\d,3\d,3\d\)/);
    // head (unmapped) → neutral part colour
    expect(paths[2].getAttribute('fill')).toBe('#e3e5e9');
  });
});
```

- [ ] **Step 3: Run → fails** `pnpm test -- MuscleBody` → FAIL.

- [ ] **Step 4: Implement** (`MuscleBody.tsx`)

```tsx
import type { MuscleCode } from '@/core/muscleVolume';
import { ACTIVE_SKIN } from './skins/mitSkin';
import type { Gender, Side } from './skins/types';
import { muscleColor, NEUTRAL_PART } from './muscleColor';

interface Props {
  intensityByMuscle: Record<MuscleCode, number>;
  max: number;
  gender: Gender;
  side: Side;
}

export function MuscleBody({ intensityByMuscle, max, gender, side }: Props) {
  const skin = ACTIVE_SKIN;
  return (
    <svg
      viewBox={skin.viewBox(gender, side)}
      className="h-72 w-auto"
      role="img"
      aria-label={`body-${gender}-${side}`}
    >
      {skin.parts(gender, side).map((part, pi) => {
        const muscle = skin.slugToMuscle[part.slug];
        const fill = muscle ? muscleColor(intensityByMuscle[muscle] ?? 0, max) : NEUTRAL_PART;
        return part.paths.map((d, di) => (
          <path key={`${pi}-${di}`} d={d} fill={fill} stroke="#ffffff" strokeWidth={0.6} />
        ));
      })}
    </svg>
  );
}
```

- [ ] **Step 5: Run → passes** `pnpm test -- MuscleBody` → PASS.

- [ ] **Step 6: Commit** `git add src/features/training/muscleMap/muscleColor.ts src/features/training/muscleMap/MuscleBody.tsx src/features/training/muscleMap/MuscleBody.test.tsx && git commit -m "feat(f4): MuscleBody renderer + intensity colour scale"`

---

## Task 5: Data fetch + `useMuscleVolume` hook

**Files:**
- Create: `src/features/training/muscleMap/api.ts`, `hooks.ts`

- [ ] **Step 1: Window math + types** (`hooks.ts` first half) — windows and cutoff via `todayInTZ()`.

```ts
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { todayInTZ } from '@/lib/dates';
import { computeMuscleVolume, type MuscleVolume } from '@/core/muscleVolume';
import { fetchWorkoutSetsForVolume } from './api';

export type MuscleWindow = '7d' | '30d' | '6mo' | 'all';

/** Inclusive lower bound ISO date for a window, or null for all-time. */
export function windowStartFor(win: MuscleWindow, today = todayInTZ()): string | null {
  if (win === 'all') return null;
  const d = new Date(today + 'T00:00:00Z');
  if (win === '7d') d.setUTCDate(d.getUTCDate() - 6); // inclusive 7-day span
  else if (win === '30d') d.setUTCDate(d.getUTCDate() - 29);
  else d.setUTCMonth(d.getUTCMonth() - 6);
  return d.toISOString().slice(0, 10);
}

export function useMuscleVolume(win: MuscleWindow) {
  const { user } = useAuth();
  const start = windowStartFor(win);
  return useQuery<MuscleVolume>({
    queryKey: ['muscle-volume', user?.id, win],
    enabled: !!user,
    queryFn: async () => {
      const sets = await fetchWorkoutSetsForVolume(start);
      return computeMuscleVolume(sets, start);
    },
  });
}
```

- [ ] **Step 2: Add a `windowStartFor` unit test** (`hooks.test.ts`, Tier-1, mock supabase + auth not needed since pure export imported directly — but the file imports supabase transitively via api; mock it):

```ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));
import { windowStartFor } from './hooks';

describe('windowStartFor', () => {
  it('7d is an inclusive 7-day span', () => {
    expect(windowStartFor('7d', '2026-05-26')).toBe('2026-05-20');
  });
  it('30d inclusive', () => {
    expect(windowStartFor('30d', '2026-05-26')).toBe('2026-04-27');
  });
  it('6mo subtracts 6 months', () => {
    expect(windowStartFor('6mo', '2026-05-26')).toBe('2025-11-26');
  });
  it('all → null', () => {
    expect(windowStartFor('all', '2026-05-26')).toBeNull();
  });
});
```

- [ ] **Step 3: Implement `api.ts`** — fetch sets joined to session (window) + exercise muscles, map to `SetInput[]`.

```ts
import { supabase } from '@/lib/supabase';
import type { MuscleCode, SetInput } from '@/core/muscleVolume';

interface Row {
  is_warmup: boolean;
  session: { performed_on: string } | null;
  exercise: { primary_muscle: string | null; secondary_muscles: string[] } | null;
}

export async function fetchWorkoutSetsForVolume(windowStart: string | null): Promise<SetInput[]> {
  let q = supabase
    .from('workout_sets')
    .select(
      'is_warmup, session:workout_sessions!inner(performed_on, user_id), ' +
        'exercise:exercises!inner(primary_muscle, secondary_muscles)',
    );
  if (windowStart !== null) q = q.gte('session.performed_on', windowStart);

  const { data, error } = await q;
  if (error) throw error;

  return ((data as unknown as Row[]) ?? []).map((r) => ({
    performedOn: r.session?.performed_on ?? '',
    isWarmup: r.is_warmup,
    primaryMuscle: (r.exercise?.primary_muscle ?? null) as SetInput['primaryMuscle'],
    secondaryMuscles: (r.exercise?.secondary_muscles ?? []) as MuscleCode[],
  }));
}
```

> ⚠ **Verify this PostgREST select + the embedded `gte('session.performed_on', …)` filter against the real DB** before merge (no integration tests for select strings — memory `need-integration-and-e2e-guard`). RLS already scopes `workout_sessions` to the user; the `!inner` join keeps only the user's sets.

- [ ] **Step 4: Run** `pnpm test -- muscleMap/hooks` → PASS; `pnpm typecheck` → 0.

- [ ] **Step 5: Commit** `git add src/features/training/muscleMap/api.ts src/features/training/muscleMap/hooks.ts src/features/training/muscleMap/hooks.test.ts && git commit -m "feat(f4): windowed set fetch + useMuscleVolume hook"`

---

## Task 6: `MuscleActivityView` (toggles + bodies + list)

**Files:**
- Create: `src/features/training/muscleMap/MuscleActivityView.tsx`, `MuscleActivityView.test.tsx`

- [ ] **Step 1: Implement the view** (default gender from `profiles.sex`, window default 30d, ranked list, footnote, empty state).

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { MUSCLE_CODES, type MuscleCode } from '@/core/muscleVolume';
import { useProfile } from '@/features/profile/hooks';
import { MuscleBody } from './MuscleBody';
import { muscleColor } from './muscleColor';
import { useMuscleVolume, type MuscleWindow } from './hooks';
import type { Gender } from './skins/types';

const WINDOWS: MuscleWindow[] = ['7d', '30d', '6mo', 'all'];

export function MuscleActivityView() {
  const { t } = useTranslation('entrenamiento');
  const { data: profile } = useProfile();
  const [win, setWin] = useState<MuscleWindow>('30d');
  const [gender, setGender] = useState<Gender>(profile?.sex === 'female' ? 'female' : 'male');
  const vol = useMuscleVolume(win);

  const byMuscle = vol.data?.byMuscle ?? (Object.fromEntries(MUSCLE_CODES.map((m) => [m, 0])) as Record<MuscleCode, number>);
  const max = vol.data?.maxMuscleValue ?? 0;
  const ranked = [...MUSCLE_CODES].map((m) => [m, byMuscle[m]] as const).sort((a, b) => b[1] - a[1]);
  const empty = (vol.data?.totalWorkingSets ?? 0) === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label={t('muscleMap.window.label')} className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
          {WINDOWS.map((w) => (
            <button key={w} type="button" role="radio" aria-checked={win === w} onClick={() => setWin(w)}
              className={cn('px-2.5 py-1 rounded-sm transition-colors', win === w ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {t(`muscleMap.window.${w}`)}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label={t('muscleMap.gender.label')} className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
          {(['male', 'female'] as Gender[]).map((g) => (
            <button key={g} type="button" role="radio" aria-checked={gender === g} onClick={() => setGender(g)}
              className={cn('px-2.5 py-1 rounded-sm transition-colors', gender === g ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {t(`muscleMap.gender.${g}`)}
            </button>
          ))}
        </div>
      </div>

      {empty ? (
        <p className="text-sm text-muted-foreground">{t('muscleMap.empty')}</p>
      ) : (
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex gap-2">
            <MuscleBody intensityByMuscle={byMuscle} max={max} gender={gender} side="front" />
            <MuscleBody intensityByMuscle={byMuscle} max={max} gender={gender} side="back" />
          </div>
          <div className="min-w-[200px] flex-1">
            <ul className="text-sm">
              {ranked.map(([m, v]) => (
                <li key={m} className="flex items-center gap-2 py-1">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: muscleColor(v, max) }} />
                  <span className="flex-1">{t(`primaryMuscle.${m}`)}</span>
                  <strong>{Number.isInteger(v) ? v : v.toFixed(1)}</strong>
                  <span className="text-muted-foreground">{t('muscleMap.setsUnit')}</span>
                </li>
              ))}
            </ul>
            {(vol.data?.fullBodySetCount ?? 0) > 0 && (
              <p className="mt-3 border-t border-dashed border-border pt-2 text-xs text-muted-foreground">
                {t('muscleMap.fullBodyFootnote', { count: vol.data!.fullBodySetCount })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Tier-2 test** (`MuscleActivityView.test.tsx`) — mock the data hook + profile + i18n; assert ranked list renders and footnote shows.

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string, o?: { count?: number }) => (o?.count != null ? `${k}:${o.count}` : k) }) }));
vi.mock('@/features/profile/hooks', () => ({ useProfile: () => ({ data: { sex: 'female' } }) }));
vi.mock('./MuscleBody', () => ({ MuscleBody: () => <svg data-testid="body" /> }));
vi.mock('./hooks', () => ({
  useMuscleVolume: () => ({
    data: { byMuscle: { chest: 7, back: 3, shoulders: 0, quads: 0, hamstrings: 0, glutes: 0, calves: 0, biceps: 0, triceps: 0, core: 0, forearms: 0 }, maxMuscleValue: 7, totalWorkingSets: 10, fullBodySetCount: 2 },
  }),
}));
import { MuscleActivityView } from './MuscleActivityView';

describe('MuscleActivityView', () => {
  it('renders two bodies, ranked list and footnote', () => {
    render(<MuscleActivityView />);
    expect(screen.getAllByTestId('body')).toHaveLength(2);
    expect(screen.getByText('primaryMuscle.chest')).toBeInTheDocument();
    expect(screen.getByText('muscleMap.fullBodyFootnote:2')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run** `pnpm test -- MuscleActivityView` → PASS.

- [ ] **Step 4: Commit** `git add src/features/training/muscleMap/MuscleActivityView.tsx src/features/training/muscleMap/MuscleActivityView.test.tsx && git commit -m "feat(f4): muscle activity view (toggles, bodies, ranked list)"`

---

## Task 7: Page, route, training-home link, i18n

**Files:**
- Create: `src/pages/MuscleActivityPage.tsx`
- Modify: `src/app/router.tsx`, `src/pages/EntrenamientoPage.tsx`, `src/i18n/{es,en}/entrenamiento.json`

- [ ] **Step 1: Page wrapper** (`MuscleActivityPage.tsx`)

```tsx
import { useTranslation } from 'react-i18next';
import { MuscleActivityView } from '@/features/training/muscleMap/MuscleActivityView';

export function MuscleActivityPage() {
  const { t } = useTranslation('entrenamiento');
  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="mb-4 text-xl font-semibold">{t('muscleMap.title')}</h1>
      <MuscleActivityView />
    </div>
  );
}
```

- [ ] **Step 2: Route** — in `src/app/router.tsx`, import and add under the Entreno block (after line 114):

```tsx
import { MuscleActivityPage } from '@/pages/MuscleActivityPage';
// ...
<Route path="/training/muscles" element={<MuscleActivityPage />} />
```

- [ ] **Step 3: Link from training home** — in `EntrenamientoPage.tsx`, add a `<Link to="/training/muscles">` button near the header (mirror the existing `Link`/`Button` usage already imported there). Example:

```tsx
<Button asChild variant="outline" size="sm">
  <Link to="/training/muscles">{t('muscleMap.title')}</Link>
</Button>
```

- [ ] **Step 4: i18n** — add to BOTH `src/i18n/es/entrenamiento.json` and `src/i18n/en/entrenamiento.json` a sibling `muscleMap` block:

```jsonc
// en
"muscleMap": {
  "title": "Muscle activity",
  "window": { "label": "Time window", "7d": "7d", "30d": "30d", "6mo": "6 mo", "all": "All time" },
  "gender": { "label": "Body model", "male": "Male", "female": "Female" },
  "setsUnit": "sets",
  "fullBodyFootnote": "+ {{count}} full-body sets not shown on the map",
  "empty": "No sets logged in this window."
}
// es
"muscleMap": {
  "title": "Actividad muscular",
  "window": { "label": "Periodo", "7d": "7d", "30d": "30d", "6mo": "6 m", "all": "Todo" },
  "gender": { "label": "Modelo", "male": "Hombre", "female": "Mujer" },
  "setsUnit": "series",
  "fullBodyFootnote": "+ {{count}} series de cuerpo completo no mostradas en el mapa",
  "empty": "No hay series registradas en este periodo."
}
```

- [ ] **Step 5: Verify** `pnpm typecheck` + `pnpm lint` → clean. Manual: `pnpm dev`, log in, visit `/training`, click the link, toggle windows/gender.

- [ ] **Step 6: Commit** `git add src/pages/MuscleActivityPage.tsx src/app/router.tsx src/pages/EntrenamientoPage.tsx src/i18n && git commit -m "feat(f4): /training/muscles route, link and i18n"`

---

## Task 8: Exercise editor — `secondary_muscles` multi-select

**Files:**
- Modify: `src/features/training/exercises/schema.ts`, the exercise editor component, `src/features/training/exercises/api.ts` (`ExerciseCreateInput` + `createExercise` payload)

- [ ] **Step 1:** Add `secondary_muscles: z.array(z.enum([...11 codes])).default([])` to the exercise schema; add `secondary_muscles: MuscleCode[]` to `ExerciseCreateInput` and include it in the `createExercise` insert payload.

- [ ] **Step 2:** In the editor, add a checkbox/toggle group of the 11 muscle codes (exclude `full_body`), labelled via `primaryMuscle.<code>`, bound to the field. Exclude the currently-selected `primary_muscle` from the options (or just allow it; simplest: show all 11).

- [ ] **Step 3:** Verify `pnpm typecheck` + `pnpm test` (exercise schema test, if present, still green).

- [ ] **Step 4: Commit** `git commit -am "feat(f4): secondary-muscle picker in exercise editor"`

---

## Task 9: Full verification

- [ ] **Step 1:** `pnpm lint` → 0 errors.
- [ ] **Step 2:** `pnpm build` → succeeds.
- [ ] **Step 3:** `pnpm test` → all green (note Tier-1 + Tier-2 counts increased).
- [ ] **Step 4:** `git status` clean.
- [ ] **Step 5:** Push branch + open PR into `develop` (do NOT arm auto-merge until the user has reviewed — memory `develop-ci-gate`):

```bash
git push -u origin claude/f4-muscle-heatmap
gh pr create --base develop --head claude/f4-muscle-heatmap \
  --title "feat: muscle activity heatmap (F-4)" \
  --body "Implements F-4 per docs/superpowers/specs/2026-05-26-muscle-heatmap-design.md."
```

---

## Self-Review notes
- **Spec coverage:** §3 → T1+T8; §4 → T2; §5.1 → T5; §5.2 → T4; §5.3 → T6; §5.4 → T7; §6 skin → T3; §7 i18n → T7; §8 tests → T2/T4/T5/T6. All covered.
- **Types consistent:** `MuscleCode`, `SetInput`, `MuscleVolume`, `BodyArtSkin`, `BodyPart`, `Gender`, `Side`, `MuscleWindow` defined once and reused.
- **Open verification (not a placeholder):** the PostgREST select in T5-S3 and the migration apply in T1-S2 touch the real DB — both flagged for live verification, consistent with the no-integration-test gap.
