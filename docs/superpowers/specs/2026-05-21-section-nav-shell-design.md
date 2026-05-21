# Spec — App shell & section navigation (Nutrición / Entreno)

> **Item 3** of the post-V1 app-wide brainstorm
> (`docs/superpowers/brainstorms/2026-05-21-post-v1-app-wide.md`). This is the
> structural one that frames items 4 (home dashboard), 5 (onboarding) and 6
> (desktop density). Brainstormed 2026-05-21.

## Problem

The app today has **one flat navigation**: a single horizontally-scrolling top
bar (`src/components/layout/AppLayout.tsx`) holding nine peers — Diario,
Planificador, Plantillas, Recetas, Ingredientes, Entrenamiento, Progreso,
Objetivos, Ajustes — under one `AppLayout` in `src/app/router.tsx`. On a phone
that bar is the worst ergonomic case: top-of-screen, thumb-unreachable, with
items hidden off the right edge. As the Training module grows (R-19 shipped its
first page), the flat bar gets worse.

The app is really **two activities** — nutrition and training — that a user
engages with one at a time on mobile, plus a few cross-cutting screens. The fix
is to give the app a **section-aware shell** that adapts to viewport: focused
per-section navigation on phones, an everything-visible sidebar on desktop.

## Goals

- A responsive app shell: **bottom nav on mobile, sidebar on desktop**, keyed off
  **viewport width** (not device/UA sniffing).
- Two sections — **Nutrición** (green) and **Entreno** (red) — with shared screens
  in a neutral group.
- Restructure the nav so each section holds only a few, relevant destinations;
  demote Templates, Ingredients, and Goals from top-level nav into their parent
  screens.
- Normalize routes to **English slugs** (labels stay bilingual, ES-primary).
- Establish a section **colour identity** that works in light and dark mode.
- Settle the home model: a **unified Home dashboard on desktop only**.

## Non-goals / explicitly deferred

This spec ships the **shell, the nav restructure, the routing, and the section
identity** — and nothing behind the new doors that doesn't already exist:

- **Home dashboard *content*** (the cross-section overview, diet-completion
  calendar, adaptive-TDEE surface) → **item 4**. This spec ships `/home` as a
  thin placeholder.
- **Entreno's future pages** — `Rutina` (rotation builder) and `Ejercicios`
  (MuscleWiki-style body-map discovery + favourites) → their own later specs.
  Their nav entries ship now but route to a shared **"En progreso"** placeholder
  page until the real pages land (see "Entreno today" below).
- **Desktop density / per-feature wide layouts** → **item 6**.
- **Onboarding / feature discovery** → **item 5**.

No schema, RLS, or RPC changes — this is a **frontend-only** change. Hard
invariants 1, 2, 3, 5, 6 are untouched; invariant 7 is honoured because the
deferred Entreno pages are surfaced as an explicit, clearly-labelled
"En progreso" placeholder — not a fake of un-built functionality.

## The model

| | Nutrición (green) | Entreno (red) | Shared (ink) |
|---|---|---|---|
| **Day page** | Diario | Hoy | — |
| **Plan** | Planificador | Rutina *(→ En progreso page)* | — |
| **Library** | Recetas (+ Ingredientes inside) | Ejercicios *(→ En progreso page)* | — |
| **Cross-cutting** | — | — | Home *(desktop)*, Progreso (+ Objetivos inside), Ajustes *(avatar menu)* |

**Two shells, one nav config.** A single `navConfig` data structure is the
source of truth (sections, items, route, i18n label key, icon, `built` flag).
Both shells render from it.

### Desktop (≥ `md`, 768px) — grouped sidebar

shadcn **sidebar** (Base UI track — `ui.shadcn.com/docs/components/base/sidebar`).
Order top-to-bottom: **Home → Progreso** (shared, no group label) → **Nutrición**
group (Diario, Planificador, Recetas) → **Entreno** group (Hoy, Rutina,
Ejercicios — the last two route to the En progreso page for now). Active
item shows a left accent bar tinted to its area (ink for shared, green for
Nutrición, red for Entreno). Footer = avatar → menu (Ajustes, Salir). Collapses
to an icon rail (reclaims width for item 6). **No section switching** — desktop
shows everything.

### Mobile (< `md`) — bottom nav + section switcher

- **Bottom nav**: the active section's tabs (≤4), thumb-reachable, with Progreso
  as a shared tab in each section.
  - Nutrición: Diario · Planificador · Recetas · Progreso
  - Entreno: Hoy · Rutina · Ejercicios · Progreso *(Rutina/Ejercicios → En
    progreso page until built)*
- **Header**: a dropdown on the section title (Nutrición ▾ / Entreno ▾) — tap to
  switch sections; the menu lists both with a check on the current one. Avatar
  on the right → menu (Ajustes, Salir).
- **No Home tab on mobile.** Home is the desktop unified dashboard; on a phone you
  land directly in a section's day page (focused, per the design rationale).
- shadcn's sidebar is **not** rendered on mobile (its built-in sheet behaviour is
  unused) — the bottom nav replaces it.

### Active-section resolution

Most routes map unambiguously to a section (`/diary`→Nutrición,
`/training`→Entreno). The **shared** routes (`/home`, `/progress`, `/settings`)
do not. A `useActiveSection()` hook resolves it:

1. If the current route is section-owned → that section, and persist it to
   `localStorage` key `hf-section`.
2. If the route is shared → return the persisted value (default `nutricion`).

This decides which bottom nav (and which switcher state) a shared route shows on
mobile. It is local UI state + `localStorage` (mirrors the Theme pattern) — no
new server-state store, D-C1-compliant. On desktop the hook is unused (sidebar
shows all).

## Route map (old → new)

English slugs. The app is **pre-launch WIP**, so old Spanish slugs are **renamed
outright — no back-compat redirects** (nothing in the wild to break).

| Old | New | Nav entry? |
|---|---|---|
| `/` (→ `/diario`) | `/` → `/home` | — |
| *(none)* | `/home` | Sidebar (desktop) only |
| `/diario`, `/diario/:date` | `/diary`, `/diary/:date` | Nutrición |
| `/planificador` | `/planner` | Nutrición |
| `/menus`, `/menus/nuevo`, `/menus/:id` | `/templates`, `/templates/new`, `/templates/:id` | **Demoted** → entered from Planner |
| `/recetas`, `/recetas/nuevo`, `/recetas/:id` | `/recipes`, `/recipes/new`, `/recipes/:id` | Nutrición |
| `/ingredientes` | `/recipes/ingredients` | **Demoted** → tab inside Recetas |
| `/entrenamiento` | `/training` | Entreno ("Hoy") |
| `/entrenamiento/nueva`, `/entrenamiento/:id` | `/training/new`, `/training/:id` | — (drill-in) |
| `/entrenamiento/ejercicios/:id` | `/training/exercises/:id` | — (drill-in) |
| *(none)* | `/routine` | Entreno → **En progreso** page |
| *(none)* | `/exercises` | Entreno → **En progreso** page |
| `/progreso` | `/progress` | Shared |
| `/objetivos` | `/progress/goals` | **Demoted** → tab inside Progreso |
| `/settings` | `/settings` | Avatar menu (off main nav) |

`/home` on mobile redirects to `/diary` (a `HomePage` that `<Navigate to="/diary">`
when a `useMediaQuery('(min-width:768px)')` hook — add it if absent — is false).
Auth/onboarding routes
(`/login`, `/signup`, `/onboarding`) and the `RequireAuth → RequireOnboarded`
gates are unchanged.

## Nav restructure details (the three demotions)

- **Templates → inside Planner.** `PlanificadorPage` already owns Apply / Save-as
  / create-template (`/menus/nuevo`) flows. Drop the nav entry; add one
  "Manage templates" link in Planner pointing at the `/templates` list. Routes
  stay (renamed); only the nav peer is removed.
- **Ingredients → tab inside Recipes.** Recipes page gains two views as
  **sub-routes** (not query-string state, per D-C1): `/recipes` (recipes) and
  `/recipes/ingredients` (the current `IngredientesPage` content). Rendered as
  tabs; both deep-linkable. The standalone nav entry is removed.
- **Goals → tab inside Progress.** Same pattern: `/progress` (overview) and
  `/progress/goals` (the current `ObjetivosPage` content).

## Entreno today

The section ships **complete in shape** but only "Hoy" is real:
`/training` (the current `EntrenamientoPage` = "Hoy") plus its drill-in editor
and exercise-history routes. **Rutina (`/routine`) and Ejercicios (`/exercises`)
appear in the nav now and render a shared `EnProgresoPage`** — a clearly-labelled
"En progreso / Coming soon" placeholder — until their real specs land. This
keeps the Entreno section looking whole for early testers while staying honest
about what's built (invariant 7). When a real page ships, its `navConfig` entry
flips from the placeholder to the real route — a one-line change.

## Section colour identity

Add dedicated theme tokens in `src/index.css` (`:root` **and** `.dark`) and
expose them in `tailwind.config.js` — kept **separate from `--destructive`** so
training-red never reads as a delete action:

```
--nutricion / --nutricion-foreground   (≈ existing --primary green: 142 76% 36%)
--entreno   / --entreno-foreground      (a distinct training red, e.g. 0 72% 51%)
```

Shared/Home/Progreso use the existing ink/`--foreground`. Section colour appears
as: the active nav item (sidebar accent bar + tint; bottom-nav active pill) and
the mobile section-title/dot. It is an **accent**, not a full re-theme — the rest
of the palette (background, cards, primary buttons) is unchanged.

## Components

New shell pieces in `components/layout/` (where `AppLayout` already lives); the
pure `nav-config.ts` and `useActiveSection.ts` sit alongside (or in `lib/` /
`hooks/` if the plan prefers). Recommended set:

- `nav-config.ts` — the single source of truth (sections, items, routes, i18n
  keys, icons, `built` flag). Pure data; unit-testable.
- `useActiveSection.ts` — route → section + `hf-section` localStorage fallback.
- `AppSidebar.tsx` — desktop sidebar from `navConfig` (shadcn sidebar primitives).
- `BottomNav.tsx` — mobile bottom bar for the active section.
- `SectionSwitcher.tsx` — mobile header section dropdown.
- `AvatarMenu.tsx` — Ajustes / Salir; reused in sidebar footer and mobile header.
- `EnProgresoPage.tsx` — the shared "En progreso / Coming soon" placeholder that
  `/routine` and `/exercises` render until their real pages exist.
- `AppLayout.tsx` (existing) — becomes the responsive composer: renders
  `<AppSidebar>` at `md+` and `<MobileHeader>` + `<BottomNav>` below `md`, via
  Tailwind responsive classes (CSS-driven width breakpoint; both in markup).

Each unit has one purpose and a clear interface; the shells depend only on
`navConfig` + `useActiveSection`, so adding a future Entreno page is a one-line
config edit.

## i18n

Rewrite the `nav` namespace (`src/i18n/{es,en}/nav.json`) to the new keys:
`home, diary, planner, recipes, progress, today, routine, exercises` + section
group labels (`section.nutricion`, `section.entreno`, `section.general`) + the
switcher and avatar-menu strings. **Both ES and EN complete** — no English-only
fallback (invariant from working prefs).
- ES: Inicio (home) · Diario · Planificador · Recetas · Progreso · Hoy · Rutina ·
  Ejercicios · Nutrición · Entreno.
- EN: Home · Diary · Planner · Recipes · Progress · Today · Routine · Exercises ·
  Nutrition · Training.
(`home` is the desktop unified dashboard — "Inicio"/"Home" — distinct from the
Nutrición day page "Diario"/"Diary".) Plus an `inProgress` string for the
placeholder page (ES "En progreso — próximamente" / EN "In progress — coming
soon").
(Architecture doc lists 11 namespaces but `i18n/index.ts` registers 13 — out of
scope to fix here, but the nav rewrite stays within the existing `nav` ns.)

## Default landing & persistence

- `/` → `/home`. Desktop `/home` = placeholder dashboard; mobile `/home` →
  `/diary`.
- `hf-section` (localStorage) remembers the last section for shared-route bottom
  nav. Nothing else persists; switching sections is plain navigation to the
  other section's day page.

## Testing

- **Unit:** `navConfig` shape (every item has a built route + i18n key);
  `useActiveSection` route→section mapping incl. shared-route fallback and
  persistence.
- **Component:** shell renders sidebar at ≥768px and bottom-nav+header at <768px;
  bottom nav shows the correct section's tabs; switcher toggles section; demoted
  tabs (Recipes→Ingredients, Progress→Goals) navigate to their sub-routes;
  `/routine` and `/exercises` render the `EnProgresoPage` placeholder.
- **E2E (agent-browser, seeded `qa-bot@hudsonsfitness.app`):** drive the live
  app — switch sections on mobile width, confirm colour identity flips, confirm
  Ajustes/Salir reachable from the avatar in both shells, confirm Rutina/
  Ejercicios show the En progreso page.
- `pnpm lint` + `pnpm build` + `pnpm test` green (CI-enforced ship gate).

## Open question for plan phase

Assign a roadmap ID (next free `R-xx`) and add to `docs/roadmap.md`; cross-link
the item-4 home-dashboard dependency.
