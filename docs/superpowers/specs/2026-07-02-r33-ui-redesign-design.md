# R-33 — UI Redesign: design system + nutrition screens — Design Spec

- **Date:** 2026-07-02
- **Roadmap:** R-33 (this spec replaces the placeholder scope). Spawns R-34 (gym
  screens) and the layer-3 feature items enumerated in §9.
- **Source material:** the external Claude-design canvas at
  `D:/dev/claude-design-hudson-fitness` (referred to below as *the canvas*):
  `tokens.css`, ~50 JSX artboards (nutrition web + mobile, gym mobile + partial
  web), and the prose docs *Convenciones de diseño — Móvil*, *Auditoría Visual*,
  *Macros — Puntos aplicados*, *Color de fases — Plantillas*, *Planificador —
  Especificación*. The canvas stays outside the repo; this spec is the bridge.

## 0. Summary

Apply the converged external redesign to the app in two layers: a
**foundation retheme** (new oklch token system, Tailwind v4, Rubik typography,
restyled shadcn primitives — app-wide, gym included) and **redesigned nutrition
screens** (new shell/navigation, the phase-aware semantic tone system, and a
per-feature restyle wave for every nutrition screen, web + mobile). Net-new
features that appear in the artboards are **out of scope** and become their own
roadmap items (§9). Gym *screens* are deferred to R-34 until their design
converges.

## 1. Source-material authority order

The canvas contains stale prose and unresolved explorations. When sources
disagree, precedence is:

1. **`tokens.css`** — the live token source of truth (both canvas and app).
2. **Mobile artboards** — the most developed set; canonical for patterns,
   semantics, information hierarchy, and interaction tiering.
3. **Web artboards** — canonical only for desktop *layout* (columns, right
   rails, V2 shell). Where web lacks something mobile has, the mobile pattern
   is adapted to the established web conventions during implementation —
   translation only, no new design. Genuinely ambiguous cases go back to the
   user instead of being improvised.
4. **Prose docs** — rules and rationale, except where stale. Known stale spots:
   *Convenciones* §01 says "Gimnasio = rojo" (superseded — `--gym` is blue
   `#007cfb`; the Auditoría ranks the blue switch as decision #1 "Decidido");
   *Convenciones* §02 says Geist (superseded — Rubik confirmed, see §3.4);
   the gym web artboard headers say "acento rojo" (they render blue).

Resolved canvas explorations (decisions confirmed in this brainstorm):

| Exploration | Resolution |
|---|---|
| Diario macro panel V1 tinted / V2 white / V3 divergence bar | **V2 white** (what `DiarioWebV2` uses) |
| Planner "Añadir receta" drawer V1 library / V2 fit-scored suggestions | **V1** (V2's macro-fit scoring is new logic → layer 3, §9) |
| Recipe peek from plan cell: popover / drawer / docked drawer | **Docked drawer** (what the canvas wires) |
| Objetivos phase list A / B | **B** (collapsible history bar, wired in canvas) |
| "Guardar como plantilla" V1/V2/V3 | **V1** (only V1 survives in the file) |
| MealLogEntry per-meal glyph anchor | **Not in R-33** (Auditoría defers it "a futuro"; glyph set never agreed) |
| Phase palette Actual/A/B/C | **B** (already baked into `tokens.css` `--phase-*`) |
| Fonts Rubik vs Geist | **Rubik** + Geist Mono (Auditoría "Definitiva"; see §3.4) |

## 2. Scope

### In scope

- **Foundation (app-wide, gym included):** Tailwind v4 migration; the
  `tokens.css` system as the app's token source; Rubik + Geist Mono; restyled
  shadcn primitives; sweep of hardcoded palette classes; `--entreno`→blue
  (renamed `--gym`); muscle-heatmap ramp gray→amber→red → light→blue.
- **Shell & navigation:** two differentiated section apps ("dos apps en una"),
  new mobile top bars + two bottom navs + section-switch icon-button + "Más"
  hub; new web sidebar + PageHeaderV2 + 1280px content cap.
- **Semantic tone core:** `src/core/nutritionTone.ts` (the only new logic in
  R-33) + its consumers.
- **Nutrition screen waves:** Diario, Planificador, Plantillas, Recetas,
  Ingredientes, Progreso, Objetivos, Ajustes/Más — web + mobile responsive,
  restyle of existing functionality only.

### Out of scope

- **Gym screens** (layouts/flows) → **R-34**, blocked on closing the gym design
  (program builder, manual session editor, most of web, exercise-filter
  exploration V1/V2/V3 unresolved). The foundation retheme *does* reach gym.
- **Net-new features drawn in the artboards** → §9. Each screen wave must
  *strip* those elements when porting an artboard (per-wave strip-lists in §6).
- **Dark-mode artboard validation:** `tokens.css` dark values ship as-is under
  the existing `.dark` class; visual fixes happen opportunistically per wave
  (no dark artboards exist to validate against).
- **Auth/onboarding redesign:** `/login`, `/signup`, `/onboarding` have no
  artboards. They inherit the foundation (tokens/fonts via the sweep) but keep
  their current layouts.

### Standing rule for the whole effort

Prefer the standard mechanism — Tailwind utility, shadcn/ui component, CVA
variant — over bespoke CSS or hand-rolled components. The canvas's hand-rolled
primitives (`.surface`, `.btn`, `.chip`…) are *specifications* for restyling
the shadcn equivalents, not code to vendor. Canvas `icons.jsx` is not ported;
the app uses `lucide-react` directly (same drawings).

## 3. Foundation

### 3.1 Tailwind v4 migration (PR-1, zero visual change)

- `tailwindcss` 3.4 → 4.x with `@tailwindcss/vite` (Vite 6.4 is compatible);
  run `npx @tailwindcss/upgrade`, translate `tailwind.config.js` to CSS-first
  (`@theme` in `src/index.css`), replace `tailwindcss-animate` with its TW4
  successor (`tw-animate-css`), keep the *current* HSL values so PR-1 is
  visually inert. shadcn officially supports TW4; adjust the 14 vendored
  primitives per its migration notes.
- Oracle of equivalence: full CI (lint + build + test) plus a manual visual
  spot-check of one screen per section (light + dark).

### 3.2 Token architecture (PR-2)

Two layers in `src/index.css`:

1. **Design tokens** — `tokens.css` ported near-verbatim into `@theme`
   (light) and `.dark` (the canvas `.theme-dark` values): warm neutrals
   (`--bg`, `--bg-elev`, `--bg-sunken`, `--line`, `--line-strong`, `--text*`),
   section accents `--nutri`/`--gym` each with `-soft/-ink/-line`, `--danger*`,
   `--amber*`, phases `--phase-cut/bulk/maint` (+variants), macro dots
   `--macro-p/c/g/fib`, radii `--r-xs…--r-pill`, shadows. `tokens.css` remains
   the shared source of truth with the canvas; future design iterations diff
   against it.
2. **shadcn role tokens defined from design tokens** — `--background := --bg`,
   `--card`/`--popover` := `--bg-elev`, `--muted` := `--bg-sunken`,
   `--border` := `--line`, `--destructive` := `--danger`,
   `--primary := --accent`, etc., so all shadcn primitives and any future
   `shadcn add` land on-palette with zero component-specific code.

**Section accent mechanism:** `.section-nutri` / `.section-gym` classes set
`--accent`, `--accent-soft`, `--accent-ink`, `--accent-line`; utilities are
wired through `@theme inline` so `bg-accent`, `text-accent-ink`, `bg-primary`
etc. resolve per-subtree. `AppLayout` applies the section class from the
route (existing `sectionOf()` mechanism). Because `--primary` follows
`--accent`, every primary button and active state is section-aware for free.

**Naming:** the design names are canonical. Rename `--nutricion`/`--entreno`
and the TS `Section` type values (`'nutricion' | 'entreno'` →
`'nutri' | 'gym'`) across `nav-config.ts`, `useActiveSection`, the shell
components and their tests — one mechanical sweep, done in PR-2.

**Dark mode mechanism unchanged (D-F6):** ThemeProvider + the `index.html`
pre-paint IIFE stay byte-identical (storage key `hf-theme`, class `.dark` on
`<html>`); only token *values* change. If a section class must reach a
pre-paint state later, both sides extend in lockstep — not expected in R-33
(section class lives on the in-app layout, painted post-boot).

### 3.3 Primitive restyle (PR-2)

Restyle the vendored shadcn primitives to the *Convenciones* anatomies, via
CVA variants and tokens (no bespoke CSS):

- **Button** — 4 emphasis levels (primary = accent fill; secondary =
  `--bg-elev` + `--line-strong` border; soft = `--bg-sunken`, borderless;
  ghost), pill radius, one-dominant-action-per-view rule; wide 44–48px footer
  confirm variant; 36×36 icon-button variant.
- **Badge/Chip** — pill shape for three jobs (filter chip 24–26px, status
  badge 18–20px, origin badge; O.F.F. keeps amber; manual/base neutral).
- **Card** — `.surface` spec (bg-elev, `--line` border, `--r-md`,
  `--shadow-card`); soft variant; list-card anatomy (header + 1px-separated
  rows, right-aligned tabular metrics).
- **Dialog/Drawer** — `--shadow-hi` reserved for overlays; mobile bottom
  sheets (vaul drawer): 22px top radius + grabber; keep the existing
  Dialog-on-desktop / Drawer-on-mobile switch (B2b convention).
- **Typography utilities** — type scale per *Convenciones* §02 (22/600 →
  9.5/500 CAPS labels), `tnum` tabular numerals on all figures, tracking
  rules. Text ≥9px, hit targets ≥36px.

### 3.4 Typography & PWA identity (PR-2)

- **Rubik** (variable) for everything; **Geist Mono** for codes/technical
  badges and mono figures. Self-hosted via `@fontsource` packages (exact
  package names at impl time) — no CDN (PWA); preload the main woff2;
  `font-display: swap`; font tokens in `@theme` (`--font-sans`, `--font-mono`).
- Update `index.html` `theme-color` (currently `#16a34a`) and favicon to the
  new green; keep `<body>` classes in sync with surviving token names.

### 3.5 Hardcoded-color sweep (PR-2)

~97 hardcoded Tailwind palette classes across ~16 files (MacroBar,
DayTotalsCard, QuickAddStrip, toast/badge variants, runner state colours,
PhaseDialog, onboarding, settings…) plus 3 hex literals in the muscle heatmap
(`muscleColor.ts`, `MuscleBody.tsx`) move onto tokens:

- Macro identity → `--macro-*` dots (dot before label; label/number neutral;
  bars never take dot colours — quantity bars use the section accent; only the
  caloric-distribution stacked bar keeps macro colours).
- Phase colours → `--phase-*`.
- Warnings → `--amber`; destructive → `--danger`.
- Runner performance colours → tokens added next to the design set (green
  beat / amber short, per the Auditoría convention) so R-34 inherits them.
- Muscle heatmap ramp → light `#eef1f5` → `--gym` blue (Auditoría decision
  #2); implemented as a token-driven ramp in `muscleColor.ts`.

After PR-2 the whole app — gym included — wears the new system on its old
layouts. Old-layout screens looking "plain but coherent" is the accepted
intermediate state.

## 4. Shell & navigation

Two differentiated section apps (the "dos apps en una" model), replacing the
canvas's unified 5-tab bar. This diverges deliberately from the mobile
artboards' chrome (a shared component; every artboard's *content* stays
valid). Rationale: full per-section bars resolve slot scarcity (both
Planificador and Recetas fit), perfect accent discipline (no mixed-accent bar),
and it is the owner's preferred mental model. The unified bar's virtue
(cross-section visibility) is recovered via the switch affordance below.

### 4.1 Mobile

- **Root screens** (bar destinations) use the design's **MobileTopBar**:
  title 22/600 + subtitle, right cluster of 36×36 icon-buttons. The **section
  switch** is an icon-button in that cluster on *every root screen*: dumbbell
  (gym blue) while in nutrition → navigates to `/training`; leaf/apple (nutri
  green) while in gym → navigates to `/diary`. Sub-screens use the
  **BackHeader** (back + title + right primary action) and carry no switch.
- **Bottom navs** (19px icons, 9.5px labels, active = section accent):
  - Nutrition: `Diario · Planificador · Recetas · Progreso · Más`
  - Gym: `Hoy · Rutinas · Ejercicios · Progreso`
- **"Más" hub** — new route `/more` (mobile entry; reachable but unlisted on
  desktop): profile + active-phase header (pattern of the web sidebar footer),
  then card-rows → Ingredientes, Plantillas, Objetivos, Ajustes. Adapted from
  the mobile kit (no artboard exists — accepted adaptation).
- The dedicated sticky h-14 mobile header, `SectionSwitcher` and `AvatarMenu`
  are removed (their functions move into MobileTopBar and `/more`).
- **Shared routes** (`/progress`, `/settings`, `/more`): keep the existing
  `sectionOf`/`useActiveSection` mechanism for deciding which bar renders
  (verify exact current behaviour at impl time and preserve it); their accent
  defaults to nutri.

### 4.2 Web (md+)

- **Sidebar** per the canvas shell: collapsible 232↔60px persisted to
  localStorage (`hf-sidebar-collapsed`), tooltips when collapsed, groups
  **Nutrición / Entrenamiento / Análisis**, active item = accent-soft bg +
  3px accent bar, footer with profile + active phase. No switch needed —
  both sections are visible.
- **Page frame:** `PageHeaderV2` (56px, full-bleed, border-bottom, actions
  right) + body content centred and capped at `--content-max: 1280px`
  (the V2 convention; V2 artboards are the official ones).

## 5. Semantic tone core — `src/core/nutritionTone.ts`

The only new *logic* in R-33, ported from the canvas `planificador-tone.jsx` /
*Planificador — Especificación* (a living spec that enumerates every edge
case — those examples become the Tier-1 golden vectors).

- **Palettes:** `TONE` (good/onTarget green, slightOver/low amber, over red)
  and `EXCESS` (neutral/warn/bad bar-segment colours), exposed as tokens.
- **`getKcalStatus(consumed, target, phaseType)`** — cut: >+5% over, >+1.5%
  slightOver, at/below good; bulk mirrored (<−5% low, <−1.5% slightOver);
  maintenance ±3% band onTarget, above slightOver, below low.
- **`getMacroStatus(macro, value, target, phaseType, opts)`** — protein ≥−3%
  good / ≥−10% slightOver / worse over-red; fiber good from 90% of target,
  overshoot never penalised; fat below the essential floor always bad (framed
  chip + floor tick on the bar) and >+10% over target warns only in cut;
  carbs warn only in cut above +8%.
- **Bar renormalisation:** when over target the bar renormalises to consumed,
  painting the excess segment in the `EXCESS` tone.
- **Fat essential floor:** the canvas never defines where `fatFloor` comes
  from. Decision: a named constant in the core, in g per kg bodyweight
  (≈0.6 g/kg — essential-intake convention), derived at render, never stored
  (hard invariant 5 pattern). Record as a D-id in `decisions.md` at impl time;
  refineable later without schema impact.
- **Consumers:** Planner day headers (V4 anatomy: 3px status stripe,
  day+delta, kcal base/excess bar, 2×2 macro chips `MacroChipV4`), Diario
  macro tiles (V2 white variant, captions "te faltan X g" / "+X g sobre el
  objetivo"), and the Diario weekly kcal chart — fixing the artboard's own
  embedded TODO ("over=amber" is only correct in cut; must take the active
  phase's target and reuse `getKcalStatus`).
- **Placement rules that ride with it:** "today" in the planner = neutral
  grey 1.5px column outline, never a colour; planner meal-cell footers keep
  neutral grey P/C/G letters (no dots — the *Puntos aplicados* "dots
  everywhere" rule yields to the Planner spec in dense cells); the Diario
  "Macros del día" adherence cards carry no dots (background already encodes
  state — *Convenciones* §07 exception).
- **Tests:** deterministic Tier-1 suite with golden vectors per phase ×
  metric × state, including the renormalisation and floor-tick cases.

## 6. Nutrition screen waves

Order (one worktree + PR each; mobile artboard = base layout, web artboard =
md+ layout):

0. **Shell & nav** (§4) — includes `/more`, removal of SectionSwitcher/
   AvatarMenu, updated shell tests.
1. **Tone core** (§5) — pure module + tests; may ride with the Diario wave if
   small enough.
2. **Diario** — MobileKcalCard with double-arc ring (registrado solid +
   planificado faint 0.28; kcal-status coloured), macro tiles with tone
   semantics + progressive disclosure, meal cards with "Plan" badges,
   quick-add strip restyle, add-flow ("Añadir a hoy" sheet/drawer: meal-slot
   selector, Recientes/Recetas/Alimentos tabs, live balance footer with fixed
   target line + striped overflow + amber over-state), full-screen quick
   search (navigates only — logging goes through the add sheet), weekly kcal
   chart (phase-aware via tone core), web right rail (kcal hero, 2×2 tiles,
   week chart, Cuerpo quick-measure card opening the measurement overlay).
   *Verify at impl:* the double arc needs planned-vs-consumed day totals — the
   snapshot edge fn already computes planned and consumed, so the
   distinction exists; confirm the client query can surface it. Fallback if
   not cheaply available: single arc + planned footnote (adaptation policy).
   *Strip-list:* notifications bell, "quema +340" burn readout.
3. **Planificador** — V2 mobile (week strip aligned with 7-day kcal bars vs
   dashed target, enriched today list, per-meal copy), web weekly grid with
   V4 day headers + meal cells (recipe bullets, copy button, inline añadir,
   kcal/P/C/G footer, dashed empty state), copy-meal popover (restyle of the
   existing U-6 feature: 7-day multiselect, replace/append), "Añadir receta"
   drawer V1 with live day-balance footer, recipe peek as docked drawer.
   *Strip-list:* "Lista de la compra" button (R-35), fit-scored suggestions
   (V2 drawer), meal times (08:00…) unless the schema already carries them
   (verify; do not add columns), "comida libre" cells (verify whether free
   entries exist today; if not → layer 3).
4. **Plantillas** — library grid with phase-tinted cards + 7×4 dot minigrid,
   template view/editor (mobile: 7-day selector strip instead of the web 7×4
   grid), "Guardar como plantilla" V1 modal, apply-confirm with WeekStrip
   (partial-week fill semantics already exist — restyle only).
5. **Recetas** — list grid (filter chips, cutout-style cards — recreate the
   canvas-HTML-only cutout styles with standard utilities; pagination reusing
   the existing PaginationBar), read view, editor (meta card, ingredients
   table with per-ración/total chips + inline search footer, live macros card
   with distribution bar, existing single `instructions` field styled per the
   layout — structured steps are R-36). *Strip-list:* favorites star, prep
   time, structured/reorderable steps, step photos, private-notes card if no
   field exists (verify — likely strip).
6. **Ingredientes** — list (search + scan banner, macro triads, source
   badges base/manual/O.F.F. — map from the existing `source` values),
   3-method create (manual / OFF search / barcode with the full-screen
   viewfinder restyle of the existing scanner), editor with auto-kcal +
   sub-macros (exist since U-1), live preview card. *Strip-list:* "verificada"
   badge + verify toggle (no `is_verified` on ingredients — R-43).
7. **Progreso** — ProgresoP0 composition (the "elegida"): measurement hero
   (MA5 smoothed weight, composition stats, last-measurement), weight +
   composition charts with the design's segmented time filter (map current
   30d/90d/1y/all presets to the design labels; D-D4 local-state rule stays),
   expanded-chart sheets, month-grouped measurement history, measurement
   sheet (manual entry; restyle). *Strip-list:* ETA banner + energy-balance
   card (R-38), custom date-range picker (R-38), scale-sync source toggle,
   photo attach, streak chip (R-39).
8. **Objetivos** — phase hero card + option-B collapsible history, phase
   editor as a full page (currently PhaseDialog modal → becomes the
   editor-page pattern of the artboards; same fields/validation, R-02
   notesOnly + R-05 prefill + R-06 conversions preserved), live phase-tinted
   preview. *Strip-list:* TDEE calculator link/modal (R-37), default-template
   picker (R-42).
9. **Ajustes + Más** — settings restyle (the artboard mirrors the real
   SettingsPage), `/more` hub. *Strip-list:* "Fotos de los pasos" setting
   (rides with R-36).

Every wave: all new strings in ES **and** EN (artboards are ES-only);
`pnpm lint + build + test` green; existing Tier-2 tests updated alongside
(shell tests change in wave 0); visual verification per §7.

## 7. Verification

- **CI gate** unchanged: lint + build + test (Tier-1/2 + Tier-3 db-test)
  required on develop. No schema/RLS/RPC changes anywhere in R-33 ⇒ Tier-3
  should stay green untouched.
- **Tone core:** Tier-1 golden vectors from the canvas living spec.
- **Visual pass per wave:** run the app (agent-browser e2e harness + seeded
  QA user) and screenshot the touched screens at mobile (390px) and desktop
  widths, light + dark, comparing against the artboards; fix drift before
  merge.
- **R-32 standing rule** applies if any wave alters a PostgREST `.select()`
  string (not expected — restyles keep data hooks intact; flag any exception
  in the PR).
- **PR-1 (TW4)** equivalence: full suite + build + spot-check as §3.1.

## 8. Ship flow, docs, releases

- Standard flow: ephemeral worktree per wave, `claude/*` branch, squash
  auto-merge on green CI. ~12 PRs total (2 foundation + shell + tone core +
  8 screen waves).
- Suggested releases to `main`: one after foundation + shell (validate tokens/
  fonts/nav on real devices early), one when the nutrition waves complete.
  Cadence is the user's call at execution time.
- **Docs:** mark `docs/architecture.md` (§Theme model, shell) and
  `docs/conventions.md` (§UI, §Theme) with `> ⚠ Changing — see R-33` in
  wave 0; full reconcile at the release doc-audit per operations.md. New
  D-ids at impl time: TW4+token architecture, navigation IA (two apps +
  switch), Rubik, tone system + fat floor, heatmap ramp.
- `docs/roadmap.md`: rewrite the R-33 entry to this scope; add R-34 and the
  §9 items (same PR as this spec or wave 0).

## 9. Spawned roadmap items (not R-33)

Features drawn in the canvas but new to the app. Numbering final in
roadmap.md; priority decided after R-33.

- **R-34 — Gym screens redesign.** Apply the gym artboards (22 mobile) once
  the design closes its holes: program builder, manual session editor/history
  detail, web screens beyond the 3 artboards, exercise-filter exploration
  (V1/V2/V3), runner intermediate states (resume/skip/overview). Includes the
  Auditoría-approved Hoy hero card, numbered workout editor, runner
  enhancements (fullscreen rest timer, finish modal, summary), plus the
  artboard extras (tonnage, streaks, free session, %1RM prescriptions,
  session share) to triage at spec time.
- **R-35 — Shopping list** from the planned week (consolidated/per-recipe
  views, check-off, share, extra items). Flat list until ingredient
  categories exist.
- **R-36 — Recipe steps & photos** (schema: structured steps, per-step
  photos, favorites, prep time, private notes) + "Fotos de los pasos"
  setting + photo storage decisions.
- **R-37 — Interactive TDEE calculator** (Mifflin-St Jeor + Katch-McArdle,
  activity multipliers) linked from the phase editor.
- **R-38 — Progress analytics extras:** nutrition adherence heatmap
  calendar, ETA banner + projection (eta.ts/trend.ts data largely exists),
  energy-balance visual, custom date-range filter.
- **R-39 — Measurement extras:** progress photo attach, measurement streak,
  smart-scale source toggle (post-V1 scale integration).
- **R-40 — cmd-K command palette** (navigate-only per the canvas decision).
- **R-41 — Planner recipe suggestions by macro fit** (add-drawer V2,
  FitRing).
- **R-42 — Per-phase default template** (auto-apply when planning weeks of
  that phase).
- **R-43 — Small verifications & leftovers:** ingredient `is_verified` +
  verify flow, "comida libre" free entries, per-meal times, notifications
  bell (ties to existing notifications backlog), MealLogEntry glyph set.

## 10. Success criteria

1. The whole app (gym included) renders on the new token system — no
   hardcoded palette classes or hex outside tokens (enforceable by grep).
2. Rubik/Geist Mono self-hosted; Lighthouse/PWA installability unaffected;
   no CDN font requests.
3. Nutrition screens match their artboards (mobile base + web md+) minus the
   documented strip-lists; verified by the per-wave visual pass.
4. Navigation: two section bars + root-screen switch + `/more` hub work on
   mobile; collapsible grouped sidebar on desktop; all existing routes still
   reachable.
5. Tone core fully unit-tested; planner/diario semantics phase-aware
   (including the weekly-chart TODO fix).
6. CI green throughout; no schema changes; bilingual strings for everything
   new; docs marked divergent and reconciled at release.
