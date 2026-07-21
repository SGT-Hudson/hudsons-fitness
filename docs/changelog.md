# Changelog

Append-only record of shipped work. Pending work lives in `roadmap.md`;
decision rationale in `decisions.md`.

## Contents
- [Sprints](#sprints)
- [PR table](#pr-table)

## Sprints

- **Fundamentos** — Auth, profile, layout, router, i18n base.
- **Sprint 1 — Métricas** — `body_measurements`, ProgresoPage list, LatestMeasurementCard with stale banner.
- **Polish/Deploy** — Vercel SPA rewrite, ErrorBoundary, bone weight bug fix (max 20kg).
- **Sprint 2A — Ingredientes** — Ingredient library (OFF search + manual + import); shipped combined with Polish/Deploy.
- **Sprint 2B — Recetas** — Soft-delete recipes, live macros panel, `save_recipe` RPC.
- **Sprint 3 — Diario** — Meal logs grouped by mealtype, DateNavigator, DayTotalsCard, 3-mode entry (recipe / ingredient / custom).
- **Sprint 4 — Plantillas + Planificador** — Templates with 7×N grid, ApplyTemplateDialog, SaveAsTemplateDialog, divergence tracking.
- **Sprint 5 — Objetivos/Fases** — Goal singleton, phases CRUD, `computePhaseTargets`, DayTotalsCard targets + progress bars.
- **Sprint 5 fix** — Align phases code with DB schema (kcal_mode/fiber_mode enums, fat_pct fraction↔percent).
- **Sprint 6 — Settings completos** — Language toggle (persisted to `profiles.language`), biometrics editor (sex/birth_date/height/bone), sign out.
- **Sprint 7 — Progreso gráficas** — WeightChart (raw + MA5) and CompositionChart (% stacked w/ linear interpolation); shared 30d/90d/1y/all pills.
- **Sprint 7 fix** — Composition chart Y-axis capped at 100%; body fat moved to bottom of stack.
- **Sprint 8 — Toasts** — shadcn toast/toaster/useToast; success/destructive variants; wired into all mutation hooks via toast-helpers.
- **Sprint 9 — Edge Functions + cron** — `daily-nutrition-snapshot`, `weekly-rollover`, `recalculate-tdee` (Deno), pg_cron + pg_net jobs, admin RPC `apply_template_to_week_admin`.
- **Sprint 10 — Diario ↔ Plan** — Plan slots auto-materialize as `from_plan` meal_logs (idempotent via `plan_week_slot_id` dedup) on DiarioPage load; same logic added to `daily-nutrition-snapshot` for days never opened.
- **Sprint 11 — Progreso macros chart** — `MacrosChart` on /progreso reading `daily_nutrition_history`; macro selector (kcal/protein/carbs/fat/fiber), planned + consumed + active-phase target reference line, gaps broken at nulls.
- **Sprint 12 — Code splitting** — `manualChunks` (recharts/supabase/i18n/radix/react-vendor/react-query) + `/progreso` lazy-loaded. First-paint JS 351 KB → 69 KB gz; recharts deferred until /progreso.
- **Sprint 13 — Loading skeletons** — New `Skeleton` primitive; replaces "Cargando…" text on Diario, Recetas, Planificador, Plantillas.
- **Sprint 14 — Dark mode** — `ThemeProvider` (light/dark/system, localStorage `hf-theme`); FOUC-prevention inline script in `index.html`; toggle in Settings Appearance card.
- **Sprint 15 — PWA** — `vite-plugin-pwa` with workbox generateSW; manifest (HF monogram SVG icon, theme color `#16a34a`, standalone); Supabase requests bypass cache (NetworkOnly).
- **Sprint 16 — GDPR delete-account** — Edge function `delete-account` verifies caller JWT then `auth.admin.deleteUser`; CASCADE cleans user data. Two-step email-confirm dialog in Settings.
- **Sprint 17 — Review fixes** — TDEE wired to frontend (`features/tdee`) so `tdee_delta` phases show targets; lean-mass protein behavior documented in PhaseDialog + architecture; 7 sites switched from UTC slice to `isoDate()`; ingredient delete maps Postgres FK 23503 to friendly "in use" toast.
- **Process — develop-branch ship flow** — two-tier `develop`→`main` flow; feature PRs auto-merge to `develop`, production via reviewed promotion (D-F7).

### 2026-05-17 — Conventions review + doc-rework

- Completed the 34-item conventions review (rulings in `decisions.md`, backlog in `roadmap.md`).
- Executed D-F2 — repo made public, CI workflow + `main` branch protection (`lint-build`) + GitHub auto-merge enabled, `main` reconciled via PR #17 and production redeployed (ended ~7-sprint staleness).
- Consolidated all docs into `docs/` (this rework).

### 2026-05-20 — R-19 Training MVP — Phase 1 (staged on `claude/training-mvp-impl`, awaiting Wave-3)

- 4 staged migrations: `exercises` shared pool (post-R-01 shape, bilingual names, per-exercise `default_increment_kg`, 34-row system seed), `workout_sessions` + `workout_sets` (RLS-via-join on sets, no denormalised user_id), `save_workout` INVOKER RPC (replace-children, mirrors `save_recipe`), and `exercises` RLS (verbatim copy of the post-R-01 ingredients policies).
- `src/types/database.ts` hand-edited with the 3 new tables + the RPC (interim until R-04 regen).
- `src/features/training/`: exercises api/hooks/picker/dialog (bilingual trigram search + auto-suggested load increment from equipment); sessions api/hooks/schema; SetRow with last-working-set placeholder (§6); CoachSuggestions rendering the 5 `MVP_COACH_RULES` from `core/training.ts` with editable progression-rule suggestions (§0.15); ExerciseBlock composing picker + coach + sets; SessionEditor with FormProvider + nested useFieldArray; SessionList and ExerciseHistory views.
- 3 new pages (`EntrenamientoPage`, `SessionEditorPage`, `ExerciseHistoryPage`) wired into `src/app/router.tsx` and an `entrenamiento` nav link added to `AppLayout`.
- Two new i18n namespaces (`entrenamiento`, `coach`) shipped complete in ES + EN; nav.json gains the `entrenamiento` label.
- Test coverage: `exercises/api.test.ts` (12 unit tests on `suggestIncrementForEquipment` + `exerciseDisplayName`), `schema.test.ts` (17 zod tests on set/block/session bounds), `SessionEditor.test.tsx` (Tier-2 jsdom test asserting the flatten-on-submit logic against a pre-filled session — exercise grouping preserved, set_index re-indexed from 1 within each block).
- Tier-3 pgTAP for RLS / RPC / save-workout-replace-children still gated behind R-16-Tier-3 / `supabase start` infra (documented gap, same as R-01).
- Migrations are STAGED — not auto-applied. Wave-3 apply procedure documented in `docs/operations.md`.

### 2026-05-20 — R-01 ★ Library Contribution & Lifecycle Model (Phase 1)

- Applied the 8 R-01 Phase 1 migrations to prod via Supabase MCP `apply_migration` (anon seed → ref tables → backfill → drop `recipes.deleted_at` + rename `user_id`→`created_by_user_id` → `hide_owned_*` RPCs → `save_recipe` ext → `reconcile_account_delete` DEFINER → RLS rewrite).
- Added a 9th follow-up migration (`r01_backup_table_rls`) to enable RLS on the rollback snapshot `_r01_recipes_owner_backup` (advisor gap, deny-all by no-policies).
- Redeployed the reworked `delete-account` edge function (version 2) — runs `reconcile_account_delete` before `auth.admin.deleteUser`.
- Flipped the `data-model.md#library-model` "target model" preamble + the matching `features.md` callouts; CLAUDE.md invariant #3 now lists `reconcile_account_delete` as the second live `SECURITY DEFINER` exception.
- Phase 2 auto-reaper remains blocked on the deferred ratings/voting signal — see R-01 in `roadmap.md`.

### 2026-05-21 — R-20 Barcode scanning

- Camera + manual-EAN barcode lookup in the New Ingredient dialog, resolving via the new OFF v2 `getProductByBarcode` adapter into the existing prefill flow. Native `BarcodeDetector` fast-path with a lazy `@zxing/browser` fallback (iOS Safari); EAN-13/8 + UPC-A, every decode re-validated by `isValidEan`. Client-only, no migration.

### 2026-05-21 — R-21 OFF contribute-back — REMOVED (same day)

- Built, shipped, then pulled as a product decision before activation (it never pushed anything to OFF — the account/secrets were never finalised). Removed the `off-contribute` edge fn, `core/offContribute.ts`, `lib/offContribute.ts`, the `contributeToOff` trigger in IngredientDialog, the Settings opt-out toggle, and the `profiles.contribute_to_off` column (drop migration `20260524120000`). Barcode scanning (R-20) is unaffected — only the upload-to-OFF is gone. The 404 banner copy lost its "so others can scan it" line.

### 2026-05-21 — R-21 OFF contribute-back (implemented, pending Wave-3)

- When a user creates a barcoded product OFF lacked, or completes an incomplete one, the app pushes the objective data back to Open Food Facts under a single app account (new `off-contribute` edge fn; server-side fill-missing-only for completions), gated by a default-on `profiles.contribute_to_off` toggle in Settings. Eligibility gate (name + kcal + Atwater ±20% + gram-only) lives in the pure `core/offContribute.ts` (Tier-1). Fire-and-forget — never blocks the user. The scanned barcode now persists as `external_id` on manual create (with dedupe), and a 404 auto-switches to the manual tab with a "not in OFF yet — add it" banner. STAGED migration (`profiles.contribute_to_off`); OFF account + edge secrets are the pending Wave-3 step.

### 2026-05-26 — R-23 F-3 guided active-workout runner + review fixes

- **Guided runner (#132).** A "start workout" runner launched from today's slot
  (`/training/run`, `RunnerPage`) that walks the user through the active routine —
  warm-ups then working sets — with a rest timer, per-set prefill-from-last,
  inline logging, and a single atomic save at the end. The whole state model is a
  **pure reducer** in `src/core/runner.ts` (`buildRunnerState` / `runnerReducer` /
  selectors `nextPendingIndex` / `focusIndex` / `skippedUndoneIndices` /
  `toSaveWorkoutSets`, plus `computeTimerView`); the UI lives in
  `src/features/training/runner/` (orchestrator `Runner.tsx` + screen components)
  with three browser hooks — `useRestTimer` (timestamp-based, survives
  backgrounding), `useRunnerDraft` (localStorage mirror + resume), `useWakeLock` —
  and a capability-guarded `fireRestAlarm`. Per-set prefill via the new
  `prefillSetsForExercise` in `src/core/training.ts`. **No schema/RPC change** —
  reuses `save_workout` (already takes `rpe`/`is_warmup`/`p_program_id`/`p_routine_id`).
- **Review fixes (#133, #134).** Bottom-pinned actions on every runner screen;
  borderless working-weight stepper; **RPE is whole-numbers-only** (picker/target/
  routine-builder + zod `.int()`); rest-aware READY button ("Empezar serie" stops a
  carried-over rest, then "Iniciar descanso"); "skip current" targets the up-next,
  never the just-finished exercise; **End exercise** early-finish keeping recorded
  sets (no fake 0/0); performance colours on logged reps/weight (green > / white = /
  amber < the expected value); header shows `routine · Ej x/N` with a persistent
  "Cambiar" exercise-switch button (hidden on the review screens).
- **Switch-exercise fix (#135).** Leaving an exercise mid-workout no longer strands
  it (it was stuck `active` → shown as "jump" but un-clickable). The left exercise is
  demoted to **`partial`** (work logged → kept + resumable) or **`pending`** (nothing
  logged), both jumpable again; a confirmation warns before leaving a partial one.
- Persistence is client-only (localStorage `hf:runner:draft:v1`) with a resume
  prompt; **no DB writes mid-workout** and **no cross-device resume** (deliberate).
  Spec `docs/superpowers/specs/2026-05-25-training-guided-runner-design.md`, plan
  `docs/superpowers/plans/2026-05-25-training-guided-runner.md`.

### 2026-05-26 — R-24 F-4 muscle activity heatmap

- **Heatmap (#136).** A muscle-activity heatmap on `/training`: a front+back body
  shaded grey→amber→red by how much each muscle has been trained, with a
  `Muscle · N sets` ranked list and a 7d/30d/6mo/all window (default 30d). Volume is
  a **pure core** — `computeMuscleVolume` in `src/core/muscleVolume.ts` (Tier-1
  tested): per working set the primary mover earns 1.0 and each secondary mover 0.5
  (`SECONDARY_SET_WEIGHT`), warm-ups excluded, `full_body` sets footnoted not
  shaded. The fetch (`features/training/muscleMap/api.ts`) uses two PostgREST
  `!inner` embeds + an embedded `session.performed_on=gte` window filter; UI in
  `features/training/muscleMap/` (`MuscleActivityView` / `MuscleBody` / `muscleColor`
  / `hooks`).
- **Schema (#136).** One additive migration `20260530120000_f4_secondary_muscles` —
  `exercises.secondary_muscles text[] not null default '{}'` + a subset CHECK (the 11
  specific codes; `full_body` excluded). No production users yet, so it re-tags the
  34 system-seed exercises in place (27 given secondaries, 7 isolation lifts left
  empty) with no backfill. A secondary-muscle multi-select was added to
  `ExerciseDialog`.
- **Pluggable body-art skin (#136).** A `BodyArtSkin` interface
  (`features/training/muscleMap/skins/`) decouples the artwork from the volume
  logic; v1 = vendored **MIT** art (react-native-body-highlighter lineage, LICENSE
  in-repo) whose ~23 region slugs aggregate up to the coarse-12 taxonomy.
  Proprietary art (MuscleWiki) was rejected (public repo).
- **Inline placement + gender follows profile (#139).** The map is embedded inline on
  `/training` (between today's plan and recent sessions — the standalone
  `MuscleActivityPage`/route was removed); male/female art auto-selects from
  `profiles.sex` reactively (manual toggle still overrides).
- Spec `docs/superpowers/specs/2026-05-26-muscle-heatmap-design.md`, plan
  `docs/superpowers/plans/2026-05-26-muscle-heatmap.md`. See R-24 / D-F10.

### 2026-06-04 — R-26 Project A — fine muscle taxonomy

- **Muscle model (#155).** Replaced the coarse-12 `primary_muscle` taxonomy with a
  22-code fine taxonomy in 6 groups (shoulders/chest/back/arms/core/legs) + the
  special `full_body` (later extended to 24 shadeable codes when #158 added `neck` +
  `abductors`). New `public.muscles` table — `code` (pk), `muscle_group`
  (CHECK), `body_region_slug`, `display_order`, `is_full_body`; RLS read-only
  (`muscles_select_all` SELECT-true, no write policy); 23 seed rows (22 shadeable
  codes + `full_body`). It mirrors `src/core/muscles.ts` (the canonical TS structural
  source), guarded by a pgTAP anti-drift test.
- **Exercises schema (#155).** `exercises.primary_muscle` (singular) was DROPPED and
  replaced by `exercises.primary_muscles text[] not null default '{}'` (MULTIPLE
  primaries); `secondary_muscles` retained, now fine codes. The old
  `exercises_primary_muscle_check` + `exercises_secondary_muscles_valid` CHECKs were
  dropped and replaced by trigger `trg_validate_exercise_muscles` →
  `public.validate_exercise_muscles()` (INVOKER, `set search_path=public`): asserts
  `primary_muscles ⊆ muscles.code` and `secondary_muscles ⊆ muscles.code WHERE NOT
  is_full_body` (a CHECK can't reference another table). All 34 system rows re-tagged
  to fine codes.
- **Heatmap (#155).** `computeMuscleVolume` (`src/core/muscleVolume.ts`) stays pure
  and now emits volume per FINE code; EACH primary mover earns 1.0 per working set
  (multiple primaries each 1.0 — stimulus not conserved across a set), each secondary
  0.5 (`SECONDARY_SET_WEIGHT`), warm-ups excluded, `full_body` footnoted. The render
  layer (`MuscleBody.tsx`) sums fine→slug via `codesForBodyRegion(slug)` from
  `core/muscles.ts`; the `BodyArtSkin` interface dropped `slugToMuscle` (moved into
  core). The ranked "Muscle · N sets" list renders at fine resolution even where the
  drawing co-shades. P1(a): fine data now, rendered on the current vendored MIT art
  (core/back/legs gain detail; shoulders/chest/triceps co-shade until license-clean
  finer art exists).
- **Tagging UI + filter (#155).** `ExerciseDialog` now uses `MuscleTagField` — a
  single grouped tri-state pill list under the 6 group headers (tap cycles neutral →
  Primary → Secondary → remove) yielding `primary_muscles[]` + `secondary_muscles[]`.
  The `ExercisePicker` muscle filter is `<optgroup>`'d by the 6 groups and filters by
  a specific fine code; the PostgREST array filter is `primary_muscles.cs.{<code>}`
  (contains), replacing `primary_muscle.eq.<code>`.
- **i18n (#155).** The muscle-name block was renamed
  `exerciseDialog.primaryMuscle.<code>` → `exerciseDialog.muscle.<code>` and re-keyed
  to the 22 fine codes + `full_body`; new block `exerciseDialog.muscleGroup.<group>`
  (6 labels); `hamstrings` relabelled "Femorales" → "Isquiosurales".
- **Migrations + tests (#155).** `20260604120000` (muscles table + schema swap +
  re-tag). New pgTAP suite `supabase/tests/05_muscles.test.sql` (seed
  completeness, anti-drift vs `core/muscles.ts`, trigger rejects unknown /
  full-body-as-secondary, every system row has ≥1 primary). See R-26 / D-F11.
- **Retag review fix (#156).** Follow-up migration
  `20260604130000_fine_taxonomy_retag_review_fixes.sql` (an expert anatomical review
  corrected 3 rows: Deadlift → hamstrings promoted to primary; Kettlebell swing →
  +forearms secondary; Overhead press → +trap secondary), shipped alongside a docs
  reconcile to shipped state.

### 2026-05-19 → 2026-06-04 — F-1/F-2 training + nutrition batch (backfill)

- **F-1 whole-foods bilingual library (#113).** Bulk bilingual whole-foods ingredient
  library seeded via the `scripts/whole-foods/` pipeline →
  `20260523120100_f1_whole_foods_seed.sql` (per-row idempotent system seed). U-4 was
  dropped from the batch.
- **Ingredient/recipe list pagination (#112).** Paginated the ingredient and recipe
  lists (`pagination` i18n namespace).
- **F-2 routines + cyclic planner (#122) — LIVE in production (tag v2026-06-03).**
  New `routines` / `routine_exercises` / `programs` / `program_days` tables + RPCs
  `save_routine`, `save_program`, `set_active_program`, and the 7-arg `save_workout`;
  `workout_sessions` provenance stamps (`program_id` / `routine_id`). The `/routine`
  builder + cyclic program planner.
- **F-2b warm-up sets in routines (#128) — live.** `routine_exercises.warmup_sets`
  jsonb.
- **Exercise search-by-muscle (#127).** Muscle filter wired into the exercise picker.
- **U-1 sub-macros sugar + saturated (#95) — live.** `ingredients.sugar_g_per_unit`,
  `ingredients.saturated_fat_g_per_unit`; `meal_logs.custom_sugar_g`,
  `meal_logs.custom_saturated_fat_g`; `daily_nutrition_history` planned/consumed sugar
  + saturated_fat + the `*_complete` flags.
- **U-2 recipe meal-type tags (#96) — live.** `recipes.meal_types text[]`.
- **U-3 nutrition search filters + warning badges (#97).**
- **U-5 day totals vs target (#101).**
- **U-6 copy a meal across days (#116).**
- **Nutrición/Entreno section-aware responsive shell (#91).** Post-V1 item 3; English
  route slugs (`/diary`, `/progress`, `/recipes`, `/training`, `/routine`,
  `/exercises`) — no Spanish route aliases.
- **Planner shopping list (#46).**
- **Settings grouped-list / drill-in redesign (#124).**

### 2026-06-03 — R-16 Tier-3 pgTAP + R-25 hide fix

- **R-16 Tier-3 pgTAP suite + db-test CI job (#148).** pgTAP suites `00_schema`
  .. `04_rpc` (later joined by `05_muscles` from R-26) run as a `db-test` job inside
  `.github/workflows/ci.yml` (uses the new minimal `supabase/config.toml`, required on
  `develop`). Test-file refinements followed: **#149** repaired apply-from-zero
  (`00_schema`); **#150** made tests `01`–`04` green on `develop`. Closes the "Tier-3
  gated" gaps noted in the earlier R-19 / R-01 entries. Only the R-22 UPDATE
  WITH-CHECK gap remains as a pgTAP todo — *correction: that todo asserted
  nothing and no gap ever existed; retired 2026-07-19 (#214), see below*.
- **R-25 hide drops the reference row only (#151).** Migration
  `20260603120000_r25_hide_drops_ref_only.sql` — hiding an owned library item now
  drops only the user's reference row; pool ownership is retained.

### 2026-06-07 — R-27 Project B2b — exercise detail popup

- **Exercise detail popup (B2b).** An `Info` button on exercise rows in the
  runner overview, the exercise picker, and the session + routine editors opens
  a bilingual step-by-step instruction panel with a start/end image loop.
  Images render via `buildExerciseImageUrl` (B2a) in a fixed aspect-ratio box
  with `loading="lazy"`. The panel is a reusable presentational
  **`ExerciseDetail`** component with an adaptive `density` prop (`compact` for
  the popup; `full` density is built but unmounted — reserved for B2c's
  standalone browse page). The responsive shell is a shadcn **`Drawer`**
  (bottom-sheet, vaul) on mobile / Radix **`Dialog`** (centered) on desktop,
  switching via `useMediaQuery('(min-width: 768px)')`. No schema or RPC change.
  See R-27.

### 2026-06-08 — R-27 Project B2c — exercise browse + detail pages (Project B complete)

- **Exercise browse page (B2c, #167).** The `/exercises` placeholder becomes a real
  browse experience: debounced search, a filters `Drawer` (category / equipment /
  level / muscle), removable applied-filter chips, a responsive `ExerciseCard` grid,
  and **server-side pagination** (`searchExercisesPaged` — `count:'exact'` + `.range`,
  sharing a `buildExerciseQuery` helper with the picker's search). A read-only
  `/exercises/:id` page reuses B2b's `ExerciseDetail` (`full` density). The picker's
  grouped muscle dropdown was extracted into a shared `MuscleSelect`. New
  `entrenamiento` i18n: `browse.*` + `exerciseDialog.category.*` / `.level.*`. No
  schema/RPC change.
- **Released to `main`** via `release/2026-06-08-exercise-browse` (B2b + B2c).
- **Live-DB backlog deploy (2026-06-08).** The Project A / B1 / B2a migrations (fine
  taxonomy + 873-row catalog + bilingual instructions) had never been applied to the
  live database; the 10-migration backlog was deployed in order, bringing prod to
  **907 exercises** (873 catalog) with instructions + fine-muscle tags. See
  operations.md "Project A / B1 / B2a backlog deploy". **Project B (R-27) complete.**
- **B2a pgTAP (#164).** The B2a instructions data foundation also added pgTAP suite
  `06_instructions.test.sql` (the `instructions_en` / `instructions_es` `text[]`
  column shape plus a sampled row asserting non-empty, equal-length bilingual steps).

### 2026-07-15 — R-33 UI redesign (design system + nutrition screens)

The full nutrition-side redesign, applying the external Claude-design canvas in
layers over ~20 PRs. Shipped to `develop`; promoted to `main` in this release.

- **Foundation (app-wide, gym included).** Migrated to Tailwind CSS v4 (#179);
  foundation retheme (#180) — the `tokens.css` oklch token system as the app's
  source, self-hosted Rubik + Geist Mono, restyled shadcn primitives, a
  hardcoded-colour sweep, and the heatmap ramp. The sweep also moved the brand
  green from `#16a34a` to `#13702f` in the PWA manifest (`vite.config.ts`) and the
  `index.html` `theme-color` meta — superseding the Sprint 15 value.
- **Shell & navigation (#183).** `PageShell` frame, per-section bottom navs, the
  `/more` hub, and the grouped desktop sidebar (web-sidebar-footer pattern).
- **Semantic tone core (#184).** `src/core/nutritionTone.ts` replaces the old
  `macroStatus` — the nutri/amber/gym/danger tone tokens the screens read from.
- **Screen waves.** Diario day view + add-flow (#185/#186); Planificador day
  view, layout pass, and flows — add drawer, copy replace/append, recipe peek
  (#187/#188/#189); Plantillas library + template `phase_type` + save/apply and
  the mobile-first template editor (#190/#191); Recetas list, read view, and
  editor + `prep_time_minutes` (#192/#193); Ingredientes list, full-screen
  search + scanner, auto-kcal, and the `salt_g_per_unit` sub-macro (#194/#195);
  Progreso — P0 hero, three-line composition (the fat/lean stack retired), one
  time filter, and the month-grouped history route + measurement sheet
  (#199/#200); Objetivos page + the phase editor promoted from a modal to a
  route with a live phase-tinted preview (#201/#202); Ajustes restyle
  (#203). Docs reconciled to the shipped code at release (#204).
- **Schema.** Three additive, nullable columns only — `meal_plan_templates.phase_type`,
  `recipes.prep_time_minutes`, `ingredients.salt_g_per_unit` (with the matching
  `save_template` / `save_recipe` args); no RLS or destructive change. New pgTAP
  suite `07_ingredient_salt.test.sql` (#194) pins the salt column to the U-1
  nullable sub-macro contract — NULL means UNKNOWN, never 0.

### 2026-07-19 — R-36 Recipe steps & notes

- Structured, reorderable recipe steps replace the old `recipes.instructions`
  free-text column: new `recipe_steps` child table (RLS mirrors
  `recipe_ingredients`), `save_recipe` takes `p_steps jsonb` instead of
  `p_instructions text` (delete-and-reinsert; blank steps dropped and the rest
  renumbered rather than blocking the save — D-F26). No migration of the old
  free text — `recipe_steps` starts empty for every recipe (D-F25), since the
  app has no production users yet. New pgTAP suite `08_recipe_steps.test.sql` —
  shared-pool reads, owner-only writes (seeded-library sentinel excluded), note
  isolation between users, step ordering, and the blank-step skip.
- Editor gains `RecipeStepsField` — a react-hook-form field array with ↑/↓
  reordering (no drag-and-drop dependency). The recipe detail page renders the
  numbered step list with an owner-only empty state, and the planner's recipe
  peek lists the steps too.
- `user_recipe_refs.note` — live since R-01 but unused — is wired up as a
  private per-user recipe note: a self-gating "Mis notas" card on the detail
  page, saves on blur, available for any recipe in the user's library
  including ones they did not create. Plain single-table PostgREST update
  (RLS-scoped), not an RPC.
- Per-step photos, the "Fotos de los pasos" setting, and the Supabase Storage
  stack they need are split off to **R-36b**, blocked on a storage/cost
  decision.

### 2026-07-14 → 2026-07-17 — Numeric locale boundary + R-35 shopping list (backfill)

- **The decimal comma no longer eats the number (#198).** `<input type="number">`
  silently turned a typed `1,2` into `12` — the comma a Spanish numeric keypad
  emits by default, reaching body weight. The browser strips it before React sees
  the value, so the fix is the DOM element itself. One shared input boundary:
  `parseDecimalInput` (`src/lib/number.ts`, accept-both/emit-point, deliberately
  **not** locale-aware, ambiguity rejected rather than guessed), the promoted
  `NumberField` (`type="text" inputMode="decimal"`), and `useDecimalDraft` for the
  two runner fields whose value lives as a number in the parent. Three competing
  numeric conventions collapse onto it. Fraction-capable fields only — integers
  (series, reps, rest, warm-up reps, RPE) keep `type="number"` and their spinner.
  On `type="text"` the browser stops enforcing `min`/`max`/`step`, so every field
  that lost a native gate gained the zod equivalent, retiring the native bubble
  that used to preempt the app's own message and `MacroField`'s hardcoded
  `max={100}`. Makes hard invariant 6 actually true.
- **Every number renders in the active locale (#209).** The output-side mirror of
  #198 — Spanish showed `82.4 kg`. `formatDecimal` + `formatQuantity` in
  `src/lib/number.ts` (one shared `lang → BCP-47` map, nullish-safe) are the
  emit-locale partner to `parseDecimalInput`; JSX numbers go through
  `useNum()`, numbers inside translations through i18next's Intl formatter
  (`{{var, number}}`, 8 namespaces × es/en). The ad-hoc `formatMacro` retired. An
  eslint `no-restricted-syntax` guard flags raw `roundMacro()`/`Math.round()` in
  JSX and `toLocaleString`/`Intl.NumberFormat` outside `src/lib/number.ts`, so the
  class cannot return.
- **R-35 shopping-list panel (#210).** The last Planificador surface still on the
  pre-redesign UI moves to the shared `ResponsiveDialog` **panel** variant
  (docked-right on desktop, bottom sheet on mobile), rebuilt on shipped R-33
  tokens: sunken body, white rounded item rows, square accent checkbox, `tnum`
  quantity badge, extra chip, check-off row-shrink. Shared `SegmentedControl` /
  `Badge` / `EmptyState`. Behaviour and public props unchanged — per-week
  check-off, staples hide/show, manual extras, share/copy and both views survive.

### 2026-07-19 — Error classifier, local stack ports, RLS WITH-CHECK uniformity

- **One error classifier, no raw messages, honest empty states (#212).** Nothing
  decided what an error *meant* before showing it: `toastError` passed
  `err.message` through as English PostgREST jargon, four screens collapsed
  `isError || !data` into their not-found state (so a network failure claimed the
  recipe was deleted), and the global `ErrorBoundary` printed `error.message`
  untranslated in a `<pre>`. `src/lib/errors.ts` is now the single classifier —
  six kinds (`notFound` `PGRST116`, `denied` `42501`, `duplicate` `23505`,
  `offline`, `staleSchema` `PGRST200/202/205`, `unknown`) plus
  `errorMessageKey`/`errorTitleKey`, and nothing else inspects an error code. The
  shared `QueryErrorState` takes each screen's own not-found node and renders it
  only when the error really is "no rows"; recipe detail, exercise detail, the
  planner's recipe peek and the recipe editor (which used to silently redirect and
  lose the edit) route through it.
- **`networkMode: 'always'` on query defaults (#212).** Found in a real-browser
  pass, not the tests: react-query's default `'online'` **pauses** a query while
  offline — `isError` false, `data` undefined, `isLoading` false — so every screen
  fell through to its not-found arm anyway and `QueryErrorState` never rendered.
  `'offlineFirst'` is not sufficient (it ungates only the first attempt, so with
  `retry: 1` the query fires once, fails, then re-pauses and never settles).
- **Local Supabase stack moved to the 553xx range (#213).** The local stack
  collided with another project's on every default 543xx port, and only the DB
  port was pinned. `supabase/config.toml` now pins API 55321, DB 55322, shadow
  55320, Studio 55323, Inbucket 55324, analytics 55327, pooler 55329. Config-only
  and local-only — production is dashboard-managed and this file is not a deploy
  surface; the ports serve migrations and the pgTAP suite.
- **Every UPDATE policy carries an explicit WITH CHECK (#214).** Migration
  `20260719120000_r22_update_with_check.sql`. **This closed no hole.** Postgres
  applies an UPDATE policy's `USING` expression to the NEW row when `WITH CHECK`
  is absent, so the fourteen `USING`-only policies were already covered — and the
  two pgTAP `todo` blocks in `02_rls_child.test.sql` that claimed otherwise had
  been silently *passing* for months, reading as tracked debt while asserting
  nothing. The clause is written anyway to state the intent rather than leave it
  to a Postgres subtlety, and as insurance against a future edit that narrows
  `USING` alone. `ALTER POLICY`, not drop-and-recreate, so no policy body is
  retyped; each `WITH CHECK` repeats that policy's existing `USING` exactly.
- **The todos become one catalogue assertion (#214).** Both `todo` blocks were
  deleted, not converted (the re-pointing behaviour stays covered by the hard
  assertions on `routine_exercises` and `program_days`). In their place
  `02_rls_child.test.sql` asserts catalogue-wide that no UPDATE policy in `public`
  has a `with_check` distinct from its `qual` — identical, not merely present,
  since `with check (true)` would be strictly weaker than the implicit behaviour
  it replaced. A companion assertion pins the denominator so the sweep cannot pass
  vacuously. The `r22` prefix is historical: R-22 is Training Routines, closed in
  May; the gap survived only as a follow-up bullet filed under it.

### 2026-07-21 — R-36b Recipe cover photo

- **First Supabase Storage bucket in the app.** `recipe-photos` — public,
  2 MB file-size cap, `image/webp`-only (`allowed_mime_types`) — created in
  `20260720120000_r36b_recipe_photos_bucket.sql`. Objects are keyed
  `<recipe_id>/full.webp` / `<recipe_id>/thumb.webp` (stable paths, so a
  replace overwrites in place rather than orphaning). RLS on
  `storage.objects` follows the same real-creator-only shape as
  `recipe_ingredients`/`recipe_steps` for INSERT/UPDATE/DELETE, plus a
  permissive SELECT policy scoped to the bucket: Postgres applies SELECT
  policies to `update`/`delete`/`on conflict do update` as well, so without one
  a replace can't see the row it overwrites and a remove matches nothing while
  reporting success. The grant exposes only metadata for objects the CDN
  already serves to anyone with the URL. The path→`uuid` cast is `case`-guarded
  so a malformed path denies instead of raising `22P02`.
- **`recipes.photo_url` (dead since it was added) now holds the object
  path**, not a URL. `publicPhotoUrl()` (`src/features/recipes/photoStorage.ts`)
  derives the CDN URL client-side from the recipe id and appends a URL-encoded
  `?v=<updated_at>` so a replace busts the cache — `setRecipePhoto` bumps
  `updated_at` in the same update, since the object key is stable and nothing
  else in the schema moves that column.
- **Client-side resize to WebP, zero dependencies**
  (`src/features/recipes/photoResize.ts`): a plain `<canvas>` +
  `toBlob('image/webp', q)` pass produces a 1600 px-long-edge "full" (detail
  hero) and a 400 px "thumb" (cards/rows/editor tile) from one picked file,
  never upscaled — so Supabase's paid image-transform tier ($5/1 000 origin
  images/mo) is never needed. A file the browser can't decode (raw HEIC
  picked via Files rather than Photos) rejects with a typed
  `PhotoDecodeError` instead of resolving a blank blob.
- **Upload/clear is a dedicated client action** (`setRecipePhoto`/
  `clearRecipePhoto` in `photoStorage.ts`), not folded into `save_recipe` —
  only `recipes.photo_url` changes, a single-table mutation, so invariant 3
  (RPC only for >1-table atomic mutations) doesn't apply.
- **One `RecipePhoto` component renders every media slot** — the list card,
  mobile row, detail hero, and editor tile — falling back to the existing
  colour placeholder when there's no photo or the image fails to load. The
  detail hero opens the full photo in a lightbox (shadcn `Dialog`) on tap.
  Add/replace/remove controls on the editor tile are gated on
  `canEditRecipe` — a non-creator sees the photo, never the controls. New
  i18n keys under `recetas.media` (ES + EN).
- **Weekly `recipe-photo-reap` cron is an invariant tripwire, not a
  garbage collector.** It reaps exactly one thing: a bucket prefix with no
  matching `recipes` row, via the storage admin API, never a raw SQL delete.
  Because recipes are never hard-deleted, that set is empty today and a healthy
  run reaps zero — a non-zero count is the signal that the never-hard-deleted
  assumption has changed. It deliberately does NOT chase half-failures where
  the recipe row survives (objects uploaded but `photo_url` not written, or
  removed but not nulled): those are indistinguishable from an upload that is
  seconds away from committing, and a service-role job guessing wrong deletes a
  live photo. Stable keys make a retry overwrite or remove the debris instead,
  and a dangling `photo_url` degrades to the placeholder. Neither the cron
  schedule migration (`20260720120100_r36b_recipe_photo_reap_cron.sql`) nor the
  edge function itself (`supabase/functions/recipe-photo-reap/index.ts`) has
  been applied/deployed to the live project yet — deploy the function first,
  since an early firing is a silent no-op (pg_net's POST is asynchronous, so
  the cron run succeeds regardless of the HTTP status).
- **Per-step photos — the original R-36b scope — dropped for good.** This
  ships one cover photo per recipe instead; see
  `docs/superpowers/specs/2026-07-20-r36b-recipe-photo-design.md` for the
  pivot rationale.

## PR table

| #   | Sprint                               | Content                                                                                                  |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 1   | Fundamentos                          | Auth, profile, layout, router, i18n base                                                                 |
| 2   | Sprint 1 — Métricas                  | `body_measurements`, ProgresoPage list, LatestMeasurementCard with stale banner                          |
| 3   | Polish/Deploy                        | Vercel SPA rewrite, ErrorBoundary, bone weight bug fix (max 20kg)                                        |
| 4   | (combined with #3)                   | Sprint 2A Ingredientes                                                                                   |
| 5   | Sprint 2B — Recetas                  | Soft-delete recipes, live macros panel, save_recipe RPC                                                  |
| 6   | Sprint 3 — Diario                    | Meal logs grouped by mealtype, DateNavigator, DayTotalsCard, 3-mode entry (recipe / ingredient / custom) |
| 7   | Sprint 4 — Plantillas + Planificador | Templates with 7×N grid, ApplyTemplateDialog, SaveAsTemplateDialog, divergence tracking                  |
| 8   | Sprint 5 — Objetivos/Fases           | Goal singleton, phases CRUD, `computePhaseTargets`, DayTotalsCard targets+progress bars                  |
| 9   | Sprint 5 fix                         | Align phases code with DB schema (kcal_mode/fiber_mode enums, fat_pct fraction↔percent)                  |
| 10  | Sprint 6 — Settings completos        | Language toggle (persisted to `profiles.language`), biometrics editor (sex/birth_date/height/bone), sign out |
| 11  | Sprint 7 — Progreso gráficas         | WeightChart (raw + MA5) and CompositionChart (% stacked w/ linear interpolation); shared 30d/90d/1y/all pills |
| 12  | Sprint 7 fix                         | Composition chart Y-axis capped at 100%; body fat moved to bottom of stack                               |
| 13  | Sprint 8 — Toasts                    | shadcn toast/toaster/useToast; success/destructive variants; wired into all mutation hooks via toast-helpers |
| 14  | Sprint 9 — Edge Functions + cron     | `daily-nutrition-snapshot`, `weekly-rollover`, `recalculate-tdee` (Deno), pg_cron + pg_net jobs, admin RPC `apply_template_to_week_admin` |
| 15  | Sprint 10 — Diario ↔ Plan            | Plan slots auto-materialize as `from_plan` meal_logs (idempotent via `plan_week_slot_id` dedup) on DiarioPage load; same logic added to `daily-nutrition-snapshot` for days never opened |
| 16  | Sprint 11 — Progreso macros chart    | `MacrosChart` on /progreso reading `daily_nutrition_history`; macro selector (kcal/protein/carbs/fat/fiber), planned + consumed + active-phase target reference line, gaps broken at nulls |
| 17  | Sprint 12 — Code splitting           | `manualChunks` (recharts/supabase/i18n/radix/react-vendor/react-query) + `/progreso` lazy-loaded. First-paint JS 351 KB → 69 KB gz; recharts deferred until /progreso |
| 18  | Sprint 13 — Loading skeletons        | New `Skeleton` primitive; replaces "Cargando…" text on Diario, Recetas, Planificador, Plantillas |
| 19  | Sprint 14 — Dark mode                | `ThemeProvider` (light/dark/system, localStorage `hf-theme`); FOUC-prevention inline script in `index.html`; toggle in Settings Appearance card |
| 20  | Sprint 15 — PWA                      | `vite-plugin-pwa` with workbox generateSW; manifest (HF monogram SVG icon, theme color `#16a34a`, standalone); Supabase requests bypass cache (NetworkOnly) |
| 21  | Sprint 16 — GDPR delete-account      | Edge function `delete-account` verifies caller JWT then `auth.admin.deleteUser`; CASCADE cleans user data. Two-step email-confirm dialog in Settings |
| 22  | Sprint 17 — Review fixes             | TDEE wired to frontend (`features/tdee`) so `tdee_delta` phases show targets; lean-mass protein behavior documented in PhaseDialog + architecture; 7 sites switched from UTC slice to `isoDate()`; ingredient delete maps Postgres FK 23503 to friendly "in use" toast |
| PR #17 (2026-05-17) | Reconcile main with Sprints 11–17 + add CI | Reconciled `main` with Sprints 11–17, added CI workflow + branch protection + auto-merge; merged 2026-05-17 |
| 132 | R-23 — F-3 guided runner | `core/runner.ts` reducer + `features/training/runner/` (rest timer / draft / wake-lock hooks) + `RunnerPage` at `/training/run`; per-set `prefillSetsForExercise`; no schema change |
| 133 | R-23 — runner review fixes | Bottom-pinned actions, borderless working-weight stepper, integer RPE, rest-aware READY button, skip→up-next, end-exercise-early |
| 134 | R-23 — runner review batch 2 | Performance colours on logged reps/weight, centered RPE, header `Ej x/N` + "Cambiar" switch button, completion-card cleanup |
| 135 | R-23 — switch-exercise fix | Leaving an exercise demotes it to partial/pending (resumable, not stranded) + leave-partial confirmation |
| 136 | R-24 — F-4 muscle heatmap | `core/muscleVolume.ts` (primary 1 / secondary 0.5, warm-ups excluded, full-body footnoted) + `features/training/muscleMap/` body heatmap + pluggable body-art skin (vendored MIT art); `exercises.secondary_muscles` migration + ExerciseDialog picker |
| 139 | R-24 — heatmap inline on `/training` | Embed muscle map inline on `/training` (drop the standalone page/route); gender auto-follows `profiles.sex` reactively |
| 46  | Planificador — shopping list | Aggregated shopping list from the weekly plan |
| 91  | Post-V1 — responsive shell | Nutrición/Entreno section-aware responsive shell; English route slugs (`/diary`, `/progress`, `/recipes`, `/training`, `/routine`, `/exercises`) |
| 95  | U-1 — sub-macros | `sugar_g_per_unit` / `saturated_fat_g_per_unit` on ingredients + `custom_*` on meal_logs + planned/consumed + `*_complete` flags on `daily_nutrition_history` |
| 96  | U-2 — recipe meal-type tags | `recipes.meal_types text[]` |
| 97  | U-3 — nutrition search filters | Search filters + warning badges on nutrition lists |
| 101 | U-5 — day totals vs target | Day totals compared against active-phase target |
| 112 | F-1 — list pagination | Ingredient + recipe list pagination (`pagination` namespace) |
| 113 | F-1 — whole-foods library | Bilingual whole-foods seed via `scripts/whole-foods/` → `20260523120100_f1_whole_foods_seed.sql`; U-4 dropped |
| 116 | U-6 — copy a meal | Copy a meal across days |
| 122 | F-2 — routines + cyclic planner | `routines` / `routine_exercises` / `programs` / `program_days` tables + `save_routine` / `save_program` / `set_active_program` / 7-arg `save_workout` RPCs + session `program_id`/`routine_id` provenance; `/routine` builder (LIVE, tag v2026-06-03) |
| 124 | Settings — grouped-list redesign | Grouped-list / drill-in Settings redesign |
| 127 | F-2 — exercise search-by-muscle | Muscle filter wired into the exercise picker |
| 128 | F-2b — warm-up sets | `routine_exercises.warmup_sets` jsonb |
| 148 | R-16 — Tier-3 pgTAP suite + db-test CI job | pgTAP suites `00_schema`..`04_*` for RLS / RPC + `db-test` job (`supabase start` + pgTAP) in `ci.yml` (required on `develop`) + minimal `supabase/config.toml`; closes R-19/R-01 Tier-3 gaps |
| 149 | R-16 — Tier-3 test refinement | Repair apply-from-zero so `db-test` runs (`00_schema.test.sql`) |
| 150 | R-16 — Tier-3 test refinement | Make tests `01`–`04` green on `develop` |
| 151 | R-25 — hide drops ref only | `20260603120000_r25_hide_drops_ref_only.sql` — hide drops only the reference row, pool ownership retained |
| 155 | R-26 — fine muscle taxonomy | `public.muscles` table (22 fine codes + `full_body`, mirrors `core/muscles.ts`); `exercises.primary_muscles[]` (multi-primary) replacing singular `primary_muscle`; `validate_exercise_muscles` trigger; finer-resolution heatmap (per-primary 1.0); `MuscleTagField` grouped tri-state tagging + `<optgroup>`'d picker filter (`primary_muscles.cs.{code}`); i18n re-key to fine codes; migration `20260604120000`; pgTAP `05_muscles`. See R-26 / D-F11 |
| 156 | R-26 — docs reconcile + retag review fix | Reconcile docs to shipped state + migration `20260604130000_fine_taxonomy_retag_review_fixes.sql` (3 anatomical re-tags: Deadlift +hamstrings primary, Kettlebell swing +forearms, Overhead press +trap) |
| 179/180 | R-33 foundation | Tailwind CSS v4 migration; foundation retheme — `tokens.css` oklch tokens, self-hosted Rubik + Geist Mono, restyled shadcn primitives, hardcoded-colour sweep, heatmap ramp |
| 183 | R-33 wave 0 — shell & navigation | `PageShell`, per-section bottom navs, `/more` hub, grouped desktop sidebar |
| 184 | R-33 — semantic tone core | `src/core/nutritionTone.ts` replaces `macroStatus` (nutri/amber/gym/danger tone tokens) |
| 185/186 | R-33 wave 2 — Diario | Day view (kcal ring, macro tiles, meal cards, weekly chart, web rail) + add-flow (AddToDaySheet, ración projection, edit/delete) |
| 187/188/189 | R-33 wave 3 — Planificador | Day view (tone headers, meal cells, mobile week strip), layout fixes, and flows (add drawer, copy replace/append, recipe peek) |
| 190/191 | R-33 wave 4 — Plantillas | Library + template `phase_type` + save/apply flows; mobile-first template editor (phase picker); retired the pre-redesign UI |
| 192/193 | R-33 wave 5 — Recetas | List + new read view + `recipes.prep_time_minutes`; the Recetas editor (retiring the last pre-redesign nutrition UI) |
| 194/195 | R-33 wave 6 — Ingredientes | List, full-screen search + scanner, auto-kcal, and the `ingredients.salt_g_per_unit` sub-macro |
| 199/200 | R-33 wave 7 — Progreso | P0 hero, three-line composition (fat/lean stack retired), one time filter; month-grouped history route + measurement sheet |
| 201/202 | R-33 wave 8 — Objetivos | Objetivos page (phase hero, phase-tinted rows, option-B history); phase editor promoted from modal to route with live phase-tinted preview + `23P01` overlap reason |
| 203 | R-33 wave 9 — Ajustes | SettingsPage restyle (MorePage-consistent hero, segmented theme control, row subtitles) |
| 204 | R-33 — release doc-reconcile | Reconcile living docs to shipped code (21 drift items across 6 shards) ahead of the batch release |
| 198 | Forms — decimal comma input fix | One shared numeric input boundary: `parseDecimalInput` + `NumberField` (`type="text" inputMode="decimal"`) + `useDecimalDraft`; fraction-capable fields only, integers keep their spinner; zod replaces the lost native `min`/`max`/`step` gates |
| 209 | i18n — locale-aware number rendering | `formatDecimal` / `formatQuantity` + `useNum()` + i18next `{{n, number}}` across 8 namespaces; eslint guard against raw rounding in JSX and `Intl` outside `src/lib/number.ts` |
| 210 | R-35 — shopping list panel | Shopping-list dialog redesigned to the R-33 `ResponsiveDialog` panel (docked-right / bottom sheet); shared `SegmentedControl` / `Badge` / `EmptyState`; no behaviour change |
| 211 | R-36 — recipe steps + private notes | `recipe_steps` child table (RLS mirrors `recipe_ingredients`), `save_recipe` takes `p_steps jsonb` and `recipes.instructions` dropped; `RecipeStepsField` editor with ↑/↓ reorder; `user_recipe_refs.note` wired up as "Mis notas"; pgTAP `08_recipe_steps` |
| 212 | Errors — one classifier, honest empty states | `src/lib/errors.ts` (six kinds + message/title keys), `toastError` stops leaking `err.message`, shared `QueryErrorState`, translated `ErrorBoundary`, and `networkMode: 'always'` so offline queries settle instead of pausing into not-found |
| 213 | Supabase — local stack ports | `supabase/config.toml` pins the local stack to 553xx (API 55321, DB 55322, Studio 55323) to coexist with another project; config-only, local-only |
| 214 | RLS — UPDATE WITH CHECK uniformity | `20260719120000_r22_update_with_check.sql` — `alter policy … with check (X)` on all 14 `USING`-only UPDATE policies; closes no hole (Postgres already applied `USING` to the new row), retires two silently-passing `todo` blocks for one catalogue assertion that `with_check` is never distinct from `qual` |
| TBD | R-36b — recipe cover photo | First Supabase Storage bucket (`recipe-photos`, public, 2 MB, `image/webp`-only) with real-creator write RLS; `recipes.photo_url` now the object path; client-side resize-to-WebP (`photoResize.ts`); dedicated upload/clear action; `RecipePhoto` in every media slot + detail lightbox; weekly `recipe-photo-reap` cron as a never-hard-deleted tripwire (schedule staged, function not yet deployed). Per-step photos dropped in favour of one cover photo |

