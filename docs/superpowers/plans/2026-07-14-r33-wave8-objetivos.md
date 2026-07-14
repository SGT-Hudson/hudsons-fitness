# R-33 wave 8 — Objetivos — plan

Spec: `docs/superpowers/specs/2026-07-14-r33-wave8-objetivos.md` (read it — it is
the contract; this plan only sequences it).

Ships as **two PRs**. PR-A = the page. PR-B = the editor route + the `23P01` fix.

## Global constraints

Binding on every task. A violation is a failed review.

1. **The macro maths is FROZEN and authoritative.** `computeDailyMacroTargets`
   (`lib/macros.ts`), `computePhaseTargets` (`features/phases/targets.ts`),
   `computeTargetWeightKg`, `estimatedBmr`, `core/nutritionTone.ts`. Consume
   them; never re-derive a target, a macro gram, a lean mass or a BMR in a
   component.
2. **Port layout, NEVER maths, from the canvas.** Its numbers are hardcoded
   fixtures and are internally inconsistent (its hero says 245 g carbs while its
   own phase table says 215).
3. **The canvas is a mock, not a feature list.** It omits `kcal_mode`,
   `protein_g_per_kg`, `fat_pct_of_kcal`, `fiber_mode` and `notes` — **all five
   stay** (spec §1). It invents editable macro grams, a per-phase target weight
   and a per-phase target body-fat — **none of them ship** (they would fork the
   data model, and target weight is derived: hard invariant 5).
4. **R-06 is sacred.** `fat_pct_input` is a UI **percent**; the column is a
   **fraction** (`numeric(4,3)`, 0.10–0.60). `fractionToPct` / `pctToFraction`
   (`lib/macros.ts`) own the conversion — no inline `*100` / `/100` anywhere.
   `parseDecimalInput` runs **before** them, never instead of them. The prefill's
   `.toFixed(1)` is **load-bearing**: rounding instead would rewrite a stored
   27.5 % as 28 % on the next save.
5. **Nothing that works today may disappear**: R-02 notesOnly (frozen >7 days →
   notes-only edit, other fields **disabled, not blanked**), R-05 protein prefill
   (never clobber a manual edit, never re-anchor a stored phase), edit, delete,
   and both kcal modes.
6. **Do NOT build** (strip-list): the TDEE calculator (R-37), the default-template
   picker (R-42), the canvas's weight-progress track in the hero (`/progress`
   already ships it), the per-row overflow menu, the adaptive-TDEE strip.
7. Every new string in **ES and EN** (`src/i18n/{es,en}/objetivos.json`).
8. Public repo: **no AI/Claude attribution anywhere.** Plain conventional commits.
9. `pnpm lint` + `pnpm build` + `pnpm test` green. **jsdom cannot see CSS** — a
   green suite is not a visual pass.

## PR-A tasks

### Task A1 — The phase hero and the phase-tinted rows

- **Phase hero card** (active phase): name + phase-tinted type chip (`PhaseChip`
  already exists and is waiting for this wave), the range + week-of-N, and the
  **daily targets** (kcal + derived P/C/G/fibre) from `computePhaseTargets`
  (feed it via `useDailyTarget`-style wiring — look at
  `features/planning/useDailyTarget.ts`, do not re-implement).
  ⚠️ `computePhaseTargets` returns **null** for `kcal_mode='tdee_delta'` when no
  TDEE estimate exists. Render an honest empty/hint state — do not show zeros.
- **Phase rows** — phase-tinted rail + type badge + status chip
  (activa / programada / histórico), the range, kcal/día, protein g/kg. Use the
  **existing `--phase-*` tokens** (`bg-phase-cut-soft`, `text-phase-cut-ink`,
  `border-phase-cut-line`, …, already in `src/index.css`); the page uses none of
  them today.
  Frozen rows (R-02) keep the dim + the **"editar notas"** affordance. Edit and
  delete stay.
- ⚠️ The active hero uses the **section accent** (nutri green), not the phase
  colour — the canvas reserves phase colour for identity, accent for "this is the
  live one".

### Task A2 — Option-B history, and the goal card

- **"Programadas"** — future phases as an always-expanded group above the
  history. `phaseStatus` in `ObjetivosPage.tsx` already computes `upcoming`; move
  it into the feature rather than leaving it as a page-local helper.
- **"Historial de fases"** — past phases collapse behind a full-width bar
  (chevron + "N fases · M meses" + a row of phase-coloured dots + "Ver todo"),
  expanding in place. Local state.
- **The goal card** (target body-fat %) — restyled, keeping its dialog for now
  (PR-B may migrate it to `ResponsiveDialog` if it is cheap; it is not the point
  of this wave).
- **`ProgressTabs`** — consider moving it onto the new `SegmentedControl`
  (wave 7). It is shared with `/progress`; if the swap is not clean, leave it.

### Task A3 — Tests + verification for PR-A

- The page has almost **no coverage** today (`ObjetivosPage.test.tsx` only tests
  the goal dialog). Add Tier-2: the hero renders the derived targets; the
  Programadas/Historial split; the collapse toggles; a frozen row shows
  "editar notas" and **not** edit/delete; delete calls the mutation.
- ⚠️ A `.test.tsx` rendering a supabase-importing component fails in CI without
  env unless the data hooks are mocked.
- Full `pnpm lint && pnpm build && pnpm test` + the **real-browser pass**
  (mobile 390 + desktop, light + dark) — run by me, not on a subagent's report.

## PR-B tasks

### Task B1 — The editor route

Follow the wave-5/6 editor-page pattern **exactly** (`IngredientEditorPage` /
`RecetaEditorPage`):

- Routes `/progress/goals/phases/new` + `/progress/goals/phases/:id/edit`;
  `const isNew = !id`; `exitTo = '/progress/goals'`.
- The **page** owns params, the row query, the guard
  (`<Navigate to={exitTo} replace/>` when the id does not resolve), `PageShell`,
  and the mutations. The **form** (`PhaseEditorForm`) owns the fields and exports
  `PHASE_EDITOR_FORM_ID`; the save button lives in the header and submits by
  `form={PHASE_EDITOR_FORM_ID}`.
- ⚠️ `PageShell` here renders a **`BackHeader`** (because `back` is passed), and
  **`BackHeader` DOES take `actions` on mobile** — unlike a root page. So the
  header save button works on both breakpoints. Do **not** re-create it in the
  body.
- `notesOnly` becomes a **page mode** (frozen phase → notes-only), not a dialog
  prop. Fields **disabled, not blanked** — the full schema still validates the
  save through the same submit path.
- `PhaseDialog`'s `open`-gated effects become **mount-time seeds** on a route:
  the `reset()`-from-row prefill and the "never re-anchor a stored phase" guard
  must be re-expressed, not dropped. Memoize any `location.state` seed so its
  identity is stable (a fresh reference per render re-`reset()`s the form and
  wipes what the user is typing — the trap `IngredientEditorPage` documents).
- Use `SegmentedControl` (wave 7) for `phase_type`, `kcal_mode` and `fiber_mode`
  — they are exactly its shape. **Both kcal modes ship** (Gonzalo).
- Retire `PhaseDialog`.

### Task B2 — The live preview

Phase-tinted, right column on desktop / inline card on mobile, updating as the
user types: the phase pill + name, the kcal target, and the **derived** macro
split (P/C/G/fibre) from the real maths. A macro split bar is fine — but the
numbers come from `computeDailyMacroTargets` / `computePhaseTargets`, never from
the canvas.

### Task B3 — The `23P01` fix (the bug this wave owes)

- The page wraps `mutateAsync` in **try/catch** and renders the failure inline
  (the `RecetaEditorPage` error-banner pattern), instead of letting the promise
  reject into nothing.
- Detect the overlap by **`error.code === '23P01'`** (PostgREST returns a plain
  object, **not an `Error`** — which is exactly why `toastError` currently
  degrades to the generic "algo ha ido mal"). Map it to a new localized
  `phases.form.errors.overlap` (ES + EN), anchored on the date fields.
- Test it: a `23P01` rejection produces the localized message, and the editor
  does **not** silently do nothing.

### Task B4 — Tests + verification for PR-B

- **`PhaseDialog.test.tsx` is the crown jewel** (274 lines). Port **every**
  assertion to the new harness: the R-06 conversion (`27,5` → `0.275`, never
  `2.75`, never NaN), the >4 g/kg protein gate the DOM no longer owns, notesOnly
  disabling everything but notes, R-05 prefill + the no-re-anchor guard, and the
  fractional prefill that must not round. **Rewrite the harness, never the
  guarantees.**
- Full gate + the **real-browser pass**, and in it: **drive an overlapping save
  and confirm the user is actually told what happened.**
