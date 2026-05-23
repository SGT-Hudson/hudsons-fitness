# U-7 — Defer ingredient dropdown until typing — Design

**Status:** design — awaiting user review before plan
**Triage item:** U-7 (see `2026-05-23-notes-triage.md`)
**Depends on:** none. **Enables:** none. Tiny UX fix.

## 1. Goal

In the recipe editor's ingredient picker (`IngredientAutocomplete`), the results
dropdown currently opens on **focus**, showing an arbitrary first slice of the local
ingredient list before the user has typed anything — which is noise. It should open
**only once the user starts typing**.

## 2. Decisions (locked 2026-05-23)

1. **Threshold: ≥ 1 character.** The dropdown opens as soon as `query.trim()` is
   non-empty. The local search is in-memory and instant, so there is no reason to
   require 2–3 chars (the `>= 3` gate on `useOFFSearch` exists only because OFF is a
   network call — not a precedent here).
2. **Empty focus shows nothing** — no dropdown, no "recent/most-used" list. The input
   placeholder already guides. Do not run the local search with an empty query.
3. The **"+ Crear «X»"** create affordance is unchanged — it already only renders when
   `query.trim()` is non-empty, which is exactly when the dropdown is open.

## 3. Change

`src/features/recipes/components/IngredientAutocomplete.tsx`:

- The dropdown's open state becomes driven by the query, not by focus. Concretely:
  drop `onFocus={() => setOpen(true)}`; in `onChange`, open only when the new value is
  non-empty and close when it is emptied. (Equivalently, gate the dropdown render on
  `open && query.trim().length > 0`.)
- The local search hook is only enabled / only returns results for a non-empty query,
  so focusing an empty field issues no query and shows no list. (If
  `useLocalIngredientSearch` currently returns a default slice for `''`, guard the call
  so an empty query yields no results.)
- The outside-click / selection / clear behaviours are otherwise unchanged.

## 4. Out of scope

No recent/favourite ingredients surface, no change to the OFF search path, no change
to the create-ingredient dialog.

## 5. Testing

- **Tier-2 (`IngredientAutocomplete` component):** focusing the empty input shows no
  dropdown; typing one character opens it and shows matching results; clearing the
  text back to empty closes it; the "+ Crear" row appears only with a non-empty query.

## 6. Risks / notes

- Trivial, isolated to one component. No data-model, RLS, macro, or i18n impact.
