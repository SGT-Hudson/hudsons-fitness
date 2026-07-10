# Decisions

Immutable log of the 34-item conventions review (2026-05-17). Append-only.
IDs are permanent and never renumbered or reused. When a decision's
implementation is pending, it links its roadmap item: `roadmap: R-xx`.
The `R-xx` items are defined in `roadmap.md`.

**Going-forward logging rule:** add a new `D-xx` entry only for a real decision
with a tradeoff — a choice between alternatives, a reversal, or a load-bearing
constraint. Do not log "non-decisions" that merely restate the status quo with
no change. Existing entries are immutable history and stay as written.

## Contents

**A. Data model**
- D-A1 — Shared crowdsourced `ingredients` library — keep
- D-A2 — `recipe_ingredients ON DELETE RESTRICT` — folded into ★ Library model
- D-A3 — Soft recipe deletion — folded into ★ Library model
- D-A4 — Ingredient duplicates tolerated — tech-debt
- D-A5 — Past phases — 7-day grace-window + notes-editable-forever
- D-A6 — `bone_kg` removed entirely
- D-A7 — `initial_weight_kg` read-only after onboarding
- D-A8 — `types/database.ts` — switch to generated

**B. Math & formulas**
- D-B1 — Protein — lean-mass, phase-aware code-constant table; canonical-fn refactor
- D-B2 — Default protein 1.6 g/kg — REVERSED, superseded by D-B1
- D-B3 — Fat stored as fraction — confirm + centralize via shared helper
- D-B4 — TDEE window — replace with adaptive Kalman model
- D-B5 — BMR Mifflin — keep as derived/never-stored display; drop 4 dead tdee_estimates cols

**C. State & forms**
- D-C1 — State mgmt — confirm + decision boundary + Zustand escape hatch
- D-C2 — Forms — RHF + zod everywhere
- D-C3 — Form types — implicitly reversed by D-C2 (z.infer)
- D-C4 — Macros casing — snake_case DB end-to-end; camelCase for computed only
- D-C5 — RPCs — confirm + hard threshold + SECURITY INVOKER invariant

**D. UI**
- D-D1 — Badge — reverse; adopt shadcn Badge component
- D-D2 — Toasts fire from mutation-owning layer — confirm + tighten
- D-D3 — High-frequency mutations toast on error only — confirm + 3-axis rule
- D-D4 — Chart time-range pills — confirm as-is
- D-D5 — Composition chart — full redesign (fat/lean stack + trends + %↔kg toggle)
- D-D6 — Plan = default truth — confirm + single RPC + partial unique index + today-guard

**E. i18n & locale**
- D-E1 — i18n detection — wire profile.language authoritative
- D-E2 — Stored content never auto-translated — keep; rationale documented
- D-E3 — Metric-only / `profiles.units` — remove column
- D-E4 — Language toggle — remove header switcher; Settings-only when authed

**F. Operations**
- D-F1 — Lint/build gate + no test runner — add CI + tiered tests (spec-first)
- D-F2 — Auto-merge — repo public + real branch protection + auto-merge
- D-F3 — Edge Deno+TS+_shared — confirm + shared pure core + edge adapter
- D-F4 — Cron UTC/DST — confirm single-TZ + record pre-specced multi-TZ path
- D-F5 — Cron Vault auth — confirm + cron liveness alerting + ops runbook
- D-F6 — Theme localStorage/FOUC — confirm + document the D-E1 contrast
- D-F7 — Ship flow: develop integration branch + reviewed promotion
- D-F8 — F-2 Training Routines & Cyclic Planner: two-layer model, calendar-anchored scheduling, no materialization, one-active-program index, set_active_program as an RPC
- D-F9 — F-3 guided runner: client-only localStorage persistence (no DB resume / no cross-device), pure reducer state core, PWA wake-lock + in-app alarm, RPE whole-numbers-only, partial-on-leave
- D-F10 — F-4 muscle heatmap: secondary-mover weight 0.5, coarse-12 taxonomy, pluggable body-art skin (vendored MIT art; MuscleWiki rejected), inline on `/training` (no route), pure `core/muscleVolume.ts`
- D-F11 — Fine muscle taxonomy (Project A): 22-code model, multi-primary, dictionary table + trigger, data-fine-on-MIT-art
- D-F12 — R-33 token architecture: canvas `tokens.css` source of truth, two-layer design/shadcn-role tokens, section-scoped `--accent` via `.section-nutri`/`.section-gym`, nutri/gym section rename
- D-F13 — R-33 typography: self-hosted Rubik Variable + Geist Mono Variable (fontsource, no CDN), canvas type-scale utilities, PWA green `#13702f`
- D-F14 — R-33 muscle-heatmap ramp: gray→amber→red replaced by token-driven `color-mix` gym-blue ramp
- D-F15 — R-33 token extensions beyond canvas `tokens.css` (tone/excess/amber-ink/heat tokens), pending tone-core reconciliation
- D-F16 — R-33 wave 0 navigation IA: two section apps with a root-screen switch, `/more` hub, collapsible desktop sidebar
- D-F17 — R-33 tone core: canvas `nutritionTone.ts` replaces `macroStatus.ts`, canvas thresholds and tone vocabulary win
- D-F18 — R-33 fat essential floor: `0.6 g/kg` of bodyweight, derived at render, never stored

## D-A1 — Shared crowdsourced `ingredients` library — keep

**Ruling:** Keep `ingredients` as a shared crowdsourced library: anyone reads, anyone inserts (tagged with `created_by_user_id`), only the creator edits/deletes, and `created_by_user_id = null` is an immutable system seed. The original intent stands.

**Why:** The dedup cost (see D-A4) is accepted tech-debt and abuse risk is acceptable while the app is effectively solo-user. Crucially the model is reversible at the RLS layer with no schema change: `SELECT` could later be tightened to `created_by_user_id = auth.uid() OR created_by_user_id IS NULL` if the app ever goes public and regrets the open library. The escape hatch is recorded as a known future lever; the RLS policy shape (open SELECT/INSERT for authenticated, UPDATE/DELETE gated on creator, null = immutable seed) is the documented invariant.

**Status:** decided

## D-A2 — `recipe_ingredients ON DELETE RESTRICT` — folded into ★ Library model

**Ruling:** Folded into the unified ★ Library Contribution & Lifecycle Model (see `data-model.md#library-model` and R-01). Users never hard-delete ingredients at all — "delete" = hide = drop your reference row; a creator-hide transfers pool-item ownership to a reserved anon user id. `ON DELETE RESTRICT` is retained as the DB-level backstop for the Phase-2 auto-reaper. `CASCADE`/`SET NULL` remain rejected.

**Why:** A naive `CASCADE` would silently corrupt other users' recipe macros, and `SET NULL` would orphan recipe lines — both unacceptable for shared data. The original RESTRICT was the right guard, but the deeper reframe is that user hard-delete should not exist at all in a shared pool: the never-orphan-dependent-data invariant is better enforced structurally. RESTRICT stays as a DB backstop so the reaper's zero-references predicate remains true at the database even if the reaper logic has a bug. The old "reword IngredientInUseError copy" task is obsolete — that error path disappears once user hard-delete is removed.

**Status:** decided · roadmap: R-01

## D-A3 — Soft recipe deletion — folded into ★ Library model

**Ruling:** Folded into the unified ★ Library Contribution & Lifecycle Model (see `data-model.md#library-model` and R-01). Recipes become shared-pool entities; "delete" = hide = remove your reference; a creator-hide transfers ownership to the reserved anon id. The current `deleted_at` soft-delete plus partial unique index is an interim mechanism that the Phase-1 migration replaces with the pool/reference structure.

**Why:** Soft-delete via `deleted_at` worked but accumulates tombstones indefinitely and does not model the real intent (recipes are shared, not per-user-owned-and-trashed). Folding recipe and ingredient lifecycle into one pool+reference model makes "delete" mean "remove my reference," which is both honest and avoids tombstone growth; the residual accumulation concern is resolved by the model's Phase-2 auto-reaper.

**Status:** decided · roadmap: R-01

## D-A4 — Ingredient duplicates tolerated — tech-debt

**Ruling:** Tolerated as a known issue, not a confirmed convention. Document current state as "tolerated duplicates" with a future-work sketch; it is not on the current roadmap as a standalone item but is resolved by the ★ Library model's Phase-2 reaper (R-01).

**Why:** No dedup exists in the MVP and that is accepted while the app is solo-user — the cost of duplicates is low and the fix is non-trivial. `pg_trgm` is already enabled, so a future one-RPC fix can dedup by trigram similarity at insert time. More importantly, the ★ Library Contribution model's Phase-2 auto-reaper is the structural resolution: duplicate/bad pooled items get down-voted and reaped once the ratings/voting signal exists, so this never needs a dedicated dedup feature.

**Update (2026-06-03) — Phase-2 reaper deferred indefinitely.** Revisiting R-01 Phase 2 confirmed it solves a problem the app cannot have yet: reapable garbage requires a community (users creating, hiding, and not referencing pool items), and the user base is currently one. Building the voting/ratings signal the original 3-predicate reaper depends on is YAGNI today — a whole feature so a handful of people can vote on ingredients. Two reframes recorded for whenever it is genuinely revisited (app opens to real users and anon-owned zero-reference pool rows start accumulating): (a) the "negative community signal" predicate may be droppable entirely — an anon-owned item with **zero references of any kind** (no `user_*_refs`, no `recipe_ingredients`, no `meal_logs`/plan slots) is invisible and unused, so reaping it is safe without any vote; (b) duplicates are better prevented at insert time (trigram-similarity warning, `pg_trgm` already enabled) than reaped after the fact — the reaper never touches a *referenced* duplicate anyway. Until then, stray dupes/dead rows are a manual SQL fix (no prod users — DB is reshapeable).

**Status:** decided · roadmap: R-01 (Phase-2 reaper deferred indefinitely)

## D-A5 — Past phases — 7-day grace-window + notes-editable-forever

**Ruling:** Replace the binary freeze-at-`end_date` rule with a grace-window model: a phase stays fully editable (name, dates, macros) and deletable for 7 days after its `end_date`; after the grace ends the phase shape hard-freezes (edit/delete affordances hidden) and the card dims (`opacity-60`). The `notes` field stays editable forever, even on frozen phases. Remains UI-only — no DB backstop. The 7-day window is a named constant (e.g. `PHASE_EDIT_GRACE_DAYS = 7`).

**Why:** The original "frozen to protect history" framing is misleading. The finding established that past phases are computationally **inert**: no code reconstructs which phase was active on a past date — every computational consumer uses `useActivePhase()` (today's phase only); `MacrosChart` draws the target line from today's phase across the whole chart, not the phase active on each historical day. Editing a past phase's macros changes nothing downstream. So the freeze protects nothing integrity-critical; it is purely a UX stance ("history is closed"), not a data invariant. That justifies a softer, more forgiving model: a grace window for late corrections, and forever-editable notes since retrospective annotations affect no computation. Recording the inert-past-phases finding here prevents the integrity misconception from being reintroduced and prevents a needless DB backstop.

**Status:** decided · done (R-02)

## D-A6 — `bone_kg` removed entirely

**Ruling:** Remove `bone_kg` entirely from `profiles` (column, `estimateBoneKg`, onboarding/settings inputs, and the `isProfileOnboarded` gate). Re-introduce later only if a real composition-decomposition feature is actually built.

**Why:** What looked like a static "set once at onboarding" field is actually a mandatory, post-onboarding-editable, friction-adding field that feeds **zero computations**. The finding surfaced three drifts: (1) "set once" is false — it is editable in Settings; (2) it is a mandatory onboarding field that blocks app entry via `isProfileOnboarded()`; (3) it feeds nothing — Mifflin uses weight/height/age/sex, protein uses bf%-derived lean mass, the composition chart never references it; `estimateBoneKg` exists solely to pre-fill the input. The decisive analysis: because `bone_kg` is a single static regression estimate (set once, ~never re-edited), any downstream use would be a constant offset — it changes absolute labels but carries zero trend information, which is the only thing a progress tracker cares about. It must never feed protein/TDEE/targets (that would inject a noisy constant into the app's load-bearing numbers). Marginal flat-band presentational value is not worth a mandatory friction field. This also moots the bone half of D-B5 and simplifies the D-A8 generated-types switch.

**Status:** decided · done (R-03)

## D-A7 — `initial_weight_kg` read-only after onboarding

**Ruling:** Confirmed. `initial_weight_kg` stays read-only after onboarding as the historical anchor for charts; an amber warning callout above the onboarding weight input makes the permanence explicit.

**Why:** `initial_weight_kg` is the historical anchor that progress charts measure against — letting it change post-onboarding would silently rewrite the baseline of every chart and target. The convention was already correct; the only gap was that users were not warned the value is permanent before committing it. Shipped: an amber `role="alert"` warning above the weight input (matching the `LatestMeasurementCard` amber pattern), new i18n key `initialWeightWarning` (ES+EN), weight input pulled into its own full-width row so the warning sits between label and input.

**Status:** decided · done (commit 999e58f)

## D-A8 — `types/database.ts` — switch to generated

**Ruling:** Change from hand-written to generated Supabase types. Run `supabase gen types typescript --project-id upvraruehzurbetzrxov` (or a local schema-dump variant), commit the generated file, and document the regen command in operations docs.

**Why:** Hand-written types drift from the real schema and must be manually edited on every migration (at review time, the D-A6, D-B5, D-E3 column removals all required hand-edits to this file). Generated types make the schema the single source of truth and make those removals automatic. One caveat must be carried forward: CHECK-constraint enums (`kcal_mode`, `fiber_mode`) come through as plain `string` from the generator too, so future form work must still verify enum values against `pg_constraint` — the generator does not fix that.

**Status:** decided · done (R-04) — `src/types/database.ts` is now generator output (regen command in `operations.md`).

## D-B1 — Protein — lean-mass, phase-aware code-constant table; canonical-fn refactor

**Ruling:** Keep the lean-mass basis (`lean = weight × (1 − bf%/100)`) but re-anchor and make it phase-aware via a code-constant table of g/kg of **lean mass**: `cut 2.4 / maintenance 2.0 / bulk 1.8` (named `PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM`). Overrides are code-constant pre-fills into the existing `phases.protein_g_per_kg` column at phase-create time (no Settings card, no profile column) — this reverses D-B2. No-bf% fallback is `1.6 g/kg of total bodyweight` (named `PROTEIN_FALLBACK_G_PER_KG_BODYWEIGHT`), switched automatically and data-driven on presence of `body_fat_pct`. The rule moves into the canonical `computeDailyMacroTargets`, and the active basis must be visible in the UI.

**Why:** The formula structure was right but mis-housed and mis-anchored. The finding caught three smells: (1) a naming landmine — lean mass was passed into `computeDailyMacroTargets` via a parameter misleadingly named `weightKg`, so any future weight-dependent term would silently get lean mass; (2) the "canonical" fn was not canonical — the protein rule actually lived in the thin `computePhaseTargets` wrapper, contradicting the documented convention; (3) fallback asymmetry — no-bf% fell back to total weight, producing *higher* protein than a user who has bf% data (more data → less protein, inverted). Nutrition analysis: the lean-mass *structure* is the better science (Helms et al.: 2.3–3.1 g/kg FFM for deficit muscle retention), but the old `1.6` default is a *bodyweight* guideline applied to a lean basis, causing systematic under-targeting. The phase-aware lean table fixes the anchor; pre-filling the already-stored per-phase `protein_g_per_kg` *is* the snapshot, so no extra column is needed (this is why D-B2's column-based plan is reversed). The `1.6 g/kg bodyweight` fallback is chosen over assumed-bf% estimation because it is the most recognized literature number, keeps targets sane, and the mild under-target for a bf%-less cutter is a deliberate nudge to log body fat.

**Status:** decided · done (R-05)

## D-B2 — Default protein 1.6 g/kg — REVERSED, superseded by D-B1

**Ruling:** Reversed. The single 1.6 g/kg default is gone, replaced by D-B1's phase-aware code-constant table (`cut 2.4 / maintenance 2.0 / bulk 1.8` g/kg lean mass) plus the `1.6 g/kg bodyweight` no-bf% fallback. No `profiles.default_protein_g_per_kg` column, no `phases.protein_g_per_kg_snapshot` column, no Settings "Nutrition defaults" card — all prior B2 action items are dropped.

**Why:** The prior B2 plan was to make the single default user-tunable in Settings via a new profile column plus a per-phase snapshot column plus a Settings card. The D-B1 rethink made that obsolete: a single bodyweight-based default is the wrong anchor for a lean-mass formula, and per-phase tuning is already expressible through the existing `phases.protein_g_per_kg` column pre-filled from the phase-aware table. Adding profile/snapshot columns and a Settings card would have been net-new surface area duplicating what the existing per-phase column already does. B2 is therefore entirely subsumed by D-B1's action list.

**Status:** decided · reversed by D-B1

## D-B3 — Fat stored as fraction — confirm + centralize via shared helper

**Ruling:** Confirm: keep `phases.fat_pct_of_kcal` stored as a fraction (0.10–0.60), not a percent. Centralize the ×100/÷100 conversion into a shared `fractionToPct`/`pctToFraction` pair (or one documented constant) and refactor the three inline sites to use it. Verify the 0.10–0.60 bound at the DB level and add a CHECK constraint via migration if absent.

**Why:** Fraction storage is mathematically natural for `kcal × fraction`; an integer-percent migration is rescale risk for purely cosmetic gain, and "store grams" is rejected because fat-% is a phase policy input while grams are derived. The implementation was correct but the conversion was duplicated inline in three separate places (read in PhaseDialog, write in PhaseDialog, display in ObjetivosPage) with no shared helper — a drift hazard. Additionally no DB CHECK for the 0.10–0.60 bound was found; the bound may be UI-only via `register` min/max, so a DB constraint should back it.

**Status:** decided · done (R-06)

## D-B4 — TDEE window — replace with adaptive Kalman model

**Ruling:** Replace the 14-day-window two-endpoint energy-balance model (and its 14d/10d/±3d/7700 gating) with a fully adaptive expenditure estimator (MacroFactor / Hacker's-Diet–Kalman lineage): persistent per-user state (trend weight + running expenditure + variance), updated daily by reconciling predicted vs observed smoothed weight change; the residual self-corrects the estimate. Requires its own design spec before implementation.

**Why:** The convention was fully implemented and matched exactly, but the finding exposed two real execution defects and a fundamental fragility. Defects: (A) it uses single raw weigh-ins at each window edge instead of the existing `body_measurements_smoothed` 5-day average → roughly ±800 kcal/day noise over 14 days; (B) it always divides by the nominal 14 days though the two picked points can span ~5–20 actual days under the ±3-day tolerance → systematic rate bias. The deeper issue: a two-endpoint method discards all interior measurements and is inherently noise-fragile. An adaptive filter absorbs systematic over/under-estimation automatically, needs no fixed-window recompute, keeps 7700 kcal/kg only as an internal prior, and yields a natural confidence signal from filter variance. 14d/10d/7700/±3d are retired as the primary mechanism.

**Status:** decided · done (R-07)

## D-B5 — BMR Mifflin — keep as derived/never-stored display; drop 4 dead tdee_estimates cols

**Ruling:** Keep `mifflinStJeor` but give it real call sites as an "Estimated BMR" value recomputed on render from profile + latest weight, never stored (same pattern as `computeTargetWeightKg`). Drop the 4 dead columns from `tdee_estimates` via migration: `bmr_kcal`, `activity_kcal`, `neat_residual_kcal`, `workout_kcal_logged`. Any expenditure/BMR decomposition is owned by the D-B4 adaptive-TDEE spec, not pre-scaffolded here. The bone-estimation half is moot — see D-A6.

**Why:** `mifflinStJeor` was dead code (zero call sites) and the DB mirrored the dead scaffolding: 4 always-null `tdee_estimates` columns never written by `recalculate-tdee`. The whole BMR/breakdown layer (the architecture spec's energy-breakdown section, `activity_kcal = TDEE − BMR`, with a further workout/NEAT split gated on a non-existent Workouts module) is inert and built on the very two-endpoint total-TDEE model D-B4 already rules to replace.

But BMR differs from `bone_kg` (D-A6): BMR carries trend information (it moves with weight) and is deterministic from data already collected, so it has standalone display value. The fix is therefore hybrid: the formula stays and gets surfaced as a live derived value; the dead storage goes.

`bmr_kcal` is denormalization (recompute, don't store, since a historical series is reconstructable any time); `neat_residual_kcal`/`workout_kcal_logged` are pure speculation for a non-existent module (YAGNI, D-A6 precedent); `activity_kcal` (the decomposition) is handed to D-B4. The energy-breakdown chain was descaffolded for these reasons.

**Status:** decided · done (R-08)

## D-C1 — State mgmt — confirm + decision boundary + Zustand escape hatch

**Ruling:** Keep the architecture as-is and record an explicit decision boundary plus a pre-blessed escape hatch. Boundary: server state → TanStack Query (per-feature `hooks.ts`); cross-cutting app concerns → React Context, used sparingly (at review time: Auth + Theme); everything else → local `useState` / route params; no query-string (`useSearchParams`) UI state. Escape hatch: Zustand is the pre-blessed library for shared, frequently-updating client state, introduced per-slice only when a real need appears — never a wholesale migration. Redux/MobX/etc remain rejected.

**Why:** The architecture is followed faithfully and is the conventionally correct stack for a Supabase/PostgREST SPA, not an arbitrary imposition: the app is overwhelmingly server-state, and genuine global client state is just auth + theme (low-frequency, read-mostly, where Context's re-render weakness does not bite). Redux would be wrong (no complex client state machine; RTK Query would re-implement TanStack Query worse-integrated with Supabase). Zustand is the only defensible alternative and only reactively, per-slice, when a real shared/frequently-updating need appears (global command palette, cross-route wizard, optimistic-UI coordination). One drift to note for the doc rewrite: there are **two** sanctioned Contexts (Auth + Theme, theme added Sprint 14), so the inherited "React Context for auth" wording understates reality and must be corrected.

**Status:** decided

## D-C2 — Forms — RHF + zod everywhere

**Ruling:** Change. Standardize on react-hook-form + `zodResolver` across all forms, with schemas co-located per feature (e.g. `src/features/recipes/schema.ts`) to match the existing per-feature `api.ts`/`hooks.ts` pattern. Single sprint, single PR: install `@hookform/resolvers`, replace `type FormValues = { ... }` with `z.infer<typeof schema>`, switch each form to `useForm({ resolver: zodResolver(schema) })`, and convert plain `useState` forms by introducing `useForm`.

**Why:** The inherited convention deliberately ran RHF *without* `zodResolver` because `@hookform/resolvers` was never installed, despite `zod` already being a dependency. That leaves validation hand-rolled via `register` options and `validate` callbacks, inconsistent across ~6–8 forms, while `zod` sits as dead weight. Standardizing on RHF + zod gives one validation model, makes `zod` earn its place, and gives every form a single typed schema as the source of truth (which also resolves D-C3). ObjetivosPage + PhaseDialog already use RHF so they only need `zodResolver` added; the rest convert in one coordinated PR.

**Status:** decided · done (R-09)

## D-C3 — Form types — implicitly reversed by D-C2 (z.infer)

**Ruling:** Implicitly reversed by D-C2. With zod in use across all forms, form value types become `z.infer<typeof schema>` rather than a hand-written `type FormValues = { ... }`. No separate ruling or action is needed — it is covered by D-C2's migration.

**Why:** The inherited convention typed form values as a plain standalone type specifically *because* zod resolvers were not in use (D-C2's prior state). Once D-C2 makes zod the validation source of truth for every form, deriving the type from the schema via `z.infer<>` is the natural and non-duplicative consequence — maintaining a separate hand-written form type alongside a zod schema would risk the two drifting. There is no independent decision to make here; it falls out of D-C2.

**Status:** decided · implicit via D-C2

## D-C4 — Macros casing — snake_case DB end-to-end; camelCase for computed only

**Ruling:** Restate the convention. DB columns stay `snake_case` end to end (they flow from `types/database.ts` into component files as-is); the camelCase `Macros` envelope (`{ kcal, proteinG, carbsG, fatG, fiberG }`) is the lone exception because it is a computed/derived type, not a DB row. New phrasing: "snake_case for DB-sourced rows end-to-end; camelCase reserved for computed/derived types like `Macros`." No migration.

**Why:** The inherited wording ("Macros type is camelCase, NOT snake_case") overstated reality and was actively misleading — it implied a general camelCase preference when in fact ~192 snake_case columns flow untouched through 14+ component files. The real, narrower rule is that snake_case is the end-to-end default for anything DB-sourced, and camelCase is reserved specifically for computed types that never correspond to a DB row. Recording the corrected framing prevents a future contributor from "fixing" DB rows to camelCase or misunderstanding why `Macros` differs. This convention is also load-bearing for D-F3: the shared pure macro core is camelCase precisely because of this rule.

**Status:** decided

## D-C5 — RPCs — confirm + hard threshold + SECURITY INVOKER invariant

**Ruling:** Confirmed and tightened. Hard threshold: any operation that mutates >1 table atomically MUST be an RPC; single-table mutations stay client-side. Security invariant: all user-callable RPCs must be `SECURITY INVOKER` with `set search_path = public`; `SECURITY DEFINER` is forbidden without explicit security review and a non-`public` schema home, with the cron-only `apply_template_to_week_admin` as the one documented exception (Sprint 9). A pre-doc audit must grep `SECURITY DEFINER` across migrations to confirm only the admin RPC uses it.

**Update (2026-06-04):** there are now **two** sanctioned `SECURITY DEFINER` app-area exceptions, both reflected in CLAUDE.md invariant #3: `apply_template_to_week_admin` (cron-only) and `reconcile_account_delete` (account-delete reconciliation, added in R-01 #71 — revoked from public/anon/authenticated, granted only to `service_role`; edge/service-role only). Two further `SECURITY DEFINER` functions are baseline infra, not app-callable: the `handle_new_user` auth trigger and `private.invoke_edge_function` (cron auth, non-`public` schema). The Tier-3 `00_schema` pgTAP suite encodes the SECURITY-DEFINER-set + grant-isolation invariant, replacing the manual pre-doc grep.

**Why:** The original "prefer the 4 RPCs" guidance was correct in spirit but soft — "prefer" gives no objective test for when an RPC is mandatory, and it said nothing about the security posture of RPCs. Making it a hard >1-table-atomic threshold gives an unambiguous rule (and is exactly the boundary D-D6's materialization fix relies on), while the explicit `SECURITY INVOKER` + `set search_path = public` invariant closes a real privilege-escalation/search-path-hijack class and documents the single sanctioned `DEFINER` exception so future RPCs cannot quietly add more.

**Status:** decided

## D-D1 — Badge — reverse; adopt shadcn Badge component

**Ruling:** Reverse the convention. Install the official shadcn `Badge` component at `src/components/ui/badge.tsx` (CVA-based) with variants `primary` / `secondary` / `outline` / `warning`, and refactor the 4 inline-Tailwind badge sites (ObjetivosPage, PlantillasPage, PlanificadorPage, MealLogEntry) to use it.

**Why:** The inherited rule banned the shadcn Badge component and mandated inline Tailwind spans, but that has produced 4 copy-pasted badge implementations (including a local `badgeCls` helper) with no shared variant vocabulary — exactly the inconsistency a component prevents. The shadcn Badge is ~50 lines, CVA-based, and matches the existing shadcn-primitive pattern in `components/ui/`; adopting it removes the duplication and gives a single typed variant set (including the amber `warning` variant the app already uses ad hoc). HANDOFF.md's "Missing: badge" line and the inherited CLAUDE.md convention must be updated to reflect the new state.

**Status:** decided · done (R-10)

## D-D2 — Toasts fire from mutation-owning layer — confirm + tighten

**Ruling:** Confirmed and tightened. Toasts fire from the layer that owns the mutation (usually a `hooks.ts` file). When a component owns its own mutation flow without a separate hook — e.g. destructive confirm dialogs like `DeleteAccountDialog.tsx` — the component calls toast directly. Pages never call toast. No code action; only the wording is rewritten.

**Why:** The original "fire from hooks, not pages" rule was correct and followed, but too absolute — it did not account for the legitimate case where a component (not a page) owns a self-contained destructive mutation flow with no separate hook, where calling toast from the component is correct. The tightened phrasing preserves the real intent (pages never toast; the mutation owner toasts) while documenting that the owner can be a component when there is no hook. Implementation details worth preserving so they are not lost: `TOAST_LIMIT = 3`, success default 4000ms, destructive default 7000ms, the 5 helpers (`toastSaved/Deleted/Created/Applied/Error`), and the opt-in `durationMs` override.

**Status:** decided

## D-D3 — High-frequency mutations toast on error only — confirm + 3-axis rule

**Ruling:** Confirmed and expanded into a 3-axis rule. Mutation hooks fire success toasts only when (a) the user triggered the action AND (b) the action is low-frequency. High-frequency user actions (planner slot add/update, future inline edits) toast on error only. Background/implicit mutations (auto-fired by mount, dependency changes, idempotent retries — e.g. `useMaterializePlan` on `/diario`) toast on error only. No code action; behavior is already correct.

**Why:** The inherited rule only named the specific "planner slot" case, which does not generalize — it gave no principle for the next high-frequency or background mutation. Restating it along three axes (user-triggered vs background, high- vs low-frequency, success vs error) yields a principled rule that covers planner slots, future inline edits, and implicit mount/dependency-driven mutations uniformly. The documented soft exception is important to preserve: `useDeleteWeekSlot` toasts on success even though it is a slot-level mutation, justified because deletion makes UI elements disappear and silent feedback could be mistaken for a render bug.

**Status:** decided

## D-D4 — Chart time-range pills — confirm as-is

**Ruling:** Confirmed exactly as-is. Chart time-range pills default to 90d with options 30d/90d/1y/all; per-chart independent state (each chart owns its own `useState<TimeRange>('90d')`), no cross-chart syncing, no persistence across refreshes. Document the shared component path (`features/measurements/components/TimeRangePills.tsx`) and the shared window helper (`fromDateForRange`).

**Why:** The convention is implemented exactly as worded and the design choice is deliberate and defensible: per-chart independent (non-synced, non-persisted) range state lets the user compare different time scales side by side on `/progreso`, which is precisely what a progress view needs. Syncing or persisting the range would remove that comparison ability for no real gain. This is also consistent with the D-C1 no-query-string-state rule, and is the same per-chart-local-state pattern D-D5's %↔kg toggle follows. Doc-only — no change needed.

**Status:** decided

## D-D5 — Composition chart — full redesign (fat/lean stack + trends + %↔kg toggle)

**Ruling:** Full redesign (user-designed, endorsed). The composition stack becomes `fat%` + `lean%` only (`lean% ≡ 100 − bodyFat%`, a true disjoint 100% partition, fat at bottom, hard `domain={[0,100]}` now correct). Muscle% and water% are rendered as independent non-stacked trend charts (plus a fat% trend), not stacked peers. Add a `%`↔`kg` toggle computed frontend from the stored `weight_kg` (zero schema work) as local `useState`. Keep per-series linear interpolation (`interpolateSeries`) as-is.

**Why:** All three inherited sub-rules (Y-axis capped at 100%, body fat at bottom, linear interpolation) were implemented exactly as worded — but the convention itself is semantically wrong. Body water is distributed *within* lean tissue, so `bodyFat%`, `muscle%`, `water%` are **not disjoint partitions** of body mass — they overlap. Stacking them implies a parts-of-a-whole relationship that does not exist; the sum routinely exceeds 100% (e.g. 20+40+55=115), which the hard `domain={[0,100]}` then clips into a visibly misleading chart.

The "body fat at bottom" sub-rule only existed *because* of that incorrect stacking. fat%/lean% is a true partition that sums to exactly 100%, making the hard cap correct and meaningful; muscle/water belong as independent trend series because that is what a progress tracker actually needs ("is my body-fat % falling?").

The kg toggle is the more honest view for the key cut question ("am I retaining muscle *mass* while losing fat?" — muscle% can rise merely because fat fell) and costs zero schema/data work. The kg decomposition is presentational only and must not feed protein/TDEE — same guardrail as D-A6's bone analysis. Recording why the old fat+muscle+water stack was a category error (non-disjoint ratios) prevents its reintroduction.

**Status:** decided · done (R-11)

## D-D6 — Plan = default truth — confirm + single RPC + partial unique index + today-guard

**Ruling:** Confirm the model (plan = default truth; active-week slots → `from_plan` `meal_logs`; dedup by `plan_week_slot_id`; `from_plan` is an editable origin marker; manual adds stay `from_plan=false`; plan edits after materialization do not propagate back). Fix the implementation per the D-C5 RPC invariant: one `materialize_plan_for_date` RPC (`SECURITY INVOKER` + `set search_path = public`) called by both client and edge; a partial unique index `unique (user_id, plan_week_slot_id) where plan_week_slot_id is not null` with `INSERT … ON CONFLICT DO NOTHING`; and a `date <= today` guard inside the RPC.

**Why:** The model works, but the finding exposed three real defects. (1) `materializePlanForDate` is hand-mirrored across two runtimes — client TS in `features/diario/api.ts` and re-typed Deno in `daily-nutrition-snapshot/index.ts` (the file literally comments "Server-side mirror of…") — a drift hazard and exactly the single-source-of-truth case the D-C5 RPC invariant targets. (2) No DB-level idempotency: `meal_logs` has no unique constraint on `(user_id, plan_week_slot_id)`; dedup is app-level read-then-write, so a concurrent client effect + cron (or two tabs / fast double-mount) can both read "missing" and double-insert. (3) The client materializes future dates: the architecture spec's Diario-materialization rule says "today or any past date" but `materializePlanForDate` has no `date <= today` bound and `DiarioPage` fires for whatever date is in the URL, so `/diario/<future-date>` inserts future plan slots as already-consumed logs, contradicting "the diary is the truth of what I ate" (the cron is safe; the client is the leak). One INVOKER RPC + a partial unique index + an in-RPC date guard fixes all three at once and enacts the D-C5 invariant; the `date <= today` guard must use the same Madrid-TZ "today" as `previousDayInTZ()` (see D-F4).

**Status:** decided · done (R-12)

## D-E1 — i18n detection — wire profile.language authoritative

**Ruling:** Make the documented detection order true: `profile.language` becomes the genuine top-priority source for authenticated users, with `localStorage → navigator → es` as the pre-auth / fallback chain. Add a profile→i18n sync (when the profile loads/changes and `profile.language` is set and `!== i18n.language`, call `i18n.changeLanguage`, placed in `AuthProvider` or a top-level component, guarded against loops by the `!==` check). Keep `caches: ['localStorage']`.

**Why:** This was doc-drift plus a latent cross-device bug. `i18n/index.ts` sets `detection.order = ['localStorage', 'navigator']` with `fallbackLng: 'es'`, so the real precedence is `localStorage → navigator → es` and **`profile.language` is never consulted at boot**. Only Settings persists language to the profile; no app-load/login effect reads it back. Consequence: on a fresh browser or new device (empty localStorage) the user's saved `profile.language` is silently ignored, falling through to navigator → es. For an ES/EN-parity app that is a real UX failure, not just a wording slip. Recording the prior drift here prevents it being reintroduced. Note: D-E4 removes the `LanguageSwitcher` from the authenticated app, so the previously-considered "persist from the switcher when authed" action is dropped — the profile→i18n sync plus Settings (the only authed write path) fully reconcile the pre-auth choice.

**Status:** decided · done (R-13)

## D-E2 — Stored content never auto-translated — keep; rationale documented

**Ruling:** Keep — stored content (recipe/ingredient/template names) stays as authored and is never auto-translated. The full machine-translation pipeline is rejected. An opt-in *human* bilingual-name feature (per-language, human-authored, no MT) is recorded only as a possible future option that would need its own sprint and reconciliation with the ★ Library model.

**Why:** The convention is faithfully followed (stored names render raw, never through `i18n.t()`). Feasibility was genuinely assessed: the API plumbing is trivial (~half a day, reusing the Vault-secret pattern), so the API call was never the blocker. The blockers are structural: translate-at-render is non-viable (N calls per list, rate limits, breaks offline/PWA), so it requires translate-and-store + backfill + re-translation + edit-invalidation; that collides head-on with the ★ Library Contribution model — MT'ing *other users'* shared-pool names and making the MT canonical for everyone propagates garbage and raises "which language is canonical in the shared pool?"; it doubles `pg_trgm` search columns/indexes; and MT quality on food/brand terms is genuinely poor ("lomo", "merluza a la gallega", "tortilla" ES≠EN). Recording *why* it was rejected (and that the API was never the blocker) keeps the question from being naively reopened and preserves the only architecture-consistent path (opt-in human bilingual names) if bilingual content is ever pursued.

**Status:** decided

## D-E3 — Metric-only / `profiles.units` — remove column

**Ruling:** Remove `profiles.units` entirely (DB migration + types). Metric-only (kg/cm/g) is the confirmed invariant, DB stores metric canonically. A profile-backed imperial/metric *display* toggle was deliberately shelved — revisit only if a real need (e.g. US users) appears; the column is not kept as a speculative hook.

**Why:** `profiles.units` is fully dead — `text not null default 'metric'`, never written by any form (always the default), never read, with no imperial code path anywhere (every display hardcodes kg/g/cm). This is a cleaner-cut removal than D-A6's `bone_kg`: not even a mandatory field, zero UI, zero computations — pure abandoned-design residue. Keeping a dead column as a speculative future hook is exactly the YAGNI pattern D-A6/D-B5 also rejected this session. The shelved imperial-toggle design is preserved in the roadmap/decision record (profile-backed like language, `useUnits()` hook, client-side conversion *only at display/input boundaries via shared helpers*, DB always metric, ft/in input UX, round-trip stability — mirroring the B3 fraction and D-D5 frontend-kg "convert only at the edge" rule) so a future revisit starts from the analysis, not zero.

**Status:** decided · done (R-14)

## D-E4 — Language toggle — remove header switcher; Settings-only when authed

**Ruling:** Make reality match the convention: remove `LanguageSwitcher` from `AppLayout`. Authenticated users change language only in Settings (which persists to `profile.language` per D-E1). The switcher stays on the pre-auth pages (Login / Signup / Onboarding) because they precede Settings access and have no profile row yet.

**Why:** The convention is drifted/false as written. `LanguageSwitcher` is rendered in the persistent `AppLayout` header on *every authenticated page*, directly contradicting "no header switcher in main app." This also compounds the D-E1 bug: the header switcher calls `i18n.changeLanguage` but does **not** persist to `profile.language` (only Settings does), creating two inconsistent authed paths — the app-wide header (non-persisting, loses the preference on a fresh device) and Settings (persisting). Removing the header switcher restores the documented intent, removes header clutter and the dual-path inconsistency, and is consistent with this session's single-source-of-truth pattern (D-D6, D-E3). The pre-auth switcher is correct localStorage-only behavior (no profile row exists yet; the post-onboarding write + D-E1's sync reconcile it). Recording the drift prevents the header switcher being reintroduced.

**Status:** decided · done (R-15)

## D-F1 — Lint/build gate + no test runner — add CI + tiered tests (spec-first)

**Ruling:** Add real CI plus tiered, spec-first test coverage. Make the lint+build-before-merge gate real and CI-enforced (blocking auto-merge). Tier 1 (now): Vitest over the pure-logic core (`lib/macros.ts`, recipe macros, phase targets, `interpolateSeries`, B3 fraction helpers, edge `_shared/macros.ts`, `lib/dates.ts`) plus a GitHub Actions workflow gating PRs. Tier 2: thin component layer, rides with the D-C2 RHF+zod sprint. Tier 3: DB/RLS/RPC tests via local `supabase start` + pgTAP, gated behind a schema-baseline-into-migrations prerequisite. E2E (Playwright) explicitly out of scope. Write a short test-strategy spec first.

**Why:** Scripts were confirmed but the bigger finding is that, at the time of the review, **there was no CI at all** — the review found no `.github/` directory. "MUST pass before push" and the "auto-merge after CI" claim described a gate that did not exist; it was enforced only by manual discipline (Vercel ran `build` post-push but `lint` was gated by nothing and nothing blocked the merge). This was acute at review time because the review queued logic-heavy sprints (B1 protein, B4 Kalman TDEE, B3 helpers, D5 chart math, D6 idempotent RPC) whose correctness is exactly what cheap unit tests guard. A Tier-3 blocker was also discovered: at the time of the review, `supabase/migrations/` held only one file (schema was built via dashboard/MCP), so there was no reproducible migration history to stand up a local DB for RLS/RPC tests — that schema-baseline task is a shared prerequisite (also unblocks D-A8 generated types and the D-A6/D-E3/D-D6 migrations). The tiering keeps Tier 1 cheap and immediate, defers expensive Tier 3 honestly behind its blocker, and excludes E2E as low-ROI for a solo MVP.

**Status:** decided · done (R-16)

## D-F2 — Auto-merge — repo public + real branch protection + auto-merge

**Ruling:** Make the GitHub repo public to unlock branch protection + required-status-check + GitHub-native auto-merge, making the original convention literally true. Hard prerequisite gate: a clean secrets-history audit before flipping visibility. Ordered chain: secrets-history scan → license decision → F1 CI workflow exists → flip to public → configure branch protection on `main` → reconcile the commit gap → confirm/document the Vercel production branch.

**Why:** At review time this was the most drifted convention — the review found it was fiction on three counts: (1) no CI existed (per D-F1); (2) GitHub-native auto-merge was *impossible* on this repo's plan — branch protection returned 403 "Upgrade to GitHub Pro or make this repository public", so a private repo on the free plan could not configure required-status-check auto-merge; (3) it was empirically not happening — at review time main was ~22 commits behind dev, main's tip was around Sprint 9/10, and Sprints 11–17 had never reached main (manual squash-merges only).

Going public was the cheapest path to make the convention literally true and automated. The timeless rationale: a public repo unlocks branch protection + required-status-check + GitHub-native auto-merge at no cost, but it makes RLS the *sole* security boundary, which elevates D-F1 Tier-3 RLS/RPC tests and D-A1/D-A2/D-A3 shared-library policy verification to near-term/blocking. The secrets-history scan is non-negotiable and irreversible if skipped: the publishable/anon key and project ref are public-tier and acceptable, but any service-role key or Vault secret ever committed must be rotated and scrubbed before going public.

Executed 2026-05-17: repo made public, CI workflow added, branch protection requiring `lint-build` configured, GitHub auto-merge enabled, main reconciled (via a reconciliation PR), production redeployed.

**Status:** decided · done (2026-05-17) · **superseded by D-F7** — single-branch auto-merge-to-`main` replaced by the two-tier `develop`→`main` flow

## D-F3 — Edge Deno+TS+_shared — confirm + shared pure core + edge adapter

**Ruling:** Confirm Deno+TS+`_shared/` (clarify in docs: `_shared/` is edge↔edge only; the client↔edge shared-logic boundary is the DB/RPC per D-C5 + D-D6). Structurally dedupe the macro + date/TZ math via a shared pure core + edge adapter, **no codegen**: extract one dependency-free camelCase core imported directly by both Vite and Deno; the edge keeps a thin snake_case adapter only at the `daily_nutrition_history` write boundary. Add a Deno dependency-pin policy (import map / `deno.json`).

**Why:** Structure is confirmed and followed, but two findings sit beneath it. (1) `_shared/` is edge↔edge only and cannot bridge client↔edge (Vite browser bundle vs Deno cannot import the same aliased module), so the app's core macro math is duplicated — `_shared/macros.ts` (snake_case) vs client `features/recipes/macros.ts` (camelCase), plus date/TZ helpers vs `src/lib/dates.ts`; the file's own header says "Server-side mirror of…". (2) Dependency pinning is scattered — each function inlines its own `esm.sh` Supabase URL with no import map. The key technical truth: `_shared/macros.ts` is *already* pure and dependency-free (only `Intl`), so importable by Vite too — the only real blocker to one module is casing (edge snake_case vs client camelCase), which D-C4 deliberately ruled. So no transpile/codegen is needed; a literal codegen build step is the fragile form. The shared-pure-core + thin edge adapter keeps D-C4 intact (core camelCase; snake_case confined to the one DB-write mapping) and uses D-F1 golden vectors as the parity regression net.

**Status:** decided · done (R-17)

## D-F4 — Cron UTC/DST — confirm single-TZ + record pre-specced multi-TZ path

**Ruling:** Confirm the current single-TZ design (no code change — robust as-is). Do not build multi-TZ now (speculative until a real non-Madrid user exists). Record the multi-TZ implementation path concretely so the escape hatch is pre-analyzed: add `profiles.timezone` (IANA, default `Europe/Madrid`, auto-defaulted at signup), change the 3 crons from daily to hourly each processing only users whose local boundary just passed, pass per-user `profile.timezone` into the already-`tz`-parameterized date helpers, relying on existing idempotent upserts. Trigger: first real non-Madrid user (or as part of F2 go-public hardening).

**Why:** The convention is faithfully followed and the design is actually *more robust than the convention claims*: 3 UTC jobs with an explicit UTC→Madrid mapping comment, and edge functions compute date boundaries internally in-TZ (`previousDayInTZ('Europe/Madrid')`, `mondayOfTodayInTZ('Europe/Madrid')`), so the 1h DST drift shifts only *when* a job fires, never *what data* it targets. No job fires near a Madrid-midnight boundary (01/02/03 UTC = 02–05 CET/CEST) so there is no off-by-one, and the snapshot→tdee ordering (2h UTC-fixed gap) is preserved across DST. The drift is genuinely cosmetic, not merely "off-peak tolerable." The only latent issue is the hardcoded single-TZ assumption (correct for the solo Spain user). Per the D-A6/D-E2/D-E3 "pre-spec the escape hatch, don't build hypotheticals" pattern, the multi-TZ path is recorded concretely (de-risked: data is date-keyed, helpers are already TZ-ready) so a future revisit starts from analysis, not zero. The D-D6 `date <= today` guard must use the same Madrid-TZ "today" as `previousDayInTZ()` (both Madrid until multi-TZ, both per-user after).

**Status:** decided

## D-F5 — Cron Vault auth — confirm + cron liveness alerting + ops runbook

**Ruling:** Confirm the auth pattern (recommended Supabase approach, no code change to the mechanism) and add lightweight cron liveness alerting: a daily check that the freshest `daily_nutrition_history` (and `tdee_estimates`) row is within expected recency, alerting if stale. Add operational docs for one-time setup, the rotation procedure, the "how to tell crons are dead" manual check, and the scaling model.

**Why:** The pattern is correct and soundly implemented (`private.invoke_edge_function` is `SECURITY DEFINER`, `set search_path = ''`, revoked from public/anon/authenticated, reads `cron_service_role_key` by name from `vault.decrypted_secrets`; migration references the secret by name not value → repo clean by design; fails loud if missing). The gaps are operational: (1) silent under-running — if the secret is absent/stale (project restore, re-branch, key rotation) every cron raises with no alerting, and these crons also keep the free project from auto-pausing (double impact); pg_cron also skips (does not overlap) a job's next occurrence if a run overruns — another silent under-run the liveness alert catches. (2) No rotation runbook. (3) `cron_service_role_key` is the full service-role key (bypasses all RLS) — standard for Supabase but D-F2 (go-public) elevates blast-radius stakes. The scaling question is a non-issue by design (3 fixed job rows regardless of user count; per-user fan-out is inside the edge fn loop, not pg_cron rows); the real future ceiling is a single invocation processing all profiles exceeding the edge execution-time limit (deferrable via batch/queue/shard). The D-F2 secrets-history scan must explicitly verify the `cron_service_role_key` *value* never appeared in any commit (expected clean — name only).

**Status:** decided · done (R-18)

## D-F6 — Theme localStorage/FOUC — confirm + document the D-E1 contrast

**Ruling:** Confirm as-is (no code change — implementation is exemplary). Theme is intentionally localStorage-only (key `hf-theme`), not profile-backed. Document the deliberate D-E1↔D-F6 contrast (language *is* profile-authoritative cross-device; theme deliberately is *not*) as an explained, reasoned asymmetry, and document the `index.html` pre-paint IIFE ↔ `ThemeProvider` `STORAGE_KEY` coupling as a latent footgun.

**Why:** This is the cleanest item in the review — textbook implementation, zero drift: `ThemeProvider` persists only to localStorage (never profiles), resolves `system` via `matchMedia` with a live listener and SSR-safe guards, and `index.html` has a correct pre-paint IIFE reading the *exact same* key. The localStorage-only design is precisely what *enables* the synchronous pre-paint FOUC-prevention script — no async profile fetch is possible before first paint, so a profile-backed theme could only be additive (a login sync-down), not a replacement. The D-E1↔D-F6 asymmetry is intentional and defensible and must be documented as a reasoned contrast, not left looking like inconsistency: `system` is a correct default and a new device adopting its OS light/dark preference is *desirable*, whereas silently losing a *language* preference in a bilingual app (D-E1) is a real UX failure. The key-string coupling between the IIFE and `STORAGE_KEY` is recorded as a footgun (renaming one silently breaks FOUC prevention). Additive profile-theme-sync is noted only as a future option, not adopted.

**Status:** decided

## D-F7 — Ship flow: develop integration branch + reviewed promotion

**Ruling:** Replace direct auto-merge-to-`main` with a two-tier flow. Feature `claude/*` PRs auto-merge (squash) into a long-lived `develop` branch (integration + staging via its Vercel preview). `main` stays the Vercel production branch and advances only via a user-approved `release/YYYY-MM-DD`→`main` PR (merge commit, not squash, so `main` stays a convergent subset of `develop`; such PRs are not auto-armed). Hotfixes go `claude/hotfix-*`→`main` then auto back-merge to `develop`. GitHub default branch becomes `develop`; `auto-merge.yml` triggers on base `develop`; `ci.yml` runs on both. Promotion is on-demand, not scheduled.

**Why:** Under D-F2 `main` was simultaneously the integration target and the Vercel production branch with no required human review, so any green PR auto-deployed to production — the only brake an opt-out label. Decoupling integration from release adds exactly one deliberate gate at the point production risk lives, while preserving the hands-off autonomy for day-to-day feature work (auto-merge simply retargets to `develop`) and yielding a free staging soak surface (the `develop` Vercel preview). Promotion uses an ephemeral `release/*` branch as the PR head because `delete_branch_on_merge=true` would otherwise delete `develop` (it is never a PR head). Supersedes the D-F2 single-branch convention.

**Status:** decided · done (2026-05-19)

## D-F8 — F-2 Training Routines & Cyclic Planner: two-layer model, calendar-anchored scheduling, no materialization, one-active-program index, set_active_program as an RPC

**Ruling:** Five binding decisions govern the F-2 (routines + cyclic planner) design, recorded here for permanence. Refer to the spec (`docs/superpowers/specs/2026-05-24-training-routines-planner-design.md`) for the full rationale.

**(a) Two-layer model.** Separate `routines` (reusable, named, user-owned exercise templates with target sets/reps/RPE/rest) from `programs` (a cycle that references routines in a day-ordered sequence). A routine may appear in many programs; a program day carries a nullable `routine_id` (rest day when null). The two-layer split matches how practitioners organise training: a "Push A" routine is a stable reusable unit; an "Upper/Lower 4-day cycle" is the cycle that references it.

**(b) Calendar-anchored scheduling with restart-from-today re-anchor.** A program cycle is positioned in time by a single `anchor_date` (the calendar date corresponding to `day_index = 0`). Today's slot = `(today − anchor_date) mod cycle_length`. Re-anchoring ("start from today") updates `anchor_date` so that today maps to `day_index = 0`. The alternative — an advancing/queue model that tracks the last-completed day — was rejected: it requires a persistent cursor that drifts on training gaps and needs reconciliation logic on rest days. The anchor-date model is near-stateless (one date field) and the re-anchor button recovers most flexibility: if the user skips days, they re-anchor and the cycle continues cleanly.

**(c) No materialization — today's slot computed on the fly.** The active program's day sequence is never written to a secondary table or cache. The function `getTodaySlot(program, today)` in `src/core/programs.ts` computes the slot purely from `anchor_date` and the `program_days` array. This matches the no-materialization stance of the rest of the app (D-D6 keeps `materialize_plan_for_date` as a DB-level upsert for meal logs, but the training planner has no equivalent need — the computed slot is just a pointer to a routine, not a row to create).

**(d) One active program per user via partial unique index.** `programs_one_active_uidx` is a partial unique index on `(user_id) WHERE is_active`. At most one program can have `is_active = true` per user at the DB level — no application-layer guard is needed. This is cheaper and more reliable than a `profiles.active_program_id` FK column (which would duplicate state and require a two-table update).

**(e) `set_active_program` is kept as an RPC despite mutating a single table.** The D-C5 invariant requires an RPC only for >1-table atomic mutations; technically a client-side `UPDATE programs SET is_active = false WHERE user_id = … AND is_active; UPDATE programs SET is_active = true … ` would work. It is an RPC anyway because the two `UPDATE`s must be atomic with respect to the partial unique index: between the two client-side statements the index would transiently see two active rows, causing a constraint violation. A single RPC deactivates all others then activates the target in one transaction, making the flip always safe.

**Status:** decided · done (R-22)

## D-F9 — F-3 guided active-workout runner: client-only persistence, pure reducer, PWA wake-lock, integer RPE, partial-on-leave

**Ruling:** Five binding decisions govern the F-3 guided runner. Full rationale in the spec (`docs/superpowers/specs/2026-05-25-training-guided-runner-design.md`, decisions 0.1–0.25).

**(a) Client-only persistence — no DB writes mid-workout, no cross-device resume.** The live workout is a reducer state mirrored to `localStorage` (`hf:runner:draft:v1`) on every change; on reopen a resume prompt restores it. Nothing is written to the DB until the single atomic `save_workout` at finish. The alternative — DB-backed in-progress sessions (a `status` column + per-set inserts + resume/cleanup) — was rejected: it buys cross-device mid-workout resume, which does not match how anyone trains, at the cost of a session-lifecycle state machine. localStorage covers the real failure mode (phone locks / OS evicts the tab / refresh). Cross-device resume is explicitly **not wanted**, now or later.

**(b) Pure reducer state core, no schema/RPC change.** All runner logic is a clock-free, I/O-free reducer in `src/core/runner.ts` (`buildRunnerState` / `runnerReducer` / selectors / `computeTimerView`); React hooks bridge to the browser. The runner reuses the existing F-2 `save_workout` RPC unchanged (it already accepts `rpe`, `is_warmup`, `p_program_id`, `p_routine_id`), so F-3 added **no migration**. Keeps the boundary the rest of the app holds (pure core ← thin hooks/UI).

**(c) PWA Screen Wake Lock + in-app alarm; native background notifications deferred.** While the runner is active a Screen Wake Lock keeps the screen on so the JS timer keeps running and the rest-over sound/vibration fire. A PWA cannot reliably fire a scheduled alert while the screen is manually locked (no dependable web primitive — Push needs a server, Notification Triggers is abandoned); that is accepted. True background timer notifications would require a native (Capacitor) wrapper — logged as deferred, not built.

**(d) RPE is whole-numbers-only at the app layer.** The runner picker, the target display, and the routine-builder field all use integers 6–10, and `routineExerciseSchema.target_rpe` is `z.number().int()`. The DB CHECK still permits 0.5 steps (integers are a subset), so no migration was needed; the half-step granularity was dropped as needless precision for a perceived-exertion scale.

**(e) Leaving an in-progress exercise demotes it (partial / pending), never stranded.** `activate()` demotes the exercise being left: `partial` if a working set was logged (kept in the save payload, resumable at its first unrecorded set) or back to `pending` if nothing was logged — both remain jump-back-able in the overview. This fixed a bug where the left exercise stayed `active` (limbo: shown as "jump" but un-clickable). "Skip current" likewise targets the exercise about to be performed (`focusIndex`), never a finished one; "End exercise" finishes early keeping recorded sets (so users never fake a 0/0 set to stop).

**Status:** decided · done (R-23)

## D-F10 — F-4 muscle activity heatmap: secondary-mover weight, coarse-12 taxonomy, pluggable body-art skin, inline placement, pure volume core

**Ruling:** Five binding decisions govern the F-4 muscle-activity heatmap. Full rationale in the spec (`docs/superpowers/specs/2026-05-26-muscle-heatmap-design.md`).

> ⚠ **(b) and (c) superseded by [D-F11] (2026-06-04, Project A / #155 / R-26).** The coarse-12 taxonomy + singular `exercises.primary_muscle` of (b), and the skin-owned `slugToMuscle` map of (c), were replaced by the fine 22-code `muscles` dictionary, `exercises.primary_muscles[]`, the `validate_exercise_muscles` trigger, and a core-owned `codesForBodyRegion`. (a)/(d)/(e) still hold — except (a) now credits **each** primary mover 1.0 (multiple primaries allowed). The (b)/(c) text below is kept as the F-4-era record.

**(a) Secondary movers count 0.5 of a set; warm-ups excluded; `full_body` footnoted, not shaded.** Per working set the primary mover earns 1.0 and each secondary mover earns a flat `SECONDARY_SET_WEIGHT = 0.5` toward that muscle's volume. The weight is a single global constant, not per-exercise — finer per-exercise contribution factors are needless precision for a coarse activity map. Warm-up sets are excluded entirely (they are load-ramp, not training volume). `full_body` sets (e.g. kettlebell swing) are counted into a separate footnote count rather than shading every region, because spreading them across all muscles would wash out the map.

**(b) Coarse-12 muscle taxonomy, extensible.** Volume aggregates into 11 specific muscle codes (`chest`, `back`, `shoulders`, `quads`, `hamstrings`, `glutes`, `calves`, `biceps`, `triceps`, `core`, `forearms`) plus `full_body` — the same set already used by `exercises.primary_muscle`. `secondary_muscles` is constrained to the 11 specific codes only (`full_body` is not a meaningful *secondary* mover). The taxonomy is deliberately coarse for an at-a-glance heatmap; it can be subdivided later without a model change (the skin's slug→code map already aggregates a finer region set down to it).

**(c) Pluggable body-art skin; vendored MIT art, MuscleWiki rejected.** The body artwork sits behind a `BodyArtSkin` interface (`features/training/muscleMap/skins/`) so it is swappable without touching the volume logic. v1 is vendored MIT-licensed art (react-native-body-highlighter lineage, LICENSE kept in-repo); its ~23 region slugs aggregate up to the coarse-12 codes via the skin's `slugToMuscle` map. MuscleWiki's art was rejected — it is proprietary and the repo is public, so vendoring it would be a licensing violation.

**(d) Heatmap is inline on `/training`, no separate route.** The map renders inside the existing `/training` ("Hoy") page between today's plan and the recent-sessions list — there is no dedicated `/training/muscles` route (an earlier `MuscleActivityPage` was removed). It belongs with the day's training context, not behind navigation. Window options are 7d / 30d / 6mo / all (default 30d); male/female art auto-selects from `profiles.sex` (reactive — follows the profile once loaded) with a manual toggle override.

**(e) Pure volume core, one additive schema change.** All aggregation is a pure, I/O-free `computeMuscleVolume` in `src/core/muscleVolume.ts` (Tier-1 tested), keeping the boundary the rest of the app holds (pure core ← thin hooks/UI). The only schema change is the additive `exercises.secondary_muscles text[] not null default '{}'` column + its subset CHECK; everything else reuses the existing `workout_sets` / `exercises` shape. Because the app has no production users yet, the migration re-tags the 34 system-seed exercises in-place with no backfill.

**Status:** decided · done (R-24) · (b)/(c) superseded by [D-F11]

## D-F11 — Fine muscle taxonomy (Project A): 22-code model, multi-primary, dictionary table + trigger, data-fine-on-MIT-art

**Ruling:** Project A (R-26, #155) replaces the F-4 coarse-12 muscle model (D-F10 b/c) with a fine taxonomy. Five binding decisions; full rationale in `docs/superpowers/specs/2026-06-04-exercise-catalog-expansion-design.md`.

**(a) 22 fine codes in 6 groups + `full_body`.** shoulders (delt_front/side/rear), chest (pec_upper/lower), back (lat/trap/rhomboids/lower_back), arms (biceps/tri_long/tri_lateral/forearms), core (abs_upper/abs_lower/obliques), legs (quads/hamstrings/glutes/adductors/calves/tibialis), plus `full_body` (footnoted, never shades, not a valid secondary). No glute/quad sub-splits (the art collapses them and it complicates tagging for no visible gain); the triceps split is by movement emphasis (`tri_long` = overhead/long head, `tri_lateral` = pushdown/lateral+medial). Deltoid group label = "Hombro".

**(b) Multiple primaries; each primary 1.0, each secondary 0.5.** `exercises.primary_muscle` (singular) → `exercises.primary_muscles text[]`. Each primary mover earns 1.0 per working set, each secondary `SECONDARY_SET_WEIGHT = 0.5`; stimulus is **not** conserved across a set (correct for a relative-activity map). Warm-ups excluded; `full_body` footnoted (unchanged from D-F10 a).

**(c) Dictionary table + trigger; structure-only, names in i18n.** A `public.muscles` table (`code` pk, `muscle_group`, `body_region_slug`, `display_order`, `is_full_body`) holds structure only — names/group labels stay in i18n (D-E2). Integrity is a `validate_exercise_muscles` trigger (a CHECK cannot reference another table), replacing the old coarse inline CHECKs. The canonical **runtime** source is the TS const `src/core/muscles.ts` (`MUSCLES`); the DB table mirrors it for the trigger, with a pgTAP anti-drift test asserting TS == seed. The pure `computeMuscleVolume` core stays Tier-1 testable (no fetch).

**(d) Fine→slug aggregation in the render layer; ranked list at fine resolution.** `computeMuscleVolume` emits volume per fine code; `MuscleBody` sums fine→slug via `codesForBodyRegion` (in `core/muscles.ts`, not on the skin — the `BodyArtSkin` interface drops `slugToMuscle` and exposes only `id`/`viewBox()`/`parts()`). Several fine codes can share one slug (co-shading falls out of the sum); the ranked "Muscle · N sets" list still renders at fine resolution.

**(e) P1(a) — fine data now, current MIT art.** MuscleWiki art stays rejected (proprietary, public repo — D-F10 c). The data model is fully fine now; the heatmap renders at whatever the vendored MIT art distinguishes (core/back/legs gain visible detail; shoulders/chest/triceps co-shade) and finer license-clean art later changes only the skin's region map — no data/model change. Tagging UI = a single grouped tri-state `MuscleTagField` (neutral → Primary → Secondary → remove); picker filter optgroup'd, PostgREST `primary_muscles.cs.{code}`.

**Out of scope → Project B (R-27):** bulk catalog content + tagging-accuracy verification; group-level picker filter, group-name search, lay-term aliases.

**Update (2026-06-05) — runtime taxonomy extended to 24 shadeable codes (Project B1, #158).** Catalog ingestion added two fine codes beyond the (a) enumeration: `neck` (group **back**, `body_region_slug` `neck`, `display_order` 23) and `abductors` (group **legs**, `body_region_slug` `gluteal` — co-shaded with `glutes` under the current MIT art, `display_order` 24); both shadeable (`is_full_body = false`). The runtime model is therefore now **24 shadeable fine codes + `full_body`** (back → 5 codes, legs → 7); `src/core/muscles.ts` and the `muscles` seed both hold 25 rows. No separate `D-xx` was opened for the extension.

**Status:** decided · done (R-26, #155 + the `20260604130000` retag-review fix)

## D-F12 — R-33 token architecture: canvas tokens.css source of truth, two-layer design/shadcn-role tokens, section-scoped accent, nutri/gym rename

**Ruling:** The R-33 canvas `tokens.css` is the single source of truth for the theme. Tokens are organized in two layers: design tokens (oklch palette primitives) and shadcn role tokens (the semantic slots — `--background`, `--primary`, `--border`, etc. — that shadcn components consume), the latter derived from the former. Section identity is renamed `nutricion|entreno` → `nutri|gym` throughout, and section-scoped accents apply via `.section-nutri` / `.section-gym` classes set by `AppLayout`, with `--primary` following whichever `--accent` the active section scope defines. Tailwind utilities are wired to the token layer through `@theme inline` rather than duplicating values.

**Why:** A single canvas-owned token file avoids the drift risk of hand-copied hex values scattered across components (the exact problem the hardcoded-colour sweep this PR was cleaning up). The two-layer split (design tokens → shadcn role tokens) keeps shadcn's own primitive contract intact while still letting the app express its own palette and section identity underneath. Scoping the accent to the section (nutrition vs. training) via a CSS class read at the layout level, rather than plumbing a variant prop through the whole component tree, keeps the accent-follows-section behavior automatic for any component using the role tokens.

**Status:** decided · done (R-33 PR-1/PR-2, 2026-07-06)

## D-F13 — R-33 typography: self-hosted Rubik + Geist Mono, canvas type-scale, PWA green update

**Ruling:** Adopt Rubik Variable (sans) and Geist Mono Variable (mono) as the app's typefaces, self-hosted via the `@fontsource-variable` packages rather than a CDN (`fonts.googleapis.com`, etc.). Apply the canvas Convenciones §02 type-scale as a set of reusable Tailwind utilities. The PWA theme-color / manifest green updates to `#13702f`.

**Why:** The app is a PWA and must work offline-first and without depending on a third-party font CDN being reachable at load time — self-hosting via fontsource removes that runtime dependency and keeps font loading under the same build/caching pipeline as the rest of the bundle. The type-scale utilities centralize what were previously ad hoc font-size/line-height combinations. The green update brings the installed-PWA icon/splash color in line with the new canvas palette instead of the prior ad hoc value.

**Status:** decided · done (R-33 PR-2, 2026-07-06)

## D-F14 — R-33 muscle-heatmap ramp: gray→amber→red replaced by token-driven gym-blue color-mix ramp

**Ruling:** Per the canvas Auditoría decision #2, the F-4 muscle-activity heatmap's gray→amber→red intensity ramp is replaced by a `color-mix(in oklab, var(--gym) pct%, var(--heat-zero))` ramp, driven entirely by CSS custom properties so it resolves correctly in both light and dark mode. `muscleColor()` returns this `color-mix()` string (or `var(--heat-zero)` at zero volume); `NEUTRAL_PART` becomes `var(--heat-part)`.

**Why:** The old ramp hard-coded Tailwind gray/amber/red classes, which do not participate in the token system and read as an alarm/warning gradient (amber→red) for what is really just "how much volume," not a severity signal — a mismatch the canvas review flagged. Tying the ramp to `--gym` (the training-section accent) keeps the heatmap visually consistent with the rest of the section's palette and gives it automatic, correct dark-mode behavior for free, since `color-mix` re-resolves whenever the underlying custom properties change with the `dark` class.

**Status:** decided · done (R-33 PR-2, 2026-07-06)

## D-F15 — R-33 token extensions beyond canvas tokens.css, pending tone-core reconciliation

**Ruling:** A handful of tokens were added beyond what the canvas `tokens.css` defines, needed to cover cases the canvas did not yet specify: `--tone-info` / `--tone-good` / `--tone-warn`, `--excess-neutral` / `--excess-warn` / `--excess-bad` / `--excess-good`, `--amber-ink`, and `--heat-zero` / `--heat-part`. Light-mode values were derived from the canvas's existing tone palette where one already exists there; dark-mode values were invented (no canvas dark equivalent yet exists for these slots) using the same oklch construction approach as the rest of the token file.

**Why:** The hardcoded-colour sweep (this PR) needed semantic slots for macro-excess states, informational/warning/success text, the amber-badge ink color, and the heatmap's zero/non-muscle fills — none of which the canvas spec enumerates yet. Rather than block the sweep on a canvas update, these were added now as the closest reasonable interpretation of the canvas's existing tone conventions, explicitly flagged here as provisional: they are expected to be reconciled (renamed, retuned, or merged) once the R-33 tone core lands upstream in the canvas, and this entry is the marker for that follow-up.

**Status:** resolved (D-F17/D-F18, R-33 tone core, 2026-07-09) — nothing upstream to reconcile against: the canvas has no `--tone-*` or `--excess-*` tokens at all, `TONE` and `EXCESS` are hardcoded OKLCH literals in `planificador-tone.jsx`, light-only, and the light values here already match those literals exactly. The tone core landed instead having retired `--tone-info` and `--excess-good` as dead, and brought the previously-unused `--excess-neutral` into use.

## D-F16 — R-33 wave 0 navigation IA: two section apps with root-screen switch

**Ruling:** Mobile navigation is two per-section apps — nutri: Diario · Planificador · Recetas · Progreso · Más; gym: Hoy · Rutinas · Ejercicios · Progreso — instead of the canvas's unified 5-tab bar. Cross-section travel is an icon-button in the `MobileTopBar` on every root screen (dumbbell ↔ leaf). `/more` hosts Ingredientes / Plantillas / Objetivos / Ajustes on mobile. Desktop uses one collapsible sidebar (grouping Nutrición / Entrenamiento / Análisis) — no switch needed there. Also locked here: bottom-nav anatomy follows the Convenciones §08 spec (19px icons / 9.5px labels / active `--accent-ink`), and `/templates` is nutri-owned in `sectionOf`.

**Why:** Slot scarcity ruled out a single unified bar — both Planificador and Recetas need a slot and a 5-tab bar can't fit the full nutri set alongside gym's. Splitting into two section-scoped bars keeps each bar's item count sane and lets each bar hold strict per-section accent discipline (no cross-section accent bleed). It also matches the owner's preferred mental model of nutrition and training as two distinct apps you switch between, not one merged tab set. Full rationale in `docs/superpowers/specs/2026-07-02-r33-ui-redesign-design.md` §4.

**Status:** decided · in progress (R-33 wave 0, 2026-07-09)

## D-F17 — R-33 tone core: canvas `nutritionTone.ts` replaces `macroStatus.ts`

**Ruling:** The design canvas's thresholds and tone vocabulary win over `src/lib/macroStatus.ts`'s improvised bands, wholesale. Concretely, what a user now sees differently: the `budget` (blue) state is dropped, so under-target in a cut simply reads green; protein under target now warns where it used to be silently grey (amber below −3 %, red below −10 %); carbs in a bulk phase read green rather than grey; maintenance overshoot is amber, not red; the maintenance band tightens from ±5 % to ±3 %; cut kcal moves from absolute margins (+50/+100 kcal) to percentages (+1.5 %/+5 %). Two ports carry deliberate judgement, not a verbatim transcription: `getExcessTone`'s `metric` and `phase` parameters are declared in the canvas but never read there, so they were not ported; and fat's `pct > 0.10 → slightOver` rule is left ungated by phase, because the canvas *code* is authoritative over its own prose, which says the rule applies "en déficit" — the code disagrees with its own comment, and the code wins.

**Why:** The parent spec's source-authority order puts the canvas above the app's improvised bands, and the app is pre-production, so no migration or dual-read period is owed to existing data or users.

**Status:** decided · done (R-33 tone core, 2026-07-09)

## D-F18 — R-33 fat essential floor: `0.6 g/kg` of bodyweight, derived at render

**Ruling:** The fat essential floor is `FAT_FLOOR_G_PER_KG = 0.6`, applied to the user's latest bodyweight measurement and derived at render — never stored (hard invariant 5).

**Why:** The canvas never defines the floor's provenance — it is always injected, and always the literal `48` in its fixtures. The shipped app derived it as 20 % of target kcal ÷ 9, which makes a physiological floor move whenever the user eats less. All three definitions — the canvas fixture, the shipped kcal-derived formula, and the new bodyweight-derived one — coincide near 48 g for an 80 kg athlete on 2180 kcal, and diverge exactly where the energy-based one is wrong: an essential floor should track the body, not the day's target. Consequence: bodyweight is now threaded to the two consumers from `useLatestMeasurement`; when no measurement exists the floor is unknown and no fat-floor rule applies.

**Status:** decided · done (R-33 tone core, 2026-07-09)

## D-F19 — R-33 Diario kcal ring is single-arc (consumed / phase-target), not the canvas double-arc

**Ruling:** The Diario kcal ring is **single-arc: consumed / phase-target**, colored by `getKcalStatus(consumed, target, phase)`, with a "plan de hoy: {X} kcal" footnote derived free from the sum of today's `from_plan` meal logs. The canvas's "planificado (faint) vs registrado (solid)" double-arc is not adopted and not deferred — it is incompatible with this app's data model.

**Why:** This app materializes plan meals into `meal_logs` (`from_plan=true`) that already count as consumed, so a planned-vs-eaten split has no clean data source for *today*: the faint "planned" arc would sit hidden behind the solid "eaten" arc except in the degenerate case where the user deletes plan meals. Per spec §6.2's authorized fallback, the single-arc ring is the faithful render of the data we actually have. A true planned/eaten split would need a net-new "eaten" flag (out of scope; noted for the roadmap).

**Status:** decided · done (R-33 wave 2, 2026-07-10)

## D-F20 — R-33 Diario macros are tiles + progressive disclosure, not the canvas inline bars

**Ruling:** Macro display follows spec §6.2 text — a 2×2 `MacroTile` grid, **collapsible (closed by default) on mobile** and **always-visible in the web right rail** — rather than the canvas `DiarioMobile`'s four inline bars beside the ring. Both breakpoints reuse one `MacroTile` / `MacroGrid` (`collapsible` prop toggles the disclosure).

**Why:** The canvas canonical render shows 4 inline bars and leaves its own `MacrosDisclosure` (collapsible 2×2 tiles) defined but unwired, while spec §6.2 explicitly calls for "macro tiles … + progressive disclosure." The spec text wins over the canvas's unfinished render; a single shared tile keeps mobile and web visually identical and avoids a second macro component.

**Status:** decided · done (R-33 wave 2, 2026-07-10)

## D-F21 — R-33 weekly kcal chart data = `daily_nutrition_history` (past) + live today, phase-aware

**Ruling:** The web-rail weekly kcal chart's 7-day series is the Progreso `daily_nutrition_history` rows for the six past days plus the current day's live running total spliced into the canonical-today slot (`useWeeklyKcal`). Bar tone is phase-aware via `getKcalStatus`/`getExcessTone`; today's bar is always accent, regardless of tone. No new query string — it reuses the existing Progreso history fetch.

**Why:** `daily_nutrition_history` is populated nightly, so it never carries a row for the real-world today; the live diario total is the only truthful source for the today bar. The canvas hardcodes the cut-phase coloring rule, which its own implementation note flags as a TODO — so the phase-aware helpers (already shared with the Planificador) are the target, not the canvas's single-phase shortcut.

**Status:** decided · done (R-33 wave 2, 2026-07-10)

## D-F22 — R-33 Diario add-flow is a vaul Drawer (`AddToDaySheet`), replacing `MealLogDialog`

**Ruling:** Food logging goes through `AddToDaySheet` — a bottom-sheet on mobile / docked panel on web (vaul `Drawer` on mobile, `Dialog` at md+, mirroring the `ExerciseInfoButton` pattern), with an explore step (meal-slot selector, Recientes/Recetas/Alimentos tabs, live-balance footer) and a ración step (½-step stepper, macro-projection bars, over-state, create CTA). The Radix `MealLogDialog` is removed. Edit opens the sheet straight into the ración step; delete is preserved.

**Why:** the R-33 design replaces the flat form with a slot-aware, projection-driven flow; the shared vaul Drawer is the repo's sanctioned sheet primitive (prefer shadcn over hand-rolled Radix).

**Note:** the old dialog's free-text **notes** field is dropped from the add-flow (the R-33 canvas has no notes field). Existing `meal_logs.notes` values are preserved (create writes `null`; edit omits `notes`, never nulling an existing one) — they're just not editable through the new sheet. Re-add later if a notes affordance is wanted.

**Status:** decided · done (R-33 wave 2 PR-B, 2026-07-11)

## D-F23 — Ración macro projection is pure client-side math (no RPC/new fetch)

**Ruling:** The ración step projects day totals as `base + thisServingContribution` per macro using only data already in hand — today's `totals` (`sumMacros∘computeMealLogMacros`), the phase `targets`, and per-kind pure helpers (`ingredientMacros`, recipe `perServing`/`computeRecipeMacros`, custom typed numbers). Recipe per-serving macros are surfaced on `RecipeListItem`/`RecipeOption` from the data `listRecipes` already fetches (zero network cost). In edit mode the base subtracts the edited entry (`subtractMacros`, clamped ≥0) so it never double-counts, and the contribution derives from the entry's joined data (no reliance on the absent `RecipeOption.perServing`).

**Why:** `meal_logs` writes are single-table and macros are recomputed on read; the projection is arithmetic over existing rows, so no RPC/fetch/`.select()` is warranted (keeps the R-32 escape-hatch surface at zero).

**Status:** decided · done (R-33 wave 2 PR-B, 2026-07-11)

## D-F24 — Full-screen navigate-only search deferred to the Ingredientes wave

**Ruling:** The canvas's full-screen "navigate-only" quick search (searches, then opens the entity page, never logs) is **deferred** out of the Diario wave. Recipes have a detail/editor route (`/recipes/:id`) but there is **no ingredient/food detail page** — that page is built in the R-33 Ingredientes wave (§6.6). The search lands there, so it can navigate both entity kinds to real pages instead of shipping a degraded ingredient→list jump now.

**Why:** half the search's value (jumping to an ingredient's page) has no destination until the Ingredientes wave exists; building a degraded version first, then reworking it, is wasted motion. Logging is fully served by `AddToDaySheet`, so nothing is blocked by the deferral.

**Status:** decided · deferred to R-33 Ingredientes wave (2026-07-11)
