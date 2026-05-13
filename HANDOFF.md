# Hudson's Fitness — Handoff

> Status as of: Sprint 6 — Settings completos (in progress on `claude/implement-fitness-architecture-DrnGF`).

## Quick status

App is bilingual (ES/EN) fitness tracker deployed to **https://hudsonfitness.vercel.app**.
Stack: React 18 + Vite + TS + Tailwind + shadcn/ui + Supabase + TanStack Query + react-i18next.
Repo: `SGT-Hudson/hudsons-fitness`. Dev branch: `claude/implement-fitness-architecture-DrnGF`.
Supabase project: `upvraruehzurbetzrxov` (EU Frankfurt, free tier).

---

## Done (9 PRs merged)

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

---

## Pending for v1 (recommended order)

### 1. Progreso — gráficas — **HIGH** (next sprint)

ProgresoPage shows list + LatestMeasurementCard. Add:

- Weight trend chart with 5-day MA (view `body_measurements_smoothed` already exists, has `weight_kg_5day_avg` col)
- Body composition stacked area chart (body_fat_pct, muscle_pct, water_pct over time)
- (Optional) consumed vs planned kcal chart from `daily_nutrition_history` (needs Edge Function first)
- `recharts` already installed.

### 2. Toasts / feedback — **MEDIUM**

All mutations are silent. Add toast system:

- `@radix-ui/react-toast` already in package.json
- Need to add `src/components/ui/toast.tsx` + `toaster.tsx` from shadcn, wrap App with `<Toaster />`
- Then surface success/error from every mutation (create/update/delete)

### 3. Edge Functions + pg_cron — **MEDIUM**

For real historical data:

- `daily-nutrition-snapshot` — runs 02:00 CET, populates `daily_nutrition_history` for previous day from `meal_logs` (consumed) + plan slots (planned). Required for kcal trend chart.
- `weekly-rollover` — runs Mon 03:00 CET, archives weeks
- `recalculate-tdee` — computes TDEE from weight delta + intake; writes to `tdee_estimates`
- Without these, the `kcal_mode: 'tdee_delta'` phase mode in Objetivos returns `null` targets

### 4. Diario ↔ Plan integration — **LOW-MEDIUM**

When user opens `/diario/:date`, if no meal_logs exist for that day but plan slots do, optionally materialize them as logs (architecture §6.6 flow D). Decide: auto-materialize on open, or button "Aplicar plan a este día"?

### 5. GDPR — **LOW**

- Dont do this part: "Download my data" Edge Function (JSON export of all user-scoped tables)
- "Delete account" flow

### 6. Polish — **LOW**

- Loading skeletons (currently just text "loading…")
- Dark mode toggle (CSS vars already set up, just need a switcher)
- PWA manifest + service worker (offline support)
- Code splitting (current bundle ~233 KB gzipped)

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
- **Sprint order**: Fundamentos → Métricas → Polish/Deploy → 2A Ingredientes → 2B Recetas → 3 Diario → 4 Plantillas/Planificador → 5 Objetivos/Fases → 6 Settings → (next: Progreso gráficas)

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

> Continua Hudson's Fitness donde lo dejamos. Lee `HANDOFF.md` en la raíz del repo para el estado completo. Próximo sprint: **Progreso — gráficas** (weight trend con MA5, composición corporal stacked area). El repo está en `SGT-Hudson/hudsons-fitness`, branch `claude/implement-fitness-architecture-DrnGF`. Empieza confirmando el plan y luego procede.

The new session will read the file and pick up from Sprint 7 (Progreso gráficas).

---

## Open questions for next session

- **Charts library config**: `recharts` is installed but no theme set up — use existing CSS vars (`--primary`, etc.) via inline `stroke="hsl(var(--primary))"`?
- **Composition chart**: stacked area with body_fat_pct/muscle_pct/water_pct — what to do with measurements that only have weight (most fields nullable)? Skip vs interpolate?
