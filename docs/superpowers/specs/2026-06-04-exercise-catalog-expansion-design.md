# Exercise Catalog Expansion + Fine Muscle Taxonomy — design spec

**Status: DESIGN COMPLETE (2026-06-04), user-approved.** All of Project A
(Sections 1–6) is decided and approved; ready for an implementation plan. Project
B (bulk catalog content) remains a separate, deferred spec — see the closing
section. No code, no migration yet — this is the design hand-off to writing-plans.

**Roadmap:** promotes the standing "exercise catalog expansion" goal (grow
`exercises` to cover ~every common lift, accurately primary+secondary tagged, to
power the F-4 heatmap + future recommendations). Not yet assigned an R-id /
D-id — to be filed at plan time.

---

## 1. Goal & motivation

Three drivers, stated by the user:
1. **Missing lifts when logging** — the 34-row seed lacks exercises the user
   wants to log. → catalog expansion.
2. **A finer heatmap** — the current coarse-12 taxonomy is too blunt (shoulders
   is one blob; back is one blob; etc.). → finer muscle model.
3. **Foundation for future recommendations** — accurate fine tagging feeds a
   later recommendation engine.

## 2. Decomposition — two projects

This is too large for one spec. Split:

- **Project A (this spec, speccing now): the fine-muscle model + engine + UI.**
  New muscle taxonomy + `muscles` dictionary table, `exercises.primary_muscles[]`,
  validation trigger, pure-core + body-art aggregation update, ExerciseDialog
  multi-select + search by group/specific, i18n, and re-tag of the existing 34
  system rows. Ships a working finer heatmap with the current 34 lifts.
- **Project B (follow-on, its own spec): the bulk catalog content.** Hundreds of
  exercises × equipment variants, each fine-tagged, as idempotent seeds, plus a
  tagging-accuracy verification process (anatomical source of truth, not tagged
  by guess). Explicitly deferred; see "Open" below.

Project A must land before B (you cannot fine-tag exercises until the taxonomy
exists).

---

## 3. DECIDED — Section 1: the fine muscle taxonomy

Two levels: **group** (search "hombro") → **specific muscle** (search "hombro
delantero"). Each specific code maps to a region of the **current MIT body art**
(react-native-body-highlighter lineage, already vendored, MIT). Per the P1(a)
decision (below), the data model is fully fine **now**; the heatmap renders at
whatever the current art can distinguish, and the muscles whose art region is
shared just co-shade until license-clean finer art exists.

**22 specific muscles + `full_body`, in 6 groups.** Group display label for the
deltoid group is **"Hombro" / "Shoulder"**; specific muscles keep anatomical
names ("Deltoides anterior", …).

| Group | Code | Name (ES) | SVG region (today) | Renders distinct now? |
|---|---|---|---|---|
| shoulders | `delt_front` | Deltoides anterior | deltoids | ⏳ (3 delts co-shade) |
| shoulders | `delt_side` | Deltoides lateral | deltoids | ⏳ |
| shoulders | `delt_rear` | Deltoides posterior | deltoids | ⏳ |
| chest | `pec_upper` | Pectoral superior | chest | ⏳ (2 pecs co-shade) |
| chest | `pec_lower` | Pectoral inferior | chest | ⏳ |
| back | `lat` | Dorsal ancho | upper-back | ✅ |
| back | `trap` | Trapecio | trapezius | ✅ |
| back | `rhomboids` | Romboides | upper-back | ⏳ (co-shades with lat) |
| back | `lower_back` | Lumbar / erectores | lower-back | ✅ |
| arms | `biceps` | Bíceps | biceps | ✅ |
| arms | `tri_long` | Tríceps cabeza larga (overhead) | triceps | ⏳ (2 heads co-shade) |
| arms | `tri_lateral` | Tríceps cabeza lateral/medial (pushdown) | triceps | ⏳ |
| arms | `forearms` | Antebrazos | forearm | ✅ |
| core | `abs_upper` | Abdomen superior | abs | ⏳ (co-shades with lower) |
| core | `abs_lower` | Abdomen inferior | abs | ⏳ |
| core | `obliques` | Oblicuos | obliques | ✅ |
| legs | `quads` | Cuádriceps | quadriceps | ✅ |
| legs | `hamstrings` | Isquiosurales | hamstring | ✅ |
| legs | `glutes` | Glúteos | gluteal | ✅ |
| legs | `adductors` | Aductores | adductors | ✅ |
| legs | `calves` | Gemelos | calves | ✅ |
| legs | `tibialis` | Tibial anterior | tibialis | ✅ |
| *(special)* | `full_body` | Cuerpo completo | — (footnote) | n/a |

**Granularity decisions (approved):**
- **No** glute (max/med) or quad (rectus/vastus) subdivision — the art collapses
  them anyway and it complicates tagging for no visible gain. Revisit only if a
  recommendation feature genuinely needs them as pure data.
- **Triceps split** = `tri_lateral` (pushdown / lateral+medial heads) vs
  `tri_long` (overhead / long head) — the real anatomical distinction the user
  asked for ("empuje hacia abajo vs hacia arriba").
- `rhomboids` exists as a code (for tagging/recommendations) though it co-shades
  with `lat` on the current art.
- `full_body` unchanged from F-4: footnoted, never shades.

**Naming / search:** group "Hombro" makes a "hombro" search return all three
delts; specific names stay anatomical. Optional lay-term **search aliases**
(e.g. "hombro delantero" → `delt_front`) deferred to the UI section (4).

### P1(a) — the body-art decision (binding)

MuscleWiki art is **rejected** and stays rejected — D-F10(c): it is proprietary
and the repo is public, so vendoring it is a licensing violation. The user
confirmed **option (a)**: refine the full taxonomy in **data** now, and let the
heatmap render with the **current MIT art** (which already distinguishes
abs/obliques, trapezius/upper-back/lower-back, quadriceps/adductors,
calves/tibialis — so core, back and legs gain visible detail immediately;
shoulders, chest and triceps co-shade until license-clean finer art appears).
When finer free art arrives, only the skin's region map changes — no data/model
change.

---

## 4. DECIDED — Section 2: schema & data model

### a) `muscles` dictionary table (Option 2 — relational dictionary), structure-only

**Approved: the table holds structure only; names + group labels live in i18n**
(extends the existing `exerciseDialog.primaryMuscle.<code>` keys — single
translation source, consistent with the bilingual convention / D-E2). No
`name_es`/`name_en` columns. `muscle_group` is a **code** (`shoulders`), not a
localized word.

```sql
create table public.muscles (
  code             text primary key,        -- 'delt_front', 'lat', 'tri_long', ...
  muscle_group     text not null,           -- 'shoulders'|'chest'|'back'|'arms'|'core'|'legs'
  body_region_slug text,                     -- maps to the skin region; null for full_body
  display_order    int  not null default 0,
  is_full_body     boolean not null default false
);
```

Seeded with the 22 specific codes + `full_body`. `body_region_slug` values come
from the current MIT skin's region set (`deltoids`, `chest`, `upper-back`,
`trapezius`, `lower-back`, `biceps`, `triceps`, `forearm`, `abs`, `obliques`,
`quadriceps`, `hamstring`, `gluteal`, `adductors`, `calves`, `tibialis`).

### b) `exercises` changes

- `primary_muscle text` → **`primary_muscles text[] not null default '{}'`**
  (multiple primaries; each counts 1.0 in the heatmap).
- `secondary_muscles text[]` kept, re-tagged to the fine taxonomy.
- **Integrity via trigger** (a CHECK cannot reference another table): a
  `BEFORE INSERT/UPDATE` trigger `validate_exercise_muscles` asserting both
  arrays ⊆ `(select code from muscles)`. Replaces the current static coarse-12
  CHECK on `primary_muscle` and the `secondary_muscles` subset CHECK.
- **Re-tag the 34 system rows** into fine codes (in-place, no backfill — no prod
  users).

### c) Weighting semantics (approved)

Each **primary** mover counts **1.0**, each **secondary** counts **0.5** (extends
the F-4 `SECONDARY_SET_WEIGHT`). Multiple primaries each get 1.0 — a bench press
tagged `pec_lower` + `delt_front` credits 1.0 to each. This does not conserve
sets (a set may spread >1.0 of stimulus across muscles), which is correct for an
*activity* heatmap (relative stimulus, not a set count). Warm-ups still excluded;
`full_body` still footnoted, not shaded.

### d) Code touch-points (from grep — for the plan, not yet implemented)

| Layer | File | Change |
|---|---|---|
| core | `src/core/muscleVolume.ts` | read `primary_muscles[]`, each +1.0 |
| core | `src/core/training.ts` | coach `muscle-recency` rule: single → multiple primaries |
| UI | `src/features/training/components/ExerciseDialog.tsx` | primary → grouped **multi-select** |
| UI | `ExercisePicker.tsx` / `ExerciseBlock.tsx` / `EntrenamientoPage.tsx` | read arrays |
| data | `src/features/training/exercises/api.ts` | search filter by code |
| data | `src/features/training/muscleMap/api.ts` | PostgREST select string `primary_muscle`→`primary_muscles` — ⚠ verify vs real DB (escapes typecheck) |
| types | `src/types/database.ts` | regenerate |
| i18n | translations | 22 muscle labels + 6 group labels, ES+EN |
| tests | Tier-1 `muscleVolume`/`training`, Tier-2 dialog | update + add |

### e) Migration

One Project-A migration: create + seed `muscles`; `alter exercises` (add
`primary_muscles`, migrate the single `primary_muscle` value into the array, drop
the old column); add the validation trigger; re-tag the 34 system rows. In-place,
no backfill. Will be exercised by the now-required R-16 Tier-3 pgTAP db-test job
on `develop` (free safety net).

---

## 5. DECIDED — Section 3: heatmap / body-art aggregation

The fine→art indirection **inverts** F-4's direction. Today the skin owns
`slugToMuscle` (slug → one coarse code). Now several fine codes share one slug
(`delt_front/side/rear` → `deltoids`), so the render layer **sums** the volume of
every fine code whose `body_region_slug` matches a slug. Co-shading falls out of
that sum for free.

**Decided:**
1. **`computeMuscleVolume` stays pure, emits volume per FINE code** (22 entries +
   `full_body` counted separately as today). The core never sees skin slugs.
2. **The render layer does the fine→slug aggregation.** The skin loses
   `slugToMuscle`; it only supplies SVG paths + viewBox + its slug set. The
   `code → body_region_slug` map is data.
3. **Ranked "Muscle · N sets" list renders at FINE resolution**
   ("Deltoides anterior · 3 sets") even where the drawing co-shades — the point
   of fine data is a precise list under a coarse picture.
4. **Runtime source of the structural map = a canonical TS module**
   (`src/core/muscles.ts`: `{code, group, bodyRegionSlug, displayOrder,
   isFullBody}[]`) — chosen over fetching the `muscles` table (option a). The DB
   `muscles` table **mirrors** this structure and exists for the validation
   trigger / referential integrity (invariant #2 holds for *integrity*; the
   23-row structure is stable enough to mirror in TS, consistent with F-4
   hardcoding `MUSCLE_CODES`). A drift-guard test asserts TS const == DB seed.
   The pure core stays Tier-1 testable (no fetch).

## 6. DECIDED — Section 4: ExerciseDialog tagging control + picker filter

**Tagging control (in `ExerciseDialog`) = single grouped tri-state list (B1).**
One list of the 22 fine muscles under the 6 group headers (all visible — **no
search, no accordion** in the control; YAGNI for 22 grouped pills). Each muscle
is **one pill that cycles** `neutral → Primary (filled) → Secondary (outline) →
neutral`. Clarity (user requirement) comes from: a one-line instruction ("1 tap →
Primary · 2 → Secondary · 3 → remove"), a legend ("Primary · counts 1.0" /
"Secondary · counts 0.5"), and an in-pill **PRIM/SEC badge** plus the colour.
Primary↔secondary conflict is impossible by construction (one state per muscle).
Replaces today's single-select primary dropdown + flat secondary pills.

**Picker muscle filter (`ExercisePicker`).** The `<select>` grows from 12 to 22
options → **group it with `<optgroup>`** by the 6 groups; filter by the **specific
fine muscle** (AND, primary-only, as today). **Group-level filtering** ("show all
shoulder exercises") is **deferred to Project B** (only 34 exercises in A).

**Text→muscle search.** Keeps working in A automatically — it is driven by
`PRIMARY_MUSCLE_VALUES` + i18n labels, so it now matches the 22 fine names for
free. Its query term changes per the array-operator note below. **Deferred to
Project B:** matching **group names** ("hombro" → all three delts) and any
lay-term **aliases**.

**Array filter operator.** Every PostgREST term `primary_muscle.eq.<code>`
becomes a contains-on-array `primary_muscles.cs.{<code>}` (dropdown AND filter +
text-match OR terms). This is the string that **escapes the typecheck** — must be
verified against a real DB at implementation (see §4.d touch-points).

## 7. DECIDED — Section 5: i18n, code naming & tests

### a) i18n
- The muscle-name block is **renamed** `exerciseDialog.primaryMuscle.<code>` →
  **`exerciseDialog.muscle.<code>`** (it serves primaries, secondaries *and* the
  grouped control — "primaryMuscle" was already a misnomer; the dialog is
  rewritten for B1, so the rename cost is small). Update all
  `t('exerciseDialog.primaryMuscle.…')` refs (dialog + `ExercisePicker`
  `labelByCode`).
- Block re-keyed to the **22 fine codes + `full_body`**, ES + EN, names per the
  §3 taxonomy table: Deltoides anterior/lateral/posterior, Pectoral
  superior/inferior, Dorsal ancho, Trapecio, Romboides, Lumbares, Bíceps,
  Tríceps (largo), Tríceps (lateral), Antebrazos, Abdomen superior/inferior,
  Oblicuos, Cuádriceps, Isquiosurales, Glúteos, Aductores, Gemelos, Tibial
  anterior. (`hamstrings` label moves from the old "Femorales" to "Isquiosurales"
  per §3; `full_body` "Cuerpo entero" → "Cuerpo completo".)
- New block **`exerciseDialog.muscleGroup.<group>`**, 6 labels: Hombro · Pecho ·
  Espalda · Brazos · Core · Piernas (EN: Shoulder/Chest/Back/Arms/Core/Legs).

### b) Code naming
- **`src/core/muscles.ts`** exports `MUSCLES`
  (`{code, group, bodyRegionSlug, displayOrder, isFullBody}[]`) as the canonical
  structural source; `MUSCLE_CODES`, `MUSCLE_GROUPS`, `PRIMARY_MUSCLE_VALUES`,
  `SECONDARY_MUSCLE_VALUES` all derive from it. `MuscleCode` becomes the union of
  the 22 fine codes.

### c) Tests
- **Tier-1 `muscleVolume`** — 22-code shape; **multiple primaries each +1.0**;
  secondary +0.5; `full_body` counted separately; warm-up excluded; window bound.
- **Tier-1 `training`** — coach `muscle-recency` rule with multiple primaries.
- **Tier-1 anti-drift** — `MUSCLES` code set == expected 23; paired with a
  **Tier-3 pgTAP** assertion that the `muscles` table seed == the same 23 codes,
  so TS and DB cannot drift.
- **Tier-2 `ExerciseDialog`** — tri-state cycle (tap → primary → secondary →
  remove), grouped render, submit yields `primary_muscles[]` +
  `secondary_muscles[]`. Mock the create hook (component-test Supabase-env
  gotcha).
- **Tier-3 pgTAP** — `validate_exercise_muscles` rejects unknown codes; migration
  re-tags the 34 rows; `muscles` seed present.

---

## Deferred — Project B (bulk catalog content, separate spec)

Scale: no cap, one row per equipment variant, near-duplicates allowed (e.g.
leg-press ≠ hack/quad machine). **Key risk to design for:** accurate fine
anatomical tagging at scale must lean on a credible anatomical source + a
verification step, not be tagged by guess. **Also rolled into B** (deferred from
Project A): group-level picker filtering ("show all shoulder exercises"),
group-name text search ("hombro" → all three delts), and lay-term search aliases.
Project A must land first (you cannot fine-tag exercises until the taxonomy
exists).

## Decisions log (this session)
- R-01 Phase-2 reaper deferred indefinitely (separate, already committed PR #148) — unrelated, noted for context.
- P1 = (a): fine data, heatmap on current MIT art.
- P2 muscle dictionary = Option 2 (relational `muscles` table), **structure-only, names in i18n**.
- Weighting: each primary 1.0, secondary 0.5.
- A/B decomposition approved; spec A first.
- Taxonomy table (§3) approved as-is; deltoid group label = "Hombro".
- No glute/quad sub-splits.
- §3 aggregation: core emits fine codes; render layer sums fine→slug; ranked list at fine resolution; structural map = canonical TS const (`muscles.ts`), DB table mirrors for the trigger, anti-drift test.
- §4 tagging UX = single grouped tri-state list (B1: instruction + PRIM/SEC badge + colour). Picker `<select>` optgroup'd, filter by specific fine muscle; group-level filter / group-name search / aliases deferred to Project B. Array operator `…eq` → `…cs.{}`.
- §5 i18n block renamed `primaryMuscle`→`muscle`, re-keyed to 22 fine codes + `muscleGroup.<group>`; `muscles.ts` canonical const; Tier-1/2/3 coverage incl. anti-drift.
