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

## Client↔edge boundary

The client (browser SPA) and the edge (Supabase Edge Functions, Deno) are two runtimes that sometimes need the same logic. The rule (from **D-C5**, **D-D6**, **D-F3**) is:

- **Stateful cross-runtime logic** goes through the database / an RPC, so there is one authoritative implementation. RPCs are `SECURITY INVOKER` and atomic across multiple tables (D-C5).
- **Pure cross-runtime logic** goes through a single shared pure module imported by both runtimes (D-F3).

Current reality does not yet match the pure-module side of this rule:

- **Macro and date math is duplicated today.** The client uses `src/lib/macros.ts` and `src/features/recipes/macros.ts` (camelCase `Macros`); the edge uses a separate `supabase/functions/_shared/macros.ts` (snake-cased totals plus its own date helpers). The two are maintained by hand in parallel.

  > ⚠ Changing — see R-17 (D-F3)

- **Plan materialization is hand-mirrored across client and edge.** The client materializes plan slots into `meal_logs` via `materializePlanForDate` in `src/features/diario/api.ts`; the `daily-nutrition-snapshot` edge function re-implements "the same plan-materialization the Diario page does" independently.

  > ⚠ Changing — see R-12 (D-D6)

## Computed logic (current)

This is a behavioral overview of the nutrition math as it runs today. Column/DDL detail is in `data-model.md`.

- **Daily macro targets** — `computeDailyMacroTargets` in `src/lib/macros.ts` derives kcal, protein, fat, carbs, and fiber from a phase. kcal is either the phase's absolute `kcal_value` (`kcal_mode: 'absolute'`) or `estimatedTDEE + kcal_value` (`kcal_mode: 'tdee_delta'`, where the delta is signed). Fat is a fraction of kcal; carbs are the remainder after protein and fat; fiber is fixed grams or scaled per 1000 kcal.

- **Protein** — `computeDailyMacroTargets` computes `proteinG = weightKg × phase.protein_g_per_kg`. It is fed lean mass, not scale weight: the `computePhaseTargets` wrapper in `src/features/phases/targets.ts` computes `leanMassKg = weightKg × (1 − bodyFatPct/100)` (falling back to scale weight when body-fat % is absent) and passes that lean mass through the `weightKg` parameter. The phase form labels the rate as g/kg of lean mass.

  > ⚠ Changing — see R-05 (D-B1)

- **TDEE** — the adaptive estimate is produced by the `recalculate-tdee` edge function using a two-endpoint window: it takes a 14-day window of consumed kcal and a weight measurement near each end of the window, then estimates `TDEE ≈ avg_intake_kcal − (Δweight_kg · 7700 / window_days)`. This estimate is what feeds the `tdee_delta` kcal path above.

  > ⚠ Changing — see R-07 (D-B4)

- **BMR / Mifflin-St Jeor** — `mifflinStJeor` exists in `src/lib/macros.ts` (`10·weightKg + 6.25·heightCm − 5·ageYears + sex constant`) but is currently uncalled anywhere in the app; no surface displays or stores a Mifflin-derived BMR today.

  > ⚠ Changing — see R-08 (D-B5)

- **Target weight** — `computeTargetWeightKg` in `src/lib/macros.ts` derives the goal weight from current lean mass and a target body-fat %: `leanMass = currentWeightKg × (1 − currentBodyFatPct/100)`, then `targetWeight = leanMass / (1 − targetBodyFatPct/100)`.

## i18n model

The app is bilingual ES/EN with **11 i18n namespaces** (`common`, `auth`, `nav`, `onboarding`, `metricas`, `ingredientes`, `recetas`, `diario`, `planning`, `objetivos`, `settings`), registered in `src/i18n/index.ts` (default namespace `common`).

Language is detected at boot by `i18next-browser-languagedetector` with detection order **`localStorage → navigator → es`** (`lookupLocalStorage: 'hudsons-fitness-lang'`, `caches: ['localStorage']`, `fallbackLng: 'es'`, `supportedLngs: ['es', 'en']`). `profile.language` is **not** applied at boot today — only `SettingsPage` persists it; nothing reads it back into i18next on load.

> ⚠ Changing — see R-13 (D-E1)

Stored content (recipe, ingredient, and template names) is never auto-translated. The placement of the in-app language toggle is governed separately by D-E4 (⚠ R-15).

Locale-aware formatting follows the active language: dates are formatted via `date-fns` with the `es` / `en-GB` locales, and numbers via `Intl.NumberFormat` (decimal comma in Spanish, decimal period in English).

## Theme model

Theming is owned by `ThemeProvider` in `src/features/theme/ThemeProvider.tsx`. It exposes `theme` ∈ `'light' | 'dark' | 'system'`, resolving `system` via `window.matchMedia('(prefers-color-scheme: dark)')` and toggling the `dark` class on `<html>`. The selected value is persisted **only** to `localStorage` under the key `hf-theme` — never to `profiles`.

To prevent a flash of unstyled / wrong-theme content (FOUC), `index.html` runs a synchronous inline IIFE in `<head>` that reads the same `hf-theme` key (defaulting to `system`), applies the same OS `prefers-color-scheme: dark` resolution, and adds the `dark` class before first paint. This couples the two: the `index.html` script and `ThemeProvider` must use the **identical** storage key (`hf-theme`) and identical system-resolution logic, or the pre-paint and React-rendered themes diverge.

This is a deliberate contrast with the i18n model (D-F6, D-E1): language is intentionally cross-device-authoritative (it belongs on the profile), whereas theme is intentionally **not**. A device's `system`/OS default is the correct theme behavior, and keeping theme in `localStorage` only is precisely what allows the synchronous pre-paint script to resolve it without waiting on a network/profile fetch. Confirmed as-is.
