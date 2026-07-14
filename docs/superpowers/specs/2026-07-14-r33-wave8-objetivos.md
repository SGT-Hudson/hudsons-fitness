# R-33 wave 8 — Objetivos

**Status:** approved (Gonzalo, 2026-07-14). Implements §6 wave 8 of the R-33 UI
redesign spec, **corrects four of its assumptions** (§1), and **fixes a live bug**
(§2). **No schema change.**

Canvas artboards (read-only, `/mnt/d/dev/claude-design-hudson-fitness`):
`objetivos-mobile.jsx` · `objetivos-web.jsx` (`PhaseHeroCard`, `PhaseRow`) ·
`objetivos-secciones.jsx` (**`ObjetivosWebV2B` — option B is the registered one**)
· `objetivos-editor-parts.jsx` + `objetivos-editor-web.jsx` (full-page editor,
live preview) · `progreso-objetivos-mobile-detail.jsx` (`PhaseEditorMobile`).

Standing rule (wave 7): **where the mobile and web artboards disagree, mobile
wins.** And the standing lesson: **the canvas is a mock, not a feature list.**

## 1. Four corrections to the R-33 spec

The spec says "same fields/validation … preserved". Taken literally against the
canvas, that is impossible — **the canvas's editor omits half the real form and
invents fields the data model forbids.** What ships:

- **The canvas omits `kcal_mode`, `protein_g_per_kg`, `fat_pct_of_kcal`,
  `fiber_mode` and `notes`.** All five are real columns that feed the daily
  targets. **All five stay.** The editor will therefore have *more* cards than
  the artboard. (Gonzalo, 2026-07-14: **both kcal modes stay** — `absolute` is
  the safety net, because `computePhaseTargets` returns **null** for
  `tdee_delta` when no TDEE estimate exists.)
- **The canvas makes the macros editable grams** (Proteína/Carbos/Grasas/Fibra).
  The app **derives** them from kcal + `protein_g_per_kg` + `fat_pct_of_kcal`
  via `computeDailyMacroTargets`. Editable grams would be a different data
  model. **The macros stay derived** and are rendered read-only, in the live
  preview.
- **The canvas puts "Peso objetivo" in the phase editor.** Target weight is
  **derived, never stored** (hard invariant 5, `computeTargetWeightKg`). Not
  built as a field.
- **The canvas puts "% graso objetivo" in the phase editor.** It exists, but on
  `goals` — **one row per user**, not per phase. It stays where it is (the goal
  card on this page). Duplicating it per phase would fork the source of truth.

## 2. The bug this wave fixes

**`PhaseDialog` swallows a failed save.** The DB has an exclusion constraint
(`phases_user_id_daterange_excl`, an **inclusive** `[]` daterange — two phases
sharing a boundary day already overlap). An overlapping save returns PostgREST
`23P01` / 400. Today:

- `api.ts` throws the raw PostgREST error object, which **is not an `Error`**, so
  `toastError` falls through to the generic "algo ha ido mal";
- `PhaseDialog.onSubmit` awaits the rejected promise, so `onOpenChange(false)`
  never runs — **the dialog just sits there**, with no field error and no
  explanation, and the rejection escapes as an unhandled promise rejection.

**The editor must catch it and say what happened**: map `23P01` to a localized
"esta fase se solapa con otra" — new key `phases.form.errors.overlap` (ES + EN),
rendered inline (the `RecetaEditorPage` try/catch + error-banner pattern), and
anchored on the date fields. The form's own `end_date > start_date` refine says
nothing about *other* phases; only the server knows.

## 3. What ships

### 3.1 `/progress/goals` — the page

- **Phase hero card** for the active phase: identity (name + phase-tinted type
  chip), the date range and week-of-N, and the **daily targets** (kcal + the
  derived P/C/G/fibre) — computed by `computePhaseTargets`, never re-derived in
  the component. Phase tint uses the existing `--phase-*` tokens (raspberry cut /
  violet bulk / stone maintenance), which the page uses **none** of today.
  *Not built:* the canvas's weight-progress track (start/actual/goal). `/progress`
  already ships exactly that bar, from the same derived numbers — a second copy
  would be a second place to get it wrong.
- **Option-B history** (the registered artboard): future phases render as an
  always-expanded **"Programadas"** group (`phaseStatus` already computes
  `upcoming` — no schema needed), and past phases collapse behind a **"Historial
  de fases"** bar showing a row of phase-coloured dots + "Ver todo".
- **Phase rows** — phase-tinted rail, type badge, status chip
  (activa/programada/histórico), the range, kcal/día and protein g/kg. Frozen
  rows keep their dimmed treatment and their **"editar notas"** affordance
  (R-02). **Edit and delete stay.**
- The **goal card** (target body-fat %) stays, restyled.

### 3.2 The phase editor becomes a route

`PhaseDialog` (a modal) → the **editor-page pattern of waves 5-6**:
`/progress/goals/phases/new` + `/progress/goals/phases/:id/edit`, a
`PhaseEditorForm` exporting `PHASE_EDITOR_FORM_ID`, the save button in the header
submitting the form by id, `exitTo = '/progress/goals'`, mutations in the page
inside a **try/catch** (§2).

⚠️ `ObjetivosPage` passes `back`, so `PageShell` renders a **`BackHeader`, which
does take `actions` on mobile** — unlike a root page. The save button works on
both breakpoints; do not re-create it in the body.

Everything the form owns today survives, unchanged in behaviour:
- **R-06** — `fat_pct_input` is a **percent** in the UI, stored as a 0.10–0.60
  **fraction**. `fractionToPct` / `pctToFraction` (`lib/macros.ts`) keep owning
  it; `parseDecimalInput` runs **before** them, never instead. The `.toFixed(1)`
  on prefill is load-bearing (it kills float dust at `numeric(4,3)`'s precision;
  rounding instead would rewrite a stored 27.5 % as 28 % on the next save).
- **R-05 prefill** — protein per kg re-anchors from the phase-type table on
  type change, but **never** when the user has touched the field and **never**
  for a stored phase.
- **R-02 notesOnly** — a phase frozen >7 days past its end edits **notes only**.
  This becomes a **page mode**, not a dialog prop: every other field renders
  disabled (disabled, **not blanked** — the full schema still validates the
  notes-only save through the same submit path).
- The zod schema, its error codes, and the `NumberField` decimal boundary
  (#198) are untouched.

### 3.3 The live preview

The editor's right column (desktop) / an inline card (mobile): a **phase-tinted**
preview that updates as you type — the phase pill and name, the kcal target, and
the **derived** macro split. It reads `computePhaseTargets` / the real macro
maths. **Never port arithmetic from the canvas** — its numbers are hardcoded
fixtures and are internally inconsistent (its hero says 245 g carbs while its own
phase table says 215).

### 3.4 Not built (strip-list)

- **TDEE calculator** (R-37) — fully drawn in the canvas (web modal + mobile
  screen). Not this wave.
- **Default-template picker** (R-42) — the *slot* is drawn; the picker itself
  never was.
- The canvas's per-row overflow menu, per-phase retrospective "notas" beyond
  R-02, and the adaptive-TDEE marketing strip.

## 4. Test gate

- `PhaseDialog.test.tsx` (274 lines) is the **crown jewel** and must survive the
  move to a route: it pins the R-06 conversion (`27,5` → `0.275`, not `2.75`,
  not NaN), the protein >4 g/kg gate the DOM no longer owns, notesOnly's
  disabled-but-not-blanked fields, R-05's prefill and its no-re-anchor guard, and
  the fractional prefill that must not round. **Port every assertion.** Rewrite
  the harness, never the guarantees.
- `macros.test.ts`'s R-06 round-trip stays green untouched.
- **New:** the overlap error (§2) renders a localized message instead of a
  silent open dialog.
- **New:** the page has almost no coverage today (`ObjetivosPage.test.tsx` tests
  the goal dialog only — nothing pins the phase list, the freeze/grace rule, or
  delete). Add Tier-2 for the new composition, the Programadas/Historial split,
  and the frozen row's notes-only affordance.
- **Real-browser pass, mandatory** (jsdom cannot see CSS): mobile 390px +
  desktop, light + dark. **Drive an overlapping save and confirm the user is
  told.**

## 5. Ship

Two PRs:
- **PR-A** — the page: phase hero, option-B history (Programadas + collapsible
  Historial), phase-tinted rows, the restyled goal card.
- **PR-B** — the editor route (+ the live preview, notesOnly as a page mode) and
  the `23P01` fix; retires `PhaseDialog`.
