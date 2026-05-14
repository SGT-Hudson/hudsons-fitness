# Hudson's Fitness — Handoff

> Status as of: Sprint 16 — GDPR delete-account (on `claude/implement-fitness-architecture-DrnGF`). v1 punch list complete.

## Quick status

App is bilingual (ES/EN) fitness tracker deployed to **https://hudsonfitness.vercel.app**.
Stack: React 18 + Vite + TS + Tailwind + shadcn/ui + Supabase + TanStack Query + react-i18next.
Repo: `SGT-Hudson/hudsons-fitness`. Dev branch: `claude/implement-fitness-architecture-DrnGF`.
Supabase project: `upvraruehzurbetzrxov` (EU Frankfurt, free tier).

---

## Done (15 PRs merged)

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

---

## Pending for v1

✅ All v1 work complete as of Sprint 16. Next candidate areas (post-v1):

- **Recipe photos** (postponed at MVP)
- **OFF mass import** for ingredients beyond per-row search
- **Mobile-specific UX polish** (touch targets, swipe nav on /diario)
- **Observability** — track edge-function errors / cron failures somewhere visible

Note: macros chart on /progreso will look mostly empty until `daily_nutrition_history` accumulates entries (cron started Sprint 9).

---

## Key user decisions (don't re-ask)

- **Default protein**: 1.6 g/kg (lean & sustainable)
- **Bone weight**: column on `profiles` (not per-measurement), set once at onboarding, range 0.5–20 kg
- **Measurement carry-over**: lazy with stale marker — no synthetic DB rows; amber banner when today has no entry
- **Past phases**: frozen once `end_date` passes (UI = read-only, dimmed)
- **Recipe deletion**: soft delete via `deleted_at` column + partial unique index `where deleted_at is null`
- **Ingredient duplicates**: tolerate (no dedup in MVP)
- **Recipe photos**: postponed to v1.1
- **Vercel URL**: `hudsonfitness.vercel.app` (not `hudsons-fitness`)
- **Units**: metric-only (kg, cm). No kg↔lb conversion in app. `profiles.units` column exists but is not surfaced in UI and is not used; treat as legacy.
- **Language toggle**: Settings only (no header switcher in main app — header switcher remains on OnboardingPage since it precedes Settings access).
- **`initial_weight_kg`**: read-only after onboarding (historical anchor for progress charts).
- **Charts**: composition chart shows interpolated values between measurements with data (user decision). Weight chart shows raw daily line + thick MA5 overlay. Time range pills 30d/90d/1y/all default to 90d. Composition Y-axis capped at 100%.
- **Toasts**: fired from mutation hooks (not from pages) via `@/lib/toast-helpers` (`toastSaved`, `toastDeleted`, `toastCreated`, `toastApplied`, `toastError`). Defaults: success 4 s, destructive 7 s, max 3 stacked. High-frequency planner slot add/update mutations only fire on error to avoid noise.
- **Sprint order**: Fundamentos → Métricas → Polish/Deploy → 2A Ingredientes → 2B Recetas → 3 Diario → 4 Plantillas/Planificador → 5 Objetivos/Fases → 6 Settings → 7 Progreso gráficas → 8 Toasts → 9 Edge Functions + pg_cron → 10 Diario↔Plan → (next: kcal-history chart on Progreso, or Polish: code-splitting + skeletons)
- **Plan = default truth**: any active-week slot for a date is automatically materialized into a `meal_log` with `from_plan=true` and `plan_week_slot_id=<slot.id>`. Dedup is by `plan_week_slot_id` so a deleted from_plan log is *not* recreated on reload. Two trigger points: (a) DiarioPage on mount/date-change via `useMaterializePlan`, (b) `daily-nutrition-snapshot` cron, so days never opened still have logs by the time history is computed. Slot→meal_type mapping uses `MEAL_TYPE_ORDER[meal_index]` (anything beyond index 4 falls back to `'other'`).
- **Edge functions runtime**: Deno + TypeScript (Supabase default). Shared code lives in `supabase/functions/_shared/`.
- **Cron schedules** (UTC): daily-nutrition-snapshot `0 1 * * *`, weekly-rollover `0 2 * * 1`, recalculate-tdee `0 3 * * *`. DST not corrected (1h drift summer/winter is acceptable for off-peak jobs).
- **TDEE math**: 14-day window, ≥10 days of intake required, 7700 kcal/kg, ±3-day tolerance for boundary weight measurements.
- **Cron auth**: cron→edge-function uses service-role key from Vault (`cron_service_role_key`). Operator must run `vault.create_secret(<key>, 'cron_service_role_key')` once before jobs do anything useful — until then, `cron.job_run_details` will show the helper raising "secret not set".

---

## Database state

**15 tables**, all with RLS enabled (security invoker, pinned search_path).

Auth-related: `profiles` (bone_kg here), `body_measurements` (no bone_kg)
Nutrition: `ingredients` (system-seeded 21 + user), `recipes` (deleted_at), `recipe_ingredients`, `meal_logs`
Goals/phases: `goals` (singleton per user, no `id`), `phases`, `tdee_estimates`, `daily_nutrition_history`
Planning: `meal_plan_templates`, `meal_plan_template_day_times`, `meal_plan_template_slots`, `meal_plan_weeks`, `meal_plan_week_slots`

**View**: `body_measurements_smoothed` (with `weight_kg_5day_avg`)

**RPCs** (4): `save_recipe`, `save_template`, `apply_template_to_week`, `save_week_as_template` — all SECURITY INVOKER, all atomic over multiple tables

**Extensions**: `pg_trgm`, `btree_gist` in `extensions` schema (not public)

### `phases` schema gotchas (learned from PR #9)

- `kcal_mode`: CHECK in (`'absolute'`, `'tdee_delta'`) — no `'fixed'`/`'per_kg'`
- `fiber_mode`: CHECK in (`'fixed_g'`, `'per_1000_kcal'`)
- `fat_pct_of_kcal`: `numeric(4,3)` — stored as **fraction** (0.10–0.60), not percent. UI converts at form boundary.
- Non-overlapping date ranges enforced via `EXCLUDE USING gist (user_id WITH =, daterange(...))` — overlapping phases will fail
- Canonical macro math lives in `src/lib/macros.ts` (`computeDailyMacroTargets`). `features/phases/targets.ts` is a thin wrapper around it.

> Before writing a form that inserts into any table, check `pg_constraint` for CHECK constraints and column `numeric_precision`/`numeric_scale` — `types/database.ts` types numeric enums as plain `string` and won't catch drift.

---

## Project conventions

### Forms

- **react-hook-form WITHOUT zodResolver** — `@hookform/resolvers` is NOT installed; use built-in validation via `register('field', { required, min, max, validate })` and `Controller` for shadcn Select/Textarea
- Form values typed as plain `type FormValues = { ... }` — no `z.infer<>` (zod is installed but unused)

### Badges

- No `Badge` component in `src/components/ui/`. Use inline Tailwind:
  ```tsx
  <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground">
    …
  </span>
  ```
- Variants:
  - primary: `bg-primary text-primary-foreground`
  - secondary: `bg-secondary text-secondary-foreground`
  - outline: `border border-border text-muted-foreground`

### shadcn components available (`src/components/ui/`)

button, card, dialog, input, label, select, tabs, textarea
**Missing**: badge, toast (need to add for v1), sheet, popover (radix popover IS installed)

### Data layer

- API in `src/features/<feature>/api.ts` — pure functions calling `supabase.from(...)`
- Hooks in `src/features/<feature>/hooks.ts` — `useQuery` / `useMutation` wrappers with auth + queryClient invalidation
- Types: import `Tables<'name'>`, `TablesInsert<'name'>`, `TablesUpdate<'name'>` from `@/types/database`

### i18n

- 10 namespaces: common, auth, nav, onboarding, metricas, ingredientes, recetas, diario, planning, objetivos
- Register new namespace in `src/i18n/index.ts` (resources + ns array)
- Use `t('key', { var: value })` for interpolation; pluralization via `_one` / `_other` keys

### Routes

All defined in `src/app/router.tsx`. Auth gates: `RequireAuth` → `RequireOnboarded` → `AppLayout`.

### Macros type

**camelCase** — `{ kcal, proteinG, carbsG, fatG, fiberG }` (NOT snake_case)
Defined in `@/features/recipes/macros.ts` along with `roundMacro`, `computeRecipeMacros`.

---

## Key file references

```
src/
├── app/router.tsx                              # All routes + auth gates
├── components/layout/AppLayout.tsx             # NAV_ITEMS array
├── features/
│   ├── auth/AuthProvider.tsx                   # useAuth() hook
│   ├── profile/api.ts                          # fetchProfile, updateProfile, isProfileOnboarded
│   ├── profile/hooks.ts                        # useProfile, useUpdateProfile
│   ├── measurements/                           # useLatestMeasurement, useRecentMeasurements, etc.
│   ├── ingredients/                            # OFF search + manual + import
│   ├── recipes/                                # listRecipes, saveRecipe RPC, soft-delete
│   ├── recipes/macros.ts                       # Macros type, computeRecipeMacros, roundMacro
│   ├── diario/                                 # meal_logs, MEAL_TYPE_ORDER, MealType
│   ├── diario/macros.ts                        # computeMealLogMacros, sumMacros
│   ├── templates/                              # save_template RPC, deleteTemplate
│   ├── planner/                                # fetchActiveWeek, apply_template_to_week RPC
│   ├── planning/components/                    # Shared SlotCell, WeekGrid, TemplateGrid, dialogs
│   ├── objetivos/                              # NEW Sprint 5 — goals singleton
│   └── phases/                                 # NEW Sprint 5 — phases CRUD + targets.ts
├── pages/
│   ├── DiarioPage.tsx                          # Uses useActivePhase + useLatestMeasurement
│   ├── ObjetivosPage.tsx                       # NEW Sprint 5
│   ├── PlanificadorPage.tsx                    # Active week + apply/swap/save-as-template
│   ├── PlantillasPage.tsx, PlantillaEditorPage.tsx
│   ├── RecetasPage.tsx, RecetaEditorPage.tsx
│   ├── IngredientesPage.tsx
│   ├── ProgresoPage.tsx                        # Has list, NEEDS charts
│   ├── ObjetivosPage.tsx
│   └── SettingsPage.tsx                        # ONLY display_name — NEEDS expansion
├── lib/
│   ├── supabase.ts                             # supabase client
│   ├── dates.ts                                # isoDate, formatDate, mondayOf, Locale type
│   └── utils.ts                                # cn() classnames helper
├── i18n/
│   ├── index.ts                                # Namespace registry
│   ├── es/*.json + en/*.json                   # 10 namespaces each
└── types/database.ts                           # Hand-written Supabase types (not generated)
```

---

## Workflow conventions

1. Always develop on `claude/implement-fitness-architecture-DrnGF`
2. `pnpm lint` + `pnpm build` MUST pass before pushing
3. Commit messages: `Sprint N: Title — short summary` followed by bullet points
4. Auto-merge enabled — PRs merge to main after CI
5. After merge, user pulls to local Windows clone at `D:\4. Claude\Code\Hudson's Fitness`

---

## How to resume in a new chat

Paste this prompt:

> Continua Hudson's Fitness donde lo dejamos. Lee `HANDOFF.md` en la raíz del repo para el estado completo. La v1 está completa hasta Sprint 16 (delete-account GDPR). El repo está en `SGT-Hudson/hudsons-fitness`, branch `claude/implement-fitness-architecture-DrnGF`. Pregúntame qué quiero hacer ahora.

---

## Sprint 9 operator notes

- Migration `20260514120000_sprint9_cron_and_jobs.sql` already applied to project `upvraruehzurbetzrxov`.
- Three edge functions deployed (`daily-nutrition-snapshot`, `weekly-rollover`, `recalculate-tdee`), three cron jobs scheduled.
- Vault secret `cron_service_role_key` already created (otherwise `cron.job_run_details` would surface "secret not set").
- Manual smoke test commands and full operator guide are in `supabase/README.md`.

## Sprint 16 operator notes

- Edge function `delete-account` lives in `supabase/functions/delete-account/`. Deploy with:
  `supabase functions deploy delete-account` (project `upvraruehzurbetzrxov`).
- Uses standard env vars only: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`. No vault secret needed.
- CASCADE chain: `auth.users.id` → `profiles.id` → all user-scoped tables. Deleting the auth user removes everything atomically.
- UI is already wired (destructive button in /settings → Account). Without the deployment, the dialog will toast an error from `supabase.functions.invoke`.
