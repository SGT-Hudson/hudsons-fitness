# R-33 Wave 0 — Shell & Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app shell with the R-33 design: MobileTopBar with a section-switch icon-button on every root screen, BackHeader on sub-screens, two per-section bottom navs, a `/more` hub, a collapsible grouped web sidebar, and a unified PageHeaderV2 + 1280px-capped page frame — removing `SectionSwitcher`, `AvatarMenu` and the sticky h-14 mobile header.

**Architecture:** New chrome components live in `src/components/layout/`. Pages adopt a single `PageShell` composite (renders MobileTopBar *or* BackHeader below `md`, PageHeaderV2 at `md+`, and a `max-w-content`-capped body), so `AppLayout` becomes a bare frame (sidebar + main + bottom nav). Navigation data is centralised in `nav-config.ts` (per-section bottom bars + sidebar groups). Section detection (`sectionOf`/`useActiveSection`) and the `.section-*`-class-on-`<html>` mechanism are preserved unchanged.

**Tech Stack:** React 18 + TS, Tailwind v4 (tokens from PR-2 in `src/index.css`), shadcn/ui (+ new vendored Tooltip on `@radix-ui/react-tooltip`), react-router-dom 6, i18next (`nav` namespace), Vitest + RTL (jsdom).

**Spec:** `docs/superpowers/specs/2026-07-02-r33-ui-redesign-design.md` §4 (+ §8 docs). Canvas references: `shell.jsx` (Sidebar/BottomNav), `mobile.jsx` (MobileTopBar), `nutri-mobile-kit.jsx` (BackHeader/HeaderBtn), `nutri-v2-shell.jsx` (PageHeaderV2/PageBodyV2), `ajustes-mobile.jsx` (Más-hub row patterns).

## Global Constraints

- **No AI/Claude attribution anywhere** — commits are plain conventional commits, no `Co-Authored-By`, no "Generated with…".
- All new user-facing strings in **ES and EN** (`src/i18n/{es,en}/nav.json`).
- No hardcoded palette classes or hex/oklch color literals in components — tokens/utilities only (PR-2 grep gates must stay clean: `git grep -nE '#[0-9a-fA-F]{3,8}\b' -- 'src/**/*.tsx'` and the palette-class grep must not gain hits).
- Section class stays on `<html>` (portals depend on it) — do not move it; dark mode (`.dark`, `hf-theme`) untouched.
- No schema/RLS/RPC changes; no `.select()` string changes.
- Every task ends green: `pnpm lint && pnpm test` (targeted test file during the cycle, full relevant suite before commit).
- Icon sizes/paddings come from the canvas specs quoted per task — use arbitrary values (`rounded-[11px]`, `text-[9.5px]`) where the token scale has no step; that is intentional, not a smell.
- localStorage keys: section `hf-section` (existing), sidebar `hf-sidebar-collapsed` (new, values `'1'`/`'0'`).
- Existing route paths must all remain reachable (success criterion §10.4).

## Design decisions locked by this plan (record D-id in Task 11)

- Navigation IA: two per-section apps — nutri bottom bar `Diario · Planificador · Recetas · Progreso · Más`; gym bottom bar `Hoy · Rutinas · Ejercicios · Progreso`; section switch = icon-button in MobileTopBar on every root screen (deliberate divergence from the canvas's unified 5-tab bar, per spec §4).
- Bottom-nav anatomy follows the *Convenciones* §08 spec (icon 19px, label 9.5px, active `--accent-ink`) rather than the canvas's live `shell.jsx` component (22/10.5, raw accent) — the R-33 spec text names 19/9.5 explicitly.
- `/templates` becomes **nutri-owned** in `sectionOf` (it was section-sticky before; it is a nutrition feature reached from Planner and `/more`).
- `/more` is shared (accent via the existing stored-section fallback, like `/progress`/`/settings`).
- Más-hub icon chips use existing token families (nutri/amber/phase/muted soft tints) instead of the canvas's raw oklch hues — keeps the no-literal-colors gate clean.
- Gym "Hoy" keeps lucide `Activity` (canvas uses a custom glyph; spec says lucide equivalents, no icon port).
- `RunnerPage` (`/training/run`) keeps its own immersive chrome — excluded from header adoption.

---

### Task 1: Prereqs — tooltip primitive, `--color-text-dim` utility, `--content-max` token, nav i18n strings

**Files:**
- Create: `src/components/ui/tooltip.tsx`
- Create: `src/components/ui/tooltip.test.tsx`
- Modify: `src/index.css` (two small additions)
- Modify: `src/i18n/es/nav.json`, `src/i18n/en/nav.json`
- Modify: `package.json` (dep)

**Interfaces:**
- Produces: `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider` from `@/components/ui/tooltip` (standard shadcn API); Tailwind utility `text-text-dim`; utility `max-w-content` now token-backed (`--content-max: 1280px`); nav i18n keys `more, templates, goals, back, sidebar.{collapse,expand}, groups.{nutricion,entreno,analisis}`.

- [ ] **Step 1: Install the Radix dep**

Run: `pnpm add @radix-ui/react-tooltip`

- [ ] **Step 2: Write the failing test**

`src/components/ui/tooltip.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

describe('Tooltip', () => {
  it('shows content on hover', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger>hover me</TooltipTrigger>
          <TooltipContent>tip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    await user.hover(screen.getByText('hover me'));
    expect(await screen.findAllByText('tip text')).not.toHaveLength(0);
  });
});
```

(`findAllByText`: Radix renders the content plus a visually-hidden copy.)

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/components/ui/tooltip.test.tsx`
Expected: FAIL — cannot resolve `./tooltip`.

- [ ] **Step 4: Create the vendored primitive**

`src/components/ui/tooltip.tsx` (standard shadcn TW4 tooltip; styling matches the canvas collapsed-sidebar tooltip: inverted bg, 12/500):

```tsx
import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-md',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
```

Match the export/`forwardRef` style of the existing `src/components/ui/dropdown-menu.tsx` — if that file uses a different vendoring idiom (e.g. no forwardRef, data-slot attributes), follow it.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/components/ui/tooltip.test.tsx`
Expected: PASS.

- [ ] **Step 6: index.css additions**

In the `@theme inline` block (next to `--color-muted-foreground`), add:

```css
  --color-text-dim: var(--text-dim);
```

Replace the hardcoded `max-w-content` utility (currently `max-width: 1280px` around line 17) with a token-backed one, and declare the token in the same `:root` block that holds the neutral tokens (near `--text-dim`, ~line 66):

```css
  --content-max: 1280px; /* canvas tokens.css line 69 — V2 web content cap */
```

```css
@utility max-w-content {
  max-width: var(--content-max);
}
```

- [ ] **Step 7: nav i18n strings**

`src/i18n/es/nav.json` — add keys (keep all existing ones):

```json
{
  "more": "Más",
  "templates": "Plantillas",
  "goals": "Objetivos",
  "back": "Volver",
  "sidebar": { "collapse": "Contraer menú", "expand": "Expandir menú" },
  "groups": {
    "nutricion": "Nutrición",
    "entreno": "Entrenamiento",
    "analisis": "Análisis"
  }
}
```

`src/i18n/en/nav.json` — mirror:

```json
{
  "more": "More",
  "templates": "Templates",
  "goals": "Goals",
  "back": "Back",
  "sidebar": { "collapse": "Collapse menu", "expand": "Expand menu" },
  "groups": {
    "nutricion": "Nutrition",
    "entreno": "Training",
    "analisis": "Analysis"
  }
}
```

- [ ] **Step 8: Verify green + commit**

Run: `pnpm lint && pnpm vitest run src/components/ui`
Expected: PASS.

```bash
git add src/components/ui/tooltip.tsx src/components/ui/tooltip.test.tsx src/index.css src/i18n/es/nav.json src/i18n/en/nav.json package.json pnpm-lock.yaml
git commit -m "feat(shell): add tooltip primitive, text-dim utility, content-max token, nav strings"
```

---

### Task 2: nav-config rework — per-section bottom bars + sidebar groups

**Files:**
- Modify: `src/components/layout/nav-config.ts`
- Modify: `src/components/layout/nav-config.test.ts`

**Interfaces:**
- Consumes: nav i18n keys from Task 1.
- Produces (exact signatures — later tasks depend on these):
  - `type Section = 'nutri' | 'gym'` (unchanged)
  - `interface NavItem { key: string; route: string; icon: LucideIcon }`
  - `bottomNavItems(section: Section): NavItem[]` — nutri: diary/planner/recipes/progress/more (5); gym: today/routine/exercises/progress (4)
  - `interface SidebarGroup { key: 'nutricion' | 'entreno' | 'analisis'; accent: Section | null; items: NavItem[] }`
  - `SIDEBAR_GROUPS: SidebarGroup[]` (replaces `sidebarGroups()`)
  - `sectionOf(pathname: string): Section | null` (now also owns `/templates` → nutri)
  - `SECTION_I18N_KEY` (unchanged)

- [ ] **Step 1: Update the tests to the new shape**

Replace the relevant assertions in `src/components/layout/nav-config.test.ts` (keep the file's existing style/imports):

```ts
import { bottomNavItems, sectionOf, SIDEBAR_GROUPS } from './nav-config';

describe('bottomNavItems', () => {
  it('nutri bar: diario, planificador, recetas, progreso, más', () => {
    expect(bottomNavItems('nutri').map((i) => i.key)).toEqual([
      'diary', 'planner', 'recipes', 'progress', 'more',
    ]);
  });
  it('gym bar: hoy, rutinas, ejercicios, progreso', () => {
    expect(bottomNavItems('gym').map((i) => i.key)).toEqual([
      'today', 'routine', 'exercises', 'progress',
    ]);
  });
});

describe('sectionOf', () => {
  it.each([
    ['/diary', 'nutri'], ['/diary/2026-07-07', 'nutri'], ['/planner', 'nutri'],
    ['/recipes', 'nutri'], ['/recipes/ingredients', 'nutri'], ['/templates', 'nutri'],
    ['/templates/abc', 'nutri'],
    ['/training', 'gym'], ['/training/run', 'gym'], ['/routine', 'gym'], ['/exercises', 'gym'],
  ])('%s → %s', (path, section) => expect(sectionOf(path)).toBe(section));
  it.each(['/progress', '/settings', '/more'])('%s is shared (null)', (path) =>
    expect(sectionOf(path)).toBeNull(),
  );
});

describe('SIDEBAR_GROUPS', () => {
  it('renders Nutrición / Entrenamiento / Análisis with the canvas items', () => {
    expect(SIDEBAR_GROUPS.map((g) => g.key)).toEqual(['nutricion', 'entreno', 'analisis']);
    expect(SIDEBAR_GROUPS.map((g) => g.accent)).toEqual(['nutri', 'gym', null]);
    expect(SIDEBAR_GROUPS.map((g) => g.items.map((i) => i.key))).toEqual([
      ['diary', 'recipes', 'ingredients', 'planner'],
      ['today', 'routine', 'exercises'],
      ['progress', 'goals'],
    ]);
  });
  it('every item has a route and an icon', () => {
    for (const g of SIDEBAR_GROUPS) for (const i of g.items) {
      expect(i.route.startsWith('/')).toBe(true);
      expect(i.icon).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/components/layout/nav-config.test.ts`
Expected: FAIL (`SIDEBAR_GROUPS` not exported; item sets differ).

- [ ] **Step 3: Rewrite nav-config.ts**

```ts
import {
  Activity,
  Apple,
  CalendarDays,
  ClipboardPen,
  Dumbbell,
  Ellipsis,
  NotebookPen,
  Target,
  TrendingUp,
  Utensils,
  type LucideIcon,
} from 'lucide-react';

export type Section = 'nutri' | 'gym';

export interface NavItem {
  /** i18n key in the `nav` namespace. */
  key: string;
  route: string;
  icon: LucideIcon;
}

/* Canvas icon mapping (icons.jsx → lucide): Diario=NotebookPen, Plan=CalendarDays,
 * Recetas=Utensils, Progreso=TrendingUp, Más=Ellipsis, Rutinas=ClipboardPen,
 * Ejercicios=Dumbbell, Ingredientes=Apple, Objetivos=Target. Hoy keeps Activity
 * (canvas glyph is custom; no icon port per spec). */
const ITEM = {
  diary: { key: 'diary', route: '/diary', icon: NotebookPen },
  planner: { key: 'planner', route: '/planner', icon: CalendarDays },
  recipes: { key: 'recipes', route: '/recipes', icon: Utensils },
  ingredients: { key: 'ingredients', route: '/recipes/ingredients', icon: Apple },
  today: { key: 'today', route: '/training', icon: Activity },
  routine: { key: 'routine', route: '/routine', icon: ClipboardPen },
  exercises: { key: 'exercises', route: '/exercises', icon: Dumbbell },
  progress: { key: 'progress', route: '/progress', icon: TrendingUp },
  goals: { key: 'goals', route: '/progress/goals', icon: Target },
  more: { key: 'more', route: '/more', icon: Ellipsis },
} satisfies Record<string, NavItem>;

/** Bottom-nav items per section (spec §4.1). */
const BOTTOM_NAV: Record<Section, NavItem[]> = {
  nutri: [ITEM.diary, ITEM.planner, ITEM.recipes, ITEM.progress, ITEM.more],
  gym: [ITEM.today, ITEM.routine, ITEM.exercises, ITEM.progress],
};

export function bottomNavItems(section: Section): NavItem[] {
  return BOTTOM_NAV[section];
}

/** Route prefixes owned by a section (drives accent + which bottom bar renders). */
const SECTION_ROUTES: Record<Section, string[]> = {
  nutri: ['/diary', '/planner', '/recipes', '/templates'],
  gym: ['/training', '/routine', '/exercises'],
};

/** Section that owns a pathname, or null for shared routes (/progress, /settings, /more). */
export function sectionOf(pathname: string): Section | null {
  for (const section of ['nutri', 'gym'] as const) {
    if (
      SECTION_ROUTES[section].some(
        (r) => pathname === r || pathname.startsWith(`${r}/`),
      )
    ) {
      return section;
    }
  }
  return null;
}

export interface SidebarGroup {
  /** i18n key under `nav:groups.*`. */
  key: 'nutricion' | 'entreno' | 'analisis';
  /** Accent family for active items; null = neutral (Análisis). */
  accent: Section | null;
  items: NavItem[];
}

/** Web sidebar groups (canvas shell.jsx lines 20–36). */
export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    key: 'nutricion',
    accent: 'nutri',
    items: [ITEM.diary, ITEM.recipes, ITEM.ingredients, ITEM.planner],
  },
  { key: 'entreno', accent: 'gym', items: [ITEM.today, ITEM.routine, ITEM.exercises] },
  { key: 'analisis', accent: null, items: [ITEM.progress, ITEM.goals] },
];

/**
 * i18n `nav.section.*` keys are unchanged by the identity rename; map the
 * internal Section value to its stable translation key.
 */
export const SECTION_I18N_KEY: Record<Section, string> = {
  nutri: 'nutricion',
  gym: 'entreno',
};
```

Note: `NAV_ITEMS`, `NavGroup`, `sidebarGroups()` and the `mobile` flag are deleted. `useActiveSection.ts` imports only `sectionOf` + `Section` — verify it still compiles. `BottomNav.tsx`/`AppSidebar.tsx` break here and are fixed in Tasks 3/6; to keep this commit green, update them minimally in this task ONLY if `tsc` fails the build — expected fallout: `AppSidebar.tsx` uses `sidebarGroups()`/`NavGroup` and `BottomNav` is compatible already. If `AppSidebar` breaks, adapt its call sites mechanically (`SIDEBAR_GROUPS` array, `group.key` for the label, `group.accent` for colors) without restyling — Task 6 replaces it wholesale.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/components/layout/`
Expected: nav-config tests PASS. If `AppSidebar.test.tsx`/`BottomNav.test.tsx` fail on removed exports, apply the minimal mechanical adaptation above (and matching test tweaks) — behavior parity, no restyle.

- [ ] **Step 5: Full check + commit**

Run: `pnpm lint && pnpm build && pnpm vitest run src/components/layout/`

```bash
git add -A src/components/layout/
git commit -m "feat(shell): per-section bottom-nav config + sidebar groups in nav-config"
```

---

### Task 3: BottomNav restyle to spec anatomy + safe-area

**Files:**
- Modify: `src/components/layout/BottomNav.tsx`
- Modify: `src/components/layout/BottomNav.test.tsx`
- Modify: `index.html` (viewport)

**Interfaces:**
- Consumes: `bottomNavItems(section)` from Task 2; `useActiveSection()` (unchanged).
- Produces: `<BottomNav />` (same export; render-only change).

- [ ] **Step 1: Update tests**

In `src/components/layout/BottomNav.test.tsx`, update the expected tab sets (keep the file's render helpers):

- On a nutri route (`/diary`): tabs are `Diario, Planificador, Recetas, Progreso, Más` (5).
- On a gym route (`/training`): tabs are `Hoy, Rutinas, Ejercicios, Progreso` (4) and there is **no** `Más`.
- Add: the `Más` link points at `/more` (`expect(screen.getByRole('link', { name: 'Más' })).toHaveAttribute('href', '/more')`).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/components/layout/BottomNav.test.tsx`
Expected: FAIL (old bars had 4 nutri tabs, no Más).

- [ ] **Step 3: Rewrite BottomNav.tsx**

Canvas spec (*Convenciones* §08): icon 19px, label 9.5px, gap 3px, active `--accent-ink` weight 600, inactive `--text-dim` weight 500, bg `--bg-elev`, top border `--line`.

```tsx
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { bottomNavItems } from './nav-config';
import { useActiveSection } from './useActiveSection';

export function BottomNav() {
  const { t } = useTranslation('nav');
  const section = useActiveSection();
  const items = bottomNavItems(section);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 grid border-t bg-card px-2.5 pt-1.5 pb-[max(env(safe-area-inset-bottom),0.375rem)] md:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.key}
            to={item.route}
            end={item.route === '/progress'}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-[3px] py-1',
                isActive ? 'font-semibold text-accent-ink' : 'font-medium text-text-dim',
              )
            }
          >
            <Icon className="size-[19px]" />
            <span className="text-[9.5px]">{t(item.key)}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
```

Active color is `text-accent-ink` — it resolves per-section via the `.section-*` class on `<html>`, so no per-section ACTIVE record is needed anymore.

- [ ] **Step 4: viewport-fit for safe-area**

In `index.html`, change the viewport meta to:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

(Without `viewport-fit=cover`, `env(safe-area-inset-bottom)` never resolves on notched devices.)

- [ ] **Step 5: Run tests + commit**

Run: `pnpm lint && pnpm vitest run src/components/layout/BottomNav.test.tsx`
Expected: PASS.

```bash
git add src/components/layout/BottomNav.tsx src/components/layout/BottomNav.test.tsx index.html
git commit -m "feat(shell): restyle bottom nav to design anatomy with per-section tabs and safe-area"
```

---

### Task 4: MobileTopBar, SectionSwitchButton, BackHeader

**Files:**
- Create: `src/components/layout/MobileTopBar.tsx` (also exports `SectionSwitchButton`)
- Create: `src/components/layout/BackHeader.tsx`
- Create: `src/components/layout/MobileTopBar.test.tsx`
- Create: `src/components/layout/BackHeader.test.tsx`

**Interfaces:**
- Consumes: `useActiveSection()`, `Section` from Task 2; i18n `nav:switchSection`, `nav:back`.
- Produces:
  - `MobileTopBar({ title, subtitle?, actions? }: { title: string; subtitle?: string; actions?: ReactNode })` — root-screen mobile header, `md:hidden`, always ends with the section switch.
  - `SectionSwitchButton()` — icon-button link to the *other* section's root.
  - `BackHeader({ title, subtitle?, to?, actions? }: { title: string; subtitle?: string; to?: string; actions?: ReactNode })` — sub-screen mobile header, `md:hidden`; `to` navigates there, omitted → `navigate(-1)`.

- [ ] **Step 1: Write failing tests**

`src/components/layout/MobileTopBar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MobileTopBar } from './MobileTopBar';

function renderAt(path: string, ui: React.ReactElement) {
  return render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
}

describe('MobileTopBar', () => {
  it('renders title and subtitle', () => {
    renderAt('/diary', <MobileTopBar title="Diario" subtitle="Lun 7 jul" />);
    expect(screen.getByRole('heading', { name: 'Diario' })).toBeInTheDocument();
    expect(screen.getByText('Lun 7 jul')).toBeInTheDocument();
  });

  it('in nutrition, the switch links to /training', () => {
    renderAt('/diary', <MobileTopBar title="Diario" />);
    expect(screen.getByRole('link', { name: 'Cambiar de sección' })).toHaveAttribute(
      'href',
      '/training',
    );
  });

  it('in gym, the switch links to /diary', () => {
    renderAt('/training', <MobileTopBar title="Hoy" />);
    expect(screen.getByRole('link', { name: 'Cambiar de sección' })).toHaveAttribute(
      'href',
      '/diary',
    );
  });
});
```

(Tests run with the es locale per the existing layout tests — mirror however `AppSidebar.test.tsx` sets up i18n.)

`src/components/layout/BackHeader.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { BackHeader } from './BackHeader';

function Loc() {
  return <div data-testid="loc">{useLocation().pathname}</div>;
}

describe('BackHeader', () => {
  it('renders title and navigates to `to`', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/settings/profile']}>
        <Routes>
          <Route path="*" element={<><BackHeader title="Perfil" to="/settings" /><Loc /></>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Perfil' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('/settings');
  });

  it('without `to`, goes back in history', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/exercises', '/exercises/abc']} initialIndex={1}>
        <Routes>
          <Route path="*" element={<><BackHeader title="Detalle" /><Loc /></>} />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('/exercises');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/components/layout/MobileTopBar.test.tsx src/components/layout/BackHeader.test.tsx`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement MobileTopBar.tsx**

Canvas `mobile.jsx:30–59`: header `padding: 8px 20px 12px`, gap 12, border-b `--line`, bg `--bg-elev`; title 22/600/−0.02em (the existing `text-title-screen` utility); subtitle 12px `--text-dim` `.tnum`; icon-buttons 36×36, radius 12, border `--line`, bg `--bg-elev`, icon 16. Strip-list applied: no Search, no Bell (spec §6.2 strips the bell; search arrives with the Diario wave).

```tsx
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dumbbell, Leaf } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveSection } from './useActiveSection';

/** Icon-button linking to the other section's root (spec §4.1). */
export function SectionSwitchButton() {
  const { t } = useTranslation('nav');
  const section = useActiveSection();
  const target = section === 'nutri' ? 'gym' : 'nutri';
  const Icon = target === 'gym' ? Dumbbell : Leaf;
  return (
    <Link
      to={target === 'gym' ? '/training' : '/diary'}
      aria-label={t('switchSection')}
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-[12px] border bg-card',
        target === 'gym' ? 'text-gym' : 'text-nutri',
      )}
    >
      <Icon className="size-4" />
    </Link>
  );
}

interface MobileTopBarProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

/** Root-screen mobile header (canvas MobileTopBar). Hidden at md+. */
export function MobileTopBar({ title, subtitle, actions }: MobileTopBarProps) {
  return (
    <header className="flex items-center gap-3 border-b bg-card px-5 pb-3 pt-2 md:hidden">
      <div className="flex min-w-0 flex-1 flex-col leading-[1.15]">
        <h1 className="truncate text-title-screen">{title}</h1>
        {subtitle && <span className="tnum text-xs text-text-dim">{subtitle}</span>}
      </div>
      {actions}
      <SectionSwitchButton />
    </header>
  );
}
```

- [ ] **Step 4: Implement BackHeader.tsx**

Canvas `nutri-mobile-kit.jsx:101–123`: `padding: 8px 14px 12px`, gap 10, back-button 36×36 radius 11 `--text-muted`, title 17/600/−0.02em truncating, subtitle 11.5 `--text-dim`.

```tsx
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';

interface BackHeaderProps {
  title: string;
  subtitle?: string;
  /** Explicit back target; omitted → history back. */
  to?: string;
  actions?: ReactNode;
}

/** Sub-screen mobile header (canvas BackHeader). No section switch. Hidden at md+. */
export function BackHeader({ title, subtitle, to, actions }: BackHeaderProps) {
  const { t } = useTranslation('nav');
  const navigate = useNavigate();
  return (
    <header className="flex items-center gap-2.5 border-b bg-card px-3.5 pb-3 pt-2 md:hidden">
      <button
        type="button"
        aria-label={t('back')}
        onClick={() => (to ? navigate(to) : navigate(-1))}
        className="grid size-9 shrink-0 place-items-center rounded-[11px] border bg-card text-muted-foreground"
      >
        <ArrowLeft className="size-4" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col leading-[1.15]">
        <h1 className="truncate text-[17px] font-semibold tracking-[-0.02em]">{title}</h1>
        {subtitle && <span className="tnum text-[11.5px] text-text-dim">{subtitle}</span>}
      </div>
      {actions}
    </header>
  );
}
```

- [ ] **Step 5: Run tests + commit**

Run: `pnpm lint && pnpm vitest run src/components/layout/`
Expected: PASS.

```bash
git add src/components/layout/MobileTopBar.tsx src/components/layout/BackHeader.tsx src/components/layout/MobileTopBar.test.tsx src/components/layout/BackHeader.test.tsx
git commit -m "feat(shell): MobileTopBar with section switch + BackHeader for sub-screens"
```

---

### Task 5: PageHeaderV2 + PageShell composite

**Files:**
- Create: `src/components/layout/PageShell.tsx` (exports `PageShell` and `PageHeaderV2`)
- Create: `src/components/layout/PageShell.test.tsx`

**Interfaces:**
- Consumes: `MobileTopBar`, `BackHeader` (Task 4).
- Produces:
  - `PageHeaderV2({ title, subtitle?, actions? })` — desktop header, `hidden md:flex`, h-14, full-bleed, border-b, actions right.
  - `PageShell({ title, subtitle?, actions?, back?, children }: { title: string; subtitle?: string; actions?: ReactNode; back?: string | true; children: ReactNode })` — the page frame every page adopts. `back` present → BackHeader on mobile (string = explicit target, `true` = history back); absent → MobileTopBar (root screen, gets the switch). Body: `mx-auto w-full max-w-content px-4 py-5 md:px-6`.

- [ ] **Step 1: Write failing tests**

`src/components/layout/PageShell.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PageShell } from './PageShell';

function renderShell(ui: React.ReactElement) {
  return render(<MemoryRouter initialEntries={['/diary']}>{ui}</MemoryRouter>);
}

describe('PageShell', () => {
  it('root mode renders both headers (mobile topbar + desktop) and the body', () => {
    renderShell(
      <PageShell title="Diario" subtitle="hoy">
        <p>cuerpo</p>
      </PageShell>,
    );
    // two headings: one in MobileTopBar (md:hidden), one in PageHeaderV2 (hidden md:flex)
    expect(screen.getAllByRole('heading', { name: 'Diario' })).toHaveLength(2);
    expect(screen.getByText('cuerpo')).toBeInTheDocument();
    // root mode carries the section switch
    expect(screen.getByRole('link', { name: 'Cambiar de sección' })).toBeInTheDocument();
  });

  it('back mode renders BackHeader instead of the topbar (no switch)', () => {
    renderShell(
      <PageShell title="Perfil" back="/settings">
        <p>cuerpo</p>
      </PageShell>,
    );
    expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cambiar de sección' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/components/layout/PageShell.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement PageShell.tsx**

Canvas `nutri-v2-shell.jsx:8–43`: header height 56, `padding: 0 24px`, border-b `--line`, bg `--bg-elev`, gap 14, title 17/600, subtitle 13.5 `--text-dim`; body centred, capped at `var(--content-max)`.

```tsx
import type { ReactNode } from 'react';
import { BackHeader } from './BackHeader';
import { MobileTopBar } from './MobileTopBar';

interface PageHeaderV2Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

/** Desktop page header (canvas PageHeaderV2): 56px, full-bleed, actions right. */
export function PageHeaderV2({ title, subtitle, actions }: PageHeaderV2Props) {
  return (
    <header className="hidden h-14 shrink-0 items-center gap-3.5 border-b bg-card px-6 md:flex">
      <h1 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h1>
      {subtitle && <span className="tnum text-[13.5px] text-text-dim">{subtitle}</span>}
      <div className="flex-1" />
      {actions}
    </header>
  );
}

interface PageShellProps extends PageHeaderV2Props {
  /** Sub-screen: render BackHeader on mobile. String = target route, true = history back. */
  back?: string | true;
  children: ReactNode;
}

/**
 * Unified page frame: MobileTopBar (root) or BackHeader (sub-screen) below md,
 * PageHeaderV2 at md+, body centred and capped at --content-max (1280px).
 */
export function PageShell({ title, subtitle, actions, back, children }: PageShellProps) {
  return (
    <>
      {back !== undefined ? (
        <BackHeader
          title={title}
          subtitle={subtitle}
          to={typeof back === 'string' ? back : undefined}
          actions={actions}
        />
      ) : (
        <MobileTopBar title={title} subtitle={subtitle} actions={actions} />
      )}
      <PageHeaderV2 title={title} subtitle={subtitle} actions={actions} />
      <div className="mx-auto w-full max-w-content px-4 py-5 md:px-6">{children}</div>
    </>
  );
}
```

- [ ] **Step 4: Run tests + commit**

Run: `pnpm lint && pnpm vitest run src/components/layout/PageShell.test.tsx`
Expected: PASS.

```bash
git add src/components/layout/PageShell.tsx src/components/layout/PageShell.test.tsx
git commit -m "feat(shell): PageShell page frame with PageHeaderV2 and content cap"
```

---

### Task 6: AppSidebar rewrite — collapsible, grouped, profile footer

**Files:**
- Modify: `src/components/layout/AppSidebar.tsx` (full rewrite)
- Modify: `src/components/layout/AppSidebar.test.tsx`

**Interfaces:**
- Consumes: `SIDEBAR_GROUPS` (Task 2), Tooltip primitives (Task 1), `useAuth()` from `@/features/auth/AuthProvider`, `useActivePhase()` from `@/features/phases/hooks` (returns a react-query result whose `data` is a `phases` row with `phase_type: string` and `name` — verify exact fields by reading `src/features/phases/api.ts`; phase-type labels at i18n `objetivos:phases.type.{cut|maintenance|bulk}`).
- Produces: `<AppSidebar />` (same export). localStorage `hf-sidebar-collapsed` = `'1' | '0'`.

- [ ] **Step 1: Update tests**

Rewrite `src/components/layout/AppSidebar.test.tsx` keeping its existing router/i18n/query harness (it already mocks auth; it will now also need `useActivePhase` mocked — mock `@/features/phases/hooks` with `useActivePhase: () => ({ data: null })` to avoid Supabase imports, per the component-test convention):

```tsx
// assertions to cover (adapt to the file's existing helpers):
it('renders the three canvas groups and their items', () => {
  // Nutrición: Diario, Recetas, Ingredientes, Planificador
  // Entrenamiento: Hoy, Rutinas, Ejercicios
  // Análisis: Progreso, Objetivos
});
it('collapse toggle persists to localStorage', async () => {
  // click button aria-label 'Contraer menú' → localStorage['hf-sidebar-collapsed'] === '1'
  // labels hidden (items become icon tiles with tooltips)
});
it('starts collapsed when hf-sidebar-collapsed=1', () => {});
it('footer links to /settings', () => {});
it('stays sticky full-height', () => {
  // preserve the existing sticky/h-dvh assertion from the old test
});
```

Write these as real RTL tests following the old file's structure; item names come from `nav.json` es strings (`Diario`, `Recetas`, `Ingredientes`, `Planificador`, `Hoy`, `Rutina`… — note the existing key `routine` renders "Rutina"; the canvas label is "Rutinas". Update `es/nav.json` `"routine": "Rutinas"` and en `"routine": "Routines"` in this task to match the canvas).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/components/layout/AppSidebar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Rewrite AppSidebar.tsx**

Canvas `shell.jsx:4–213`. Anatomy: aside 232px ↔ 60px (transition 180ms), border-r `--line`, bg `--bg-elev`, padding expanded `18px 14px` / collapsed `18px 8px`; brand tile 28×28 radius 8 inverted; group label 11/500 uppercase tracking 0.04em `--text-dim` padding `10px 12px 6px` (collapsed → 24×1 divider); item row h-9 gap-3 px-3 radius 10, 13.5px, active = accent-soft bg + accent-ink text + 3px accent bar at left −10px (no bar for the neutral Análisis group; neutral active = `bg-muted text-foreground`); collapsed item = 40×40 centred tile + tooltip right; footer border-t: avatar 28 circle (accent bg, initial), name 12.5/500 + active-phase 10.5 `--text-dim`, Settings cog 15px linking `/settings`.

```tsx
import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/features/auth/AuthProvider';
import { useActivePhase } from '@/features/phases/hooks';
import { SIDEBAR_GROUPS, type NavItem, type Section } from './nav-config';

const STORAGE_KEY = 'hf-sidebar-collapsed';

const ACTIVE_STYLES: Record<Section, { row: string; bar: string }> = {
  nutri: { row: 'bg-nutri-soft text-nutri-ink', bar: 'before:bg-nutri' },
  gym: { row: 'bg-gym-soft text-gym-ink', bar: 'before:bg-gym' },
};

function SidebarItem({
  item,
  accent,
  collapsed,
}: {
  item: NavItem;
  accent: Section | null;
  collapsed: boolean;
}) {
  const { t } = useTranslation('nav');
  const active = accent ? ACTIVE_STYLES[accent] : { row: 'bg-muted text-foreground', bar: '' };
  const link = (
    <NavLink
      to={item.route}
      end={item.route === '/progress' || item.route === '/recipes'}
      className={({ isActive }) =>
        cn(
          collapsed
            ? 'grid size-10 place-items-center self-center rounded-[10px]'
            : 'relative flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13.5px]',
          isActive
            ? cn(active.row, 'font-medium', !collapsed && accent && [
                'before:absolute before:-left-2.5 before:top-2 before:bottom-2',
                'before:w-[3px] before:rounded-full',
                active.bar,
              ])
            : 'text-muted-foreground hover:bg-muted/60',
        )
      }
    >
      <item.icon className="size-[17px] shrink-0" />
      {!collapsed && <span className="truncate">{t(item.key)}</span>}
    </NavLink>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{t(item.key)}</TooltipContent>
    </Tooltip>
  );
}

export function AppSidebar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: phase } = useActivePhase();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(STORAGE_KEY) === '1',
  );
  const toggle = () =>
    setCollapsed((c) => {
      localStorage.setItem(STORAGE_KEY, c ? '0' : '1');
      return !c;
    });

  const email = user?.email ?? '';
  const initial = (email[0] ?? '?').toUpperCase();

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r bg-card transition-[width,padding] duration-200',
          'md:sticky md:top-0 md:flex md:h-dvh',
          collapsed ? 'w-[60px] px-2 py-[18px]' : 'w-[232px] px-3.5 py-[18px]',
        )}
      >
        <div className={cn('flex items-center gap-2.5', collapsed && 'flex-col')}>
          <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-foreground text-[13px] font-bold tracking-[-0.04em] text-background">
            HF
          </div>
          {!collapsed && (
            <span className="flex-1 truncate text-[13.5px] font-semibold">
              {t('common:appName')}
            </span>
          )}
          <button
            type="button"
            aria-label={collapsed ? t('nav:sidebar.expand') : t('nav:sidebar.collapse')}
            onClick={toggle}
            className="grid size-6 place-items-center rounded-md text-text-dim hover:bg-muted"
          >
            <ChevronLeft className={cn('size-3.5 transition-transform', collapsed && 'rotate-180')} />
          </button>
        </div>

        <nav className="mt-4 flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {SIDEBAR_GROUPS.map((group, gi) => (
            <div key={group.key} className="flex flex-col gap-0.5">
              {collapsed ? (
                gi > 0 && <div className="mx-auto my-1.5 h-px w-6 bg-border" />
              ) : (
                <div className="px-3 pb-1.5 pt-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-text-dim">
                  {t(`nav:groups.${group.key}`)}
                </div>
              )}
              {group.items.map((item) => (
                <SidebarItem key={item.key} item={item} accent={group.accent} collapsed={collapsed} />
              ))}
            </div>
          ))}
        </nav>

        <div
          className={cn(
            'mt-2 flex items-center gap-2.5 border-t pt-2.5',
            collapsed && 'flex-col',
          )}
        >
          <div className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
            {initial}
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[12.5px] font-medium">{email}</span>
              {phase && (
                <span className="truncate text-[10.5px] text-text-dim">
                  {t(`objetivos:phases.type.${phase.phase_type}`)}
                </span>
              )}
            </div>
          )}
          <Link
            to="/settings"
            aria-label={t('nav:settings')}
            className="grid size-7 shrink-0 place-items-center rounded-md text-text-dim hover:bg-muted"
          >
            <Settings className="size-[15px]" />
          </Link>
        </div>
      </aside>
    </TooltipProvider>
  );
}
```

Notes for the implementer:
- Check how the old `AppSidebar.tsx` imported auth (`useAuth`) and reuse the same import path; keep whatever `end` semantics the old NavLinks used if they differ (`/recipes` needs `end` so `/recipes/ingredients` doesn't double-activate Recetas over Ingredientes).
- `phase.phase_type` values must match the i18n keys `cut|maintenance|bulk` — verify against `src/features/phases/api.ts` and adjust if the column uses different literals.
- `t('common:appName')` — confirm the key exists in `src/i18n/es/common.json` (the old sidebar used it); otherwise reuse whatever key the old brand row used.

- [ ] **Step 4: Run tests**

Run: `pnpm lint && pnpm vitest run src/components/layout/AppSidebar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/AppSidebar.tsx src/components/layout/AppSidebar.test.tsx src/i18n/es/nav.json src/i18n/en/nav.json
git commit -m "feat(shell): collapsible grouped web sidebar with profile footer"
```

---

### Task 7: `/more` hub page

**Files:**
- Create: `src/pages/MorePage.tsx`
- Create: `src/pages/MorePage.test.tsx`
- Modify: `src/app/router.tsx` (register `/more` inside the AppLayout group)
- Modify: `src/i18n/es/nav.json`, `src/i18n/en/nav.json` (hub row subtitles if used)

**Interfaces:**
- Consumes: `PageShell` (Task 5), `useAuth()`, `useActivePhase()` (same notes as Task 6).
- Produces: route `/more` (shared section — `sectionOf` already returns null for it after Task 2).

- [ ] **Step 1: Write failing test**

`src/pages/MorePage.test.tsx` (mock `@/features/phases/hooks` and auth exactly like `AppSidebar.test.tsx` does after Task 6):

```tsx
describe('MorePage', () => {
  it('renders the profile card linking to /settings/profile', () => {
    // getByRole('link', { name: /qa-bot@|correo del mock/ }) → href /settings/profile
  });
  it('renders hub rows: Ingredientes, Plantillas, Objetivos, Ajustes', () => {
    // links → /recipes/ingredients, /templates, /progress/goals, /settings
  });
});
```

Write them as real RTL tests with the shared render harness (MemoryRouter at `/more`).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/pages/MorePage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement MorePage.tsx**

Pattern from `ajustes-mobile.jsx` (AjGroup/AjRow) + sidebar footer profile: profile card = accent-soft surface, avatar 46×46 accent circle with initial (19/700), name/email + chevron; rows = card container, rows min-h-[50px] `gap-[11px] px-[13px] py-2.5`, separated by `border-t`, leading 30×30 icon chip radius 9 (token tints — see the locked decision), trailing chevron 15px `text-text-dim`.

```tsx
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Apple, ChevronRight, LayoutTemplate, Settings, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { PageShell } from '@/components/layout/PageShell';
import { useAuth } from '@/features/auth/AuthProvider';
import { useActivePhase } from '@/features/phases/hooks';

const ROWS = [
  { key: 'ingredients', route: '/recipes/ingredients', icon: Apple, chip: 'bg-nutri-soft text-nutri-ink' },
  { key: 'templates', route: '/templates', icon: LayoutTemplate, chip: 'bg-gym-soft text-gym-ink' },
  { key: 'goals', route: '/progress/goals', icon: Target, chip: 'bg-amber-soft text-amber-ink' },
  { key: 'settings', route: '/settings', icon: Settings, chip: 'bg-muted text-muted-foreground' },
] as const;

export function MorePage() {
  const { t } = useTranslation('nav');
  const { user } = useAuth();
  const { data: phase } = useActivePhase();
  const email = user?.email ?? '';
  const initial = (email[0] ?? '?').toUpperCase();

  return (
    <PageShell title={t('more')}>
      <div className="flex flex-col gap-5">
        <Link
          to="/settings/profile"
          className="flex items-center gap-[13px] rounded-[14px] border border-accent-line bg-accent-soft p-3.5"
        >
          <div className="grid size-[46px] shrink-0 place-items-center rounded-full bg-accent text-[19px] font-bold text-accent-foreground">
            {initial}
          </div>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[14.5px] font-semibold">{email}</span>
            {phase && (
              <span className="truncate text-[11.5px] text-muted-foreground">
                {t(`objetivos:phases.type.${phase.phase_type}`)}
              </span>
            )}
          </div>
          <ChevronRight className="size-4 shrink-0 text-text-dim" />
        </Link>

        <Card className="overflow-hidden p-0">
          {ROWS.map((row, i) => (
            <Link
              key={row.key}
              to={row.route}
              className={cn(
                'flex min-h-[50px] items-center gap-[11px] px-[13px] py-2.5',
                i > 0 && 'border-t',
              )}
            >
              <div className={cn('grid size-[30px] shrink-0 place-items-center rounded-[9px]', row.chip)}>
                <row.icon className="size-4" />
              </div>
              <span className="flex-1 text-[13px] font-medium">{t(row.key)}</span>
              <ChevronRight className="size-[15px] text-text-dim" />
            </Link>
          ))}
        </Card>
      </div>
    </PageShell>
  );
}
```

(If the vendored `Card` forces padding, use a plain `div` with the `.surface`-equivalent classes `rounded-[14px] border bg-card shadow-card` — match whatever Task 6/PR-2 card anatomy uses.)

- [ ] **Step 4: Register the route**

In `src/app/router.tsx`, inside the AppLayout children (next to `/settings`):

```tsx
{ path: 'more', element: <MorePage /> },
```

with the static import `import { MorePage } from '@/pages/MorePage';` following the file's existing import style. If `router.test.tsx` enumerates routes, add `/more` there.

- [ ] **Step 5: Run tests + commit**

Run: `pnpm lint && pnpm vitest run src/pages/MorePage.test.tsx src/app/router.test.tsx`
Expected: PASS.

```bash
git add src/pages/MorePage.tsx src/pages/MorePage.test.tsx src/app/router.tsx src/i18n
git commit -m "feat(shell): /more hub with profile card and content rows"
```

---

### Task 8: Flip AppLayout + migrate root screens to PageShell

**Files:**
- Modify: `src/components/layout/AppLayout.tsx`
- Modify: `src/components/layout/AppLayout.test.tsx`
- Modify: `src/pages/DiarioPage.tsx`, `src/pages/PlanificadorPage.tsx`, `src/pages/RecetasPage.tsx`, `src/pages/ProgresoPage.tsx`, `src/pages/EntrenamientoPage.tsx`, `src/pages/RoutinePage.tsx`, `src/pages/ExercisesPage.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/MorePage.tsx` is already done (Task 7)

**Interfaces:**
- Consumes: `PageShell` (Task 5).
- Produces: AppLayout without the h-14 mobile header and without the `.container` wrapper — pages own their frame from here on. **Until Task 9 lands, sub-screens render their old inline headers without outer padding — accepted intermediate state within this PR.**

- [ ] **Step 1: Update AppLayout tests**

In `AppLayout.test.tsx`: remove assertions about SectionSwitcher/AvatarMenu in the mobile header; keep (unchanged) the assertions that the section class lands on `document.documentElement`, that the sidebar + bottom nav render, and that the outlet renders.

- [ ] **Step 2: Rewrite AppLayout.tsx**

```tsx
import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { BottomNav } from './BottomNav';
import { useActiveSection } from './useActiveSection';

export function AppLayout() {
  const section = useActiveSection();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('section-nutri', 'section-gym');
    root.classList.add(section === 'gym' ? 'section-gym' : 'section-nutri');
  }, [section]);

  return (
    <div className="flex min-h-dvh">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 pb-20 md:pb-0">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Migrate the 8 root pages**

Recipe per page: delete the inline heading block (`<h1 …>` + subtitle wrapper) and any outermost spacing div it anchored, wrap the page content in `PageShell`, moving the page's primary header action (if any) into `actions`. The transformation, shown on the general shape:

```tsx
// BEFORE (typical shape)
return (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      <Button onClick={onNew}>{t('new')}</Button>
    </div>
    {content}
  </div>
);

// AFTER
return (
  <PageShell title={t('title')} actions={<Button onClick={onNew}>{t('new')}</Button>}>
    <div className="space-y-6">{content}</div>
  </PageShell>
);
```

Per-page props (titles use each page's existing i18n title key — do not invent new keys; read each page for the exact key and existing actions):

| Page | `title` (existing key) | `subtitle` | `actions` |
|---|---|---|---|
| `DiarioPage` | its current h1 key (diario ns) | its current date subtitle if it renders one | its current header actions (e.g. date nav stays in-body if it isn't a simple button cluster) |
| `PlanificadorPage` | current | — | current header buttons |
| `RecetasPage` | current | — | "Nueva receta" button if in header |
| `ProgresoPage` | current | — | current |
| `EntrenamientoPage` | current | — | current |
| `RoutinePage` | current | — | current |
| `ExercisesPage` | current | — | current |
| `SettingsPage` | current (`settings` ns) | — | — (also: `back="/more"` — Ajustes is reached from the Más hub on mobile) |

Rules:
- Keep every page's *content* markup untouched apart from unwrapping the old header — this task is chrome-only; screen restyles come in later waves.
- If a page renders tabs directly under its title (`RecipesTabs`, `ProgressTabs`), the tabs stay in the body (first child inside `PageShell`).
- If a page's header block is complex (e.g. Diario's date navigation), keep that block as the first element of the body rather than forcing it into `actions` — chrome-only, judgement per page, no functional change.
- Update any page tests that asserted the old h1 classes; assertions on the accessible heading name must keep passing (PageShell renders the title as headings).

- [ ] **Step 4: Run the affected tests**

Run: `pnpm vitest run src/components/layout/ src/pages/`
Expected: PASS (fix any heading-count assumptions — title now appears twice, in mobile + desktop headers; prefer `getAllByRole('heading', …)` or scope queries).

- [ ] **Step 5: Full gate + commit**

Run: `pnpm lint && pnpm build && pnpm test`
Expected: all green.

```bash
git add -A src/
git commit -m "feat(shell): new AppLayout frame; root screens adopt PageShell"
```

---

### Task 9: Migrate sub-screens to BackHeader (via PageShell `back`)

**Files (all Modify):**
- Nutri: `src/pages/RecetaEditorPage.tsx` (routes `/recipes/new`, `/recipes/:id`), `src/pages/IngredientesPage.tsx` (`/recipes/ingredients`), `src/pages/PlantillasPage.tsx` (`/templates`), `src/pages/PlantillaEditorPage.tsx` (`/templates/new`, `/templates/:id`)
- Gym (chrome swap only — no restyle, R-34 owns these screens): `src/pages/SessionEditorPage.tsx`, `src/pages/ExerciseHistoryPage.tsx`, `src/pages/RoutineEditorPage.tsx`, `src/pages/ProgramEditorPage.tsx`, `src/pages/ExerciseDetailPage.tsx`
- Shared: `src/pages/ObjetivosPage.tsx` (`/progress/goals`), `src/pages/settings/SettingsProfilePage.tsx`, `src/pages/settings/SettingsBiometricsPage.tsx`, `src/pages/settings/SettingsAccountPage.tsx`
- Excluded: `src/pages/RunnerPage.tsx` (immersive chrome stays as-is)

**Interfaces:**
- Consumes: `PageShell` with `back` (Task 5).

- [ ] **Step 1: Migrate each page**

Same recipe as Task 8 but with `back`:

```tsx
// settings sub-page example (replaces SettingsSubpageHeader)
return (
  <PageShell title={t('profile.title')} back="/settings">
    {content}
  </PageShell>
);
```

Back targets:

| Page | `back` |
|---|---|
| RecetaEditorPage | `"/recipes"` |
| IngredientesPage | `"/recipes"` |
| PlantillasPage | `true` (reached from Planner and /more — history back) |
| PlantillaEditorPage | `"/templates"` |
| SessionEditorPage | `"/training"` |
| ExerciseHistoryPage | `"/training"` |
| RoutineEditorPage | `"/routine"` |
| ProgramEditorPage | `"/routine"` |
| ExerciseDetailPage | `true` (it already does history-back with fallback — keep its existing fallback logic if it has one, else plain `true`) |
| ObjetivosPage | `"/progress"` |
| Settings\* pages | `"/settings"` |

Rules:
- Remove each page's ad-hoc back link (`<Link…><ArrowLeft/>` blocks, `SettingsSubpageHeader` usages) along with the old h1. Do **not** remove in-form Cancel buttons — those are form semantics, not chrome.
- Primary save/submit actions stay where they are (in-form); only move a button into `actions` when it already lived in the old header row.
- Update the touched pages' tests (settings pages have tests asserting the old header); `SettingsSubpageHeader` itself is deleted in Task 10.

- [ ] **Step 2: Run tests**

Run: `pnpm vitest run src/pages/`
Expected: PASS.

- [ ] **Step 3: Full gate + commit**

Run: `pnpm lint && pnpm build && pnpm test`

```bash
git add -A src/
git commit -m "feat(shell): sub-screens adopt BackHeader page frame"
```

---

### Task 10: Remove SectionSwitcher, AvatarMenu, SettingsSubpageHeader

**Files:**
- Delete: `src/components/layout/SectionSwitcher.tsx`, `src/components/layout/SectionSwitcher.test.tsx`
- Delete: `src/components/layout/AvatarMenu.tsx`, `src/components/layout/AvatarMenu.test.tsx`
- Delete: `src/components/layout/SettingsSubpageHeader.tsx`, `src/components/layout/SettingsSubpageHeader.test.tsx`

**Interfaces:** none (pure removal; their functions moved to MobileTopBar/`/more`/sidebar footer; sign-out lives in Ajustes → Cuenta).

- [ ] **Step 1: Verify nothing references them**

Run: `git grep -n 'SectionSwitcher\|AvatarMenu\|SettingsSubpageHeader' -- src`
Expected: only the six files being deleted. If anything else shows up, fix that reference first (it is a missed migration from Tasks 8/9).

- [ ] **Step 2: Delete + verify**

```bash
git rm src/components/layout/SectionSwitcher.tsx src/components/layout/SectionSwitcher.test.tsx \
       src/components/layout/AvatarMenu.tsx src/components/layout/AvatarMenu.test.tsx \
       src/components/layout/SettingsSubpageHeader.tsx src/components/layout/SettingsSubpageHeader.test.tsx
```

Run: `pnpm lint && pnpm build && pnpm test`
Expected: all green. Also run the color gates:

`git grep -nE '#[0-9a-fA-F]{3,8}\b' -- 'src/**/*.tsx'` → no new hits;
`git grep -nE 'oklch\(' -- 'src/**/*.tsx'` → no new hits.

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor(shell): remove SectionSwitcher, AvatarMenu and SettingsSubpageHeader"
```

---

### Task 11: Docs — divergence markers, decision record

**Files:**
- Modify: `docs/architecture.md` (§ shell / theme model sections), `docs/conventions.md` (§UI, §Theme)
- Modify: `docs/decisions.md`
- This plan file is committed with the branch (`docs/superpowers/plans/2026-07-07-r33-wave0-shell-nav.md`).

- [ ] **Step 1: Divergence markers**

At the top of the shell/navigation and UI/theme sections of `docs/architecture.md` and `docs/conventions.md`, add (if PR-2 didn't already):

```markdown
> ⚠ Changing — see R-33 (UI redesign in progress; reconciled at release doc-audit)
```

Do not rewrite the section bodies — reconcile happens at release per `operations.md`.

- [ ] **Step 2: Decision record**

Append to `docs/decisions.md` following its existing ID format (next free `D-F` id after D-F15):

```markdown
### D-F16 — Navigation IA: two section apps with root-screen switch
R-33 wave 0. Mobile navigation is two per-section apps (nutri: Diario ·
Planificador · Recetas · Progreso · Más; gym: Hoy · Rutinas · Ejercicios ·
Progreso) instead of the canvas's unified 5-tab bar. Cross-section travel is
an icon-button in the MobileTopBar on every root screen (dumbbell ↔ leaf).
`/more` hosts Ingredientes / Plantillas / Objetivos / Ajustes on mobile.
Desktop: one collapsible sidebar (groups Nutrición / Entrenamiento / Análisis)
— no switch needed. Rationale: slot scarcity (both Planificador and Recetas
fit), strict accent discipline per bar, owner's preferred mental model; spec
§4. Also locked here: bottom-nav anatomy follows the Convenciones §08 spec
(19px icons / 9.5px labels / active `--accent-ink`), and `/templates` is
nutri-owned in `sectionOf`.
```

(Verify D-F15 is the last ID; renumber if not.)

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs: mark shell/UI docs divergent for R-33; record D-F16 navigation IA"
```

---

### Task 12: Visual pass (main session, not a subagent)

- [ ] Run the app from the worktree (`pnpm dev`) and drive it with the agent-browser harness + seeded QA user (`qa-bot@hudsonsfitness.app`).
- [ ] Screenshot at 390px and ≥1280px, light + dark: `/diary` (root topbar + switch + nutri bottom bar), `/training` (gym bar + switch back), `/more` (hub), `/settings/profile` (BackHeader), sidebar expanded/collapsed (tooltips), a `/templates` sub-screen.
- [ ] Compare against the canvas artboards (`shell.jsx`, `mobile.jsx`, `ajustes-mobile.jsx`); fix drift before the PR.
- [ ] `pnpm lint && pnpm build && pnpm test` one final time from the worktree; `git status` clean.
- [ ] Push and open the PR to `develop` (squash auto-merge on green CI, per ship flow).

## Self-review notes

- Spec §4.1 coverage: MobileTopBar ✓ (T4), switch on every root ✓ (T4+T8 via PageShell), BackHeader ✓ (T4+T9), two bottom navs ✓ (T2+T3), `/more` ✓ (T7), SectionSwitcher/AvatarMenu removal ✓ (T10), shared-route mechanism preserved ✓ (T2 keeps `sectionOf` null + stored fallback untouched in `useActiveSection`).
- Spec §4.2: sidebar ✓ (T6), PageHeaderV2 + 1280 cap ✓ (T5, token in T1).
- Spec §8: docs markers + D-id ✓ (T11); roadmap R-33 entry already converged in #178 — nothing to do.
- Deliberate scope note: `theme-color` stays static green (out of scope, noted in spec §3.4 as done in PR-2).
