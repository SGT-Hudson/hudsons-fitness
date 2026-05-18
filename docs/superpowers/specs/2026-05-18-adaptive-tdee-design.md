# Adaptive TDEE — design spec (R-07 / D-B4)

**Status:** spec — implementation lands in the same PR; schema migration
staged and edge deploy applied at the Wave-3 prod checkpoint (live DB/edge
untouched by the PR).
**Decision of record:** `docs/decisions.md` D-B4 (authoritative — the *model*
is already decided there; this spec only pins the *concrete, deterministic
math + schema + integration* needed to implement it). This spec does not
re-open D-B4.

---

## 1. What D-B4 already decided (not re-litigated here)

- Replace the 14-day two-endpoint energy-balance model and its
  `14d / 10d / ±3d / 7700` gating with a **fully adaptive expenditure
  estimator** (MacroFactor / Hacker's-Diet–Kalman lineage).
- **Persistent per-user state**: trend weight + running expenditure estimate
  + variance.
- Each day **predicts** the smoothed weight change from `intake −
  expenditure`, compares it to the **observed** smoothed weight change, and
  the **residual self-corrects expenditure** through a filter.
- `7700 kcal/kg` is **demoted to an internal conversion prior**, not the
  headline formula.
- The `14d / 10d / ±3d` window gating is **retired** as the primary
  mechanism.
- **Filter variance → a UI confidence signal.**

Everything below is the implementable, deterministic realization of exactly
that, with each open choice decided and justified.

---

## 2. Filter choice — **2-state linear Kalman filter** on
`x = [ trend_weight_kg , expenditure_kcal ]ᵀ`

**Decision: a 2-D Kalman filter**, not a 1-D adaptive reconciliation and not
a 1-D Kalman on expenditure alone.

**Why 2-D over 1-D reconciliation.** A 1-D "compare predicted vs observed,
nudge expenditure by `gain × residual`" filter (Hacker's-Diet style) needs a
*separately maintained* trend-weight smoother (e.g. the existing
`body_measurements_smoothed` 5-day MA) as its observed signal. That couples
two estimators with two different noise models and gives no principled,
self-tuning gain. Putting **trend weight in the state vector** lets the same
filter (a) smooth the raw daily weigh-in into a trend (replacing the external
MA as the *filter's* input, see §8) and (b) attribute the
prediction-vs-observation residual to expenditure — with a single,
covariance-derived Kalman gain that is automatically larger during warm-up
(high covariance) and smaller once converged (low covariance). That gain
behavior is exactly the "confidence" signal D-B4 wants, for free, from one
coherent model.

**Why not 1-D Kalman on expenditure only.** Then trend weight is again an
external input; same coupling problem, and the filter cannot express the
(small but real) trend-weight/expenditure covariance the energy-balance
coupling induces.

**Linear, not EKF.** The measurement and dynamics below are *linear* in the
state (see §4–§5), so a plain linear Kalman filter is exact — no
extended/unscented machinery, no Jacobians, fully deterministic and trivially
testable. Energy balance is linearized through the constant prior `α = 7700
kcal/kg` (§6); D-B4 explicitly demotes 7700 to exactly this role.

---

## 3. State, stored per user (`tdee_state`, one row per user)

| symbol | column | meaning | unit |
|---|---|---|---|
| `w` | `trend_weight_kg` | filtered ("true") body weight, de-noised | kg |
| `e` | `expenditure_kcal` | running TDEE estimate | kcal/day |
| `P` | `cov_ww, cov_we, cov_ee` | 2×2 symmetric state covariance (3 stored scalars: `P₀₀`, `P₀₁=P₁₀`, `P₁₁`) | kg², kg·kcal, kcal² |
| — | `last_updated_on` | calendar date (Madrid) of the last processed day | date |
| — | `observations_count` | number of measurement-updates folded in so far (warm-up gate) | int |
| — | `user_id` | FK → `profiles.id`, unique | uuid |

`P` is stored as **three scalars** (`cov_ww`, `cov_we`, `cov_ee`) because a
2×2 symmetric matrix has 3 free entries; this avoids an array column and
keeps the migration plain-typed (consistent with the hand-written
`types/database.ts` convention until R-04).

State is **append-in-place** (one row per user, upserted). The existing
`tdee_estimates` table is **kept** and still receives one row per
`computed_on` (the *output* series the UI/chart reads — unchanged contract,
see §9); `tdee_state` is the new *filter memory*. They are orthogonal:
`tdee_estimates` = time series of emitted estimates; `tdee_state` = the
single evolving filter state.

### Schema-approach decision: **new `tdee_state` table**, do NOT extend `tdee_estimates`

Chosen to **avoid coupling with R-08** (which is separately staged and drops
the 4 dead `tdee_estimates` columns `bmr_kcal / activity_kcal /
neat_residual_kcal / workout_kcal_logged`). A clean new table means:

- R-07's migration never touches `tdee_estimates`' column set → **no merge
  conflict** with R-08 regardless of apply order.
- The filter-memory (single evolving row) and the emitted-series
  (append-per-day) have genuinely different lifecycles and shouldn't share a
  table.
- **Ordering assumption (documented in PR body):** R-07's and R-08's staged
  migrations are *independent and order-free*. R-07 only `create table
  tdee_state` + adds nothing to `tdee_estimates`; R-08 only drops 4
  `tdee_estimates` columns the rewritten edge fn already does not write (see
  §9). Either may be applied first at Wave-3.

---

## 4. Process (time-update) model

State evolves daily. Let `Δt` = whole calendar days since `last_updated_on`
(normally 1; >1 after a gap, see §7).

Energy-balance dynamics, per day, with `α = 7700 kcal/kg` (the demoted prior):

```
w_k = w_{k-1} + (intake_k − e_{k-1}) / α          (weight moves by energy imbalance)
e_k = e_{k-1}                                       (expenditure is a slow random walk)
```

In matrix form `xₖ = F xₖ₋₁ + B uₖ + process_noise`:

```
F = [ 1   −1/α ]      B = [ 1/α ]      uₖ = intake_k (kcal that day)
    [ 0    1   ]          [ 0   ]
```

`intake_k` is **`daily_nutrition_history.consumed_kcal`** for that day
(same source the old model averaged; here it drives the per-day prediction
instead of being window-averaged).

**Process noise `Q`** (tunable constants, fixed in the pure module):

- `q_w` — daily trend-weight process variance: `0.05² kg²/day` (allows the
  trend to move ~50 g/day of genuine signal without the filter fighting it).
- `q_e` — daily expenditure random-walk variance: `15² kcal²/day`
  (metabolism drifts slowly; ~15 kcal/day RMS lets a real diet/activity
  change be tracked within ~2–3 weeks but rejects single-day intake noise).
- Cross term `0`.

`Q` is scaled by `Δt` on a gap (random-walk variance grows linearly with
elapsed days — §7).

---

## 5. Measurement (correction) model

The measurement each day is the **raw daily weigh-in** `z =
body_measurements.weight_kg` for that date (NOT the pre-smoothed view — see
§8 for why the filter consumes the raw weigh-in and produces its own trend):

```
z = H x + v ,    H = [ 1  0 ]      (we observe weight, not expenditure)
```

**Measurement noise `R`** = `1.0 kg²` (daily weigh-in scatter from hydration
/ gut content / glycogen is empirically ~0.5–1.5 kg σ; `σ²=1.0` is a sane
fixed prior; documented as the single tunable that trades trend smoothness
vs responsiveness).

Standard linear KF update on a day **with** a weigh-in:

```
y = z − H x⁻                       (innovation / residual)
S = H P⁻ Hᵀ + R                    (innovation covariance, scalar here)
K = P⁻ Hᵀ S⁻¹                      (Kalman gain, 2×1)
x⁺ = x⁻ + K y
P⁺ = (I − K H) P⁻                  (Joseph form not required: H constant, R>0)
```

The expenditure self-correction D-B4 describes **falls out of `K`'s second
component**: a weigh-in that comes in heavier than the energy-balance
prediction (`y>0`) pushes `e` *up* via `K₁·y` (the filter infers "they must
burn less than I thought"), and vice-versa — exactly the residual-driven
expenditure correction, with the strength set by the learned covariance, not
a hand-set gain.

---

## 6. Is `7700` adapted? **No — it stays a fixed internal prior.**

D-B4: "7700 kcal/kg demoted to an internal conversion prior (not the
headline formula)." We take that literally: `α = 7700` is a **fixed
constant** inside the process model (`KCAL_PER_KG = 7700`), never estimated.

Rationale: making `α` a third estimated state is unidentifiable from
weight+intake alone (it trades off 1:1 with `e` in the dynamics) and would
make the filter non-deterministic-feeling and unstable. The adaptivity D-B4
wants lives entirely in `e` (and `w`); `α` is just the unit conversion that
turns an energy imbalance into a weight delta. Fixed, documented, done.

---

## 7. Cold-start / warm-up & gap handling

### Initialization (first ever run for a user)

- `w₀` = first available `body_measurements.weight_kg` (fallback:
  `profiles.initial_weight_kg`).
- `e₀` = **Mifflin–St Jeor BMR × 1.4** (a light-activity TDEE prior).
  Mifflin lives in `src/lib/macros.ts` (`mifflinStJeor`, kept by D-B5 / R-08
  as a derived value); the filter-core takes `e₀` as an **input** so the
  core stays dependency-free and deterministic (the edge adapter computes it
  from profile + latest weight and passes it in).
- `P₀` = `diag( 4.0 kg² , 350² kcal² )`, cross-cov `0`. Large `e`-variance
  (`350²`) encodes "the BMR×1.4 prior is rough" → big early gain → fast
  convergence; that same large variance is what makes the **first ~14 days
  read "low confidence"** (§10).

### Warm-up policy — what is emitted before the estimate is usable

- The filter runs and writes `tdee_estimates` from **day 1** (so the series
  is continuous and the chart never has a hole), **but**:
- `estimated_tdee_kcal` is only emitted as a **usable** value (consumed by
  `kcal_mode='tdee_delta'`, see §9) once **`observations_count ≥
  WARMUP_MIN_OBS` (= 10 weigh-in updates)** AND the expenditure std-dev
  `√P₁₁ ≤ WARMUP_MAX_SD` (= 250 kcal). Before that the row is still written
  with the current best estimate **and a `confidence` of `low`** plus
  `is_warmup = true`, so:
  - the UI shows the number with an explicit low-confidence / warming-up
    label (§10), and
  - the `tdee_delta` target path treats a warm-up estimate the same way the
    old model treated "insufficient data" — see §9 for the exact
    backward-compatible contract.

`WARMUP_MIN_OBS = 10` mirrors the *intent* of the old `MIN_INTAKE_DAYS=10`
(need ~10 data points before trusting it) without the rigid window.

### Missing weigh-in day

- Run the **time-update only** (predict `w`, carry `e`, grow `P` by `Q`). No
  measurement update; `observations_count` unchanged. Estimate still emitted
  (slightly less certain — `P` grew). This is the key robustness win over the
  two-endpoint model: interior gaps degrade gracefully instead of being
  discarded.

### Missing intake day

- Treat `intake_k` as **unknown → skip the process *control input* for that
  day**: still predict (`w` carried, `e` carried), grow `P` by `Q`, and if a
  weigh-in exists that day still do the measurement update. We do **not**
  impute intake (imputing would inject fictitious energy balance). Documented
  consequence: an intake gap widens covariance slightly but does not bias
  `e`.

### Long gap (no run for `G` days, e.g. user away / cron outage)

- Process-only propagation for the elapsed days with **`Q` scaled by the gap
  length** (`Q_eff = Q · Δt`), capped at `MAX_GAP_DAYS = 45`: beyond 45 days
  the prior is so diffuse that we **re-initialize** `w` from the next
  weigh-in and inflate `P₁₁` back toward the cold-start value (`e` retained
  as the best prior, but its variance reset to `200²` → effectively a warm
  restart, and `is_warmup` flips back to true until `observations_count`
  re-crosses the gate). Prevents absurd extrapolation after a multi-month
  absence while not throwing away a still-plausible `e`.

All gap arithmetic uses **whole calendar days via UTC-midnight diff**
(`daysBetweenISO`, the same DST-immune helper R-18 introduced) and Madrid
"today" via `todayInTZ()` (D-F4) — consistent with the rest of the crons.

---

## 8. Smoothed-weight input source — filter consumes the **raw** weigh-in;
`body_measurements_smoothed` is **retained but no longer this path's input**

D-B4 critiqued the old model for using *single raw* endpoint weigh-ins
instead of the `body_measurements_smoothed` 5-day average. The adaptive
filter resolves that critique **differently and better**: the Kalman filter
**is** the smoother — its `trend_weight_kg` state is a principled,
noise-model-driven trend (superior to a fixed 5-day box MA, which lags and
has no uncertainty). Feeding the *already-smoothed* view into the filter
would double-smooth (smoothing a smoothed signal) and corrupt the `R` noise
model (the view's points are not independent). **So the filter consumes the
raw `body_measurements.weight_kg`** and produces its own trend.

**`body_measurements_smoothed` is left in place** (the task requires it and
other code may read it — e.g. progress charts). It is simply *no longer the
TDEE path's input*. Documented in `architecture.md` / `features.md`: the
view stays for chart/display use; the adaptive filter maintains its own
superior trend weight and does not consume the view.

---

## 9. Edge function rewrite + reader contract (must stay compatible)

`supabase/functions/recalculate-tdee/index.ts` becomes a **daily
incremental filter step**:

1. Cron cadence **unchanged**: `0 3 * * *` UTC, after the snapshot job (so
   the freshest `daily_nutrition_history` day is present). `computedOn =
   previousDayInTZ()` (Madrid, D-F4) — unchanged.
2. Remove `WINDOW_DAYS`, `MIN_INTAKE_DAYS`, `WEIGHT_TOLERANCE_DAYS`,
   `pickClosest`, the two-endpoint formula, `addDaysISO`.
3. For each profile with ≥1 phase (kept — the "actively tracking" gate; no
   phase ⇒ no TDEE consumer):
   - Load `tdee_state` (or cold-start init per §7).
   - Determine the set of **days to process**: every calendar day from
     `last_updated_on + 1` (or the user's first measurement) through
     `computedOn`, inclusive. Normal steady state = exactly 1 day; catches
     up deterministically after a gap by replaying day-by-day (§7).
   - For each day pull that day's `consumed_kcal` (intake) and that day's
     raw `weight_kg` (measurement, may be absent) and apply the pure filter
     step (§4–§7).
   - Upsert the evolving `tdee_state` row (single row per user).
   - Upsert one `tdee_estimates` row for `computed_on = computedOn` with the
     **existing required columns still populated** for backward
     compatibility (the reader does `select('*')`):
     - `estimated_tdee_kcal` = `round1(e)` — **unchanged column, unchanged
       meaning** (the value `kcal_mode='tdee_delta'` consumes).
     - `avg_kcal_intake` = mean intake over the processed span (kept
       populated; required column).
     - `weight_delta_kg` = `w_now − w_at_state_start` (trend delta;
       required column — now a *trend* delta, strictly better than the old
       raw endpoint delta).
     - `window_days` = number of days folded this run (`Δt`); required
       column — semantics relaxed from "fixed 14" to "days advanced",
       documented.
     - The 4 dead columns (`bmr_kcal / activity_kcal / neat_residual_kcal /
       workout_kcal_logged`) are **left unset** (already always-null today;
       R-08 drops them — see ordering note §3; the rewritten fn writing
       *nothing* to them is exactly what makes R-07 order-free wrt R-08).
   - **New columns on `tdee_estimates`**: this PR adds two nullable output
     columns via the same staged migration —
     `confidence text` (`'low' | 'medium' | 'high'`) and
     `is_warmup boolean default false`. Nullable + defaulted so the migration
     is non-breaking and the reader's `select('*')` keeps working pre- and
     post-apply.

### Reader-contract compatibility (Sprint 17 wiring must keep working)

- `src/features/tdee/api.ts` `fetchLatestTdee` → `select('*')` latest by
  `computed_on`: **unchanged**. It now also receives `confidence` /
  `is_warmup` (additive).
- `src/features/phases/targets.ts` `computePhaseTargets(...,
  estimatedTdeeKcal)`: **signature unchanged**. The consumers
  (`DiarioPage`, `MacrosChart`) keep passing
  `latestTdee.data?.estimated_tdee_kcal ?? null`. **Backward-compatible
  behavior decision:** a warm-up estimate is still a *number*, so
  `tdee_delta` phases will resolve a target from it (the old model returned
  *nothing* during insufficiency → `null` target; the new model always has a
  best estimate). To preserve the *spirit* of "don't show a confidently
  wrong target", we **do not** null it out (that would regress the Sprint-17
  improvement of always having a target); instead the **UI surfaces the
  low-confidence/warm-up state** next to the target (§10). This is the
  deliberate, documented contract change: target availability strictly
  improves (always present once any state exists); trust is communicated via
  the confidence band rather than via a missing value. Until `tdee_state`
  has any row at all (truly first run, no data), `fetchLatestTdee` returns
  `null` exactly as before → `computePhaseTargets` returns `null` exactly as
  before. **No reader code change is required for correctness**; the only
  reader change is *additive* confidence display.

---

## 10. Variance → confidence band (UI signal)

Confidence is derived **purely** from the expenditure standard deviation
`σ_e = √P₁₁` (kcal/day) and the warm-up gate, in the pure module so it is
unit-tested and identical edge/client:

| condition | `confidence` | UI |
|---|---|---|
| `is_warmup` true (obs < 10 or σ_e > 250 during warm-up) | `low` | "Estimate warming up — based on limited data" |
| not warm-up, `σ_e > 120` | `medium` | "Approximate — still settling" |
| not warm-up, `σ_e ≤ 120` | `high` | (no badge / subtle "good confidence") |

Thresholds (`σ_e` 120 / 250 kcal, `WARMUP_MIN_OBS` 10) are named constants
in the pure module, justified inline: 120 kcal ≈ ±0.5 lb/wk of target
ambiguity (tight enough to act on); 250 kcal ≈ the cold-start prior is still
dominating. The mapping function `confidenceFromState(P11, observationsCount)
→ { band, isWarmup }` is pure and deterministic.

**Surface points** (additive, no contract break):

- `DiarioPage` → `DayTotalsCard`: the existing protein-basis note pattern is
  mirrored — a small confidence note/badge under the kcal stat when a
  `tdee_delta` target is shown and confidence ≠ `high`.
- `MacrosChart` (`/progreso`): a low-confidence caption near the target line
  when the active phase is `tdee_delta` and the latest estimate's confidence
  ≠ `high`.
- i18n: new keys in the existing `diario` and `metricas`/`objetivos`
  namespaces, **ES + EN both**.

---

## 11. Pure, testable module

`src/core/tdee.ts` (in the shared runtime-agnostic core — same discipline as
`src/core/dates.ts` / `src/core/liveness.ts`, so edge (Deno, relative
import) and client/Vitest (Node, `@/core/tdee`) run the **identical**
deterministic code; R-17 dual-runtime parity discipline).

Exports (all pure, no clock, no IO — every "today"/date passed in):

- `KCAL_PER_KG = 7700`, `Q_W`, `Q_E`, `R_MEAS`, `WARMUP_MIN_OBS`,
  `WARMUP_MAX_SD`, `SD_MEDIUM`, `SD_HIGH`, `MAX_GAP_DAYS`, init constants —
  all named & commented.
- `initState(w0, e0)` → `TdeeState`.
- `stepDay(state, { intakeKcal | null, weightKg | null, gapDays })` →
  `TdeeState` (one predict [+ optional update]).
- `confidenceFromState(state)` → `{ band: 'low'|'medium'|'high', isWarmup:
  boolean }`.
- `runFilter(initInputs, days[])` → final state + per-day emitted series
  (convenience for replay/catch-up & tests).

`TdeeState` is camelCase (core convention, D-C4/D-F3); the edge adapter maps
to the snake_case `tdee_state` / `tdee_estimates` rows at the DB write
boundary only.

### Deterministic Vitest coverage (`src/core/tdee.test.ts`)

1. **Cold-start**: `initState` covariance, `confidenceFromState` = `low` +
   `isWarmup` for a fresh state.
2. **Convergence on synthetic steady state**: feed N days of constant
   intake = constant true expenditure with zero true weight trend (+ a
   fixed pseudo-noise weigh-in sequence); assert `e` converges to the true
   expenditure within tolerance and `σ_e` shrinks monotonically into the
   `high` band; assert determinism (same inputs → bit-identical state).
3. **Step change in intake**: converged filter, then a sustained intake
   step; assert `e` tracks toward the new implied expenditure within the
   documented horizon and confidence dips then recovers.
4. **Missing weigh-in days**: gaps in the weigh-in sequence → `P` grows on
   those days, `observations_count` unchanged, estimate still emitted, no
   NaN.
5. **Missing intake days**: intake gaps don't bias `e` (mean stays centered
   vs the no-gap run within tolerance).
6. **Long gap**: > `MAX_GAP_DAYS` with no data → warm-restart branch (`P₁₁`
   re-inflated, `isWarmup` true again), no overflow/NaN.
7. **Variance → confidence mapping**: table-driven boundary tests on
   `confidenceFromState` at the exact `σ_e` thresholds and the
   `WARMUP_MIN_OBS` boundary.
8. **Determinism guard**: a fixed scripted multi-day scenario asserted
   against a pinned expected final state (regression pin).

Frozen-clock: the core reads no clock; tests pass all dates/gaps explicitly.

---

## 12. Doc bookkeeping (this PR)

- `docs/roadmap.md` R-07 → `status: in-progress` with the prescribed note.
- `docs/features.md` & `docs/architecture.md` R-07 `⚠ Changing` callouts:
  reworded to "adaptive model implemented; schema + edge deploy pending
  Wave-3" (kept, not removed — not live until Wave-3).
- `docs/decisions.md`: **NOT modified** (D-B4 is authoritative & frozen).
- No other roadmap/decision entries touched.

## 13. Out of scope / explicitly not done

- No migration applied to the live DB; no edge deploy (Wave-3, per the
  autonomy boundary). Live project `upvraruehzurbetzrxov` untouched.
- `body_measurements_smoothed` not dropped (retained for chart/display; just
  no longer the TDEE input — §8).
- No expenditure decomposition (BMR/NEAT/activity split) — D-B5 explicitly
  hands any decomposition to *this* spec and we deliberately keep
  expenditure a single scalar (decomposition is unidentifiable from
  weight+intake alone; YAGNI).
- 7700 not adapted (§6).
