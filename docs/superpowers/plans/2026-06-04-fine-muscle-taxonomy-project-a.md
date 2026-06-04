# Fine Muscle Taxonomy (Project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the coarse-12 muscle model with a fine 22-muscle taxonomy (+ `full_body`), give exercises multiple primary movers, and ship a finer heatmap + a clear primary/secondary tagging control — re-tagging the 34 system exercises in place.

**Architecture:** A single canonical TS module (`src/core/muscles.ts`) is the runtime source of the muscle structure (code → group, body-region slug, order); the DB `muscles` table mirrors it for a referential-integrity trigger, and an anti-drift test keeps them in sync. The pure core emits volume per fine code; the render layer sums fine codes up to the current MIT art's regions (co-shading where the art is coarser). The tagging control is one grouped tri-state pill list (neutral → primary → secondary → remove).

**Tech Stack:** React 18 + Vite + TS, react-hook-form + zod, TanStack Query, Supabase/PostgREST, i18next, Vitest (Tier-1/2), pgTAP (Tier-3).

---

## Pre-flight (read before Task 1)

- **Branch off `develop`, not this worktree's stale base.** This worktree (`worktree-exercise-catalog-expansion`) branched before R-16 landed, so its `supabase/tests/` pgTAP suite and the `db-test` CI job are absent here. Start implementation on a fresh `claude/fine-muscle-taxonomy` branch cut from `develop` (which has both). Copy this plan + the spec across if needed.
- **Spec:** `docs/superpowers/specs/2026-06-04-exercise-catalog-expansion-design.md`. This plan implements Project A (§1–§7) only. Project B (bulk catalog) is a separate, later spec.
- **The 34 system exercises** are seeded in `supabase/migrations/20260522120000_training_exercises.sql` and coarse-tagged for secondaries in `20260530120000_f4_secondary_muscles.sql`. We re-tag in place (no prod users — [[app-not-in-production-yet]]).
- **Mid-sequence the repo build will be red** while the `MuscleCode` / `PrimaryMuscle` type widening ripples through consumers (Tasks 2, 6–9). That's expected; the ship-flow gate (`lint`+`build`+`test`) only needs to pass at the end (Task 15), not per-commit. Each task still commits.
- **Local DB for migration + types + pgTAP:** `supabase start` (local stack), `supabase migration up` to apply, `supabase test db` for pgTAP, `supabase gen types typescript --local` for types. Per the repo convention the training migrations are authored but applied locally/CI — never against a remote from a PR.

---

## The canonical fine taxonomy (reference for all tasks)

22 shadeable codes + `full_body`, in 6 groups. `bodyRegionSlug` = the current MIT skin region the code shades (several codes share one region → co-shade).

| order | code | group | bodyRegionSlug |
|---|---|---|---|
| 1 | `delt_front` | shoulders | `deltoids` |
| 2 | `delt_side` | shoulders | `deltoids` |
| 3 | `delt_rear` | shoulders | `deltoids` |
| 4 | `pec_upper` | chest | `chest` |
| 5 | `pec_lower` | chest | `chest` |
| 6 | `lat` | back | `upper-back` |
| 7 | `trap` | back | `trapezius` |
| 8 | `rhomboids` | back | `upper-back` |
| 9 | `lower_back` | back | `lower-back` |
| 10 | `biceps` | arms | `biceps` |
| 11 | `tri_long` | arms | `triceps` |
| 12 | `tri_lateral` | arms | `triceps` |
| 13 | `forearms` | arms | `forearm` |
| 14 | `abs_upper` | core | `abs` |
| 15 | `abs_lower` | core | `abs` |
| 16 | `obliques` | core | `obliques` |
| 17 | `quads` | legs | `quadriceps` |
| 18 | `hamstrings` | legs | `hamstring` |
| 19 | `glutes` | legs | `gluteal` |
| 20 | `adductors` | legs | `adductors` |
| 21 | `calves` | legs | `calves` |
| 22 | `tibialis` | legs | `tibialis` |
| — | `full_body` | (special) | null |

`full_body` is **not** a member of `MUSCLE_CODES` (the shadeable set) — it is handled specially exactly as today: a set whose primary is `full_body` is counted in `fullBodySetCount` and never shades. It is primary-only (never a secondary).

---

## Task 1: Canonical muscle structure module + anti-drift test

**Files:**
- Create: `src/core/muscles.ts`
- Test: `src/core/muscles.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/muscles.test.ts
import { describe, expect, it } from 'vitest';
import {
  MUSCLES,
  MUSCLE_CODES,
  MUSCLE_GROUPS,
  bodyRegionSlugForCode,
  codesForBodyRegion,
} from './muscles';

const EXPECTED_FINE = [
  'delt_front','delt_side','delt_rear','pec_upper','pec_lower','lat','trap',
  'rhomboids','lower_back','biceps','tri_long','tri_lateral','forearms',
  'abs_upper','abs_lower','obliques','quads','hamstrings','glutes','adductors',
  'calves','tibialis',
];

describe('muscles taxonomy', () => {
  it('MUSCLE_CODES is exactly the 22 shadeable fine codes (no full_body)', () => {
    expect([...MUSCLE_CODES].sort()).toEqual([...EXPECTED_FINE].sort());
    expect(MUSCLE_CODES).not.toContain('full_body');
  });

  it('MUSCLES includes full_body, flagged and with no region', () => {
    const fb = MUSCLES.find((m) => m.code === 'full_body');
    expect(fb?.isFullBody).toBe(true);
    expect(fb?.bodyRegionSlug).toBeNull();
  });

  it('MUSCLE_GROUPS are the six taggable groups in display order', () => {
    expect(MUSCLE_GROUPS).toEqual(['shoulders', 'chest', 'back', 'arms', 'core', 'legs']);
  });

  it('every shadeable code maps to a region slug', () => {
    for (const c of MUSCLE_CODES) expect(bodyRegionSlugForCode(c)).toBeTruthy();
  });

  it('codesForBodyRegion inverts the map (3 delts share deltoids)', () => {
    expect([...codesForBodyRegion('deltoids')].sort()).toEqual(
      ['delt_front', 'delt_rear', 'delt_side'],
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/muscles.test.ts`
Expected: FAIL — cannot find module `./muscles`.

- [ ] **Step 3: Write the module**

```ts
// src/core/muscles.ts
//
// Canonical structural definition of the fine muscle taxonomy (Project A).
// This is the RUNTIME source of truth in the client; the DB `muscles` table
// mirrors it for the referential-integrity trigger, and muscles.test.ts +
// the Tier-3 pgTAP suite assert the two never drift.

export type MuscleGroup = 'shoulders' | 'chest' | 'back' | 'arms' | 'core' | 'legs';

export interface MuscleDef {
  code: string;
  group: MuscleGroup | 'full_body';
  /** Current MIT skin region this code shades; null for full_body. */
  bodyRegionSlug: string | null;
  displayOrder: number;
  isFullBody: boolean;
}

export const MUSCLES: readonly MuscleDef[] = [
  { code: 'delt_front',  group: 'shoulders', bodyRegionSlug: 'deltoids',   displayOrder: 1,  isFullBody: false },
  { code: 'delt_side',   group: 'shoulders', bodyRegionSlug: 'deltoids',   displayOrder: 2,  isFullBody: false },
  { code: 'delt_rear',   group: 'shoulders', bodyRegionSlug: 'deltoids',   displayOrder: 3,  isFullBody: false },
  { code: 'pec_upper',   group: 'chest',     bodyRegionSlug: 'chest',      displayOrder: 4,  isFullBody: false },
  { code: 'pec_lower',   group: 'chest',     bodyRegionSlug: 'chest',      displayOrder: 5,  isFullBody: false },
  { code: 'lat',         group: 'back',      bodyRegionSlug: 'upper-back', displayOrder: 6,  isFullBody: false },
  { code: 'trap',        group: 'back',      bodyRegionSlug: 'trapezius',  displayOrder: 7,  isFullBody: false },
  { code: 'rhomboids',   group: 'back',      bodyRegionSlug: 'upper-back', displayOrder: 8,  isFullBody: false },
  { code: 'lower_back',  group: 'back',      bodyRegionSlug: 'lower-back', displayOrder: 9,  isFullBody: false },
  { code: 'biceps',      group: 'arms',      bodyRegionSlug: 'biceps',     displayOrder: 10, isFullBody: false },
  { code: 'tri_long',    group: 'arms',      bodyRegionSlug: 'triceps',    displayOrder: 11, isFullBody: false },
  { code: 'tri_lateral', group: 'arms',      bodyRegionSlug: 'triceps',    displayOrder: 12, isFullBody: false },
  { code: 'forearms',    group: 'arms',      bodyRegionSlug: 'forearm',    displayOrder: 13, isFullBody: false },
  { code: 'abs_upper',   group: 'core',      bodyRegionSlug: 'abs',        displayOrder: 14, isFullBody: false },
  { code: 'abs_lower',   group: 'core',      bodyRegionSlug: 'abs',        displayOrder: 15, isFullBody: false },
  { code: 'obliques',    group: 'core',      bodyRegionSlug: 'obliques',   displayOrder: 16, isFullBody: false },
  { code: 'quads',       group: 'legs',      bodyRegionSlug: 'quadriceps', displayOrder: 17, isFullBody: false },
  { code: 'hamstrings',  group: 'legs',      bodyRegionSlug: 'hamstring',  displayOrder: 18, isFullBody: false },
  { code: 'glutes',      group: 'legs',      bodyRegionSlug: 'gluteal',    displayOrder: 19, isFullBody: false },
  { code: 'adductors',   group: 'legs',      bodyRegionSlug: 'adductors',  displayOrder: 20, isFullBody: false },
  { code: 'calves',      group: 'legs',      bodyRegionSlug: 'calves',     displayOrder: 21, isFullBody: false },
  { code: 'tibialis',    group: 'legs',      bodyRegionSlug: 'tibialis',   displayOrder: 22, isFullBody: false },
  { code: 'full_body',   group: 'full_body', bodyRegionSlug: null,         displayOrder: 99, isFullBody: true },
];

/** The 22 shadeable fine codes (excludes full_body). */
export const MUSCLE_CODES = MUSCLES.filter((m) => !m.isFullBody).map((m) => m.code) as readonly string[];

/** The six taggable groups, in display order. */
export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  'shoulders', 'chest', 'back', 'arms', 'core', 'legs',
];

const SLUG_BY_CODE = new Map(MUSCLES.map((m) => [m.code, m.bodyRegionSlug]));

export function bodyRegionSlugForCode(code: string): string | null {
  return SLUG_BY_CODE.get(code) ?? null;
}

/** All shadeable fine codes whose art region is `slug` (inverts the map). */
export function codesForBodyRegion(slug: string): string[] {
  return MUSCLES.filter((m) => !m.isFullBody && m.bodyRegionSlug === slug).map((m) => m.code);
}

/** Codes of a group, in display order — used to render the grouped tagging UI. */
export function codesInGroup(group: MuscleGroup): string[] {
  return MUSCLES.filter((m) => m.group === group)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((m) => m.code);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/core/muscles.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/muscles.ts src/core/muscles.test.ts
git commit -m "feat(muscles): canonical fine muscle taxonomy module"
```

---

## Task 2: Fine + multi-primary heatmap engine

**Files:**
- Modify: `src/core/muscleVolume.ts`
- Test: `src/core/muscleVolume.test.ts`

- [ ] **Step 1: Update the test for the new shape**

Replace `src/core/muscleVolume.test.ts` contents with:

```ts
import { describe, expect, it } from 'vitest';
import { computeMuscleVolume, SECONDARY_SET_WEIGHT, type SetInput } from './muscleVolume';

const s = (o: Partial<SetInput>): SetInput => ({
  performedOn: '2026-05-20',
  isWarmup: false,
  primaryMuscles: ['pec_lower'],
  secondaryMuscles: [],
  ...o,
});

describe('computeMuscleVolume (fine codes)', () => {
  it('each primary +1, each secondary +0.5 per working set', () => {
    const r = computeMuscleVolume(
      [s({ primaryMuscles: ['pec_lower'], secondaryMuscles: ['delt_front', 'tri_lateral'] })],
      null,
    );
    expect(r.byMuscle.pec_lower).toBe(1);
    expect(r.byMuscle.delt_front).toBe(SECONDARY_SET_WEIGHT);
    expect(r.byMuscle.tri_lateral).toBe(0.5);
    expect(r.totalWorkingSets).toBe(1);
    expect(r.maxMuscleValue).toBe(1);
  });

  it('multiple primaries each earn 1.0 (does not conserve sets)', () => {
    const r = computeMuscleVolume(
      [s({ primaryMuscles: ['lower_back', 'glutes'], secondaryMuscles: ['hamstrings'] })],
      null,
    );
    expect(r.byMuscle.lower_back).toBe(1);
    expect(r.byMuscle.glutes).toBe(1);
    expect(r.byMuscle.hamstrings).toBe(0.5);
    expect(r.totalWorkingSets).toBe(1);
  });

  it('excludes warm-up sets', () => {
    const r = computeMuscleVolume([s({ isWarmup: true })], null);
    expect(r.totalWorkingSets).toBe(0);
    expect(r.byMuscle.pec_lower).toBe(0);
  });

  it('full_body → footnote count, not shaded; its secondaries ignored', () => {
    const r = computeMuscleVolume(
      [s({ primaryMuscles: ['full_body'], secondaryMuscles: ['abs_upper'] })],
      null,
    );
    expect(r.fullBodySetCount).toBe(1);
    expect(r.byMuscle.abs_upper).toBe(0);
    expect(r.totalWorkingSets).toBe(1);
  });

  it('empty primaries array contributes nothing but still counts as a working set', () => {
    const r = computeMuscleVolume([s({ primaryMuscles: [], secondaryMuscles: [] })], null);
    expect(r.totalWorkingSets).toBe(1);
    expect(r.maxMuscleValue).toBe(0);
  });

  it('respects the inclusive window lower bound', () => {
    const r = computeMuscleVolume(
      [s({ performedOn: '2026-05-01' }), s({ performedOn: '2026-05-20' })],
      '2026-05-10',
    );
    expect(r.totalWorkingSets).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/core/muscleVolume.test.ts`
Expected: FAIL — `primaryMuscles` not assignable / `byMuscle.pec_lower` undefined.

- [ ] **Step 3: Rewrite `muscleVolume.ts`**

```ts
// src/core/muscleVolume.ts
import { MUSCLE_CODES } from './muscles';

export const SECONDARY_SET_WEIGHT = 0.5;

export { MUSCLE_CODES };
export type MuscleCode = (typeof MUSCLE_CODES)[number];

export interface SetInput {
  performedOn: string;
  isWarmup: boolean;
  /** Fine primary movers; `['full_body']` marks a footnoted whole-body set. */
  primaryMuscles: (MuscleCode | 'full_body')[];
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

const SHADEABLE = new Set<string>(MUSCLE_CODES);

/**
 * Aggregate working-set volume per fine muscle. Each primary mover earns 1.0,
 * each secondary earns SECONDARY_SET_WEIGHT — multiple primaries each earn 1.0
 * (stimulus is not conserved across a set; this is an activity map, not a set
 * count). Warm-ups are excluded; a set whose primaries include `full_body` is
 * counted separately (footnote) and never shades. `windowStart` is an inclusive
 * ISO-date lower bound, or null for all-time.
 */
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

    if (set.primaryMuscles.includes('full_body')) {
      fullBodySetCount += 1;
      continue;
    }

    for (const p of set.primaryMuscles) {
      if (SHADEABLE.has(p)) byMuscle[p] += 1;
    }
    for (const sec of set.secondaryMuscles) {
      if (SHADEABLE.has(sec)) byMuscle[sec] += SECONDARY_SET_WEIGHT;
    }
  }

  const maxMuscleValue = Math.max(0, ...Object.values(byMuscle));
  return { byMuscle, fullBodySetCount, totalWorkingSets, maxMuscleValue };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/core/muscleVolume.test.ts`
Expected: PASS (6 tests). (`pnpm build` is still red — consumers fixed in Tasks 7–9.)

- [ ] **Step 5: Commit**

```bash
git add src/core/muscleVolume.ts src/core/muscleVolume.test.ts
git commit -m "feat(muscles): fine + multi-primary volume engine"
```

---

## Task 3: DB migration — `muscles` table, `primary_muscles[]`, trigger, re-tag 34

**Files:**
- Create: `supabase/migrations/20260604120000_fine_muscle_taxonomy.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Project A — fine muscle taxonomy.
-- App has no production users yet → re-tag the system seed in-place, no backfill.
-- Mirrors src/core/muscles.ts (runtime source of truth). The muscles.test.ts
-- unit test + Tier-3 pgTAP assert TS and this seed never drift.

-- 1) muscles dictionary (structure only — names live in i18n, D-E2).
create table if not exists public.muscles (
  code             text primary key,
  muscle_group     text not null,
  body_region_slug text,
  display_order    int  not null default 0,
  is_full_body     boolean not null default false,
  check (muscle_group = any (array[
    'shoulders','chest','back','arms','core','legs','full_body'
  ]))
);

alter table public.muscles enable row level security;
-- Read-only reference data: everyone authenticated may read; nobody writes via RLS.
drop policy if exists muscles_select_all on public.muscles;
create policy muscles_select_all on public.muscles for select using (true);

insert into public.muscles (code, muscle_group, body_region_slug, display_order, is_full_body) values
  ('delt_front','shoulders','deltoids',1,false),
  ('delt_side','shoulders','deltoids',2,false),
  ('delt_rear','shoulders','deltoids',3,false),
  ('pec_upper','chest','chest',4,false),
  ('pec_lower','chest','chest',5,false),
  ('lat','back','upper-back',6,false),
  ('trap','back','trapezius',7,false),
  ('rhomboids','back','upper-back',8,false),
  ('lower_back','back','lower-back',9,false),
  ('biceps','arms','biceps',10,false),
  ('tri_long','arms','triceps',11,false),
  ('tri_lateral','arms','triceps',12,false),
  ('forearms','arms','forearm',13,false),
  ('abs_upper','core','abs',14,false),
  ('abs_lower','core','abs',15,false),
  ('obliques','core','obliques',16,false),
  ('quads','legs','quadriceps',17,false),
  ('hamstrings','legs','hamstring',18,false),
  ('glutes','legs','gluteal',19,false),
  ('adductors','legs','adductors',20,false),
  ('calves','legs','calves',21,false),
  ('tibialis','legs','tibialis',22,false),
  ('full_body','full_body',null,99,true)
on conflict (code) do update set
  muscle_group = excluded.muscle_group,
  body_region_slug = excluded.body_region_slug,
  display_order = excluded.display_order,
  is_full_body = excluded.is_full_body;

-- 2) exercises.primary_muscles[] (multiple primaries); migrate the single value.
alter table public.exercises
  add column if not exists primary_muscles text[] not null default '{}';

-- Drop the old coarse primary CHECK before re-tagging to fine codes.
alter table public.exercises drop constraint if exists exercises_primary_muscle_check;
alter table public.exercises drop constraint if exists exercises_secondary_muscles_valid;

-- 3) validation trigger (a CHECK cannot reference another table).
create or replace function public.validate_exercise_muscles()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1 from unnest(new.primary_muscles) c
    where c not in (select code from public.muscles)
  ) then
    raise exception 'primary_muscles contains unknown code';
  end if;
  if exists (
    select 1 from unnest(new.secondary_muscles) c
    where c not in (select code from public.muscles where not is_full_body)
  ) then
    raise exception 'secondary_muscles contains unknown or full_body code';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_exercise_muscles on public.exercises;
create trigger trg_validate_exercise_muscles
  before insert or update on public.exercises
  for each row execute function public.validate_exercise_muscles();

-- 4) re-tag the 34 system seeds to fine codes (system rows only, by English name).
update public.exercises as e
set primary_muscles = v.prim, secondary_muscles = v.sec
from (values
  ('Back squat',                array['quads'],                 array['glutes','hamstrings','adductors','lower_back']),
  ('Front squat',               array['quads'],                 array['glutes','abs_upper','lower_back']),
  ('Deadlift',                  array['lower_back','glutes'],   array['hamstrings','quads','lat','trap','forearms']),
  ('Romanian deadlift',         array['hamstrings'],            array['glutes','lower_back','lat','forearms']),
  ('Barbell hip thrust',        array['glutes'],                array['hamstrings']),
  ('Bench press',               array['pec_lower'],             array['delt_front','tri_lateral','tri_long']),
  ('Incline bench press',       array['pec_upper'],             array['delt_front','tri_lateral','tri_long']),
  ('Overhead press',            array['delt_front'],            array['delt_side','tri_lateral','tri_long','abs_upper']),
  ('Barbell row',               array['lat'],                   array['rhomboids','trap','biceps','forearms','delt_rear']),
  ('Dumbbell press',            array['pec_lower'],             array['delt_front','tri_lateral','tri_long']),
  ('Incline dumbbell press',    array['pec_upper'],             array['delt_front','tri_lateral','tri_long']),
  ('Dumbbell row',              array['lat'],                   array['rhomboids','biceps','forearms','delt_rear']),
  ('Dumbbell curl',             array['biceps'],                array['forearms']),
  ('Dumbbell triceps extension',array['tri_long'],              array['tri_lateral']),
  ('Lateral raises',            array['delt_side'],             array[]::text[]),
  ('Front raises',              array['delt_front'],            array[]::text[]),
  ('Dumbbell rear delt fly',    array['delt_rear'],             array['rhomboids','trap']),
  ('Arnold press',              array['delt_front'],            array['delt_side','tri_lateral','tri_long']),
  ('Leg press',                 array['quads'],                 array['glutes','hamstrings','adductors']),
  ('Leg extension',             array['quads'],                 array[]::text[]),
  ('Leg curl',                  array['hamstrings'],            array['calves']),
  ('Chest press machine',       array['pec_lower'],             array['delt_front','tri_lateral']),
  ('Seated calf raise',         array['calves'],                array[]::text[]),
  ('Lat pulldown',              array['lat'],                   array['biceps','forearms','rhomboids','delt_rear']),
  ('Cable row',                 array['lat'],                   array['rhomboids','trap','biceps','forearms']),
  ('Cable triceps pushdown',    array['tri_lateral'],           array[]::text[]),
  ('Cable biceps curl',         array['biceps'],                array['forearms']),
  ('Cable rear delt fly',       array['delt_rear'],             array['rhomboids','trap']),
  ('Cable crunch',              array['abs_upper'],             array['abs_lower','obliques']),
  ('Pull-ups',                  array['lat'],                   array['biceps','forearms','rhomboids','delt_rear']),
  ('Dips',                      array['pec_lower'],             array['tri_lateral','tri_long','delt_front']),
  ('Plank',                     array['abs_upper'],             array['abs_lower','obliques','delt_front']),
  ('Kettlebell swing',          array['glutes'],                array['hamstrings','lower_back','delt_front','abs_upper']),
  ('Goblet squat',              array['quads'],                 array['glutes','adductors','abs_upper'])
) as v(name_en, prim, sec)
where e.source = 'system' and e.name_en = v.name_en;

-- 5) drop the legacy single-value column (no prod users).
alter table public.exercises drop column if exists primary_muscle;

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- ROLLBACK:
--   alter table public.exercises add column if not exists primary_muscle text;
--   drop trigger if exists trg_validate_exercise_muscles on public.exercises;
--   drop function if exists public.validate_exercise_muscles();
--   alter table public.exercises drop column if exists primary_muscles;
--   drop table if exists public.muscles;
```

- [ ] **Step 2: Apply locally and verify the re-tag**

Run:
```bash
supabase start
supabase migration up
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" \
  -c "select count(*) from exercises where source='system' and array_length(primary_muscles,1) is null;"
```
Expected: `0` (every system row got fine primaries). If non-zero, a `name_en` in the migration mismatches the seed — fix and re-apply.

- [ ] **Step 3: Verify the trigger rejects an unknown code**

Run:
```bash
psql "$DB_URL" -c "insert into exercises (name_es, primary_muscles) values ('x', array['bogus']);"
```
Expected: ERROR `primary_muscles contains unknown code`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260604120000_fine_muscle_taxonomy.sql
git commit -m "feat(db): fine muscle taxonomy — muscles table, primary_muscles[], trigger, re-tag"
```

---

## Task 4: Tier-3 pgTAP — muscles seed, anti-drift, trigger

**Files:**
- Create: `supabase/tests/05_muscles.test.sql`
- Modify: `supabase/tests/00_schema.test.sql` (add `has_table('public','muscles', …)`)

- [ ] **Step 1: Add the table assertion in `00_schema.test.sql`**

After the `select has_table('public', 'exercises', 'exercises exists');` line, add:

```sql
select has_table('public', 'muscles',          'muscles exists');
```

- [ ] **Step 2: Write the muscles pgTAP suite**

```sql
-- supabase/tests/05_muscles.test.sql
-- Tier-3 — fine muscle taxonomy: seed completeness, anti-drift vs src/core/muscles.ts,
-- the validate_exercise_muscles trigger, and the system re-tag.
begin;
select * from no_plan();

-- 23 codes seeded (22 shadeable + full_body), exactly matching src/core/muscles.ts.
select set_eq(
  $$ select code from public.muscles $$,
  $$ values ('delt_front'),('delt_side'),('delt_rear'),('pec_upper'),('pec_lower'),
            ('lat'),('trap'),('rhomboids'),('lower_back'),('biceps'),('tri_long'),
            ('tri_lateral'),('forearms'),('abs_upper'),('abs_lower'),('obliques'),
            ('quads'),('hamstrings'),('glutes'),('adductors'),('calves'),('tibialis'),
            ('full_body') $$,
  'muscles seed == src/core/muscles.ts code set'
);

-- exactly one full_body, with a null region
select is((select count(*)::int from public.muscles where is_full_body), 1, 'one full_body row');
select is((select body_region_slug from public.muscles where code='full_body'), null, 'full_body has no region');

-- every system exercise has at least one fine primary after the re-tag
select is(
  (select count(*)::int from public.exercises
     where source='system' and coalesce(array_length(primary_muscles,1),0) = 0),
  0, 'every system exercise has >=1 primary');

-- trigger rejects an unknown primary code
select throws_ok(
  $$ insert into public.exercises (name_es, primary_muscles) values ('bad', array['bogus']) $$,
  'primary_muscles contains unknown code');

-- trigger rejects full_body as a secondary
select throws_ok(
  $$ insert into public.exercises (name_es, secondary_muscles) values ('bad', array['full_body']) $$,
  'secondary_muscles contains unknown or full_body code');

select * from finish();
rollback;
```

- [ ] **Step 3: Run the suite**

Run: `supabase test db`
Expected: all files pass, including `05_muscles.test.sql`.

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/05_muscles.test.sql supabase/tests/00_schema.test.sql
git commit -m "test(db): Tier-3 pgTAP for muscles seed, anti-drift, trigger"
```

---

## Task 5: Regenerate database types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Regenerate**

Run: `supabase gen types typescript --local > src/types/database.ts`

- [ ] **Step 2: Confirm the shape changed**

Run: `grep -n "primary_muscles\|primary_muscle\b\|muscles:" src/types/database.ts`
Expected: `exercises.Row` now has `primary_muscles: string[]` and **no** `primary_muscle`; a new `muscles` table type exists.

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "chore(types): regenerate for fine muscle taxonomy"
```

---

## Task 6: Exercises data layer — fine types, array filter, create

**Files:**
- Modify: `src/features/training/exercises/api.ts`
- Test: `src/features/training/exercises/api.test.ts`

- [ ] **Step 1: Update the failing test**

In `src/features/training/exercises/api.test.ts`, the search test asserts the PostgREST `or(...)` string. Update the muscle term expectation from the `.eq.` form to the contains form and switch the fixture to fine codes. Replace the muscle-related assertions with:

```ts
// a typed-text muscle match now uses contains-on-array, not eq:
expect(orArg).toContain('primary_muscles.cs.{pec_lower}');
// and the create payload carries primary_muscles[]:
expect(insertArg.primary_muscles).toEqual(['pec_lower']);
```

(Adjust the surrounding fixture object: replace `primary_muscle: 'chest'` with `primary_muscles: ['pec_lower']` everywhere in this file.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/features/training/exercises/api.test.ts`
Expected: FAIL — old `.eq.` string / `primary_muscle` field.

- [ ] **Step 3: Rewrite the muscle parts of `api.ts`**

Replace the hand-written `PrimaryMuscle` / `PRIMARY_MUSCLE_VALUES` / `SecondaryMuscle` / `SECONDARY_MUSCLE_VALUES` block with derivations from the canonical module, widen the create input + search to arrays, and switch the operator:

```ts
import { MUSCLE_CODES, MUSCLES } from '@/core/muscles';

// Fine taxonomy. full_body is a valid PRIMARY but never a secondary.
export type PrimaryMuscle = (typeof MUSCLE_CODES)[number] | 'full_body';
export const PRIMARY_MUSCLE_VALUES: PrimaryMuscle[] = [
  ...MUSCLES.filter((m) => !m.isFullBody).map((m) => m.code),
  'full_body',
];

export type SecondaryMuscle = Exclude<PrimaryMuscle, 'full_body'>;
export const SECONDARY_MUSCLE_VALUES: SecondaryMuscle[] = MUSCLE_CODES.map((c) => c);
```

Change `ExerciseCreateInput`:

```ts
export interface ExerciseCreateInput {
  name_es: string;
  name_en: string | null;
  primary_muscles: PrimaryMuscle[];
  secondary_muscles: SecondaryMuscle[];
  equipment: Equipment | null;
  default_increment_kg: number | null;
}
```

Change `ExerciseSearchOptions` doc + keep the same field names (`muscle`, `textMuscles`). In `searchExercises`, replace the two muscle query builders:

```ts
  if (muscle) {
    builder = builder.contains('primary_muscles', [muscle]);
  }
  // ...
  for (const code of textMuscles) {
    terms.push(`primary_muscles.cs.{${code}}`);
  }
```

In `createExercise`, change the payload field:

```ts
    primary_muscles: input.primary_muscles,
```

> **⚠ Verify against a real DB:** the `primary_muscles.cs.{code}` OR-term and the `.contains()` AND-filter are PostgREST strings that escape the typecheck. After this task, run a manual query against the local stack (see Task 15 smoke) confirming both the dropdown filter and a typed muscle name return rows.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/features/training/exercises/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/training/exercises/api.ts src/features/training/exercises/api.test.ts
git commit -m "feat(exercises): fine muscle types, primary_muscles[], array filter"
```

---

## Task 7: Heatmap data fetch → fine arrays

**Files:**
- Modify: `src/features/training/muscleMap/api.ts`

- [ ] **Step 1: Update the select + mapping**

```ts
import { supabase } from '@/lib/supabase';
import type { MuscleCode, SetInput } from '@/core/muscleVolume';

interface Row {
  is_warmup: boolean;
  session: { performed_on: string } | null;
  exercise: { primary_muscles: string[]; secondary_muscles: string[] } | null;
}

export async function fetchWorkoutSetsForVolume(
  windowStart: string | null,
): Promise<SetInput[]> {
  let query = supabase
    .from('workout_sets')
    .select(
      'is_warmup, session:workout_sessions!inner(performed_on, user_id), ' +
        'exercise:exercises!inner(primary_muscles, secondary_muscles)',
    );
  if (windowStart !== null) {
    query = query.gte('session.performed_on', windowStart);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data as unknown as Row[]) ?? []).map((r) => ({
    performedOn: r.session?.performed_on ?? '',
    isWarmup: r.is_warmup,
    primaryMuscles: (r.exercise?.primary_muscles ?? []) as SetInput['primaryMuscles'],
    secondaryMuscles: (r.exercise?.secondary_muscles ?? []) as MuscleCode[],
  }));
}
```

> **⚠ Verify against a real DB:** the `exercises!inner(primary_muscles, secondary_muscles)` select string escapes the typecheck — confirm it returns rows in the Task 15 smoke.

- [ ] **Step 2: Typecheck this file's consumers compile**

Run: `pnpm typecheck`
Expected: errors now only in `MuscleBody.tsx` / `MuscleActivityView.tsx` (fixed next) — not in `muscleMap/api.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/features/training/muscleMap/api.ts
git commit -m "feat(heatmap): fetch fine primary_muscles[] for volume"
```

---

## Task 8: Render layer — fine→slug aggregation; skin drops `slugToMuscle`

**Files:**
- Modify: `src/features/training/muscleMap/MuscleBody.tsx`
- Modify: `src/features/training/muscleMap/skins/types.ts`
- Modify: `src/features/training/muscleMap/skins/mitSkin/index.ts`
- Test: `src/features/training/muscleMap/MuscleBody.test.tsx`

- [ ] **Step 1: Update the test to assert co-shading**

Replace the relevant assertions in `MuscleBody.test.tsx` so that a deltoids region shows the **sum** of the three delt codes. Core assertion:

```ts
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MuscleBody } from './MuscleBody';

describe('MuscleBody fine→slug aggregation', () => {
  it('sums the fine codes that share an art region (3 delts → deltoids)', () => {
    const intensity = { delt_front: 1, delt_side: 0.5, delt_rear: 0.5 } as Record<string, number>;
    const { container } = render(
      <MuscleBody intensityByMuscle={intensity} max={2} gender="male" side="front" />,
    );
    // deltoids paths should be filled at the max colour (sum 2.0 === max), not 1.0.
    // Identify a deltoids path via the skin and assert its fill is the max-intensity rgb.
    const fills = [...container.querySelectorAll('path')].map((p) => p.getAttribute('fill'));
    expect(fills).toContain('rgb(220,38,38)'); // muscleColor(2,2)
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/features/training/muscleMap/MuscleBody.test.tsx`
Expected: FAIL — `slugToMuscle` still maps deltoids→one code (1.0, not summed).

- [ ] **Step 3: Drop `slugToMuscle` from the skin contract**

In `skins/types.ts` remove the `slugToMuscle` field from `BodyArtSkin` (the import of `MuscleCode` may then be unused — remove it):

```ts
export interface BodyArtSkin {
  id: string;
  viewBox(gender: Gender, side: Side): string;
  parts(gender: Gender, side: Side): BodyPart[];
}
```

In `skins/mitSkin/index.ts` delete the entire `slugToMuscle` const and drop it from the exported object (and remove the now-unused `MuscleCode` import):

```ts
export const mitSkin: BodyArtSkin = {
  id: 'mit',
  viewBox: (_gender, side) => (side === 'front' ? '0 0 724 1448' : '724 0 724 1448'),
  parts,
};
export const ACTIVE_SKIN: BodyArtSkin = mitSkin;
```

- [ ] **Step 4: Aggregate fine→slug in `MuscleBody.tsx`**

```tsx
import type { MuscleCode } from '@/core/muscleVolume';
import { codesForBodyRegion } from '@/core/muscles';
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
      {skin.parts(gender, side).flatMap((part, pi) => {
        const codes = codesForBodyRegion(part.slug);
        const value = codes.reduce((sum, c) => sum + (intensityByMuscle[c] ?? 0), 0);
        const fill = codes.length > 0 ? muscleColor(value, max) : NEUTRAL_PART;
        return part.paths.map((d, di) => (
          <path key={`${pi}-${di}`} d={d} fill={fill} stroke="#ffffff" strokeWidth={0.6} />
        ));
      })}
    </svg>
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test src/features/training/muscleMap/MuscleBody.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/training/muscleMap/MuscleBody.tsx src/features/training/muscleMap/skins/
git commit -m "feat(heatmap): render-layer fine→slug aggregation (co-shading)"
```

---

## Task 9: Ranked list at fine resolution + i18n key

**Files:**
- Modify: `src/features/training/muscleMap/MuscleActivityView.tsx`

- [ ] **Step 1: Point the view at the canonical codes and the renamed i18n key**

Change the import and the empty/ranked helpers from `MUSCLE_CODES` of `muscleVolume` (still valid — it re-exports) and update the label key from `exerciseDialog.primaryMuscle.${m}` → `exerciseDialog.muscle.${m}`:

```tsx
import { MUSCLE_CODES, type MuscleCode } from '@/core/muscleVolume';
// ...
                  <span className="flex-1">{t(`exerciseDialog.muscle.${m}`)}</span>
```

The ranked list already iterates `MUSCLE_CODES`, so it now renders all 22 fine muscles, highest-first. No other change.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors in `MuscleActivityView.tsx` (i18n keys are runtime; verified in Task 10).

- [ ] **Step 3: Commit**

```bash
git add src/features/training/muscleMap/MuscleActivityView.tsx
git commit -m "feat(heatmap): ranked list at fine resolution"
```

---

## Task 10: i18n — rename block, 22 codes + group labels (ES/EN)

**Files:**
- Modify: `src/i18n/es/entrenamiento.json`
- Modify: `src/i18n/en/entrenamiento.json`

- [ ] **Step 1: Replace the `primaryMuscle` block with `muscle` + add `muscleGroup` (ES)**

In `src/i18n/es/entrenamiento.json`, rename the key `"primaryMuscle"` (the muscle-name map, ~line 92) to `"muscle"` and replace its body, then add a sibling `"muscleGroup"` block:

```json
    "muscle": {
      "delt_front": "Deltoides anterior",
      "delt_side": "Deltoides lateral",
      "delt_rear": "Deltoides posterior",
      "pec_upper": "Pectoral superior",
      "pec_lower": "Pectoral inferior",
      "lat": "Dorsal ancho",
      "trap": "Trapecio",
      "rhomboids": "Romboides",
      "lower_back": "Lumbares",
      "biceps": "Bíceps",
      "tri_long": "Tríceps (largo)",
      "tri_lateral": "Tríceps (lateral)",
      "forearms": "Antebrazos",
      "abs_upper": "Abdomen superior",
      "abs_lower": "Abdomen inferior",
      "obliques": "Oblicuos",
      "quads": "Cuádriceps",
      "hamstrings": "Isquiosurales",
      "glutes": "Glúteos",
      "adductors": "Aductores",
      "calves": "Gemelos",
      "tibialis": "Tibial anterior",
      "full_body": "Cuerpo completo"
    },
    "muscleGroup": {
      "shoulders": "Hombro",
      "chest": "Pecho",
      "back": "Espalda",
      "arms": "Brazos",
      "core": "Core",
      "legs": "Piernas"
    },
```

- [ ] **Step 2: Same for EN**

In `src/i18n/en/entrenamiento.json`:

```json
    "muscle": {
      "delt_front": "Front deltoid",
      "delt_side": "Side deltoid",
      "delt_rear": "Rear deltoid",
      "pec_upper": "Upper chest",
      "pec_lower": "Lower chest",
      "lat": "Lats",
      "trap": "Traps",
      "rhomboids": "Rhomboids",
      "lower_back": "Lower back",
      "biceps": "Biceps",
      "tri_long": "Triceps (long head)",
      "tri_lateral": "Triceps (lateral)",
      "forearms": "Forearms",
      "abs_upper": "Upper abs",
      "abs_lower": "Lower abs",
      "obliques": "Obliques",
      "quads": "Quads",
      "hamstrings": "Hamstrings",
      "glutes": "Glutes",
      "adductors": "Adductors",
      "calves": "Calves",
      "tibialis": "Tibialis",
      "full_body": "Full body"
    },
    "muscleGroup": {
      "shoulders": "Shoulder",
      "chest": "Chest",
      "back": "Back",
      "arms": "Arms",
      "core": "Core",
      "legs": "Legs"
    },
```

- [ ] **Step 3: Update every `exerciseDialog.primaryMuscle.` reference**

Run: `grep -rn "exerciseDialog.primaryMuscle\." src`
Expected remaining refs to update to `exerciseDialog.muscle.`: `MuscleActivityView.tsx` (done in Task 9), `ExercisePicker.tsx`, `ExerciseDialog.tsx` (rewritten Task 11). Update `ExercisePicker.tsx`'s `labelByCode` now:

```ts
  const labelByCode = Object.fromEntries(
    PRIMARY_MUSCLE_VALUES.map((c) => [c, t(`exerciseDialog.muscle.${c}`)]),
  );
```

- [ ] **Step 4: Verify JSON parses**

Run: `pnpm test src/i18n` (or `node -e "require('./src/i18n/es/entrenamiento.json')"`).
Expected: no JSON parse error.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/es/entrenamiento.json src/i18n/en/entrenamiento.json src/features/training/components/ExercisePicker.tsx
git commit -m "i18n(muscles): rename block to muscle, 22 fine codes + group labels"
```

---

## Task 11: ExerciseDialog — B1 grouped tri-state tagging control

**Files:**
- Create: `src/features/training/components/MuscleTagField.tsx`
- Modify: `src/features/training/components/ExerciseDialog.tsx`
- Test: `src/features/training/components/MuscleTagField.test.tsx`

- [ ] **Step 1: Write the failing test for the control**

```tsx
// src/features/training/components/MuscleTagField.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n/config'; // ensures t() returns keys/labels; if config path differs, mock useTranslation
import { MuscleTagField } from './MuscleTagField';

function setup(initial = { primary: [] as string[], secondary: [] as string[] }) {
  const onChange = vi.fn();
  render(<MuscleTagField value={initial} onChange={onChange} />);
  return { onChange };
}

describe('MuscleTagField tri-state', () => {
  it('cycles a pill neutral → primary → secondary → neutral', () => {
    const { onChange } = setup();
    const pill = screen.getByRole('button', { name: /Pectoral inferior|Lower chest/ });
    fireEvent.click(pill); // → primary
    expect(onChange).toHaveBeenLastCalledWith({ primary: ['pec_lower'], secondary: [] });
    fireEvent.click(pill); // → secondary
    expect(onChange).toHaveBeenLastCalledWith({ primary: [], secondary: ['pec_lower'] });
    fireEvent.click(pill); // → neutral
    expect(onChange).toHaveBeenLastCalledWith({ primary: [], secondary: [] });
  });

  it('full_body checkbox is mutually exclusive with the grouped list', () => {
    const { onChange } = setup({ primary: ['pec_lower'], secondary: ['delt_front'] });
    fireEvent.click(screen.getByRole('checkbox', { name: /Cuerpo completo|Full body/ }));
    expect(onChange).toHaveBeenLastCalledWith({ primary: ['full_body'], secondary: [] });
  });
}); 
```

> The component owns no form state — it is a controlled `{ value, onChange }` field so the dialog's react-hook-form stays the source of truth and the test needs no Supabase env (component-test env gotcha).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/features/training/components/MuscleTagField.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `MuscleTagField.tsx`**

```tsx
import { useTranslation } from 'react-i18next';
import { MUSCLE_GROUPS, codesInGroup, type MuscleGroup } from '@/core/muscles';
import { cn } from '@/lib/utils';

export interface MuscleTagValue {
  primary: string[];
  secondary: string[];
}

interface Props {
  value: MuscleTagValue;
  onChange: (next: MuscleTagValue) => void;
}

type State = 'p' | 's' | null;

export function MuscleTagField({ value, onChange }: Props) {
  const { t } = useTranslation('entrenamiento');
  const isFullBody = value.primary.includes('full_body');

  function stateOf(code: string): State {
    if (value.primary.includes(code)) return 'p';
    if (value.secondary.includes(code)) return 's';
    return null;
  }

  function cycle(code: string) {
    const cur = stateOf(code);
    const primary = value.primary.filter((c) => c !== code && c !== 'full_body');
    const secondary = value.secondary.filter((c) => c !== code);
    if (cur === null) primary.push(code);
    else if (cur === 'p') secondary.push(code);
    // cur === 's' → leave both removed (neutral)
    onChange({ primary, secondary });
  }

  function toggleFullBody() {
    onChange(isFullBody ? { primary: [], secondary: [] } : { primary: ['full_body'], secondary: [] });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('exerciseDialog.muscleTag.instruction')}</p>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-primary" />
          {t('exerciseDialog.muscleTag.legendPrimary')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-primary" />
          {t('exerciseDialog.muscleTag.legendSecondary')}
        </span>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isFullBody} onChange={toggleFullBody} />
        {t('exerciseDialog.muscle.full_body')}
      </label>

      <fieldset disabled={isFullBody} className={cn(isFullBody && 'opacity-40')}>
        {MUSCLE_GROUPS.map((g: MuscleGroup) => (
          <div key={g} className="mb-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t(`exerciseDialog.muscleGroup.${g}`)}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {codesInGroup(g).map((code) => {
                const st = stateOf(code);
                return (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={st !== null}
                    onClick={() => cycle(code)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                      st === 'p' && 'border-primary bg-primary font-semibold text-primary-foreground',
                      st === 's' && 'border-primary font-semibold text-primary',
                      st === null && 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t(`exerciseDialog.muscle.${code}`)}
                    {st && (
                      <span className="rounded-full bg-background/30 px-1.5 py-px text-[10px] font-bold uppercase">
                        {st === 'p'
                          ? t('exerciseDialog.muscleTag.badgePrimary')
                          : t('exerciseDialog.muscleTag.badgeSecondary')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>
    </div>
  );
}
```

- [ ] **Step 4: Add the control's i18n keys**

Add a `muscleTag` block under `exerciseDialog` in both locale files.

ES (`src/i18n/es/entrenamiento.json`):
```json
    "muscleTag": {
      "instruction": "Toca un músculo: 1 vez → primario, 2 → secundario, 3 → quitar.",
      "legendPrimary": "Primario · cuenta 1.0",
      "legendSecondary": "Secundario · cuenta 0.5",
      "badgePrimary": "Prim",
      "badgeSecondary": "Sec"
    },
```
EN (`src/i18n/en/entrenamiento.json`):
```json
    "muscleTag": {
      "instruction": "Tap a muscle: 1 tap → primary, 2 → secondary, 3 → remove.",
      "legendPrimary": "Primary · counts 1.0",
      "legendSecondary": "Secondary · counts 0.5",
      "badgePrimary": "Prim",
      "badgeSecondary": "Sec"
    },
```

- [ ] **Step 5: Run the control test to verify it passes**

Run: `pnpm test src/features/training/components/MuscleTagField.test.tsx`
Expected: PASS.

- [ ] **Step 6: Wire the control into `ExerciseDialog.tsx`**

Replace the separate `primary_muscle` `<Select>` and the secondary pill block with a single `MuscleTagField`. Changes:

- Form schema: replace `primary_muscle` + `secondary_muscles` fields with arrays:
```ts
  primary_muscles: z.array(z.string()).optional().transform((v) => v ?? []),
  secondary_muscles: z.array(z.string()).optional().transform((v) => v ?? []),
```
- Remove the `SENTINEL_NONE` handling for muscle (keep it for `equipment`). Update `defaultValues` / `reset` to `primary_muscles: [], secondary_muscles: []`.
- Replace the two muscle UI blocks with:
```tsx
          <MuscleTagField
            value={{
              primary: watch('primary_muscles') ?? [],
              secondary: watch('secondary_muscles') ?? [],
            }}
            onChange={(next) => {
              setValue('primary_muscles', next.primary, { shouldDirty: true });
              setValue('secondary_muscles', next.secondary, { shouldDirty: true });
            }}
          />
```
- In `onValid`, pass `primary_muscles: values.primary_muscles as PrimaryMuscle[]` (drop the old `primary_muscle` cast).
- Remove now-unused imports (`Select…`, `PRIMARY_MUSCLE_VALUES`, `SECONDARY_MUSCLE_VALUES`, `SENTINEL_NONE` if only muscle used it).

- [ ] **Step 7: Run the dialog test**

Update `ExerciseDialog.test.tsx` fixtures/assertions: a created exercise now carries `primary_muscles` (array). Run: `pnpm test src/features/training/components/ExerciseDialog.test.tsx`
Expected: PASS (mock `useCreateExercise` per the component-test env gotcha).

- [ ] **Step 8: Commit**

```bash
git add src/features/training/components/MuscleTagField.tsx src/features/training/components/MuscleTagField.test.tsx src/features/training/components/ExerciseDialog.tsx src/features/training/components/ExerciseDialog.test.tsx src/i18n
git commit -m "feat(exercise-dialog): B1 grouped tri-state muscle tagging"
```

---

## Task 12: ExercisePicker — optgroup'd fine muscle filter

**Files:**
- Modify: `src/features/training/components/ExercisePicker.tsx`

- [ ] **Step 1: Group the filter `<select>` by the 6 groups**

Replace the flat `PRIMARY_MUSCLE_VALUES.map(...)` options with `<optgroup>`s built from the canonical structure (exclude `full_body` from the filter — you don't browse for "full body" exercises):

```tsx
import { MUSCLE_GROUPS, codesInGroup } from '@/core/muscles';
// ...
          <option value="">{t('picker.allMuscles')}</option>
          {MUSCLE_GROUPS.map((g) => (
            <optgroup key={g} label={t(`exerciseDialog.muscleGroup.${g}`)}>
              {codesInGroup(g).map((code) => (
                <option key={code} value={code}>
                  {t(`exerciseDialog.muscle.${code}`)}
                </option>
              ))}
            </optgroup>
          ))}
```

`selectedMuscle` stays typed `PrimaryMuscle | ''`; the AND filter flows through `useExerciseSearch({ muscle })` → `searchExercises` `.contains('primary_muscles', [muscle])` (Task 6). `labelByCode` already updated in Task 10.

- [ ] **Step 2: Typecheck + existing picker test**

Run: `pnpm test src/features/training/components/ExercisePicker.test.tsx` (if present) and `pnpm typecheck`.
Expected: PASS / no errors. (Note: `musclesMatchingQuery` is unchanged — it now matches the 22 fine names automatically via `labelByCode`. Group-name matching is Project B.)

- [ ] **Step 3: Commit**

```bash
git add src/features/training/components/ExercisePicker.tsx
git commit -m "feat(picker): optgroup'd fine muscle filter"
```

---

## Task 13: Coach context — multiple primaries

**Files:**
- Modify: `src/features/training/components/ExerciseBlock.tsx`
- Modify: `src/core/training.ts`
- Test: `src/core/training.test.ts`

- [ ] **Step 1: Decide the contract — `primaryMuscle` → `primaryMuscles`**

The `muscle-recency` rule keys off a single muscle for its headline. With multiple primaries, fire on the **first** primary (the canonical-order lead mover). Update `CoachContext`:

```ts
export interface CoachContext {
  exerciseId: string;
  primaryMuscles: string[]; // fine codes; [] = untagged
  equipment: string | null;
  // ...unchanged...
}
```

- [ ] **Step 2: Update the rule + its test**

In `src/core/training.test.ts`, find the `muscle-recency` tests and change fixtures from `primaryMuscle: 'chest'` to `primaryMuscles: ['pec_lower']`, and add a case asserting `[]` → rule returns null. Then in `training.ts` `ruleMuscleRecency`:

```ts
    const lead = ctx.primaryMuscles[0] ?? null;
    if (lead === null) return null;
    // ...replace every `ctx.primaryMuscle` in this rule with `lead`...
    detail: { primaryMuscle: lead },
```

(Keep the `detail.primaryMuscle` key — the coach i18n headline still interpolates a single `{{primaryMuscle}}`; the UI resolves it via the `exerciseDialog.muscle.<code>` label.)

- [ ] **Step 3: Feed the array from `ExerciseBlock.tsx`**

```tsx
        primaryMuscles: exercise.primary_muscles,
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/core/training.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/training.ts src/core/training.test.ts src/features/training/components/ExerciseBlock.tsx
git commit -m "feat(coach): muscle-recency over multiple primaries"
```

---

## Task 14: Fix downstream test fixtures

**Files:**
- Modify: `src/features/training/components/SessionEditor.test.tsx`
- Modify: `src/features/training/components/SessionEditor.b2.test.tsx`
- Modify: `src/features/training/components/RoutineBuilder.test.tsx`

- [ ] **Step 1: Replace `primary_muscle` in every exercise fixture**

These fixtures build `Exercise` objects with `primary_muscle: 'chest'` etc. Replace each with `primary_muscles: ['<fine code>']` to match the regenerated `Tables<'exercises'>` (no `primary_muscle` field). Mapping for the existing fixtures: `'chest' → ['pec_lower']`, `'quads' → ['quads']`.

Run: `grep -rn "primary_muscle:" src/features/training/components`
Expected after edits: no matches (all are `primary_muscles:`).

- [ ] **Step 2: Run the affected suites**

Run: `pnpm test src/features/training/components`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/training/components/SessionEditor.test.tsx src/features/training/components/SessionEditor.b2.test.tsx src/features/training/components/RoutineBuilder.test.tsx
git commit -m "test(training): fixtures to primary_muscles[]"
```

---

## Task 15: Full verification + smoke

**Files:** none (verification only)

- [ ] **Step 1: Full gate**

Run: `pnpm lint && pnpm build && pnpm test`
Expected: all green. Fix any straggler type errors (likely leftover `primary_muscle` references) until clean.

- [ ] **Step 2: pgTAP**

Run: `supabase test db`
Expected: all suites pass.

- [ ] **Step 3: Real-DB smoke for the escape-the-typecheck strings**

With `supabase start` running and the migration applied, in the app (`pnpm dev`, logged in as the QA user) or via psql:
- Heatmap loads and the deltoids/chest/triceps regions co-shade while core/back/legs show finer detail.
- The picker muscle filter set to "Pectoral inferior" returns the bench-press rows (`.contains('primary_muscles', ['pec_lower'])`).
- Typing "dorsal" in the picker surfaces lat exercises (`primary_muscles.cs.{lat}` OR term).
- The exercise dialog's tri-state tagging saves and the new exercise appears with its primaries/secondaries.

Expected: all four behave; if a PostgREST string is malformed it returns 400 / empty — fix the operator string and re-verify.

- [ ] **Step 4: Final commit (if smoke required fixes)**

```bash
git add -A
git commit -m "fix(muscles): smoke-test corrections"
```

---

## Self-review notes (author)

- **Spec coverage:** §3 taxonomy → Task 1/3; §4a muscles table → Task 3; §4b primary_muscles[]+trigger → Task 3; §4c weighting → Task 2; §4d touch-points → Tasks 6–9,13; §4e migration → Task 3; §5 aggregation → Tasks 2,8,9; §6 tagging UI + picker + operator → Tasks 11,12,6; §7 i18n/naming/tests → Tasks 1,10 + tests throughout. ✅
- **Deferred correctly to Project B:** group-level picker filter, group-name search, lay-term aliases — not in any task. ✅
- **full_body** handling is specified end-to-end (engine Task 2, trigger Task 3, UI checkbox Task 11) — it was under-specified in the spec; resolved here as a primary-only standalone checkbox stored as `primary_muscles: ['full_body']`.
- **Type ripple:** `MuscleCode` (12→22) and `PrimaryMuscle`/`SetInput` widening intentionally break the build between Tasks 2 and 9; the gate is only enforced at Task 15. Flagged in Pre-flight.
- **Tagging accuracy:** the 34 fine re-tags (Task 3) are author judgment from the existing coarse tags — the user (domain expert) should eyeball them; this is the same accuracy risk the spec defers *at scale* to Project B.
