# Recipe note — explicit save, like every other write surface

**Date:** 2026-07-20
**Thread:** recipe notes (spawned by the R-36 reviews)
**Type:** single-component behaviour change
**Supersedes:** `2026-07-19-recipe-note-autosave-design.md`

## Problem

`RecipeNotesCard` saves the private note **only on blur**, and shows nothing
while the text is unsaved. Two things follow from that:

1. Close the tab, lose the battery, or let the browser kill the page while the
   textarea still has focus, and everything typed is gone with no warning.
2. More fundamentally: **this is the only component in the app that behaves this
   way.** `grep -rn "onBlur" src/ --include=*.tsx` returns exactly one non-test
   line — this one. The recipe editor, the R-36 steps field, ingredients,
   objetivos and phases are all forms with an explicit `handleSubmit` and a save
   button. The steps field has no save logic of its own at all; the form's
   submit writes it.

The note is the odd one out, and the odd behaviour is also the unsafe one.

## Decision

**An explicit save button, and blur-save is removed.** The note stops being
special and behaves like every other field in the app.

Rejected alternatives:

- **Autosave** (approved 2026-07-19, dropped 2026-07-20). It removes the data
  loss, but at the cost of a debounce, a settled-draft guard against wiping the
  note on mount, and a last-saved ref to stop the save feeding itself. All of
  that to make one field *more* unlike the other ten. See the superseded spec
  for the full cost analysis — it is accurate, it just answers a question we
  stopped asking.
- **`beforeunload`.** Cannot await an async request, honoured at the browser's
  discretion, and on mobile — the surface this app is used on — frequently does
  not fire at all.
- **Keeping blur-save alongside the button.** The button would be near-dead UI:
  with blur-save present it only ever fires for a user who saves without leaving
  the field. Two overlapping mechanisms is the muddle, not the safety net.

## Accepted trade-off, stated plainly

Typing and tapping away **without** pressing the button now loses the text,
where today it would have saved. That is a real behaviour regression and it is
accepted deliberately: it is the same contract every other editing surface in
the app already has, and the visible unsaved state is what makes it fair. There
are no production users yet, so nothing has learned the old behaviour.

What the button does **not** do is fix the tab-close loss — a user who types and
closes without pressing it loses the note exactly as before. The change is that
the app stops *implying* the work is safe. Legibility, not durability.

## Design

- The textarea keeps its current shape and placement in the card header row.
- A **Guardar** button sits in the card, enabled only when the draft differs
  from the stored note (compared trimmed, as the blur path already did).
- While the draft differs, the card shows an unsaved marker where the
  `Guardado` indicator lives today. It is the whole justification for dropping
  blur-save, so it is not optional.
- On success the existing `Guardado` indicator appears and clears on the next
  keystroke, exactly as it does now.
- `onBlur` is removed.

Two existing behaviours must survive unchanged:

- **The focus guard on reseeding.** The effect that seeds the draft from server
  data skips while the textarea has focus, so a post-save refetch cannot clobber
  in-progress typing. Still reachable: the user can save and keep typing.
- **The membership gate.** The card returns `null` unless the user holds the
  recipe in their library. `saveRecipeNote` matches zero rows and resolves
  silently for a non-member, so the gate is what keeps that path unreachable.

## Testing

- the button is disabled when the draft matches the stored note, and when the
  difference is only surrounding whitespace;
- pressing it saves the trimmed-comparison-failing draft;
- the unsaved marker appears while dirty and goes away after a successful save;
- blur no longer saves — this is the regression test for the removed behaviour,
  and without it nothing stops blur-save being reintroduced by reflex;
- a refetch landing while the field is focused does not overwrite in-progress
  text (existing test, must keep passing);
- nothing renders, and nothing can be saved, for a user who does not hold the
  recipe.

Each assertion must be proven to bite by reintroducing the corresponding defect
and watching it go red.
