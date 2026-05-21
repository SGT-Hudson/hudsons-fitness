# Roadmap

Mutable backlog of work the conventions review spawned. Items shrink as they
land. Each links its originating decision(s) in `decisions.md` by ID. `R-00`
is the cross-cutting blocker. When an item is done: mark `status: done` with
the date, and remove the matching `> ⚠ Changing — R-xx` callout from whatever
reference shard carries it (never edit the decision entry).

## Contents

- R-00 — Baseline current schema into migrations
- R-01 — ★ Library Contribution & Lifecycle Model (Phase 1 migration; Phase 2 reaper)
- R-02 — Phase 7-day grace-window + notes-editable-forever
- R-03 — Drop profiles.bone_kg + purge estimateBoneKg/onboarding/settings/gate/i18n
- R-04 — Switch to generated types/database.ts; document regen command
- R-05 — Protein refactor: canonical-fn owns rule, phase-aware lean-mass table, fallback const, visible basis
- R-06 — fractionToPct/pctToFraction helper; refactor 3 inline sites; verify/add DB CHECK
- R-07 — TDEE adaptive-Kalman model — own design spec first, then schema + rewrite recalculate-tdee
- R-08 — Drop 4 dead tdee_estimates cols; wire mifflinStJeor as derived "Estimated BMR" display
- R-09 — RHF + zod migration across ~6–8 forms; co-located schemas
- R-10 — Add src/components/ui/badge.tsx; refactor 4 inline sites; update docs
- R-11 — Composition-chart redesign: fat/lean 100% stack + muscle/water trend charts + local %↔kg toggle
- R-12 — materialize_plan_for_date RPC + partial unique index + date<=today guard; delete client/edge mirrors
- R-13 — AuthProvider profile→i18n sync effect
- R-14 — Drop profiles.units; purge from types
- R-15 — Remove LanguageSwitcher from AppLayout; keep pre-auth only
- R-16 — Vitest Tier-1 (spec-first) + Tier-2 (with R-09) + Tier-3 (after R-00)
- R-17 — Extract shared pure camelCase macro/date core; edge snake adapter; Deno dep-pin
- R-18 — Cron liveness alerting (stale daily_nutrition_history/tdee_estimates → notify)
- R-19 — Training MVP (Phase 1: ad-hoc session logging + rule-based coach)
- R-20 — Barcode scanning for ingredient import (camera + manual EAN → OFF lookup)
- R-21 — OFF contribute-back: push user-created/completed products to Open Food Facts (SKETCH)

## R-00 — Baseline current schema into migrations
- **decision:** D-A8, D-A6, D-E3, D-D6, D-F1
- **blocked-by:** —
- **status:** done (2026-05-18) — baseline migration
  `supabase/migrations/20260508080000_r00_baseline_schema.sql` captures the
  full pre-existing live `public` schema (15 tables, RLS, 4 user RPCs +
  the `handle_new_user`/`mark_week_diverged` triggers, the
  `body_measurements_smoothed` view, the `extensions`-schema extensions)
  reconstructed read-only from `information_schema`/`pg_catalog`. It is
  timestamped before `20260514120000_sprint9_cron_and_jobs.sql` so the order
  is baseline → sprint9 → the `20260518*` Wave-3 migrations (applied
  2026-05-18); it deliberately excludes the
  sprint9-owned objects (`pg_net`/`pg_cron`, the `private` schema +
  `invoke_edge_function`, `apply_template_to_week_admin`, the
  `tdee_estimates (user_id, computed_on)` unique constraint, the 3 cron jobs)
  so `baseline + sprint9` = the full schema with no double-create. The
  deliverable is the in-repo file; it does not require a prod apply (the
  schema already exists — every statement is `if not exists`/guarded so a
  prod re-apply is a verified no-op, which is itself a Wave-3 validation
  item). R-03/R-04/R-08/R-12/R-14 + R-16-Tier-3 are now unblocked (a
  reproducible schema exists in-repo).
- **scope:** At the time of the review only one migration file exists —
  `supabase/migrations/20260514120000_sprint9_cron_and_jobs.sql` — and the
  rest of the schema was built via the Supabase dashboard/MCP, so there is no
  reproducible migration history to stand up a local DB. The task: export the
  live schema into a baseline migration so `supabase/migrations/` is a complete,
  reproducible history. This is a shared prerequisite that unblocks the
  `bone_kg` removal (R-03), the generated-types switch (R-04), the dead
  `tdee_estimates` column drop (R-08), the `materialize_plan_for_date` RPC +
  partial unique index migration (R-12), the `profiles.units` removal (R-14),
  and F1 Tier-3 DB/RLS/RPC tests via local `supabase start` + pgTAP (R-16
  Tier-3). Until it exists, RLS/RPC correctness rests on manual review only —
  document that gap honestly.

## R-01 — ★ Library Contribution & Lifecycle Model (Phase 1 migration; Phase 2 reaper)
- **decision:** D-A2, D-A3, D-A4
- **blocked-by:** R-00
- **status:** Phase 1 done (2026-05-20) — 8 staged migrations + the
  `r01_backup_table_rls` follow-up applied to prod at the Wave-3 checkpoint
  via Supabase MCP `apply_migration`; reworked `delete-account` edge fn
  redeployed (version 2). Tier-3 pgTAP for RLS / RPC / backfill remains
  gated behind R-16-Tier-3 / `supabase start` infra (not yet set up —
  documented gap). Phase 2 (auto-reaper) still blocked on the deferred
  ratings/voting signal.
- **spec:** `docs/superpowers/specs/2026-05-18-library-model-phase1-design.md`
- **plan:** `docs/superpowers/plans/2026-05-18-library-model-phase1-plan.md`
- **scope:** Build the unified ★ Library Contribution & Lifecycle Model
  covering ingredients and recipes. Phase 1 migration: replace per-user
  hard-delete and the recipe `deleted_at` soft-delete + partial unique index
  with the shared pool/reference structure — "delete" = hide = drop your
  reference row; a creator-hide transfers pool-item ownership to a reserved
  anon user id. Retain `recipe_ingredients ON DELETE RESTRICT` as the DB-level
  backstop so the reaper's zero-references predicate stays true at the DB even
  if the reaper logic has a bug (`CASCADE`/`SET NULL` remain rejected — silent
  macro corruption / orphaned recipe lines). The old "reword IngredientInUseError
  copy" task is obsolete (that error path disappears once user hard-delete is
  removed). Phase 2: an auto-reaper that reaps duplicate/bad pooled items once
  the down-vote/ratings signal exists — this is the structural resolution of
  tolerated ingredient duplicates (no dedicated dedup feature needed). Record
  in `docs/decisions.md` the tolerated-duplicates known limitation and the
  future-work sketch: `pg_trgm` is already enabled, so a one-RPC fix at insert
  time can dedup by trigram similarity threshold.

## R-02 — Phase 7-day grace-window + notes-editable-forever
- **decision:** D-A5
- **blocked-by:** —
- **status:** done (2026-05-17) — `PHASE_EDIT_GRACE_DAYS = 7` +
  `isPhaseFrozen` in `ObjetivosPage.tsx`; notes-only mechanism = (b)
  `PhaseDialog` opened in `notesOnly` mode (all other fields
  disabled/read-only, only `notes` saveable). UI-only, no migration.
- **scope:**
  1. `src/pages/ObjetivosPage.tsx`: replace the binary `phaseStatus`/`isPast`
     cliff (`phase.end_date < today`, lines 42 / 183 / 185 / 239) with a
     grace-aware `isFrozen = end_date < (today − 7d)`. Compute the cutoff via
     `@/lib/dates` helpers. Dim (`opacity-60`) and hide edit/delete keyed off
     `isFrozen`, not `end_date`. A phase in grace renders as a normal editable
     card (the status badge stays `end_date`-based and still reads "past"; only
     freeze/dim is grace-based).
  2. Notes-only editor for frozen phases: frozen cards need a lightweight
     notes-edit affordance (inline notes editor, or `PhaseDialog` opened in a
     notes-only mode with all other fields `disabled`/`readOnly`). Pick the
     concrete mechanism at implementation time; record the choice in
     `docs/decisions.md`.
  3. Define the grace constant (7 days) once as a named const near
     `phaseStatus` (e.g. `PHASE_EDIT_GRACE_DAYS = 7`), not a magic literal.
  4. i18n: add ES/EN keys for the notes-only edit affordance label (namespace
     `phases`).
  5. Docs: document the corrected rationale (UX stance, not integrity), the
     7-day grace constant, the notes-editable-forever exception, and the
     dim-after-grace timing; record the inert-past-phases finding so the
     integrity misconception isn't reintroduced.

## R-03 — Drop profiles.bone_kg + purge estimateBoneKg/onboarding/settings/gate/i18n
- **decision:** D-A6
- **blocked-by:** R-00
- **status:** done (2026-05-18) — code purge + types merged earlier
  (`estimateBoneKg` deleted; `boneKg` removed from OnboardingPage/SettingsPage
  + the `onboarding`/`biometrics` zod schemas; `isProfileOnboarded` no longer
  gates on bone; i18n keys removed ES+EN). The `ALTER TABLE … DROP COLUMN
  bone_kg` (`supabase/migrations/20260518030000_r03_drop_bone_kg.sql`) was
  applied to prod at the Wave-3 checkpoint. Pre-drop value (one profile,
  `bone_kg=9.9`) is in the Wave-3 safety snapshot.
- **scope:**
  1. DB migration: `ALTER TABLE profiles DROP COLUMN bone_kg;` (new file in
     `supabase/migrations/`).
  2. `src/types/database.ts`: remove `bone_kg` from `profiles`
     Row/Insert/Update (lines 450 / 464 / 478). (Becomes automatic once the
     R-04 generated-types switch lands; hand-edit until then.)
  3. `src/lib/macros.ts`: delete `estimateBoneKg` (lines 71–85).
  4. `src/pages/OnboardingPage.tsx`: remove the `estimateBoneKg` import (line
     19), `boneKg` state (38), profile prefill (49), `handleEstimate` +
     `canEstimateBone` (60–75), the `!boneKg` submit guard (80), `bone_kg` from
     the update payload (90), and the bone input block + label + estimate
     button + help (172–198).
  5. `src/pages/SettingsPage.tsx`: remove `boneKg` state (40), prefill (53),
     submit guard (80), `bone_kg` payload (88), and the biometrics input + help
     (229–243).
  6. `src/features/profile/api.ts`: drop `p.bone_kg !== null` from
     `isProfileOnboarded` (line 37).
  7. i18n: remove `boneKg.{label,estimate,help}` (onboarding ns) and
     `biometrics.{boneKg,boneKgHelp}` (settings ns) in both `es` and `en`.

## R-04 — Switch to generated types/database.ts; document regen command
- **decision:** D-A8
- **blocked-by:** R-00
- **status:** done (2026-05-18) — regenerated `src/types/database.ts` from the
  final post-Wave-3 prod schema (`supabase gen types`, via MCP): drops
  `profiles.bone_kg`/`units` + the 4 dead `tdee_estimates` cols, adds
  `tdee_state`, `tdee_estimates.confidence`/`is_warmup`, the
  `materialize_plan_for_date` function + `apply_template_to_week_admin`, FK
  `Relationships`, and the generator's helper generics/`Constants`. Two
  generator caveats handled: CHECK-enums (`kcal_mode`/`fiber_mode`/
  `confidence`) stay plain `string` (verify in code, documented); SQL-function
  arg nullability is not inferred, so the nullable RPC args
  (`save_recipe`/`save_template` create-new ids) are restored to
  `string | null` by a documented post-generation patch (marker comment in the
  file). Regen command + corrections documented in `docs/operations.md`;
  generated-types caveats documented in `docs/conventions.md`. Verified green:
  `pnpm typecheck` (0), `pnpm lint` (0 errors), `pnpm build`, `pnpm test`
  (147/147).
- **scope:**
  - Run `supabase gen types typescript --project-id upvraruehzurbetzrxov` (or
    a local schema-dump variant).
  - Commit the generated file.
  - Document the regen command in `docs/operations.md`.
  - Note in the conventions doc: CHECK-constraint enums (`kcal_mode`,
    `fiber_mode`) come through as plain `string` from the generator too; future
    form work must still verify enum values against `pg_constraint`.

## R-05 — Protein refactor: canonical-fn owns rule, phase-aware lean-mass table, fallback const, visible basis
- **decision:** D-B1, D-B2
- **blocked-by:** —
- **status:** done (2026-05-18) — `computeDailyMacroTargets` now owns the
  protein rule (true `weightKg` + `bodyFatPct?` + `phaseType`); constants
  `PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM` (cut 2.4 / maintenance 2.0 / bulk 1.8)
  + `PROTEIN_FALLBACK_G_PER_KG_BODYWEIGHT` (1.6). `computePhaseTargets` is now
  a thin shape adapter. `PhaseDialog` pre-fills `protein_g_per_kg` per
  phase_type (override-respecting) with basis-aware help text; ObjetivosPage
  + Diario show the active basis. Existing phases keep their stored
  `protein_g_per_kg` (no retroactive change). Code-only, no migration.
- **scope:**
  1. Refactor so the canonical fn owns the rule: `computeDailyMacroTargets`
     takes `weightKg` (true bodyweight) + `bodyFatPct?` + `phaseType`, and
     internally: if bf% present → `lean = weight×(1−bf%/100)`,
     protein = `lean × table[phaseType]` (or the phase's explicit
     `protein_g_per_kg` override); else → protein = `weight × 1.6`. Remove the
     misnamed `weightKg` pass-through. `targets.ts`/`computePhaseTargets`
     becomes genuinely thin (just shape mapping).
  2. Add the two named constants
     (`PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM = { cut: 2.4, maintenance: 2.0,
     bulk: 1.8 }`, `PROTEIN_FALLBACK_G_PER_KG_BODYWEIGHT = 1.6`) in
     `src/lib/macros.ts`.
  3. `PhaseDialog`: on `phase_type` select/change, pre-fill the
     `protein_g_per_kg` field from the table (only when the user hasn't
     manually overridden it); update placeholder/help text to state the
     lean-mass basis + the table default for the chosen type.
  4. UI basis labels: wherever a protein target / g/kg is shown (PhaseDialog
     summary, `ObjetivosPage:222`, Diario targets), label the active basis —
     lean-mass path shows "× lean mass"; fallback path shows "1.6 g/kg
     bodyweight — add a body-fat % for a phase-tuned target" (ES/EN i18n keys,
     namespace `phases`/`objetivos`).
  5. Recompute behavior: existing phases keep their stored `protein_g_per_kg`
     (no retroactive change); only new phases get table defaults. Document this.
  6. Docs: record the nutrition rationale (lean basis, Helms FFM range, why
     phase-aware, why 1.6 BW fallback, fallback is a deliberate nudge) and the
     resolved rule + canonical-fn ownership + visible-basis requirement. D-B2
     contributes no action items of its own — it is subsumed entirely by D-B1's
     action list (no `profiles.default_protein_g_per_kg` column, no
     `phases.protein_g_per_kg_snapshot` column, no Settings "Nutrition
     defaults" card).

## R-06 — fractionToPct/pctToFraction helper; refactor 3 inline sites; verify/add DB CHECK
- **decision:** D-B3
- **blocked-by:** —
- **status:** done (2026-05-18) — helper + 3 sites + tests landed earlier;
  the DB CHECK `phases_fat_pct_of_kcal_range` migration was applied to prod at
  the Wave-3 checkpoint (pre-flight confirmed 0 out-of-range rows).
- **scope:**
  1. Add a shared `fractionToPct` / `pctToFraction` pair (or a single
     documented constant) in `src/lib/macros.ts` (or `src/lib/` utils).
  2. Refactor the 3 inline ×100 / ÷100 sites (`PhaseDialog.tsx:88`, `:107`,
     `ObjetivosPage.tsx:225`) to use it.
  3. Verify the 0.10–0.60 bound at the DB level; add a CHECK constraint via
     migration if absent (currently only `register` min/max in `PhaseDialog`).
  4. Docs: record "fat stored as fraction; always convert via the shared helper
     at any UI boundary, never inline ×100."

## R-07 — TDEE adaptive-Kalman model — own design spec first, then schema + rewrite recalculate-tdee
- **decision:** D-B4
- **blocked-by:** —
- **status:** done (2026-05-18) — spec written
  (`docs/superpowers/specs/2026-05-18-adaptive-tdee-design.md`); edge-fn
  rewrite + filter + confidence UI landed; schema migration
  (`supabase/migrations/20260518020000_r07_adaptive_tdee_state.sql`) applied
  to prod and `recalculate-tdee` deployed at the Wave-3 checkpoint (ordered:
  edge deploy first, then migration; `tdee_state` seeded + verified). Filter = 2-state linear
  Kalman on `[trend_weight, expenditure]` in the pure core
  `src/core/tdee.ts` (deterministic Vitest, 18 tests); schema approach =
  new `tdee_state` table + 2 nullable `tdee_estimates` cols
  (`confidence`/`is_warmup`) — order-free wrt the separately-applied R-08
  col-drop (verified intact after R-08 dropped its 4 cols). `body_measurements_smoothed` retained (no longer the TDEE
  input — the filter maintains its own trend weight; see spec §8). The
  Sprint-17 reader contract is unchanged (additive confidence only).
- **scope:** Standalone sprint — write a design spec before implementing
  (`docs/superpowers/specs/`).
  1. Design spec: choose the filter (1-D adaptive reconciliation vs 1-D/2-D
     Kalman on [trend_weight, expenditure]); define cold-start/warm-up policy
     (days before first estimate emitted); missing-weigh-in / long-gap
     handling; whether 7700 stays a fixed prior or is also adapted.
  2. Schema: new per-user state (e.g. `tdee_state`: trend_weight_kg,
     expenditure_kcal, variance/covariance, last_updated_on) or extend
     `tdee_estimates`; decide at spec time. Migration.
  3. Rewrite `recalculate-tdee/index.ts` as a daily incremental filter update
     (cron cadence likely unchanged — daily, after the snapshot job). Remove
     `WINDOW_DAYS`/`MIN_INTAKE_DAYS`/`WEIGHT_TOLERANCE_DAYS` constants and the
     two-endpoint path.
  4. Surface filter-derived confidence in the UI (low-confidence estimate
     badge) where `estimated_tdee_kcal` is shown.
  5. Re-evaluate whether `body_measurements_smoothed` (5-day MA view) is still
     needed once the filter maintains its own trend weight.
  6. Docs: record the model switch + rationale (two-endpoint fragility) and
     that 14d/10d/7700/±3d are retired as the primary mechanism.

## R-08 — Drop 4 dead tdee_estimates cols; wire mifflinStJeor as derived "Estimated BMR" display
- **decision:** D-B5
- **blocked-by:** R-00
- **status:** done (2026-05-18) — 4 dead cols (`bmr_kcal`, `activity_kcal`,
  `neat_residual_kcal`, `workout_kcal_logged`) removed from
  `src/types/database.ts` `tdee_estimates` Row/Insert/Update (grep-confirmed
  no code read/wrote them — the R-07 edge rewrite already wrote nothing to
  them); R-07's `confidence`/`is_warmup`/`tdee_state` left intact. BMR display
  wired: `estimatedBmr` (+ `ageYearsFromBirthDate`) pure helpers in
  `src/lib/macros.ts` — derived, never-stored (same pattern as
  `computeTargetWeightKg`; returns `null` on incomplete profile/no
  measurement), surfaced on `/progreso` in `LatestMeasurementCard` alongside
  the other latest body metrics (rationale: that card already shows
  weight/bf%/muscle%/water% and BMR is a body metric that moves with weight;
  most consistent placement). Display only — never feeds protein/TDEE/targets
  (D-A6/D-B5 guardrail). i18n `metricas.fields.estimatedBmr`/`estimatedBmrHelp`
  ES+EN; deterministic Vitest added for both new helpers. The
  `ALTER TABLE … DROP COLUMN` of the 4 cols
  (`supabase/migrations/20260518050000_r08_drop_dead_tdee_cols.sql`) was
  applied to prod at the Wave-3 checkpoint (order-free wrt R-07's
  `20260518020000`; R-07's `confidence`/`is_warmup` verified intact after the
  drop). `tdee_estimates` was empty (0 rows) — zero data destroyed.
- **scope:**
  1. DB migration: drop `bmr_kcal`, `activity_kcal`, `neat_residual_kcal`,
     `workout_kcal_logged` from `tdee_estimates` (new file in
     `supabase/migrations/`).
  2. `src/types/database.ts`: remove those 4 fields from `tdee_estimates`
     Row/Insert/Update (lines ~563/565/570/574, ~577/579/584/588,
     ~591/593/598/602). (Becomes automatic once the R-04 generated-types switch
     lands; hand-edit until then.)
  3. Audit `recalculate-tdee/index.ts` and any reader for references to the 4
     dropped fields before the migration (grep confirmed edge fn writes none
     today; re-verify at impl time).
  4. Keep `mifflinStJeor` in `src/lib/macros.ts`; add a UI surface for
     "Estimated BMR" computed on render from profile + latest weight, never
     stored (same pattern as `computeTargetWeightKg`) — placement at impl time
     (candidates: `/objetivos`, `/progreso`, Settings biometrics); i18n keys
     ES/EN, namespace decided with placement.
  5. Docs: record "BMR (Mifflin-St Jeor) is a derived, never-stored display
     value — recompute, don't persist (same rule as target-weight)"; record
     that the §6.4 energy-breakdown (activity/NEAT/workout split) was
     descaffolded, why (built on the replaced two-endpoint model + a
     non-existent Workouts module), and that any expenditure decomposition is
     now owned by the R-07 adaptive-TDEE spec.

## R-09 — RHF + zod migration across ~6–8 forms; co-located schemas
- **decision:** D-C2, D-C3
- **blocked-by:** —
- **status:** done (2026-05-18) — `@hookform/resolvers` installed; all 15
  forms migrated to `useForm + zodResolver + z.infer/z.input` with schemas
  co-located per feature (`features/{phases,objetivos,auth,profile,
  measurements,ingredients,recipes,templates,planning,diario}/schema.ts`). No
  plain `type FormValues = {` object form types remain (grep-verified).
  Validation/UX/payloads preserved exactly: PhaseDialog keeps R-02 notesOnly
  + R-05 protein prefill + R-06 fat fraction conversion; combined/single
  error messages map to existing i18n keys (no raw English zod text); the
  Settings language + theme single-control Selects stay controlled (no
  validated submit). Carried R-16 Tier-2: `*.test.tsx` run under jsdom via
  `environmentMatchGlobs` while Tier-1 `*.test.ts` stay Node; PhaseDialog +
  MeasurementDialog component tests added. CI `lint-build` job unchanged.
  vitest 98/98 (90 Tier-1 + 8 Tier-2).
- **follow-up:** done (2026-05-18) — the canonical `todayInTZ()` (Europe/Madrid
  day boundary) introduced by this fix is now also used by the two sibling
  host-TZ "today" sites left out of the original PR's scope: `DateNavigator.tsx`
  (date-input `max` + isToday + future-shift guard) and `phases/api.ts`
  `fetchActivePhase` (active-phase-on date). `todayInTZ` migration complete.
- **scope:**
  - Audit first: grep `useForm|useState.*[A-Z]Form|onChange=\{` to enumerate
    every form. Estimate ~6–8 (OnboardingPage, IngredienteEditor,
    RecetaEditorPage, measurement entry / new measurement form, SettingsPage
    cards [display_name, biometrics, language, theme], meal log entry on
    DiarioPage, PlantillaEditorPage). ObjetivosPage + PhaseDialog already use
    RHF — just add `zodResolver`.
  - Single sprint, single PR.
  - `pnpm add @hookform/resolvers`. Keep `zod` (stops being dead weight).
  - Replace `type FormValues = { ... }` with
    `type FormValues = z.infer<typeof schema>` in each form file (this also
    resolves D-C3 — form types become `z.infer<typeof schema>`; no separate
    action needed).
  - Switch each form to `useForm<FormValues>({ resolver: zodResolver(schema) })`.
  - Convert plain `useState` forms by introducing `useForm`; map existing
    controlled inputs to `register()` or `Controller`. Schemas co-located per
    feature (e.g. `src/features/recipes/schema.ts`,
    `src/features/phases/schema.ts`).
  - Update the conventions doc ("RHF + zod everywhere; schemas co-located per
    feature; form type via `z.infer<>`") and CLAUDE.md when restructuring docs.

## R-10 — Add src/components/ui/badge.tsx; refactor 4 inline sites; update docs
- **decision:** D-D1
- **blocked-by:** —
- **status:** done (2026-05-18)
- **scope:**
  1. Add `src/components/ui/badge.tsx` (shadcn's official component, ~50 lines,
     CVA-based variants).
  2. Variants: `primary` (`bg-primary text-primary-foreground`), `secondary`
     (`bg-secondary text-secondary-foreground`), `outline`
     (`border border-border text-muted-foreground`), `warning`
     (`bg-amber-100 text-amber-900 dark:bg-amber-950/40
     dark:text-amber-200`).
  3. Refactor 4 inline sites: `src/pages/ObjetivosPage.tsx:33-38` (delete
     local `badgeCls` helper, replace with `<Badge variant="...">`);
     `src/pages/PlantillasPage.tsx:68` (`<Badge variant="secondary">`);
     `src/pages/PlanificadorPage.tsx:97` (`<Badge variant="warning">`);
     `src/features/diario/components/MealLogEntry.tsx:26`
     (`<Badge variant="secondary">`).
  4. Update HANDOFF.md "Missing: badge" line and CLAUDE.md badge convention to
     reflect new state.

## R-11 — Composition-chart redesign: fat/lean 100% stack + muscle/water trend charts + local %↔kg toggle
- **decision:** D-D5
- **blocked-by:** —
- **status:** done (2026-05-18) — `CompositionChart.tsx` reworked: fat/lean
  2-series stack (fat bottom, `domain={[0,100]}` in % mode, auto in kg mode);
  pure `composition.ts` helpers (`leanPct`/`fatKg`/`leanKg`/`pctToKg`) with
  unit tests; independent non-stacked `TrendChart` cards for bodyFat%/muscle%/
  water% in a responsive grid below the stack; local `useState` `%↔kg`
  `UnitToggle` (TimeRangePills pattern — no URL/persistence). `interpolateSeries`
  reused (no second copy). Presentational only — no protein/TDEE/targets
  touched. vitest 90/90.
- **scope:** One implementation sprint (chart-rework feature).
  1. Rework `CompositionChart.tsx`: fat%/lean% 2-series stack (fat bottom),
     `domain={[0,100]}` retained (now correct). Derive `lean = 100 − bodyFat`
     (skip points where `bodyFat == null`, same as today's interpolation
     gating).
  2. Add independent trend charts for `muscle%` (and `water%`, and a
     `bodyFat%` trend) — separate chart components / cards; reuse
     `interpolateSeries`, `TimeRangePills`, the shared range/window helpers.
  3. `%`↔`kg` unit toggle as local `useState` (consistent with the
     no-query-string-state + per-chart independent local state rules — no
     URL/persistence). Frontend kg math from `weight_kg`
     (`fat_kg = bodyFat%/100 × weight`, `lean_kg = weight − fat_kg`,
     `muscle_kg = muscle%/100 × weight`, `water_kg = water%/100 × weight`);
     axis switches to a kg `domain` (auto) in kg mode.
  4. i18n: ES/EN keys for lean/fat legend, the new trend chart titles, and the
     %/kg toggle labels (namespace `metricas`).
  5. Docs: replace the old rule with the corrected one — "composition stack is
     fat%/lean% only (a true 100% partition; hard 0–100 cap is correct);
     muscle/water are independent trend series, never stacked into the
     partition; %↔kg is a local frontend toggle." Record why the old
     fat+muscle+water stack was a category error (non-disjoint ratios) so it
     isn't reintroduced. The kg decomposition is presentational only and must
     not feed protein/TDEE.

## R-12 — materialize_plan_for_date RPC + partial unique index + date<=today guard; delete client/edge mirrors
- **decision:** D-D6
- **blocked-by:** R-00
- **status:** done (2026-05-18) — RPC + partial unique index + date≤today guard
  (`supabase/migrations/20260518060000_r12_materialize_rpc.sql`,
  `materialize_plan_for_date` SECURITY INVOKER + `set search_path = public`,
  partial unique index `meal_logs_user_plan_slot_uidx`, in-RPC
  `p_date > (now() at time zone 'Europe/Madrid')::date` no-op guard mirroring
  `todayInTZ`/`previousDayInTZ`); client (`src/features/diario/api.ts`) +
  edge (`daily-nutrition-snapshot/index.ts`) switched to the RPC; the
  hand-mirrored client query/dedup logic and the edge's mirrored
  `materializePlanForDate` + duplicated `MEAL_TYPE_ORDER` removed (single
  source = the RPC). R-12's code depended on its migration, so the ordered
  Wave-3 apply was: migration applied to prod → **PR #38 merged** → 
  `daily-nutrition-snapshot` redeployed. RPC smoke verified (future date→0,
  today idempotent, plan rows materialized).
- **scope:** One implementation sprint (migration + RPC + client/edge
  rewiring).
  1. Migration: create `materialize_plan_for_date(p_user_id uuid, p_date date)`
     RPC (SECURITY INVOKER, `set search_path = public`); add the partial unique
     index `unique (user_id, plan_week_slot_id) where plan_week_slot_id is not
     null` on `meal_logs`; RPC body = current week-pick + slot select +
     `INSERT … ON CONFLICT DO NOTHING`, guarded by `p_date <= current_date`
     (clarify TZ — Madrid; reuse the project's date-in-TZ convention, same
     Madrid-TZ "today" as `previousDayInTZ()`).
  2. `src/features/diario/api.ts`: replace `materializePlanForDate` body with a
     single `supabase.rpc('materialize_plan_for_date', …)` call (keep the
     function name/signature; returns inserted count).
  3. `src/features/diario/hooks.ts` / `DiarioPage.tsx`: keep
     `useMaterializePlan` (still background, error-only toast) — the
     client-side `(date, mutation status)` gate can be relaxed once DB
     idempotency lands (decide at impl time; safe to keep).
  4. `supabase/functions/daily-nutrition-snapshot/index.ts`: delete the
     mirrored `materializePlanForDate` (lines 137–192) and the local
     `MEAL_TYPE_ORDER`; call the RPC via the service-role client.
     `computePlanned`/`computeConsumed` stay.
  5. Audit grep `SECURITY DEFINER` across migrations — confirm this new RPC is
     INVOKER and only `apply_template_to_week_admin` is DEFINER.
  6. Docs: record the confirmed model + "materialization is one INVOKER RPC,
     DB-idempotent via the partial unique index, bounded to `date <= today`;
     never duplicate it client/edge again"; record the three defects + why the
     RPC consolidation.

## R-13 — AuthProvider profile→i18n sync effect
- **decision:** D-E1
- **blocked-by:** —
- **status:** done (2026-05-18)
- **scope:** Small change (one sync effect).
  1. Add a profile→i18n sync: when the profile loads (or changes) and
     `profile.language` is set and `!== i18n.language`, call
     `void i18n.changeLanguage(profile.language)`. Place in `AuthProvider` (or
     a small top-level app component) so it runs once auth/profile is
     available, after the detector has already set the pre-auth language.
     Guard against a loop with the `!==` check.
  2. LanguageSwitcher persistence is DROPPED by D-E4 (R-15 removes the switcher
     from the authenticated app, so it only ever runs pre-auth where no profile
     row exists yet). No authed persistence is needed from the switcher;
     Settings remains the only authed write path.
  3. Keep `caches: ['localStorage']` so an authenticated change still updates
     localStorage (keeps pre-auth boot fast and consistent on the same device).
  4. Docs: document the true end-to-end order — authenticated: `profile.language`
     (applied post-auth) → else `localStorage → navigator → es`; record the
     prior drift (profile.language was never read at boot → cross-device
     preference loss) so it isn't reintroduced.

## R-14 — Drop profiles.units; purge from types
- **decision:** D-E3
- **blocked-by:** R-00
- **status:** done (2026-05-18) — `units` removed from `src/types/database.ts`
  earlier; `profiles.units` was fully code-dead (grep-verified: no read/write
  anywhere — the unrelated `unit_type`/recipe-`units`/diario-`units.*`/
  `unitSuffix`/composition `UnitToggle` tokens are out of scope), so the code
  side was types-only. The `ALTER TABLE … DROP COLUMN units`
  (`supabase/migrations/20260518040000_r14_drop_units.sql`) was applied to
  prod at the Wave-3 checkpoint (both rows were the dead `'metric'` default —
  no real data lost).
- **scope:**
  1. DB migration: `ALTER TABLE profiles DROP COLUMN units;` (new file in
     `supabase/migrations/`).
  2. `src/types/database.ts`: remove `units` from `profiles` Row/Insert/Update
     (lines 459 / 473 / 487). (Becomes automatic once the R-04 generated-types
     switch lands; hand-edit until then.)
  3. Grep-verify no stray references before the migration (current grep: none
     read/write it; the `unitSuffix`/`unit_type` hits are ingredient
     unit_type, unrelated).
  4. Docs: state metric-only as an invariant (kg/cm/g; DB stores metric
     canonically); record that `units` was dead legacy and removed, and
     preserve the shelved imperial-toggle design (reuse-the-column-or-recreate,
     profile-backed like language, `useUnits()` hook/context, client-side
     conversion only at display/input boundaries via shared helpers, DB always
     metric, ft/in input UX + per-unit rounding + round-trip stability,
     interacts with R-11's composition kg-toggle, macros likely stay grams) so
     a future revisit starts from the analysis, not zero.

## R-15 — Remove LanguageSwitcher from AppLayout; keep pre-auth only
- **decision:** D-E4
- **blocked-by:** —
- **status:** done (2026-05-18)
- **scope:**
  1. `src/components/layout/AppLayout.tsx`: remove the `LanguageSwitcher`
     import + its render at line 49 (keep the sign-out button and the flex
     container).
  2. Leave `LanguageSwitcher` on `LoginPage` / `SignupPage` / `OnboardingPage`
     as-is (pre-auth, localStorage-only is correct there — no profile row
     exists yet; the post-onboarding profile write + R-13's profile→i18n sync
     reconcile it once authenticated).
  3. Docs: restate the now-true rule — "authenticated language change is
     Settings-only (persists to `profile.language`); the one-click
     `LanguageSwitcher` appears only on the unauthenticated/onboarding routes
     that precede Settings access"; record the drift (header switcher was
     app-wide + non-persisting) so it isn't reintroduced. This also drops D-E1
     action item 2 (persist from switcher when authed).

## R-16 — Vitest Tier-1 (spec-first) + Tier-2 (with R-09) + Tier-3 (after R-00)
- **decision:** D-F1
- **blocked-by:** R-00 (Tier-3 only)
- **status:** in-progress — Tier-1 (Vitest + CI `pnpm test` in the `lint-build` job) landed; Tier-2 **landed** (rode R-09, 2026-05-18): `*.test.tsx` run under jsdom via `environmentMatchGlobs` while Tier-1 `*.test.ts` stay Node, all in the same `pnpm test` / unchanged `lint-build` job; PhaseDialog + MeasurementDialog component tests added (`@testing-library/react` + `jsdom`). Only Tier-3 (DB/RLS/RPC via local `supabase start` + pgTAP) remains, gated behind R-00.
- **scope:** Spec-first; Tier 1 is its own sprint, Tier 2 rides with R-09,
  Tier 3 is gated behind R-00.
  1. Spec: `docs/superpowers/specs/` test-strategy doc — tier boundaries,
     what's unit vs component vs DB, the schema-baseline prerequisite for
     Tier 3, CI shape, edge-function (Deno) test job.
  2. Tier 1 sprint: `pnpm add -D vitest`; add `test` script; first suites on
     the pure-logic modules (`lib/macros.ts`, `features/recipes/macros.ts`,
     `features/phases/targets.ts`, `interpolateSeries`, the B3 fraction
     helpers, edge `_shared/macros.ts`, `lib/dates.ts`) — prioritize the B1
     protein landmine, B3 conversion, `interpolateSeries`, recipe-macro
     scaling. As R-05/R-06/R-07/R-11/R-12 land, their action lists must include
     tests (cross-cutting "new pure logic ships with Vitest coverage" rule).
  3. CI: `.github/workflows/ci.yml` — pnpm install, `lint`, `build`, `test`;
     a separate job for Deno edge-function tests. Wire branch protection so
     auto-merge only fires after CI green. Fix CLAUDE.md's "after CI" claim to
     point at the real workflow once it exists.
  4. Record the schema-baseline-into-migrations prerequisite (R-00) as a
     tracked task (blocks Tier 3). Until it exists, RLS/RPC correctness rests
     on manual review only — document that gap honestly.
  5. Docs: the real gate (CI-enforced lint+build+test before merge, branch
     protection, the tier model); why no-test-runner was reversed, why tiered,
     why E2E excluded (explicitly out of scope for the solo MVP), the Tier-3
     blocker. Tier 2 = thin component layer (Vitest + RTL + jsdom) on
     high-value math-at-boundary pieces, rides with the R-09 RHF+zod sprint.

## R-17 — Extract shared pure camelCase macro/date core; edge snake adapter; Deno dep-pin
- **decision:** D-F3
- **blocked-by:** R-16 (Tier-1 first)
- **status:** done (2026-05-18) — shared pure camelCase core at
  `src/core/macros.ts` + `src/core/dates.ts` (dependency-free; only
  `Date`/`Intl`). Client (`src/features/recipes/macros.ts`, `src/lib/dates.ts`)
  re-exports/delegates to it with unchanged public API; edge
  `supabase/functions/_shared/macros.ts` re-exports the core and keeps the
  ONLY snake_case adapter (`toSnakeMacros`/`EMPTY_SNAKE`) at the
  `daily_nutrition_history` write boundary in `daily-nutrition-snapshot`. Edge
  imports the core via the relative path `../../../src/core/*.ts` (Deno-native
  resolution, no alias/transpile/codegen). Deno deps pinned once via
  `supabase/functions/deno.json` import map (`@supabase/supabase-js@2.45.4`);
  all 4 functions switched to the bare specifier. Parity net:
  `supabase/functions/_shared/macros.test.ts` asserts one golden-vector
  fixture set against BOTH the client path and the edge path; vitest 83/83.
- **follow-up (cross-root deploy validation) — RESOLVED 2026-05-18:** the edge
  imports the core via the cross-root path `../../../src/core/*.ts` (outside
  `supabase/functions/`); whether the deploy would bundle it was the open risk.
  Verified at the first prod deploy: `supabase functions deploy <fn> --use-api`
  follows and uploads the cross-root files (`src/core/*.ts` appear in the
  upload log) and the deployed functions execute them correctly. The
  vendor/relocate fallback was **not** needed — the core stays single-source
  at `src/core/`. Operational note recorded in `docs/operations.md`: deploys
  must pass `--use-api` (Docker-free server-side bundling).
- **scope:** Own small refactor sprint; depends on R-16 Tier-1 golden vectors
  existing first (they guard the extraction). Coordinate with R-12 (already
  removes the materialization mirror via RPC) and R-05/R-06/R-11 (they touch
  macro math — sequence so the core is extracted before/alongside, not
  duplicated again).
  1. Create a pure, dependency-free core module (camelCase) for: macro
     arithmetic (`add`/`scale`/`ingredientMacros`/`recipePerServingMacros`
     equivalents + `computeRecipeMacros`/`roundMacro`) and date/TZ helpers
     (`isoDateInTZ`/`previousDayInTZ`/`mondayOfTodayInTZ` + the
     `src/lib/dates.ts` overlap). Location must be importable by both Vite
     (`@/`-resolvable or a neutral path) and Deno (relative path or import-map
     entry) — decide exact path at impl time.
  2. Edge: replace `_shared/macros.ts` internals with imports from the core;
     keep a thin snake_case adapter (`MacrosTotals` ⇄ camelCase) used only
     where rows are written to `daily_nutrition_history` (the upsert in
     `daily-nutrition-snapshot`).
  3. Client: `src/features/recipes/macros.ts` / `src/lib/dates.ts` re-export
     or call the core; no behavior change.
  4. R-16 Tier-1: a single golden-vector fixture set both the client path and
     the edge path are tested against (CI fails on divergence) — the parity
     guarantee.
  5. Deno deps: introduce an import map / `deno.json` (or a documented
     single-version rule) so `@supabase/supabase-js` (and others) are pinned
     once, not per-file.
  6. Docs: "edge functions = Deno+TS; `_shared/` is edge↔edge only;
     cross-runtime pure logic lives in the shared core imported by both;
     client↔edge stateful logic goes through DB/RPC; Deno deps pinned via the
     import map"; record the mirror-drift finding + why
     shared-core-not-codegen + why core is camelCase.

## R-18 — Cron liveness alerting (stale daily_nutrition_history/tdee_estimates → notify)
- **decision:** D-F5
- **blocked-by:** —
- **status:** done (2026-05-18) — liveness-alert code + edge fn + cron
  migration landed; `cron-healthcheck` deployed then the cron schedule
  applied to prod at the Wave-3 checkpoint (ordered: deploy first, then
  migration; Vault `cron_service_role_key` confirmed set). Mechanism =
  `cron-healthcheck` edge fn (chosen over the pure
  SQL+`net.http_post` variant: keeps the freshness predicate in a unit-tested
  pure module and reuses the existing `private.invoke_edge_function` + Vault
  `cron_service_role_key` path with no new secret). Pure freshness core at
  `src/core/liveness.ts` (`evaluateFreshness`/`decideAlert`, deterministic
  Vitest `src/core/liveness.test.ts`, 17 tests, frozen-clock). Edge fn
  `supabase/functions/cron-healthcheck/index.ts` (Madrid `todayInTZ()`;
  `console.error` structured `CRON_LIVENESS_ALERT …` line + HTTP 503 on alert
  so the failed run shows in `cron.job_run_details`). Cron schedule
  `supabase/migrations/20260518010000_r18_cron_healthcheck.sql` (`0 6 * * *`
  UTC, after the three data crons) applied to prod. Thresholds:
  `daily_history` stale if > 2 calendar days old (1d inherent snapshot lag +
  1 transient missed run tolerated + DST drift); `tdee_estimates` > 4 days
  (legitimately sparser via `insufficient_intake`, secondary signal — does not
  alert alone). Live DB/edge untouched by the PR.
- **scope:**
  1. Liveness alerting (small added scope): a daily check that the freshest
     `daily_nutrition_history` (and `tdee_estimates`) row is within expected
     recency; if stale → alert (email/log). Implementation candidates: a tiny
     extra cron + `private.invoke_edge_function` to a `cron-healthcheck` edge
     fn, or a pg_cron job that queries freshness and `net.http_post`s a
     notification. Decide mechanism at impl time; keep it dependency-light.
     This catches both the missing-Vault-secret case and the
     skipped-due-to-overrun case.
  2. `docs/operations.md` runbook: the one-time
     `vault.create_secret('<service_role_key>','cron_service_role_key')` setup;
     the rotation procedure (rotate key in Supabase dashboard →
     `vault.update_secret`/recreate → verify next cron run); a "how to tell
     crons are dead" manual check (pg_cron run history; latest
     `daily_nutrition_history` row); the 3-fixed-jobs scaling model + the
     execution-time-limit ceiling + deferred mitigations (batch/queue/shard).
  3. `docs/decisions.md`: full-service-role-key blast radius accepted (no
     scoped alternative in Supabase); the F2 secrets-history scan must
     explicitly verify the `cron_service_role_key` value never appeared in any
     commit (expected clean: migration uses the name only); rotation becomes
     more important post go-public.

## R-19 — Training MVP (Phase 1: ad-hoc session logging + rule-based coach)
- **decision:** (none yet — architectural guardrails §2.1 / §2.2 / §0.x
  in the spec are pending a D-id at impl-time follow-up)
- **blocked-by:** R-01 (the `exercises` table is born into the post-R-01
  shared-pool lifecycle model verbatim — copying the ingredients RLS +
  three-state owner semantics)
- **status:** done (2026-05-21) — Tasks 1–21 implemented; the 4 training
  migrations applied to prod 2026-05-21 (34 system-seed exercises,
  `workout_sessions`/`workout_sets`, `save_workout` RPC, 12 RLS policies).
  Tier-3 pgTAP for RLS / RPC / save-workout-replace-children remains gated
  behind R-16-Tier-3 / `supabase start` infra (not yet set up — documented
  gap).
- **spec:** `docs/superpowers/specs/2026-05-20-training-mvp-design-v2.md`
- **plan:** `docs/superpowers/plans/2026-05-20-training-mvp-plan.md`
- **scope:** First instance of the Training module. 3 tables
  (`exercises` shared pool with post-R-01 shape, bilingual names,
  per-exercise `default_increment_kg`; `workout_sessions` user-owned;
  `workout_sets` user-owned with RLS-via-join through `workout_sessions`,
  no denormalised user_id), 1 RPC `save_workout` (INVOKER,
  replace-children, mirrors save_recipe), 1 route `/entrenamiento` with
  list/edit/history pages, 5 starter coach rules (double-progression,
  rep-progression, flat-e1rm-deload, rpe-climbing-fatigue,
  muscle-recency) over the pure `core/training.ts` module (~55 Vitest
  tests, already in repo). Repeat-last-working-set placeholder on set
  rows (spec §6, Hevy pattern). Editable progression-rule suggestions
  (§0.15: rule provides the suggestion, user owns the decision).
  Bilingual exercise names (name_es required, name_en optional) with
  trigram search across both columns. NO LLM in the coach, ever —
  permanent product decision (§2.2).
- **out-of-scope (sequenced for future waves):** routines / programmed
  training, bodyweight/assisted/cardio modelling, the section split
  (Dieta/Entreno), home redesign, in-app onboarding, desktop layout,
  auto-progression beyond the 5 MVP rules. Each gets its own spec when
  scheduled.

## R-20 — Barcode scanning for ingredient import
- **decision:** (none — promotes the deferred "barcode-import" product idea in features.md)
- **blocked-by:** —
- **status:** done (2026-05-21) — camera scan (native BarcodeDetector
  fast-path + lazy @zxing/browser fallback) and manual EAN entry, both
  resolving through the new `getProductByBarcode` OFF v2 adapter into the
  existing IngredientDialog prefill flow. Client-only; no migration.
- **plan:** `docs/superpowers/plans/2026-05-21-barcode-scanning.md`
- **scope:** `getProductByBarcode` + `isValidEan` on `lib/openfoodfacts.ts`
  (Tier-1 tested); `BarcodeScanner` component (EAN-13/8 + UPC-A; @zxing/browser
  0.2.0 `BrowserMultiFormatOneDReader`, isValidEan filters non-grocery 1D
  formats); `BarcodeTab` in IngredientDialog reusing the OFF
  `pickedOFF`→`setForm` path; ES+EN i18n; `@zxing/browser` code-split. Tier-2
  test on the manual lookup path; real-camera integration deferred (manual
  device smoke per release).

## R-21 — OFF contribute-back
- **decision:** (none yet)
- **blocked-by:** R-20 (the barcode/OFF lookup path)
- **status:** implemented (2026-05-21), pending Wave-3 — code complete on
  `claude/r21-off-contribute`: pure eligibility gate + payload mapper
  (`core/offContribute.ts`, Tier-1), the `off-contribute` edge fn (new +
  server-side fill-missing-only for completions), client fire-and-forget
  gated on the new `profiles.contribute_to_off` toggle, scanned barcode
  retained as `external_id` on manual create, 404/complete transition
  banners. **Pending Wave-3:** apply the staged migration, register the OFF
  account + set edge secrets, deploy the edge fn (see operations.md runbook).
  Commercial barcode DBs (FatSecret etc.) were ruled out — their ToS forbid
  persisting data >24h, incompatible with our permanent public pool; OFF's
  ODbL allows store+redistribute, so contribute-back is the license-aligned
  coverage lever (R-20 + the lenient-prefill change squeeze existing OFF
  data, but can't conjure a product OFF has never seen).
- **spec:** `docs/superpowers/specs/2026-05-21-off-contribute-back-design.md`
- **plan:** `docs/superpowers/plans/2026-05-21-off-contribute-back.md`

### Sketch — mechanics
- **OFF write API:** `POST https://world.openfoodfacts.org/cgi/product_jqm2.pl`
  (the v1 write endpoint; a v3 write API exists in beta — confirm current
  recommended endpoint at spec time). Fields: `code` (barcode),
  `product_name`, `brands`, and per-100g nutriment fields
  (`nutriment_energy-kcal`, `nutriment_proteins`, `nutriment_carbohydrates`,
  `nutriment_fat`, `nutriment_fiber`, with `nutrition_data_per=100g`).
- **Auth:** OFF writes need an account. Two models:
  1. A single app-owned OFF contributor account (credentials in Supabase
     Vault, write proxied through a new `off-contribute` **edge function** —
     same Vault + edge pattern as the cron service key). Simplest; all
     contributions attributed to one "HudsonFitness" OFF user. **Recommended.**
  2. Per-user OFF OAuth — overkill for a solo/friends-and-family app.
- **Trigger points (in our flow):**
  - After a user **creates** an ingredient that originated from a barcode
    scan with a valid EAN and OFF returned 404 (genuinely absent) — submit
    the new product.
  - After a user **completes** a scanned-but-incomplete OFF product (the
    R-20 lenient path: name present, macros were 0 and the user filled
    them) — submit an update with the new nutriments.
  - Gate both behind the EAN being checksum-valid (`isValidEan`) and the
    macros being non-trivially complete (don't push all-zero rows back).
- **Where it hooks:** the `createManualIngredient` / `importIngredientFromOFF`
  mutations already know the saved row. Add an opt-in, fire-and-forget call
  to the `off-contribute` edge fn on success. Failures must be silent
  (a contribution failing must never block the user's own save).
- **Attribution:** ODbL requires attributing OFF as the source for data we
  *consume*; for data we *contribute*, OFF's own attribution applies. Add an
  OFF credit line to the ingredient create dialog / an About section.

### Open questions (resolve at spec time)
1. **User consent / privacy:** contributing makes the product (name, brand,
   macros — never the user's private note) public on OFF. Need an explicit
   opt-in toggle ("Share this product with Open Food Facts") — likely
   default-on for barcode-scanned products (they're commercial products,
   not personal data) but confirm. The per-user PII note (R-01
   `user_*_refs`) must NEVER be sent.
2. **Image upload:** OFF values product photos. Out of scope for v1 (we
   don't capture a product image yet); revisit if a photo-capture step is
   added to the scan flow.
3. **Quality gating:** only push when macros look sane (kcal in a plausible
   range, not all-zero). Avoid polluting OFF with junk — a bad contribution
   is worse than none.
4. **Rate / abuse:** the single-account model concentrates all writes under
   one OFF user; check OFF's contributor rate limits and set a sane cap.
5. **v3 write API:** confirm whether OFF now recommends the v3 write
   endpoint over `product_jqm2.pl` at spec time.

### Implementation flow once specced
`/brainstorming` (resolve the open questions, esp. consent default) →
spec → `/writing-plans`. Likely ~1 edge function (`off-contribute`,
Vault-held OFF creds), a small client opt-in toggle + fire-and-forget
call wired into the existing ingredient-create success path, an OFF
attribution credit, and Tier-1 tests on the field-mapping adapter
(our `OFFSearchResult`/manual form → OFF write payload). No DB migration.
