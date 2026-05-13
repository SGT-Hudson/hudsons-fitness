# Hudson's Fitness — Handoff

> Status as of: end of Sprint 5 (Objetivos/Fases), PR #8 merged to `main`.

## Quick status

App is bilingual (ES/EN) fitness tracker deployed to **https://hudsonfitness.vercel.app**.
Stack: React 18 + Vite + TS + Tailwind + shadcn/ui + Supabase + TanStack Query + react-i18next.
Repo: `SGT-Hudson/hudsons-fitness`. Dev branch: `claude/implement-fitness-architecture-DrnGF`.
Supabase project: `upvraruehzurbetzrxov` (EU Frankfurt, free tier).

---

## Done (8 PRs merged)

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

---

## Pending for v1 (recommended order)

### 0. Check sprint 5, code is not working as expected — **HIGH** (immediate)

- Cant save plans, error from supabase:
  could be related to `meal_plan_template_slots` having `time TIME` column with precision 3, and some input value having more than 3 decimal places in seconds, causing numeric overflow. Need to verify input values and possibly adjust column type or input formatting.
  {
  "code": "22003",
  "details": "A field with precision 4, scale 3 must round to an absolute value less than 10^1.",
  "hint": null,
  "message": "numeric field overflow"
  }

Also, go over the code from this last sprint and check for any other issues or edge cases that might have been missed during development.

### 1. Settings completos — **HIGH** (next sprint)

Currently SettingsPage only edits `display_name`. Need:

- **Language toggle**: ES/EN switcher that calls `i18n.changeLanguage()` AND saves to `profiles.language`
- **Units toggle**: kg/lb selector saved to `profiles.units`; affects display in ProgresoPage, OnboardingPage, MeasurementDialog
- **Edit biometrics**: sex, birth_date, height_cm, initial_weight_kg, bone_kg (all already in `profiles`)
- **Account section**: email (read-only), sign out

### 2. Progreso — gráficas — **HIGH**

ProgresoPage shows list + LatestMeasurementCard. Add:

- Weight trend chart with 5-day MA (view `body_measurements_smoothed` already exists, has `weight_kg_5day_avg` col)
- Body composition stacked area chart (body_fat_pct, muscle_pct, water_pct over time)
- (Optional) consumed vs planned kcal chart from `daily_nutrition_history` (needs Edge Function first)
- `recharts` already installed.

### 3. Toasts / feedback — **MEDIUM**

All mutations are silent. Add toast system:

- `@radix-ui/react-toast` already in package.json
- Need to add `src/components/ui/toast.tsx` + `toaster.tsx` from shadcn, wrap App with `<Toaster />`
- Then surface success/error from every mutation (create/update/delete)

### 4. Edge Functions + pg_cron — **MEDIUM**

For real historical data:

- `daily-nutrition-snapshot` — runs 02:00 CET, populates `daily_nutrition_history` for previous day from `meal_logs` (consumed) + plan slots (planned). Required for kcal trend chart.
- `weekly-rollover` — runs Mon 03:00 CET, archives weeks
- `recalculate-tdee` — computes TDEE from weight delta + intake; writes to `tdee_estimates`
- Without these, the `kcal_mode: 'tdee_delta'` phase mode in Objetivos returns `null` targets

### 5. Diario ↔ Plan integration — **LOW-MEDIUM**

When user opens `/diario/:date`, if no meal_logs exist for that day but plan slots do, optionally materialize them as logs (architecture §6.6 flow D). Decide: auto-materialize on open, or button "Aplicar plan a este día"?

### 6. GDPR — **LOW**

- Dont do this part: "Download my data" Edge Function (JSON export of all user-scoped tables)
- "Delete account" flow

### 7. Polish — **LOW**

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
- **Sprint order**: Fundamentos → Métricas → Polish/Deploy → 2A Ingredientes → 2B Recetas → 3 Diario → 4 Plantillas/Planificador → 5 Objetivos/Fases → (next: Settings)

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

> Continúo Hudson's Fitness donde lo dejamos. Lee `HANDOFF.md` en la raíz del repo para el estado completo. Próximo sprint: **Settings completos** (toggle idioma, toggle unidades, editar biometría). El repo está en `SGT-Hudson/hudsons-fitness`, branch `claude/implement-fitness-architecture-DrnGF`. Empieza confirmando el plan y luego procede.

The new session will read the file and pick up from Sprint 6 (Settings).

---

## Open questions for next session

- **Language toggle UX**: dropdown in header AND in Settings, or just Settings?
- **Units conversion**: store everything in metric (current) and convert at display? Or store in chosen units? (Recommend: metric in DB, convert at display)
- **Charts library config**: `recharts` is installed but no theme set up — use existing CSS vars (`--primary`, etc.) via inline `stroke="hsl(var(--primary))"`?
