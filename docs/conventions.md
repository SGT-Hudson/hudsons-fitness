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
- Single-control, instant-apply settings (the Settings language + theme Selects) are controlled `<Select>`s, not RHF forms — they have no validated submit (theme is localStorage-only per D-F6).

## Types & macros

- DB-sourced rows stay snake_case end-to-end (D-C4).
- camelCase is reserved for computed/derived types — the `Macros` envelope is `{ kcal, proteinG, carbsG, fatG, fiberG }` (D-C4).
- BMR (Mifflin-St Jeor) and target-weight are derived; recompute, never persist (4 dead `tdee_estimates` columns still present; `mifflinStJeor` not yet wired as display) (D-B5).

> ⚠ Changing — see R-08

- Store `phases.fat_pct_of_kcal` as a fraction `0.10`–`0.60`, never a percent (D-B3).

## Data mutations

- Any operation mutating more than one table atomically MUST be an RPC; single-table mutations stay client-side (D-C5).
- All user-callable RPCs are `SECURITY INVOKER` with `set search_path = public`; `SECURITY DEFINER` is forbidden without a security review (cron-only `apply_template_to_week_admin` is the documented exception) (D-C5).
- Plan materialization is a single `SECURITY INVOKER` RPC (client/edge mirrors not yet removed) (D-D6).

> ⚠ Changing — see R-12

- Convert the fat fraction (and any unit/fraction) only at the form boundary via a shared helper, never inline `×100` (helper `fractionToPct`/`pctToFraction` in `src/lib/macros.ts`; the 3 inline sites now use it — rule satisfied in code; only the DB CHECK backstop remains, staged for the Wave-3 prod checkpoint) (D-B3).

> ⚠ Changing — see R-06

## UI

- Use the shadcn `Badge` component for badges (D-D1).
- Toasts fire from the layer that owns the mutation (usually `hooks.ts`); a component owning its own mutation flow (e.g. destructive confirm dialogs) calls toast directly; pages never call toast (D-D2).
- Success toasts only when the action is user-triggered AND low-frequency; high-frequency, background, or implicit mutations toast on error only; `useDeleteWeekSlot` is the documented success-on-slot-mutation exception (D-D3).
- Chart time-range pills: options 30d/90d/1y/all, default 90d, per-chart independent local `useState`, no cross-chart sync, no persistence (D-D4).

## i18n & locale

- Bilingual ES/EN; for authenticated users `profile.language` is authoritative and is applied post-auth (AuthProvider's profile→i18n sync); pre-auth and fallback chain is `localStorage → navigator → es` (D-E1).
- Stored content (recipe/ingredient/template names) is never auto-translated — stays as authored (D-E2).
- Metric-only (kg/cm/g); no imperial (`profiles.units` legacy column still present, slated for removal) (D-E3).

> ⚠ Changing — see R-14

- Authenticated language change is Settings-only; the one-click `LanguageSwitcher` appears only on pre-auth and onboarding routes (removed from the `AppLayout` header) (D-E4).

## Theme

- Theme is localStorage-only (key `hf-theme`), never profile-backed (D-F6).
- The `index.html` pre-paint IIFE and `ThemeProvider` `STORAGE_KEY`/system-resolution MUST stay identical — change one, change the other (D-F6).
