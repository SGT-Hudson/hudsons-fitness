# Brainstorm prompt — Training coach rule catalogue (next-session)

> **For the next chat session:** this is a brainstorm seed, not a spec.
> Read the context below, then invoke `/brainstorming` and feed this
> document as the starting material. Output goes to a spec, then a
> plan, then implementation, following the same flow as the Training
> MVP itself.

## Context (what already exists)

- **Spec:** `docs/superpowers/specs/2026-05-20-training-mvp-design-v2.md`
- **Plan:** `docs/superpowers/plans/2026-05-20-training-mvp-plan.md`
- **Pure core (already in repo):** `src/core/training.ts` — implements
  the engine + 5 starter rules; 55 Vitest tests pass.
- **Current 5 starter rules in `MVP_COACH_RULES`:**
  1. `double-progression` (RPE-gated; same load × target reps at RPE ≤ rpeMax over N sessions → bump load)
  2. `rep-progression` (no RPE; same load with strictly increasing top-set reps over N sessions → bump load)
  3. `flat-e1rm-deload` (e1RM trend spread ≤ band over flatWindow sessions → suggest deload)
  4. `rpe-climbing-fatigue` (RPE strictly increasing at same anchor weight over N sessions → suggest -10% load)
  5. `muscle-recency` (daysSinceMuscle ≥ nudgeAfterDays → "haven't trained X in N days")

## Hard architectural constraints (cannot be relaxed in this brainstorm)

- **No LLM, ever** (spec §2.2). Every new rule is a pure function over
  the user's own logged data. No model invocation in `CoachRule.evaluate`
  or anywhere downstream. The engine signature stays sync / pure.
- **Training never feeds TDEE** (spec §2.1). Rules must NOT read
  `phases`, `tdee_*`, or `daily_nutrition_history`. Training is its own
  domain.
- **Per-render evaluation.** Every rule is a pure function of its
  `CoachContext`; no scheduled jobs, no background workers, no
  precomputed cache.
- **Transparency required.** Every suggestion must show its rule and
  the inputs that triggered it. No black-box "score" output.
- **i18n keyed headlines.** Each rule emits an i18n key + a detail blob;
  the UI resolves and substitutes. Both ES and EN ship complete.

## Seed list to expand on (from spec §12)

1. **1RM-cycle suggestions.** *"You've hit your e1RM at 5 reps three
   sessions running — schedule a true 1RM attempt next session."*
   - Open: how do we define "schedule"? UI prompt? Calendar nudge?
   - Open: do we want to track 1RM attempts explicitly (a flag on the
     set)? Today the set log doesn't distinguish.
2. **Volume-landmark progressions** (RP MEV/MAV/MRV style). Week-over-
   week working-set count per muscle group; suggest dropping volume
   when sets-per-week exceeds MRV-like ceiling.
   - Open: requires per-muscle weekly volume aggregation. Need a new
     pure helper (`weeklyVolumeForMuscle(history, weekISO)`).
3. **Exercise rotation prompts.** *"You've been logging back squat
   exclusively for 12 weeks; consider rotating to front squat or pause
   squat."*
   - Open: needs a notion of "exercise variant family" — is that a
     column on `exercises` or derived from name similarity?
4. **Pre-workout variant-swap nudges.** Same shape as 3, surfaced at
   exercise-pick time.
5. **Bar-speed / RPE-mismatch detection.** RPE going DOWN at the same
   load over sessions = inverse of fatigue rule → "you've gotten
   stronger; the bump rule didn't fire because RPE wasn't logged on
   the boundary session."
   - Open: redundant with Rule 1b (rep-progression)? Or genuinely
     additive (e.g. catches strength gains without rep increases)?

## Candidates the spec deliberately didn't seed (raise these too)

- **Frequency / per-week volume nudges.** *"You trained chest only once
  this week; you typically train it twice."* Detects under-frequency
  without needing routines.
- **Plateau-break suggestions.** Beyond simple deload: drop sets,
  rest-pause, intensity techniques. Overlaps with Rule 2.
- **Asymmetry detection.** If left-vs-right is ever logged
  (single-leg/single-arm work), suggest training the weaker side first.
  Out of scope until single-side logging exists.
- **Warmup recommendations.** *"Based on your top set last time,
  suggest a 5-step warmup ramp."* Useful but UX-heavy.
- **Body-comp / phase interaction** (REJECTED on architectural grounds).
  *"You're in a cut; e1RM stagnation is expected; don't deload."* Would
  require training rules reading the phases table — violates §2.1. Do
  not entertain.

## Per-exercise vs per-rule defaults

The spec already has per-exercise `default_increment_kg` (§4.1, §0.14)
used by Rule 1 and Rule 1b. Open question: do other rules need
per-exercise overrides? E.g. should "flat e1RM band" be tighter for
heavy compounds (squat: ±2 kg flat?) than accessories (curl: ±0.5 kg
flat)? If yes, the brainstorm produces another exercises-table column
(e.g. `flat_band_kg`) or a per-equipment derived default.

## Working preferences for the brainstorm

- **One question at a time** (CLAUDE.md preference for converged
  decisions; prose-with-pushback while exploratory).
- **Multiple choice when the question has converged** (3–4 options,
  recommendation first with "(Recommended)" label).
- **Honest pushback** on rules that smell like over-engineering for
  solo-dev MVP scope.
- **No spec changes until brainstorm output is approved** (terminal
  state = `writing-plans` per the brainstorming skill).

## Recommended brainstorm output shape

A new section appended to the Training MVP spec (or a sibling spec if
the catalogue grows beyond ~10 rules) with:

1. The final rule list (3–8 additional rules beyond the starter 5).
2. Per-rule defaults (thresholds, severities, equipment dependencies).
3. Which (if any) of the candidates above are rejected with reasons.
4. Migration / data-model deltas (if any new column on `exercises`).
5. i18n keys for each new rule's headline (`coach.rules.<ruleId>.headline`).

Implementation flow once approved: extend `src/core/training.ts` with the
new pure rules + tests, extend `coach.json` i18n, extend the Training MVP
plan (or write a small follow-up plan) for any UI changes.
