# Brainstorm kickoff — Post-V1 app-wide UX (section split, home, onboarding, desktop)

> **For a fresh chat session (cold start):** read this top to bottom, then
> invoke `/brainstorming` and work the items below one at a time. This doc
> is self-contained — you do NOT need any prior conversation history. Output
> goes to a spec per item, then a plan, then implementation (standard
> brainstorming → writing-plans flow).

## What this app is

Hudson's Fitness — bilingual (ES primary / EN) PWA: body composition,
macros, recipes, weekly meal plans, dietary phases, and (in flight) a
Training module. React 18 + Vite + TS SPA → Supabase. Solo dev, public
repo. RLS is the sole security boundary. Read `CLAUDE.md` first for hard
invariants and working preferences.

## Where these ideas came from

On 2026-05-19/20 the user pasted raw notes with 6 themes. Two were
absorbed into the Training MVP and are DONE (spec + plan + pure core on
`develop`):

- **#1 Repeat-last working set** → Training MVP §6 (Hevy-style placeholder).
- **#2 "AI personal trainer"** → Training MVP §7 rule-based coach.
  Decided HARD: **no LLM, ever** — transparent rules over the user's own
  data only. See `docs/superpowers/specs/2026-05-20-training-mvp-design-v2.md`
  §2.2.

The remaining **4 themes are app-wide UX**, each agreed to become its own
spec, sequenced AFTER the Training MVP ships. The Training MVP **has now
shipped** (see updated state below), so these are unblocked. They are this
brainstorm's subject. Original framing + the prior recommendations are
below.

## The 4 items to brainstorm (with prior takes — react, don't treat as settled)

### Item 3 — Split the app into Dieta / Entreno sections (recommended starting point)

**User's note:** "Separate the app into two sections, diet and exercise.
Easier to move around on mobile — you normally use the app for one thing
at a time. Different colors to tell at a glance which section you're in.
Maybe tap the app logo to toggle between training and diet."

**Prior take (for reaction):**
- Strong UX intuition — mobile users mono-task; colour-coded section
  identity lowers cognitive load.
- Pushback on logo-tap as the ONLY switch: undiscoverable. Recommended a
  visible segmented control (Dieta | Entreno) at the top AND logo-tap as
  a power-user shortcut.
- Likely grouping: **Diet** = Diario, Objetivos, Recetas, Planner;
  **Training** = sessions, exercise history, exercise library; **Shared**
  = Progreso, Ajustes (or duplicate Progreso into both).
- This is a nav/visual-system change touching every page → its own spec.
  It's the structural one that frames items 4 and 6, so brainstorm it
  first.

### Item 4 — Richer home page + diet-completion calendar

**User's note:** "The home page should have more info, not just the food —
maybe a summary of the other screens? What could we add? We could put a
calendar with colors saying whether I did well or not on the diet home
screen."

**Prior take (for reaction):**
- Current home is thin for what's behind it.
- Calendar with green/yellow/red days is genuinely good. Data already
  exists (`daily_nutrition_history` × the active phase's targets).
- "Did well" → propose a single quality score per day: kcal-in-range
  **and** protein-met → green; one of the two → yellow; neither → red;
  tap-to-see-why.
- **Overlaps heavily with the post-V1 direction-doc item A** (the
  "weekly check-in / adaptive-TDEE coaching surface" — surfacing the R-07
  Kalman expenditure estimate the app already computes but never shows).
  Recommendation: the home redesign and item A want to be ONE project — a
  real Diet dashboard with the calendar + the adaptive-TDEE check-in + the
  goal-date ETA that already shipped (PR #47, on `develop`).

### Item 5 — In-app onboarding

**User's note:** "It'd be good to create an onboarding for the app,
walking the user through it and explaining the features."

**Prior take (for reaction):**
- `src/pages/OnboardingPage.tsx` already exists — it's the profile/goals
  setup. So the real gap is *feature discovery*, not initial setup.
- Trap to avoid: 8-screen wizards you skip in week two and maintain
  forever.
- Recommended minimum: contextual empty states with explanation + CTA
  ("You haven't logged any meals yet — tap here"), plus one short welcome
  modal explaining the section split IF item 3 ships. Skip the
  multi-screen tour.
- Timed to the friends-and-family invite, not before. Possibly bundled
  with item 3 (shares UX surface).

### Item 6 — Responsive desktop layout

**User's note:** "In the future we'll have to modify how it looks
graphically and adapt the info for PC vs mobile — some things look fine on
mobile (like the macro counters on the home screen) but look too poor and
spread out on PC."

**Prior take (for reaction):**
- Correct diagnosis. Macro counters look fine narrow, stranded wide.
- WRONG fix: "same components, wider breakpoints" (looks emptier).
- RIGHT fix: per-feature density modes — at desktop width, components opt
  into showing more data inline (e.g. the macro card also renders the
  day's TDEE breakdown next to the gauge, which on mobile is
  tap-to-expand).
- Defer: mobile-first is fine through friends-and-family. This is
  public-launch-prep work. Its own spec, brainstormed last (or when
  public launch is actually on the table).

## Sequencing recommendation (for reaction)

1. **Item 3 (section split)** — structural, frames the others. Brainstorm
   first; it decides where the Training routes live and whether items 4/5
   inherit a two-section shell.
2. **Item 4 (home redesign + adaptive-TDEE surface)** — highest daily
   value; merge with direction-doc item A.
3. **Item 5 (onboarding)** — bundle with or follow item 3.
4. **Item 6 (desktop layout)** — defer to public-launch prep.

Each is independent enough to spec + ship on its own. Don't try to do all
four as one mega-spec — that's how nothing ships.

## State of the codebase you're starting from (all on `develop` — UPDATED 2026-05-21)

> This section was corrected on 2026-05-21 after a burst of parallel work
> landed. Verify against the live tree before relying on it — the repo is
> moving fast.

- **Training MVP (R-19): SHIPPED & MERGED.** The full feature is on
  `develop`: `src/features/training/**` (api, hooks, schema, components —
  SessionEditor, SessionList, ExerciseBlock, ExercisePicker,
  ExerciseDialog, ExerciseHistory, SetRow, CoachSuggestions), pages
  (`EntrenamientoPage`, `SessionEditorPage`, …), the
  `entrenamiento`/`coach` i18n namespaces, the staged training migrations
  (`supabase/migrations/20260522120000_training_*`), and the pure core
  `src/core/training.ts` (5 coach rules incl. Rule 1b). Spec + plan still
  at `…/specs/2026-05-20-training-mvp-design-v2.md` +
  `…/plans/2026-05-20-training-mvp-plan.md`.
- **R-01 (★ Library Lifecycle Model): Phase 1 DONE & MERGED** (PR #71,
  2026-05-20), incl. a 9th migration adding RLS on the backfill backup
  table. The exercises pool follows this model.
- **Also shipped in the same window:** Barcode scanning (R-20) and
  OpenFoodFacts contribute-back (R-21). A `release/2026-05-21` PR (#80)
  bundles R-19 + R-20 + R-21 toward `main`.
- **Rule-catalogue brainstorm** (separate, training-internal):
  `docs/superpowers/brainstorms/2026-05-21-training-rule-catalogue.md`.
  Different subject from this doc — that one expands the coach rules; this
  one is app-wide UX.
- **Post-V1 direction doc** (the competitive analysis + ranked backlog,
  incl. "item A"): lives on the unmerged draft PR #49, NOT on `develop`.
  The relevant bits for item 4 are summarised above so you don't need it.

**Implication for item 3 (section split):** the Training routes
(`/entrenamiento*`) and nav link already exist in today's single-section
nav. The section split is now a *refactor of live nav*, not a
forward-looking design — account for the real routes in
`src/router.tsx` and the real nav component when brainstorming where the
Dieta/Entreno boundary falls.

## Working preferences (from CLAUDE.md — honor these)

- Greenlit work proceeds autonomously; design decisions check in first.
- While a design is still exploratory, discuss in prose with honest
  pushback — do NOT force multiple-choice prompts. Reserve structured
  option-questions for converged decisions.
- On any pick-one question: lead with the recommended option + a one-line
  reason; "(Recommended)" label on it. If options are genuinely
  equivalent, say so.
- No AI/Claude attribution in commits or PR titles/bodies (public repo;
  plain conventional commits).
- Don't paste diffs into chat — state what changed and why.
- Don't spawn subagents unless explicitly asked (kept deliberately — it's
  the expensive path; inline is the right default for this project).
- Metric-only. DB is canonical; RLS is the sole boundary. Bilingual ES+EN,
  both complete (no English-only fallback strings).

## How to start

Recommended opener for the brainstorm: *"Let's brainstorm item 3 (the
Dieta/Entreno section split). Here's my reaction to the prior take: …"* —
or pick a different item if the user's priorities have shifted. Invoke
`/brainstorming`, go one item at a time, land each as its own spec.
