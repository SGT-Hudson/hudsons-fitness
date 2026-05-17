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

### 2026-05-17 — Conventions review + doc-rework

- Completed the 34-item conventions review (rulings in `decisions.md`, backlog in `roadmap.md`).
- Executed D-F2 — repo made public, CI workflow + `main` branch protection (`lint-build`) + GitHub auto-merge enabled, `main` reconciled via PR #17 and production redeployed (ended ~7-sprint staleness).
- Consolidated all docs into `docs/` (this rework).

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

