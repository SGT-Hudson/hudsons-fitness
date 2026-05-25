# F-4 — Muscle Activity Heatmap (design)

**Date:** 2026-05-26
**Branch:** `claude/f4-muscle-heatmap` (worktree off `develop`)
**Status:** spec written, awaiting user review → then `writing-plans`.
**Roadmap:** F-4 in `docs/superpowers/specs/2026-05-23-notes-triage.md`; sequenced out of R-22/F-2.
**Decision id:** record as **D-F9** at implementation time (no decision entry yet).

## 1. Goal

A "muscle activity" view on `/training`: for a chosen time window, show **how much each
muscle was worked**, rendered as a front/back body silhouette shaded by volume, plus a
ranked list. Answers "what have I been hitting / neglecting?" at a glance. Visualization
only — recommendations are a separate follow-up feature (§9).

Reference look: MuscleWiki's per-muscle shaded body (front/back, male/female). We adopt the
*pattern*, not their art (see §6 — proprietary, can't ship in a public repo).

## 2. Settled decisions (from brainstorming, 2026-05-25/26)

| # | Decision | Value |
|---|----------|-------|
| 1 | Muscle attribution | **Primary + secondary movers.** A new `secondary_muscles[]` on `exercises`. |
| 2 | Secondary weight | **0.5, single global constant** (`SECONDARY_SET_WEIGHT`). Not per-exercise. |
| 3 | Muscle taxonomy | **Coarse-12** (existing `primary_muscle` vocabulary). Designed extensible — future sub-region splits (upper/mid/lower chest, delt heads, rear-delt-out-of-shoulders) are *additive*, not a rewrite. |
| 4 | Volume metric | **Working-set count** (exclude `is_warmup`). Primary +1/set, each secondary +0.5/set. Not tonnage. |
| 5 | Time windows | **7d / 30d / 6mo / all-time**, default **30d**. Madrid-day anchored (`todayInTZ()`). |
| 6 | `full_body` | **Footnote only** — not shaded onto the map; shown as "+N full-body sets". |
| 7 | Rendering | **Pluggable body-art skin**; v1 = MIT skin (vendored). Continuous grey→amber→red shading, theme-aware. |
| 8 | Male/female | Two body models; **default from `profiles.sex`**, manual toggle. |
| 9 | List style | `Muscle · N sets`, **no bars**, hottest-first. |
| 10 | Placement | Section/route on `/training` (`EntrenamientoPage`). |
| 11 | Recommendations | **Deferred** to a follow-up feature built on the same volume core. |

Context that makes the data work cheap: **the app has no production users yet** — we re-seed
and re-tag `exercises` freely, no backfill ceremony (see memory `app-not-in-production-yet`).

## 3. Data model

### 3.1 `exercises.secondary_muscles`
Add column:
```sql
alter table public.exercises
  add column secondary_muscles text[] not null default '{}';

alter table public.exercises
  add constraint exercises_secondary_muscles_valid check (
    secondary_muscles <@ array[
      'chest','back','shoulders','quads','hamstrings','glutes',
      'calves','biceps','triceps','core','forearms'
    ]::text[]
  );
```
- `full_body` is intentionally **not** a valid secondary value (it's a footnote bucket, §5.3).
- `<@` = "is contained by" (every element must be in the allowed set). Empty array passes.
- Default `'{}'` so existing/created rows are valid with no secondaries.
- RLS unchanged (column on an existing table). No new tables.

### 3.2 Re-tag the 34 system seed exercises
Done in the **same migration** (`update` per row by `name_en`, or re-run the seed). No
production data to protect. Tagging table (primary stays as-is; this sets secondaries):

| Exercise (EN) | primary | secondary_muscles |
|---|---|---|
| Back squat | quads | glutes, hamstrings, core |
| Front squat | quads | glutes, core |
| Deadlift | back | glutes, hamstrings, quads, forearms, core |
| Romanian deadlift | hamstrings | glutes, back, forearms |
| Barbell hip thrust | glutes | hamstrings |
| Bench press | chest | shoulders, triceps |
| Incline bench press | chest | shoulders, triceps |
| Overhead press | shoulders | triceps, core |
| Barbell row | back | biceps, forearms, shoulders |
| Dumbbell press | chest | shoulders, triceps |
| Incline dumbbell press | chest | shoulders, triceps |
| Dumbbell row | back | biceps, forearms |
| Dumbbell curl | biceps | forearms |
| Dumbbell triceps extension | triceps | — |
| Lateral raises | shoulders | — |
| Front raises | shoulders | — |
| Dumbbell rear delt fly | shoulders | back |
| Arnold press | shoulders | triceps |
| Leg press | quads | glutes, hamstrings |
| Leg extension | quads | — |
| Leg curl | hamstrings | calves |
| Chest press machine | chest | shoulders, triceps |
| Seated calf raise | calves | — |
| Lat pulldown | back | biceps, forearms |
| Cable row | back | biceps, forearms |
| Cable triceps pushdown | triceps | — |
| Cable biceps curl | biceps | forearms |
| Cable rear delt fly | shoulders | back |
| Cable crunch | core | — |
| Pull-ups | back | biceps, forearms |
| Dips | chest | triceps, shoulders |
| Plank | core | shoulders |
| Kettlebell swing | glutes | hamstrings, back, core |
| Goblet squat | quads | glutes, core |

### 3.3 Exercise create/edit form
Add a `secondary_muscles` multi-select (the coarse-11, excluding `full_body`) to the exercise
editor (`features/training/exercises`), wired through `createExercise` / the exercises schema.
Optional. Reuses the `primaryMuscle.<code>` i18n labels.

### 3.4 Catalog expansion (related, OUT OF SCOPE here)
The user wants the catalog grown to ~every common lift, accurately tagged (memory
`exercise-catalog-expansion-goal`). F-4 only adds the *column* that effort needs and tags the
existing 34. The large seed expansion is its own task.

## 4. Volume core — `src/core/muscleVolume.ts`

Pure, dependency-free, camelCase (R-17 core pattern; sibling of `src/core/training.ts`).

```ts
export const SECONDARY_SET_WEIGHT = 0.5;

export type MuscleCode =
  | 'chest' | 'back' | 'shoulders' | 'quads' | 'hamstrings' | 'glutes'
  | 'calves' | 'biceps' | 'triceps' | 'core' | 'forearms';

export interface SetInput {
  performedOn: string;        // ISO date (session.performed_on)
  isWarmup: boolean;
  primaryMuscle: MuscleCode | 'full_body' | null;
  secondaryMuscles: MuscleCode[];
}

export interface MuscleVolume {
  byMuscle: Record<MuscleCode, number>; // credited working sets (primary 1, secondary 0.5)
  fullBodySetCount: number;             // working sets whose primary is full_body
  totalWorkingSets: number;
  maxMuscleValue: number;               // for intensity normalization (0 if none)
}

// windowStart = null => all-time
export function computeMuscleVolume(sets: SetInput[], windowStart: string | null): MuscleVolume;
```

Rules:
- Drop `isWarmup` sets.
- Drop sets with `performedOn < windowStart` (string ISO compare is safe; `null` = no lower bound).
- `primaryMuscle === 'full_body'` → increment `fullBodySetCount`, **skip** shading (its
  secondaries ignored in v1).
- `primaryMuscle === null` → skip shading, still counts toward `totalWorkingSets`.
- Else: `byMuscle[primary] += 1`; for each secondary `byMuscle[s] += SECONDARY_SET_WEIGHT`.
- `maxMuscleValue = max(byMuscle values)` (used by the component to normalize colour).

Deterministic **Tier-1 Vitest** (`muscleVolume.test.ts`): set counting, 0.5 secondary, warmup
exclusion, window boundary (inclusive of `windowStart`), full_body→footnote, null primary,
empty input (max 0), all-time (null).

## 5. Data flow & UI

### 5.1 Fetch + hook — `features/training/muscleMap/`
- `api.ts`: fetch the user's working-set rows for the window. One query joining
  `workout_sets → workout_sessions (performed_on, user_id) → exercises (primary_muscle,
  secondary_muscles)`. Select example:
  `workout_sets: reps, is_warmup, session:workout_sessions!inner(performed_on,user_id),
   exercise:exercises!inner(primary_muscle, secondary_muscles)`.
  **Verify this PostgREST select against the real DB before merge** — we have no integration
  tests for select strings (memory `need-integration-and-e2e-guard`). Filter
  `session.performed_on >= cutoff` server-side; aggregate in the core.
- `hooks.ts`: `useMuscleVolume(window)` — React Query, maps rows → `SetInput[]`, calls
  `computeMuscleVolume`. Window cutoff from `todayInTZ()` minus 7d / 30d / 6mo; all-time = null.

### 5.2 Body component — `MuscleBody.tsx`
- Props: `intensityByMuscle: Record<MuscleCode, number>`, `max: number`, `gender: 'male'|'female'`, `side: 'front'|'back'`.
- Art-agnostic: reads the **active skin** for `viewBox` + `parts`. For each part, maps `slug →
  MuscleCode` and fills with `colorFor(value, max)`; non-muscle parts (head/hands/feet) and
  zero-set muscles use a neutral. Continuous scale grey→amber→red.
- Colour scale lives in a small `muscleColor.ts` helper (theme-aware via CSS vars / Tailwind
  tokens, so dark mode works). Document the scale.

### 5.3 View — `MuscleActivityView.tsx`
- Window toggle (7d/30d/6mo/all, default 30d) — reuse the `TimeRangePills`/segmented pattern.
- Gender toggle, default `profiles.sex` (`'male'|'female'`; if null/other → default male, user
  can switch). Local `useState`, no persistence.
- Front + back `MuscleBody` side by side.
- Ranked list: `Muscle · N sets`, hottest-first, no bars. Values shown rounded (e.g. `6.5`).
- Footnote: `+ N full-body sets not shown on the map` (omit when 0).
- Empty state when `totalWorkingSets === 0`: greyed bodies + "No sets logged in this window".

### 5.4 Placement / routing
- New route under training (e.g. `/training/muscles`) rendered by `MuscleActivityView`, linked
  from `EntrenamientoPage` header (a tab/segmented control or a button — follow the existing
  training-nav pattern at impl time). One tap from the training home.

## 6. Body-art skin architecture (pluggable)

The art is a swappable **skin** so a different set (a future commissioned/licensed
MuscleWiki-style figure) drops in with zero feature rework.

```ts
// features/training/muscleMap/skins/types.ts
export interface BodyPart { slug: string; paths: string[]; } // SVG path 'd' strings
export interface BodyArtSkin {
  id: string;
  viewBox(gender: 'male'|'female', side: 'front'|'back'): string;
  parts(gender: 'male'|'female', side: 'front'|'back'): BodyPart[];
  slugToMuscle: Record<string, MuscleCode>; // skin slugs → our coarse-12 (unmapped = neutral)
}
export const ACTIVE_SKIN: BodyArtSkin = mitSkin; // single swap point
```

### 6.1 v1 skin = MIT (`skins/mitSkin/`)
- Vendored SVG from **`react-native-body-highlighter`** (HichamELBSI, MIT) — the canonical art
  that `react-body-highlighter` and `react-muscle-highlighter` both derive from. Male+female,
  front+back, viewBox `0 0 724 1448` (front) / `724 0 724 1448` (back).
- Vendor the 4 data files (`bodyFront/bodyBack/bodyFemaleFront/bodyFemaleBack`) converted to our
  `BodyPart[]` shape, plus the upstream **MIT LICENSE text + attribution** in
  `skins/mitSkin/LICENSE` and a header comment. (During brainstorming these were fetched and
  test-rendered from `soroojshehryar/react-muscle-highlighter@main/assets/*.ts`, identical art.)
- `slugToMuscle`: chest→chest, abs→core, obliques→core, deltoids→shoulders, biceps→biceps,
  triceps→triceps, forearm→forearms, trapezius→back, upper-back→back, lower-back→back,
  gluteal→glutes, hamstring→hamstrings, quadriceps→quads, adductors→quads, calves→calves,
  tibialis→calves. (head/hair/neck/hands/feet/knees/ankles → unmapped/neutral.)

### 6.2 Why not MuscleWiki's art
MuscleWiki.com is Cloudflare-locked (no extractable SVG); community clones don't redistribute
its body art (they pull it from MuscleWiki's protected CDN at runtime); and it's proprietary —
shipping it in this **public** repo is a copyright exposure. Its shaded/raster style also
doesn't recolour cleanly for a continuous heatmap. The pluggable seam keeps the door open for a
**properly-licensed or commissioned-original** detailed skin later.

## 7. i18n
- Reuse muscle labels: `entrenamiento:primaryMuscle.<code>` (ES/EN already exist incl. `full_body`).
- New keys (namespace `entrenamiento`, e.g. under `muscleMap`): view title, window labels
  (`7d`/`30d`/`6mo`/`allTime`), gender toggle (male/female), `setsUnit`, `fullBodyFootnote`
  (interpolated count), `empty`. ES + EN.

## 8. Testing
- **Tier-1:** `muscleVolume.test.ts` (§4).
- **Tier-2:** `MuscleBody` renders expected fills for a given intensity map against a tiny mock
  skin (don't load the full MIT data in the test); `MuscleActivityView` with the data hook
  **mocked** (avoid the supabase-env CI failure — memory `component-test-supabase-env`).
- Ship-flow gates green: `pnpm lint` + `pnpm build` + `pnpm test`.

## 9. Out of scope (sequenced for later)
- **Recommendations** ("you've under-trained X this week") — own feature on this volume core.
- **Sub-region splits** (upper/mid/lower chest, delt heads, rear-delt out of shoulders).
- **Tonnage** metric (set-count is the v1 driver).
- **Large catalog expansion** (§3.4).
- **MuscleWiki-style detailed skin** (commissioned/licensed) — enabled by §6 seam.
- Animated transitions between windows.

## 10. Migration / apply notes
- One migration: add column + CHECK + re-tag the 34 seeds. Per `app-not-in-production-yet`,
  apply directly; no backfill. Keep it reproducible in `supabase/migrations/`.
- `src/types/database.ts`: regenerate or hand-add `secondary_muscles` to the `exercises`
  Row/Insert/Update (R-04 generated-types flow).
