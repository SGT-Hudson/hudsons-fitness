# Recipe note autosave — stop losing the note on tab close

> ⚠ **SUPERSEDED 2026-07-20 by `2026-07-20-recipe-note-explicit-save.md`.**
> Autosave was approved here and then dropped before implementation. The
> deciding fact came from the code, not from this document: `RecipeNotesCard`
> is the **only** component in the app that saves on blur — a `grep` for
> `onBlur` across `src/` returns exactly one non-test line, its own. Every other
> write surface is a form with an explicit submit. Autosave would not have
> resolved that inconsistency; it would have deepened it, leaving the note as
> the only field with autosave *and* the only one with blur-save.
>
> The analysis below is kept because it is still correct about what autosave
> would have cost and why `beforeunload` was never viable. Do not implement it.

**Date:** 2026-07-19
**Thread:** notes autosave (spawned by the R-36 reviews)
**Type:** single-component behaviour change

## Problem

`RecipeNotesCard` saves the private recipe note **only on blur**. Close the tab,
lose the battery, or let the browser kill the page while the textarea still has
focus, and everything typed is gone with no warning. There is no `beforeunload`
guard, and there is no autosave precedent anywhere in the repo to fall back on.

## Decisions

1. **Debounced autosave** (approved), not `beforeunload`. The unload event
   cannot await an async request, browsers honour it at their discretion, and on
   mobile — the surface this app is used on — it frequently does not fire at
   all. Autosave removes the failure mode instead of patching the exit.
2. **Blur-save stays.** It covers typing and leaving faster than the debounce
   window.
3. **No "unsaved changes" prompt.** Friction on a field that saves itself.

## Design

The card debounces its draft by ~1.5s using the existing
`useDebouncedValue` (`src/hooks/use-debounced-value.ts`) — note it debounces a
*value*, not a callback, so an effect watches the delayed value and fires the
save.

The save fires when the debounced text differs from what the server holds,
compared trimmed, exactly as the blur path already compares. That comparison is
what keeps the feature from feeding itself: a successful save invalidates the
note query, the refetch resolves with the value just written, and if the check
were anything looser the card would save in a loop every 1.5s.

Two existing behaviours must survive, both of which already exist in this
component for good reason:

- **The focus guard on reseeding.** The effect that seeds the draft from server
  data skips while the textarea has focus, because a post-save refetch would
  otherwise clobber in-progress typing. Autosave makes that round trip happen
  *while the user is still typing*, every 1.5s, so this guard stops being an
  edge case and becomes load-bearing.
- **The membership gate.** The card returns `null` unless the user holds the
  recipe in their library. `saveRecipeNote` matches zero rows and resolves
  silently for a non-member, so the gate is what keeps that unreachable.
  Autosave must not fire before the gate is satisfied.

**The saved indicator** currently appears on blur and persists until the next
keystroke. With autosave it will appear while typing, so it clears itself after
a few seconds — otherwise it becomes permanent furniture that stops conveying
anything.

## Testing

With fake timers:

- typing then waiting saves, without the field ever losing focus;
- typing and reverting to the original text saves nothing (the loop guard);
- a refetch landing while the field is focused does not overwrite in-progress
  text — the existing test extended to the autosave path;
- the indicator appears on success and clears itself;
- no save fires for a user who does not hold the recipe.

Each assertion must be proven to bite by reintroducing the corresponding defect
and watching it go red — the loop guard especially, since a self-feeding save
still passes a naive "it saved" assertion.
