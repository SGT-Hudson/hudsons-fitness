# Conventions

Decided code rules in post-review form. Rules only — rationale is in
`decisions.md` (cited by D-id). `⚠ Changing — see R-xx` marks a rule whose
decided form is not yet implemented (the codebase does not match it yet;
tracked in `roadmap.md`).

## Contents
- [Forms](#forms)
- [Types & macros](#types--macros)
- [Data mutations](#data-mutations)
- [UI](#ui)
- [i18n & locale](#i18n--locale)
- [Theme](#theme)

## Forms

- Every form uses `react-hook-form` with `zod` via `@hookform/resolvers` `zodResolver` (D-C2).
- Co-locate the schema per feature at `src/features/<x>/schema.ts`; page-level forms with no page feature folder put their schema in the most natural feature module (e.g. Login/Signup → `features/auth/schema.ts`, Onboarding/Settings biometrics → `features/profile/schema.ts`, the goal dialog → `features/objetivos/schema.ts`, the template editor → `features/templates/schema.ts`) (D-C3).
- Derive the form type from the schema via `z.infer<typeof schema>` (or `z.input`/`z.output` when the schema transforms string inputs to numbers — declare the resolver's output type as the third `useForm` generic); never a hand-written `type FormValues = { ... }` (D-C3).
- `register('field', { valueAsNumber })` / `Controller` for shadcn Select/Textarea; numeric string inputs are coerced inside the schema, so the field stays string-typed. Validity is the schema's job; localized error copy stays in the component (zod messages map to existing i18n keys — no raw English).
- Numeric fields are **string-in** (D-C2): they render as `NumberField` (`type="text" inputMode="decimal"`) so a decimal comma survives to JS, and the schema owns both the parse and the bounds `type="number"`'s native `min`/`max` used to gate. Compose them from `requiredNumericString`/`optionalNumericString` (`src/lib/zod.ts`) + `z.input`/`z.output` + `useForm<Input, unknown, Output>`, which emits a stable `required` vs `range` issue-code split (blank → required copy, bad value → range copy). Used by measurements, profile (onboarding/biometrics), phases, objetivos and training (`weight_kg`).
  - `register(field, { valueAsNumber: true })` survives only on integer-only fields, where a decimal separator has no meaning (training reps/sets/RPE/warm-up percent — `RoutineBuilder`, `SetRow`). Never reach for it on a field that can carry a decimal: it returns NaN on `"1,2"`.
  - Where a blank carries a domain meaning the shared helpers cannot express (ingredients: blank fiber → 0 g, blank sub-macro → `null` "unknown"), the feature builds its own string→number field schemas — but keeps the contract: stable issue codes resolved through `pickFirstError`.
- The shared first-error precedence helper `pickFirstError(errors, orderedKeys, order)` (also `src/lib/zod.ts`) backs each feature's `first<X>Error` wrapper for multi-rule `superRefine` schemas (recipes, diario, templates, ingredients); the wrapper keeps the feature-named export and passes its ordered key list (D-C2).
- Single-control, instant-apply settings (the Settings language and theme segmented buttons, both the page-local `Segmented`) are controlled inputs, not RHF forms — they have no validated submit (theme is localStorage-only per D-F6).

## Types & macros

- DB-sourced rows stay snake_case end-to-end (D-C4).
- `src/types/database.ts` is **generated** from the live schema (`supabase gen types`, command in `operations.md`), not hand-maintained. Two generator caveats survive every regen: (1) CHECK-constraint enums (`phases.kcal_mode`, `fiber_mode`, `tdee_estimates.confidence`) come through as plain `string` — form/validation code must verify allowed values against `pg_constraint`/the pure core, the type won't; (2) the generator cannot infer SQL-function argument nullability so it emits non-null `string` — the nullable RPC args (a null create-or-update id = "create new", plus the clearable/optional metadata args) are restored to `string | null` by a documented post-generation patch. The marker comment above the `Functions` block in `src/types/database.ts` is the authoritative list of which functions carry the patch — re-read it after a regen rather than trusting a copy here. Re-apply both caveats after any regen (D-A8).
- camelCase is reserved for computed/derived types — the `Macros` envelope is `{ kcal, proteinG, carbsG, fatG, fiberG }` (D-C4).
- Estimated BMR (Mifflin-St Jeor) and target-weight are derived, never-stored displays — recompute on render, don't persist, no DB column, and never feed protein/TDEE/targets (display only) (D-B5). `estimatedBmr` is wired on `/progress` (latest-measurement card); the 4 dead `tdee_estimates` BMR/breakdown columns were dropped 2026-05-18 (R-08).
- Store `phases.fat_pct_of_kcal` as a fraction `0.10`–`0.60`, never a percent (D-B3).

## Data mutations

- Any operation mutating more than one table atomically MUST be an RPC; single-table mutations stay client-side (D-C5).
- All user-callable RPCs are `SECURITY INVOKER` with `set search_path = public`; `SECURITY DEFINER` is forbidden without a security review (two documented exceptions: the cron-only `apply_template_to_week_admin`, and `reconcile_account_delete` for account-delete reconciliation — granted only to `service_role` / no app-facing role) (D-C5).
- Plan materialization is a single `SECURITY INVOKER` RPC `materialize_plan_for_date` (`set search_path = public`), DB-idempotent via a partial unique index + `ON CONFLICT DO NOTHING`, bounded to `date <= today` (Europe/Madrid); the client/edge mirrors are removed (live in prod — migration applied then calling code merged 2026-05-18) (D-D6).
- Convert the fat fraction (and any unit/fraction) only at the form boundary via a shared helper, never inline `×100` (helper `fractionToPct`/`pctToFraction` in `src/lib/macros.ts`; the 4 inline sites (PhaseEditorForm ×3, PhaseHeroCard) use it; the DB CHECK backstop `phases_fat_pct_of_kcal_range` is applied in prod) (D-B3).

## UI

- Use the shadcn `Badge` component for badges (D-D1).
- Toasts fire from the layer that owns the mutation (usually `hooks.ts`); a component owning its own mutation flow (e.g. destructive confirm dialogs) calls toast directly; pages never call toast (D-D2).
- Success toasts only when the action is user-triggered AND low-frequency; high-frequency, background, or implicit mutations toast on error only; `useDeleteWeekSlot` is the documented success-on-slot-mutation exception (D-D3).
- Chart time-range pills: options 1m/6m/1y/all, default 6m, per-chart independent local `useState`, no cross-chart sync, no persistence (D-D4).
- New overlays use shadcn primitives: `Dialog` (centered) for desktop, `Drawer` (bottom-sheet, vaul) for mobile; responsive shells switch via `useMediaQuery('(min-width: 768px)')`. Exercise images render via `buildExerciseImageUrl` in a fixed aspect-ratio box with `loading="lazy"` (B2b).

## i18n & locale

- Bilingual ES/EN; for authenticated users `profile.language` is authoritative and is applied post-auth (the `ProfileLanguageSync` component, `src/features/i18n/`, mounted under `AuthProvider`); pre-auth and fallback chain is `localStorage → navigator → es` (D-E1).
- Both locales stay complete and in sync: every user-facing key exists in **both** `src/i18n/es/*` and `src/i18n/en/*` with a real translation — no English-only fallback strings in the ES bundle (and vice-versa). New copy adds the key to both bundles in the same change (D-E1).
- Stored content (recipe/ingredient/template names) is never auto-translated — stays as authored (D-E2).
- Metric-only (kg/cm/g); no imperial (the dead legacy `profiles.units` column was dropped 2026-05-18, R-14) (D-E3).
- Authenticated language change is Settings-only; the one-click `LanguageSwitcher` appears only on pre-auth and onboarding routes (removed from the `AppLayout` header) (D-E4).

## Theme

> ⚠ Changing — see R-33

- Theme is localStorage-only (key `hf-theme`), never profile-backed (D-F6).
- The `index.html` pre-paint IIFE and `ThemeProvider` `STORAGE_KEY`/system-resolution MUST stay identical — change one, change the other (D-F6).
