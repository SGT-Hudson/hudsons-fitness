# Recipe note — explicit save — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `RecipeNotesCard` saves the private note through an explicit **Guardar** button, shows an unsaved marker while the draft differs from the stored note, and no longer saves on blur — so the note writes like every other field in the app.

**Architecture:** One component, no new hooks. The `dirty` check is derived at render (`draft.trim() !== data.note.trim()`), not stored in state. `onBlur` is deleted; the existing `useSaveRecipeNote` mutation is now fired from the button only.

**Tech Stack:** React 18 + TS, vitest + @testing-library/react (Tier-1/2, `jsdom`), the note query/mutation already in `src/features/recipes/hooks.ts`.

**Spec:** `docs/superpowers/specs/2026-07-20-recipe-note-explicit-save.md`
(supersedes the autosave spec — do not implement that one)

## Global Constraints

- **Worktree:** `/home/hudson/dev/hudsons-fitness/.claude/worktrees/note-save`, branch `claude/note-save`. Never push to `develop`/`main`.
- **No AI/Claude attribution anywhere** — commits, comments, PR text. Plain conventional commits.
- Commands run as `corepack pnpm …` (bare `pnpm` is a Windows shim that crashes on Node 20).
- Scope is `RecipeNotesCard.tsx` + its test + the two i18n files. If this seems to require touching `hooks.ts`, `notes.ts` or the schema, stop — something has been misread.
- **Use the shadcn `Button`** (`@/components/ui/button`), not a bare `<button>`. Repo rule: build UI from the shadcn kit.
- The full suite takes ~11-15 min. Run the single test file while iterating; run the full suite once before the PR.

## Ground truth (measured, do not re-derive)

Read from the files as they stand on `aac7d03`.

**`RecipeNotesCard.tsx`:**
- line 25-27: `draft` state (initial `''`), `saved` state, `textareaRef`.
- line 29-34: the reseed effect, skipping while the textarea has focus.
- **line 36: `if (isLoading || !data?.exists) return null;`** — the membership gate, an early return sitting below the effect. Any new hook must go above it.
- line 38-41: `handleBlur` — the trimmed comparison to reuse for `dirty`.
- line 49-51: the `Guardado` indicator, rendered when `saved && !save.isPending`.
- line 61-64: `onChange` sets the draft and clears `saved`.

**`RecipeNotesCard.test.tsx`** mocks `../hooks` wholesale, drives a module-level `noteState`, re-renders to simulate a refetch, and forces Spanish in `beforeEach` (the `'Guardado'` assertion is locale-dependent). 8 tests. **Three of them assert blur-save** (lines 35, 46, 55) and 55/70 reach the indicator *through* blur — those are the ones this change rewrites.

**i18n:** the card reads from the `recetas` namespace — `detail.notesTitle`, `detail.notesPlaceholder`, `detail.notesSaved`. Both `src/i18n/es/recetas.json` and `src/i18n/en/recetas.json` must gain the two new keys, in the `detail` block (ES `notesSaved` is at line 51). A key added to one locale only will not fail CI; it will just render the raw key at runtime.

## What this change is NOT

The button does not stop a tab-close from losing the note — a user who types and closes without pressing it loses it exactly as today. The spec accepts that. If a step here starts reaching for a debounce, a `beforeunload` handler or an unsaved-changes prompt, it has left the plan.

---

### Task 1: Explicit save, test-first

**Files:**
- Modify: `src/features/recipes/components/RecipeNotesCard.tsx`
- Modify: `src/features/recipes/components/RecipeNotesCard.test.tsx`
- Modify: `src/locales/es/recetas.json`, `src/locales/en/recetas.json`

Follow `superpowers:test-driven-development`: each test written and watched **fail for the right reason** before the code that satisfies it exists.

**Step 1 — i18n first**, so the component has keys to render.
- [ ] Add `detail.notesSave` (ES `"Guardar"` / EN `"Save"`) and `detail.notesUnsaved` (ES `"Sin guardar"` / EN `"Unsaved"`) to **both** locale files, in the existing `detail` block.

**Step 2 — rewrite the three blur tests.** Do this before touching the component, so they go red for the right reason.
- [ ] Line 35 `saves on blur when the text changed` → **`does not save on blur`**. This is the regression test for the removed behaviour; without it, blur-save gets reintroduced by reflex. Assert `saveNote` was never called after `userEvent.tab()`.
- [ ] Line 46 `does not save on blur when the text is unchanged` → delete. Subsumed by the above.
- [ ] Line 55 and line 70 (the indicator tests) → drive them through the **button**, not blur. Keep both: the success path and the reject path.

**Step 3 — the new tests.** One at a time, each red first.
- [ ] The button is **disabled** when the draft matches the stored note.
- [ ] The button is **disabled when the only difference is surrounding whitespace** — this is what pins the comparison to `.trim()` on both sides. A naive `draft !== data.note` passes every other test in this file and fails only this one.
- [ ] Pressing the button saves, with the payload `{ recipeId, note: draft }`.
- [ ] The unsaved marker appears while dirty and is gone after a successful save.
- [ ] A non-member (`exists: false`) renders nothing — extend the existing test at line 29 to also assert no button exists.

**Step 4 — implement.**
- [ ] Derive `dirty` at render from the same trimmed comparison `handleBlur` used. Do **not** put it in state — a `useState` mirror of two props is a desync bug waiting to happen.
- [ ] Delete `onBlur` and the `handleBlur` function.
- [ ] Add the shadcn `Button`, `disabled={!dirty || save.isPending}`, firing the existing mutation with the same `onSuccess: () => setSaved(true)`.
- [ ] Render the unsaved marker where `Guardado` lives, in the header row. Only one of the two can show at a time — decide the precedence explicitly (dirty wins; you cannot be simultaneously saved and unsaved) rather than letting both render.
- [ ] **Rewrite the component's header comment.** It currently says "Saves on blur: the note is read often (while cooking) and written briefly, so a dialog would tax the common case." That justification is now false in its conclusion but still true in its premise — say what saves now, and keep the reason the note is not a dialog.

**Step 5 — prove the assertions bite** (`superpowers:verification-before-completion`; this repo has shipped green-but-vacuous tests before).

For each, reintroduce the defect, watch the **named** test go red, then revert:
- [ ] Re-add `onBlur={handleBlur}` → the no-blur-save test must fail.
- [ ] Compare without `.trim()` on both sides → the whitespace-only test must fail.
- [ ] Drop the `disabled` prop → the disabled-when-unchanged test must fail.
- [ ] Remove the focus check from the reseed effect → the in-progress-typing test (line 85) must fail.
- [ ] Record each outcome in the PR body. A defect that does not turn its test red means the test is decorative — fix the test.

**Step 6 — verify.**
- [ ] `corepack pnpm test -- RecipeNotesCard` green.
- [ ] `corepack pnpm lint` and `corepack pnpm typecheck` clean.
- [ ] Full `corepack pnpm test` green (~11-15 min) before the PR.
- [ ] **Real-browser pass.** jsdom cannot see CSS, and this adds a control to a header row that already holds a title and an indicator — check it does not overflow or wrap badly at narrow widths, in both themes. Then: type, confirm the unsaved marker, press Guardar, confirm the indicator, reload, confirm it persisted. Type and tap away without saving, reload, and confirm the text is gone — that is the accepted trade-off, verified rather than assumed.

---

### Task 2: Write the behaviour back to the docs

**Files:**
- Modify: `docs/features.md`

- [ ] The Recipes section documents the private note. #215 has just described it as saving on blur; that becomes false with this change. Update it to the button, and state the unsaved marker.
- [ ] Do not touch `docs/decisions.md` — this is a component behaviour change, not an architectural ruling. If it feels like it warrants a D-id, raise it rather than minting one.

## Out of scope

- `beforeunload` guards, unsaved-changes prompts, autosave — all rejected in the spec.
- A discard/revert control. Not asked for; the user can retype or reload.
- Any other write surface. Everything else already has an explicit submit.
