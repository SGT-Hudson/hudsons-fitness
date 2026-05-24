# List Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add numbered pagination with a persisted page-size selector (5/10/20/50, default 10) to the ingredients library list (server-side) and the recipes list (client-side), including paged search/filter results.

**Architecture:** A shared `usePagination` hook (persists page size in localStorage, resets page on query change, clamps on shrink) + a presentational `PaginationBar` built from existing `Button`/`Select`. Ingredients paginate server-side via a new `searchLocalIngredientsPage` (`.range` + exact count); recipes paginate client-side by slicing the already-in-memory filtered array.

**Tech Stack:** React 18, TypeScript, react-i18next, @tanstack/react-query, Supabase, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-05-24-list-pagination-design.md`

> **Refinements vs. spec (intentional):** (a) the shared control is a single `PaginationBar` composed from existing `Button`/`Select` — we do NOT vendor shadcn's pagination primitive set or export `buttonVariants` (leaner, same intent); (b) the ingredients paged search is a NEW `searchLocalIngredientsPage`/`useLocalIngredientSearchPage` rather than changing `searchLocalIngredients`, so the out-of-scope recipe-editor autocomplete (which shares the old hook) is untouched.

---

## File Structure

- Create `src/hooks/usePagination.ts` — `{page,pageSize,pageCount,setPage,setPageSize}`; `PAGE_SIZE_OPTIONS`, `DEFAULT_PAGE_SIZE`, `PageSize`. localStorage-backed page size; page reset/clamp.
- Create `src/hooks/usePagination.test.tsx` — hook tests.
- Create `src/components/ui/PaginationBar.tsx` — presentational control (page buttons + ellipsis + page-size `Select` + "X–Y of N"); plus the pure `pageRange` helper (exported for test).
- Create `src/components/ui/PaginationBar.test.tsx` — `pageRange` + render tests.
- Create `src/i18n/es/pagination.json` + `src/i18n/en/pagination.json`; modify `src/i18n/index.ts` (register `pagination` ns).
- Modify `src/features/ingredients/api.ts` — add `searchLocalIngredientsPage` + `PagedIngredients`.
- Modify `src/features/ingredients/api.test.ts` — test the paged query builder.
- Modify `src/features/ingredients/hooks.ts` — add `useLocalIngredientSearchPage`.
- Modify `src/pages/IngredientesPage.tsx` — wire server-side pagination.
- Modify `src/pages/RecetasPage.tsx` — wire client-side pagination.

---

## Task 1: `usePagination` hook (TDD)

**Files:**
- Create: `src/hooks/usePagination.ts`
- Test: `src/hooks/usePagination.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePagination, DEFAULT_PAGE_SIZE } from './usePagination';

beforeEach(() => localStorage.clear());

describe('usePagination', () => {
  it('defaults page to 1 and pageSize to the default', () => {
    const { result } = renderHook(() => usePagination({ total: 100, resetKey: 'q' }));
    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(result.current.pageCount).toBe(10);
  });

  it('persists pageSize to localStorage and resets page to 1', () => {
    const { result } = renderHook(() => usePagination({ total: 100, resetKey: 'q' }));
    act(() => result.current.setPage(3));
    act(() => result.current.setPageSize(50));
    expect(result.current.pageSize).toBe(50);
    expect(result.current.page).toBe(1);
    expect(localStorage.getItem('hf.pageSize')).toBe('50');
  });

  it('reads a valid persisted pageSize on init, ignores invalid', () => {
    localStorage.setItem('hf.pageSize', '20');
    const { result } = renderHook(() => usePagination({ total: 100, resetKey: 'q' }));
    expect(result.current.pageSize).toBe(20);
    localStorage.setItem('hf.pageSize', '7');
    const { result: r2 } = renderHook(() => usePagination({ total: 100, resetKey: 'q' }));
    expect(r2.current.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it('resets page to 1 when resetKey changes', () => {
    const { result, rerender } = renderHook(
      ({ k }) => usePagination({ total: 100, resetKey: k }),
      { initialProps: { k: 'a' } },
    );
    act(() => result.current.setPage(4));
    expect(result.current.page).toBe(4);
    rerender({ k: 'b' });
    expect(result.current.page).toBe(1);
  });

  it('clamps page when total shrinks', () => {
    const { result, rerender } = renderHook(
      ({ total }) => usePagination({ total, resetKey: 'q' }),
      { initialProps: { total: 100 } },
    );
    act(() => result.current.setPage(9));
    rerender({ total: 12 }); // pageCount now 2
    expect(result.current.page).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/hooks/usePagination.test.tsx`
Expected: FAIL — `usePagination` not exported.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/usePagination.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';

export const PAGE_SIZE_OPTIONS = [5, 10, 20, 50] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 10;

const STORAGE_KEY = 'hf.pageSize';

function readStoredPageSize(): PageSize {
  if (typeof localStorage === 'undefined') return DEFAULT_PAGE_SIZE;
  const raw = Number(localStorage.getItem(STORAGE_KEY));
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(raw)
    ? (raw as PageSize)
    : DEFAULT_PAGE_SIZE;
}

export interface UsePaginationArgs {
  total: number;
  /** A signature of the active query/filters — page resets to 1 when it changes. */
  resetKey: string;
}

export interface UsePaginationResult {
  page: number;
  pageSize: PageSize;
  pageCount: number;
  setPage: (page: number) => void;
  setPageSize: (size: PageSize) => void;
}

export function usePagination({ total, resetKey }: UsePaginationArgs): UsePaginationResult {
  const [pageSize, setPageSizeState] = useState<PageSize>(readStoredPageSize);
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Reset to the first page whenever the query/filters change.
  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  // Clamp the current page when the result set shrinks (e.g. a narrower filter).
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  const setPageSize = useCallback((size: PageSize) => {
    setPageSizeState(size);
    setPage(1);
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, String(size));
  }, []);

  return { page, pageSize, pageCount, setPage, setPageSize };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/hooks/usePagination.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePagination.ts src/hooks/usePagination.test.tsx
git commit -m "feat(pagination): usePagination hook with persisted page size"
```

---

## Task 2: i18n `pagination` namespace

**Files:**
- Create: `src/i18n/es/pagination.json`, `src/i18n/en/pagination.json`
- Modify: `src/i18n/index.ts`

- [ ] **Step 1: Create the locale files**

`src/i18n/es/pagination.json`:
```json
{
  "summary": "{{from}}–{{to}} de {{total}}",
  "prev": "Anterior",
  "next": "Siguiente",
  "perPage": "Por página"
}
```

`src/i18n/en/pagination.json`:
```json
{
  "summary": "{{from}}–{{to}} of {{total}}",
  "prev": "Previous",
  "next": "Next",
  "perPage": "Per page"
}
```

- [ ] **Step 2: Register the namespace in `src/i18n/index.ts`**

Add imports next to the other namespace imports:
```ts
import esPagination from './es/pagination.json';
import enPagination from './en/pagination.json';
```
Add `pagination: esPagination,` to the `es` resources object and `pagination: enPagination,` to the `en` resources object. Add `'pagination'` to the `ns` array.

- [ ] **Step 3: Verify it parses + typechecks**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/es/pagination.json src/i18n/en/pagination.json src/i18n/index.ts
git commit -m "feat(pagination): i18n pagination namespace (es/en)"
```

---

## Task 3: `PaginationBar` component + `pageRange` (TDD)

**Files:**
- Create: `src/components/ui/PaginationBar.tsx`
- Test: `src/components/ui/PaginationBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { PaginationBar, pageRange } from './PaginationBar';

describe('pageRange', () => {
  it('lists every page when there are few', () => {
    expect(pageRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it('inserts ellipses around the current page for many', () => {
    expect(pageRange(6, 12)).toEqual([1, 'ellipsis', 5, 6, 7, 'ellipsis', 12]);
  });
});

describe('PaginationBar', () => {
  const base = {
    page: 1, pageSize: 10 as const, total: 0, pageCount: 1,
    onPageChange: vi.fn(), onPageSizeChange: vi.fn(),
  };

  it('renders nothing when total is 0', () => {
    const { container } = render(<PaginationBar {...base} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('fires onPageChange when a page button is clicked', async () => {
    const onPageChange = vi.fn();
    render(<PaginationBar {...base} total={30} pageCount={3} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole('button', { name: '2' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('disables Previous on the first page', () => {
    render(<PaginationBar {...base} total={30} pageCount={3} />);
    expect(screen.getByRole('button', { name: /previous|anterior/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/ui/PaginationBar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `PaginationBar`**

Create `src/components/ui/PaginationBar.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PAGE_SIZE_OPTIONS, type PageSize } from '@/hooks/usePagination';

export interface PaginationBarProps {
  page: number;
  pageSize: PageSize;
  total: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
}

/** Windowed page list: 1 … current-1, current, current+1 … last (ellipses for gaps). */
export function pageRange(current: number, count: number): (number | 'ellipsis')[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const out: (number | 'ellipsis')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(count - 1, current + 1);
  if (start > 2) out.push('ellipsis');
  for (let p = start; p <= end; p++) out.push(p);
  if (end < count - 1) out.push('ellipsis');
  out.push(count);
  return out;
}

export function PaginationBar({
  page,
  pageSize,
  total,
  pageCount,
  onPageChange,
  onPageSizeChange,
}: PaginationBarProps) {
  const { t } = useTranslation('pagination');
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground tabular-nums">{t('summary', { from, to, total })}</p>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={t('prev')}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pageRange(page, pageCount).map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e${i}`} className="px-1 text-sm text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="icon"
              className="h-8 w-8 tabular-nums"
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={t('next')}
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange(Number(v) as PageSize)}
        >
          <SelectTrigger className="h-8 w-[4.75rem] ml-1" aria-label={t('perPage')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/ui/PaginationBar.test.tsx`
Expected: PASS (5 tests). If Radix Select needs `hasPointerCapture`/`scrollIntoView` in jsdom, the test only opens nothing (no Select interaction), so no stub is needed.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/PaginationBar.tsx src/components/ui/PaginationBar.test.tsx
git commit -m "feat(pagination): PaginationBar control (page buttons + size select)"
```

---

## Task 4: `searchLocalIngredientsPage` + hook (TDD)

**Files:**
- Modify: `src/features/ingredients/api.ts`
- Create: `src/features/ingredients/api.test.ts` (does not exist on this branch)
- Modify: `src/features/ingredients/hooks.ts`

> NOTE: This branch is off `develop`, so the search OR-clause mirrors the current
> `searchLocalIngredients` (`name`, `brand`). It does NOT add `name_en` — that's
> F-1's bilingual-search change. When F-1 merges, add `name_en.ilike` to this
> function's `.or(...)` too (one-line reconcile).

- [ ] **Step 1: Write the failing test**

Create `src/features/ingredients/api.test.ts` with a chainable Supabase builder mock that records calls and resolves with `{ data, count }`:

```ts
import { describe, expect, it, vi } from 'vitest';

const calls: Record<string, unknown> = {};
const builder = {
  select: vi.fn(() => builder),
  or: vi.fn((v: string) => {
    calls.or = v;
    return builder;
  }),
  order: vi.fn(() => builder),
  range: vi.fn((from: number, to: number) => {
    calls.range = [from, to];
    return Promise.resolve({ data: [{ id: '1' }], count: 42, error: null });
  }),
};
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(() => builder) },
}));

import { searchLocalIngredientsPage } from './api';

describe('searchLocalIngredientsPage', () => {
  it('computes range from page/pageSize and returns rows + total', async () => {
    const res = await searchLocalIngredientsPage('rice', { page: 3, pageSize: 10 });
    expect(calls.range).toEqual([20, 29]); // (3-1)*10 .. +10-1
    expect(calls.or).toContain('name.ilike.%rice%');
    expect(res).toEqual({ rows: [{ id: '1' }], total: 42 });
  });

  it('omits the or-filter for an empty query', async () => {
    calls.or = undefined;
    await searchLocalIngredientsPage('   ', { page: 1, pageSize: 5 });
    expect(calls.or).toBeUndefined();
    expect(calls.range).toEqual([0, 4]);
  });
});
```

> This is a new file on this branch. The `vi.mock('@/lib/supabase', …)` is
> required because `./api` imports the supabase client at module load (same
> reason the F-1 helper test mocks it).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/ingredients/api.test.ts`
Expected: FAIL — `searchLocalIngredientsPage` not exported.

- [ ] **Step 3: Implement the paged search**

Add to `src/features/ingredients/api.ts`:

```ts
export interface PagedIngredients {
  rows: Ingredient[];
  total: number;
}

/**
 * Server-side paged pool search (R-01: over the WHOLE pool). Returns the page's
 * rows plus the exact total for the pagination control. Order is deterministic
 * (`is_verified desc, name asc, id asc`) so offset paging never skips/dupes —
 * `name` is not unique, hence the `id` tiebreaker.
 */
export async function searchLocalIngredientsPage(
  query: string,
  { page, pageSize }: { page: number; pageSize: number },
): Promise<PagedIngredients> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const trimmed = query.trim();

  let q = supabase
    .from('ingredients')
    .select('*', { count: 'exact' })
    .order('is_verified', { ascending: false })
    .order('name')
    .order('id');

  if (trimmed !== '') {
    const safe = trimmed.replace(/[%_,]/g, '');
    q = q.or(`name.ilike.%${safe}%,brand.ilike.%${safe}%`);
  }

  const { data, error, count } = await q.range(from, to);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}
```

- [ ] **Step 4: Add the hook**

Add to `src/features/ingredients/hooks.ts` (import `searchLocalIngredientsPage` from `./api` and `keepPreviousData` from `@tanstack/react-query`):

```ts
export function useLocalIngredientSearchPage(
  query: string,
  page: number,
  pageSize: number,
) {
  return useQuery({
    queryKey: ['ingredients', 'search-page', query, page, pageSize],
    queryFn: () => searchLocalIngredientsPage(query, { page, pageSize }),
    placeholderData: keepPreviousData,
  });
}
```

Update the imports at the top of `hooks.ts`: add `searchLocalIngredientsPage` to the existing `./api` import, and add `keepPreviousData` to the `@tanstack/react-query` import.

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm vitest run src/features/ingredients/api.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/ingredients/api.ts src/features/ingredients/api.test.ts src/features/ingredients/hooks.ts
git commit -m "feat(pagination): server-side paged ingredient search"
```

---

## Task 5: Wire `IngredientesPage` (server-side)

**Files:**
- Modify: `src/pages/IngredientesPage.tsx`

- [ ] **Step 1: Swap the search hook for the paged one + add pagination state**

In `src/pages/IngredientesPage.tsx`:

1. Replace the import `import { useLocalIngredientSearch } from '@/features/ingredients/hooks';` with `import { useLocalIngredientSearchPage } from '@/features/ingredients/hooks';`.
2. Add imports:
   ```ts
   import { usePagination } from '@/hooks/usePagination';
   import { PaginationBar } from '@/components/ui/PaginationBar';
   ```
3. Replace `const search = useLocalIngredientSearch(query, 50);` with:
   ```ts
   const [total, setTotal] = useState(0);
   const { page, pageSize, pageCount, setPage, setPageSize } = usePagination({
     total,
     resetKey: query,
   });
   const search = useLocalIngredientSearchPage(query, page, pageSize);
   useEffect(() => {
     if (search.data) setTotal(search.data.total);
   }, [search.data]);
   ```
   Add `useEffect` to the `react` import (alongside `useState`).
4. Change the list render from `ingredients={search.data ?? []}` to `ingredients={search.data?.rows ?? []}`.
5. After the `<IngredientList … />`, add:
   ```tsx
   <PaginationBar
     page={page}
     pageSize={pageSize}
     total={total}
     pageCount={pageCount}
     onPageChange={setPage}
     onPageSizeChange={setPageSize}
   />
   ```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/IngredientesPage.tsx
git commit -m "feat(pagination): paginate the ingredients library list"
```

---

## Task 6: Wire `RecetasPage` (client-side)

**Files:**
- Modify: `src/pages/RecetasPage.tsx`

- [ ] **Step 1: Add pagination state + slice the ordered array**

In `src/pages/RecetasPage.tsx`:

1. Add imports:
   ```ts
   import { usePagination } from '@/hooks/usePagination';
   import { PaginationBar } from '@/components/ui/PaginationBar';
   ```
2. After the existing `ordered` `useMemo` (the favorites-partitioned filtered list), add:
   ```ts
   const { page, pageSize, pageCount, setPage, setPageSize } = usePagination({
     total: ordered.length,
     resetKey: `${query}|${selectedMealTypes.join(',')}|${selectedGoals.join(',')}`,
   });
   const paged = useMemo(
     () => ordered.slice((page - 1) * pageSize, page * pageSize),
     [ordered, page, pageSize],
   );
   ```
   (`useMemo` is already imported.)
3. In BOTH the grid and list render branches, change the iteration source from `ordered.map(...)` to `paged.map(...)`. (There are two `.map` call sites — grid view and list view; update both.)
4. Immediately after the closing of the grid/list conditional block (after the results render, before `</div>` / the `IngredientDialog`), add:
   ```tsx
   <PaginationBar
     page={page}
     pageSize={pageSize}
     total={ordered.length}
     pageCount={pageCount}
     onPageChange={setPage}
     onPageSizeChange={setPageSize}
   />
   ```
   Place it so it renders only alongside results (it self-hides when `total === 0`, so it is safe to render unconditionally below the list/empty branches).

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Full suite**

Run: `pnpm test`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/RecetasPage.tsx
git commit -m "feat(pagination): paginate the recipes list"
```

---

## Task 7: Verify end-to-end (manual)

- [ ] **Step 1: Run the app**

Run: `pnpm dev` and open the Ingredients page and the Recipes page.

- [ ] **Step 2: Check the behaviors**

- Ingredients: default 10 per page; page buttons fetch the next slice; "X–Y of N" is correct; searching "aceite" narrows + repaginates from page 1; changing page size to 50 persists across a reload.
- Recipes: same paging over the in-memory filtered list; meal-type/goal chips reset to page 1.
- Page size chosen on one list is remembered on the other and after reload (shared `hf.pageSize`).

- [ ] **Step 3: No commit** (verification only).

---

## Self-Review

**Spec coverage:**
- Numbered pagination on both lists → Tasks 5, 6. ✔
- Page-size selector 5/10/20/50 default 10 → `PAGE_SIZE_OPTIONS`/`DEFAULT_PAGE_SIZE` (Task 1) + `PaginationBar` Select (Task 3). ✔
- Search/filter results paginated; reset to page 1 on change → `usePagination` resetKey (Task 1); wired in Tasks 5/6. ✔
- Page size persists (localStorage, shared key) → Task 1 (`hf.pageSize`). ✔
- Uses component-library control → `PaginationBar` from `Button`/`Select` (Task 3); spec deviation (no shadcn primitive set / `buttonVariants` export) is noted in the header. ✔
- Ingredients server-side / recipes client-side → Tasks 4–6. ✔
- Autocomplete untouched → new `searchLocalIngredientsPage`/`useLocalIngredientSearchPage`; old `searchLocalIngredients`/`useLocalIngredientSearch` unchanged. ✔

**Placeholder scan:** none — every step has full code/commands.

**Type consistency:** `PageSize`, `PAGE_SIZE_OPTIONS`, `DEFAULT_PAGE_SIZE`, `usePagination({total,resetKey})→{page,pageSize,pageCount,setPage,setPageSize}`, `searchLocalIngredientsPage(query,{page,pageSize})→{rows,total}` (`PagedIngredients`), `useLocalIngredientSearchPage(query,page,pageSize)`, `PaginationBar` props, and `pageRange(current,count)` are used identically across tasks.
