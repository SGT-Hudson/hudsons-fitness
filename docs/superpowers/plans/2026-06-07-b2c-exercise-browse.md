# B2c — Exercise Browse Page + Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/exercises` placeholder with a searchable, filterable card-grid browse page over the 873-exercise catalog, plus a deep-linkable read-only detail page at `/exercises/:id` that reuses B2b's `ExerciseDetail`.

**Architecture:** Pure frontend on top of B2a/B2b. One data-layer extension adds a server-side paginated, filterable search (`searchExercisesPaged` + `useExercisesBrowse`) alongside the untouched picker search; the page composes a debounced search box, a filters `Drawer`, removable applied-filter chips, an `ExerciseCard` grid, and the existing `usePagination`/`PaginationBar`. The detail page wraps `ExerciseDetail density="full"` with loading/not-found states.

**Tech Stack:** React 18, TypeScript, Vite, React Router, TanStack Query, Supabase/PostgREST, Tailwind + shadcn/ui (existing `Drawer`, `Dialog`, `Card`, `Badge`, `Input`, `Button`, `Skeleton`, `PaginationBar`), Vitest + Testing Library, i18next.

**Spec:** `docs/superpowers/specs/2026-06-07-b2c-exercise-browse-design.md`

**Branch / worktree:** `claude/b2c-exercise-browse` at `.claude/worktrees/b2c-exercise-browse` (off `develop`, at B2b #166).

**Conventions to honor:**
- Component tests **mock the data hooks** (`useExercisesBrowse`, `useExercise`) and `@/lib/supabase` — never hit a real DB (the green-local/red-CI env trap).
- Tests use real i18n: `import '@/i18n'; import i18n from '@/i18n';` then `await i18n.changeLanguage('es')`; assert against Spanish strings.
- Components that use `<Link>`/`useNavigate`/`useParams` must be wrapped in `<MemoryRouter>` in tests.
- PostgREST array operators (`contains`/`overlaps`) and the `count` option escape the TS typecheck — they are verified on Tier-3 db-test CI, not locally. Don't trust a green local run alone for those.
- Run the full suite with `corepack pnpm test` (see [wsl-session-toolchain]); `corepack pnpm install` once in this worktree first (vaul/etc. already in lockfile).

---

## File Structure

**Create:**
- `src/features/training/components/MuscleSelect.tsx` — the grouped muscle `<select>` extracted from `ExercisePicker` (one responsibility: render the All/group/fine-code optgroup select).
- `src/features/training/components/MuscleSelect.test.tsx`
- `src/features/training/components/ExerciseCard.tsx` — one card (thumbnail + name + 2 badges, links to detail).
- `src/features/training/components/ExerciseCard.test.tsx`
- `src/features/training/components/AppliedFilterChips.tsx` — removable chips + clear-all.
- `src/features/training/components/AppliedFilterChips.test.tsx`
- `src/features/training/components/ExerciseFilters.tsx` — the filters `Drawer` (category/equipment/level/muscle controls).
- `src/features/training/components/ExerciseFilters.test.tsx`
- `src/pages/ExercisesPage.tsx` — the browse page (state + layout).
- `src/pages/ExercisesPage.test.tsx`
- `src/pages/ExerciseDetailPage.tsx` — the `/exercises/:id` page.
- `src/pages/ExerciseDetailPage.test.tsx`

**Modify:**
- `src/features/training/exercises/api.ts` — add `CATEGORY_VALUES`, `LEVEL_VALUES`, `categorySlug`, extract `buildExerciseQuery`, add `searchExercisesPaged` + types.
- `src/features/training/exercises/api.test.ts` — add `searchExercisesPaged` builder assertions.
- `src/features/training/exercises/hooks.ts` — add `useExercisesBrowse`.
- `src/features/training/exercises/hooks.test.ts` (create if absent) — `useExercisesBrowse` contract.
- `src/features/training/components/ExercisePicker.tsx` — use `MuscleSelect` (no behavior change).
- `src/i18n/es/entrenamiento.json`, `src/i18n/en/entrenamiento.json` — add `browse.*`, `exerciseDialog.category.*`, `exerciseDialog.level.*`.
- `src/app/router.tsx` — point `/exercises` at `ExercisesPage`, add `/exercises/:id`.

---

## Task 1: Filter constants + category slug helper

**Files:**
- Modify: `src/features/training/exercises/api.ts`
- Test: `src/features/training/exercises/api.test.ts`

- [ ] **Step 1: Write the failing test** — append to `api.test.ts`:

```ts
import { CATEGORY_VALUES, LEVEL_VALUES, categorySlug } from './api';

describe('browse filter constants', () => {
  it('exposes the 7 raw catalog categories', () => {
    expect(CATEGORY_VALUES).toEqual([
      'strength', 'stretching', 'plyometrics', 'powerlifting',
      'strongman', 'olympic weightlifting', 'cardio',
    ]);
  });
  it('exposes the 3 levels', () => {
    expect(LEVEL_VALUES).toEqual(['beginner', 'intermediate', 'expert']);
  });
  it('slugifies a category for i18n keys (space → underscore)', () => {
    expect(categorySlug('olympic weightlifting')).toBe('olympic_weightlifting');
    expect(categorySlug('strength')).toBe('strength');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test src/features/training/exercises/api.test.ts`
Expected: FAIL — `CATEGORY_VALUES` / `LEVEL_VALUES` / `categorySlug` are not exported.

- [ ] **Step 3: Add the constants + helper** to `api.ts` (near `EQUIPMENT_VALUES`):

```ts
/** Raw `category` strings as stored at ingest (free-exercise-db, un-mapped). */
export const CATEGORY_VALUES = [
  'strength', 'stretching', 'plyometrics', 'powerlifting',
  'strongman', 'olympic weightlifting', 'cardio',
] as const;
export type Category = (typeof CATEGORY_VALUES)[number];

/** Raw `level` strings as stored at ingest. */
export const LEVEL_VALUES = ['beginner', 'intermediate', 'expert'] as const;
export type Level = (typeof LEVEL_VALUES)[number];

/** i18n-key-safe slug for a category (the raw value has a space). */
export function categorySlug(value: string): string {
  return value.replace(/\s+/g, '_');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test src/features/training/exercises/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/training/exercises/api.ts src/features/training/exercises/api.test.ts
git commit -m "feat(B2c): add category/level filter constants + category slug helper"
```

---

## Task 2: Server-side paginated, filterable search

**Files:**
- Modify: `src/features/training/exercises/api.ts`
- Test: `src/features/training/exercises/api.test.ts`

Extract the shared WHERE/ORDER builder out of `searchExercises` so both the picker path (limit) and the browse path (count + range) compose identically, then add `searchExercisesPaged`.

- [ ] **Step 1: Write the failing test** — append to `api.test.ts`. Add a self-contained `pagedBuilder` factory (modeled on the file's existing per-call `searchBuilder` factory — there is no shared top-level builder object) that captures `select` options, `eq`, `contains`/`overlaps`, `or`, `order`, and `range`, resolving with `{ data, count, error }`:

```ts
import { searchExercisesPaged } from './api';

function pagedBuilder(rows: unknown[], count: number) {
  const captured = {
    selectArgs: [] as unknown[][],
    eq: [] as unknown[][],
    contains: [] as unknown[][],
    overlaps: [] as unknown[][],
    or: [] as string[],
    order: [] as unknown[][],
    range: [] as number[][],
  };
  const b: Record<string, unknown> = {};
  b.select = (...a: unknown[]) => { captured.selectArgs.push(a); return b; };
  b.eq = (c: string, v: unknown) => { captured.eq.push([c, v]); return b; };
  b.contains = (c: string, v: unknown) => { captured.contains.push([c, v]); return b; };
  b.overlaps = (c: string, v: unknown) => { captured.overlaps.push([c, v]); return b; };
  b.or = (s: string) => { captured.or.push(s); return b; };
  b.order = (...a: unknown[]) => { captured.order.push(a); return b; };
  b.range = (from: number, to: number) => { captured.range.push([from, to]); return Promise.resolve({ data: rows, count, error: null }); };
  return { b, captured };
}

describe('searchExercisesPaged', () => {
  it('requests an exact count + right page window + verified-first order, returns rows + total', async () => {
    const { b, captured } = pagedBuilder([{ id: 'a' }], 42);
    from.mockReturnValue(b);
    const res = await searchExercisesPaged({
      query: '', category: null, equipment: null, level: null,
      muscleValue: '', textMuscles: [], page: 2, pageSize: 10,
    });
    expect(captured.selectArgs[0]).toEqual(['*', { count: 'exact' }]);
    expect(captured.range).toContainEqual([10, 19]); // page 2, size 10 → rows 10..19
    // pin the shared builder's ordering contract (verified first, then name_es):
    expect(captured.order[0]).toEqual(['is_verified', { ascending: false }]);
    expect(captured.order[1]).toEqual(['name_es']);
    expect(res).toEqual({ rows: [{ id: 'a' }], total: 42 });
  });

  it('applies category/equipment/level as eq filters when set', async () => {
    const { b, captured } = pagedBuilder([], 0);
    from.mockReturnValue(b);
    await searchExercisesPaged({
      query: '', category: 'strength', equipment: 'barbell', level: 'beginner',
      muscleValue: '', textMuscles: [], page: 1, pageSize: 10,
    });
    expect(captured.eq).toContainEqual(['category', 'strength']);
    expect(captured.eq).toContainEqual(['equipment', 'barbell']);
    expect(captured.eq).toContainEqual(['level', 'beginner']);
  });

  it('a single fine muscle → contains; a group: value → overlaps', async () => {
    const g = pagedBuilder([], 0);
    from.mockReturnValue(g.b);
    await searchExercisesPaged({
      query: '', category: null, equipment: null, level: null,
      muscleValue: 'group:arms', textMuscles: [], page: 1, pageSize: 10,
    });
    expect(g.captured.overlaps.length).toBe(1);
    expect(g.captured.overlaps[0][0]).toBe('primary_muscles');

    const s = pagedBuilder([], 0);
    from.mockReturnValue(s.b);
    await searchExercisesPaged({
      query: '', category: null, equipment: null, level: null,
      muscleValue: 'pec_lower', textMuscles: [], page: 1, pageSize: 10,
    });
    expect(s.captured.contains).toContainEqual(['primary_muscles', ['pec_lower']]);
  });

  it('builds the name + textMuscles OR clause from the query', async () => {
    const { b, captured } = pagedBuilder([], 0);
    from.mockReturnValue(b);
    await searchExercisesPaged({
      query: 'press', category: null, equipment: null, level: null,
      muscleValue: '', textMuscles: ['pec_lower'], page: 1, pageSize: 10,
    });
    expect(captured.or[0]).toContain('name_es.ilike.%press%');
    expect(captured.or[0]).toContain('name_en.ilike.%press%');
    expect(captured.or[0]).toContain('primary_muscles.cs.{pec_lower}');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test src/features/training/exercises/api.test.ts`
Expected: FAIL — `searchExercisesPaged` not exported.

- [ ] **Step 3: Refactor + implement** in `api.ts`. Replace the body of `searchExercises` to use a shared builder, and add `searchExercisesPaged`. Import `codesInGroup` from `@/core/muscles` (the file already imports `MUSCLE_CODES`, `MUSCLES` from there).

```ts
import { MUSCLE_CODES, MUSCLES, codesInGroup, MUSCLE_GROUPS } from '@/core/muscles';
// ...

export interface ExerciseFilterOptions {
  query?: string;
  category?: string | null;
  equipment?: Equipment | null;
  level?: string | null;
  muscle?: PrimaryMuscle | null;     // hard AND contains
  groupMuscles?: PrimaryMuscle[];    // AND overlap
  textMuscles?: PrimaryMuscle[];     // OR'd with name terms
}

/**
 * Apply the shared WHERE + ORDER for every exercise pool query. Returns the
 * builder for the caller to finish with `.limit()` or `.range()`. The PostgREST
 * array operators here escape the typecheck — verified on Tier-3 db-test CI.
 */
function buildExerciseQuery<B>(builder: B, opts: ExerciseFilterOptions): B {
  const {
    query = '', category = null, equipment = null, level = null,
    muscle = null, groupMuscles = [], textMuscles = [],
  } = opts;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let b: any = builder;
  if (category) b = b.eq('category', category);
  if (equipment) b = b.eq('equipment', equipment);
  if (level) b = b.eq('level', level);
  if (muscle) b = b.contains('primary_muscles', [muscle]);
  if (groupMuscles.length > 0) b = b.overlaps('primary_muscles', groupMuscles);

  const safe = query.trim().replace(/[%_,]/g, '');
  const terms: string[] = [];
  if (safe !== '') terms.push(`name_es.ilike.%${safe}%`, `name_en.ilike.%${safe}%`);
  for (const code of textMuscles) terms.push(`primary_muscles.cs.{${code}}`);
  if (terms.length > 0) b = b.or(terms.join(','));

  return b.order('is_verified', { ascending: false }).order('name_es') as B;
}

export async function searchExercises(
  query: string,
  opts: ExerciseSearchOptions = {},
): Promise<Exercise[]> {
  const { limit = 20, muscle = null, textMuscles = [], groupMuscles = [] } = opts;
  const builder = buildExerciseQuery(supabase.from('exercises').select('*'), {
    query, muscle, textMuscles, groupMuscles,
  });
  const { data, error } = await builder.limit(limit);
  if (error) throw error;
  return data ?? [];
}

export interface ExerciseBrowseParams {
  query: string;
  category: string | null;
  equipment: Equipment | null;
  level: string | null;
  /** picker convention: '' | <fineCode> | `group:<group>` */
  muscleValue: string;
  textMuscles: PrimaryMuscle[];
  page: number;
  pageSize: number;
}

/** Server-side paged + filtered pool query for the browse page. */
export async function searchExercisesPaged(
  params: ExerciseBrowseParams,
): Promise<{ rows: Exercise[]; total: number }> {
  const { query, category, equipment, level, muscleValue, textMuscles, page, pageSize } = params;

  const isGroup = muscleValue.startsWith('group:');
  const groupKey = isGroup ? muscleValue.slice('group:'.length) : null;
  const muscle = !isGroup && muscleValue !== '' ? (muscleValue as PrimaryMuscle) : null;
  const groupMuscles = groupKey
    ? (codesInGroup(groupKey as (typeof MUSCLE_GROUPS)[number]) as PrimaryMuscle[])
    : [];

  const builder = buildExerciseQuery(
    supabase.from('exercises').select('*', { count: 'exact' }),
    { query, category, equipment, level, muscle, groupMuscles, textMuscles },
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await builder.range(from, to);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}
```

(Keep the existing `ExerciseSearchOptions` interface; `searchExercises` behavior and its existing tests must stay green.)

- [ ] **Step 4: Run the full exercises api + picker tests**

Run: `corepack pnpm test src/features/training/exercises/api.test.ts src/features/training/components/ExercisePicker.test.tsx`
Expected: PASS (new `searchExercisesPaged` cases + unchanged `searchExercises` cases).

- [ ] **Step 5: Commit**

```bash
git add src/features/training/exercises/api.ts src/features/training/exercises/api.test.ts
git commit -m "feat(B2c): server-side paged/filterable exercise search (shared query builder)"
```

---

## Task 3: `useExercisesBrowse` hook

**Files:**
- Modify: `src/features/training/exercises/hooks.ts`
- Test: `src/features/training/exercises/hooks.test.tsx` (extend — it already exists and tests `useExercise`; do NOT create a new `.ts` file, the test body uses JSX)

- [ ] **Step 1: Extend the existing test.** `hooks.test.tsx` already mocks `@/lib/supabase` and `./api` with `{ getExercise }` only, and defines a `wrapper`. (1) Widen its `./api` mock factory to also expose `searchExercisesPaged`, (2) add the spy + its reset alongside `getExercise`, (3) append the new `describe`. Concretely:

Change the existing `./api` mock line:
```ts
const getExercise = vi.fn();
const searchExercisesPaged = vi.fn();
vi.mock('./api', () => ({
  getExercise: (...a: unknown[]) => getExercise(...a),
  searchExercisesPaged: (...a: unknown[]) => searchExercisesPaged(...a),
}));
```
Add to the existing `beforeEach`:
```ts
searchExercisesPaged.mockReset();
searchExercisesPaged.mockResolvedValue({ rows: [{ id: 'a' }], total: 1 });
```
Update the import to include the new hook (`import { useExercise, useExercisesBrowse } from './hooks';`) and append:
```tsx
const browseParams = {
  query: 'press', category: 'strength' as const, equipment: null, level: null,
  muscleValue: '', textMuscles: [], page: 1, pageSize: 10,
};

describe('useExercisesBrowse', () => {
  it('calls searchExercisesPaged with the params and returns rows + total', async () => {
    const { result } = renderHook(() => useExercisesBrowse(browseParams), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ rows: [{ id: 'a' }], total: 1 }));
    expect(searchExercisesPaged).toHaveBeenCalledWith(browseParams);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test src/features/training/exercises/hooks.test.tsx`
Expected: FAIL — `useExercisesBrowse` not exported.

- [ ] **Step 3: Add the hook** to `hooks.ts`:

```ts
import {
  createExercise, getExercise, searchExercises, searchExercisesPaged,
  type Exercise, type ExerciseBrowseParams, type ExerciseCreateInput, type ExerciseSearchOptions,
} from './api';

export function useExercisesBrowse(params: ExerciseBrowseParams) {
  const { query, category, equipment, level, muscleValue, textMuscles, page, pageSize } = params;
  return useQuery({
    queryKey: [
      'exercises', 'browse',
      query, category, equipment, level, muscleValue, textMuscles, page, pageSize,
    ] as const,
    queryFn: () => searchExercisesPaged(params),
    placeholderData: (prev) => prev,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test src/features/training/exercises/hooks.test.tsx`
Expected: PASS (existing `useExercise` cases stay green too).

- [ ] **Step 5: Commit**

```bash
git add src/features/training/exercises/hooks.ts src/features/training/exercises/hooks.test.tsx
git commit -m "feat(B2c): useExercisesBrowse query hook"
```

---

## Task 4: Extract `MuscleSelect`; reuse in `ExercisePicker`

**Files:**
- Create: `src/features/training/components/MuscleSelect.tsx`
- Test: `src/features/training/components/MuscleSelect.test.tsx`
- Modify: `src/features/training/components/ExercisePicker.tsx`

DRY: the grouped muscle `<select>` markup is needed by both the picker and the filters drawer. Extract it verbatim (same markup → picker tests stay green), then have the picker render it.

- [ ] **Step 1: Write the failing test** — `MuscleSelect.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen, fireEvent } from '@testing-library/react';
import { MuscleSelect } from './MuscleSelect';

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('MuscleSelect', () => {
  it('renders the All option + fine codes and forwards the picked value', () => {
    const onChange = vi.fn();
    render(<MuscleSelect value="" onChange={onChange} ariaLabel="Todos los músculos" />);
    const select = screen.getByRole('combobox', { name: 'Todos los músculos' });
    // concrete, unique assertions (no catch-all regex):
    const all = screen.getByRole('option', { name: 'Todos los músculos' }) as HTMLOptionElement;
    expect(all.value).toBe('');
    expect(screen.getByRole('option', { name: 'Pectoral inferior' })).toBeInTheDocument(); // pec_lower
    fireEvent.change(select, { target: { value: 'group:arms' } });
    expect(onChange).toHaveBeenCalledWith('group:arms');
  });
});
```

(The behaviors covered: it is a `combobox` with the given aria-label, the `All` option is valued `""`, a known fine-code label renders, and `onChange` forwards `e.target.value`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test src/features/training/components/MuscleSelect.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `MuscleSelect.tsx`** (markup lifted from `ExercisePicker`):

```tsx
import { useTranslation } from 'react-i18next';
import { MUSCLE_GROUPS, codesInGroup } from '@/core/muscles';

interface Props {
  /** '' | <fineCode> | `group:<group>` */
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}

/** The grouped All/group/fine-code muscle dropdown shared by the picker + browse filters. */
export function MuscleSelect({ value, onChange, ariaLabel, className }: Props) {
  const { t } = useTranslation('entrenamiento');
  return (
    <select
      role="combobox"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ??
        'w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'
      }
    >
      <option value="">{t('picker.allMuscles')}</option>
      {MUSCLE_GROUPS.map((g) => (
        <optgroup key={g} label={t(`exerciseDialog.muscleGroup.${g}`)}>
          <option value={`group:${g}`}>
            {t('picker.allInGroup', { group: t(`exerciseDialog.muscleGroup.${g}`) })}
          </option>
          {codesInGroup(g).map((code) => (
            <option key={code} value={code}>
              {t(`exerciseDialog.muscle.${code}`)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
```

- [ ] **Step 4: Refactor `ExercisePicker.tsx`** — replace the inline `<select role="combobox" …>…</select>` block with:

```tsx
import { MuscleSelect } from './MuscleSelect';
// …
<MuscleSelect
  value={selectedMuscle}
  onChange={(v) => { setSelectedMuscle(v); setOpen(true); }}
  ariaLabel={t('picker.allMuscles')}
/>
```

Remove the now-unused `MUSCLE_GROUPS` / `codesInGroup` imports from `ExercisePicker.tsx` if nothing else uses them (it still uses `codesInGroup` for `groupMuscles` — keep that import; remove only what's dead).

- [ ] **Step 5: Run picker + MuscleSelect tests**

Run: `corepack pnpm test src/features/training/components/ExercisePicker.test.tsx src/features/training/components/MuscleSelect.test.tsx`
Expected: PASS — picker behavior unchanged, new component covered.

- [ ] **Step 6: Commit**

```bash
git add src/features/training/components/MuscleSelect.tsx src/features/training/components/MuscleSelect.test.tsx src/features/training/components/ExercisePicker.tsx
git commit -m "refactor(B2c): extract MuscleSelect from ExercisePicker for reuse"
```

---

## Task 5: i18n strings (browse + category + level)

**Files:**
- Modify: `src/i18n/es/entrenamiento.json`, `src/i18n/en/entrenamiento.json`

No test of its own — exercised by later component tests (which assert Spanish strings). Add a new top-level `browse` block and `category`/`level` maps under the existing `exerciseDialog`.

- [ ] **Step 1: Add to `src/i18n/es/entrenamiento.json`** — a new `"browse"` key (sibling of `"picker"`):

```json
"browse": {
  "title": "Ejercicios",
  "subtitle": "Explora el catálogo completo de ejercicios.",
  "searchPlaceholder": "Buscar ejercicios…",
  "filters": "Filtros",
  "filtersTitle": "Filtrar ejercicios",
  "clearAll": "Limpiar filtros",
  "apply": "Aplicar",
  "empty": "No se encontraron ejercicios.",
  "back": "Volver",
  "labels": { "category": "Categoría", "equipment": "Equipo", "level": "Nivel", "muscle": "Músculo", "all": "Todos" },
  "notFound": {
    "title": "Ejercicio no encontrado",
    "body": "Este ejercicio no existe o fue eliminado.",
    "back": "Volver a ejercicios"
  }
}
```

And inside the existing `"exerciseDialog"` object, add:

```json
"category": {
  "strength": "Fuerza",
  "stretching": "Estiramiento",
  "plyometrics": "Pliometría",
  "powerlifting": "Powerlifting",
  "strongman": "Strongman",
  "olympic_weightlifting": "Halterofilia",
  "cardio": "Cardio"
},
"level": {
  "beginner": "Principiante",
  "intermediate": "Intermedio",
  "expert": "Experto"
}
```

- [ ] **Step 2: Add the parallel English block** to `src/i18n/en/entrenamiento.json`:

```json
"browse": {
  "title": "Exercises",
  "subtitle": "Browse the full exercise catalog.",
  "searchPlaceholder": "Search exercises…",
  "filters": "Filters",
  "filtersTitle": "Filter exercises",
  "clearAll": "Clear filters",
  "apply": "Apply",
  "empty": "No exercises found.",
  "back": "Back",
  "labels": { "category": "Category", "equipment": "Equipment", "level": "Level", "muscle": "Muscle", "all": "All" },
  "notFound": {
    "title": "Exercise not found",
    "body": "This exercise doesn't exist or was removed.",
    "back": "Back to exercises"
  }
},
```

and under `exerciseDialog`:

```json
"category": {
  "strength": "Strength", "stretching": "Stretching", "plyometrics": "Plyometrics",
  "powerlifting": "Powerlifting", "strongman": "Strongman",
  "olympic_weightlifting": "Olympic weightlifting", "cardio": "Cardio"
},
"level": { "beginner": "Beginner", "intermediate": "Intermediate", "expert": "Expert" }
```

- [ ] **Step 3: Verify JSON parses + build is green**

Run: `corepack pnpm typecheck && node -e "require('./src/i18n/es/entrenamiento.json'); require('./src/i18n/en/entrenamiento.json'); console.log('json ok')"`
Expected: prints `json ok`, typecheck passes.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/es/entrenamiento.json src/i18n/en/entrenamiento.json
git commit -m "feat(B2c): i18n strings for exercise browse + category/level labels"
```

---

## Task 6: `ExerciseCard`

**Files:**
- Create: `src/features/training/components/ExerciseCard.tsx`
- Test: `src/features/training/components/ExerciseCard.test.tsx`

- [ ] **Step 1: Write the failing test** — `ExerciseCard.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ExerciseCard } from './ExerciseCard';
import type { Exercise } from '../exercises/api';

const base: Exercise = {
  category: 'strength', created_at: '', created_by_user_id: null, default_increment_kg: 2.5,
  equipment: 'barbell', external_id: null, force: null, id: 'ex-1',
  images: ['Bench_Press/0.jpg'], instructions_en: [], instructions_es: [],
  is_verified: true, level: 'beginner', mechanic: null, name_en: 'Bench press',
  name_es: 'Press de banca', primary_muscles: ['pec_lower'], secondary_muscles: [],
  source: 'free-exercise-db', updated_at: '',
};

function renderCard(ex: Exercise) {
  return render(<MemoryRouter><ExerciseCard exercise={ex} /></MemoryRouter>);
}

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('ExerciseCard', () => {
  it('shows the name, primary-muscle + equipment badges, and links to the detail page', () => {
    renderCard(base);
    expect(screen.getByText('Press de banca')).toBeInTheDocument();
    expect(screen.getByText('Pectoral inferior')).toBeInTheDocument(); // exerciseDialog.muscle.pec_lower (verified)
    expect(screen.getByText('Barra')).toBeInTheDocument();             // exerciseDialog.equipment.barbell (verified)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/exercises/ex-1');
  });

  it('hides the equipment badge when equipment is null', () => {
    renderCard({ ...base, equipment: null });
    expect(screen.queryByText('Barra')).not.toBeInTheDocument();
  });

  it('renders a placeholder (no <img>) when there are no images', () => {
    renderCard({ ...base, images: [] });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
```

> Label literals verified against `src/i18n/es/entrenamiento.json`: `exerciseDialog.muscle.pec_lower` = "Pectoral inferior", `exerciseDialog.equipment.barbell` = "Barra". (Note: "Pecho" is the *group* label for `chest` — don't confuse it with the fine code.)

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test src/features/training/components/ExerciseCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `ExerciseCard.tsx`:**

```tsx
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Dumbbell } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buildExerciseImageUrl } from '../exercises/images';
import { exerciseDisplayName, type Exercise } from '../exercises/api';

interface Props { exercise: Exercise; }

export function ExerciseCard({ exercise }: Props) {
  const { t, i18n } = useTranslation('entrenamiento');
  const lang: 'es' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'es';
  const name = exerciseDisplayName(exercise, lang);
  const src = exercise.images.length > 0 ? buildExerciseImageUrl(exercise.images[0]) : '';
  const primary = exercise.primary_muscles[0];

  return (
    <Link to={`/exercises/${exercise.id}`} className="block focus:outline-none focus:ring-2 focus:ring-ring rounded-lg">
      <Card className="h-full overflow-hidden hover:shadow-md transition-shadow">
        <div className="aspect-[4/3] w-full bg-muted flex items-center justify-center overflow-hidden">
          {src ? (
            <img src={src} alt={name} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <Dumbbell className="h-10 w-10 text-muted-foreground/40" aria-hidden />
          )}
        </div>
        <CardContent className="space-y-2 py-3">
          <h3 className="font-medium leading-tight line-clamp-2">{name}</h3>
          <div className="flex flex-wrap gap-1">
            {primary && <Badge variant="secondary">{t(`exerciseDialog.muscle.${primary}`)}</Badge>}
            {exercise.equipment && (
              <Badge variant="secondary">{t(`exerciseDialog.equipment.${exercise.equipment}`)}</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test src/features/training/components/ExerciseCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/training/components/ExerciseCard.tsx src/features/training/components/ExerciseCard.test.tsx
git commit -m "feat(B2c): ExerciseCard grid tile"
```

---

## Task 7: `AppliedFilterChips`

**Files:**
- Create: `src/features/training/components/AppliedFilterChips.tsx`
- Test: `src/features/training/components/AppliedFilterChips.test.tsx`

Define the shared filter-state shape here and reuse it in the drawer + page.

- [ ] **Step 1: Write the failing test** — `AppliedFilterChips.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppliedFilterChips, type BrowseFilters, EMPTY_FILTERS } from './AppliedFilterChips';

beforeEach(async () => { await i18n.changeLanguage('es'); });

const filters: BrowseFilters = { category: 'strength', equipment: 'barbell', level: null, muscleValue: 'pec_lower' };

describe('AppliedFilterChips', () => {
  it('renders nothing when no filters are active', () => {
    const { container } = render(
      <AppliedFilterChips filters={EMPTY_FILTERS} onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows one chip per active filter and clears just that one on its X', () => {
    const onChange = vi.fn();
    render(<AppliedFilterChips filters={filters} onChange={onChange} />);
    expect(screen.getByText('Fuerza')).toBeInTheDocument();        // category
    expect(screen.getByText('Barra')).toBeInTheDocument();         // equipment
    fireEvent.click(screen.getByRole('button', { name: /Fuerza/ }));
    expect(onChange).toHaveBeenCalledWith({ ...filters, category: null });
  });

  it('clear-all resets to EMPTY_FILTERS', () => {
    const onChange = vi.fn();
    render(<AppliedFilterChips filters={filters} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test src/features/training/components/AppliedFilterChips.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `AppliedFilterChips.tsx`:**

```tsx
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { categorySlug } from '../exercises/api';

export interface BrowseFilters {
  category: string | null;
  equipment: string | null;
  level: string | null;
  /** '' | <fineCode> | `group:<group>` */
  muscleValue: string;
}

export const EMPTY_FILTERS: BrowseFilters = {
  category: null, equipment: null, level: null, muscleValue: '',
};

export function isFilterActive(f: BrowseFilters): boolean {
  return f.category !== null || f.equipment !== null || f.level !== null || f.muscleValue !== '';
}

export function activeFilterCount(f: BrowseFilters): number {
  return [f.category, f.equipment, f.level, f.muscleValue || null].filter((v) => v !== null && v !== '').length;
}

export function AppliedFilterChips({
  filters, onChange,
}: { filters: BrowseFilters; onChange: (next: BrowseFilters) => void }) {
  const { t } = useTranslation('entrenamiento');
  if (!isFilterActive(filters)) return null;

  const muscleLabel = (v: string): string =>
    v.startsWith('group:')
      ? t(`exerciseDialog.muscleGroup.${v.slice('group:'.length)}`)
      : t(`exerciseDialog.muscle.${v}`);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.category) chips.push({ key: 'category', label: t(`exerciseDialog.category.${categorySlug(filters.category)}`), clear: () => onChange({ ...filters, category: null }) });
  if (filters.equipment) chips.push({ key: 'equipment', label: t(`exerciseDialog.equipment.${filters.equipment}`), clear: () => onChange({ ...filters, equipment: null }) });
  if (filters.level) chips.push({ key: 'level', label: t(`exerciseDialog.level.${filters.level}`), clear: () => onChange({ ...filters, level: null }) });
  if (filters.muscleValue) chips.push({ key: 'muscle', label: muscleLabel(filters.muscleValue), clear: () => onChange({ ...filters, muscleValue: '' }) });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.clear}
          className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs text-foreground hover:bg-primary/20"
        >
          {c.label}
          <X className="h-3 w-3" />
        </button>
      ))}
      <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
        {t('browse.clearAll')}
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test src/features/training/components/AppliedFilterChips.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/training/components/AppliedFilterChips.tsx src/features/training/components/AppliedFilterChips.test.tsx
git commit -m "feat(B2c): AppliedFilterChips + shared BrowseFilters shape"
```

---

## Task 8: `ExerciseFilters` drawer

**Files:**
- Create: `src/features/training/components/ExerciseFilters.tsx`
- Test: `src/features/training/components/ExerciseFilters.test.tsx`

A `Drawer` (vaul, the existing primitive) opened by a Filters button; holds category/equipment/level native selects + `MuscleSelect`. Controlled over the page's `BrowseFilters`.

- [ ] **Step 1: Write the failing test** — `ExerciseFilters.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExerciseFilters } from './ExerciseFilters';
import { EMPTY_FILTERS } from './AppliedFilterChips';

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('ExerciseFilters', () => {
  it('shows the active-filter count on the closed trigger button', () => {
    // count badge lives on the always-rendered trigger — no portal needed
    render(<ExerciseFilters filters={{ ...EMPTY_FILTERS, category: 'strength' }} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Filtros/ })).toHaveTextContent('1');
  });

  it('opens on click and emits an updated filters object on category change', () => {
    const onChange = vi.fn();
    render(<ExerciseFilters filters={EMPTY_FILTERS} onChange={onChange} />);
    // Component controls `open` via its own React state (no DrawerTrigger), so a
    // click flips state and the controlled Drawer renders content synchronously —
    // the pattern drawer.test.tsx proves with <Drawer open> and ExerciseInfoButton uses.
    fireEvent.click(screen.getByRole('button', { name: /Filtros/ }));
    expect(screen.getByText('Filtrar ejercicios')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), { target: { value: 'strength' } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, category: 'strength' });
  });
});
```

> **Why no `DrawerTrigger`:** vaul's `DrawerTrigger` relies on pointer events that don't reliably toggle `open` synchronously in jsdom — no repo test opens a Drawer that way. The repo's only Drawer test (`src/components/ui/drawer.test.tsx`) renders `<Drawer open>` declaratively, and `ExerciseInfoButton.tsx` controls `open` via its own state. We follow that proven pattern (controlled `open` + a plain `Button onClick`), so the test's click works without a portal-mount race.

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test src/features/training/components/ExerciseFilters.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `ExerciseFilters.tsx`:**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { MuscleSelect } from './MuscleSelect';
import { CATEGORY_VALUES, LEVEL_VALUES, EQUIPMENT_VALUES, categorySlug } from '../exercises/api';
import { type BrowseFilters, EMPTY_FILTERS, activeFilterCount } from './AppliedFilterChips';

const SELECT_CLASS =
  'w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring';

export function ExerciseFilters({
  filters, onChange,
}: { filters: BrowseFilters; onChange: (next: BrowseFilters) => void }) {
  const { t } = useTranslation('entrenamiento');
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(filters);

  return (
    <>
      {/* Plain button controls `open` (no DrawerTrigger) — see the test note. */}
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="h-4 w-4" />
        {t('browse.filters')}
        {count > 0 && (
          <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{count}</span>
        )}
      </Button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{t('browse.filtersTitle')}</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-4 px-4 pb-6">
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('browse.labels.category')}</span>
            <select
              aria-label={t('browse.labels.category')} role="combobox"
              className={SELECT_CLASS}
              value={filters.category ?? ''}
              onChange={(e) => onChange({ ...filters, category: e.target.value || null })}
            >
              <option value="">{t('browse.labels.all')}</option>
              {CATEGORY_VALUES.map((c) => (
                <option key={c} value={c}>{t(`exerciseDialog.category.${categorySlug(c)}`)}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('browse.labels.equipment')}</span>
            <select
              aria-label={t('browse.labels.equipment')} role="combobox"
              className={SELECT_CLASS}
              value={filters.equipment ?? ''}
              onChange={(e) => onChange({ ...filters, equipment: e.target.value || null })}
            >
              <option value="">{t('browse.labels.all')}</option>
              {EQUIPMENT_VALUES.map((eq) => (
                <option key={eq} value={eq}>{t(`exerciseDialog.equipment.${eq}`)}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('browse.labels.level')}</span>
            <select
              aria-label={t('browse.labels.level')} role="combobox"
              className={SELECT_CLASS}
              value={filters.level ?? ''}
              onChange={(e) => onChange({ ...filters, level: e.target.value || null })}
            >
              <option value="">{t('browse.labels.all')}</option>
              {LEVEL_VALUES.map((l) => (
                <option key={l} value={l}>{t(`exerciseDialog.level.${l}`)}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('browse.labels.muscle')}</span>
            <MuscleSelect
              value={filters.muscleValue}
              onChange={(v) => onChange({ ...filters, muscleValue: v })}
              ariaLabel={t('browse.labels.muscle')}
            />
          </label>

          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => onChange(EMPTY_FILTERS)}>{t('browse.clearAll')}</Button>
            <Button onClick={() => setOpen(false)}>{t('browse.apply')}</Button>
          </div>
        </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test src/features/training/components/ExerciseFilters.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/training/components/ExerciseFilters.tsx src/features/training/components/ExerciseFilters.test.tsx
git commit -m "feat(B2c): ExerciseFilters drawer (category/equipment/level/muscle)"
```

---

## Task 9: `ExercisesPage` (browse)

**Files:**
- Create: `src/pages/ExercisesPage.tsx`
- Test: `src/pages/ExercisesPage.test.tsx`

Composes search + filters + chips + card grid + pagination over `useExercisesBrowse`.

- [ ] **Step 1: Write the failing test** — `ExercisesPage.test.tsx` (mock the browse hook; wrap in `MemoryRouter`):

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const useExercisesBrowse = vi.fn();
vi.mock('@/features/training/exercises/hooks', () => ({
  useExercisesBrowse: (...a: unknown[]) => useExercisesBrowse(...a),
}));

import { ExercisesPage } from './ExercisesPage';
import type { Exercise } from '@/features/training/exercises/api';

const row: Exercise = {
  category: 'strength', created_at: '', created_by_user_id: null, default_increment_kg: 2.5,
  equipment: 'barbell', external_id: null, force: null, id: 'ex-1', images: ['Bench/0.jpg'],
  instructions_en: [], instructions_es: [], is_verified: true, level: 'beginner', mechanic: null,
  name_en: 'Bench press', name_es: 'Press de banca', primary_muscles: ['pec_lower'],
  secondary_muscles: [], source: 'free-exercise-db', updated_at: '',
};

function renderPage() {
  return render(<MemoryRouter><ExercisesPage /></MemoryRouter>);
}

beforeEach(async () => {
  useExercisesBrowse.mockReset();
  await i18n.changeLanguage('es');
});

describe('ExercisesPage', () => {
  it('renders a card per result row', () => {
    useExercisesBrowse.mockReturnValue({ data: { rows: [row], total: 1 }, isLoading: false });
    renderPage();
    expect(screen.getByText('Press de banca')).toBeInTheDocument();
  });

  it('shows the empty state when there are no results', () => {
    useExercisesBrowse.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false });
    renderPage();
    expect(screen.getByText('No se encontraron ejercicios.')).toBeInTheDocument();
  });

  it('shows a skeleton grid on first load (not the empty state)', () => {
    useExercisesBrowse.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    expect(screen.getByTestId('exercise-skeleton-grid')).toBeInTheDocument();
    expect(screen.queryByText('No se encontraron ejercicios.')).not.toBeInTheDocument();
  });

  it('does not render the skeleton once loaded', () => {
    useExercisesBrowse.mockReturnValue({ data: { rows: [row], total: 1 }, isLoading: false });
    renderPage();
    expect(screen.queryByTestId('exercise-skeleton-grid')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test src/pages/ExercisesPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `ExercisesPage.tsx`:**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { usePagination } from '@/hooks/usePagination';
import { ExerciseCard } from '@/features/training/components/ExerciseCard';
import { ExerciseFilters } from '@/features/training/components/ExerciseFilters';
import { AppliedFilterChips, EMPTY_FILTERS, type BrowseFilters } from '@/features/training/components/AppliedFilterChips';
import { useExercisesBrowse } from '@/features/training/exercises/hooks';
import { PRIMARY_MUSCLE_VALUES, type Equipment, type PrimaryMuscle } from '@/features/training/exercises/api';
import { musclesMatchingQuery } from '@/features/training/exercises/muscleSearch';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function ExercisesPage() {
  const { t } = useTranslation('entrenamiento');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<BrowseFilters>(EMPTY_FILTERS);
  const debounced = useDebouncedValue(query, 200);

  // Typing a muscle name surfaces matches (parity with the picker).
  const labelByCode = useMemo(
    () => Object.fromEntries(PRIMARY_MUSCLE_VALUES.map((c) => [c, t(`exerciseDialog.muscle.${c}`)])),
    [t],
  );
  const textMuscles = musclesMatchingQuery(debounced, labelByCode);

  const resetKey = `${debounced}|${filters.category}|${filters.equipment}|${filters.level}|${filters.muscleValue}`;

  // Hook-order cycle: usePagination must run BEFORE useExercisesBrowse (it produces
  // page/pageSize), so it can't read this render's browse.data.total directly.
  // We hold `total` in state and feed back the resolved count via an effect — this
  // gives usePagination a real total for pageCount/clamping. (placeholderData on the
  // query keeps prior rows visible between page changes, so no flash.)
  const [total, setTotal] = useState(0);
  const { page, pageSize, pageCount, setPage, setPageSize } = usePagination({ total, resetKey });

  const browse = useExercisesBrowse({
    query: debounced,
    category: filters.category,
    equipment: filters.equipment as Equipment | null,
    level: filters.level,
    muscleValue: filters.muscleValue,
    textMuscles: textMuscles as PrimaryMuscle[],
    page,
    pageSize,
  });

  useEffect(() => {
    if (browse.data) setTotal(browse.data.total);
  }, [browse.data]);

  const rows = browse.data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('browse.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('browse.subtitle')}</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('browse.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ExerciseFilters filters={filters} onChange={setFilters} />
      </div>

      <AppliedFilterChips filters={filters} onChange={setFilters} />

      {browse.isLoading ? (
        <ul data-testid="exercise-skeleton-grid" className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i}>
              <Card><div className="aspect-[4/3] w-full"><Skeleton className="h-full w-full" /></div>
                <CardContent className="space-y-2 py-3">
                  <Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">{t('browse.empty')}</CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((ex) => (<li key={ex.id}><ExerciseCard exercise={ex} /></li>))}
        </ul>
      )}

      <PaginationBar
        page={page}
        pageSize={pageSize}
        total={total}
        pageCount={pageCount}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test src/pages/ExercisesPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ExercisesPage.tsx src/pages/ExercisesPage.test.tsx
git commit -m "feat(B2c): ExercisesPage browse (search + filters + grid + pagination)"
```

---

## Task 10: `ExerciseDetailPage`

**Files:**
- Create: `src/pages/ExerciseDetailPage.tsx`
- Test: `src/pages/ExerciseDetailPage.test.tsx`

- [ ] **Step 1: Write the failing test** — `ExerciseDetailPage.test.tsx` (mock `useExercise`; route with a param):

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const useExercise = vi.fn();
vi.mock('@/features/training/exercises/hooks', () => ({
  useExercise: (...a: unknown[]) => useExercise(...a),
}));

import { ExerciseDetailPage } from './ExerciseDetailPage';
import type { Exercise } from '@/features/training/exercises/api';

const ex: Exercise = {
  category: 'strength', created_at: '', created_by_user_id: null, default_increment_kg: 2.5,
  equipment: 'barbell', external_id: null, force: null, id: 'ex-1', images: [],
  instructions_en: ['Step one.'], instructions_es: ['Paso uno.'], is_verified: true,
  level: 'beginner', mechanic: null, name_en: 'Bench press', name_es: 'Press de banca',
  primary_muscles: ['pec_lower'], secondary_muscles: [], source: 'free-exercise-db', updated_at: '',
};

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/exercises/${id}`]}>
      <Routes><Route path="/exercises/:id" element={<ExerciseDetailPage />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => { useExercise.mockReset(); await i18n.changeLanguage('es'); });

describe('ExerciseDetailPage', () => {
  it('shows the exercise on success', () => {
    useExercise.mockReturnValue({ data: ex, isLoading: false, isError: false });
    renderAt('ex-1');
    expect(screen.getByRole('heading', { name: 'Press de banca' })).toBeInTheDocument();
  });

  it('shows a loading status while fetching', () => {
    useExercise.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderAt('ex-1');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the not-found block on error', () => {
    useExercise.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderAt('missing');
    expect(screen.getByText('Ejercicio no encontrado')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test src/pages/ExerciseDetailPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `ExerciseDetailPage.tsx`:**

```tsx
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ExerciseDetail } from '@/features/training/components/ExerciseDetail';
import { useExercise } from '@/features/training/exercises/hooks';

export function ExerciseDetailPage() {
  const { t } = useTranslation('entrenamiento');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useExercise(id);

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        className="gap-2 -ml-2"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/exercises'))}
      >
        <ArrowLeft className="h-4 w-4" />
        {t('browse.back')}
      </Button>

      {isLoading ? (
        <div role="status" className="space-y-3">
          <Skeleton className="aspect-[4/3] w-full" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : isError || !data ? (
        <div className="space-y-3 py-10 text-center">
          <h1 className="text-lg font-semibold">{t('browse.notFound.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('browse.notFound.body')}</p>
          <Button asChild variant="outline"><Link to="/exercises">{t('browse.notFound.back')}</Link></Button>
        </div>
      ) : (
        <ExerciseDetail exercise={data} density="full" />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test src/pages/ExerciseDetailPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ExerciseDetailPage.tsx src/pages/ExerciseDetailPage.test.tsx
git commit -m "feat(B2c): ExerciseDetailPage (/exercises/:id, read-only)"
```

---

## Task 11: Wire routes + full verification

**Files:**
- Modify: `src/app/router.tsx`

- [ ] **Step 1: Update imports** in `router.tsx`. `/exercises` (line 122) is `EnProgresoPage`'s **only** reference in `router.tsx` (confirmed: the sole other refs are `EnProgresoPage.tsx` itself + its `.test.tsx`). Once `/exercises` is repointed the import is dead and **will fail lint/typecheck**, so **remove the `import { EnProgresoPage } from '@/pages/EnProgresoPage';` line** (do NOT delete `EnProgresoPage.tsx` — its own test still imports it). Add:

```tsx
import { ExercisesPage } from '@/pages/ExercisesPage';
import { ExerciseDetailPage } from '@/pages/ExerciseDetailPage';
```

- [ ] **Step 2: Replace the `/exercises` route** and add the detail route (in the Entreno block):

```tsx
<Route path="/exercises" element={<ExercisesPage />} />
<Route path="/exercises/:id" element={<ExerciseDetailPage />} />
```

- [ ] **Step 3: Confirm no dead `EnProgresoPage` reference remains**

Run: `grep -rn "EnProgresoPage" src/`
Expected: only `src/pages/EnProgresoPage.tsx` + `src/pages/EnProgresoPage.test.tsx` — i.e. the import line in `router.tsx` is gone (Step 1). The component file stays (still tested); only the router import was removed.

- [ ] **Step 4: Full local gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm build && corepack pnpm test`
Expected: all green. (Full vitest run is ~11–15 min — see [wsl-session-toolchain].)

- [ ] **Step 5: Commit**

```bash
git add src/app/router.tsx
git commit -m "feat(B2c): mount ExercisesPage at /exercises + detail at /exercises/:id"
```

- [ ] **Step 6: Tier-3 db-test reality check (REQUIRED for the array/count query).**

The PostgREST `contains`/`overlaps`/`count` calls in `searchExercisesPaged` are NOT typechecked. Before opening the PR, verify the real query against a running DB: start the local stack from this worktree (`supabase start --workdir .` per [wsl-session-toolchain]) and either (a) add/extend an exercises integration assertion, or (b) manually run `searchExercisesPaged` against seeded data and confirm a filtered page returns rows + a correct `total`. The PR's CI db-test job is the backstop, but confirm locally so CI isn't the first signal. Note in the PR description what you verified.

---

## Self-Review (completed during authoring)

- **Spec coverage:** browse page (T9) ✓, filters-in-drawer (T8) ✓, applied chips (T7) ✓, card layout w/ thumbnail+name+2 badges, level off card (T6) ✓, detail page read-only + loading/404 (T10) ✓, data extension w/ category/equipment/level + count, picker untouched (T2/T3) ✓, MuscleSelect extraction (T4) ✓, i18n incl. new category/level maps (T5) ✓, route wiring (T11) ✓, tests mock hooks (all) ✓. Deferred items (aliases, add-to-workout) carry no task by design.
- **Type consistency:** `BrowseFilters`/`EMPTY_FILTERS` defined once (T7), imported by T8/T9; `ExerciseBrowseParams` defined in T2, consumed by T3/T9; `searchExercisesPaged` signature identical across T2/T3; `muscleValue` convention (`'' | code | group:<g>`) consistent in MuscleSelect/api/chips.
- **Placeholder scan:** no TBD/TODO; every code step is complete. Two flagged adaptation points (the ES-label assertions in T6; the Drawer-in-jsdom open mechanics in T8) point at the authoritative source to copy from rather than leaving a gap.
- **Out of plan:** living-docs updates (roadmap R-27 complete, features/changelog, the deferred-aliases backlog item) happen post-merge via the docs-audit flow, per spec §10/§11 — not a code task here.
