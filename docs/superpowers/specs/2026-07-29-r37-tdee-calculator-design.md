# R-37 — Interactive TDEE calculator

**Date:** 2026-07-29
**Status:** Approved design, pre-implementation
**Relates to:** R-37 (`docs/roadmap.md`), D-B4 (adaptive TDEE), D-B5 (Mifflin as derived display), D-A6/D-D5 (composition is presentational), hard invariant 5 (BMR derived, never stored)

## The problem

The app already estimates TDEE far better than any formula can: R-07's Kalman
filter (`src/core/tdee.ts`) learns your real expenditure from logged intake and
weight, and self-corrects. D-B4 chose it precisely because non-learning methods
are fragile. A formula calculator produces a *worse* number than that.

But the filter has a cold start, and it is a closed loop: `recalculate-tdee`
only runs for profiles that already have at least one row in `phases`, and the
phase editor refuses to compute targets in `tdee_delta` mode without an
estimate — it renders an amber dead-end
(`objetivos.json` → `phases.hero.needsTdee`). So your first phase must use
`absolute` mode, and to pick an absolute number you need to know roughly what
your TDEE is. Nothing in the app tells you.

R-37 fills that gap with a formula estimate, and — this is the load-bearing
part — is explicit that the estimate is a starting point the app will beat once
it has your data.

## Decisions closed in brainstorm (do not relitigate)

1. **A standing tool, not a one-shot.** Reachable any time, not only while
   creating a phase; you can use it to play with scenarios ("what if I trained
   five days a week").
2. **Mifflin-St Jeor is the headline; Katch-McArdle is a secondary reading.**
   Mifflin runs on hard data you already have (sex, age, height, weight).
   Katch needs lean mass, i.e. `body_fat_pct` — the noisiest input in the
   system, and the subject of the D-A6/D-D5 guardrail. It appears smaller,
   below, only when a body-fat measurement exists, labelled with the date of
   the measurement it depends on.
3. **One calculator body, two frames.**
   - From **More** → route `/tdee`, body inside a `PageShell`. No apply
     button: there is nothing to apply to. This is the scenario-play mode.
   - From the **phase editor** → the same body inside a `ResponsiveDialog`,
     with an apply action, reachable from beside the kcal field in either
     mode. This is the resolve-what's-in-front-of-you mode.
   The More row navigates like every other row in that list, so there is no
   off-convention exception to explain, and the phase-editor sheet never traps
   the back button because it is a short step inside an edit already in
   progress.
4. **Applying sets `kcal_mode` to `absolute` and `kcal_value` to the estimate,
   together.** In `tdee_delta` mode `kcal_value` is the *delta*, so writing a
   TDEE there would be plain wrong. And the situation that brings you here is
   exactly "no adaptive TDEE, so delta mode is unusable" — switching the mode
   is the only coherent action. The button says so in its label rather than
   doing it silently.
5. **Nothing is stored.** No migration, no RPC, no activity-level column. The
   whole screen is derived, so invariant 5 holds by construction.
6. **The edge function's hardcoded `1.4` activity seed stays as it is.**
   Feeding the user's chosen activity level into the Kalman seed would mean
   persisting an activity level (new schema) to improve a value the filter
   self-corrects within roughly two weeks. Not worth it.

## The screen

Three blocks, vertical, mobile-first. Everything recomputes live as you type —
the same approach `PhasePreview` uses, which re-derives from the raw draft
rather than waiting on a schema.

### 1. Your data

Sex, age, height, weight — prefilled from `profiles` and the latest
`body_measurements` row.

They are editable **in place and only in place**: editing never writes back to
the profile. That is the point of the tool (asking "what if I weighed 78?"),
and it keeps Settings as the single place that owns profile edits. A small
reset affordance returns every field to your real data.

A useful side effect: because the inputs live in local component state, the
calculator works even when the profile is incomplete. A user who has not
entered a height can type one here and get an answer, with a hint that Settings
is where to make it stick.

### 2. Activity level

Five selectable rows, vertical, each with its multiplier and a plain-language
description of what that life actually looks like:

| Level | Multiplier |
|---|---|
| Sedentary | 1.2 |
| Light | 1.375 |
| Moderate | 1.55 |
| Active | 1.725 |
| Very active | 1.9 |

Not a segmented control (five options do not fit on a phone) and not a slider
(no such component exists in the repo, and this does not justify a new Radix
dependency). Choosing well here *is* the hard part — that 1.2-to-1.9 span is
roughly ±600 kcal of self-flattery — so the descriptions carry real weight and
must be concrete, not adjectives.

### 3. The result

- **Mifflin BMR**, shown above the headline so the arithmetic is visible.
- **TDEE = BMR × multiplier**, the headline number.
- **Katch-McArdle**, smaller, below, only when a body-fat measurement is
  available: `BMR = 370 + 21.6 × leanKg`, then the same multiplier. It is
  rendered with the date of the measurement it used, because that date *is*
  the caveat — a reading from four months ago says so itself, and that is more
  honest than an arbitrary staleness cutoff in code.

## The honesty block

When an adaptive estimate exists (`tdee_estimates.estimated_tdee_kcal` via the
existing `useLatestTdee`), a comparison strip appears under the result: the
measured number, its difference from the formula estimate, and a plain
statement that the measured one wins, because it comes from your real intake
and weight rather than a population formula. The strip also carries the
existing confidence band (`tdeeConfidenceBand`) so a warming-up estimate does
not overclaim.

The calculator is not demoted or hidden when this happens — it stays fully
interactive for scenarios. It simply stops pretending its number is the one to
act on.

When no adaptive estimate exists, the formula result is the headline, with a
note that a couple of weeks of logging will give the app a better number and
move this one to second place. That is a promise the filter actually keeps.

## Architecture

### `src/features/tdee/formulas.ts` (new, pure)

The activity-multiplier table, `katchMcArdle`, and the function that composes
an estimate from the inputs. It imports `mifflinStJeor` from `src/lib/macros.ts`
rather than reimplementing it — there is already a second copy in the edge
function, and a third would be a liability.

The compose function mirrors `estimatedBmr`'s contract: it returns `null` when
any input is missing or non-sensible (weight ≤ 0, height ≤ 0, age ≤ 0 or ≥ 120)
so the caller simply does not render a result. This matters concretely because
`useDecimalDraft` commits `0` when a field is cleared — without the guard, an
emptied weight field would render a confident, meaningless number.

### `src/features/tdee/components/TdeeCalculator.tsx` (new)

The shared body: the three blocks above, holding its own input state. Its data
arrives as props (see *Data it consumes*), and it takes an optional apply
callback — with the callback it renders the apply action, without it it is
read-only.

### The two frames

- `src/pages/TdeeCalculatorPage.tsx` — route `/tdee`, registered in
  `src/app/router.tsx` inside the authenticated/onboarded group like its
  siblings. `PageShell` with `back="/more"`, matching how `/settings` does it.
- A sheet mounted by the phase editor: `ResponsiveDialog` (`variant="panel"`).
  On apply, the editor's draft sets `kcal_mode` to `absolute` and `kcal_value`
  to the estimate rounded to whole kcal, and the sheet closes.

### Where the phase editor opens it from

**Two triggers, one sheet.** The primary one sits next to the `kcal_value`
field and is present in both modes — that is the field the calculator exists to
help you fill, and it is the only trigger a new user will ever encounter:
`blankForm()` starts a new phase in `absolute` mode
(`PhaseEditorForm.tsx:95`), so anyone creating their first phase never sees the
amber notice at all. Tying the entry point to that notice would hide the tool
from exactly the user it was built for.

The second trigger is inside the amber `needsTdee` notice in `PhasePreview`.
That notice is a dead end today, and a dead end deserves an exit.

The apply action is available in both modes because its label names the
consequence ("use 2,400 kcal as a fixed target"), so switching the mode away
from `tdee_delta` is disclosed rather than silent.

### Data it consumes

All existing hooks, no new fetchers: `useProfile`, `useLatestMeasurement`,
`useLatestTdee`, and `useRecentMeasurements(30)` scanned client-side for the
most recent row with a non-null `body_fat_pct`. That scan is deliberately
preferred over a new precise query: this is a secondary display reading, and it
keeps the change's DB surface at zero.

**The two frames call these hooks; the body does not.** Each frame passes the
resulting values down as props. That keeps `TdeeCalculator` renderable in a
Tier-2 test without mocking Supabase — a component that transitively imports
`@/lib/supabase` passes locally and fails in CI, where no env is present.

### Navigation

A fifth row in `src/pages/MorePage.tsx`'s `ROWS`, pointing at `/tdee`, with a
calculator icon and a chip colour consistent with the existing four.

## Missing data and error handling

- **Incomplete profile:** no error state. Fields start empty, the result is
  withheld until they are sensible, and a hint points at Settings for making
  the values permanent.
- **No body-fat measurement:** the Katch line is absent. No placeholder, no
  explanation of an absence — the same "just don't render the stat" pattern
  `LatestMeasurementCard` uses for null stats.
- **No adaptive estimate:** the comparison strip is absent and the
  forward-looking note takes its place.
- **Nothing can fail to save,** because nothing saves.

## Testing

- **Tier-1** over `formulas.ts`: each multiplier, Katch against a hand-computed
  case, and the degenerate inputs (cleared field → 0, absurd age, missing
  height) returning `null` rather than a number. These must be proven to bite —
  a mutation of the multiplier table or the Katch constants has to turn a test
  red.
- **Tier-2** component test of `TdeeCalculator` with injected data: live
  recompute on input change, the Katch line appearing only with body fat, the
  comparison strip appearing only with an adaptive estimate, and the apply
  callback firing with both the mode and the value.
- **e2e:** `/tdee` joins the route list in `e2e/smoke.spec.ts` — the R-32 sweep
  asserts the route resolves, renders its `h1`, and logs no console errors.

## Out of scope

- Persisting the activity level, or feeding it into the Kalman seed (decision 6).
- Any change to `recalculate-tdee`, `src/core/tdee.ts`, or the `tdee_*` tables.
- Other formulas (Harris-Benedict, Cunningham).
- Surfacing the adaptive TDEE number anywhere new outside this screen; today
  only the diary hero prints it, and that stays as it is.
- A goal-weight or rate-of-loss projection — that is R-38's territory.
