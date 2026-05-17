# Absorption-Verification Check (temporary)

> Task-10 safety gate before the five migrated sources are deleted. One section
> per source; every distinct substantive fact classified COVERED /
> DROPPED-OK / GAP. GAPS found were closed (see the GAPS summary + the
> "fix" notes). This file is temporary and will be removed in a later cleanup.

Drop rules applied (from the doc-rework spec/plan):
- HANDOFF "resume prompt" / "next sprint" / running-state → DROPPED-OK.
- funcionalidades §6 suggested data model → DROPPED-OK (superseded by `data-model.md`).
- funcionalidades stale/obsolete future ideas not carried → DROPPED-OK.
- architecture spec section/line numeric pointers → DROPPED-OK.
- Conventions reversed/superseded by a D-ruling: the OLD form is intentionally
  not preserved as current; the decision+why must be in `decisions.md` → DROPPED-OK.

---

## 1. `hudsons-fitness-architecture.md`

| fact | classification | note |
|---|---|---|
| §1 In-scope v1 list (food log, recipes, shared ingredients, progress charts, phases, planner, daily history, bilingual, seed) | COVERED | `features.md` per-domain sections; seed gap closed (see GAP-5) |
| §1 Text search in v1 (barcode out of scope) | COVERED (after fix) | `features.md#ingredients` (GAP-1 closed) |
| §1 Out-of-scope list (barcode, FatSecret, smart-scale, URL import, workouts, shopping list, sleep/mood, native) | COVERED | `features.md#product-ideas-uncommitted` (FatSecret-discarded rationale also in spec table — DROPPED-OK as numeric detail) |
| §2 Tech stack table (React18/Vite/TS, Tailwind+shadcn, Router v6, TanStack Query, Recharts, RHF, react-i18next, Supabase PG15+, Auth, OFF, Vercel, Frankfurt, date-fns) | COVERED | `architecture.md#stack--hosting`; forms→`conventions.md`; date-fns locale detail gap closed (GAP-4) |
| §2 Auth = email/password + Google OAuth | COVERED (after fix) | `operations.md#auth--privacy` (GAP-3 closed) |
| §3 Data-flow: SPA↔PostgREST/Realtime direct, RLS per table, OFF from browser, edge for scheduled | COVERED | `architecture.md#stack--hosting` + `#clientedge-boundary`; `data-model.md` RLS |
| §4.1–4.9 table DDL (15 tables, columns, constraints, indexes) | COVERED | `data-model.md#tables` (authoritative from `types/database.ts`) |
| §4.x triggers (`mark_week_diverged`) | COVERED | `data-model.md` `meal_plan_week_slots` |
| §5.1 standard 4-policy RLS pattern + table list | COVERED | `data-model.md#row-level-security` |
| §5.2 `ingredients` shared RLS (open SELECT/INSERT, creator UPDATE/DELETE, null=immutable seed, FK RESTRICT) | COVERED | `data-model.md#row-level-security` + D-A1 |
| §6.1 `computeDailyMacroTargets` formula (kcal abs/delta, protein=w×g/kg, fat=frac×kcal, carbs=remainder, fiber fixed/per1000) | COVERED | `architecture.md#computed-logic-current` + `features.md#macros--phases` |
| §6.2 smoothed view (window avg, 4 preceding..current row) | COVERED | `data-model.md#views` |
| §6.3 target weight (lean=w×(1−bf/100); target=lean/(1−tbf/100)) | COVERED | `architecture.md#computed-logic-current` (`computeTargetWeightKg`) |
| §6.4 TDEE energy balance `avg − Δw×7700/N`; 21d default / ≥14d logs / 5 weights (spec) vs current 14d/≥10d/±3d | COVERED | current values in `features.md#tdee` + `operations.md`; spec's 21/14/5 are superseded → DROPPED-OK |
| §6.4 Mifflin-St Jeor (10W+6.25H−5age +5/−161) | COVERED | `architecture.md#computed-logic-current` (BMR/Mifflin bullet) |
| §6.4 activity = TDEE−BMR; workout/NEAT split (post-v1.4) | DROPPED-OK | D-B5 descaffolds the energy-breakdown; rationale in `decisions.md` D-B5 + `roadmap.md` R-08 |
| §6.5 bone estimation (BodySpec regression formula) | DROPPED-OK | D-A6 removes `bone_kg` entirely; rationale in `decisions.md` D-A6 |
| §6.6A apply-template-to-week algorithm | COVERED | `features.md#meal-plans` + `data-model.md` RPC `apply_template_to_week` |
| §6.6B user edits week → trigger divergence; "Save as template" | COVERED | `features.md#meal-plans` |
| §6.6C weekly rollover (diverged→snapshot auto template→generate) | COVERED | `features.md#meal-plans` + `operations.md#edge-functions` |
| §6.6D Diario materialization (no-confirm, dedup, from_plan marker, no back-propagation) | COVERED | `features.md#diario--materialization` (+ R-12 callout) |
| §6.6E daily nutrition snapshot algorithm | COVERED | `operations.md#edge-functions` + `data-model.md` `daily_nutrition_history` |
| §6.7 ingredient search + OFF import flow (local-first, OFF probe when <5 local & query≥3, 23505 dedup-reuse) | COVERED (after fix) | `features.md#ingredients` (GAP-1 closed) |
| §7.1 folder structure | COVERED | `architecture.md#frontend-layout` (current actual tree; spec tree was idealized) |
| §7.2 route list (/diario, /planificador, /menus, /recetas, /ingredientes, /progreso, /objetivos, /settings, /login, /signup) | DROPPED-OK | route-by-route map is implementation detail; auth-gate chain covered in `architecture.md#frontend-layout`; the surfaces themselves covered in `features.md` |
| §7.3 state management (TanStack/Context/local, no Redux/Zustand) | COVERED | `architecture.md#state-model` + D-C1 |
| §7.4 UX: recipe editor 2-col live macros / grid-list toggle / per_serving curry trick at feature level | COVERED (after fix) | `features.md#recipes` (GAP-2 closed); finer pixel-level UX = implementation detail, DROPPED-OK |
| §7.4 UX: Ingredientes search both local+OFF, source badges, owner edit affordance; Create Ingredient modal 3 tabs | COVERED (after fix) | `features.md#ingredients` (GAP-1 closed) |
| §7.4 UX: Progreso 3 chart blocks | COVERED | `features.md#body-composition--measurements` + changelog (MacrosChart) |
| §8 i18n: react-i18next, namespaces, detection order, stored content not translated | COVERED | `architecture.md#i18n-model` + `conventions.md` (D-E1/E2) |
| §8 locale-aware formatting (date-fns es/en-GB; Intl.NumberFormat decimal comma ES / period EN) | COVERED (after fix) | `architecture.md#i18n-model` (GAP-4 closed) |
| §9 EU Frankfurt region for GDPR | COVERED | `operations.md#supabase-project` + `data-model.md#overview` |
| §9 Right to deletion cascades; `ingredients.created_by_user_id` set-null exception (anonymized) | COVERED | `data-model.md` Library model #8 + `operations.md#edge-functions` (`delete-account`) |
| §9 Right to export ("Download all my data" → Edge Function → ZIP of JSON) | COVERED (after fix) | `operations.md#auth--privacy` + `roadmap.md`/features as uncommitted (GAP-3 closed) |
| §9 No analytics by default; if added use EU self-hostable (Plausible/Umami) | COVERED (after fix) | `operations.md#auth--privacy` (GAP-3 closed) |
| §9 Privacy policy + cookie banner required before launch | COVERED (after fix) | `operations.md#auth--privacy` (GAP-3 closed) |
| §10 Edge function table (`weekly-rollover`, `recalculate-tdee`, `daily-nutrition-snapshot`) + Deno/JWT/service-role notes | COVERED | `operations.md#edge-functions` + `#cron` |
| §10 `daily-summary` future fn ("X kcal left" push) | COVERED (after fix) | `features.md#product-ideas-uncommitted` (GAP-8 closed) |
| §11.1 Seed data: ~21 system-seed ingredients + ~10 recipes via seed.sql, runs once | COVERED (after fix) | `operations.md#data-seeding` (GAP-5 closed) |
| §11.1 Future BEDCA ~100 generic Spanish foods seed | COVERED (after fix) | `features.md#product-ideas-uncommitted` (GAP-5 closed) |
| §11.2 Free-tier auto-pause after 7 days; crons double as keep-alive | COVERED | `features.md#meal-plans` + `operations.md#cron` |
| §11.2 Keep-alive fallback (GitHub Action curl / Cloudflare Worker) if crons removed | COVERED (after fix) | `operations.md#cron` (GAP-6 closed) |
| §11.3 Free tier has no automatic backups; `supabase db dump` weekly safety net | COVERED (after fix) | `operations.md#backups` (GAP-7 closed) |
| §12 Roadmap v1.1–v2.0 (barcode, Withings, photos, BEDCA, bf-visual-ref, shopping list, workouts, health bridge, URL import, moderation, native) | COVERED | `features.md#product-ideas-uncommitted` (post-MVP product ideas; not R-items by design) |
| §13 Open Q1 default protein | COVERED | `decisions.md` D-B2 (reversed) / D-B1 |
| §13 Open Q2 past phases editable/frozen | COVERED | `decisions.md` D-A5 + `roadmap.md` R-02 |
| §13 Open Q3 recipe deletion hard/soft + FK detail | COVERED | `decisions.md` D-A3 + Library model R-01 |
| §13 Open Q4 ingredient duplicates | COVERED | `decisions.md` D-A4 + R-01 |
| §13 Open Q5 photo storage v1 vs v1.1 | COVERED | `features.md#product-ideas-uncommitted` (recipe photos postponed; HANDOFF decision) |
| §13 Open Q6 "Start fresh" reset feature | COVERED (after fix) | `features.md#product-ideas-uncommitted` (GAP-9 closed) |
| §"Last updated" footer | DROPPED-OK | doc-meta line, not a product fact |

## 2. `HANDOFF.md`

| fact | classification | note |
|---|---|---|
| Status line / Sprint 16 / v1 punch list complete | DROPPED-OK | running-state |
| Stack + Vercel URL + repo + Supabase project | COVERED | `operations.md` + `architecture.md` |
| Done table (22 PR rows / Sprints) | COVERED | `changelog.md#pr-table` + `#sprints` |
| Pending for v1 (✅ complete; post-v1 candidates: photos, OFF mass import, mobile UX, observability) | COVERED | `features.md#product-ideas-uncommitted` + `roadmap.md` R-18 (observability/liveness) |
| "macros chart empty until history accumulates" note | DROPPED-OK | running-state caveat (chart behavior itself covered in `features.md`) |
| Key decision: default protein 1.6 | COVERED | `decisions.md` D-B2 (reversed by D-B1) |
| Key decision: bone weight on profiles, set at onboarding, 0.5–20 kg | COVERED | `data-model.md` (bone_kg) + `decisions.md` D-A6 |
| Key decision: measurement carry-over lazy + stale marker | COVERED | `features.md#body-composition--measurements` (stale banner) |
| Key decision: past phases frozen at end_date | COVERED | `features.md#macros--phases` + D-A5 |
| Key decision: recipe soft-delete `deleted_at` + partial unique index | COVERED | `data-model.md` `recipes` + D-A3 |
| Key decision: ingredient duplicates tolerated | COVERED | `data-model.md` + D-A4 |
| Key decision: recipe photos postponed to v1.1 | COVERED | `features.md#product-ideas-uncommitted` |
| Key decision: Vercel URL `hudsonfitness.vercel.app` | COVERED | `operations.md#hosting--deploy` |
| Key decision: metric-only; `profiles.units` legacy | COVERED | `data-model.md` + `conventions.md` + D-E3 |
| Key decision: language toggle Settings-only (header switcher on Onboarding) | COVERED | `conventions.md` + D-E4 |
| Key decision: `initial_weight_kg` read-only post-onboarding | COVERED | `decisions.md` D-A7 |
| Key decision: charts (interpolation, MA5 overlay, 30/90/1y/all default 90d, Y cap 100%) | COVERED | `features.md` + `conventions.md` D-D4 + D-D5 |
| Key decision: toasts (hooks not pages, helpers, 4s/7s, max 3, planner on-error-only) | COVERED | `conventions.md` + `decisions.md` D-D2/D-D3 (limits/timing preserved) |
| Key decision: sprint order | DROPPED-OK | running-state sequencing |
| Key decision: plan=default truth (materialize, dedup by plan_week_slot_id, MEAL_TYPE_ORDER fallback 'other') | COVERED | `features.md#diario--materialization` + D-D6 |
| Key decision: edge runtime Deno+TS, `_shared/` | COVERED | `operations.md#edge-functions` + D-F3 |
| Key decision: cron schedules UTC (1/2/3), DST not corrected | COVERED | `operations.md#cron` + D-F4 |
| Key decision: TDEE math 14d / ≥10d / 7700 / ±3d | COVERED | `operations.md` + `features.md#tdee` |
| Key decision: cron auth = Vault `cron_service_role_key`, operator must create once | COVERED | `operations.md#cron` + D-F5 |
| DB state: 15 tables RLS, security invoker, pinned search_path | COVERED | `data-model.md` |
| DB state: per-table grouping notes (bone on profiles, ingredients 21+user, goals no id) | COVERED | `data-model.md` (goals PK=user_id; ingredients seed count → operations seeding GAP-5) |
| View `body_measurements_smoothed` | COVERED | `data-model.md#views` |
| 4 RPCs SECURITY INVOKER atomic | COVERED | `data-model.md#rpcs` |
| Extensions pg_trgm/btree_gist in `extensions` schema | COVERED | `data-model.md#extensions` |
| phases gotchas (kcal_mode/fiber_mode enums, fat_pct fraction, EXCLUDE gist, canonical macros loc) | COVERED | `data-model.md` `phases` + `conventions.md` (D-B3) + `architecture.md` |
| "check pg_constraint before forms" caveat | COVERED | `data-model.md#type-definitions--caveats` + `conventions.md` |
| Conventions: RHF without zodResolver / plain FormValues | DROPPED-OK | reversed by D-C2/D-C3; old form not preserved as current; rationale in `decisions.md` D-C2 |
| Conventions: no Badge component, inline Tailwind variants | DROPPED-OK | reversed by D-D1; rationale in `decisions.md` D-D1; new rule in `conventions.md` |
| Conventions: shadcn components available / Missing list | DROPPED-OK | running inventory; Badge addressed by D-D1/R-10 |
| Conventions: data layer (api.ts/hooks.ts, Tables/Insert/Update import) | COVERED | `architecture.md#frontend-layout` + `conventions.md` |
| Conventions: i18n 10 namespaces, register in index.ts, interpolation/plural | COVERED | `architecture.md#i18n-model` (11 ns now — drift corrected) |
| Conventions: routes in router.tsx, auth gates | COVERED | `architecture.md#frontend-layout` |
| Conventions: Macros camelCase | COVERED | `conventions.md` + D-C4 (reframed snake_case-end-to-end) |
| Key file references tree | DROPPED-OK | running file-pointer index; structure covered in `architecture.md#frontend-layout` |
| Workflow: dev branch, lint+build before push, commit msg style, auto-merge, local clone path | COVERED | `operations.md#ci--merge-workflow` (+ D-F2); local-clone path = running-state DROPPED-OK |
| "How to resume in a new chat" prompt | DROPPED-OK | resume prompt |
| Sprint 9 operator notes (migration applied, fns deployed, crons scheduled, vault created, README) | COVERED | `operations.md#cron` / `#edge-functions` (+ `#schema-in-migrations-status`) |
| Sprint 16 operator notes (delete-account deploy, env vars, CASCADE chain, UI wired) | COVERED | `operations.md#edge-functions` + `data-model.md` Library model #8 |

## 3. `funcionalidades-excel-gym.md` (Spanish source)

| fact | classification | note |
|---|---|---|
| 3-sheet workbook (Metricas/Resultados/Ingredientes) interlinked | COVERED (EN) | `features.md#background-origin` |
| Metricas: daily body-comp diary since 21/07/2024, multi-year grid, home vs gym scale, 5-day MA | COVERED (EN) | `features.md#background-origin` (smoothing rationale preserved; "home vs gym scale" distilled as scale weight — dual-source detail not load-bearing, DROPPED-OK) |
| Resultados: target weight derived from target bf% + FFM; weight-dependent macro goals; meal counter; live recompute | COVERED (EN) | `features.md#background-origin` |
| Resultados: macro goal formulas (prot w×1.6/2, fat 25% kcal/9, fiber 25g fixed, carbs remainder) | COVERED | origin narrative in `features.md#background-origin`; current authoritative formulas in `architecture.md#computed-logic-current` + D-B1 |
| Resultados: manual dinner fields | COVERED | `data-model.md` `meal_logs` custom_* / `custom_name` |
| Recipes mini-table structure; per-ingredient totals from per-gram values | COVERED | `features.md#background-origin` + `data-model.md` recipes/recipe_ingredients |
| Curry two-step trick (guiso ÷ servings + rice added per serving) | COVERED | `data-model.md` `recipe_ingredients` (`per_serving`) + `features.md#recipes` (GAP-2) |
| Specific recipe/ingredient inventories in the workbook | DROPPED-OK | the actual data becomes seed content (operations seeding GAP-5); the literal list is sample data, not a product fact |
| Ingredientes: per-100g + mirror per-gram/per-unit table | COVERED | `data-model.md` `ingredients` (unit_type gram/unit; macros per 100g/unit) |
| §4 seven capabilities synthesis | COVERED | `features.md#background-origin` (the seven map to the per-domain feature sections) |
| §5 future suggestions (nutrition/body/training/health/platform) | COVERED | `features.md#product-ideas-uncommitted` (kept ones; stale dropped per spec) |
| §6 suggested data model sketch (User/BodyMeasurement/Ingredient/...) | DROPPED-OK | explicitly superseded by `data-model.md` (spec drop rule) |
| Footer "Generado a partir de…" | DROPPED-OK | doc-meta |

## 4. `supabase/README.md` (pre-stub content)

| fact | classification | note |
|---|---|---|
| Sprint 9 = 3 scheduled jobs populating daily_nutrition_history/tdee_estimates via pg_cron + pg_net | COVERED | `operations.md#cron` |
| Layout (1 migration file + functions tree w/ schedules) | COVERED | `operations.md#edge-functions` + `#schema-in-migrations-status` |
| One-time `vault.create_secret('<key>','cron_service_role_key')` setup; error if absent | COVERED | `operations.md#cron` (Auth: one-time setup) |
| Manual smoke-test curl commands (date payload default = yesterday Madrid) | COVERED | `operations.md#edge-functions` (Manual invocation) |
| Per-fn JSON status array (`ok`/`already_exists`/`no_template`/`insufficient_intake`) | COVERED | `operations.md#edge-functions` |
| Cron diagnostics SQL (cron.job / cron.job_run_details) | COVERED | `operations.md#cron` (How to tell crons are dead) |
| Math notes: snapshot mirrors client macro math, /100 vs /1, per_serving scaling | COVERED | `operations.md#edge-functions` (Math notes) |
| Math notes: recalc-tdee 14d/7700/≥10d/±3d | COVERED | `operations.md#edge-functions` |
| Math notes: weekly-rollover via `apply_template_to_week_admin` (service-role variant; public RPC uses auth.uid()) | COVERED | `operations.md#edge-functions` + `data-model.md#rpcs` |

## 5. Old `CLAUDE.md` prose (pre-router, commit `ed08d10`)

| fact | classification | note |
|---|---|---|
| Commands (install/dev/typecheck/lint/build/preview; Node20/pnpm10) | COVERED | `operations.md#commands` + `CLAUDE.md` router Commands |
| lint+build must pass before push; no test runner | COVERED | `operations.md#commands` + `#ci--merge-workflow` + D-F1 |
| `.env.local` keys; public-tier in README | COVERED | `operations.md#commands` |
| Active dev branch + auto-merge to main | COVERED | `operations.md#ci--merge-workflow` |
| Architecture summary (bilingual PWA, React→Supabase, project id, Vercel SPA rewrite) | COVERED | `architecture.md#stack--hosting` + `operations.md#hosting--deploy` |
| "Authoritative specs" pointer (arch + HANDOFF) | DROPPED-OK | obsolete by design (those docs being deleted; router replaces this) |
| Data layer bullets (15 tables RLS, ingredients shared, 4 RPCs, view, extensions, hand-written types, fat fraction) | COVERED | `data-model.md` (+ D-A1/C5/A8/B3) |
| Frontend layout tree + `@/*` alias | COVERED | `architecture.md#frontend-layout` |
| State bullet | COVERED | `architecture.md#state-model` + D-C1 |
| Conventions (forms, macros, badges, toasts, units, i18n order, soft-delete, past phases) | COVERED | reversed ones (forms/badges) → `decisions.md` D-C2/D-D1; confirmed ones → `conventions.md` |
| Meal-plan flow summary | COVERED | `features.md#meal-plans` + `#diario--materialization` |
| "Pending v1 work" (edge fns next sprint; tdee_delta null; chart no data; keep-alive) | DROPPED-OK | running-state (now shipped Sprint 9; current state in `operations.md`/`features.md`) |

---

## GAPS summary

All gaps below were **real** (substantive fact, neither covered nor legitimately
dropped) and have been **closed**. Re-verified after each fix.

- **GAP-1 — Ingredient text-search + OpenFoodFacts import flow** (arch §6.7, §1, §7.4).
  The *current built* behavior (local shared-library search first; OFF probe when
  local results are thin and the query is ≥3 chars; the unique-violation
  dedup-and-reuse on import) had no feature-level home. **Closed:** added
  `features.md` → "Ingredients (shared library & OFF import)" section.
- **GAP-2 — Recipe library current behavior** (arch §1, §7.4). Serving scaling,
  the feature-level `per_serving` curry trick, the live two-column macros editor,
  and the grid/list toggle were only in deleted-source UX prose. **Closed:**
  added `features.md` → "Recipes" section.
- **GAP-3 — Auth method + privacy/analytics/export posture** (arch §2, §9).
  Email/password + Google OAuth; no analytics by default (EU self-hostable
  Plausible/Umami if ever added); privacy policy + cookie banner required before
  launch; the not-yet-built "Download all my data" GDPR export. **Closed:** added
  `operations.md` → "Auth & privacy" section (export marked as not-yet-built,
  per the no-un-built-design-as-current rule).
- **GAP-4 — Locale-aware formatting** (arch §8). date-fns `es`/`en-GB` locales;
  `Intl.NumberFormat` decimal comma (ES) vs period (EN). **Closed:** appended to
  `architecture.md#i18n-model`.
- **GAP-5 — Initial data seeding** (arch §11.1, HANDOFF "ingredients 21+user").
  ~21 system-seed ingredients + ~10 founding-user recipes pre-extracted to
  JSON/`seed.sql`, run once; future BEDCA ~100 generic Spanish foods.
  **Closed:** added `operations.md` → "Data seeding" section; BEDCA future-seed
  added to `features.md#product-ideas-uncommitted`.
- **GAP-6 — Keep-alive fallback** (arch §11.2). If the crons are ever removed,
  a GitHub Action `curl` or a Cloudflare Worker must take over the keep-alive.
  **Closed:** appended to `operations.md#cron`.
- **GAP-7 — Backups** (arch §11.3). Free tier has no automatic backups;
  `supabase db dump` weekly safety net wired into the keep-alive Action until a
  Pro/PITR upgrade. **Closed:** added `operations.md` → "Backups" section.
- **GAP-8 — `daily-summary` future edge function** (arch §10). "You have X kcal
  left" push notifications. **Closed:** added to
  `features.md#product-ideas-uncommitted`.
- **GAP-9 — "Start fresh" reset feature** (arch §13 Q6). A Settings reset of
  active phase / active plan / (future) workout state preserving historical data.
  **Closed:** added to `features.md#product-ideas-uncommitted`.

No remaining GAPS. The five sources are safe to delete (next task, gated on the
human checkpoint).
