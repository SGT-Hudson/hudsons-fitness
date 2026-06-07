# B2b — ExerciseDetail component + in-workout popup — design spec

**Status: DESIGN PROPOSED (2026-06-07).** Second of three B2 sub-projects
(**B2a data → B2b detail component + in-workout popup → B2c browse page +
filters**). Folds under **R-27 (Project B)** — no new R-id/D-id.

**Depends on B2a** (`2026-06-06-b2a-exercise-instructions-data-design.md`), which
is **merged to `develop` (#164) and released to `main`** (tag
`v2026-06-07-exercise-catalog`) — its instruction columns + backfill,
`buildExerciseImageUrl`, regenerated `database.ts`, and pgTAP are all live. B2b
branches off `develop` (worktree `.claude/worktrees/b2b-exercise-detail`, branch
`claude/b2b-exercise-detail`) and PRs back to `develop` normally (see §13).

This design was converged via a three-perspective engineering debate (minimalist /
architect / UX) on the six open questions; §3 records the agreed decisions.

---

## 1. Goal

Give every exercise a **detail view** — bilingual step-by-step instructions + the
movement's start/end images — surfaced as an **in-workout popup** triggered from
the exercise rows in the runner, picker, and session/routine editors. The renderer
is **one reusable, presentational `ExerciseDetail`** component with an adaptive
`density` prop, so B2c's browse/detail pages reuse it unchanged. B2b ships and
polishes the **compact** (popup) path; the **full** (visual-first) layout is built
and tested but mounted by no one until B2c.

No schema changes, no migrations, no RPCs — B2b is pure frontend on top of B2a's
data.

## 2. Scope

**In scope**
- A pure `ExerciseDetail({ exercise, density })` renderer (instructions + image
  loop + a light metadata header), `density: 'compact' | 'full'`.
- `ExerciseImageLoop` leaf: CSS-only start↔end alternation + tap-to-enlarge,
  handling 0/1/2 images, with a fixed aspect-ratio box and real alt text.
- A new shadcn **`Drawer`** primitive (`src/components/ui/drawer.tsx`, `vaul`).
- `ExerciseInfoButton`: the in-workout drop-in — the `Info` icon-button + the
  responsive shell (Drawer on mobile / Dialog on desktop) + data resolution
  (object passed in, or `exerciseId` fetched on demand).
- `getExercise(id)` (api) + `useExercise(id)` (hook) for the runner's id-only path.
- `exerciseInstructions(ex, lang)` helper (language pick + fallback, mirroring
  `exerciseDisplayName`).
- Wiring the `Info` affordance into the four surfaces (runner / picker / session
  editor / routine editor), including the markup restructuring the runner + picker
  rows require.
- New `entrenamiento` i18n keys (`exerciseDetail.*`); reuse of existing
  `exerciseDialog.muscle.*` / `exerciseDialog.equipment.*`.
- Tier-1/Tier-2 tests for the renderer, image loop, info-button, and the hook
  contract; both density layouts snapshot-tested.

**Out of scope (deferred)**
- The `/exercises` browse page, the `/exercises/:id` detail page, the card grid,
  filters, search, and the lay-term alias map → **B2c**. B2b only builds the
  shared renderer those pages consume.
- Pixel polish of the `full` density layout (no host page exists yet) → B2c.
- Editing instructions/images (read-only feature).
- Any change to the exercise schema or queries (B2a already lands the data and
  `searchExercises` already `select('*')`s it).
- A reduced-motion play/pause control (deferred; see §3 Q3).

## 3. Decisions resolved (the six open questions)

- **Q1 — Data architecture.** A **pure presentational** `ExerciseDetail({exercise,
  density})` (no Supabase import) + a wrapper that accepts **either** a full
  `exercise` **or** an `exerciseId`. Three of four surfaces already hold the
  object → pass it directly (zero fetch). Only the runner passes an id → fetch via
  `useExercise(id)`. The fetch path shows a **skeleton** (not a blank spinner) and
  a **retry** on error. *(Rejected: always-fetch-by-id; refactoring runner state.)*
- **Q2 — Density scope.** One `density: 'compact' | 'full'` prop. **Build both
  layouts now** from shared leaf components; **polish + wire only `compact`** in
  B2b. `full` is structurally complete, typed, and snapshot-tested but mounted
  nowhere until B2c — this locks the component contract so B2c never re-opens it.
- **Q3 — Image UX.** **CSS-only** start↔end alternation (no JS interval/timer);
  `prefers-reduced-motion` → freeze on the start frame via the Tailwind
  `motion-reduce:` variant; **no play/pause toggle in v1**. **Tap-to-enlarge
  reuses the existing Radix `Dialog`** as a near-fullscreen viewer (no new
  lightbox). Counts: 2 → loop, 1 → static, 0 → render nothing. **Mandatory
  correctness (first `<img>` in the app):** fixed aspect-ratio box (no layout
  shift), real localized alt text, `loading="lazy"` + `decoding="async"`.
- **Q4 — Metadata.** A small header: exercise name + a **single wrapping badge row
  of primary muscle + equipment** (existing i18n keys). **No level / no secondary
  muscles in compact** (those belong to the `full` density). **Hard constraint:**
  the badge row must never push the first instruction step below the fold in the
  compact sheet.
- **Q5 — Affordance.** A single lucide **`Info`** icon-button on every row, **always
  a separate button** from the row's primary action, **≥44px tap target**,
  aria-labelled. Runner row is a single `<button>`, so the Info button must be a
  **sibling** (restructure) with its own `stopPropagation` so it never triggers
  `onJump`. Picker: same sibling restructure; the trigger lives inside the picker
  container so it neither hijacks `onSelect` nor trips the outside-click close —
  the interaction to verify is the portaled sheet (see §9).
- **Q6 — Drawer responsiveness — ⚠ evolves the locked B2 decision.** The B2
  brainstorm locked "in-workout popup = bottom sheet". B2b refines this to
  **responsive: shadcn `Drawer` (bottom sheet) on mobile, centered Radix `Dialog`
  on desktop**, switched by `useMediaQuery('(min-width: 768px)')` inside the one
  wrapper; identical `ExerciseDetail` content in both shells. Rationale: a
  bottom sheet on a ≥768px editor/browse viewport reads as broken, and
  `useMediaQuery` (already used by `IngredientDialog`/`HomePage`) makes the split
  ~one conditional. *User flagged at design time; revertible to Drawer-everywhere
  by dropping the media-query branch.*

## 4. Architecture

Three units, one clean seam (pure content ⟂ shell+data+trigger):

```
ExerciseInfoButton           // in-workout drop-in (B2b only)
  ├─ Info icon-button (trigger; stopPropagation; aria-label; 44px target)
  ├─ data resolve:  exercise ?? useExercise(exerciseId)   // skeleton / retry
  └─ responsive shell:  useMediaQuery → <Drawer> | <Dialog>
        └─ <ExerciseDetail exercise density="compact" />   // pure content

ExerciseDetail({ exercise, density })     // pure, presentational, shared B2b→B2c
  ├─ header:  name + <MetaBadges> (primary muscle + equipment)
  ├─ <ExerciseImageLoop images density />  // start↔end loop + tap-to-enlarge
  └─ instructions:  <ol> of exerciseInstructions(ex, lang)  // empty-state aware

src/components/ui/drawer.tsx              // shadcn Drawer primitive (vaul)
```

- **`ExerciseDetail`** imports no Supabase and takes a ready `Exercise` — trivially
  unit-testable with a literal, and the exact unit B2c's `/exercises/:id` page
  renders directly (with `density="full"`, no button, no sheet).
- **`ExerciseInfoButton`** is the only in-workout-specific piece: it owns open
  state, the responsive shell, and the object-or-id data resolution. The four
  surfaces each drop in one element (`exercise=` or `exerciseId=`) — see §9.
- Leaf split: `ExerciseImageLoop` is its own file+test (the most logic-heavy
  leaf). The metadata badge row and the instructions list are simple enough to
  live inside `ExerciseDetail.tsx` (`MetaBadges` as a small local component).

## 5. Data flow

- **Object path (picker, session editor, routine editor):** the surface already
  holds the full `Exercise` (it came from `searchExercises('*')`, which now carries
  `instructions_en`/`instructions_es`/`images`). `ExerciseInfoButton exercise={ex}`
  → renders immediately, no network.
- **Id path (runner):** `ExerciseOverview` has only `exerciseId` + a `names` map.
  `ExerciseInfoButton exerciseId={ex.exerciseId}` → on open, `useExercise(id)`
  fetches; skeleton while pending, retry button on error, content on success. The
  query is lazy/`enabled` only while the sheet is open so closed rows never fetch.
- **New api** `getExercise(id: string): Promise<Exercise>` —
  `supabase.from('exercises').select('*').eq('id', id).single()` (same `select('*')`
  shape as `searchExercises`/`createExercise`, so no fragile column-list select
  string; cf. the "integration + e2e guard" backlog note — `select('*')` is the
  low-risk form).
- **New hook** `useExercise(id, { enabled })` — `useQuery({ queryKey:
  ['exercise', id], queryFn: () => getExercise(id), enabled })`, mirroring
  `useExerciseSearch` (`exercises/hooks.ts`).
- **Instruction language pick** `exerciseInstructions(ex, lang): string[]` —
  returns `ex.instructions_es` for `es` else `ex.instructions_en`; if the chosen
  array is empty, fall back to the other; if both empty, returns `[]` (the
  empty-state). Mirrors `exerciseDisplayName`'s fallback. The stored ES is the
  machine-translated B2a content — **no runtime translation**, just an array pick.

## 6. The shared `ExerciseDetail` + density

Same data, same leaves, two Tailwind compositions:
- **`compact`** (in-workout): steps-first. Order: name + badge row (one line) →
  small image loop → instructions `<ol>`. Tuned so step 1 is visible without
  scrolling in the bottom sheet on a phone.
- **`full`** (browse, B2c): visual-first. Order: large image loop → name + fuller
  badge row (may add secondary muscles / level later) → instructions. Built and
  snapshot-tested now; no pixel polish, no consumer until B2c.

`density` drives composition via `cn(...)`; neither variant is a copy-paste fork —
both call the same `ExerciseImageLoop`, `MetaBadges`, and instructions renderer.

Empty/edge content (all handled, since ~39 catalog rows have empty instructions
and/or no images): no instructions → render a localized "no instructions yet" line
instead of the `<ol>`; no images → render nothing (no placeholder box).

## 7. Image loop + tap-to-enlarge

- **Source:** `exercise.images` (relative paths) → `buildExerciseImageUrl(path)`
  (B2a). free-exercise-db ships ~2 frames (`0.jpg` start, `1.jpg` end).
- **Alternation (CSS-only):** both frames stacked in a fixed **aspect-ratio box**
  (`aspect-[4/3]` or similar, prevents layout shift on slow connections). A
  `@keyframes` (added to `tailwind.config.js` `extend`, next to the existing
  `accordion` keyframes) cross-cuts the two frames' opacity on a ~2s loop. Wrapped
  in the `motion-reduce:` variant so reduced-motion users get a **static start
  frame** (no animation, no toggle). No JS timer, no state, GPU-composited.
- **Counts:** 2 images → animate; 1 image → static single frame (no loop); 0 →
  render nothing.
- **Alt text (real, localized):** `t('exerciseDetail.imageAlt.start', { name })`
  → e.g. "Bench press — start position" / "— posición inicial"; `.end` for frame 2.
- **Loading:** `loading="lazy"` + `decoding="async"` on every `<img>`. A CDN frame
  that fails to load degrades to clean empty space, never a broken-image glyph.
- **Tap-to-enlarge:** tapping the loop opens a **Radix `Dialog`** with a
  near-fullscreen `DialogContent` showing the same frames enlarged (loop continues,
  same reduced-motion rule); Esc/backdrop/close to dismiss. Reuses the existing
  primitive — no bespoke lightbox, no second Drawer. The enlarge Dialog nests
  inside the popup shell (Drawer/Dialog); verify portal stacking at implementation
  (Radix portals stack by mount order; `Dialog` is z-50, `Toast` z-100).

## 8. `Drawer` primitive + responsive shell

- **`src/components/ui/drawer.tsx`** — the official shadcn Drawer (built on `vaul`,
  a new dependency). Conform it to the repo's `ui/` conventions: named compound
  exports (`Drawer`, `DrawerTrigger`, `DrawerContent`, `DrawerHeader`,
  `DrawerFooter`, `DrawerTitle`, `DrawerDescription`, `DrawerClose`,
  `DrawerOverlay`, `DrawerPortal`), CSS-variable theme tokens (`bg-background`,
  `text-foreground`, `bg-black/60` overlay), `cn()` merge, lucide icons. `vaul`
  gives the drag handle, swipe-to-dismiss, focus trap, scroll-lock, and Esc for
  free.
- **Responsive switch** lives only in `ExerciseInfoButton`: `useMediaQuery(
  '(min-width: 768px)') ? <Dialog> : <Drawer>`. The `ExerciseDetail` content is
  identical in both — the breakpoint never leaks into the pure renderer, preserving
  the seam B2c reuses.

## 9. Affordance wiring (four surfaces)

The `Info` button is **always a sibling** of the row's primary action — never
nested in another `<button>` (invalid HTML) and never overloading the row's tap.

- **Runner — `ExerciseOverview.tsx:35-61`.** The row is currently a single
  `<button onClick={onJump}>`. **Restructure** to a flex `<div>` row containing (a)
  the jump `<button>` (name + status, keeps `disabled`/`canJump` logic) and (b) a
  trailing `<ExerciseInfoButton exerciseId={ex.exerciseId}>` (id path; own
  `stopPropagation`). The Info button is enabled for all rows (detail works even
  for done/skipped exercises, unlike jump).
- **Picker — `ExercisePicker.tsx:155-178`.** Each result is currently a single
  `<button onClick={onSelect}>` inside `<li>`. **Restructure** the `<li>` to a flex
  row: the select `<button>` (name/subtitle/equipment) + a trailing
  `<ExerciseInfoButton exercise={ex}>`. As siblings, pressing Info no longer
  triggers `onSelect`; and because the trigger sits **inside** `containerRef`, its
  `mousedown` does not trip the picker's `document` outside-click listener
  (`ExercisePicker.tsx:60-69`). The genuine risk is downstream: the popup shell
  portals to `<body>` (outside `containerRef`), so a `mousedown` inside the open
  sheet would close the picker behind it. **Verify at implementation** and, if not
  acceptable, pause the picker's listener while the sheet is open (or
  `stopPropagation` on the shell). A defensive `mousedown` `stopPropagation` on the
  trigger is cheap insurance.
- **Session editor — `ExerciseBlock.tsx` header (`<h3>` + Trash2).** Drop
  `<ExerciseInfoButton exercise={exercise}>` between the name and the remove
  button. No restructuring (header is not a button).
- **Routine editor — `RoutineBuilder.tsx` ExerciseRow header (move/remove group).**
  Add `<ExerciseInfoButton exercise={exercise}>` to the header icon-button group.
  No restructuring.

In all four, `ExerciseInfoButton` renders a ghost icon `<Button>` with lucide
`Info` and `aria-label={t('exerciseDetail.openAria')}`. Note `size="icon"` is 40px
(`h-10 w-10`); the plan bumps it to a **≥44px tap target** (custom size or padding)
to meet the touch-target guideline.

## 10. i18n keys (new, namespace `entrenamiento`, under `exerciseDetail.*`)

Added to both `src/i18n/es/entrenamiento.json` and `en/entrenamiento.json`
(nested-string structure, per the JSON convention):
- `exerciseDetail.openAria` — Info button aria-label ("View exercise details" /
  "Ver detalles del ejercicio").
- `exerciseDetail.instructions` — section heading ("Instructions" / "Instrucciones").
- `exerciseDetail.noInstructions` — empty-state ("No instructions yet" / "Sin
  instrucciones todavía").
- `exerciseDetail.imageAlt.start` / `.end` — `"{{name}} — start/end position"` /
  `"{{name}} — posición inicial/final"`.
- `exerciseDetail.enlargeAria` / `exerciseDetail.closeAria` — image enlarge / close
  aria-labels.
- `exerciseDetail.loadError` + `exerciseDetail.retry` — runner fetch-path error +
  retry.

Reused existing keys: `exerciseDialog.muscle.${code}`, `exerciseDialog.equipment.
${type}` (badge labels), `src/core/muscles.ts` for muscle metadata.

## 11. Theming & accessibility

- Theme via Tailwind CSS-variable tokens (`bg-background`, `bg-card`,
  `text-foreground`, `text-muted-foreground`, `border`); both shells inherit
  light/dark automatically. No direct CSS-var access.
- Drawer/Dialog provide `role="dialog"`, focus trap, Esc, and focus restore
  (vaul / Radix). Info buttons are real `<button type="button">` with `aria-label`.
  Images carry descriptive alt text. The enlarge viewer is keyboard-dismissable.
- Motion respects `prefers-reduced-motion` (the image loop only).

## 12. Testing

- **`ExerciseDetail.test.tsx`** (Tier-2, **no Supabase mock** — pure component):
  renders instructions in `es` and `en` (`i18n.changeLanguage`), the EN→ES (and
  ES→EN) fallback, the empty-instructions state, the 0/1/2-image branches, the
  badge row (primary muscle + equipment), and **both** density layouts (snapshot
  `full`).
- **`ExerciseImageLoop.test.tsx`**: 0/1/2 image rendering, aspect-ratio box
  present, real alt text, `loading="lazy"`, and that tapping opens the enlarge
  Dialog.
- **`ExerciseInfoButton.test.tsx`** (mocks `@/lib/supabase` + `useExercise` per the
  "component test supabase env" convention): object path renders content with no
  fetch; id path → loading shows Skeleton, success shows content, error shows
  retry; the trigger stops `mousedown` propagation.
- **`exercises/api`/`hooks`**: unit-test `exerciseInstructions` fallback;
  `getExercise`/`useExercise` shape. Per the "integration + e2e guard" backlog
  note, mocked tests can't catch a bad PostgREST query — but `getExercise` uses
  `select('*')` (no column-list string), and the runner id-path is additionally
  verified live (§13).
- **Existing surface tests** (`SessionEditor.test.tsx`, `ExercisePicker.test.tsx`,
  runner tests): updated for the restructured rows; assert the Info button renders
  and does not hijack the primary action.
- **`drawer.tsx`**: a minimal open/close render test (shadcn primitives are
  otherwise covered by `vaul`).

## 13. Verification & ship

- `corepack pnpm lint` + `build` + `test` green (CI gate). **No DB migration** in
  B2b, so the Tier-3 `db-test` job is unaffected by new schema — but it still runs
  on B2a's migrations inherited via the base branch.
- **Live verification of the runner id-path** (mocked tests can't catch a bad
  query): exercise the runner's Info button against a real seeded exercise via the
  agent-browser e2e harness (or manual `pnpm dev`), confirming fetch → render of
  instructions + images. Confirm the picker does not collapse under the sheet.
- B2b needs **no local DB work** (no migration, no `db reset`). If any is ever
  required, note the Supabase Docker stack is shared across worktrees (one DB
  session at a time) — don't reset it while another session is using it.
- **Branch/merge order:** `claude/b2b-exercise-detail` is based on `origin/develop`
  (B2a already merged). Open its PR → `develop` (squash auto-merge); never push to
  `develop`/`main` directly.

## 14. Deliverables

| File | New/Mod | Responsibility |
|---|---|---|
| `src/components/ui/drawer.tsx` | New | shadcn Drawer primitive (vaul) |
| `package.json` / lockfile | Mod | add `vaul` |
| `tailwind.config.js` | Mod | image-loop `@keyframes` + animation |
| `src/features/training/components/ExerciseDetail.tsx` | New | pure renderer + density + `MetaBadges` + instructions |
| `src/features/training/components/ExerciseImageLoop.tsx` | New | CSS start↔end loop + tap-to-enlarge |
| `src/features/training/components/ExerciseInfoButton.tsx` | New | Info trigger + responsive shell + object/id resolve |
| `src/features/training/exercises/api.ts` | Mod | `getExercise(id)` + `exerciseInstructions(ex, lang)` |
| `src/features/training/exercises/hooks.ts` | Mod | `useExercise(id, {enabled})` |
| `src/features/training/runner/ExerciseOverview.tsx` | Mod | restructure row + Info button (id path) |
| `src/features/training/components/ExercisePicker.tsx` | Mod | restructure result row + Info button (mousedown guard) |
| `src/features/training/components/ExerciseBlock.tsx` | Mod | Info button in header (object path) |
| `src/features/training/components/RoutineBuilder.tsx` | Mod | Info button in header (object path) |
| `src/i18n/{es,en}/entrenamiento.json` | Mod | `exerciseDetail.*` keys |
| `*.test.tsx` (per §12) | New/Mod | renderer, image loop, info-button, surface, drawer |
| `docs/*` (changelog / features / conventions) | Mod | living-docs update at ship |

## 15. Open questions / risks

_None blocking._ Implementation-time verifications, all noted above:
1. Picker-under-sheet: confirm the portaled sheet's outside `mousedown` closing the
   picker is acceptable, else pause the picker listener while open (§9).
2. Nested-overlay stacking: enlarge `Dialog` opened from inside the Drawer/Dialog
   shell — verify z-order/focus return (§7).
3. Runner id-path query correctness — live-verified, not just mocked (§13).
4. `full` density visual polish is explicitly deferred to B2c (§2, §6).
