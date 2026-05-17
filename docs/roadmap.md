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

## R-00 — Baseline current schema into migrations
- **decision:** D-A8, D-A6, D-E3, D-D6, D-F1
- **blocked-by:** —
- **status:** todo
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
- **status:** todo
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
- **status:** todo
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
- **status:** todo
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
- **status:** todo
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
- **status:** in-progress — helper + 3 sites + tests landed; DB CHECK migration
  staged, applied at Wave-3 prod checkpoint.
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
- **status:** todo
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
- **status:** todo
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
- **status:** todo
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
- **status:** todo
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
- **status:** todo
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
- **status:** todo
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
- **status:** in-progress — Tier-1 (Vitest + CI `pnpm test` in the `lint-build` job) landed; Tier-2 rides R-09; Tier-3 after R-00
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
- **status:** todo
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
- **status:** todo
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
