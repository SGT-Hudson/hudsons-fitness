# Catalog Ingestion from free-exercise-db (Project B1) — design spec

**Status: DESIGN COMPLETE (2026-06-04), user-approved.** Ready for an
implementation plan. This is **Project B1** (data + ingest). Project B2
(exercise detail UI: instructions + images) is a separate, later spec.

**Depends on Project A** (fine muscle taxonomy — `src/core/muscles.ts`,
`muscles` table, `exercises.primary_muscles[]`, the validation trigger). Project
A is implemented and in review as **PR #155 → develop**. B1 branches off
`develop` **after A merges**.

**Roadmap:** delivers the standing "exercise catalog expansion" goal at scale by
ingesting the public-domain **free-exercise-db** (873 exercises). R-id/D-id to be
filed at plan time.

---

## 1. Goal

Grow the `exercises` shared pool from the 34 hand-tagged system rows to the full
**free-exercise-db** catalog (873 exercises), each carrying our fine muscle tags,
bilingual names, equipment, and rich metadata (level/mechanic/force/category +
image references). This makes the picker comprehensive and seeds the data the
future training "modes" (crossfit, cardio/runner…) and the B2 detail UI will use.

## 2. The source dataset (verified 2026-06-04)

**`yuhonas/free-exercise-db`** — **Unlicense (public domain)**, so vendoring
names, data, and image references in our public repo is license-clean.

- **873 exercises**, English-only.
- Each record: `id, name, force, level, mechanic, equipment, primaryMuscles,
  secondaryMuscles, instructions, category, images`.
- **Verified distinct values:**
  - `equipment` (12 + null): barbell (170), dumbbell (123), other (122), body
    only (111), cable (81), machine (67), kettlebells (53), bands (20), medicine
    ball (17), exercise ball (12), foam roll (11), e-z curl bar (9), null (77).
  - `category` (7): strength (581), stretching (123), plyometrics (61),
    powerlifting (38), olympic weightlifting (35), strongman (21), cardio (14).
  - `level` (3): beginner, intermediate, expert.
  - `mechanic` (2 + null): compound (489), isolation (297), null (87).
  - `force` (3 + null): pull (371), push (369), static (104), null (29).
  - `primaryMuscles`/`secondaryMuscles` (17 codes): abdominals, abductors,
    adductors, biceps, calves, chest, forearms, glutes, hamstrings, lats, lower
    back, middle back, neck, quadriceps, shoulders, traps, triceps.
  - **`primaryMuscles` length is always exactly 1** (single primary per
    exercise); `secondaryMuscles` up to 10; every exercise has 1–2 images;
    instructions up to 24 steps.
- **Images** served via jsDelivr over the GitHub repo (see §6).

## 3. Scope decisions

- **Ingest all 873 exercises across all 7 categories** (incl. stretching/cardio).
  Rationale: future training "modes" (crossfit, cardio/runner) will filter by
  `category`. Non-resistance exercises simply carry empty `primary_muscles` and
  never shade the heatmap (the engine already counts that as a working set with
  no shading).
- **Instructions are deferred to B2** (their only consumer is the detail UI; the
  expensive ES translation of ~873 instruction sets is scheduled with that
  consumer). **Image references are stored in B1** (cheap) though rendered in B2.
- **Picker:** B1 adds only the **group-level muscle filter**. Group-name text
  search, lay-term aliases, and category/equipment/level filters are deferred
  (the latter pair belong with the future "modes").

## 4. Taxonomy extension — 22 → 24 muscles

B1 extends Project A's taxonomy so the import is **lossless** (the dataset's 17
coarse muscles all map cleanly):

| new code | group | bodyRegionSlug | shading |
|---|---|---|---|
| `neck` | back | `neck` | **own region** — the MIT skin has a `neck` part (front+back), currently unmapped; shades on its own |
| `abductors` | legs | `gluteal` | **co-shades** on glutes (no abductors art region yet) — same pattern as the 3 delts on `deltoids` (P1(a)); ranked list still shows "Abductores · N" precisely |

This touches (all in B1): `src/core/muscles.ts` (+2 entries, now 24 shadeable +
`full_body`), the `muscles` table seed, i18n `exerciseDialog.muscle.*` (+2 ES/EN
names: "Cuello"/"Neck", "Abductores"/"Abductors"), the anti-drift unit test
(expects 24 shadeable / 25 total codes), and the Tier-3 pgTAP `05_muscles` seed
assertion (25 codes).

## 5. Equipment extension — 8 → 12 values

Extend the equipment vocabulary to a superset of the dataset (our naming —
singular, snake_case) so the import loses no equipment fidelity:

`barbell, dumbbell, kettlebell, ez_curl_bar, machine, cable, bodyweight, band,
medicine_ball, exercise_ball, foam_roller, other`

**Dataset → ours (1:1, lossless):** `body only`→`bodyweight`, `bands`→`band`,
`kettlebells`→`kettlebell`, `e-z curl bar`→`ez_curl_bar`, `medicine
ball`→`medicine_ball`, `exercise ball`→`exercise_ball`, `foam roll`→`foam_roller`;
barbell/dumbbell/cable/machine/other identical; missing→`null`.

Touches: `EQUIPMENT_VALUES` (`exercises/api.ts`), the `exercises.equipment`
CHECK, i18n `exerciseDialog.equipment.*` (+4 ES/EN: Barra Z/EZ curl bar, Balón
medicinal/Medicine ball, Pelota de ejercicio/Exercise ball, Rodillo de
espuma/Foam roller), and `DOUBLE_PROGRESSION_DEFAULTS.incrementByEquipment`
(`ez_curl_bar`→1.0; the other three rely on the existing `?? fallback`).

## 6. Image strategy

Store the **relative path only** in `exercises.images text[]` (e.g.
`Barbell_Curl/0.jpg`). A small URL helper builds the full CDN URL from a pinned
base:

```
https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@<PINNED_SHA>/exercises/<relative-path>
```

jsDelivr = free, reliable CDN, zero storage, zero repo bloat. Decoupling host
from data (only relative paths stored) means a later move to Supabase Storage or
premium art changes only the helper. Images are stored in B1, rendered in B2.

## 7. Fine-muscle mapping (the accuracy core)

Deterministic mapper: dataset coarse muscle (+ exercise name keywords + mechanic)
→ our fine code(s). Most are 1:1; **four coarse codes are ambiguous** and
disambiguate by name keyword (case-insensitive), else a default:

| coarse | rule |
|---|---|
| `chest` | `incline`→`pec_upper` · `decline`→`pec_lower` · else `pec_lower` |
| `shoulders` | `lateral raise`/`lateral`→`delt_side` · `rear`/`reverse`/`face pull`→`delt_rear` · `front raise`/press/`overhead`/`military`→`delt_front` · else `delt_side` |
| `triceps` | `overhead`/`skull`/`french`/`lying`→`tri_long` · `pushdown`/`kickback`/`dip`→`tri_lateral` · else `tri_lateral` |
| `abdominals` | `leg raise`/`reverse`/`hanging`→`abs_lower` · else `abs_upper` |

**1:1 maps:** abductors→`abductors`, adductors→`adductors`, biceps→`biceps`,
calves→`calves`, forearms→`forearms`, glutes→`glutes`, hamstrings→`hamstrings`,
lats→`lat`, lower back→`lower_back`, middle back→`rhomboids`, neck→`neck`,
quadriceps→`quads`, traps→`trap`. (`tibialis` is in our taxonomy but unused by
this dataset — harmless.)

**Single-primary acceptance (consistency gap, accepted).** The dataset has
exactly one primary per exercise, so imported compounds get **1 fine primary + N
secondaries** while the hand-tagged 34 use **multiple primaries (1.0 each)**.
The same lift therefore weighs differently in the heatmap depending on origin.
**Decision: accept it.** The 34 are `is_verified=true` ("premium"); imports are
`is_verified=false` and directionally correct, refined over time. The linter
flags big compounds so the user may optionally promote a secondary to co-primary
during review. (Rejected: auto-promotion — too fuzzy; re-tagging the 34 to single
primary — downgrades better data and abandons the multi-primary feature.)

## 8. Verification — `is_verified` + a low-confidence linter

- Reuse the existing `exercises.is_verified` column. The 34 hand-tagged rows stay
  `true`; **every imported row enters `is_verified=false`**. The picker already
  orders verified-first, so curated rows surface above imports for free.
- A **linter** (runs inside the ingest build) emits `ingest-report.csv` listing
  only **low-confidence** rows for human review — those that hit an ambiguous
  default, big compounds (candidates for co-primary promotion), a sanity
  mismatch (e.g. a name containing "curl" with no `biceps`), or empty
  `primary_muscles` on a non-cardio/stretching exercise. The user reviews **that
  subset**, not 873 rows, flipping reviewed rows to `is_verified=true`.
- **Honest framing:** fine tags derived from coarse data are never perfect; they
  are directionally right. `is_verified` + the linter make this manageable.

## 9. Ingest pipeline

A **dev-only** build script (NOT run in CI). The committed artifacts (migration,
ES name map, report) are what gets reviewed and shipped.

- **`scripts/ingest-exercises.ts`**:
  1. Reads a copy of `dist/exercises.json` pinned to a specific free-exercise-db
     commit SHA (vendored as a build input under `scripts/data/` so the build is
     reproducible offline).
  2. Per record → transform: equipment map (§5), pass `category/level/mechanic/
     force`, fine-muscle map (§7), build `images` relative paths, set
     `external_id` = dataset `id`, `is_verified=false`, `source='free-exercise-db'`.
  3. Merge ES names from a **committed `scripts/data/es-names.json`** (generated
     once with LLM assistance, reviewable) → `name_es`. `name_en` = dataset name.
     A record with no ES mapping is flagged by the linter (not silently shipped).
  4. Run the linter → write `ingest-report.csv`.
  5. Emit the idempotent SQL seed migration (§10).
- **`scripts/exerciseMapper.ts`** + **`scripts/exerciseMapper.test.ts`**: the
  pure coarse→fine mapper + disambiguation rules, unit-tested (Tier-1). The
  linter rules live alongside and are tested too.

## 10. Schema & migration (B1)

One migration (in addition to the §4 muscles + §5 equipment changes):

```sql
alter table public.exercises
  add column if not exists level       text,
  add column if not exists mechanic    text,
  add column if not exists force        text,
  add column if not exists category    text,
  add column if not exists images      text[] not null default '{}',
  add column if not exists external_id text;

create unique index if not exists idx_exercises_external_id
  on public.exercises (external_id) where external_id is not null;

alter table public.exercises drop constraint if exists exercises_level_check;
alter table public.exercises add constraint exercises_level_check
  check (level is null or level = any (array['beginner','intermediate','expert']));
-- analogous CHECKs for mechanic (compound|isolation), force (push|pull|static),
-- category (strength|stretching|plyometrics|powerlifting|olympic weightlifting|
-- strongman|cardio).

-- widen source to allow the import provenance
alter table public.exercises drop constraint if exists exercises_source_check;
alter table public.exercises add constraint exercises_source_check
  check (source = any (array['manual','system','free-exercise-db']));
```

The **generated seed** (873 rows, idempotent per-row):

```sql
insert into public.exercises
  (name_es, name_en, primary_muscles, secondary_muscles, equipment, level,
   mechanic, force, category, images, external_id, is_verified, source,
   created_by_user_id)
values
  (...873 generated rows..., false, 'free-exercise-db', null)
on conflict (external_id) do update set
  name_es = excluded.name_es, name_en = excluded.name_en,
  primary_muscles = excluded.primary_muscles,
  secondary_muscles = excluded.secondary_muscles,
  equipment = excluded.equipment, level = excluded.level,
  mechanic = excluded.mechanic, force = excluded.force,
  category = excluded.category, images = excluded.images;
```

`on conflict (external_id) do update` makes re-running the migration idempotent.
**Deferred concern:** a future re-import must not clobber human refinements
(`is_verified=true` rows / hand-edited tags) — out of scope for B1 (first import,
no refinements yet); the upsert deliberately does **not** overwrite
`is_verified`.

## 11. Picker — group-level muscle filter (only picker change in B1)

The existing `<select>` (now optgroup'd over 24 fine muscles from Project A) gains
a **group-level option per group** ("Hombro — todos", "Piernas — todos", …) that
filters by **any** muscle in the group. Implemented with PostgREST array overlap
(`primary_muscles.ov.{delt_front,delt_side,delt_rear}`). Primary-only AND filter,
consistent with the fine-muscle filter.

> ⚠ The `.ov.{…}` (overlap) and `.cs.{…}` (contains) strings escape the
> typecheck — verify against a real DB (the `db-test` CI job).

Deferred (not B1): group-name text search, lay-term aliases, category/equipment/
level filters (the latter belong with future "modes").

## 12. Testing

- **Tier-1** `scripts/exerciseMapper.test.ts` — the 4 disambiguations (each
  branch + default), the 1:1 maps, neck/abductors, and linter flag conditions.
- **Tier-1** `muscles.test.ts` (Project A's) updated — 24 shadeable codes incl.
  neck/abductors with correct groups/slugs.
- **Tier-2** picker — group-level option renders and issues an overlap filter.
- **Tier-3 pgTAP** — `05_muscles` updated to 25 codes; new asserts: the equipment
  CHECK accepts the 12 values and rejects a bogus one; `category/level/mechanic/
  force` CHECKs; `external_id` unique; after the seed, row count jumps by 873 and
  every imported row has `source='free-exercise-db'` + `is_verified=false`.

## 13. Decisions log
- Ingest all 7 categories / 873 exercises (future modes filter by `category`).
- Bilingual: names ES+EN in B1; instructions + their ES translation deferred to B2.
- Images: jsDelivr + relative path + URL helper; stored B1, rendered B2.
- Taxonomy 22→24: +neck (group back, own `neck` region) +abductors (group legs,
  co-shades on `gluteal`); landed in B1.
- Equipment 8→12 (lossless superset of the dataset).
- Mapper: 1:1 + 4 disambiguations (chest, shoulders, triceps, abdominals).
- Single-primary import accepted; `is_verified=false` + linter (option a).
- Idempotent upsert on `external_id`; re-import-vs-edits deferred.
- Picker: group-level filter in B1; group-name search / aliases / category-equipment-level
  filters deferred.

## Deferred — Project B2 (exercise detail UI, separate spec)
Render instructions (translated to ES at that point) + images + level/mechanic/
force/category in an exercise detail view. Consumes B1's data.
