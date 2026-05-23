# List Pagination (ingredients + recipes) — Design

- **date:** 2026-05-24
- **branch:** `claude/list-pagination`
- **status:** specced (awaiting user review before writing the plan)

## Problem

The ingredients library list (`IngredientesPage`) caps at 50 results with no way
to reach the rest of the shared pool (now 230+ and growing), and the recipes list
(`RecetasPage`) renders every match at once. Users need to page through results —
including filtered/search results (e.g. "oil" → 15 types) — with a choice of page
size.

## Requirements

- Numbered pagination (prev / pages / next) on **both** the ingredients list and
  the recipes list.
- Page-size selector with options **5 / 10 / 20 / 50**, default **10**.
- Search/filter results are paginated too (paging restarts at page 1 when the
  query or filters change).
- Page-size choice **persists across sessions** (localStorage).
- Use the component library (shadcn/ui style) — add the standard Pagination
  component (not currently present).

## How the two lists load data (dictates the approach)

- **Recipes** (`RecetasPage` → `useRecipes` → `listRecipes`): loads all of the
  user's recipes once and filters them **in-memory** (U-3 search + label/meal-type
  chips compute client-side). → paginate **client-side** (slice the filtered
  array). No data-layer change.
- **Ingredients** (`IngredientesPage` → `useLocalIngredientSearch` →
  `searchLocalIngredients`): searches the **shared pool server-side** (`.or` ILIKE,
  capped at 50). The pool is large and shared, so loading it all to page
  client-side is wasteful. → paginate **server-side** via Supabase `.range()` +
  exact count.

## Components

### Shared UI (built once, used by both lists)

- **`src/components/ui/pagination.tsx`** — standard shadcn/ui pagination
  primitives (`Pagination`, `PaginationContent`, `PaginationItem`,
  `PaginationLink`, `PaginationPrevious`, `PaginationNext`, `PaginationEllipsis`).
  Pure buttons + `cn`, no new dependency.
- **`src/components/ui/PaginationBar.tsx`** — a composed control wrapping the
  primitives: page buttons (with ellipsis for long ranges) + a page-size `Select`
  (existing `components/ui/select.tsx`) + an "X–Y of N" summary. Props:
  `{ page, pageSize, total, onPageChange, onPageSizeChange }`. Presentational only
  — no data fetching. Renders nothing when `total === 0`.
- **`src/hooks/usePagination.ts`** — owns `{ page, pageSize }`:
  - `pageSize` initialised from localStorage (key `hf.pageSize`), default `10`,
    validated against the allowed set `[5, 10, 20, 50]`; writes back on change.
  - `page` resets to 1 whenever a supplied `resetKey` (the query/filter signature)
    changes, and is clamped to `[1, ceil(total/pageSize)]` when `total` shrinks.
  - Exposes `{ page, pageSize, setPage, setPageSize }`. `page` is session-only
    (not persisted).
- **`PAGE_SIZE_OPTIONS = [5, 10, 20, 50] as const`** and `DEFAULT_PAGE_SIZE = 10`
  live next to the hook (single source for the selector + validation).

### Ingredients — server-side pagination

- **`searchLocalIngredients(query, opts)`** (`features/ingredients/api.ts`) gains a
  paged form:
  `searchLocalIngredients(query, { page, pageSize })` →
  `Promise<{ rows: Ingredient[]; total: number }>`.
  - Uses `.select('*', { count: 'exact' })`, the existing `.or(name,name_en,brand
    ilike)` filter (empty-query branch unchanged except paging), order
    `is_verified desc, name asc, id asc` (the `id` tiebreaker makes offset paging
    deterministic — names aren't unique), and `.range(from, to)` where
    `from = (page-1)*pageSize`, `to = from + pageSize - 1`.
  - Returns `{ rows: data ?? [], total: count ?? 0 }`.
- **`useLocalIngredientSearch`** updated to the paged signature
  (`query, { page, pageSize }, enabled`), query key includes page + pageSize,
  `placeholderData: keepPreviousData` so page changes don't flash empty.
- **`IngredientesPage`** wires `usePagination` (resetKey = `query`), passes
  `{ page, pageSize }` to the hook, renders `<PaginationBar total={data.total} …>`.

> The recipe-editor `IngredientAutocomplete` (the type-ahead dropdown, limit 12)
> is **out of scope** — it's narrowed by typing, not paged. Its call site keeps
> the existing limit-based signature, so the paged form is additive.

### Recipes — client-side pagination

- **`RecetasPage`** already computes the filtered/sorted recipe array in-memory.
  Add `usePagination` (resetKey = a signature of the active search text + filter
  chips), then render `paginated = filtered.slice((page-1)*pageSize, page*pageSize)`
  and `<PaginationBar total={filtered.length} …>`. `listRecipes`/`useRecipes`
  unchanged.

## Data flow

```
usePagination ({page,pageSize})  ──►  data source
  page resets on query change         · ingredients: server .range + count → {rows,total}
  pageSize persisted (localStorage)   · recipes: in-memory slice → total = filtered.length
        ▲                                   │
        └──────── PaginationBar (page btns + size Select + "X–Y of N") ◄── total
```

## i18n

New `pagination` namespace keys (ES + EN): page-size label, "X–Y of N" summary
(interpolated), prev/next aria-labels. Shared across both pages.

## Testing

- **`usePagination`** (Vitest + React hooks): default size from localStorage;
  persistence write-back; reset-to-1 on resetKey change; clamp when total shrinks;
  rejects invalid persisted values.
- **`searchLocalIngredients` paged**: `.range` from/to math and the returned
  `{ rows, total }` shape (mock the Supabase builder, mirroring existing api
  tests).
- **`PaginationBar`**: renders the right page buttons + ellipsis for a given
  `{page,total,pageSize}`, hides when `total===0`, fires `onPageChange`/`onPageSizeChange`.
- Recipe slice is trivial (covered by the page rendering).

## Out of scope / untouched

- Recipe-editor ingredient autocomplete dropdown (stays limit-12).
- `listRecipes` data layer (recipes stay fully-loaded + in-memory filtered).
- No cursor pagination (offset is fine at this scale with the deterministic order).
- Page size is a single shared preference for both lists (one localStorage key);
  per-list sizes are not warranted (YAGNI).
