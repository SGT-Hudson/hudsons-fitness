# B2b — ExerciseDetail component + in-workout popup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface every exercise's bilingual step-by-step instructions + start/end images as an in-workout popup, rendered by one reusable presentational `ExerciseDetail` component (adaptive `density`), triggered by an `Info` button on the runner / picker / session-editor / routine-editor rows.

**Architecture:** A pure `ExerciseDetail({ exercise, density })` (no data fetching) composed from `ExerciseImageLoop` (CSS start↔end loop + tap-to-enlarge) + a metadata badge header + an instructions list. A drop-in `ExerciseInfoButton` owns the trigger, a responsive shell (shadcn `Drawer` on mobile / Radix `Dialog` on desktop via `useMediaQuery`), and data resolution — it takes a ready `exercise` (three surfaces) or an `exerciseId` it fetches via a new `useExercise(id)` (the runner only). No schema/migration/RPC work; pure frontend on B2a's already-merged data.

**Tech Stack:** React 18 + Vite + TS + Tailwind + shadcn/ui (Radix + CVA) + `vaul` (new, for Drawer) + TanStack Query → Supabase. Node 20 + pnpm 10 via `corepack pnpm` (pnpm 11 crashes — never use bare `pnpm`). Vitest (Tier-1 `*.test.ts` in Node, Tier-2 `*.test.tsx` in jsdom via `environmentMatchGlobs`). Branch `claude/b2b-exercise-detail` off `develop` (B2a merged via #164); worktree `/mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail`. PR → `develop`, squash auto-merge.

**Spec:** `docs/superpowers/specs/2026-06-07-b2b-exercise-detail-component-design.md`.

---

## Conventions for every task

- The worktree is `/mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail` (called `$WT` below — substitute the full path). All commands use `corepack pnpm --dir "$WT" …`.
- TDD where there's logic: write the failing test, run it red, implement, run it green, commit.
- Commit after every task with a plain conventional message (no AI attribution — repo is public).
- The full `pnpm test` run is ~11–15 min; per task run only the **targeted** test file. The full suite + `typecheck`/`lint`/`build` run once at the end (Task 14).
- Do **not** run `supabase` / `db reset` — B2b has no DB work and the Docker stack is shared with other sessions.

## File Structure

| File | New/Mod | Responsibility |
|---|---|---|
| `package.json` + `pnpm-lock.yaml` | Mod | add `vaul` (Task 4) |
| `tailwind.config.js` | Mod | `exercise-frame` keyframe + animation (Task 6) |
| `src/components/ui/drawer.tsx` | New | shadcn Drawer primitive (vaul) (Task 4) |
| `src/components/ui/drawer.test.tsx` | New | Drawer smoke test (Task 4) |
| `src/features/training/exercises/api.ts` | Mod | `exerciseInstructions(ex, lang)` + `getExercise(id)` (Task 2) |
| `src/features/training/exercises/api.test.ts` | Mod | `exerciseInstructions` tests (Task 2) |
| `src/features/training/exercises/hooks.ts` | Mod | `useExercise(id, {enabled})` (Task 3) |
| `src/features/training/exercises/hooks.test.tsx` | New | `useExercise` tests (Task 3) |
| `src/i18n/es/entrenamiento.json` + `en/entrenamiento.json` | Mod | `exerciseDetail.*` keys (Task 5) |
| `src/features/training/components/ExerciseImageLoop.tsx` | New | CSS start↔end loop + tap-to-enlarge (Task 6) |
| `src/features/training/components/ExerciseImageLoop.test.tsx` | New | image-loop tests (Task 6) |
| `src/features/training/components/ExerciseDetail.tsx` | New | pure renderer + density + badges + instructions (Task 7) |
| `src/features/training/components/ExerciseDetail.test.tsx` | New | renderer tests (Task 7) |
| `src/features/training/components/ExerciseInfoButton.tsx` | New | trigger + responsive shell + object/id resolve (Task 8) |
| `src/features/training/components/ExerciseInfoButton.test.tsx` | New | info-button tests (Task 8) |
| `src/features/training/runner/ExerciseOverview.tsx` (+ `.test.tsx`) | Mod/New | restructure row + Info button (id path); new TDD test (Task 9) |
| `src/features/training/components/ExercisePicker.tsx` (+ `.test.tsx`) | Mod | restructure result row + Info button (Task 10) |
| `src/features/training/components/ExerciseBlock.tsx` | Mod | Info button in header (object path) (Task 11) |
| `src/features/training/components/RoutineBuilder.tsx` | Mod | Info button in header (object path) (Task 12) |
| `src/features/training/components/SessionEditor.test.tsx` | Mod | add `useExercise` to hooks mock (Task 11) |
| `docs/changelog.md`, `docs/features.md`, `docs/conventions.md` | Mod | living docs (Task 13) |

---

### Task 1: Worktree baseline

Confirm the worktree is on `claude/b2b-exercise-detail` off `develop` (with B2a), deps install, and the suite is green before any change.

- [ ] **Step 1: Confirm branch + base.**

Run:
```bash
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail rev-parse --abbrev-ref HEAD
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail log --oneline -3
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail cat-file -e HEAD:src/features/training/exercises/images.ts && echo "B2a images.ts: PRESENT"
```
Expected: branch `claude/b2b-exercise-detail`; recent log shows the B2b spec commit on top of `bc7d206 … B2a … (#164)`; `images.ts: PRESENT` (B2a interface is in the base).

- [ ] **Step 2: Activate pnpm 10 + install.**

Run:
```bash
corepack prepare pnpm@10 --activate
corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail install
```
Expected: pnpm ~10.x, clean install. Never use bare `pnpm` (pnpm 11 crashes in WSL).

- [ ] **Step 3: Green baseline (fast gates).**

Run:
```bash
corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail typecheck
corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail lint
corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail build
```
Expected: all green. If any fails, the base is wrong — stop and resolve before proceeding.

---

### Task 2: Data helpers — `exerciseInstructions` + `getExercise` (TDD)

**Files:**
- Modify: `src/features/training/exercises/api.ts`
- Test: `src/features/training/exercises/api.test.ts`

`exerciseInstructions` is a pure language-pick + fallback helper (mirrors `exerciseDisplayName`, `api.ts:163`). `getExercise` is a thin single-row fetch for the runner's id path; it uses `select('*')` (same shape as `searchExercises`), so no fragile column-list select string — it is covered by the `useExercise` test (Task 3) + live verification (Task 14), not a brittle builder-mock unit test (cf. the "integration + e2e guard" backlog note).

- [ ] **Step 1: Write the failing test.** Append to `src/features/training/exercises/api.test.ts` (the file already stubs `@/lib/supabase`). Add `exerciseInstructions` to the existing import from `./api`, then append:

```ts
describe('exerciseInstructions', () => {
  const base: Exercise = {
    category: null,
    created_at: '2026-01-01T00:00:00Z',
    created_by_user_id: null,
    default_increment_kg: 2.5,
    equipment: 'barbell',
    external_id: null,
    force: null,
    id: 'ex-1',
    images: [],
    instructions_en: ['Lie on the bench.', 'Press up.'],
    instructions_es: ['Túmbate en el banco.', 'Empuja hacia arriba.'],
    is_verified: true,
    level: null,
    mechanic: null,
    name_en: 'Bench press',
    name_es: 'Press de banca',
    primary_muscles: ['pec_lower'],
    secondary_muscles: [],
    source: 'free-exercise-db',
    updated_at: '2026-01-01T00:00:00Z',
  };

  it('returns Spanish steps when lang=es', () => {
    expect(exerciseInstructions(base, 'es')).toEqual([
      'Túmbate en el banco.',
      'Empuja hacia arriba.',
    ]);
  });
  it('returns English steps when lang=en and instructions_en is non-empty', () => {
    expect(exerciseInstructions(base, 'en')).toEqual(['Lie on the bench.', 'Press up.']);
  });
  it('falls back to the other language when the chosen array is empty', () => {
    expect(exerciseInstructions({ ...base, instructions_en: [] }, 'en')).toEqual([
      'Túmbate en el banco.',
      'Empuja hacia arriba.',
    ]);
  });
  it('returns [] when both arrays are empty (system/no-source rows)', () => {
    expect(
      exerciseInstructions({ ...base, instructions_en: [], instructions_es: [] }, 'es'),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL.**

Run: `corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail test src/features/training/exercises/api.test.ts`
Expected: FAIL — `exerciseInstructions` is not exported.

- [ ] **Step 3: Implement.** In `src/features/training/exercises/api.ts`, after `exerciseDisplayName` (ends line 166), add:

```ts
/**
 * Instruction-steps picker. Mirrors `exerciseDisplayName`'s fallback: returns the
 * stored steps for the requested language, falling back to the other language when
 * the chosen array is empty (e.g. an EN-only or ES-only row), and `[]` when both
 * are empty (the source='system' rows + the 5 no-source rows). The ES steps are
 * the machine-translated B2a content — this is a stored-array pick, NOT a runtime
 * translation.
 */
export function exerciseInstructions(ex: Exercise, lang: 'es' | 'en'): string[] {
  const preferred = lang === 'es' ? ex.instructions_es : ex.instructions_en;
  if (preferred.length > 0) return preferred;
  return lang === 'es' ? ex.instructions_en : ex.instructions_es;
}

/** Fetch a single exercise by id (the runner's id-only detail path). Uses
 *  `select('*')` so it carries instructions + images with no fragile column list. */
export async function getExercise(id: string): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 4: Run the test — expect PASS.**

Run: `corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail test src/features/training/exercises/api.test.ts`
Expected: PASS — the four new cases plus all existing `api.test.ts` tests.

- [ ] **Step 5: Commit.**

```bash
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail add src/features/training/exercises/api.ts src/features/training/exercises/api.test.ts
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail commit -m "feat(training): add exerciseInstructions + getExercise helpers"
```

---

### Task 3: `useExercise(id, {enabled})` hook (TDD)

**Files:**
- Modify: `src/features/training/exercises/hooks.ts`
- Test: `src/features/training/exercises/hooks.test.tsx` (new)

A React Query wrapper mirroring `useExerciseSearch` (`hooks.ts:12`), fetching one exercise by id; gated by `enabled` (and by `!!id`) so closed popups never fetch.

- [ ] **Step 1: Write the failing test.** Create `src/features/training/exercises/hooks.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

// hooks.ts transitively imports @/lib/supabase (via ./api) and AuthProvider.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
const getExercise = vi.fn();
vi.mock('./api', () => ({ getExercise: (...a: unknown[]) => getExercise(...a) }));

import { useExercise } from './hooks';

const fake = { id: 'ex-1', name_es: 'Press de banca' };

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  getExercise.mockReset();
});

describe('useExercise', () => {
  it('fetches by id when enabled and id is present', async () => {
    getExercise.mockResolvedValue(fake);
    const { result } = renderHook(() => useExercise('ex-1', { enabled: true }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(fake);
    expect(getExercise).toHaveBeenCalledWith('ex-1');
  });

  it('does not fetch when disabled', () => {
    getExercise.mockResolvedValue(fake);
    renderHook(() => useExercise('ex-1', { enabled: false }), { wrapper });
    expect(getExercise).not.toHaveBeenCalled();
  });

  it('does not fetch when id is undefined', () => {
    getExercise.mockResolvedValue(fake);
    renderHook(() => useExercise(undefined, { enabled: true }), { wrapper });
    expect(getExercise).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL.**

Run: `corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail test src/features/training/exercises/hooks.test.tsx`
Expected: FAIL — `useExercise` is not exported.

- [ ] **Step 3: Implement.** In `src/features/training/exercises/hooks.ts`, add `getExercise` to the import from `./api`, and add the hook after `useExerciseSearch` (line 19):

```ts
export function useExercise(
  id: string | undefined,
  opts: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ['exercises', 'byId', id] as const,
    queryFn: () => getExercise(id as string),
    enabled: (opts.enabled ?? true) && !!id,
  });
}
```
The import line becomes:
```ts
import {
  createExercise,
  getExercise,
  searchExercises,
  type Exercise,
  type ExerciseCreateInput,
  type ExerciseSearchOptions,
} from './api';
```

- [ ] **Step 4: Run the test — expect PASS.**

Run: `corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail test src/features/training/exercises/hooks.test.tsx`
Expected: PASS — all three cases.

- [ ] **Step 5: Commit.**

```bash
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail add src/features/training/exercises/hooks.ts src/features/training/exercises/hooks.test.tsx
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail commit -m "feat(training): add useExercise query hook"
```

---

### Task 4: shadcn `Drawer` primitive (vaul)

**Files:**
- Modify: `package.json` / `pnpm-lock.yaml` (add `vaul`)
- Create: `src/components/ui/drawer.tsx`, `src/components/ui/drawer.test.tsx`

The official shadcn Drawer (built on `vaul`), conformed to the repo's `ui/` conventions (named compound exports, `cn()`, theme tokens). Gives drag-handle, swipe-to-dismiss, focus trap, scroll-lock, Esc for free.

- [ ] **Step 1: Add the dependency.**

Run: `corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail add vaul`
Expected: `vaul` added to `package.json` dependencies + lockfile updated.

- [ ] **Step 2: Write the failing test.** Create `src/components/ui/drawer.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Drawer, DrawerContent, DrawerTitle } from './drawer';

describe('Drawer', () => {
  it('renders its content + title when open', () => {
    render(
      <Drawer open>
        <DrawerContent>
          <DrawerTitle>Sheet title</DrawerTitle>
          <p>Body content</p>
        </DrawerContent>
      </Drawer>,
    );
    expect(screen.getByText('Sheet title')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test — expect FAIL.**

Run: `corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail test src/components/ui/drawer.test.tsx`
Expected: FAIL — `./drawer` does not exist.

- [ ] **Step 4: Implement.** Create `src/components/ui/drawer.tsx`:

```tsx
import * as React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { cn } from '@/lib/utils';

export const Drawer = ({
  shouldScaleBackground = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} {...props} />
);
Drawer.displayName = 'Drawer';

export const DrawerTrigger = DrawerPrimitive.Trigger;
export const DrawerPortal = DrawerPrimitive.Portal;
export const DrawerClose = DrawerPrimitive.Close;

export const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-black/60', className)}
    {...props}
  />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

export const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto max-h-[90vh] flex-col rounded-t-[10px] border bg-background',
        className,
      )}
      {...props}
    >
      <div className="mx-auto mt-4 h-1.5 w-[60px] shrink-0 rounded-full bg-muted" />
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
));
DrawerContent.displayName = 'DrawerContent';

export const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('grid gap-1.5 p-4 text-center sm:text-left', className)} {...props} />
);
DrawerHeader.displayName = 'DrawerHeader';

export const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />
);
DrawerFooter.displayName = 'DrawerFooter';

export const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

export const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;
```

- [ ] **Step 5: Run the test — expect PASS.**

Run: `corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail test src/components/ui/drawer.test.tsx`
Expected: PASS. If vaul's portal does not render in jsdom (content not found), wrap the assertion in `await waitFor(...)`; if it still fails, this is a known vaul/jsdom limitation — reduce the test to asserting `render(...)` does not throw, and rely on Task 8's desktop-path (Dialog) tests for behavioral coverage. Do not block on it.

- [ ] **Step 6: Commit.**

```bash
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail add package.json pnpm-lock.yaml src/components/ui/drawer.tsx src/components/ui/drawer.test.tsx
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail commit -m "feat(ui): add shadcn Drawer primitive (vaul)"
```

---

### Task 5: i18n keys (`exerciseDetail.*`)

**Files:**
- Modify: `src/i18n/es/entrenamiento.json`, `src/i18n/en/entrenamiento.json`

Add a new top-level `exerciseDetail` block to both files (key order is irrelevant; place it after the existing `exerciseDialog` block). Muscle/equipment badge labels reuse the existing `exerciseDialog.muscle.*` / `exerciseDialog.equipment.*` keys — do not duplicate them.

- [ ] **Step 1: Add the ES block.** In `src/i18n/es/entrenamiento.json`, add this top-level key:

```json
  "exerciseDetail": {
    "title": "Detalles del ejercicio",
    "openAria": "Ver detalles del ejercicio",
    "instructions": "Instrucciones",
    "noInstructions": "Sin instrucciones todavía",
    "enlargeAria": "Ampliar imagen",
    "imageAlt": {
      "start": "{{name}} — posición inicial",
      "end": "{{name}} — posición final"
    },
    "loadError": "No se pudo cargar el ejercicio",
    "retry": "Reintentar"
  }
```

- [ ] **Step 2: Add the EN block.** In `src/i18n/en/entrenamiento.json`, add this top-level key:

```json
  "exerciseDetail": {
    "title": "Exercise details",
    "openAria": "View exercise details",
    "instructions": "Instructions",
    "noInstructions": "No instructions yet",
    "enlargeAria": "Enlarge image",
    "imageAlt": {
      "start": "{{name}} — start position",
      "end": "{{name}} — end position"
    },
    "loadError": "Couldn't load exercise",
    "retry": "Retry"
  }
```

- [ ] **Step 3: Verify valid JSON + key parity.**

Run:
```bash
node -e "
const es=require('/mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail/src/i18n/es/entrenamiento.json');
const en=require('/mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail/src/i18n/en/entrenamiento.json');
const flat=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v?flat(v,p+k+'.'):[p+k]);
const e=new Set(flat(es.exerciseDetail,'')), n=new Set(flat(en.exerciseDetail,''));
console.log('es keys', [...e].sort().join(','));
console.log('parity', [...e].every(k=>n.has(k)) && [...n].every(k=>e.has(k)));
"
```
Expected: both files parse; `parity true`; keys include `title,openAria,instructions,noInstructions,enlargeAria,imageAlt.start,imageAlt.end,loadError,retry`.

- [ ] **Step 4: Commit.**

```bash
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail add src/i18n/es/entrenamiento.json src/i18n/en/entrenamiento.json
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail commit -m "feat(i18n): add exerciseDetail strings (es/en)"
```

---

### Task 6: `ExerciseImageLoop` + keyframes (TDD)

**Files:**
- Modify: `tailwind.config.js`
- Create: `src/features/training/components/ExerciseImageLoop.tsx`, `…/ExerciseImageLoop.test.tsx`

CSS-only start↔end alternation: both frames are stacked in a fixed aspect-ratio box; frame B fades in/out via a `motion-safe` animation (reduced-motion users get the static start frame). 0 images → render nothing; 1 → static; 2 → loop. Tapping opens an enlarged Radix `Dialog`. This component imports no Supabase (only `buildExerciseImageUrl`, `Dialog`, i18n), so its test needs no supabase mock.

- [ ] **Step 1: Add the keyframe.** In `tailwind.config.js`, extend `keyframes` and `animation` (alongside the existing `accordion-*`):

```js
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'exercise-frame': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'exercise-frame': 'exercise-frame 1.6s ease-in-out infinite alternate',
      },
```

- [ ] **Step 2: Write the failing test.** Create `src/features/training/components/ExerciseImageLoop.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExerciseImageLoop } from './ExerciseImageLoop';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('ExerciseImageLoop', () => {
  it('renders nothing when there are no images', () => {
    const { container } = render(
      <ExerciseImageLoop images={[]} name="Bench press" density="compact" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a single static frame when there is one image', () => {
    render(
      <ExerciseImageLoop images={['Bench_Press/0.jpg']} name="Bench press" density="compact" />,
    );
    const imgs = screen.getAllByRole('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute('alt', 'Bench press — start position');
    expect(imgs[0]).toHaveAttribute('loading', 'lazy');
  });

  it('renders start + end frames when there are two images', () => {
    render(
      <ExerciseImageLoop
        images={['Bench_Press/0.jpg', 'Bench_Press/1.jpg']}
        name="Bench press"
        density="compact"
      />,
    );
    expect(screen.getByAltText('Bench press — start position')).toBeInTheDocument();
    expect(screen.getByAltText('Bench press — end position')).toBeInTheDocument();
  });

  it('opens the enlarge dialog on tap', () => {
    render(
      <ExerciseImageLoop images={['Bench_Press/0.jpg']} name="Bench press" density="compact" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge image' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test — expect FAIL.**

Run: `corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail test src/features/training/components/ExerciseImageLoop.test.tsx`
Expected: FAIL — `./ExerciseImageLoop` does not exist.

- [ ] **Step 4: Implement.** Create `src/features/training/components/ExerciseImageLoop.tsx`:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { buildExerciseImageUrl } from '../exercises/images';
import { cn } from '@/lib/utils';

interface Props {
  images: string[];
  name: string;
  density: 'compact' | 'full';
}

/**
 * Start↔end movement loop for an exercise. Two frames stacked in a fixed
 * aspect-ratio box (no layout shift); the end frame fades in/out via a
 * `motion-safe` animation, so reduced-motion users see only the static start
 * frame (no toggle, by design). 0 images → nothing; 1 → static; 2 → loop.
 * Tapping enlarges in a Radix Dialog.
 */
export function ExerciseImageLoop({ images, name, density }: Props) {
  const { t } = useTranslation('entrenamiento');
  const [enlarged, setEnlarged] = useState(false);
  if (images.length === 0) return null;

  const startSrc = buildExerciseImageUrl(images[0]);
  const endSrc = images.length > 1 ? buildExerciseImageUrl(images[1]) : null;
  const altStart = t('exerciseDetail.imageAlt.start', { name });
  const altEnd = t('exerciseDetail.imageAlt.end', { name });

  const frames = (fit: 'cover' | 'contain') => (
    <>
      <img
        src={startSrc}
        alt={altStart}
        loading="lazy"
        decoding="async"
        className={cn('absolute inset-0 h-full w-full', fit === 'cover' ? 'object-cover' : 'object-contain')}
      />
      {endSrc && (
        <img
          src={endSrc}
          alt={altEnd}
          loading="lazy"
          decoding="async"
          className={cn(
            'absolute inset-0 h-full w-full opacity-0 motion-safe:animate-exercise-frame',
            fit === 'cover' ? 'object-cover' : 'object-contain',
          )}
        />
      )}
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setEnlarged(true)}
        aria-label={t('exerciseDetail.enlargeAria')}
        className="block w-full overflow-hidden rounded-md"
      >
        <div
          className={cn(
            'relative w-full bg-muted',
            density === 'compact' ? 'aspect-[4/3] max-h-44' : 'aspect-[4/3]',
          )}
        >
          {frames('cover')}
        </div>
      </button>

      <Dialog open={enlarged} onOpenChange={setEnlarged}>
        <DialogContent className="max-w-2xl">
          <DialogTitle className="sr-only">{name}</DialogTitle>
          <div className="relative aspect-[4/3] w-full">{frames('contain')}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 5: Run the test — expect PASS.**

Run: `corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail test src/features/training/components/ExerciseImageLoop.test.tsx`
Expected: PASS — all four cases.

- [ ] **Step 6: Commit.**

```bash
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail add tailwind.config.js src/features/training/components/ExerciseImageLoop.tsx src/features/training/components/ExerciseImageLoop.test.tsx
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail commit -m "feat(training): add ExerciseImageLoop (start/end loop + enlarge)"
```

---

### Task 7: `ExerciseDetail` renderer (TDD)

**Files:**
- Create: `src/features/training/components/ExerciseDetail.tsx`, `…/ExerciseDetail.test.tsx`

The pure, presentational renderer. `compact` = steps-first (header → small image → steps); `full` = visual-first (image → fuller header → steps). It imports `exerciseInstructions`/`exerciseDisplayName` from `api.ts` (which imports `@/lib/supabase`), so the test mocks `@/lib/supabase` (but no hooks — the component calls none).

- [ ] **Step 1: Write the failing test.** Create `src/features/training/components/ExerciseDetail.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import { ExerciseDetail } from './ExerciseDetail';
import type { Exercise } from '../exercises/api';

const base: Exercise = {
  category: 'strength',
  created_at: '2026-01-01T00:00:00Z',
  created_by_user_id: null,
  default_increment_kg: 2.5,
  equipment: 'barbell',
  external_id: 'Bench_Press',
  force: 'push',
  id: 'ex-1',
  images: ['Bench_Press/0.jpg', 'Bench_Press/1.jpg'],
  instructions_en: ['Lie on the bench.', 'Press the bar up.'],
  instructions_es: ['Túmbate en el banco.', 'Empuja la barra hacia arriba.'],
  is_verified: true,
  level: 'beginner',
  mechanic: 'compound',
  name_en: 'Bench press',
  name_es: 'Press de banca',
  primary_muscles: ['pec_lower'],
  secondary_muscles: ['tri_long'],
  source: 'free-exercise-db',
  updated_at: '2026-01-01T00:00:00Z',
};

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('ExerciseDetail', () => {
  it('renders the name, Spanish steps in order, and the muscle/equipment badges (compact)', () => {
    render(<ExerciseDetail exercise={base} density="compact" />);
    expect(screen.getByRole('heading', { name: 'Press de banca' })).toBeInTheDocument();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['Túmbate en el banco.', 'Empuja la barra hacia arriba.']);
    expect(screen.getByText(i18n.t('entrenamiento:exerciseDialog.muscle.pec_lower'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('entrenamiento:exerciseDialog.equipment.barbell'))).toBeInTheDocument();
  });

  it('renders English steps when language is en', async () => {
    await i18n.changeLanguage('en');
    render(<ExerciseDetail exercise={base} density="compact" />);
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['Lie on the bench.', 'Press the bar up.']);
  });

  it('falls back to Spanish steps when English steps are empty', async () => {
    await i18n.changeLanguage('en');
    render(<ExerciseDetail exercise={{ ...base, instructions_en: [] }} density="compact" />);
    expect(screen.getByText('Túmbate en el banco.')).toBeInTheDocument();
  });

  it('shows the empty-state when there are no instructions', () => {
    render(
      <ExerciseDetail
        exercise={{ ...base, instructions_en: [], instructions_es: [] }}
        density="compact"
      />,
    );
    expect(
      screen.getByText(i18n.t('entrenamiento:exerciseDetail.noInstructions')),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('renders the image loop when images exist and nothing when they do not', () => {
    const { rerender } = render(<ExerciseDetail exercise={base} density="compact" />);
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    rerender(<ExerciseDetail exercise={{ ...base, images: [] }} density="compact" />);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('renders the full density without crashing', () => {
    render(<ExerciseDetail exercise={base} density="full" />);
    expect(screen.getByRole('heading', { name: 'Press de banca' })).toBeInTheDocument();
  });

  it('snapshots the full (visual-first) density layout', () => {
    const { container } = render(<ExerciseDetail exercise={base} density="full" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL.**

Run: `corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail test src/features/training/components/ExerciseDetail.test.tsx`
Expected: FAIL — `./ExerciseDetail` does not exist. (The snapshot is written fresh on the first GREEN run — commit it.)

- [ ] **Step 3: Implement.** Create `src/features/training/components/ExerciseDetail.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ExerciseImageLoop } from './ExerciseImageLoop';
import { exerciseDisplayName, exerciseInstructions, type Exercise } from '../exercises/api';

interface Props {
  exercise: Exercise;
  density: 'compact' | 'full';
}

/**
 * Reusable, presentational exercise detail. `compact` is steps-first (in-workout
 * popup); `full` is visual-first (B2c browse/detail page). Pure — receives a ready
 * Exercise and fetches nothing. Shared B2b→B2c via the `density` prop.
 */
export function ExerciseDetail({ exercise, density }: Props) {
  const { t, i18n } = useTranslation('entrenamiento');
  const lang: 'es' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'es';
  const name = exerciseDisplayName(exercise, lang);
  const steps = exerciseInstructions(exercise, lang);

  const header = (
    <div className="space-y-1.5">
      <h2 className="text-lg font-semibold leading-tight">{name}</h2>
      <div className="flex flex-wrap gap-1">
        {exercise.primary_muscles.map((code) => (
          <Badge key={code} variant="secondary">
            {t(`exerciseDialog.muscle.${code}`)}
          </Badge>
        ))}
        {exercise.equipment && (
          <Badge variant="secondary">{t(`exerciseDialog.equipment.${exercise.equipment}`)}</Badge>
        )}
        {density === 'full' &&
          exercise.secondary_muscles.map((code) => (
            <Badge key={`sec-${code}`} variant="outline">
              {t(`exerciseDialog.muscle.${code}`)}
            </Badge>
          ))}
        {density === 'full' && exercise.level && (
          <Badge variant="outline">{exercise.level}</Badge>
        )}
      </div>
    </div>
  );

  const imageLoop = (
    <ExerciseImageLoop images={exercise.images} name={name} density={density} />
  );

  const instructions = (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">
        {t('exerciseDetail.instructions')}
      </h3>
      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('exerciseDetail.noInstructions')}</p>
      ) : (
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}
    </div>
  );

  return (
    <div className={cn('flex flex-col', density === 'compact' ? 'gap-3' : 'gap-4')}>
      {density === 'compact' ? (
        <>
          {header}
          {imageLoop}
          {instructions}
        </>
      ) : (
        <>
          {imageLoop}
          {header}
          {instructions}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test — expect PASS.**

Run: `corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail test src/features/training/components/ExerciseDetail.test.tsx`
Expected: PASS — all six cases.

- [ ] **Step 5: Commit.**

```bash
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail add src/features/training/components/ExerciseDetail.tsx src/features/training/components/ExerciseDetail.test.tsx src/features/training/components/__snapshots__/ExerciseDetail.test.tsx.snap
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail commit -m "feat(training): add reusable ExerciseDetail renderer"
```

---

### Task 8: `ExerciseInfoButton` (trigger + responsive shell + data resolve) (TDD)

**Files:**
- Create: `src/features/training/components/ExerciseInfoButton.tsx`, `…/ExerciseInfoButton.test.tsx`

The in-workout drop-in. Takes exactly one of `exercise` / `exerciseId`. Object path renders immediately; id path fetches via `useExercise` (skeleton while loading, retry on error). Responsive shell: `Dialog` on desktop, `Drawer` on mobile. Trigger stops propagation (mousedown + click) so it never triggers a parent row action or the picker's outside-click close.

- [ ] **Step 1: Write the failing test.** Create `src/features/training/components/ExerciseInfoButton.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => true })); // desktop → Dialog
const useExercise = vi.fn();
vi.mock('../exercises/hooks', () => ({ useExercise: (...a: unknown[]) => useExercise(...a) }));

import { ExerciseInfoButton } from './ExerciseInfoButton';
import type { Exercise } from '../exercises/api';

const base: Exercise = {
  category: null, created_at: '2026-01-01T00:00:00Z', created_by_user_id: null,
  default_increment_kg: 2.5, equipment: 'barbell', external_id: null, force: null,
  id: 'ex-1', images: [], instructions_en: ['Step one.'], instructions_es: ['Paso uno.'],
  is_verified: true, level: null, mechanic: null, name_en: 'Bench press',
  name_es: 'Press de banca', primary_muscles: ['pec_lower'], secondary_muscles: [],
  source: 'free-exercise-db', updated_at: '2026-01-01T00:00:00Z',
};

beforeEach(async () => {
  useExercise.mockReset();
  useExercise.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });
  await i18n.changeLanguage('es');
});

describe('ExerciseInfoButton', () => {
  it('object path: opens the sheet and shows the exercise without fetching', () => {
    render(<ExerciseInfoButton exercise={base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalles del ejercicio' }));
    expect(screen.getByRole('heading', { name: 'Press de banca' })).toBeInTheDocument();
    // enabled=false on the object path → no real fetch
    expect(useExercise).toHaveBeenCalledWith(undefined, expect.objectContaining({ enabled: false }));
  });

  it('id path: shows a loading status while fetching', () => {
    useExercise.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    render(<ExerciseInfoButton exerciseId="ex-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalles del ejercicio' }));
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('id path: shows the exercise on success', () => {
    useExercise.mockReturnValue({ data: base, isLoading: false, isError: false, refetch: vi.fn() });
    render(<ExerciseInfoButton exerciseId="ex-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalles del ejercicio' }));
    expect(screen.getByRole('heading', { name: 'Press de banca' })).toBeInTheDocument();
  });

  it('id path: shows an error + retry that refetches', () => {
    const refetch = vi.fn();
    useExercise.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    render(<ExerciseInfoButton exerciseId="ex-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalles del ejercicio' }));
    expect(screen.getByText('No se pudo cargar el ejercicio')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('trigger stops mousedown + click propagation', () => {
    const onMouseDown = vi.fn();
    const onClick = vi.fn();
    render(
      <div onMouseDown={onMouseDown} onClick={onClick}>
        <ExerciseInfoButton exercise={base} />
      </div>,
    );
    const trigger = screen.getByRole('button', { name: 'Ver detalles del ejercicio' });
    fireEvent.mouseDown(trigger);
    fireEvent.click(trigger);
    expect(onMouseDown).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL.**

Run: `corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail test src/features/training/components/ExerciseInfoButton.test.tsx`
Expected: FAIL — `./ExerciseInfoButton` does not exist.

- [ ] **Step 3: Implement.** Create `src/features/training/components/ExerciseInfoButton.tsx`:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useExercise } from '../exercises/hooks';
import { ExerciseDetail } from './ExerciseDetail';
import type { Exercise } from '../exercises/api';

interface Props {
  /** Pass a ready Exercise (picker / editors) … */
  exercise?: Exercise;
  /** … or an id to fetch on demand (the runner has no full object). */
  exerciseId?: string;
}

/**
 * The in-workout detail affordance: an Info icon-button that opens the exercise
 * detail in a responsive shell (Drawer on mobile, Dialog on desktop). Resolves
 * its data from a passed `exercise`, or fetches by `exerciseId` only while open.
 * Always render this as a SIBLING of a row's primary action — never nested in
 * another button — and it stops event propagation so it never triggers that
 * action or the picker's outside-click close.
 */
export function ExerciseInfoButton({ exercise, exerciseId }: Props) {
  const { t } = useTranslation('entrenamiento');
  const [open, setOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const query = useExercise(exerciseId, { enabled: open && !exercise && !!exerciseId });
  const resolved = exercise ?? query.data;

  const body = resolved ? (
    <ExerciseDetail exercise={resolved} density="compact" />
  ) : query.isError ? (
    <div className="space-y-3 py-4 text-center">
      <p className="text-sm text-muted-foreground">{t('exerciseDetail.loadError')}</p>
      <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
        {t('exerciseDetail.retry')}
      </Button>
    </div>
  ) : (
    <div role="status" className="space-y-3">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="aspect-[4/3] w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );

  // h-11 w-11 = 44px (WCAG min tap target); shadcn size="icon" is only 40px.
  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={t('exerciseDetail.openAria')}
      className="h-11 w-11 shrink-0 text-muted-foreground"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        setOpen(true);
      }}
    >
      <Info className="h-4 w-4" />
    </Button>
  );

  return (
    <>
      {trigger}
      {isDesktop ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg">
            <DialogTitle className="sr-only">{t('exerciseDetail.title')}</DialogTitle>
            {body}
          </DialogContent>
        </Dialog>
      ) : (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="max-h-[85vh] overflow-y-auto p-4">
            <DrawerTitle className="sr-only">{t('exerciseDetail.title')}</DrawerTitle>
            {body}
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run the test — expect PASS.**

Run: `corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail test src/features/training/components/ExerciseInfoButton.test.tsx`
Expected: PASS — all five cases.

- [ ] **Step 5: Commit.**

```bash
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail add src/features/training/components/ExerciseInfoButton.tsx src/features/training/components/ExerciseInfoButton.test.tsx
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail commit -m "feat(training): add ExerciseInfoButton in-workout detail popup"
```

---

### Task 9: Wire the runner (`ExerciseOverview`)

**Files:**
- Modify: `src/features/training/runner/ExerciseOverview.tsx`

The row is a single `<button onClick={onJump}>`; the Info button cannot nest inside it. Restructure each row into a flex `<div>` holding the jump `<button>` + a sibling `<ExerciseInfoButton exerciseId={…}>` (id path — the runner has no full Exercise). The Info button is enabled for all rows (detail works even for done/skipped exercises). TDD: a new `ExerciseOverview.test.tsx` asserts the Info button renders and never hijacks the jump action.

- [ ] **Step 1: Write the failing test.** Create `src/features/training/runner/ExerciseOverview.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen, fireEvent } from '@testing-library/react';

// ExerciseOverview will import ExerciseInfoButton, which transitively imports
// @/lib/supabase + useExercise (needs a QueryClient) + useMediaQuery. Mock them so
// the row renders without a provider; the popup stays closed in these tests.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => false }));
vi.mock('@/features/training/exercises/hooks', () => ({
  useExercise: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { ExerciseOverview } from './ExerciseOverview';
import type { RunnerExercise } from '@/core/runner';

const exercises = [
  { exerciseId: 'ex-1', position: 1, status: 'pending' },
] as unknown as RunnerExercise[];

function renderOverview(onJump = vi.fn()) {
  render(
    <ExerciseOverview
      exercises={exercises}
      currentIndex={-1}
      names={{ 'ex-1': 'Press de banca' }}
      onJump={onJump}
      onSkipCurrent={vi.fn()}
      onFinishEarly={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  return onJump;
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('ExerciseOverview detail button', () => {
  const openAria = () => i18n.t('entrenamiento:exerciseDetail.openAria');

  it('renders an Info button alongside the jump button', () => {
    renderOverview();
    expect(screen.getByText(/Press de banca/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: openAria() })).toBeInTheDocument();
  });

  it('the Info button does not trigger onJump', () => {
    const onJump = renderOverview();
    fireEvent.click(screen.getByRole('button', { name: openAria() }));
    expect(onJump).not.toHaveBeenCalled();
  });

  it('the jump button still triggers onJump', () => {
    const onJump = renderOverview();
    fireEvent.click(screen.getByRole('button', { name: /Press de banca/ }));
    expect(onJump).toHaveBeenCalledWith(0);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL.**

Run: `corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail test src/features/training/runner/ExerciseOverview.test.tsx`
Expected: FAIL — there is no button named by `openAria` yet (the row is a single jump button); the no-hijack + jump cases can't resolve the Info button.

- [ ] **Step 3: Add the import.** At the top of `ExerciseOverview.tsx`, add:

```ts
import { ExerciseInfoButton } from '@/features/training/components/ExerciseInfoButton';
```

- [ ] **Step 4: Restructure the row.** Replace the `exercises.map(...)` row block (currently the `<button key={ex.exerciseId} … >…</button>` returned for each item, lines 34–62) with:

```tsx
        return (
          <div key={ex.exerciseId} className="flex items-center gap-1">
            <button
              type="button"
              disabled={!canJump}
              onClick={() => canJump && onJump(i)}
              className={cn(
                'flex flex-1 items-center justify-between rounded-md px-3 py-2 text-sm text-left',
                done && 'bg-muted/40 text-muted-foreground',
                skipped && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
                partial && 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
                isCurrent && 'border border-primary/50 bg-primary/10',
                !done && !skipped && !partial && !isCurrent && 'bg-muted/30',
              )}
            >
              <span>{ex.position} · {names[ex.exerciseId] ?? ex.exerciseId}</span>
              <span>
                {done
                  ? '✓'
                  : isCurrent
                    ? t('runner.now')
                    : skipped
                      ? t('runner.skippedDoIt')
                      : partial
                        ? t('runner.partialDoIt')
                        : t('runner.jump')}
              </span>
            </button>
            <ExerciseInfoButton exerciseId={ex.exerciseId} />
          </div>
        );
```

- [ ] **Step 5: Run the test — expect PASS + gates.**

Run:
```bash
corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail test src/features/training/runner/ExerciseOverview.test.tsx
corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail typecheck
corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail lint
```
Expected: all green — the three `ExerciseOverview` cases pass (Info button renders, does not hijack `onJump`, and the jump button still fires `onJump(0)`).

- [ ] **Step 6: Commit.**

```bash
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail add src/features/training/runner/ExerciseOverview.tsx src/features/training/runner/ExerciseOverview.test.tsx
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail commit -m "feat(training): add exercise-detail button to runner overview"
```

---

### Task 10: Wire the picker (`ExercisePicker`)

**Files:**
- Modify: `src/features/training/components/ExercisePicker.tsx`, `…/ExercisePicker.test.tsx`

Each result is a single `<button onClick={onSelect}>` inside `<li>`. Restructure to a flex row: the select `<button>` (flex-1) + a sibling `<ExerciseInfoButton exercise={ex}>`. As siblings, Info no longer triggers `onSelect`; the trigger sits inside `containerRef`, so its mousedown does not trip the outside-click close. (The portaled sheet closing the picker behind it is acceptable for v1 — verified live in Task 14.)

- [ ] **Step 1: Add the import.** At the top of `ExercisePicker.tsx`, add:

```ts
import { ExerciseInfoButton } from './ExerciseInfoButton';
```

- [ ] **Step 2: Restructure the result item.** Replace the result `<li key={ex.id}> … </li>` block (lines 154–180, the `<button>` wrapping name/subtitle/equipment) with:

```tsx
                  <li key={ex.id} className="flex items-center gap-1 pr-1">
                    <button
                      type="button"
                      className={cn(
                        'flex-1 min-w-0 text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground',
                        'flex items-center gap-2 justify-between',
                      )}
                      onClick={() => {
                        onSelect(ex);
                        setOpen(false);
                        setQuery('');
                      }}
                    >
                      <span className="flex-1 min-w-0">
                        <span className="font-medium truncate">{primary}</span>
                        {subtitle && subtitle !== primary && (
                          <span className="text-muted-foreground ml-2 text-xs">{subtitle}</span>
                        )}
                      </span>
                      {ex.equipment && (
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {t(`exerciseDialog.equipment.${ex.equipment}`)}
                        </span>
                      )}
                    </button>
                    <ExerciseInfoButton exercise={ex} />
                  </li>
```

- [ ] **Step 3: Update the picker test's hooks mock.** In `src/features/training/components/ExercisePicker.test.tsx`, extend the `vi.mock('../exercises/hooks', …)` factory to also export `useExercise` (the picker now imports `ExerciseInfoButton`, which imports `useExercise` from that module — the whole-module mock must provide it):

```ts
vi.mock('../exercises/hooks', () => ({
  useExerciseSearch: () => ({ data: [], isLoading: false }),
  useCreateExercise: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useExercise: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}));
```
Also add, near the top with the other mocks, a media-query stub so `ExerciseInfoButton`'s `useMediaQuery` is deterministic:
```ts
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => false }));
```

- [ ] **Step 4: Verify.**

Run:
```bash
corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail typecheck
corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail lint
corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail test src/features/training/components/ExercisePicker.test.tsx
```
Expected: all green (the existing group-options test still passes — results are empty in that test, so no Info buttons mount).

- [ ] **Step 5: Commit.**

```bash
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail add src/features/training/components/ExercisePicker.tsx src/features/training/components/ExercisePicker.test.tsx
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail commit -m "feat(training): add exercise-detail button to picker results"
```

---

### Task 11: Wire the session editor (`ExerciseBlock`)

**Files:**
- Modify: `src/features/training/components/ExerciseBlock.tsx`, `…/SessionEditor.test.tsx`

The header (lines 115–129) is a flex `<div>` with the name `<h3>` + a remove `<Button>` — not a button, so a clean drop-in. Group the Info + remove buttons in a `shrink-0` wrapper and let the name flex.

- [ ] **Step 1: Add the import.** At the top of `ExerciseBlock.tsx`, add:

```ts
import { ExerciseInfoButton } from './ExerciseInfoButton';
```

- [ ] **Step 2: Update the header.** Replace the header block (the `<div className="flex items-center justify-between gap-2">…</div>` containing the `<h3>` + remove `<Button>`, lines 117–129) with:

```tsx
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium truncate flex-1 min-w-0">{exerciseDisplayName(exercise, lang)}</h3>
        <div className="flex items-center gap-1 shrink-0">
          <ExerciseInfoButton exercise={exercise} />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground"
            aria-label={t('block.remove')}
            onClick={onRemoveBlock}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
```

- [ ] **Step 3: Update `SessionEditor.test.tsx` mocks.** `SessionEditor.test.tsx` renders `ExerciseBlock` with an exercise, so `ExerciseInfoButton` mounts and imports `useExercise` + `useMediaQuery`. Ensure its mocks provide them. Find the existing `vi.mock('../exercises/hooks', …)` (or the hooks-path mock it uses) and add `useExercise: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() })` to the factory; and add `vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => false }));` near the top with the other module mocks. (If `SessionEditor.test.tsx` does not currently mock `../exercises/hooks`, add the full mock factory with `useExerciseSearch`, `useCreateExercise`, and `useExercise` — mirror the `ExercisePicker.test.tsx` factory.) Then, in the existing test that renders a block with a populated `initialExercise`, add an assertion that the detail affordance is present (spec §12 — "assert the Info button renders"): `expect(screen.getByRole('button', { name: i18n.t('entrenamiento:exerciseDetail.openAria') })).toBeInTheDocument();` (add `import i18n from '@/i18n';` if the test doesn't already import it).

- [ ] **Step 4: Verify.**

Run:
```bash
corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail typecheck
corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail lint
corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail test src/features/training/components/SessionEditor.test.tsx
```
Expected: all green.

- [ ] **Step 5: Commit.**

```bash
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail add src/features/training/components/ExerciseBlock.tsx src/features/training/components/SessionEditor.test.tsx
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail commit -m "feat(training): add exercise-detail button to session editor block"
```

---

### Task 12: Wire the routine editor (`RoutineBuilder`)

**Files:**
- Modify: `src/features/training/components/RoutineBuilder.tsx`

The header (lines 105–149) shows the name (or a placeholder when no exercise is picked) + a `shrink-0` button group (move-up/down/remove). Add the Info button to that group, guarded on `exercise` being present (it can be null before a pick).

- [ ] **Step 1: Add the import.** At the top of `RoutineBuilder.tsx`, add:

```ts
import { ExerciseInfoButton } from './ExerciseInfoButton';
```

- [ ] **Step 2: Add the button.** In the header's `<div className="flex items-center gap-1 shrink-0">` group (line 115), insert the Info button as the FIRST child (before move-up), guarded on `exercise`:

```tsx
        <div className="flex items-center gap-1 shrink-0">
          {exercise && <ExerciseInfoButton exercise={exercise} />}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground"
            aria-label={t('routine.moveUp')}
            disabled={index === 0}
            onClick={onMoveUp}
          >
            ↑
          </Button>
```
(Leave the move-down and remove buttons unchanged below it.)

- [ ] **Step 3: Verify.**

Run:
```bash
corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail typecheck
corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail lint
```
Expected: both green. If a `RoutineBuilder.test.tsx` renders rows with a selected exercise, run it (`corepack pnpm --dir … test src/features/training/components/RoutineBuilder.test.tsx`) and, if it mocks `../exercises/hooks`, add `useExercise` + the `@/hooks/use-media-query` stub as in Task 11.

- [ ] **Step 4: Commit.**

```bash
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail add src/features/training/components/RoutineBuilder.tsx
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail commit -m "feat(training): add exercise-detail button to routine builder"
```

---

### Task 13: Living docs

**Files:**
- Modify: `docs/changelog.md`, `docs/features.md`, `docs/conventions.md`

Record what shipped (invariant #7: now-built, so document it as real). Keep entries terse and match each file's existing format.

- [ ] **Step 1: Changelog.** Add an entry at the top of the current section of `docs/changelog.md` describing B2b: "Exercise detail popup — bilingual instructions + start/end image loop, opened from an Info button on runner / picker / session & routine rows; reusable `ExerciseDetail` (adaptive density) + new shadcn `Drawer` primitive. (R-27, Project B2b)". Match the file's existing date/heading style.

- [ ] **Step 2: Features.** In `docs/features.md`, under the training feature, add a short line that exercises now have an in-workout detail view (instructions + images) reachable from exercise rows.

- [ ] **Step 3: Conventions.** In `docs/conventions.md` (UI section), add a one-line note: new overlays use the shadcn primitives — `Dialog` (centered) / `Drawer` (bottom sheet, `vaul`); the in-workout detail uses a responsive shell via `useMediaQuery('(min-width: 768px)')`. Note exercise images render via `buildExerciseImageUrl` in a fixed aspect-ratio box with `loading="lazy"`.

- [ ] **Step 4: Commit.**

```bash
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail add docs/changelog.md docs/features.md docs/conventions.md
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail commit -m "docs(b2b): record exercise detail popup in living docs"
```

---

### Task 14: Full verification + live check

Final gates + the one thing mocked tests can't catch: the runner's id-path fetch against a real exercise.

- [ ] **Step 1: Full static gates + suite.**

Run:
```bash
corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail typecheck
corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail lint
corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail build
corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail test
```
Expected: all green. The full `test` run is ~11–15 min — let it finish; do not background-kill it (orphaned tinypool workers). If a pre-existing surface test fails because `ExerciseInfoButton` pulled `useExercise`/`useMediaQuery` into its module, fix that test's mocks per Tasks 10–12 (add `useExercise` to the hooks mock + the media-query stub) — do not weaken a real assertion.

- [ ] **Step 2: Live check (runner id-path + picker behavior).** Mocked tests cannot catch a bad PostgREST query or the picker-under-sheet interaction. Run the app (`corepack pnpm --dir … dev`, or the agent-browser e2e harness with the seeded QA user) and confirm: (a) opening the Info button on a runner overview row fetches and shows instructions + the start/end image loop; (b) opening it on a picker result shows the detail and the picker behaves acceptably underneath; (c) the bottom sheet appears on a narrow viewport and a centered dialog at ≥768px; (d) reduced-motion (OS setting) shows a static start frame. Note any issue; none should block, but the runner fetch must work.

- [ ] **Step 3: Confirm clean tree + push.**

Run:
```bash
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail status --short
git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2b-exercise-detail log --oneline origin/develop..HEAD
```
Expected: clean tree; the log lists the B2b commits (spec + Tasks 2–13). Push the branch and open a PR → `develop` (squash auto-merge) only after the full suite is green — never push to `develop`/`main` directly.

---

## Self-review

Run after completing the plan (checklist, not a dispatch):
1. **Spec coverage** — Q1 data arch (Tasks 2/3/8), Q2 density both-layouts (Task 7), Q3 image UX + reduced-motion + enlarge (Task 6), Q4 badges (Task 7), Q5 affordance + restructure + propagation (Tasks 8–12), Q6 responsive shell (Task 8). i18n (5), Drawer (4), docs (13), verification incl. live (14). ✓
2. **No placeholders** — every code step shows full code; commands have expected output.
3. **Type/name consistency** — `ExerciseDetail({exercise, density})`, `ExerciseImageLoop({images, name, density})`, `ExerciseInfoButton({exercise?, exerciseId?})`, `exerciseInstructions(ex, lang)`, `getExercise(id)`, `useExercise(id, {enabled})` are used identically across tasks.
