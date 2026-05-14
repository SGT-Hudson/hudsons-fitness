# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Requires Node 20+ and pnpm 10+.

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint .
pnpm build        # tsc -b && vite build (to ./dist)
pnpm preview      # preview ./dist locally
```

`pnpm lint` and `pnpm build` MUST pass before pushing. There is no test runner configured.

Local dev needs `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (see README.md for the public-tier values used in production on Vercel).

Active dev branch: `claude/implement-fitness-architecture-DrnGF` (auto-merge enabled to `main` after CI).

## Architecture

Bilingual (ES/EN) PWA tracking body composition, macros, recipes, weekly meal plans, and dietary phases. React 18 + Vite + TypeScript SPA talking directly to Supabase (PostgREST + Auth + Realtime). Supabase project `upvraruehzurbetzrxov` (EU Frankfurt). Vercel SPA hosting; `vercel.json` has the SPA fallback rewrite.

**Authoritative specs**: `hudsons-fitness-architecture.md` (MVP technical spec — schema, RLS, computed logic, Edge Functions) and `HANDOFF.md` (current status, key user decisions, conventions). Read these before non-trivial work.

### Data layer

- **15 tables, all RLS-enabled.** Per-user tables follow a standard "auth.uid() = user_id" pattern. `ingredients` is **intentionally shared across users** (crowdsourced library) — anyone reads, anyone inserts (tagged with `created_by_user_id`), only creator edits/deletes; `created_by_user_id = null` means a system seed and is immutable. FK from `recipe_ingredients` is `ON DELETE RESTRICT` to protect shared data.
- **4 RPCs** (all SECURITY INVOKER, atomic across multiple tables): `save_recipe`, `save_template`, `apply_template_to_week`, `save_week_as_template`. Prefer these over multi-statement client mutations.
- **View** `body_measurements_smoothed` adds `weight_kg_5day_avg`.
- **Extensions**: `pg_trgm` (fuzzy ingredient search), `btree_gist` (non-overlapping phase date ranges via `EXCLUDE USING gist`) — in `extensions` schema, not `public`.
- `types/database.ts` is **hand-written**, not generated. CHECK constraints (e.g. `phases.kcal_mode`, `fiber_mode`) are typed as plain `string` in TS — verify enum values against `pg_constraint` before adding form options.
- `phases.fat_pct_of_kcal` is stored as a **fraction** (0.10–0.60), not a percent — UI converts at the form boundary.

### Frontend layout

```
src/
├── app/router.tsx               # Routes + auth gates: RequireAuth → RequireOnboarded → AppLayout
├── features/<name>/             # api.ts (supabase calls) + hooks.ts (TanStack Query) + components/
├── pages/                       # One file per route
├── lib/                         # supabase client, dates, cn() helper, toast-helpers
├── components/ui/               # shadcn primitives (button, card, dialog, input, label, select, tabs, textarea, toast)
├── i18n/{es,en}/*.json          # 10 namespaces — register new ones in src/i18n/index.ts
└── types/database.ts            # Hand-written Supabase types (Tables, TablesInsert, TablesUpdate)
```

Path alias: `@/*` → `src/*`.

**State**: TanStack Query for server state; React Context for auth; local component state + URL params for UI. No Redux/Zustand.

### Conventions (project-specific)

- **Forms**: `react-hook-form` **without** `zodResolver` — `@hookform/resolvers` is NOT installed despite `zod` being present. Use `register('field', { required, min, max, validate })` and `Controller` for shadcn Select/Textarea. Form types as plain `type FormValues = { ... }`, no `z.infer<>`.
- **Macros type**: camelCase `{ kcal, proteinG, carbsG, fatG, fiberG }` (NOT snake_case). Canonical math in `src/lib/macros.ts` (`computeDailyMacroTargets`); recipe-level helpers in `src/features/recipes/macros.ts` (`computeRecipeMacros`, `roundMacro`). `features/phases/targets.ts` is a thin wrapper.
- **Badges**: no `Badge` shadcn component — inline Tailwind `<span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-md ...">`.
- **Toasts**: fire from mutation hooks (not pages) via `@/lib/toast-helpers` (`toastSaved`, `toastDeleted`, `toastCreated`, `toastApplied`, `toastError`). High-frequency planner slot mutations fire only on error.
- **Units**: metric-only. `profiles.units` column is legacy and not surfaced.
- **i18n detection order**: `profile.language` → `localStorage` → `navigator.language` → `es`. Stored content (recipe/ingredient/template names) is never auto-translated.
- **Recipe deletion** is soft (`deleted_at` + partial unique index `where deleted_at is null`). Ingredient duplicates are tolerated (no dedup in MVP).
- **Past phases** are frozen once `end_date` passes (UI read-only, dimmed).

### Meal-plan flow (templates ↔ active week)

Two layers: **templates** (reusable, named) and **active week** (dynamic working copy from a template). Editing a week's slot at `date >= today` flips `meal_plan_weeks.has_diverged = true` via DB trigger. Weekly rollover (Edge Function, Mon 03:00 CET — not yet implemented) snapshots divergent weeks into auto-generated templates before generating the new week. See architecture §6.6 for full flow.

### Pending v1 work

Edge Functions + pg_cron (`daily-nutrition-snapshot`, `weekly-rollover`, `recalculate-tdee`) are the next sprint. Without these, `kcal_mode: 'tdee_delta'` phases return `null` targets, and the planned-vs-consumed chart on `/progreso` has no data source. The same crons also keep the Supabase free-tier project from auto-pausing.
