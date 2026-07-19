# Error-handling sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One module decides what an error *means*; no raw database string ever reaches a user, and a failed fetch is never reported as "not found".

**Architecture:** A pure classifier (`src/lib/errors.ts`) maps an unknown thrown value to one of six kinds and to a `common:errors.*` i18n key. `toastError` and a new shared `QueryErrorState` component are its only two general consumers; five screens route their settled-but-failed queries through the component instead of collapsing `isError` into their not-found state.

**Tech Stack:** React 18 + TS, react-i18next (namespace-per-file JSON), TanStack Query, Vitest (Tier-1 `*.test.ts` = node, Tier-2 `*.test.tsx` = jsdom), shadcn/ui.

## Global Constraints

- **Worktree:** all work happens in `/home/hudson/dev/hudsons-fitness/.claude/worktrees/error-handling-sweep` on branch `claude/error-handling-sweep`. Never push to `develop`/`main`.
- **No AI/Claude attribution anywhere** — commits, comments, PR text. Plain conventional commits.
- **Commands run with `corepack pnpm …`** (bare `pnpm` is a Windows shim that crashes on Node 20).
- **Every new user-facing string is a key in BOTH `src/i18n/es/<ns>.json` and `src/i18n/en/<ns>.json`.** ES is `fallbackLng`. Indentation: 2 spaces, nested keys at 4.
- **i18n idiom:** components call `useTranslation('<ns>')`, aliasing a second namespace as `tCommon`. Non-component `.ts` modules use the singleton `i18n.t('ns:key')`.
- **Test idiom:** `import '@/i18n'` as a side effect (no `I18nextProvider` exists in this repo); mock data hooks at the **module** level with `vi.mock('../hooks', …)`, never mock `@tanstack/react-query`; each test file rolls its own local `renderWithClient`.
- **`errors.generic` is NOT dead** (the spec says it is — it is wrong). It has one live consumer at `src/pages/PhaseEditorPage.tsx:99`. Keep the key and its current copy; do not rename it.
- **`EmptyState`'s secondary-copy prop is `hint`, not `description`.**
- `refetchOnWindowFocus` is `false` (`src/app/providers.tsx:14`), so a failed query never silently recovers — retry affordances are load-bearing, not decorative.

## Out of scope (do not let this sweep grow)

- `ExerciseInfoButton.tsx:35` already renders a correct load-error + retry using `entrenamiento:exerciseDetail.loadError|retry`. It is left alone. Migrating it is a follow-up, not part of this PR.
- `PhaseEditorPage.tsx`'s local `errorMessage` helper (lines 212-219) stays where it is.
- `fetchRecipe` keeps `.single()`. The spec's decision is to distinguish not-found by **code** (`PGRST116`), not by changing the API to `.maybeSingle()`.
- Retry/backoff policy, offline queueing, error reporting to a service.

---

### Task 1: The classifier and its copy

**Files:**
- Create: `src/lib/errors.ts`
- Create: `src/lib/errors.test.ts`
- Modify: `src/i18n/es/common.json:14-16`
- Modify: `src/i18n/en/common.json:14-16`

**Interfaces:**
- Consumes: nothing.
- Produces: `export type ErrorKind = 'notFound' | 'denied' | 'duplicate' | 'offline' | 'staleSchema' | 'unknown'`; `export function classifyError(err: unknown): ErrorKind`; `export function errorMessageKey(kind: ErrorKind): string` (returns an `ns:key` string, always prefixed `common:`). Every later task depends on exactly these three names.

- [ ] **Step 1: Write the failing test**

Create `src/lib/errors.test.ts`:

```ts
// Characterizes the one place in the app that decides what an error *means*.
// The malformed-input cases are the point: a classifier that throws turns a
// handled error into a blank screen.
import { describe, it, expect } from 'vitest';
import { classifyError, errorMessageKey } from './errors';

describe('classifyError', () => {
  it('reads PGRST116 (no rows from .single()) as notFound', () => {
    expect(classifyError({ code: 'PGRST116', message: 'JSON object requested' })).toBe('notFound');
  });

  it('reads 42501 (RLS refused) as denied', () => {
    expect(classifyError({ code: '42501', message: 'permission denied' })).toBe('denied');
  });

  it('reads 23505 (unique violation) as duplicate', () => {
    expect(classifyError({ code: '23505', message: 'duplicate key value' })).toBe('duplicate');
  });

  it.each(['PGRST200', 'PGRST202', 'PGRST205'])('reads %s as staleSchema', (code) => {
    expect(classifyError({ code })).toBe('staleSchema');
  });

  it('reads a bare TypeError (fetch never reached the server) as offline', () => {
    expect(classifyError(new TypeError('Failed to fetch'))).toBe('offline');
  });

  it('falls back to unknown for an unrecognised code', () => {
    expect(classifyError({ code: 'PGRST999' })).toBe('unknown');
  });

  it('falls back to unknown for an Error carrying a message but no code', () => {
    expect(classifyError(new Error('boom'))).toBe('unknown');
  });

  it.each([[null], [undefined], ['a thrown string'], [42], [{}], [{ code: '' }], [{ code: 7 }]])(
    'never throws on malformed input: %s',
    (input) => {
      expect(classifyError(input)).toBe('unknown');
    },
  );
});

describe('errorMessageKey', () => {
  it('maps each kind to its own common-namespace key', () => {
    expect(errorMessageKey('notFound')).toBe('common:errors.notFound');
    expect(errorMessageKey('denied')).toBe('common:errors.denied');
    expect(errorMessageKey('duplicate')).toBe('common:errors.duplicate');
    expect(errorMessageKey('offline')).toBe('common:errors.offline');
    expect(errorMessageKey('staleSchema')).toBe('common:errors.staleSchema');
  });

  it('maps unknown to the pre-existing generic key rather than a new one', () => {
    expect(errorMessageKey('unknown')).toBe('common:errors.generic');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `corepack pnpm test src/lib/errors.test.ts`
Expected: FAIL — `Failed to resolve import "./errors"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/errors.ts`:

```ts
// One module decides what an error *means*. Nothing else in the app inspects
// error codes: consumers ask for a kind, or for the i18n key of a kind. The
// map grows by adding a code here — no consumer changes.
//
// Defensive by design: PostgREST rejects with a plain `{ code, message }`
// object, not an Error instance, so neither `instanceof Error` nor a bare
// property read is safe on its own.

export type ErrorKind =
  | 'notFound' // PGRST116 — .single() matched no rows
  | 'denied' // 42501 — RLS refused
  | 'duplicate' // 23505 — unique violation
  | 'offline' // fetch never reached the server
  | 'staleSchema' // PostgREST schema cache disagrees with the deployed frontend
  | 'unknown';

const CODE_KINDS: Record<string, ErrorKind> = {
  PGRST116: 'notFound',
  '42501': 'denied',
  '23505': 'duplicate',
  PGRST200: 'staleSchema',
  PGRST202: 'staleSchema',
  PGRST205: 'staleSchema',
};

function errorCode(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' && code ? code : null;
}

export function classifyError(err: unknown): ErrorKind {
  const code = errorCode(err);
  if (code) return CODE_KINDS[code] ?? 'unknown';
  // A request that never reached the server rejects with a TypeError and no
  // code — that is the browser's offline/DNS/CORS signal.
  if (err instanceof TypeError) return 'offline';
  return 'unknown';
}

/**
 * The single place a kind becomes copy, so no call site invents its own
 * wording. Returns an `ns:key` string, usable both from the i18n singleton in
 * `.ts` modules and from a namespaced `t` in components (an explicit prefix
 * wins over the hook's namespace).
 */
export function errorMessageKey(kind: ErrorKind): string {
  // `errors.generic` predates this module and is already used elsewhere; the
  // unknown kind reuses it rather than introducing a second generic string.
  return kind === 'unknown' ? 'common:errors.generic' : `common:errors.${kind}`;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `corepack pnpm test src/lib/errors.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Prove the assertions bite (mutation check)**

Temporarily change `CODE_KINDS.PGRST116` to `'unknown'` and re-run. Expected: the notFound case FAILS. Then temporarily change `errorMessageKey`'s unknown branch to return `'common:errors.unknown'` and re-run. Expected: that case FAILS. Revert both edits and confirm green again. A test that stays green against deliberately broken code is not a test.

- [ ] **Step 6: Add the copy — ES**

In `src/i18n/es/common.json`, replace the `errors` block (lines 14-16):

```json
  "errors": {
    "generic": "Algo ha ido mal. Inténtalo de nuevo.",
    "notFound": "No hemos encontrado lo que buscabas.",
    "denied": "No tienes permiso para hacer esto.",
    "duplicate": "Ya existe algo con ese nombre.",
    "offline": "Parece que no hay conexión. Comprueba tu red.",
    "staleSchema": "La app está desactualizada. Recarga la página para seguir.",
    "staleSchemaTitle": "Recarga la página",
    "loadFailedTitle": "No se ha podido cargar",
    "retry": "Reintentar",
    "reload": "Recargar",
    "boundary": {
      "title": "Algo ha ido mal",
      "body": "Se ha producido un error inesperado. Recarga la página o vuelve atrás.",
      "home": "Inicio"
    }
  },
```

- [ ] **Step 7: Add the copy — EN**

In `src/i18n/en/common.json`, replace the `errors` block (lines 14-16). Keep `generic`'s existing English copy verbatim:

```json
  "errors": {
    "generic": "Something went wrong. Please try again.",
    "notFound": "We couldn't find what you were looking for.",
    "denied": "You don't have permission to do that.",
    "duplicate": "Something with that name already exists.",
    "offline": "You appear to be offline. Check your connection.",
    "staleSchema": "The app is out of date. Reload the page to continue.",
    "staleSchemaTitle": "Reload the page",
    "loadFailedTitle": "Couldn't load",
    "retry": "Retry",
    "reload": "Reload",
    "boundary": {
      "title": "Something went wrong",
      "body": "An unexpected error occurred. Reload the page or go back.",
      "home": "Home"
    }
  },
```

- [ ] **Step 8: Verify both locales still parse and the suite is green**

Run: `corepack pnpm typecheck && corepack pnpm test src/lib/errors.test.ts`
Expected: typecheck clean (a malformed JSON breaks the static import in `src/i18n/index.ts`), test PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/errors.ts src/lib/errors.test.ts src/i18n/es/common.json src/i18n/en/common.json
git commit -m "feat(errors): add error classifier and shared error copy"
```

---

### Task 2: `toastError` stops leaking raw messages

**Files:**
- Modify: `src/lib/toast-helpers.ts:39-49`
- Create: `src/lib/toast-helpers.test.ts`

**Interfaces:**
- Consumes: `classifyError`, `errorMessageKey` from Task 1.
- Produces: `toastError(err: unknown): void` — **single-parameter, deliberately.**

> **Superseded during execution.** This task originally specified an optional
> second `message` parameter, per the spec. It cannot exist: `toastError` is
> passed straight to react-query's `onError`, which calls it as
> `(error, variables, context)`, and twelve mutations have a bare `string` as
> their variables type — so a failed delete rendered the raw uuid as the toast
> description. There is no runtime way to tell a deliberate translated string
> from a positional one, so the parameter was removed rather than guarded. A
> call site that needs custom copy calls `toast()` directly, or we add a
> distinctly-named function when one actually needs it.

- [ ] **Step 1: Write the failing test**

Create `src/lib/toast-helpers.test.ts`. This is the regression guard for the original bug — it asserts the raw message never reaches the toast, *including* when the error carries one:

```ts
// The regression guard: `toastError` used to pass `err.message` straight
// through, so PostgREST jargon reached users in English. These tests fail if
// any raw error text makes it into the toast description again.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import i18n from '@/i18n';

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ toast: (...args: unknown[]) => toast(...args) }));

import { toastError } from './toast-helpers';

describe('toastError', () => {
  beforeEach(async () => {
    toast.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await i18n.changeLanguage('es');
  });

  it('never shows the raw message, even when the error has one', () => {
    toastError(new Error('duplicate key value violates unique constraint "recipes_pkey"'));
    const { description } = toast.mock.calls[0][0];
    expect(description).not.toContain('recipes_pkey');
    expect(description).not.toContain('duplicate key value');
    expect(description).toBe(i18n.t('common:errors.generic'));
  });

  it('translates a recognised PostgREST error to its own copy', () => {
    toastError({ code: '23505', message: 'duplicate key value' });
    expect(toast.mock.calls[0][0].description).toBe(i18n.t('common:errors.duplicate'));
  });

  it('sends the raw error to the console, where it is useful', () => {
    const err = { code: '42501', message: 'permission denied for table recipes' };
    toastError(err);
    expect(console.error).toHaveBeenCalledWith(expect.any(String), err);
  });

  it('ignores every extra positional argument react-query passes', () => {
    // react-query calls onError(error, variables, context). `variables` is a
    // bare string on the delete mutations — this asserts that uuid never
    // reaches the user.
    (toastError as (...args: unknown[]) => void)(
      { code: '23505' },
      'a3f1c2de-0000-4444-8888-000000000000',
      undefined,
    );
    expect(toast.mock.calls[0][0].description).toBe(i18n.t('common:errors.duplicate'));
  });

  it('still uses the destructive variant and the shared error title', () => {
    toastError(new Error('boom'));
    expect(toast.mock.calls[0][0]).toMatchObject({
      variant: 'destructive',
      title: i18n.t('common:toasts.errorTitle'),
    });
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `corepack pnpm test src/lib/toast-helpers.test.ts`
Expected: FAIL — the first test reports the description containing `recipes_pkey`.

- [ ] **Step 3: Rewrite `toastError`**

In `src/lib/toast-helpers.ts`, add to the imports at the top of the file:

```ts
import { classifyError, errorMessageKey } from '@/lib/errors';
```

Then replace lines 39-49 in full:

```ts
/**
 * Shows a translated, classified message. The raw error goes to the console,
 * which is where it is useful — the `.message` path was removed rather than
 * kept as a fallback, because a default that leaks is a default that will leak
 * again.
 *
 * Deliberately single-parameter. This function is passed straight to
 * react-query's `onError`, which calls it as `(error, variables, context)`; a
 * second parameter would silently render those variables — a raw uuid, for the
 * delete mutations — as the toast description.
 */
export function toastError(err: unknown) {
  console.error('Operation failed', err);
  toast({
    variant: 'destructive',
    title: i18n.t('common:toasts.errorTitle'),
    description: i18n.t(errorMessageKey(classifyError(err))),
  });
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `corepack pnpm test src/lib/toast-helpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm no call site broke**

Run: `corepack pnpm typecheck && corepack pnpm lint`
Expected: both clean. `toastError` gained an optional parameter, so every existing one-argument call still compiles.

Note: `common:toasts.errorGeneric` is now unreferenced. Leave the key in place — deleting copy is a separate, reversible decision and not worth coupling to this change.

- [ ] **Step 6: Commit**

```bash
git add src/lib/toast-helpers.ts src/lib/toast-helpers.test.ts
git commit -m "fix(toasts): translate error toasts instead of leaking raw messages"
```

---

### Task 3: The shared `QueryErrorState`

**Files:**
- Create: `src/components/QueryErrorState.tsx`
- Create: `src/components/QueryErrorState.test.tsx`

**Interfaces:**
- Consumes: `classifyError`, `errorMessageKey` (Task 1); `EmptyState` from `@/components/ui/EmptyState` (its props are `icon`, `title`, `hint?`, `action?`, `className?`).
- Produces:

```ts
interface Props {
  error: unknown;
  notFound: ReactNode;
  onRetry?: () => void;
  className?: string;
}
export function QueryErrorState({ error, notFound, onRetry, className }: Props): JSX.Element;
```

Tasks 4-7 all render this with exactly these prop names. `notFound` is each screen's **existing** not-found node, passed in — only the failure states are shared.

- [ ] **Step 1: Write the failing test**

Create `src/components/QueryErrorState.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@/i18n';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '@/i18n';
import { QueryErrorState } from './QueryErrorState';

const notFound = <p>NOT FOUND SLOT</p>;

describe('QueryErrorState', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('es');
  });

  it('renders the screen\'s own not-found node for PGRST116', () => {
    render(<QueryErrorState error={{ code: 'PGRST116' }} notFound={notFound} />);
    expect(screen.getByText('NOT FOUND SLOT')).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('common:errors.loadFailedTitle'))).not.toBeInTheDocument();
  });

  it('renders a load failure — not the not-found node — when the fetch failed', () => {
    render(<QueryErrorState error={new TypeError('Failed to fetch')} notFound={notFound} />);
    expect(screen.getByText(i18n.t('common:errors.loadFailedTitle'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('common:errors.offline'))).toBeInTheDocument();
    expect(screen.queryByText('NOT FOUND SLOT')).not.toBeInTheDocument();
  });

  it('uses the generic copy for an unrecognised error', () => {
    render(<QueryErrorState error={{ code: 'PGRST999' }} notFound={notFound} />);
    expect(screen.getByText(i18n.t('common:errors.generic'))).toBeInTheDocument();
  });

  it('offers a retry that calls onRetry', () => {
    const onRetry = vi.fn();
    render(<QueryErrorState error={new TypeError('x')} notFound={notFound} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common:errors.retry') }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('omits the retry button when no onRetry is given', () => {
    render(<QueryErrorState error={new TypeError('x')} notFound={notFound} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('tells the user to reload on a stale-schema error, with no retry', () => {
    render(<QueryErrorState error={{ code: 'PGRST205' }} notFound={notFound} onRetry={vi.fn()} />);
    expect(screen.getByText(i18n.t('common:errors.staleSchemaTitle'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('common:errors.staleSchema'))).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n.t('common:errors.reload') }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: i18n.t('common:errors.retry') })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `corepack pnpm test src/components/QueryErrorState.test.tsx`
Expected: FAIL — cannot resolve `./QueryErrorState`.

- [ ] **Step 3: Write the component**

Create `src/components/QueryErrorState.tsx`:

```tsx
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { classifyError, errorMessageKey } from '@/lib/errors';

interface Props {
  /** The query's `error`. */
  error: unknown;
  /**
   * The screen's own not-found state, rendered when the error really means
   * "no rows". Every screen keeps its own copy and its own way back; only the
   * failure states are shared.
   */
  notFound: ReactNode;
  /** Usually the query's `refetch`. Omit where retrying makes no sense. */
  onRetry?: () => void;
  className?: string;
}

/**
 * Renders a settled-but-failed query honestly. Before this existed, screens
 * collapsed `isError || !data` into their not-found state, so a network
 * timeout told the user their recipe had been deleted.
 */
export function QueryErrorState({ error, notFound, onRetry, className }: Props) {
  const { t } = useTranslation('common');
  const kind = classifyError(error);

  if (kind === 'notFound') return <>{notFound}</>;

  // A stale schema means the deploy is broken; retrying the same query cannot
  // help, so the only affordance offered is the one that actually fixes it.
  const stale = kind === 'staleSchema';

  return (
    <EmptyState
      className={className}
      icon={AlertTriangle}
      title={t(stale ? 'errors.staleSchemaTitle' : 'errors.loadFailedTitle')}
      hint={t(errorMessageKey(kind))}
      action={
        stale ? (
          <Button variant="outline" onClick={() => window.location.reload()}>
            {t('errors.reload')}
          </Button>
        ) : onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            {t('errors.retry')}
          </Button>
        ) : undefined
      }
    />
  );
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `corepack pnpm test src/components/QueryErrorState.test.tsx`
Expected: PASS.

- [ ] **Step 5: Prove the central assertion bites**

Temporarily delete the `if (kind === 'notFound') return <>{notFound}</>;` line and re-run. Expected: the first test FAILS (the not-found slot no longer renders). Restore it and confirm green. This is the exact bug the sweep exists to prevent.

- [ ] **Step 6: Commit**

```bash
git add src/components/QueryErrorState.tsx src/components/QueryErrorState.test.tsx
git commit -m "feat(ui): add shared QueryErrorState for failed queries"
```

---

### Task 4: `RecetaDetailPage` — the screen that cost the debugging time

**Files:**
- Modify: `src/pages/RecetaDetailPage.tsx:44-93`
- Modify: `src/pages/RecetaDetailPage.test.tsx` (existing — its `useRecipe` mocks need two new fields)

**Interfaces:**
- Consumes: `QueryErrorState` (Task 3). `useRecipe(id)` (`src/features/recipes/hooks.ts:22-28`) is a plain `useQuery`, so `error` and `refetch` are already on its result — no hook change needed.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update the existing mocks first**

Open `src/pages/RecetaDetailPage.test.tsx`. Every `useRecipe` mock return object must gain `error: null` and `refetch: vi.fn()`; the component will now destructure both, and a mock lacking `refetch` throws when the retry renders. Find each object literal returned for `useRecipe` (the file mocks the hooks module; hits are around lines 138, 164, 350) and extend it, e.g.:

```ts
useRecipe: () => ({ data: recipe, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
```

Run: `corepack pnpm test src/pages/RecetaDetailPage.test.tsx`
Expected: still PASS — this step changes nothing observable, it only prepares the mocks.

- [ ] **Step 2: Write the failing tests**

Append to `src/pages/RecetaDetailPage.test.tsx`, inside the top-level `describe`. Match the file's existing mock idiom — if it mocks `@/features/recipes/hooks` with a module factory, add a mutable `recipeQuery` variable the factory reads so each test can set the query result:

```tsx
  it('shows a load failure, not "not found", when the fetch fails', async () => {
    recipeQuery = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new TypeError('Failed to fetch'),
      refetch: vi.fn(),
    };
    renderPage();
    expect(await screen.findByText(i18n.t('common:errors.loadFailedTitle'))).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('recetas:detail.notFoundTitle'))).not.toBeInTheDocument();
  });

  it('still shows "not found" when the recipe genuinely does not exist', async () => {
    recipeQuery = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: { code: 'PGRST116', message: 'JSON object requested' },
      refetch: vi.fn(),
    };
    renderPage();
    expect(await screen.findByText(i18n.t('recetas:detail.notFoundTitle'))).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('common:errors.loadFailedTitle'))).not.toBeInTheDocument();
  });
```

Reuse the file's existing render helper rather than inventing `renderPage` if one is already defined; the two assertions are what matter. Add `import i18n from '@/i18n';` if the file does not already import it as a value.

- [ ] **Step 3: Run the tests and watch them fail**

Run: `corepack pnpm test src/pages/RecetaDetailPage.test.tsx`
Expected: the first new test FAILS — the page renders `detail.notFoundTitle` for a network error. That failure *is* the bug.

- [ ] **Step 4: Rewrite the branch**

In `src/pages/RecetaDetailPage.tsx`, add to the imports:

```tsx
import { Navigate } from 'react-router-dom';
import { QueryErrorState } from '@/components/QueryErrorState';
```

(`Navigate` joins the existing `react-router-dom` import on line 2 — do not add a second import statement from the same module.)

Change line 47 to add the `common` namespace alongside `recetas`:

```tsx
  const { t, i18n } = useTranslation('recetas');
  const { t: tCommon } = useTranslation('common');
```

Change line 51 to pull `error` and `refetch`:

```tsx
  const { data: recipe, isLoading, isError, error, refetch } = useRecipe(id);
```

Then replace the whole `if (isError || !recipe || !id)` block (lines 78-93) with:

```tsx
  // A missing id is a malformed URL, not a fetch result — there is nothing to
  // report about a request that was never made.
  if (!id) {
    return <Navigate to="/recipes" replace />;
  }

  const notFoundState = (
    <EmptyState
      icon={Utensils}
      title={t('detail.notFoundTitle')}
      hint={t('detail.notFoundHint')}
      action={
        <Button asChild variant="outline">
          <Link to="/recipes">{t('detail.backToList')}</Link>
        </Button>
      }
    />
  );

  if (isError) {
    const notFound = classifyError(error) === 'notFound';
    return (
      <PageShell
        title={notFound ? t('detail.notFoundTitle') : tCommon('errors.loadFailedTitle')}
        back="/recipes"
      >
        <QueryErrorState
          error={error}
          notFound={notFoundState}
          onRetry={() => void refetch()}
        />
      </PageShell>
    );
  }

  if (!recipe) {
    return (
      <PageShell title={t('detail.notFoundTitle')} back="/recipes">
        {notFoundState}
      </PageShell>
    );
  }
```

This needs one more import for the title decision:

```tsx
import { classifyError } from '@/lib/errors';
```

The page title matters: leaving it as "Receta no encontrada" while the body says "no se ha podido cargar" reproduces the original bug in the header.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `corepack pnpm test src/pages/RecetaDetailPage.test.tsx`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 6: Commit**

```bash
git add src/pages/RecetaDetailPage.tsx src/pages/RecetaDetailPage.test.tsx
git commit -m "fix(recipes): distinguish a failed recipe fetch from a missing recipe"
```

---

### Task 5: `ExerciseDetailPage`

**Files:**
- Modify: `src/pages/ExerciseDetailPage.tsx:13,27-32`
- Modify: `src/pages/ExerciseDetailPage.test.tsx` (existing — mocks at ~lines 37, 43, 49)

**Interfaces:**
- Consumes: `QueryErrorState` (Task 3). `useExercise(id, opts?)` (`src/features/training/exercises/hooks.ts:36-45`) is a plain `useQuery`; `error` and `refetch` are available.
- Produces: nothing.

- [ ] **Step 1: Update the existing mocks**

In `src/pages/ExerciseDetailPage.test.tsx`, add `error: null, refetch: vi.fn()` to every `useExercise` mock return object.

Run: `corepack pnpm test src/pages/ExerciseDetailPage.test.tsx`
Expected: still PASS.

- [ ] **Step 2: Write the failing tests**

```tsx
  it('shows a load failure, not "not found", when the fetch fails', async () => {
    exerciseQuery = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new TypeError('Failed to fetch'),
      refetch: vi.fn(),
    };
    renderPage();
    expect(await screen.findByText(i18n.t('common:errors.loadFailedTitle'))).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('entrenamiento:browse.notFound.title'))).not.toBeInTheDocument();
  });

  it('still shows "not found" for PGRST116', async () => {
    exerciseQuery = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: { code: 'PGRST116' },
      refetch: vi.fn(),
    };
    renderPage();
    expect(await screen.findByText(i18n.t('entrenamiento:browse.notFound.title'))).toBeInTheDocument();
  });
```

Adapt `exerciseQuery`/`renderPage` to the file's existing helpers.

- [ ] **Step 3: Run and watch the first one fail**

Run: `corepack pnpm test src/pages/ExerciseDetailPage.test.tsx`
Expected: FAIL on the load-failure test.

- [ ] **Step 4: Rewrite the branch**

Replace `src/pages/ExerciseDetailPage.tsx` in full:

```tsx
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageShell } from '@/components/layout/PageShell';
import { QueryErrorState } from '@/components/QueryErrorState';
import { ExerciseDetail } from '@/features/training/components/ExerciseDetail';
import { useExercise } from '@/features/training/exercises/hooks';

export function ExerciseDetailPage() {
  const { t } = useTranslation('entrenamiento');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useExercise(id);

  const notFoundState = (
    <div className="space-y-3 py-10 text-center">
      <h1 className="text-lg font-semibold">{t('browse.notFound.title')}</h1>
      <p className="text-sm text-muted-foreground">{t('browse.notFound.body')}</p>
      <Button asChild variant="outline"><Link to="/exercises">{t('browse.notFound.back')}</Link></Button>
    </div>
  );

  return (
    <PageShell
      title={t('exerciseDetail.title')}
      back={() => (window.history.length > 1 ? navigate(-1) : navigate('/exercises'))}
    >
      {isLoading ? (
        <div role="status" className="space-y-3">
          <Skeleton className="aspect-4/3 w-full" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : isError ? (
        <QueryErrorState error={error} notFound={notFoundState} onRetry={() => void refetch()} />
      ) : !data ? (
        notFoundState
      ) : (
        <ExerciseDetail exercise={data} density="full" />
      )}
    </PageShell>
  );
}
```

The page title is a constant here (`exerciseDetail.title`), so unlike Task 4 there is no header to correct.

- [ ] **Step 5: Run and watch them pass**

Run: `corepack pnpm test src/pages/ExerciseDetailPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ExerciseDetailPage.tsx src/pages/ExerciseDetailPage.test.tsx
git commit -m "fix(training): distinguish a failed exercise fetch from a missing exercise"
```

---

### Task 6: `RecipePeek`

**Files:**
- Modify: `src/features/planning/components/RecipePeek.tsx:50,95-109`
- Create or modify: `src/features/planning/components/RecipePeek.test.tsx`

**Interfaces:**
- Consumes: `QueryErrorState` (Task 3).
- Produces: nothing.

The existing code comment at lines 104-105 already admits the conflation ("a failed fetch, or a recipe that vanished"). This task removes the excuse rather than the comment.

- [ ] **Step 1: Write the failing test**

If `RecipePeek.test.tsx` does not exist, create it following the `QuickAddStrip.test.tsx` idiom (side-effect `import '@/i18n'`, a local `renderWithClient`, `vi.mock` of the hooks module). The two assertions:

```tsx
  it('shows a load failure when the recipe fetch fails', async () => {
    recipeQuery = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new TypeError('Failed to fetch'),
      refetch: vi.fn(),
    };
    renderPeek();
    expect(await screen.findByText(i18n.t('common:errors.loadFailedTitle'))).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('planning:peek.missing'))).not.toBeInTheDocument();
  });

  it('shows its own missing copy when the recipe is gone', async () => {
    recipeQuery = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: { code: 'PGRST116' },
      refetch: vi.fn(),
    };
    renderPeek();
    expect(await screen.findByText(i18n.t('planning:peek.missing'))).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run and watch it fail**

Run: `corepack pnpm test src/features/planning/components/RecipePeek.test.tsx`
Expected: FAIL on the first test.

- [ ] **Step 3: Wire the component**

Add the import:

```tsx
import { QueryErrorState } from '@/components/QueryErrorState';
```

Change line 50 to:

```tsx
  const { data: recipe, isLoading, isError, error, refetch } = useRecipe(recipeId);
```

Replace the branch at lines 95-109's error/missing arm. Keep the existing `<p>` as the not-found node — its copy is already honest — and insert an `isError` arm ahead of the `!recipe || !perServing` one:

```tsx
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : isError ? (
              <QueryErrorState
                className="py-6"
                error={error}
                notFound={missingState}
                onRetry={() => void refetch()}
              />
            ) : !recipe || !perServing ? (
              missingState
            ) : (
```

with `missingState` defined above the return, next to the other derived values:

```tsx
  // Settled with nothing to show — a recipe that vanished. A *failed* fetch is
  // no longer routed here; it gets its own state with a retry.
  const missingState = (
    <p className="py-6 text-center text-[13px] text-muted-foreground">{t('peek.missing')}</p>
  );
```

`className="py-6"` tightens `EmptyState`'s default `py-12`, which is sized for a full page and too tall inside the peek sheet.

- [ ] **Step 4: Run and watch it pass**

Run: `corepack pnpm test src/features/planning/components/RecipePeek.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/planning/components/RecipePeek.tsx src/features/planning/components/RecipePeek.test.tsx
git commit -m "fix(planner): give the recipe peek an honest load-failure state"
```

---

### Task 7: `RecetaEditorPage` — no more silent redirect, no more raw save error

**Files:**
- Modify: `src/pages/RecetaEditorPage.tsx:44,72-77,105-107`
- Modify or create: `src/pages/RecetaEditorPage.test.tsx`

**Interfaces:**
- Consumes: `QueryErrorState` (Task 3), `classifyError`/`errorMessageKey` (Task 1).
- Produces: nothing. **`RecipeEditorForm` is deliberately not modified** — its `error: string | null` prop stays, and this task translates the string before passing it in. Fixing it at the source means the form's existing render at lines 597-601 becomes correct with no change, and both branches of `{validationError ?? error}` are now translated.

- [ ] **Step 1: Write the failing tests**

Two behaviours, both currently broken:

```tsx
  it('shows a load failure instead of silently redirecting to the list', async () => {
    recipeQuery = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new TypeError('Failed to fetch'),
      refetch: vi.fn(),
    };
    renderEditor('/recipes/abc/edit');
    expect(await screen.findByText(i18n.t('common:errors.loadFailedTitle'))).toBeInTheDocument();
  });

  it('shows a translated save error, never the raw database message', async () => {
    saveMutation.mutateAsync = vi.fn().mockRejectedValue({
      code: '23505',
      message: 'duplicate key value violates unique constraint "recipes_name_key"',
    });
    renderEditor('/recipes/new');
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common:save') }));
    expect(await screen.findByText(i18n.t('common:errors.duplicate'))).toBeInTheDocument();
    expect(screen.queryByText(/recipes_name_key/)).not.toBeInTheDocument();
  });
```

Adapt the harness (`recipeQuery`, `saveMutation`, `renderEditor`) to whatever the file already defines; if the file does not exist, build it on the `QuickAddStrip.test.tsx` idiom, mocking `@/features/recipes/hooks`. The save test needs the form to reach submit — if filling the required fields makes the test unwieldy, assert on the second behaviour by rendering `RecipeEditorForm` directly with a pre-translated `error` prop and keep the classification assertion as a unit test of the catch block's expression.

- [ ] **Step 2: Run and watch them fail**

Run: `corepack pnpm test src/pages/RecetaEditorPage.test.tsx`
Expected: FAIL — the first renders nothing (it redirects), the second shows `recipes_name_key`.

- [ ] **Step 3: Replace the silent redirect**

In `src/pages/RecetaEditorPage.tsx`, add the imports:

```tsx
import { QueryErrorState } from '@/components/QueryErrorState';
import { classifyError, errorMessageKey } from '@/lib/errors';
```

Change line 44 so the query result is available in full:

```tsx
  const recipeQuery = useRecipe(isNew ? null : id);
```

(unchanged — it already returns the whole result; `recipeQuery.error` and `recipeQuery.refetch` are reachable.)

Replace lines 75-77:

```tsx
  if (!isNew && recipeQuery.isError) {
    // This used to `<Navigate to="/recipes" replace />` — the user's edit
    // vanished with no explanation whenever the load failed.
    return (
      <QueryErrorState
        error={recipeQuery.error}
        notFound={
          <div className="space-y-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">{t('detail.notFoundTitle')}</p>
            <Button asChild variant="outline">
              <Link to="/recipes">{t('detail.backToList')}</Link>
            </Button>
          </div>
        }
        onRetry={() => void recipeQuery.refetch()}
      />
    );
  }
```

If `Button` and `Link` are not already imported in this file, add them (`@/components/ui/button`, `react-router-dom`). Remove the now-unused `Navigate` import if nothing else in the file uses it — `pnpm lint` will flag it.

- [ ] **Step 4: Translate the save error**

Replace the catch at lines 105-107:

```tsx
    } catch (err) {
      console.error('Recipe save failed', err);
      setError(tCommon(errorMessageKey(classifyError(err))));
    }
```

`tCommon` is already bound at line 42. `error` stays `string | null`, so `RecipeEditorForm` needs no change and its `{validationError ?? error}` render is now translated on both sides.

- [ ] **Step 5: Run and watch them pass**

Run: `corepack pnpm test src/pages/RecetaEditorPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/RecetaEditorPage.tsx src/pages/RecetaEditorPage.test.tsx
git commit -m "fix(recipes): explain editor load and save failures instead of hiding them"
```

---

### Task 8: `ErrorBoundary` — translated, and no `<pre>` of raw error text

**Files:**
- Modify: `src/components/ErrorBoundary.tsx:1-56`
- Create: `src/components/ErrorBoundary.test.tsx`

**Interfaces:**
- Consumes: the `common:errors.boundary.*` keys from Task 1.
- Produces: nothing.

It is a class component, so it cannot use `useTranslation`; it reads the i18n singleton the same way `toast-helpers.ts` does. It will not re-render on a language switch — acceptable for a crash screen, and noted in a comment so nobody "fixes" it later.

- [ ] **Step 1: Write the failing test**

Create `src/components/ErrorBoundary.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@/i18n';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '@/i18n';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('SECRET INTERNAL DETAIL');
}

describe('ErrorBoundary', () => {
  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await i18n.changeLanguage('es');
  });

  it('shows translated copy, not hardcoded Spanish', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(i18n.t('common:errors.boundary.title'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('common:errors.boundary.body'))).toBeInTheDocument();
  });

  it('never renders the raw error message to the user', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.queryByText(/SECRET INTERNAL DETAIL/)).not.toBeInTheDocument();
  });

  it('renders children untouched when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('fine')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `corepack pnpm test src/components/ErrorBoundary.test.tsx`
Expected: FAIL — the second test finds `SECRET INTERNAL DETAIL` in the `<pre>`.

- [ ] **Step 3: Rewrite the component**

Replace `src/components/ErrorBoundary.tsx` lines 1-3 and the `render` body:

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import i18n from '@/i18n';
```

```tsx
  render() {
    if (this.state.error) {
      // A class component cannot use `useTranslation`, so it reads the i18n
      // singleton like the other non-hook modules do. It will not re-render on
      // a language switch — acceptable for a crash screen, which the user
      // leaves by reloading anyway.
      return (
        <div className="min-h-dvh flex items-center justify-center p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>{i18n.t('common:errors.boundary.title')}</CardTitle>
              <CardDescription>{i18n.t('common:errors.boundary.body')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button onClick={this.handleReset}>{i18n.t('common:errors.retry')}</Button>
                <Button variant="outline" onClick={() => window.location.assign('/')}>
                  {i18n.t('common:errors.boundary.home')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
```

The `<pre>` is gone; `componentDidCatch` (line 20-22) already sends the error and the component stack to `console.error`, which is where a developer can read it.

- [ ] **Step 4: Run and watch it pass**

Run: `corepack pnpm test src/components/ErrorBoundary.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ErrorBoundary.tsx src/components/ErrorBoundary.test.tsx
git commit -m "fix(errors): translate the error boundary and stop showing raw error text"
```

---

### Task 9: Whole-branch verification and the browser pass

**Files:** none modified unless verification turns something up.

- [ ] **Step 1: Run the full gate yourself**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm build && corepack pnpm test`

Expected: all four clean. The full test run takes ~11-15 minutes and buffers its output until it exits — that is not a hang. Do not accept a subagent's report of green; run it yourself.

- [ ] **Step 2: Confirm the tree is clean**

Run: `git status --short`
Expected: empty. Anything left over means a task committed partially.

- [ ] **Step 3: Real-browser pass (jsdom cannot see CSS)**

Run `corepack pnpm dev`, then in devtools set the network to **Offline** and exercise, at mobile width (~390px):

1. `/recipes/<id>` — expect the load-failure state with a working Reintentar, **not** "Receta no encontrada".
2. `/recipes/<id>/edit` — expect the failure state, **not** a bounce to the list.
3. The planner's recipe peek — expect the compact failure state, correctly sized inside the sheet (this is the one most likely to look wrong; `EmptyState` is page-sized by default).
4. `/exercises/<id>` — expect the load-failure state.
5. Back online, trigger a save error and confirm the toast shows translated copy with no database jargon.

Confirm the icon, spacing and button are not clipped in any of them, in both light and dark theme.

- [ ] **Step 4: Check for a stale not-found still lurking**

Run: `grep -rn "isError || " src/`
Expected: no hits outside the files this plan touched. Any survivor is the same latent bug on another screen — report it rather than silently expanding this PR.

- [ ] **Step 5: Open the PR**

Only once every step above is green. `develop` auto-merges a `claude/*` PR the moment CI passes, so do not open it while anything is still in flight.

```bash
git push -u origin claude/error-handling-sweep
gh pr create --base develop --title "fix(errors): one classifier, no raw messages, honest empty states" --body "<summary of the six behaviours fixed>"
```
