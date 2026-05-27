# Architecture

## Contents
- [Stack & hosting](#stack--hosting)
- [Frontend layout](#frontend-layout)
- [State model](#state-model)
- [Client↔edge boundary](#clientedge-boundary)
- [Computed logic (current)](#computed-logic-current)
- [i18n model](#i18n-model)
- [Theme model](#theme-model)

## Stack & hosting

Hudson's Fitness is a bilingual (ES/EN) PWA covering body composition, macros, recipes, weekly meal plans, and dietary phases. It is a React 18 + Vite + TypeScript single-page app that talks directly to Supabase (PostgREST + Auth + Realtime); there is no application server of its own. The schema lives in `data-model.md` and is not restated here.

- **Frontend**: React 18, Vite, TypeScript SPA.
- **Backend**: Supabase project `upvraruehzurbetzrxov` (EU Frankfurt) — PostgREST data API, Auth, Realtime.
- **Hosting**: Vercel SPA hosting; production branch `main` deploys on merge. CI, branch-protection, and deploy mechanics are documented in `operations.md`.
- **PWA**: built with `vite-plugin-pwa` (`registerType: 'autoUpdate'`); Workbox routes all `supabase.co` requests as `NetworkOnly` so data calls are never served from the service-worker cache.

## Frontend layout

Source lives under `src/` with the path alias `@/*` → `src/*`.

```
src/
├── app/                  # router + auth gates (RequireAuth → RequireOnboarded → AppLayout)
├── features/<name>/      # api.ts + hooks.ts + components/  (per-feature slice)
├── pages/                # one file per route
├── lib/                  # supabase client, dates, cn(), toast-helpers
├── components/ui/        # shadcn primitives
├── components/layout/    # app-shell layout pieces
├── hooks/                # cross-feature hooks
├── i18n/{es,en}/*.json   # translation namespaces (see i18n model)
└── types/database.ts     # hand-written Supabase types
```

Each `features/<name>` slice follows a fixed shape:

- `api.ts` — raw Supabase calls (queries, mutations, RPC invocations).
- `hooks.ts` — TanStack Query wrappers over `api.ts` (queries, mutations, cache keys).
- `components/` — feature-scoped UI.

`pages/` holds one file per route and composes feature components. `lib/` holds the shared Supabase client, date helpers, the `cn()` class helper, and toast helpers. `components/ui/` holds shadcn primitives.

## State model

The state-management boundary is fixed by **D-C1**:

- **All server state** goes through TanStack Query, exposed via the per-feature `hooks.ts`. There is no second server-state store.
- **React Context** is reserved for cross-cutting app concerns only and is used sparingly. At review time the only Contexts are **Auth** and **Theme**.
- **Local UI state** uses component `useState` and route params for everything else.
- **No query-string UI state** — UI state is not encoded into the URL search string.
- **Zustand is the pre-blessed per-slice escape hatch**: it is introduced only when a real shared or frequently-updating client-state need actually appears, and then only for that slice. Redux and MobX are rejected.

See D-C1 for the full ruling and rationale.

### Runner state model (F-3)

The guided active-workout runner (`/training/run`) is the app's one non-trivial
client state machine, and it deliberately stays within the D-C1 boundary — it is
**local UI state via `useReducer`**, not a new store, and touches **no server
state during the workout**.

- **Pure core.** `src/core/runner.ts` holds the entire model as a clock-free,
  I/O-free reducer: `buildRunnerState(input)` seeds it from the routine + per-set
  prefill, `runnerReducer(state, action)` advances it (actions: `SET_WORKING_WEIGHT`,
  `EDIT_CURRENT_SET`, `START_REST` / `RECORD_SET` / `ADJUST_REST` / `CLEAR_REST`,
  `ADD_SET`, `END_EXERCISE`, `JUMP_TO`, `SKIP_CURRENT`, `CONTINUE`, `FINISH_EARLY`),
  and selectors derive views (`nextPendingIndex`, `focusIndex`,
  `skippedUndoneIndices`, `toSaveWorkoutSets`) plus `computeTimerView`. Actions
  carry `nowMs` so the reducer never reads a clock. Fully Tier-1 tested.
- **Exercise lifecycle.** `pending → active → done`, with `skipped` (dropped,
  surfaced for recovery at finish) and `partial` (left mid-way with logged work —
  kept and resumable). Leaving an `active` exercise demotes it to `partial`/`pending`
  so it's never stranded (D-F9e).
- **Thin hooks bridge to the browser** (`src/features/training/runner/`):
  `useRunnerDraft` mirrors state to `localStorage` (`hf:runner:draft:v1`) on every
  change and restores it via a resume prompt; `useRestTimer` derives remaining time
  from a stored target timestamp (survives backgrounding — wall-clock math, not a
  decrementing counter); `useWakeLock` holds a Screen Wake Lock while active;
  `fireRestAlarm` is the capability-guarded sound+vibration. The orchestrator
  `Runner.tsx` owns the `useReducer` + a little view-local state (begin gate,
  overview, save) and renders one screen per phase.
- **Persistence boundary.** No DB writes mid-workout and no cross-device resume
  (D-F9a); the only server interaction is the single atomic `save_workout` at
  finish (the F-2 RPC, unchanged). On success the draft is cleared.

## Client↔edge boundary

The client (browser SPA) and the edge (Supabase Edge Functions, Deno) are two runtimes that sometimes need the same logic. The rule (from **D-C5**, **D-D6**, **D-F3**) is:

- **Stateful cross-runtime logic** goes through the database / an RPC, so there is one authoritative implementation. RPCs are `SECURITY INVOKER` and atomic across multiple tables (D-C5).
- **Pure cross-runtime logic** goes through a single shared pure module imported by both runtimes (D-F3).
- **`_shared/` is edge↔edge only.** It cannot bridge client↔edge (the Vite browser bundle and Deno cannot import the same aliased module). The client↔edge boundaries are the two bullets above: the DB/RPC for stateful logic, the shared pure core for pure logic.

The pure-module side of this rule is now in place (R-17 / D-F3):

- **Macro and date/TZ math is single-source.** The runtime-agnostic camelCase core lives at `src/core/macros.ts` and `src/core/dates.ts` — dependency-free (only `Date`/`Intl`), no React, no `@/` alias. The client imports it through `src/features/recipes/macros.ts` and `src/lib/dates.ts` (unchanged public API — those modules now delegate); the Deno edge imports it through `supabase/functions/_shared/macros.ts`, which re-exports the core and adds the **one** snake_case adapter (`toSnakeMacros`) used solely where rows are written to `daily_nutrition_history`. The core is camelCase by D-C4 (snake_case is reserved for DB rows); Deno resolves it via the relative path `../../../src/core/*.ts` with no transpile/codegen, and the `supabase/functions/_shared/macros.test.ts` golden-vector suite asserts the client and edge paths stay numerically identical (CI fails on divergence).

- **Plan materialization is one shared RPC.** R-12 / D-D6 replaced the hand-mirrored client+edge `materializePlanForDate` with a single `materialize_plan_for_date` SECURITY INVOKER RPC (`set search_path = public`): the client (`src/features/diario/api.ts`) and the `daily-nutrition-snapshot` edge function both call it; DB-idempotent via a partial unique index on `meal_logs (user_id, plan_week_slot_id) where plan_week_slot_id is not null` + `ON CONFLICT DO NOTHING`; bounded to `date <= today` (Europe/Madrid, same canonical "today" as `previousDayInTZ()`). The mirrored copies are deleted (single source = the RPC). Live in prod: the migration was applied then the calling code merged on 2026-05-18 (PR #38).

## Computed logic (current)

This is a behavioral overview of the nutrition math as it runs today. Column/DDL detail is in `data-model.md`.

- **Daily macro targets** — `computeDailyMacroTargets` in `src/lib/macros.ts` derives kcal, protein, fat, carbs, and fiber from a phase. kcal is either the phase's absolute `kcal_value` (`kcal_mode: 'absolute'`) or `estimatedTDEE + kcal_value` (`kcal_mode: 'tdee_delta'`, where the delta is signed). Fat is a fraction of kcal; carbs are the remainder after protein and fat; fiber is fixed grams or scaled per 1000 kcal.

- **Protein** — the canonical `computeDailyMacroTargets` in `src/lib/macros.ts` owns the protein rule (D-B1). It takes true scale `weightKg`, the optional latest `bodyFatPct`, and the `phaseType`. When a body-fat % is present, `proteinG = weightKg × (1 − bodyFatPct/100) × (phase.protein_g_per_kg ?? PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM[phaseType])` — lean mass × the per-phase override, which is pre-filled at phase-create time from the phase-aware lean-mass table (`cut 2.4 / maintenance 2.0 / bulk 1.8` g/kg LBM). When no body-fat % is logged it falls back to `weightKg × PROTEIN_FALLBACK_G_PER_KG_BODYWEIGHT` (1.6 g/kg total bodyweight). The basis is data-driven on bf% presence (no manual toggle) and surfaced in the UI. `computePhaseTargets` in `src/features/phases/targets.ts` is now only a thin shape adapter (it no longer pre-computes lean mass or feeds it through a misnamed `weightKg`). Existing phases keep their stored `protein_g_per_kg` — only new phases get table defaults.

- **TDEE** — the adaptive estimate is produced by the `recalculate-tdee` edge function as a daily incremental update of a persistent per-user 2-state linear Kalman filter on `[trend_weight, expenditure]` (`src/core/tdee.ts`, pure/dual-runtime/tested): each day it predicts the smoothed weight change from `intake − expenditure`, compares it to the observed raw weigh-in, and the residual self-corrects expenditure. 7700 kcal/kg is only an internal conversion prior; the old 14d/10d/±3d window gating is retired. Filter variance → a low/medium/high confidence band surfaced in the UI. This estimate is what feeds the `tdee_delta` kcal path above (Sprint-17 reader contract unchanged — additive confidence only). Live in prod since 2026-05-18 (`tdee_state` + `tdee_estimates.confidence`/`is_warmup` migration applied; `recalculate-tdee` deployed).

- **BMR / Mifflin-St Jeor** — `mifflinStJeor` in `src/lib/macros.ts` (`10·weightKg + 6.25·heightCm − 5·ageYears + sex constant`) is surfaced as `estimatedBmr`, a derived never-stored display on `/progreso` (latest-measurement card); it never feeds protein/TDEE/targets (D-B5). The 4 dead `tdee_estimates` BMR/breakdown columns were dropped 2026-05-18 (R-08).

- **Target weight** — `computeTargetWeightKg` in `src/lib/macros.ts` derives the goal weight from current lean mass and a target body-fat %: `leanMass = currentWeightKg × (1 − currentBodyFatPct/100)`, then `targetWeight = leanMass / (1 − targetBodyFatPct/100)`.

- **Muscle volume (F-4)** — `computeMuscleVolume` in `src/core/muscleVolume.ts` aggregates the user's working sets into per-muscle volume over the coarse-12 taxonomy: the exercise's primary mover earns 1.0 per set and each secondary mover earns `SECONDARY_SET_WEIGHT` (0.5); warm-ups are excluded and `full_body` sets are tallied into a separate footnote count, not spread across the map. It is pure (no clock, no I/O — `windowStart` is passed in) and Tier-1 tested. The fetch (`muscleMap/api.ts`) pulls the rows with two PostgREST `!inner` embeds (`workout_sessions` for `performed_on`, `exercises` for `primary_muscle`/`secondary_muscles`) and an embedded `session.performed_on=gte` window filter; RLS scopes the sessions to the current user. See R-24 / D-F10.

## Body-art skin abstraction (F-4)

The muscle heatmap's artwork is decoupled from its data so the body drawing is swappable without touching the volume logic. A `BodyArtSkin` (`src/features/training/muscleMap/skins/types.ts`) exposes `viewBox(gender, side)`, `parts(gender, side)` (the SVG paths), and a `slugToMuscle` map from the skin's own region slugs to the coarse-12 `MuscleCode`s. `MuscleBody.tsx` shades each part by looking up its slug's muscle volume and mapping it through `muscleColor` (grey→amber→red); unmapped slugs render neutral.

v1 is `mitSkin` — vendored MIT-licensed art (react-native-body-highlighter lineage; the `LICENSE` is kept in-repo at `skins/mitSkin/`), whose ~23 region slugs aggregate up to the 12 codes. Proprietary art (MuscleWiki) was rejected because the repo is public (D-F10c). The view (`MuscleActivityView`) is rendered **inline on `/training`** — no separate route — with the window pills, the gender toggle (default from `profiles.sex`, reactive once the profile loads), the ranked `Muscle · N sets` list, and the full-body footnote.

## i18n model

The app is bilingual ES/EN with **11 i18n namespaces** (`common`, `auth`, `nav`, `onboarding`, `metricas`, `ingredientes`, `recetas`, `diario`, `planning`, `objetivos`, `settings`), registered in `src/i18n/index.ts` (default namespace `common`).

Language is detected at boot by `i18next-browser-languagedetector` with detection order **`localStorage → navigator → es`** (`lookupLocalStorage: 'hudsons-fitness-lang'`, `caches: ['localStorage']`, `fallbackLng: 'es'`, `supportedLngs: ['es', 'en']`). For authenticated users `profile.language` is authoritative: `AuthProvider` runs a profile→i18n sync effect that applies it post-auth (after the boot detector has set the pre-auth language), so the effective order is `profile.language` (post-auth) → `localStorage → navigator → es`. `SettingsPage` remains the only authed write path for `profile.language`.

Stored content (recipe, ingredient, and template names) is never auto-translated. The placement of the in-app language toggle is governed separately by D-E4 (Settings-only when authenticated; the `LanguageSwitcher` appears only on pre-auth/onboarding routes).

Locale-aware formatting follows the active language: dates are formatted via `date-fns` with the `es` / `en-GB` locales, and numbers via `Intl.NumberFormat` (decimal comma in Spanish, decimal period in English).

## Theme model

Theming is owned by `ThemeProvider` in `src/features/theme/ThemeProvider.tsx`. It exposes `theme` ∈ `'light' | 'dark' | 'system'`, resolving `system` via `window.matchMedia('(prefers-color-scheme: dark)')` and toggling the `dark` class on `<html>`. The selected value is persisted **only** to `localStorage` under the key `hf-theme` — never to `profiles`.

To prevent a flash of unstyled / wrong-theme content (FOUC), `index.html` runs a synchronous inline IIFE in `<head>` that reads the same `hf-theme` key (defaulting to `system`), applies the same OS `prefers-color-scheme: dark` resolution, and adds the `dark` class before first paint. This couples the two: the `index.html` script and `ThemeProvider` must use the **identical** storage key (`hf-theme`) and identical system-resolution logic, or the pre-paint and React-rendered themes diverge.

This is a deliberate contrast with the i18n model (D-F6, D-E1): language is intentionally cross-device-authoritative (it belongs on the profile), whereas theme is intentionally **not**. A device's `system`/OS default is the correct theme behavior, and keeping theme in `localStorage` only is precisely what allows the synchronous pre-paint script to resolve it without waiting on a network/profile fetch. Confirmed as-is.
