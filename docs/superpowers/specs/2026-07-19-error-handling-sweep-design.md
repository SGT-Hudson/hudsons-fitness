# Error handling — one classifier, no raw messages, honest empty states

**Date:** 2026-07-19
**Thread:** error-handling sweep (spawned by the R-36 final review)
**Type:** cross-cutting refactor

## Problem

Three symptoms, one root cause: nothing in the app decides what an error
*means* before showing it.

1. **Raw technical strings reach the user.** `toastError`
   (`src/lib/toast-helpers.ts:39-49`) uses `err.message` whenever the error has
   one, falling back to a translated string only when it does not. Since
   PostgREST and Postgres errors always carry a message, the translated fallback
   is nearly dead code and the user gets English database jargon. The recipe
   editor is worse still: it renders the raw `.message` inline
   (`RecetaEditorPage.tsx:134-136` → `RecipeEditorForm.tsx:597-601`) beside a
   validation error that *is* properly translated.
2. **Fetch failures are reported as "not found".** `RecetaDetailPage.tsx:78-90`
   branches on `isError || !recipe || !id` and renders the same
   "Receta no encontrada" for all three. `ExerciseDetailPage.tsx:27` does the
   same. A network timeout tells the user their recipe does not exist. During
   R-36's browser pass this turned a schema mismatch into "every recipe appears
   deleted" — the symptom cost real debugging time.
3. **The global `ErrorBoundary` is untranslated** (`src/components/ErrorBoundary.tsx`)
   and prints `error.message` to the user in a `<pre>`.

A sweep is warranted rather than a local fix: no page in the codebase
distinguishes "not found" from "load failed". `ExerciseInfoButton.tsx:35` is the
only site that branches on `isError` at all. Fixing only the two recipe screens
leaves the identical bug latent everywhere else.

**A constraint that shapes the design:** `fetchRecipe` uses `.single()`, which
**errors** with `PGRST116` when no rows match. "Not found" therefore arrives as
an error, not as `data == null`. Distinguishing the cases requires inspecting
the error's code — branching on `isError` versus falsy data cannot work.

## Decisions

1. **A code map from the start**, not a blanket generic message (approved).
   Known codes get specific translated copy; everything else falls back to
   generic.
2. **Five seeded categories plus unknown** (approved): not found, permission
   denied, duplicate, offline, stale schema.
3. **Stale-schema errors get their own honest message** rather than hiding
   behind the generic one — they mean the deploy is broken, and the user
   reloading is the correct remedy.

## Design

### The classifier — `src/lib/errors.ts`

One module decides what an error is. Nothing else inspects error codes.

```ts
export type ErrorKind =
  | 'notFound'      // PGRST116 — no rows
  | 'denied'        // 42501 — RLS refused
  | 'duplicate'     // 23505 — unique violation
  | 'offline'       // TypeError from a failed fetch, no code
  | 'staleSchema'   // PGRST200 / PGRST202 / PGRST205
  | 'unknown';      // anything unrecognised

export function classifyError(err: unknown): ErrorKind;
export function errorMessageKey(kind: ErrorKind): string;  // common:errors.*
```

`classifyError` reads the `code` property off PostgREST/Postgres errors and
falls back to shape-detection for the network case. Anything unrecognised is
`unknown` — the map grows by adding a case here, with no consumer changes.

`errorMessageKey` is the single place a kind becomes copy, so no call site
invents its own wording.

### `toastError` stops leaking

```ts
export function toastError(err: unknown, message?: string): void;
```

It classifies, translates, and shows that. The raw error goes to
`console.error`, which is where it is useful. The optional `message` is for a
call site that genuinely knows better and passes an **already-translated**
string.

The `.message` path is removed rather than kept as a fallback. A default that
leaks is a default that will leak again; relying on every future call site to
remember is exactly what failed here.

### Query failures render honestly

A shared component renders a settled-but-failed query:

```
<QueryErrorState error={unknown} onRetry={() => void} />
```

It classifies and picks copy: `notFound` keeps each screen's existing
not-found empty state, `offline` and `unknown` get a load-failure state with a
retry button, and `staleSchema` gets the reload message. It builds on the
existing `EmptyState` (`src/components/ui/EmptyState.tsx`) rather than
introducing a second empty-state idiom.

Call sites updated:

- `RecetaDetailPage.tsx` — replaces the `isError || !recipe || !id` collapse.
  A missing `id` is a malformed URL, not a fetch result; it keeps redirecting.
- `ExerciseDetailPage.tsx` — same collapse, same fix.
- `RecipePeek.tsx` — its copy is already honest but it never reads `isError`;
  routed through the same component so the three states are consistent.
- `RecetaEditorPage.tsx:75-77` — today a load failure silently redirects to the
  recipe list, so the user sees their edit vanish with no explanation. It shows
  the failure state instead.
- `RecipeEditorForm.tsx:597-601` — the inline save error is translated through
  the classifier, matching the validation error beside it.

### `ErrorBoundary`

Its hardcoded Spanish strings move to the `common` namespace, and the raw
`error.message` moves from the `<pre>` to `console.error`. Scope stops there —
it catches render throws only, and a failed react-query fetch never reaches it
(the app does not use `throwOnError`).

### i18n

New keys in the `common` namespace, both locales:
`errors.notFound`, `errors.denied`, `errors.duplicate`, `errors.offline`,
`errors.staleSchema`, plus the retry action and the boundary's strings.
`errors.generic` already exists and becomes the `unknown` copy — it is currently
defined and unused.

## Testing

- **Classifier:** one case per code, including an error with no code, a plain
  `TypeError`, a thrown string, and `null`. It must never throw on malformed
  input — a classifier that crashes turns a handled error into a blank screen.
- **`toastError`:** asserts the raw message never reaches the toast, including
  when the error carries a `.message`. This is the regression guard for the
  original bug.
- **Per screen:** a failed fetch renders the load-failure state and **not** the
  not-found state, and a `PGRST116` renders not-found. These are the tests that
  would have caught the R-36 browser-pass symptom.
- **Real-browser check:** jsdom cannot see CSS, so confirm in a browser that the
  failure states render correctly on mobile — throttle or block the Supabase
  request in devtools to trigger them.

## Out of scope

Retry/backoff policy, offline queueing, and error reporting to a service. This
change decides what an error *means* and what the user is told; it does not
change what the app *does* about it.
