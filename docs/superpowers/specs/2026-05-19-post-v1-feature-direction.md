# Post-V1 Feature Direction — findings & ranked suggestions

> Status: **brainstorm output for review** (2026-05-19). Not a spec, not an
> approved plan. Read this, react, and we'll turn the agreed items into
> individual specs/plans. Nothing here is committed work.

## Your inputs (the lens this is written through)

- **Audience:** friends & family now → possible public launch later. So:
  multi-user correctness matters (it's no longer hypothetical), but don't
  over-build for scale. The existing RLS + shared-library plumbing is already
  the right shape; the gap is the unfinished **R-01 Library Lifecycle Model**
  (see "Prerequisite" below).
- **Training:** flagship next domain — treated as the headline section.
- **Primary lens:** remove friction in *your* daily use **+** surface more /
  more-relevant info.
- **Shape:** full spread, ranked by value vs. effort.

Effort key: **S** ≈ ≤2 focused days · **M** ≈ 3–7 days · **L** ≈ multi-week.
Value is for *your* daily use first, friends-and-family second, future-public
third.

---

## 1. Where this app actually sits competitively

I looked at the apps in this space (MacroFactor, Cronometer, MyFitnessPal,
RP/Carbon Diet Coach, Hevy/Strong/Fitbod, the new AI-photo cohort). The
honest read:

**You are already ahead of the field on the one thing that's hardest to
build.** MacroFactor's entire moat — the reason people pay for it over MFP —
is its *adaptive expenditure algorithm*: it back-calculates true TDEE from
weeks of weight+intake data and re-issues targets weekly, instead of a static
formula that's wrong for half its users. **Hudson's Fitness already has this**
(the R-07 2-state Kalman filter on `[trend_weight, expenditure]` with
per-user `tdee_state`). Cronometer, MFP, RP and Carbon do *not* have a true
adaptive filter of this quality. You built the moat and it's live.

**But you don't cash it in.** Today the adaptive TDEE only feeds
`kcal_mode = 'tdee_delta'` phases *passively* — the number changes silently.
The thing that makes MacroFactor *feel* valuable is the **weekly check-in**:
"your expenditure moved from X to Y, here's your new recommended target, here's
why." You have the engine and no dashboard on it. **This is the single
highest-leverage feature in this whole document** (see §3, item A).

Where competitors genuinely beat you today (table-stakes gaps for
friends-and-family, all addressable):

| Gap | Who has it | Why it matters here |
|---|---|---|
| **Barcode scanning** | Cronometer (free), MFP (paid), everyone | Biggest single daily-logging friction. You have a *disabled placeholder* for it already. Friends will bounce without it. |
| **Workout logging** | Hevy/Strong/Fitbod (whole category) | It's literally "Hudson's *Fitness*" with no training. Your flagship. |
| **Activity/weight sync** | MFP, Lose It!, Fitia (Apple Health / Health Connect) | Removes manual weight entry. But: needs native shell — see §6, honest take. |
| **Recipe import from URL** | MFP, several | You cook from recipes; this is real friction for you specifically. |
| **Insight surfacing** (goal-date ETA, plateau, weekly review) | MacroFactor, trend-weight apps | You already store trend weight + target weight — the ETA is almost free. |
| **AI photo logging** | Cal AI, SnapCalorie, Lifesum | Trendy. **Recommend against** as core — see §5. |

Where you're already differentiated and should *protect* it: the
recipe→ingredient→macro recompute chain, the phase/target model, the
crowdsourced library, and the adaptive TDEE. Don't let feature-chasing dilute
those.

---

## 2. The ranked backlog (full spread)

Sorted by value-per-effort for *your* situation. Detail on the starred ones
follows in §3–§4.

| # | Feature | Effort | Value | Notes |
|---|---|---|---|---|
| A ★ | **Weekly check-in / adaptive-TDEE coaching surface** | M | ★★★★★ | Cashes in the moat you already built. Mostly read-side. |
| B ★ | **Barcode scanner** (finish the placeholder) | S–M | ★★★★★ | Top daily-friction win. OFF barcode API + web `BarcodeDetector`/zxing-wasm. |
| C | **Quick-add: recents / favorites / "copy yesterday"** | S | ★★★★☆ | Pure friction kill on the path you walk every day. |
| D ★ | **Goal-date ETA + plateau / trend insight** | S | ★★★★☆ | Trend weight + target already stored — this is near-free info. |
| E | **Shopping list from the planned week** | S | ★★★★☆ | All data already exists; aggregate plan→ingredients. High weekly value. |
| F ★ | **Training module — MVP** (log workouts + history + e1RM) | L | ★★★★★ | Flagship. Big, but reuses two existing patterns — see §4. |
| G | **R-01 Library Lifecycle Model** | M | ★★★★☆ | *Prerequisite* for friends-and-family correctness. Already decided/specced. |
| H | **Weigh-in reminder + daily-summary push** | M | ★★★☆☆ | Engagement + friction. PWA push (no native needed). |
| I | **Data export ("Download all my data") + "Start fresh" reset** | S | ★★★☆☆ | Trust/GDPR for friends-and-family; cheap. |
| J | **Recipe import from URL** (JSON-LD) | M | ★★★☆☆ | Real for you specifically; messy across sites. |
| K | **BEDCA seed (~100 Spanish staples)** | S | ★★★☆☆ | Improves ES autocomplete OFF covers poorly. One-off seed migration. |
| L | **Body-fat-goal visual reference on /objetivos** | S | ★★☆☆☆ | "More relevant info" + educational. Static, low risk. |
| M | **Dynamic serving rescaling** (scale recipe to N / target kcal) | S | ★★☆☆☆ | Nice quality-of-life in the recipe editor. |
| N | **Micronutrient tracking** (Cronometer-style) | L | ★★☆☆☆ | High effort, data-quality dependent (OFF micros are spotty). Defer. |
| O | **Smart-scale / Health-platform sync** | L | ★★★☆☆ | Value real, but blocked on native shell + per-vendor APIs. See §6. |
| P | **Training v2** (routines, PR detection, rest timer, plate calc) | M–L | ★★★★☆ | Follows F; reuses the planner template↔week pattern. |
| Q | **Auto-progression suggestions** (Fitbod-style) | L | ★★★☆☆ | Tempting; explicitly *later/maybe-never* for a solo dev. |
| — | AI photo logging · native apps · social feed · coach↔client | — | — | **Not recommended now** — see §5. |

---

## 3. The high-leverage info/friction wins (detail)

### A — Weekly check-in / adaptive-TDEE coaching surface ★ (M, ★★★★★)

You have a best-in-class expenditure filter and no window onto it. Build the
window:

- A **/check-in** view (or a card on `/diario`): current estimated
  expenditure, the trend over the last N weeks (the filter already produces
  this), the confidence band you already compute, and — for a
  `tdee_delta` phase — *"expenditure moved 2,520 → 2,450 kcal; suggested new
  target 2,150; accept?"*
- Weekly cadence (you already run daily crons; add a weekly summary that
  composes into the existing `daily-summary`/notification idea — see H).
- This is **mostly read-side**: the numbers exist, the math exists. The work
  is presentation + a recommendation string + an optional "apply suggested
  target to active phase" action.
- Why it's #1: it converts an invisible engineering achievement into the
  feature people actually pay MacroFactor for, it's the "more relevant info"
  you asked for, and it's M-effort because the hard part is already shipped.

### B — Barcode scanner ★ (S–M, ★★★★★)

The Create-Ingredient modal already has a *disabled barcode tab placeholder*.
OpenFoodFacts is keyed by barcode (you already import OFF by `external_id`).

- Web path: `BarcodeDetector` API (Chrome/Android, Edge) with a
  `zxing-wasm` fallback for iOS Safari (no native `BarcodeDetector`), camera
  via `getUserMedia`. No native app required for Android; iOS installed-PWA
  works with the wasm fallback.
- Flow: scan → OFF lookup by barcode → existing import path (the
  `unique (source, external_id)` race-safety is already built).
- Effort is S if Android/`BarcodeDetector` only; M including the iOS wasm
  fallback. Recommend M (you and family are likely mixed iOS/Android).
- This is the difference between "logged my lunch in 4 seconds" and friends
  quietly abandoning the app.

### D — Goal-date ETA + plateau / trend insight ★ (S, ★★★★☆)

You already store `tdee_state.trend_weight_kg` (a clean, filtered trend) and
derive target weight. So:

- **ETA:** linear (or filter-rate) projection of trend weight → target weight
  → "~ 7 Jun at current rate". Recompute on render, never stored (same rule
  as target weight / BMR).
- **Plateau / off-track flag:** trend slope flattened vs. phase intent
  (e.g. a `cut` whose trend slope ≈ 0 over 2–3 weeks) → a gentle banner.
- Pairs naturally with the existing weight chart and with A.
- Near-free because the inputs are already maintained by the Kalman filter.

### C — Quick-add: recents / favorites / copy day (S, ★★★★☆)

The daily logging path is the one you walk most. Cheapest friction kills:

- "Recent" + "Frequent" recipe/ingredient lists in the log entry picker.
- ★ Favorite a recipe.
- "Copy yesterday" / "copy from date" for a meal or whole day (you already
  have the meal_logs shape; this is a templated insert).

### E — Shopping list from the planned week (S, ★★★★☆)

Everything needed is already in the DB (active week → slots → recipes →
`recipe_ingredients` with grams). Aggregate per ingredient across the week,
group by `unit_type`, render a checklist (localStorage check state is fine —
consistent with your "no URL state" convention). High weekly real-world value
for almost no new data model.

### I — Data export + "Start fresh" (S, ★★★☆☆)

For friends-and-family this is a trust feature; for a future public launch
it's GDPR table-stakes. "Download all my data" = a client-side bundle of the
user's own rows (RLS already scopes them) as JSON/CSV. "Start fresh" clears
active phase + active plan + (future) training state **without** touching
history — already sketched in features.md.

---

## 4. Flagship: the Training module (F, then P) — L

This is the headline. It's big, but for a **solo dev the risk is much lower
than it looks**, because training maps almost 1:1 onto two patterns you've
already built and proven:

1. **Shared pool + per-user reference** (ingredients today, R-01 library
   tomorrow) → **exercise library**. Same crowdsource model: system seeds +
   user-contributed, RLS identical.
2. **Template ↔ active-week duality** (meal plans) → **routines ↔ logged
   sessions**. The planner's whole "edit upstream template, materialize a
   working copy, divergence tracking" machinery is conceptually the routine →
   workout-session relationship.

So this isn't a greenfield domain; it's the third instance of two patterns
you've already debugged.

### Proposed MVP cut (F)

Ship the smallest thing that's genuinely useful to *you* in the gym:

- **Exercise library** — table mirroring `ingredients` (shared pool,
  `created_by_user_id`, system seeds for the common barbell/dumbbell/machine
  lifts; trigram search reused).
- **Workout session** — a dated session; **set logs** (exercise_id, set
  index, `reps`, `weight_kg`, `rpe?`, `is_warmup`). Ad-hoc: pick exercise,
  punch in sets. No routine planning yet.
- **Per-exercise history** — last time you did it, every set, with date.
- **Derived progression info** (the "more relevant info" you want):
  estimated 1RM (Epley/Brzycki — *derived, never stored*, exactly like BMR /
  target weight), per-exercise e1RM trend, working-set volume (Σ reps×kg),
  PR detection. All recomputed on render.

### Hard architectural guardrail (write this into decisions before building)

**Training must NOT feed the TDEE filter.** The R-07 adaptive Kalman filter
already absorbs expenditure changes *implicitly* via the weight/intake
residual — that's the whole point of it, and R-08 deliberately
*descaffolded* the old activity/NEAT/workout-kcal split for exactly this
reason. Adding "workout calories" into TDEE would double-count and corrupt
the filter you already got right. Training logging is for **progression
tracking only**. It may *display* alongside body-comp/weight trends; it must
not be a TDEE input. This guardrail is the most important design decision in
the module.

### v2 (P) — after the MVP earns its keep

- **Routines/templates** reusing the planner pattern (named upstream routine
  → instantiated session; divergence ≈ "you went off-program today").
- PR badges, rest timer, plate calculator, supersets, exercise notes.

### v3 (Q) — explicitly maybe-never

Fitbod-style auto-progression / fatigue-aware programming. Genuinely cool,
genuinely a multi-week ML-ish rabbit hole, genuinely not solo-dev-shaped
right now. Park it; revisit only if the module becomes the thing you use most.

### Open design questions for the spec (decide together)

- Bodyweight/assisted exercises and cardio: in MVP or v2?
- Is `rpe` enough, or do you want RIR too (you can derive one from the other)?
- One session per day vs. multiple (AM/PM)? (Mirror the meal-log "one logical
  record per day" stance, or not?)
- Does the exercise library go public-crowdsourced from day one, or
  user-private until a public launch? (Affects R-01 coupling.)

---

## 5. Explicitly NOT recommended now (honest pushback)

You asked for the full spread, so here's what I'd actively steer you *away*
from, with reasons — these are the seductive ones:

- **AI photo / "snap a meal" logging.** It's the loud 2025 trend (Cal AI,
  SnapCalorie, Lifesum). For *this* app it's a bad fit: macro-from-photo is
  notoriously inaccurate, it undermines your precise
  ingredient→recipe→macro chain (your actual differentiator), and it's an
  ongoing vision-model cost + accuracy-complaint liability for a solo dev. A
  far-future *optional* "estimate, then correct" experiment at best. Not now.
- **Native iOS/Android (Capacitor) — for its own sake.** Only worth it if
  Health-platform sync (O) becomes the priority. Barcode (B) and push (H)
  are both achievable as a PWA. Don't take on app-store + two-platform
  maintenance without a forcing function.
- **Social feed / sharing (Hevy-style).** Wrong stage. Friends-and-family is
  not a social network; this is pure scope with near-zero value until (if)
  public, and it complicates RLS.
- **Coach↔client roles.** Real product, totally premature, large RLS/model
  surface. Revisit only if a public launch with a coaching angle is decided.
- **Micronutrient tracking (N).** Not "never" — but it's L-effort and only as
  good as your ingredient micro data, which OFF populates inconsistently and
  your manual entries don't capture at all. Low payoff for friends-and-family
  vs. its cost. Defer behind everything in §3 and §4.

---

## 6. The integration question (O) — straight answer

Smart-scale / Apple Health / Health Connect sync is genuinely high-value
(kills manual weight entry, the most-repeated friction). But be clear-eyed:

- It is a **web PWA**. Browsers cannot read Apple Health or Health Connect
  directly — those require a **native shell** (Capacitor) with the health
  permissions. So "Apple Health sync" implies the native-app decision above.
- The web-reachable path is **cloud-to-cloud**: e.g. Withings has a public
  OAuth Web API (an edge function could pull weigh-ins). **Renpho has no
  public API.** So even cloud-to-cloud is per-vendor and partial.
- Verdict: real value, but it's an **L with a dependency chain** (native
  shell *or* per-vendor cloud APIs + ongoing maintenance). Don't start here.
  If manual weight entry is your single worst daily friction, tell me
  tomorrow and we'll scope the *narrowest* version (likely Withings-only via
  an edge function, no native shell) rather than the whole platform.

---

## 7. Prerequisite call-out: R-01 before opening to friends

R-01 (★ Library Contribution & Lifecycle Model) is the **only substantive
roadmap item left** and it's the one correctness gap that stops being
theoretical the moment a second person logs in: today recipe delete is a
soft-delete and ingredient "delete" semantics aren't the shared-pool model
yet. With friends sharing the ingredient pool, "I deleted an ingredient three
of your recipes use" is a real data-integrity event. It's already
decided and scoped (D-A2/3/4). Recommendation: **land R-01 before or
alongside the first friends-and-family invite**, ahead of most of §3 except
the barcode scanner.

---

## 8. Suggested sequencing (solo-realistic)

A defensible order if we agreed everything (we don't have to):

1. **R-01** (G) — make multi-user safe before friends arrive.
2. **Barcode scanner** (B) — the friction win that decides retention.
3. **Weekly check-in surface** (A) + **Goal-date ETA** (D) — ship the moat;
   they share a screen and reuse existing data.
4. **Quick-add + shopping list** (C, E) — cheap daily-friction batch.
5. **Training MVP** (F) — the flagship, as its own multi-step spec/plan.
6. Opportunistic S-items (I, K, L, M) folded in between as palate cleansers.
7. Training v2 (P), then reassess push (H), export-polish, and *maybe* the
   narrow Withings path (O).

Steps 1–4 are all S/M and individually shippable behind your existing
branch→PR→CI→auto-merge flow. The flagship (5) is the only L and gets its
own brainstorm→spec→plan cycle.

---

## 9. What I need from you tomorrow

1. **Does the sequencing in §8 match your gut?** Especially: R-01 first, or
   barcode first?
2. **Training MVP scope** — sign off on the §4 MVP cut, or pull/push the
   line (cardio? routines in v1?).
3. **The §4 guardrail** — confirm you agree training must never feed TDEE
   (this shapes the data model).
4. **Is manual weight entry your single worst daily friction?** If yes, O
   moves up and we scope the narrow Withings path.
5. **Anything in §5 you disagree with** — if you actually want, say, AI
   photo logging explored, say so and I'll treat it honestly rather than
   dismiss it.

Once you've reacted, the agreed items each become a proper
spec → implementation-plan, one at a time. Nothing gets built off this
document alone.
