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

