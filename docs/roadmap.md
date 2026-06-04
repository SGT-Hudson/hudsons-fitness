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
- R-21 — OFF contribute-back: push products to Open Food Facts (REMOVED 2026-05-21)
- R-22 — Training Routines & Cyclic Planner (F-2)
- R-23 — Guided active-workout runner (F-3)
- R-24 — Muscle activity heatmap (F-4)
- R-25 — Fix hide_owned_* blocked by pool UPDATE WITH CHECK (Tier-3 finding)
- R-26 — Fine muscle taxonomy (Project A) — 22-code model + `primary_muscles[]`
- R-27 — Bulk exercise catalog (Project B) — design in progress
- R-28 — Rich home dashboard + diet-completion calendar + adaptive-TDEE surface (post-V1 item 4)
- R-29 — In-app feature-discovery onboarding (post-V1 item 5)
- R-30 — Responsive desktop density, per-feature (post-V1 item 6 / U-8)
- Feature & UX family index (F-x / U-x / post-V1 items / Projects A–B) — at end

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
  redeployed (version 2). Tier-3 pgTAP for RLS / RPC now exists — the
  R-16-Tier-3 `supabase start` + pgTAP db-test job landed (2026-06-03, #149/#150)
  and is required on develop; the RLS/RPC/pool suites
  (`supabase/tests/01_rls_user_owned`/`02_rls_child`/`03_rls_pool`/`04_rpc`)
  cover this model (the gap is closed). **Phase 2 (auto-reaper) cancelled
  (2026-06-03) — will not be built.** Reapable garbage is structurally impossible with
  no community: it requires users creating pool items, hiding them, and no one
  else referencing them — the user base is currently one. Any stray duplicate
  or dead row is a 10-second manual SQL fix (the DB can still be reshaped
  destructively — no prod users). The trigger to revisit: the app opens to real
  users **and** anon-owned, zero-reference pool rows start actually
  accumulating. Two reframes recorded for that revisit (see D-A4): (a) the
  "negative community signal" predicate presupposes a community that does not
  exist — a zero-references-of-any-kind check (no `user_*_refs`, no
  `recipe_ingredients`, no `meal_logs`/plan slots) likely suffices on its own,
  so the voting feature may never be needed; (b) duplicates are better prevented
  at insert time (trigram similarity warning) than reaped after the fact.
- **spec:** `docs/superpowers/specs/2026-05-18-library-model-phase1-design.md`
- **plan:** `docs/superpowers/plans/2026-05-18-library-model-phase1-plan.md`
- **scope:** Build the unified ★ Library Contribution & Lifecycle Model
  covering ingredients and recipes. Phase 1 migration: replace per-user
  hard-delete and the recipe `deleted_at` soft-delete + partial unique index
  with the shared pool/reference structure — "delete" = hide = drop your
  reference row. (The creator keeps pool ownership; the anon transfer originally
  planned for hide was removed in **R-25** — hiding is just "remove from my
  library". The anon sentinel is now reached only via account deletion.)
  Retain `recipe_ingredients ON DELETE RESTRICT` as the DB-level
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
- **status:** done (2026-06-03) — all three tiers landed. Tier-1 (Vitest
  pure-logic) + Tier-2 (jsdom component, rode R-09) run in the `lint-build` CI
  job. **Tier-3 (DB/RLS/RPC via pgTAP) now runs as the `db-test` CI job**:
  `supabase start` applies the full migration history from zero into the real
  Supabase Postgres image, then `supabase test db` runs
  `supabase/tests/*.test.sql`. Suite: `00_schema` (RLS enabled on every table,
  the SECURITY-DEFINER-set invariant, search_path pinning, admin/infra grant
  isolation, key view/index existence), `01_rls_user_owned`, `02_rls_child`,
  `03_rls_pool`, `04_rpc` (replace-children, materialize guard + idempotency,
  one-active-program, hide/reconcile), and `05_muscles` (fine-taxonomy seed
  completeness, anti-drift vs `src/core/muscles.ts`, the
  `validate_exercise_muscles` trigger — added with **R-26** / #155). Config in
  `supabase/config.toml`; design spec
  `docs/superpowers/specs/2026-06-03-tier3-pgtap-ci-design.md` (+ the earlier
  `2026-05-18-test-strategy.md`). Promoted to a **required check on `develop`**.
  The from-zero reproducibility check is intrinsic to the `db-test` job itself
  (`supabase start` applies the full migration history from scratch each run);
  the standalone manual `db-tests.yml` workflow was not merged. Standing
  Tier-3 up caught two real defects: (a) a migration-ordering bug — the F-1
  whole-foods seed (`0523`) inserted `ingredients.sugar_g_per_unit` /
  `saturated_fat_g_per_unit` before `u1_sub_macros` (`0525`) added them (they
  were added to prod out of band), so a from-zero reset failed — fixed by
  `20260523120050_f1_ingredients_submacro_cols`; (b) the INVOKER hide RPCs are
  blocked by the pool UPDATE WITH CHECK (now **R-25**). R-25 was fixed (#151,
  migration `20260603120000_r25_hide_drops_ref_only`); only the R-22 UPDATE
  WITH-CHECK gap remains as a pgTAP `todo` test (visible, non-failing) so it
  flips green when fixed.
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
  Tier-3 pgTAP for RLS / RPC / save-workout-replace-children now exists under
  the R-16-Tier-3 `db-test` job (landed 2026-06-03, #149/#150 — gap closed).
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

## R-21 — OFF contribute-back (REMOVED)
- **decision:** (none)
- **status:** **removed (2026-05-21)** — built and shipped, then pulled as a
  product decision before it was ever activated (the OFF account/secrets were
  never finalised, so it never pushed anything to OFF). Removed: the
  `off-contribute` edge fn, `core/offContribute.ts`, `lib/offContribute.ts`,
  the `contributeToOff` trigger in IngredientDialog, the Settings opt-out
  toggle, and the `profiles.contribute_to_off` column (drop migration
  `20260524120000_r21_drop_contribute_to_off.sql`). **Barcode scanning (R-20)
  is unaffected** — the camera scan, OFF lookup, and manual prefill stay; only
  the *upload back to OFF* is gone. The spec/plan below remain as historical
  record. If revisited, the contribution path + the licensing analysis
  (OFF ODbL OK; commercial DBs' no-persist ToS not) are documented there.
- **spec:** `docs/superpowers/specs/2026-05-21-off-contribute-back-design.md` (historical)
- **plan:** `docs/superpowers/plans/2026-05-21-off-contribute-back.md` (historical)

## R-22 — Training Routines & Cyclic Planner (F-2)
- **decision:** (none yet — decisions recorded as D-F8 at impl time)
- **blocked-by:** R-19 prod apply (already applied 2026-05-21 — `exercises`,
  `workout_sessions`, `workout_sets`, `save_workout` live in prod)
- **status:** done (2026-05-24) — merged (#122); the four F-2 migrations
  applied to prod & verified (4 tables RLS-enabled with policies,
  `workout_sessions` program_id/routine_id stamps, 4 INVOKER RPCs incl. the
  7-arg `save_workout`). Security advisor clean for the new objects.
- **post-launch batch (2026-05-24):** B-2-family visual fixes — routine
  exercise names no longer wiped on add, edit-session shows logged exercises
  (#126); search exercises by muscle (dropdown filter + muscle-name text
  match) (#127); warm-up sets in routines as % of working weight + reps,
  computed client-side on workout start, rounded to 2.5 kg (#128, migration
  `20260529120000_f2b_warmup_sets.sql` applied to prod 2026-05-24).
- **spec:** `docs/superpowers/specs/2026-05-24-training-routines-planner-design.md`
- **plan:** `docs/superpowers/plans/2026-05-24-training-routines-planner.md`
- **scope:**
  - **Routine builder** (`/routine`, child editor routes) — reusable named
    exercise templates with target sets/reps/RPE/rest; `save_routine` RPC
    (replace-children, mirrors `save_recipe`); list + edit views.
  - **Program/cycle builder** — a program references an ordered list of
    routines (one routine per day-slot, rest days allowed); `save_program` RPC
    (replace-children); list + edit views.
  - **Planner-first `/training` (Hoy / Today)** — `TodayPlan` component
    computes today's slot on the fly from `anchor_date + day_index` modulo
    the cycle length (pure `src/core/programs.ts`, no DB materialization);
    `set_active_program` RPC performs the atomic active-flip that re-anchors
    from today; one active program per user enforced by a partial unique index.
  - **Prefill handoff** — tapping today's slot opens the existing workout
    logger pre-filled with the routine's exercises; `save_workout` gains two
    nullable provenance stamp args (`p_program_id`, `p_routine_id`); null = ad-hoc.
  - **B-2 fix** — fix included as part of F-2 scope.
- **out-of-scope (sequenced after F-2):** F-3 guided runner (**shipped — see
  R-23**), F-4 muscle browse/heatmap (**shipped — see R-24**), U-8 visual pass
  (still pending), per-set/pyramid prescriptions, prescribed weights.
- **RLS hardening follow-up:** the pre-existing `workout_sets` and
  `recipe_ingredients` UPDATE policies have `using` but no `with check` (a
  user could re-point a child row into another user's parent). F-2's new child
  tables (`routine_exercises`, `program_days`) close this with both clauses;
  backfill the two older tables in a follow-up migration.

## R-23 — Guided active-workout runner (F-3)
- **decision:** D-F9
- **blocked-by:** R-22 (F-2 routines/planner — shipped)
- **status:** done (2026-05-26) — merged (#132 runner, #133/#134/#135 review
  fixes); released to `main` in release `2026-05-26` (#137). **No schema/RPC
  change** — reuses the F-2 `save_workout` (already accepts `rpe`, `is_warmup`,
  `p_program_id`, `p_routine_id`).
- **spec:** `docs/superpowers/specs/2026-05-25-training-guided-runner-design.md`
- **plan:** `docs/superpowers/plans/2026-05-25-training-guided-runner.md`
- **scope:**
  - **Runner** launched from today's slot (`/training/run`, `RunnerPage`): walks
    warm-ups → working sets with a rest timer, per-set prefill-from-last, inline
    logging, single atomic save at finish.
  - **Pure state core** `src/core/runner.ts` (`buildRunnerState`, `runnerReducer`,
    selectors, `computeTimerView`) + per-set `prefillSetsForExercise` in
    `src/core/training.ts`. UI in `src/features/training/runner/` (orchestrator
    `Runner.tsx` + screens) with hooks `useRestTimer` / `useRunnerDraft` /
    `useWakeLock` and `fireRestAlarm`. See `architecture.md#runner-state-model`.
  - **Persistence:** ephemeral reducer mirrored to localStorage
    (`hf:runner:draft:v1`) + resume prompt; no mid-workout DB writes; cross-device
    resume deliberately excluded (D-F9).
  - **Escape hatches:** jump / skip (→ up-next) / end-exercise-early (keeps
    recorded sets) / add-set; leaving an in-progress exercise demotes it to
    `partial` (resumable) or `pending`, never stranded.
  - **Review-fix follow-ups (shipped):** bottom-pinned actions; borderless
    working-weight stepper; **RPE whole-numbers-only** (UI + zod `.int()`; DB
    CHECK still permits 0.5 — integers are a subset, no migration); rest-aware
    READY button; performance colours on logged reps/weight; header
    `routine · Ej x/N` + persistent "Cambiar" switch button.
- **deferred (not built):** native (Capacitor) background-timer notifications;
  DB-backed in-progress sessions / cross-device resume; richer in-runner coaching;
  per-set/pyramid/drop-set prescriptions; prescribed weights.

## R-24 — Muscle activity heatmap (F-4)
- **decision:** D-F10
- **blocked-by:** R-19 (the `exercises` pool + `workout_sets` it aggregates —
  shipped) and R-22/R-23 (the `/training` page it embeds into — shipped)
- **status:** done (2026-05-26) — merged (#136 heatmap, #139 inline-on-`/training`
  + gender-follows-profile follow-up); released to `main` in release `2026-05-26`.
  The one schema change — `exercises.secondary_muscles` + its CHECK
  (`20260530120000_f4_secondary_muscles`) — was applied to prod 2026-05-26 (34
  system exercises present, 27 re-tagged, 7 isolation lifts left empty). Because
  the app has no production users yet, the migration re-tags the system seed
  in-place with **no backfill**.
- **superseded (2026-06-04) by R-26 (Project A, #155):** the coarse-12 taxonomy,
  the single `exercises.primary_muscle` column, and the `exercises.secondary_muscles`
  CHECK described in the scope below were replaced by the fine 22-code `muscles`
  dictionary table + `exercises.primary_muscles[]` (multi-primary) + the
  `validate_exercise_muscles` trigger; volume now credits **each** primary 1.0.
  The scope text below is kept as the F-4-era record — see R-26 for the current model.
- **spec:** `docs/superpowers/specs/2026-05-26-muscle-heatmap-design.md`
- **plan:** `docs/superpowers/plans/2026-05-26-muscle-heatmap.md`
- **scope:**
  - **Volume aggregation** — a pure `src/core/muscleVolume.ts`
    (`computeMuscleVolume`) over the user's working sets: the primary mover earns
    1 set, each secondary mover earns `SECONDARY_SET_WEIGHT` (0.5), warm-ups are
    excluded, and `full_body` sets are counted into a separate footnote (they do
    not shade the map). Windowed (7d / 30d / 6mo / all, default 30d), filtered
    server-side by `session.performed_on`.
  - **Body heatmap** — front+back SVG body shaded grey→amber→red by per-muscle
    volume, embedded **inline on `/training`** (between today's plan and the
    recent-sessions list — no separate route), with a `Muscle · N sets` ranked
    list and the full-body footnote. Male/female art auto-selects from
    `profiles.sex` (reactive — follows the profile once it loads) with a manual
    toggle override.
  - **Pluggable body-art skin** (`features/training/muscleMap/skins/`) so the
    artwork is swappable behind a `BodyArtSkin` interface; v1 = vendored MIT art
    (react-native-body-highlighter lineage, LICENSE in-repo) whose ~23 region
    slugs aggregate up to the coarse-12 taxonomy.
  - **Secondary-muscle tagging** — `exercises.secondary_muscles text[]` (CHECK:
    subset of the 11 specific codes; `full_body` is not a valid secondary), edited
    via a multi-select in `ExerciseDialog`. Muscle labels reuse the existing
    `entrenamiento:exerciseDialog.primaryMuscle.<code>` keys.
- **deferred (not built):** a per-exercise muscle-detail / browse view;
  recommendations driven off the volume data (the broader catalog-expansion goal
  that would power them is separate — Project B / R-27). (The finer muscle
  taxonomy once deferred here shipped as **R-26**.)

## R-25 — hide_owned_* drops the reference only (keep owner) — Tier-3 finding
- **decision:** (folds into D-A4)
- **blocked-by:** —
- **status:** done (2026-06-03) — found by R-16 Tier-3, fixed in
  `20260603120000_r25_hide_drops_ref_only`. `hide_owned_recipe` /
  `hide_owned_ingredient` were `SECURITY INVOKER` yet transferred pool
  ownership to the anon sentinel (`update … set created_by_user_id = anon`),
  which the pool UPDATE policy's `with check (auth.uid() = created_by_user_id
  and created_by_user_id <> anon)` rejected (SQLSTATE 42501) — **hiding was
  broken under RLS** (never surfaced: no prod users). The anon-transfer-on-hide
  existed only to feed the R-01 Phase-2 reaper, which is now **cancelled**, so
  it was dead complexity. **Fix: hide now just drops the caller's reference
  row** — a single-table delete, still INVOKER. The creator keeps ownership +
  edit rights and can re-add the item later; "hide" means "remove from my
  library", not "disown". The anon sentinel is now reached **only** via account
  deletion (`reconcile_account_delete`, DEFINER — legitimately reassigns a
  departing user's still-owned items so FKs are not stranded; unchanged). No
  RLS-policy change and no new DEFINER, so hard-invariant #3 and the `00_schema`
  SECURITY-DEFINER-set invariant stay intact. `04_rpc` hide asserts flipped from
  `todo` to hard assertions (ref dropped, ownership retained) +
  `hide_owned_ingredient` coverage added.

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

## R-26 — Fine muscle taxonomy (Project A) — 22-code model + `primary_muscles[]`
- **decision:** D-F11 (supersedes D-F10(b))
- **blocked-by:** R-24 (refines the F-4 heatmap — shipped)
- **status:** done — Project A merged to develop 2026-06-04 (#155) + the
  anatomical-review retag-fix migration
  `20260604130000_fine_taxonomy_retag_review_fixes` (#156); released to `main` in
  release `2026-06-05`. No prod users → the 34-row system seed was re-tagged in
  place (no backfill).
- **spec:** `docs/superpowers/specs/2026-06-04-exercise-catalog-expansion-design.md`
- **plan:** `docs/superpowers/plans/2026-06-04-fine-muscle-taxonomy-project-a.md`
- **scope (Project A — the fine model + engine + UI):**
  - **Taxonomy** — 22 fine shadeable codes in 6 groups (shoulders:
    delt_front/side/rear; chest: pec_upper/lower; back: lat/trap/rhomboids/
    lower_back; arms: biceps/tri_long/tri_lateral/forearms; core:
    abs_upper/abs_lower/obliques; legs: quads/hamstrings/glutes/adductors/
    calves/tibialis) + `full_body` (footnoted, never shades, not a valid
    secondary). Canonical structural source = `src/core/muscles.ts` (`MUSCLES`);
    the DB `muscles` dictionary table mirrors it (anti-drift pgTAP).
  - **Schema** (`20260604120000_fine_muscle_taxonomy`) — new `public.muscles`
    read-only reference table; `exercises.primary_muscle` (singular, coarse
    CHECK) **dropped** → `exercises.primary_muscles text[]` (multiple primaries);
    the old inline primary/secondary CHECKs replaced by the
    `validate_exercise_muscles` trigger (a CHECK can't reference another table);
    all 34 system rows re-tagged to fine codes.
  - **Heatmap** — `computeMuscleVolume` stays pure, emits volume per fine code
    (each primary 1.0, each secondary 0.5, warm-ups excluded, full_body
    footnoted); the render layer sums fine→slug via `codesForBodyRegion`
    (`src/core/muscles.ts`) — the skin no longer owns `slugToMuscle`. Ranked list
    at fine resolution. P1(a): fine data now, art renders on the current vendored
    MIT skin (core/back/legs gain detail; shoulders/chest/triceps co-shade until
    license-clean finer art — then only the skin region map changes).
  - **Tagging UI** — `ExerciseDialog` uses `MuscleTagField`: one grouped
    tri-state pill list (neutral → Primary → Secondary → remove) →
    `primary_muscles[]` + `secondary_muscles[]`. `ExercisePicker` filter
    optgroup'd by group, filters by fine code (PostgREST `primary_muscles.cs.{}`).
  - **i18n** — `exerciseDialog.primaryMuscle.<code>` → `exerciseDialog.muscle.<code>`
    (22 codes + full_body) + new `exerciseDialog.muscleGroup.<group>` (6 labels);
    hamstrings "Femorales" → "Isquiosurales".
  - **tests** — Tier-1 `muscles`/`muscleVolume`/`training` (multi-primary),
    Tier-2 `MuscleTagField`/`ExerciseDialog`, Tier-3 `05_muscles.test.sql`.
- **post-merge review (2026-06-04):** an expert anatomical pass over the 34
  re-tags confirmed them sound except 3, corrected in `20260604130000`: Deadlift
  → `hamstrings` promoted to primary; Kettlebell swing → +`forearms` secondary;
  Overhead press → +`trap` secondary.
- **out-of-scope → R-27 (Project B):** the bulk catalog content; group-level
  picker filter; group-name text search ("hombro" → all delts); lay-term aliases.

## R-27 — Bulk exercise catalog (Project B)
- **decision:** (D-id at plan time)
- **blocked-by:** R-26 (the fine taxonomy — done)
- **status:** design approved (2026-06-04), being specced in a **parallel
  session** — not built, not on `develop`. Plan/impl pending. The catalog spec
  lives on `claude/project-b-catalog-spec`; fill this entry in when it lands
  (coordinate to avoid clobbering it).
- **scope:** ingest a public-domain exercise dataset (free-exercise-db, ~873
  exercises) as idempotent seed migrations, each fine-tagged via the R-26
  taxonomy, with a tagging-accuracy verification step (anatomical source of
  truth, not by guess). Also rolled in from R-26: group-level picker filter,
  group-name text search, lay-term search aliases.

## R-28 — Rich home dashboard + diet-completion calendar + adaptive-TDEE surface (post-V1 item 4)
- **decision:** (none yet)
- **blocked-by:** —
- **status:** todo — `src/pages/HomePage.tsx` is an 18-line placeholder
  ("the unified Nutrición + Entreno dashboard is item 4"); no calendar / dashboard
  / adaptive-TDEE surface exists yet.
- **scope:** a real Diet dashboard — a green/amber/red diet-completion calendar
  from `daily_nutrition_history` × the active phase's targets (kcal-in-range **and**
  protein-met → green; one of the two → amber; neither → red; tap-to-see-why);
  surface the R-07 adaptive-TDEE expenditure estimate the app computes but never
  shows; fold in the shipped goal-date ETA. From the post-V1 brainstorm
  (`docs/superpowers/brainstorms/2026-05-21-post-v1-app-wide.md`, item 4 merged
  with direction-doc "item A"). Highest daily value of the post-V1 set.

## R-29 — In-app feature-discovery onboarding (post-V1 item 5)
- **decision:** (none yet)
- **blocked-by:** R-28 likely (shares the home/section surface)
- **status:** todo — only the profile-setup `OnboardingPage` exists; no
  feature-discovery layer (no welcome modal, tour, coachmarks, or empty-state CTAs).
- **scope:** contextual empty states (explanation + CTA) + one short welcome modal
  (esp. explaining the section split). Avoid an 8-screen wizard. Time to the
  friends-and-family invite, not before. (post-V1 brainstorm item 5.)

## R-30 — Responsive desktop density, per-feature (post-V1 item 6 / U-8)
- **decision:** (none yet)
- **blocked-by:** —
- **status:** partial — responsive `AppLayout` (md+ sidebar / bottom nav), the
  grouped desktop sidebar, and the sidebar sticky fix (#121) are done; the
  per-feature desktop **density modes** + the rich desktop home are not built.
- **scope:** at desktop width, components opt into showing more data inline
  (e.g. macro card also renders the day's TDEE breakdown) — not just wider
  breakpoints. Deferred to public-launch prep. (post-V1 brainstorm item 6; the
  U-8 visual pass.)

## Feature & UX family index

Cross-reference so the F-/U-/post-V1 families don't need re-deriving from specs.
Status as of 2026-06-04. (R-xx entries above carry the detail.)

| Item | What | R-id / PR | Status |
|---|---|---|---|
| Project A | Fine muscle taxonomy | R-26 / #155 | done |
| Project B | Bulk exercise catalog | R-27 | design approved, not built |
| F-1 | Whole-foods bilingual library | #113 | done |
| F-2 | Training routines + cyclic planner | R-22 / #122 | done |
| F-2b | Warm-up sets in routines | #128 | done |
| F-3 | Guided active-workout runner | R-23 / #132–135 | done |
| F-4 | Muscle activity heatmap | R-24 / #136,#139 | done |
| F-5 | Micronutrient storage | — | deferred (pairs with F-1) |
| U-1 | Sub-macros (sugar + saturated fat) | #95 | done |
| U-2 | Recipe meal-type tags | #96 | done |
| U-3 | Nutrition search filters + warning badges | #97 | done |
| U-4 | (dropped) | — | dropped |
| U-5 | Day totals vs target | #101 | done |
| U-6 | Copy a meal across days | #116 | done |
| U-7 | Nutrition fix batch | #98 | done |
| U-8 | Desktop visual pass / density | R-30 | partial |
| post-V1 item 3 | Nutrición/Entreno section split | #91 | done |
| post-V1 item 4 | Rich home + diet calendar + TDEE surface | R-28 | todo |
| post-V1 item 5 | In-app onboarding | R-29 | todo |
| post-V1 item 6 | Responsive desktop density | R-30 / U-8 | partial |
