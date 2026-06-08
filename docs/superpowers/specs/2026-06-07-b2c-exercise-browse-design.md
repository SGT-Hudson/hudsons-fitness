# B2c — Exercise browse page + filters + detail page — design spec

**Status: DESIGN PROPOSED (2026-06-07).** Third and last of the three B2
sub-projects (**B2a data → B2b detail component + in-workout popup → B2c browse
page + detail page**). Folds under **R-27 (Project B)** — no new R-id/D-id (one
roadmap follow-up is recorded in §11).

**Depends on B2a + B2b**, both merged to `develop`:
- B2a (`2026-06-06-b2a-exercise-instructions-data-design.md`, #164) — instruction
  columns, image backfill, `buildExerciseImageUrl`.
- B2b (`2026-06-07-b2b-exercise-detail-component-design.md`, #166) — the reusable
  presentational `ExerciseDetail({ exercise, density })`, `ExerciseImageLoop`,
  `ExerciseInfoButton`, `getExercise`/`useExercise`, `exerciseInstructions`.

B2c branches off `develop` (worktree `.claude/worktrees/b2c-exercise-browse`,
branch `claude/b2c-exercise-browse`) and PRs back to `develop` normally (§12).

This design was converged through a prose brainstorm on the four open questions
(filter UX, card content, lay-term aliases, detail-page actions); §3 records the
agreed decisions.

---

## 1. Goal

Turn the `/exercises` placeholder into a real **browse experience** over the
873-row curated catalog: a searchable, filterable card grid, and a deep-linkable
full-page detail view at `/exercises/:id`. B2c is the consumer that finally mounts
B2b's `full`-density `ExerciseDetail`. Pure frontend + one query extension — **no
schema changes, no migrations, no RPCs.**

## 2. Scope

**In scope**
- `ExercisesBrowsePage` mounted at `/exercises` (replacing `EnProgresoPage` there),
  with always-visible search, a filters sheet, applied-filter chips, a responsive
  card grid, and pagination.
- `ExerciseCard` — start-frame thumbnail + localized name + primary-muscle &
  equipment badges; navigates to `/exercises/:id`.
- `ExerciseFiltersSheet` — a panel (the **existing vaul `Drawer`** bottom-sheet, not
  a new Sheet primitive — `sheet.tsx` doesn't exist and `Drawer` is already in the
  tree from B2b) holding four controls: category, equipment, level (single-select
  dropdowns) and muscle (the picker's grouped optgroup pattern). *("Sheet" in the
  brainstorm meant a slide-in filter panel; reusing `Drawer` honors that intent
  without a new dependency — the same kind of refinement B2b made.)*
- `AppliedFilterChips` — removable chips under the search bar reflecting active
  filters + a "clear all".
- `ExerciseDetailPage` mounted at `/exercises/:id` — back button +
  `ExerciseDetail` (`density='full'`) + loading skeleton + not-found state.
  Read-only.
- A paginated, filterable search path: `searchExercisesPaged` (api) +
  `useExercisesBrowse` (hook) returning `{ rows, total }`, reusing the existing
  filter/order builder. Adds category / equipment / level filters (the picker
  already does text + muscle).
- `CATEGORY_VALUES` / `LEVEL_VALUES` constants + new `entrenamiento` i18n keys
  (`browse.*`, `exerciseDialog.category.*`, `exerciseDialog.level.*`); reuse of the
  existing `exerciseDialog.equipment.*` / `exerciseDialog.muscle.*` label maps.
- Tier-1/Tier-2 tests for the card, filters sheet, applied chips, browse page (with
  a mocked browse hook), and the detail page's loading/found/not-found paths.

**Out of scope (deferred — see §11)**
- **Lay-term search aliases** (typing "abs"→core, "biceps"→arms): dropped from B2c,
  recorded as a roadmap follow-up. The muscle filter already covers the precise
  "show me core exercises" case; text search already matches exercise + muscle
  names in both languages.
- **"Add to session/routine" from the detail page**: deferred. Adding to a workout
  stays the picker's job inside the runner/editors; a cross-context "add" from a
  standalone page is its own project (which session? which routine? create one?).
- A grid/list **view toggle** (Recetas has one) — grid only for B2c.
- Sort controls — keep the existing default order (verified first, then
  alphabetical on `name_es`).
- Any change to the exercise schema, RLS, or the `ExerciseDetail`/`ImageLoop`
  internals (B2b owns those).

## 3. Locked design decisions

From the original B2 brainstorm and this B2c session:

1. **Browse = `/exercises`** (repurpose the placeholder; route + Dumbbell nav entry
   already exist in `nav-config.ts`, no plumbing to invent). **Detail =
   `/exercises/:id`**, full page, deep-linkable, **read-only**.
2. **Filters live in a slide-in panel** (the existing vaul `Drawer`), not inline.
   Search box is always visible; the four filters open in the panel; applied
   filters show as removable chips under the search. Rationale: muscle alone is 6
   groups / 24 codes, too much for inline chips on mobile.
3. **Card = thumbnail + name + primary-muscle badge + equipment badge.** Level is
   *not* on the card (shown on the detail page). Tap → `/exercises/:id` (full page,
   **not** the B2b popup — the popup stays the in-workout affordance).
4. **No lay-term alias map in B2c** (deferred, §11).
5. **Detail page has no actions** — back button + the view only.
6. **Grid only** (no list toggle), **no sort controls** (default order kept).

## 4. Routes & navigation

`src/app/router.tsx`:
- `/exercises` → `<ExercisesBrowsePage />` (was `<EnProgresoPage />`).
- `/exercises/:id` → `<ExerciseDetailPage />` (new child route, same auth-gated
  layout as the other training routes).

Both pages live under the existing authenticated `entreno`-section layout. The
`exercises` nav item already exists (`nav-config.ts`, Dumbbell icon, `mobile:true`)
and lights up automatically once the page renders real content — **no nav change**.
`/exercises` is `EnProgresoPage`'s only router reference, so swapping the element
makes its import dead — remove the import (the `EnProgresoPage.tsx` file stays; its
own test still uses it).

## 5. Components

All new components live under `src/features/training/` (page-level wrappers may live
in `src/pages/` to match the existing convention — the plan picks the exact split;
the browse page follows whichever home `RecetasPage`/`IngredientesPage` use).

### 5.1 `ExercisesBrowsePage`
Owns the browse state and layout. Composition top-to-bottom:
- **Header**: page title + short subtitle (`browse.title` / `browse.subtitle`).
- **Search row**: a debounced `Input` (200 ms, mirroring the picker) + a "Filters"
  `Button` (with an active-count badge when filters are applied).
- **Applied chips**: `AppliedFilterChips` (rendered only when ≥1 filter active).
- **Grid**: responsive 1 / 2 / 3 columns of `ExerciseCard`; a loading skeleton grid
  on first load, an empty state when the result set is 0.
- **Footer**: `PaginationBar` (existing) wired to `usePagination` (existing; page
  sizes 5 / 10 / 20 / 50, default 10, persisted globally — reuse as-is, do not
  invent new sizes).

State: `query` (debounced), `filters` (`{ category, equipment, level, muscle }`,
each nullable; muscle uses the picker's `'' | <fineCode> | group:<group>`
convention), and pagination (`page`, `pageSize`). **Pagination is server-side**:
`usePagination({ total: data?.total ?? 0, resetKey })` produces `page`/`pageSize`,
which feed `useExercisesBrowse` (§6); the hook returns `{ rows, total }` and `total`
flows back into `usePagination` for `pageCount`/clamping. Changing search or any
filter resets to page 1 via the `resetKey`.

### 5.2 `ExerciseCard`
Pure presentational. Props: `{ exercise: Exercise }`. Renders the start-frame
thumbnail via `buildExerciseImageUrl(exercise.images[0])` inside a fixed
aspect-ratio box (graceful 0-image fallback — a neutral placeholder, same approach
as `ExerciseImageLoop`'s empty state), the localized name
(`exerciseDisplayName(ex, lang)`), and two `Badge`s: primary muscle
(`exerciseDialog.muscle.<code>`) + equipment (`exerciseDialog.equipment.<eq>`,
hidden when equipment is null). The whole card is a single link to
`/exercises/:id` (React Router `Link`); no nested interactive elements.

### 5.3 `ExerciseFiltersSheet`
A shadcn **Sheet** (side sheet) opened by the Filters button. Holds four labeled
controls:
- **Category** — single-select over `CATEGORY_VALUES`, labels
  `exerciseDialog.category.<value>`. Values are stored raw, so codes are the raw
  strings (`'olympic weightlifting'`, etc.).
- **Equipment** — single-select over `EQUIPMENT_VALUES` (existing), labels
  `exerciseDialog.equipment.<eq>`.
- **Level** — single-select over `LEVEL_VALUES` (`beginner`/`intermediate`/`expert`),
  labels `exerciseDialog.level.<value>`.
- **Muscle** — the grouped optgroup `<select>` lifted from `ExercisePicker`
  (All / per-group "All in …" / fine codes via `MUSCLE_GROUPS` + `codesInGroup`).
  The shared optgroup markup should be **extracted into a small reusable
  `MuscleSelect`** so the picker and the sheet don't duplicate it (a targeted
  improvement, in scope).

Each control has an "All" / empty option. Selecting flows up via `onChange`; the
sheet is a controlled component over the page's `filters` state. A "Clear all"
action resets every filter. (Sheet vs Dialog primitive: prefer shadcn **Sheet** if
present; the plan adds it if missing, the same way B2b added `Drawer`.)

### 5.4 `AppliedFilterChips`
Given the active `filters`, renders one removable `Badge`/chip per non-empty filter
(localized label, e.g. "Chest", "Barbell"), each with an `X` to clear just that
filter, plus a "Clear all". Hidden entirely when no filters are active.

### 5.5 `ExerciseDetailPage`
Mounted at `/exercises/:id`. Reads `:id` from the route, calls `useExercise(id)`
(B2b), and renders:
- a **back button** (history back, falling back to `/exercises`),
- on success: `<ExerciseDetail exercise={data} density="full" />`,
- on loading: a skeleton (reuse B2b's loading treatment / a simple skeleton),
- on error / no row (`useExercise` resolves to a not-found): a friendly
  not-found block (`browse.notFound.*`) with a link back to `/exercises`.

No edit/add actions. Deep-linkable and shareable.

## 6. Data layer

`src/features/training/exercises/api.ts` + `hooks.ts`.

**Filter values (new constants):**
```
CATEGORY_VALUES = ['strength','stretching','plyometrics','powerlifting',
                   'strongman','olympic weightlifting','cardio']  // raw, stored as-is
LEVEL_VALUES    = ['beginner','intermediate','expert']           // raw
```
(`EQUIPMENT_VALUES` already exists.) User-created (`source='manual'`) rows may have
null category/level/equipment; a null value simply never matches a chosen filter
(an active filter is a hard AND), which is the intended behaviour.

**Search extension.** Today `searchExercises(query, opts)` returns `Exercise[]`
with `limit`, and the picker's `useExerciseSearch` consumes it. To avoid disturbing
the picker, **extract the shared query-building** (the muscle/group/text OR-term
construction + ordering) into an internal helper, then add a **new paginated path**:

```
searchExercisesPaged(params): Promise<{ rows: Exercise[]; total: number }>
  params: { query, category, equipment, level, muscleValue, textMuscles, page, pageSize }
  // muscleValue is the picker convention ('' | <fineCode> | `group:<g>`), split
  // internally into a contains (fine) or overlaps (group) filter.
```
Implementation notes:
- Build with `.select('*', { count: 'exact' })` and `.range(from, to)` for the page
  window; `total` comes from the PostgREST count.
- `category` / `equipment` / `level` are `.eq(...)` filters when set.
- `muscle` reuses the existing contains / overlaps logic (single fine code →
  `contains`; `group:<g>` → `overlaps(codesInGroup(g))`); `query` reuses the
  sanitized `name_es`/`name_en` ilike OR (and the existing `textMuscles` matching
  so typing a muscle name still works).
- Keep the existing order: `is_verified` desc, then `name_es`.
- ⚠ PostgREST array operators (`contains`/`overlaps`) and the count option escape
  the TS typecheck — they must be verified on the **db-test (Tier-3) CI**, not just
  locally (per the project's standing integration-gap note).

**Hook:** `useExercisesBrowse(params)` → `useQuery` keyed on every input that
changes the result (`['exercises','browse', query, category, equipment, level,
muscleValue, textMuscles, page, pageSize]` — `textMuscles` is included because it
changes the rows), `placeholderData: (prev) => prev` to avoid grid flash between
pages, returning `{ rows, total }`. The picker's `useExerciseSearch`/`searchExercises`
stay untouched.

**Pagination wiring (hook-order note).** `usePagination` runs before
`useExercisesBrowse` (it produces `page`/`pageSize`), so it can't read the same
render's `total`. The page holds `total` in state and feeds the resolved count back
via an effect, giving `usePagination` a real total for `pageCount`/clamping.

## 7. i18n

New keys under the `entrenamiento` namespace (ES canonical, EN added; `fallbackLng:
'es'`):
- `browse.title`, `browse.subtitle`, `browse.searchPlaceholder`, `browse.filters`,
  `browse.clearAll`, `browse.empty`, `browse.resultCount` (optional),
  `browse.notFound.title`, `browse.notFound.body`, `browse.notFound.back`,
  `browse.back`.
- `exerciseDialog.category.<value>` for the 7 categories (keys may need escaping for
  `'olympic weightlifting'` — use a slug key like `olympic_weightlifting` mapped
  from the raw value).
- `exerciseDialog.level.<value>` for `beginner` / `intermediate` / `expert`.
- Reuse existing `exerciseDialog.muscle.*` and `exerciseDialog.equipment.*`.

## 8. States & edge cases

- **Empty result** (search/filters match nothing): a friendly empty block, not a
  bare grid.
- **First load**: skeleton card grid (no layout shift — fixed card height).
- **Bad `:id` / deleted row**: detail page not-found block (no crash, no infinite
  spinner). `useExercise` already throws on a missing single row — surface it as
  not-found.
- **0-image exercise**: card and detail both render the neutral placeholder
  (existing `ImageLoop` empty handling).
- **Null category/level/equipment** rows: excluded by an active filter on that
  dimension; equipment badge hidden on the card when null.
- **Page out of range** after filtering: pagination resets to page 1 on any
  query/filter change.

## 9. Testing (TDD, ultracode)

Per the project's component-test rule, **mock the data hooks** so CI has no Supabase
env (the green-local/red-CI trap). Coverage:
- `ExerciseCard`: renders name/badges, hides equipment badge when null, links to the
  right `/exercises/:id`, 0-image fallback.
- `MuscleSelect` / `ExerciseFiltersSheet`: renders groups + fine codes, emits the
  right values, "clear all" resets.
- `AppliedFilterChips`: one chip per active filter, removing one clears only it,
  hidden when none active.
- `ExercisesBrowsePage`: with a mocked `useExercisesBrowse`, renders the grid, empty
  state, pagination interaction, and that changing a filter resets to page 1.
- `ExerciseDetailPage`: loading → skeleton, success → `ExerciseDetail`, error →
  not-found (mock `useExercise`).
- Pure helpers (`searchExercisesPaged` query composition / new constants) unit
  tested where they don't require a live DB; the PostgREST array/count behaviour is
  verified on **db-test (Tier-3)** with a small added assertion or by exercising the
  existing exercise pgTAP/integration path.

## 10. Living-docs updates (post-merge, via the docs-audit flow)

- `docs/roadmap.md` R-27: mark B2c built; Project B complete.
- `docs/features.md`: document the exercise browse + detail pages.
- `docs/architecture.md` / `docs/conventions.md`: note the browse page pattern +
  `MuscleSelect` extraction if it sets a precedent.
- `docs/changelog.md`: B2c entry on release.

## 11. Follow-ups (new backlog)

- **Lay-term search aliases** — a curated bilingual map (lay/slang term → muscle
  code(s) / exercise keywords) feeding the browse + picker search. Deferred from
  B2c as fuzzy, hand-tuned infrastructure with unclear payoff while name + muscle
  search already cover the common cases. Add as a roadmap item (next free `R-2x`).
- **"Add to session/routine" from the detail page** — a cross-context add action;
  revisit if browsing-then-adding becomes a real flow.

## 12. Ship flow

Standard: `claude/b2c-exercise-browse` → PR into `develop` → CI (lint + build +
test, plus Tier-3 db-test for the query change) → squash auto-merge. No release to
`main` as part of B2c unless explicitly requested; B2c rides the next `release/*`.
