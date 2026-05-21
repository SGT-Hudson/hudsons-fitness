# App Shell & Section Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat 9-item top nav with a section-aware responsive shell — bottom nav + section switcher on mobile, grouped sidebar on desktop — split into Nutrición / Entreno / shared, with English route slugs.

**Architecture:** A single `nav-config.ts` data module is the source of truth; both shells (`AppSidebar` for ≥md, `BottomNav` + mobile header for <md) render from it. Section is derived from the route (`useActiveSection`), with a `localStorage` fallback for shared routes. Two demoted screens (Goals, Ingredients) become sub-route tabs of their parents; Templates becomes an in-Planner link. Frontend-only — no schema/RLS/RPC changes.

**Tech Stack:** React 18 + react-router-dom 6, TypeScript, Tailwind 3, Radix primitives (classic shadcn), lucide-react, i18next, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-21-section-nav-shell-design.md`

**Two deliberate deviations from the spec (codebase reality):**
1. The sidebar is **bespoke** (Tailwind + existing primitives), not shadcn's Base-UI `sidebar` — the repo is Radix-classic with no Base UI, and mobile uses the bottom nav (not the sidebar's sheet), so the heavy sidebar machinery isn't needed. The bespoke component reproduces the approved mock.
2. `nav-config.ts` carries **no `built` flag** — the "En progreso" placeholder is purely a router mapping (`/routine` & `/exercises` render `EnProgresoPage`). Shipping a real page later is a one-line router element swap.

---

## File Structure

**Create:**
- `src/components/layout/nav-config.ts` — sections, items, derivation helpers (pure).
- `src/components/layout/nav-config.test.ts` — Tier-1 unit tests.
- `src/hooks/use-media-query.ts` — viewport-width hook.
- `src/hooks/use-media-query.test.tsx` — Tier-2.
- `src/components/layout/useActiveSection.ts` — route→section + localStorage.
- `src/components/layout/useActiveSection.test.tsx` — Tier-2.
- `src/components/ui/dropdown-menu.tsx` — Radix dropdown wrapper (switcher + avatar menu).
- `src/components/layout/AvatarMenu.tsx` (+ `.test.tsx`).
- `src/components/layout/SectionSwitcher.tsx` (+ `.test.tsx`).
- `src/components/layout/BottomNav.tsx` (+ `.test.tsx`).
- `src/components/layout/AppSidebar.tsx` (+ `.test.tsx`).
- `src/pages/HomePage.tsx` (+ `.test.tsx`).
- `src/pages/EnProgresoPage.tsx` (+ `.test.tsx`).

**Modify:**
- `src/index.css` — add `--nutricion` / `--entreno` tokens (`:root` + `.dark`).
- `tailwind.config.js` — expose the new colours.
- `src/i18n/es/nav.json`, `src/i18n/en/nav.json` — new key set.
- `src/components/layout/AppLayout.tsx` — responsive composer.
- `src/app/router.tsx` — English slugs, new routes, sub-routes, `/home` index.
- `src/pages/ProgresoPage.tsx` + `src/pages/ObjetivosPage.tsx` — Goals → `/progress/goals` tab.
- `src/pages/RecetasPage.tsx` + `src/pages/IngredientesPage.tsx` — Ingredients → `/recipes/ingredients` tab.
- `src/pages/PlanificadorPage.tsx` — "Manage templates" link.
- Any `Link`/`navigate` references to old slugs across `src/` (Task 18 sweep).

---

## Task 1: `useMediaQuery` hook

**Files:**
- Create: `src/hooks/use-media-query.ts`
- Test: `src/hooks/use-media-query.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMediaQuery } from './use-media-query';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('useMediaQuery', () => {
  it('returns true when the query matches', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('returns false when the query does not match', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/hooks/use-media-query.test.tsx`
Expected: FAIL — `useMediaQuery` not exported / module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/hooks/use-media-query.ts
import { useEffect, useState } from 'react';

/** Reactive viewport-width match. The app keys its shell off width, not UA. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/hooks/use-media-query.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-media-query.ts src/hooks/use-media-query.test.tsx
git commit -m "feat(nav): add useMediaQuery hook for width-based shell"
```

---

## Task 2: `nav-config.ts` — single source of truth

**Files:**
- Create: `src/components/layout/nav-config.ts`
- Test: `src/components/layout/nav-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  NAV_ITEMS,
  sectionOf,
  bottomNavItems,
  sidebarGroups,
} from './nav-config';

describe('nav-config', () => {
  it('every item has a route and an i18n key', () => {
    for (const item of NAV_ITEMS) {
      expect(item.route.startsWith('/')).toBe(true);
      expect(item.key.length).toBeGreaterThan(0);
    }
  });

  it('sectionOf maps section-owned routes to their section', () => {
    expect(sectionOf('/diary')).toBe('nutricion');
    expect(sectionOf('/diary/2026-05-21')).toBe('nutricion');
    expect(sectionOf('/recipes/ingredients')).toBe('nutricion');
    expect(sectionOf('/training')).toBe('entreno');
    expect(sectionOf('/routine')).toBe('entreno');
  });

  it('sectionOf returns null for shared routes', () => {
    expect(sectionOf('/home')).toBeNull();
    expect(sectionOf('/progress')).toBeNull();
    expect(sectionOf('/progress/goals')).toBeNull();
    expect(sectionOf('/settings')).toBeNull();
  });

  it('bottom nav shows the section tabs plus shared Progreso, never Home', () => {
    const nut = bottomNavItems('nutricion').map((i) => i.key);
    expect(nut).toEqual(['diary', 'planner', 'recipes', 'progress']);
    const ent = bottomNavItems('entreno').map((i) => i.key);
    expect(ent).toEqual(['today', 'routine', 'exercises', 'progress']);
    expect(nut).not.toContain('home');
  });

  it('sidebar groups render shared, then nutricion, then entreno', () => {
    expect(sidebarGroups().map((g) => g.group)).toEqual([
      'shared',
      'nutricion',
      'entreno',
    ]);
    const shared = sidebarGroups()[0].items.map((i) => i.key);
    expect(shared).toEqual(['home', 'progress']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/components/layout/nav-config.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/layout/nav-config.ts
import {
  Activity,
  BookOpen,
  CalendarDays,
  Dumbbell,
  Home,
  LineChart,
  NotebookText,
  Repeat,
  type LucideIcon,
} from 'lucide-react';

export type Section = 'nutricion' | 'entreno';
export type NavGroup = 'shared' | Section;

export interface NavItem {
  /** i18n key in the `nav` namespace. */
  key: string;
  /** Route the item navigates to. */
  route: string;
  group: NavGroup;
  icon: LucideIcon;
  /** Appears in the mobile bottom nav. */
  mobile: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'home', route: '/home', group: 'shared', icon: Home, mobile: false },
  { key: 'progress', route: '/progress', group: 'shared', icon: LineChart, mobile: true },
  { key: 'diary', route: '/diary', group: 'nutricion', icon: NotebookText, mobile: true },
  { key: 'planner', route: '/planner', group: 'nutricion', icon: CalendarDays, mobile: true },
  { key: 'recipes', route: '/recipes', group: 'nutricion', icon: BookOpen, mobile: true },
  { key: 'today', route: '/training', group: 'entreno', icon: Activity, mobile: true },
  { key: 'routine', route: '/routine', group: 'entreno', icon: Repeat, mobile: true },
  { key: 'exercises', route: '/exercises', group: 'entreno', icon: Dumbbell, mobile: true },
];

/** Section that owns a pathname, or null for shared/unknown routes. */
export function sectionOf(pathname: string): Section | null {
  const owned = NAV_ITEMS.filter((i) => i.group !== 'shared')
    // longest route first so `/recipes/ingredients` wins over `/recipes`
    .sort((a, b) => b.route.length - a.route.length)
    .find((i) => pathname === i.route || pathname.startsWith(`${i.route}/`));
  return owned ? (owned.group as Section) : null;
}

/** Bottom-nav items for a section: its own mobile items + shared Progreso. */
export function bottomNavItems(section: Section): NavItem[] {
  const own = NAV_ITEMS.filter((i) => i.mobile && i.group === section);
  const progress = NAV_ITEMS.find((i) => i.key === 'progress')!;
  return [...own, progress];
}

export interface SidebarGroup {
  group: NavGroup;
  items: NavItem[];
}

/** Sidebar groups in render order: shared → nutricion → entreno. */
export function sidebarGroups(): SidebarGroup[] {
  const order: NavGroup[] = ['shared', 'nutricion', 'entreno'];
  return order.map((group) => ({
    group,
    items: NAV_ITEMS.filter((i) => i.group === group),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/components/layout/nav-config.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/nav-config.ts src/components/layout/nav-config.test.ts
git commit -m "feat(nav): nav-config single source of truth + derivation helpers"
```

---

## Task 3: `useActiveSection` hook

**Files:**
- Create: `src/components/layout/useActiveSection.ts`
- Test: `src/components/layout/useActiveSection.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useActiveSection } from './useActiveSection';

const wrapper = (path: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
  };

beforeEach(() => localStorage.clear());

describe('useActiveSection', () => {
  it('derives the section from a section-owned route', () => {
    const { result } = renderHook(() => useActiveSection(), { wrapper: wrapper('/training') });
    expect(result.current).toBe('entreno');
  });

  it('persists the section so shared routes can recall it', () => {
    renderHook(() => useActiveSection(), { wrapper: wrapper('/training') });
    expect(localStorage.getItem('hf-section')).toBe('entreno');
    const { result } = renderHook(() => useActiveSection(), { wrapper: wrapper('/progress') });
    expect(result.current).toBe('entreno');
  });

  it('defaults shared routes to nutricion when nothing is stored', () => {
    const { result } = renderHook(() => useActiveSection(), { wrapper: wrapper('/progress') });
    expect(result.current).toBe('nutricion');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/components/layout/useActiveSection.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/layout/useActiveSection.ts
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { sectionOf, type Section } from './nav-config';

const STORAGE_KEY = 'hf-section';

/**
 * The section the mobile shell should present. Section-owned routes resolve
 * directly (and are remembered); shared routes (`/home`, `/progress`,
 * `/settings`) fall back to the last remembered section (default nutricion).
 */
export function useActiveSection(): Section {
  const { pathname } = useLocation();
  const routeSection = sectionOf(pathname);

  useEffect(() => {
    if (routeSection) localStorage.setItem(STORAGE_KEY, routeSection);
  }, [routeSection]);

  if (routeSection) return routeSection;
  return localStorage.getItem(STORAGE_KEY) === 'entreno' ? 'entreno' : 'nutricion';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/components/layout/useActiveSection.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/useActiveSection.ts src/components/layout/useActiveSection.test.tsx
git commit -m "feat(nav): useActiveSection (route-derived + localStorage fallback)"
```

---

## Task 4: Section colour tokens

**Files:**
- Modify: `src/index.css` (`:root` block after `--ring`, and `.dark` block)
- Modify: `tailwind.config.js`

- [ ] **Step 1: Add tokens to `src/index.css`**

In the `:root` block, after the `--ring: …;` line, add:

```css
    --nutricion: 142.1 76.2% 36.3%;
    --nutricion-foreground: 0 0% 100%;
    --entreno: 0 72.2% 50.6%;
    --entreno-foreground: 0 0% 100%;
```

In the `.dark` block, after its `--ring: …;` line, add:

```css
    --nutricion: 142.1 70.6% 45.3%;
    --nutricion-foreground: 144.9 80.4% 10%;
    --entreno: 0 72.2% 58%;
    --entreno-foreground: 0 0% 100%;
```

- [ ] **Step 2: Expose them in `tailwind.config.js`**

Inside `theme.extend.colors`, add (alongside the existing colour entries):

```js
        nutricion: {
          DEFAULT: 'hsl(var(--nutricion))',
          foreground: 'hsl(var(--nutricion-foreground))',
        },
        entreno: {
          DEFAULT: 'hsl(var(--entreno))',
          foreground: 'hsl(var(--entreno-foreground))',
        },
```

- [ ] **Step 3: Verify build picks up the tokens**

Run: `pnpm build`
Expected: build succeeds (Tailwind compiles `bg-nutricion`, `text-entreno`, etc.).

- [ ] **Step 4: Commit**

```bash
git add src/index.css tailwind.config.js
git commit -m "feat(nav): section colour tokens (nutricion/entreno, light+dark)"
```

---

## Task 5: Rewrite the `nav` i18n namespace

**Files:**
- Modify: `src/i18n/es/nav.json`
- Modify: `src/i18n/en/nav.json`

- [ ] **Step 1: Replace `src/i18n/es/nav.json`**

```json
{
  "home": "Inicio",
  "diary": "Diario",
  "planner": "Planificador",
  "recipes": "Recetas",
  "progress": "Progreso",
  "today": "Hoy",
  "routine": "Rutina",
  "exercises": "Ejercicios",
  "section": {
    "nutricion": "Nutrición",
    "entreno": "Entreno"
  },
  "switchSection": "Cambiar de sección",
  "account": "Cuenta",
  "inProgress": {
    "title": "En progreso",
    "body": "Esta sección estará disponible próximamente."
  }
}
```

- [ ] **Step 2: Replace `src/i18n/en/nav.json`**

```json
{
  "home": "Home",
  "diary": "Diary",
  "planner": "Planner",
  "recipes": "Recipes",
  "progress": "Progress",
  "today": "Today",
  "routine": "Routine",
  "exercises": "Exercises",
  "section": {
    "nutricion": "Nutrition",
    "entreno": "Training"
  },
  "switchSection": "Switch section",
  "account": "Account",
  "inProgress": {
    "title": "In progress",
    "body": "This section is coming soon."
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/es/nav.json src/i18n/en/nav.json
git commit -m "feat(nav): rewrite nav i18n namespace for sectioned shell (es+en)"
```

---

## Task 6: `dropdown-menu` UI primitive

**Files:**
- Create: `src/components/ui/dropdown-menu.tsx`

The avatar menu and section switcher both need a dropdown. `@radix-ui/react-dropdown-menu` is already a dependency; add the standard shadcn wrapper (matches the repo's `select.tsx`/`dialog.tsx` style).

- [ ] **Step 1: Create the wrapper**

```tsx
// src/components/ui/dropdown-menu.tsx
import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[10rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn('px-2 py-1.5 text-sm font-semibold', className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-muted', className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Check as DropdownMenuCheck,
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/dropdown-menu.tsx
git commit -m "feat(ui): add Radix dropdown-menu wrapper"
```

---

## Task 7: `AvatarMenu` component

**Files:**
- Create: `src/components/layout/AvatarMenu.tsx`
- Test: `src/components/layout/AvatarMenu.test.tsx`

Reused in the sidebar footer and the mobile header. Holds Ajustes (link to `/settings`) and Salir (sign out). Uses `useAuth().signOut`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { AvatarMenu } from './AvatarMenu';

const signOut = vi.fn();
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut, user: { email: 'qa@x.dev' } }),
}));

beforeEach(async () => {
  signOut.mockReset();
  await i18n.changeLanguage('es');
});

describe('AvatarMenu', () => {
  it('opens and exposes Ajustes + Salir', async () => {
    render(
      <MemoryRouter>
        <AvatarMenu />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: i18n.t('nav:account') }));
    expect(screen.getByText(i18n.t('nav:settings', 'Ajustes'))).toBeInTheDocument();
    await userEvent.click(screen.getByText(i18n.t('auth:signOut')));
    expect(signOut).toHaveBeenCalledOnce();
  });
});
```

> Note: `nav:settings` is read via the existing `settings` label — keep a `settings` key in `nav.json`. Add `"settings": "Ajustes"` (es) / `"settings": "Settings"` (en) to the Task 5 files if not already present, and re-run Task 5's commit amend or include here.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/components/layout/AvatarMenu.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Add the missing `settings` nav key**

Add `"settings": "Ajustes"` to `src/i18n/es/nav.json` and `"settings": "Settings"` to `src/i18n/en/nav.json`.

- [ ] **Step 4: Write the implementation**

```tsx
// src/components/layout/AvatarMenu.tsx
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, Settings, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/features/auth/AuthProvider';

export function AvatarMenu() {
  const { t } = useTranslation('nav');
  const { t: tAuth } = useTranslation('auth');
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('account')}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
      >
        <User className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {user?.email && (
          <>
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
              {user.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <Settings className="h-4 w-4" />
          {t('settings')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut className="h-4 w-4" />
          {tAuth('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- src/components/layout/AvatarMenu.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/AvatarMenu.tsx src/components/layout/AvatarMenu.test.tsx src/i18n/es/nav.json src/i18n/en/nav.json
git commit -m "feat(nav): AvatarMenu (Ajustes + Salir)"
```

---

## Task 8: `SectionSwitcher` component (mobile header)

**Files:**
- Create: `src/components/layout/SectionSwitcher.tsx`
- Test: `src/components/layout/SectionSwitcher.test.tsx`

Dropdown on the section title; lists both sections with a check on the current; selecting navigates to that section's first bottom-nav route.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import i18n from '@/i18n';
import { SectionSwitcher } from './SectionSwitcher';

function LocationProbe() {
  return <span data-testid="loc">{useLocation().pathname}</span>;
}

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('es');
});

describe('SectionSwitcher', () => {
  it('shows the active section and switches to the other on select', async () => {
    render(
      <MemoryRouter initialEntries={['/diary']}>
        <SectionSwitcher />
        <LocationProbe />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /Nutrición/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Nutrición/ }));
    await userEvent.click(screen.getByText('Entreno'));
    expect(screen.getByTestId('loc').textContent).toBe('/training');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/components/layout/SectionSwitcher.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/layout/SectionSwitcher.tsx
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { bottomNavItems, type Section } from './nav-config';
import { useActiveSection } from './useActiveSection';

const SECTIONS: Section[] = ['nutricion', 'entreno'];
const DOT: Record<Section, string> = { nutricion: 'bg-nutricion', entreno: 'bg-entreno' };
const TEXT: Record<Section, string> = { nutricion: 'text-nutricion', entreno: 'text-entreno' };

export function SectionSwitcher() {
  const { t } = useTranslation('nav');
  const navigate = useNavigate();
  const active = useActiveSection();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn('flex items-center gap-2 font-bold', TEXT[active])}
      >
        <span className={cn('h-3.5 w-3.5 rounded', DOT[active])} />
        {t(`section.${active}`)}
        <ChevronDown className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {SECTIONS.map((s) => (
          <DropdownMenuItem
            key={s}
            onSelect={() => navigate(bottomNavItems(s)[0].route)}
          >
            <span className={cn('h-3 w-3 rounded', DOT[s])} />
            {t(`section.${s}`)}
            {s === active && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/components/layout/SectionSwitcher.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/SectionSwitcher.tsx src/components/layout/SectionSwitcher.test.tsx
git commit -m "feat(nav): SectionSwitcher mobile header dropdown"
```

---

## Task 9: `BottomNav` component (mobile)

**Files:**
- Create: `src/components/layout/BottomNav.tsx`
- Test: `src/components/layout/BottomNav.test.tsx`

Renders the active section's tabs (`bottomNavItems`). Active tab tinted to its section colour.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { BottomNav } from './BottomNav';

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('es');
});

describe('BottomNav', () => {
  it('shows the four Nutrición tabs on a nutrición route', () => {
    render(
      <MemoryRouter initialEntries={['/diary']}>
        <BottomNav />
      </MemoryRouter>,
    );
    for (const label of ['Diario', 'Planificador', 'Recetas', 'Progreso']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'Inicio' })).toBeNull();
  });

  it('shows the Entreno tabs on a training route', () => {
    render(
      <MemoryRouter initialEntries={['/training']}>
        <BottomNav />
      </MemoryRouter>,
    );
    for (const label of ['Hoy', 'Rutina', 'Ejercicios', 'Progreso']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/components/layout/BottomNav.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/layout/BottomNav.tsx
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { bottomNavItems, type Section } from './nav-config';
import { useActiveSection } from './useActiveSection';

const ACTIVE: Record<Section, string> = {
  nutricion: 'text-nutricion',
  entreno: 'text-entreno',
};

export function BottomNav() {
  const { t } = useTranslation('nav');
  const section = useActiveSection();
  const items = bottomNavItems(section);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t bg-background md:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.key}
            to={item.route}
            end={item.route === '/progress'}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium',
                isActive ? ACTIVE[section] : 'text-muted-foreground',
              )
            }
          >
            <Icon className="h-5 w-5" />
            {t(item.key)}
          </NavLink>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/components/layout/BottomNav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/BottomNav.tsx src/components/layout/BottomNav.test.tsx
git commit -m "feat(nav): BottomNav mobile bar (per active section)"
```

---

## Task 10: `AppSidebar` component (desktop)

**Files:**
- Create: `src/components/layout/AppSidebar.tsx`
- Test: `src/components/layout/AppSidebar.test.tsx`

Bespoke grouped sidebar from `sidebarGroups()`. Group labels for nutrición/entreno; shared group has no label. Active item left-accent tinted to its group. Footer = `AvatarMenu` + email.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { AppSidebar } from './AppSidebar';

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: vi.fn(), user: { email: 'qa@x.dev' } }),
}));

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('AppSidebar', () => {
  it('renders Home + Progreso and both section groups with their items', () => {
    render(
      <MemoryRouter initialEntries={['/home']}>
        <AppSidebar />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Progreso' })).toBeInTheDocument();
    expect(screen.getByText('Nutrición')).toBeInTheDocument();
    expect(screen.getByText('Entreno')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Diario' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hoy' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/components/layout/AppSidebar.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/layout/AppSidebar.tsx
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/AuthProvider';
import { AvatarMenu } from './AvatarMenu';
import { sidebarGroups, type NavGroup } from './nav-config';

const ACTIVE: Record<NavGroup, string> = {
  shared: 'bg-accent text-foreground before:bg-foreground',
  nutricion: 'bg-nutricion/10 text-nutricion before:bg-nutricion',
  entreno: 'bg-entreno/10 text-entreno before:bg-entreno',
};

export function AppSidebar() {
  const { t } = useTranslation('nav');
  const { t: tCommon } = useTranslation('common');
  const { user } = useAuth();
  const groups = sidebarGroups();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">
      <div className="flex items-center gap-2 px-4 py-4 font-bold">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background">
          H
        </span>
        {tCommon('appName')}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
        {groups.map(({ group, items }) => (
          <div key={group} className="space-y-1">
            {group !== 'shared' && (
              <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {t(`section.${group}`)}
              </p>
            )}
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.key}
                  to={item.route}
                  end={item.route === '/home' || item.route === '/progress'}
                  className={({ isActive }) =>
                    cn(
                      'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors',
                      'before:absolute before:-left-3 before:top-2 before:bottom-2 before:w-0.5 before:rounded-r',
                      isActive
                        ? ACTIVE[group]
                        : 'hover:bg-accent hover:text-foreground before:bg-transparent',
                    )
                  }
                >
                  <Icon className="h-[18px] w-[18px]" />
                  {t(item.key)}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-3 border-t px-3 py-3">
        <AvatarMenu />
        <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/components/layout/AppSidebar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/AppSidebar.tsx src/components/layout/AppSidebar.test.tsx
git commit -m "feat(nav): bespoke grouped desktop sidebar"
```

---

## Task 11: Responsive `AppLayout` composer

**Files:**
- Modify: `src/components/layout/AppLayout.tsx` (full rewrite)
- Test: `src/components/layout/AppLayout.test.tsx`

Renders `AppSidebar` + content at md+, and a mobile header (`SectionSwitcher` + `AvatarMenu`) + `BottomNav` below md. Both in markup; CSS shows the right one. Adds bottom padding on mobile so content clears the fixed bar.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18n from '@/i18n';
import { AppLayout } from './AppLayout';

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: vi.fn(), user: { email: 'qa@x.dev' } }),
}));

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('AppLayout', () => {
  it('renders both shells and the routed outlet content', () => {
    render(
      <MemoryRouter initialEntries={['/diary']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/diary" element={<div>diary-content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('diary-content')).toBeInTheDocument();
    // mobile switcher + sidebar both present in DOM (CSS toggles visibility)
    expect(screen.getByRole('button', { name: /Nutrición/ })).toBeInTheDocument();
    expect(screen.getByText('Entreno')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/components/layout/AppLayout.test.tsx`
Expected: FAIL — current `AppLayout` has no SectionSwitcher.

- [ ] **Step 3: Rewrite `AppLayout.tsx`**

```tsx
// src/components/layout/AppLayout.tsx
import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { BottomNav } from './BottomNav';
import { SectionSwitcher } from './SectionSwitcher';
import { AvatarMenu } from './AvatarMenu';

export function AppLayout() {
  return (
    <div className="flex min-h-dvh">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
          <SectionSwitcher />
          <AvatarMenu />
        </header>
        <main className="flex-1 pb-20 md:pb-0">
          <div className="container py-6">
            <Outlet />
          </div>
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/components/layout/AppLayout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/AppLayout.tsx src/components/layout/AppLayout.test.tsx
git commit -m "feat(nav): responsive AppLayout (sidebar md+ / bottom nav below)"
```

---

## Task 12: `EnProgresoPage` placeholder

**Files:**
- Create: `src/pages/EnProgresoPage.tsx`
- Test: `src/pages/EnProgresoPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '@/i18n';
import { EnProgresoPage } from './EnProgresoPage';

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('EnProgresoPage', () => {
  it('renders the in-progress title', () => {
    render(<EnProgresoPage />);
    expect(screen.getByText('En progreso')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/pages/EnProgresoPage.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```tsx
// src/pages/EnProgresoPage.tsx
import { useTranslation } from 'react-i18next';
import { Hammer } from 'lucide-react';

export function EnProgresoPage() {
  const { t } = useTranslation('nav');
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center text-muted-foreground">
      <Hammer className="h-10 w-10" />
      <h1 className="text-2xl font-bold text-foreground">{t('inProgress.title')}</h1>
      <p className="max-w-sm text-sm">{t('inProgress.body')}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/pages/EnProgresoPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/EnProgresoPage.tsx src/pages/EnProgresoPage.test.tsx
git commit -m "feat(nav): En progreso placeholder page"
```

---

## Task 13: `HomePage` (desktop dashboard placeholder + mobile redirect)

**Files:**
- Create: `src/pages/HomePage.tsx`
- Test: `src/pages/HomePage.test.tsx`

Desktop: a thin placeholder (rich dashboard = item 4). Mobile (<768px): redirect to `/diary`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18n from '@/i18n';
import { HomePage } from './HomePage';

function stubWidth(isDesktop: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: isDesktop, media: q,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(), onchange: null,
  }));
}

beforeEach(async () => { await i18n.changeLanguage('es'); });
afterEach(() => vi.unstubAllGlobals());

describe('HomePage', () => {
  it('renders the dashboard on desktop', () => {
    stubWidth(true);
    render(<MemoryRouter initialEntries={['/home']}><HomePage /></MemoryRouter>);
    expect(screen.getByText('Inicio')).toBeInTheDocument();
  });

  it('redirects to /diary on mobile', () => {
    stubWidth(false);
    render(
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route path="/home" element={<HomePage />} />
          <Route path="/diary" element={<div>diary</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('diary')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/pages/HomePage.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```tsx
// src/pages/HomePage.tsx
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '@/hooks/use-media-query';

export function HomePage() {
  const { t } = useTranslation('nav');
  const isDesktop = useMediaQuery('(min-width: 768px)');

  if (!isDesktop) return <Navigate to="/diary" replace />;

  // Placeholder — the unified Nutrición + Entreno dashboard is item 4.
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">{t('home')}</h1>
      <p className="text-muted-foreground">{t('inProgress.body')}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/pages/HomePage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/HomePage.tsx src/pages/HomePage.test.tsx
git commit -m "feat(nav): HomePage (desktop placeholder, mobile→/diary)"
```

---

## Task 14: Fold Goals into Progress (sub-route tab)

**Files:**
- Modify: `src/pages/ProgresoPage.tsx` (add a tab strip linking Resumen / Objetivos)
- Modify: `src/pages/ObjetivosPage.tsx` (keep export; it now renders only at `/progress/goals`)
- Test: `src/pages/ProgresoPage.test.tsx`

`/progress` renders `ProgresoPage`; `/progress/goals` renders `ObjetivosPage` (wired in Task 17). Both pages share a small tab strip so the user can move between them.

- [ ] **Step 1: Write the failing test (tab strip present + links to sub-route)**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { ProgressTabs } from './ProgressTabs';

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('ProgressTabs', () => {
  it('links to the overview and goals sub-routes', () => {
    render(<MemoryRouter initialEntries={['/progress']}><ProgressTabs /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Progreso' })).toHaveAttribute('href', '/progress');
    expect(screen.getByRole('link', { name: 'Objetivos' })).toHaveAttribute('href', '/progress/goals');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/pages/ProgressTabs.test.tsx`
Expected: FAIL — `ProgressTabs` missing.

- [ ] **Step 3: Create the shared tab strip `src/pages/ProgressTabs.tsx`**

```tsx
// src/pages/ProgressTabs.tsx
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export function ProgressTabs() {
  const { t } = useTranslation('nav');
  const { t: tObj } = useTranslation('objetivos');
  const tab = (active: boolean) =>
    cn('px-3 py-1.5 text-sm font-medium border-b-2',
      active ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground');
  return (
    <div className="flex gap-2 border-b">
      <NavLink to="/progress" end className={({ isActive }) => tab(isActive)}>
        {t('progress')}
      </NavLink>
      <NavLink to="/progress/goals" className={({ isActive }) => tab(isActive)}>
        {tObj('pageTitle')}
      </NavLink>
    </div>
  );
}
```

> `objetivos:pageTitle` = "Objetivos" (es) / "Goals" (en) — already exists.

- [ ] **Step 4: Render `ProgressTabs` at the top of both pages**

In `src/pages/ProgresoPage.tsx`, import it and replace the existing title block:

```tsx
import { ProgressTabs } from './ProgressTabs';
// ...
  return (
    <div className="space-y-6">
      <ProgressTabs />
      {/* existing cards/charts unchanged below */}
```
(Remove the old `<div className="flex items-center justify-between"><h1>…</h1></div>` title block — the tab strip replaces it.)

In `src/pages/ObjetivosPage.tsx`, import it and insert at the top of the returned tree, replacing the old `<h1>{t('pageTitle')}</h1>`:

```tsx
import { ProgressTabs } from './ProgressTabs';
// ...
  return (
    <div className="space-y-8">
      <ProgressTabs />
      {/* existing Goal + Phases sections unchanged below */}
```

- [ ] **Step 5: Run tests**

Run: `pnpm test -- src/pages/ProgressTabs.test.tsx`
Expected: PASS. Then `pnpm typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ProgressTabs.tsx src/pages/ProgressTabs.test.tsx src/pages/ProgresoPage.tsx src/pages/ObjetivosPage.tsx
git commit -m "feat(nav): fold Goals into Progress as /progress/goals tab"
```

---

## Task 15: Fold Ingredients into Recipes (sub-route tab)

**Files:**
- Create: `src/pages/RecipesTabs.tsx` (+ `.test.tsx`)
- Modify: `src/pages/RecetasPage.tsx`, `src/pages/IngredientesPage.tsx`

Mirror of Task 14. `/recipes` renders `RecetasPage`; `/recipes/ingredients` renders `IngredientesPage` (wired in Task 17).

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { RecipesTabs } from './RecipesTabs';

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('RecipesTabs', () => {
  it('links to recipes and ingredients sub-routes', () => {
    render(<MemoryRouter initialEntries={['/recipes']}><RecipesTabs /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Recetas' })).toHaveAttribute('href', '/recipes');
    expect(screen.getByRole('link', { name: 'Ingredientes' })).toHaveAttribute('href', '/recipes/ingredients');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/pages/RecipesTabs.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create `src/pages/RecipesTabs.tsx`**

```tsx
// src/pages/RecipesTabs.tsx
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export function RecipesTabs() {
  const { t } = useTranslation('nav');
  const tab = (active: boolean) =>
    cn('px-3 py-1.5 text-sm font-medium border-b-2',
      active ? 'border-nutricion text-nutricion' : 'border-transparent text-muted-foreground');
  return (
    <div className="flex gap-2 border-b">
      <NavLink to="/recipes" end className={({ isActive }) => tab(isActive)}>
        {t('recipes')}
      </NavLink>
      <NavLink to="/recipes/ingredients" className={({ isActive }) => tab(isActive)}>
        {t('ingredients', 'Ingredientes')}
      </NavLink>
    </div>
  );
}
```

- [ ] **Step 4: Add an `ingredients` key to nav.json**

Add `"ingredients": "Ingredientes"` (es) and `"ingredients": "Ingredients"` (en).

- [ ] **Step 5: Render `RecipesTabs` at the top of both pages**

In `src/pages/RecetasPage.tsx` and `src/pages/IngredientesPage.tsx`, import `RecipesTabs` and render it as the first child of the page's root container, removing each page's own `<h1>` title block.

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm test -- src/pages/RecipesTabs.test.tsx` → PASS; `pnpm typecheck` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/RecipesTabs.tsx src/pages/RecipesTabs.test.tsx src/pages/RecetasPage.tsx src/pages/IngredientesPage.tsx src/i18n/es/nav.json src/i18n/en/nav.json
git commit -m "feat(nav): fold Ingredients into Recipes as /recipes/ingredients tab"
```

---

## Task 16: "Manage templates" entry in Planner

**Files:**
- Modify: `src/pages/PlanificadorPage.tsx`

Templates leave the nav; add a link to the `/templates` list in the Planner header button row (next to the existing Apply/Save-as/Shopping buttons).

- [ ] **Step 1: Add the link**

In `src/pages/PlanificadorPage.tsx`, the header button group (`<div className="flex flex-wrap gap-2">`, ~line 73): add as the first child, and import `FileBox` (already imported) + `Link` (already imported):

```tsx
          <Button variant="outline" asChild>
            <Link to="/templates">
              <FileBox className="h-4 w-4" />
              {t('planner.manageTemplates')}
            </Link>
          </Button>
```

Also update the existing empty-state create link `to="/menus/nuevo"` → `to="/templates/new"`.

- [ ] **Step 2: Add the i18n key**

Add `"planner": { … , "manageTemplates": "Plantillas" }` to `src/i18n/es/planning.json` and `"manageTemplates": "Templates"` to `src/i18n/en/planning.json` (inside the existing `planner` object).

- [ ] **Step 3: Typecheck + build**

Run: `pnpm typecheck` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PlanificadorPage.tsx src/i18n/es/planning.json src/i18n/en/planning.json
git commit -m "feat(nav): add Manage templates link inside Planner"
```

---

## Task 17: Rewrite the router (English slugs + new routes)

**Files:**
- Modify: `src/app/router.tsx` (full rewrite of the authed route block)
- Test: `src/app/router.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '@/i18n';

// Stub the gates + page bodies so we test wiring, not data.
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u', email: 'q@x.dev' }, loading: false, signOut: vi.fn() }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/features/profile/hooks', () => ({ useProfile: () => ({ data: { onboarded_at: 'x' }, isLoading: false }) }));
vi.mock('@/features/profile/api', () => ({ isProfileOnboarded: () => true }));

beforeEach(async () => { await i18n.changeLanguage('es'); });

// Helper: render the app at a path via the same Routes tree.
// (Import AppRouter and wrap window.history — or extract a `routes` element.)
```

> Implementation note: extract the `<Routes>…</Routes>` body into an exported `AppRoutes` component so it can be mounted inside a `MemoryRouter` with `initialEntries`. The test renders `<MemoryRouter initialEntries={['/training']}><AppRoutes /></MemoryRouter>` and asserts the En-progreso placeholder shows for `/routine`, and that `/` lands on `/home` (desktop) — keep one assertion per route group. Mock heavy pages (`DiarioPage`, etc.) to `() => <div>page</div>` as needed to avoid Supabase calls.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/app/router.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Rewrite the authed routes in `src/app/router.tsx`**

Replace the `<Route element={<AppLayout />}>…</Route>` inner block with:

```tsx
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<HomePage />} />

            {/* Nutrición */}
            <Route path="/diary" element={<DiarioPage />} />
            <Route path="/diary/:date" element={<DiarioPage />} />
            <Route path="/planner" element={<PlanificadorPage />} />
            <Route path="/templates" element={<PlantillasPage />} />
            <Route path="/templates/new" element={<PlantillaEditorPage />} />
            <Route path="/templates/:id" element={<PlantillaEditorPage />} />
            <Route path="/recipes" element={<RecetasPage />} />
            <Route path="/recipes/new" element={<RecetaEditorPage />} />
            <Route path="/recipes/:id" element={<RecetaEditorPage />} />
            <Route path="/recipes/ingredients" element={<IngredientesPage />} />

            {/* Entreno */}
            <Route path="/training" element={<EntrenamientoPage />} />
            <Route path="/training/new" element={<SessionEditorPage />} />
            <Route path="/training/:id" element={<SessionEditorPage />} />
            <Route path="/training/exercises/:id" element={<ExerciseHistoryPage />} />
            <Route path="/routine" element={<EnProgresoPage />} />
            <Route path="/exercises" element={<EnProgresoPage />} />

            {/* Shared */}
            <Route
              path="/progress"
              element={
                <Suspense fallback={<FullPageLoader />}>
                  <ProgresoPage />
                </Suspense>
              }
            />
            <Route path="/progress/goals" element={<ObjetivosPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
```

Update imports at the top: add `HomePage`, `EnProgresoPage`; the `RecetaEditorPage` "new" path note: `/recipes/new` must precede `/recipes/:id` (already ordered above). Update `RedirectIfAuthed`'s `Navigate to="/diario"` → `to="/home"`. Keep the catch-all `<Route path="*" element={<Navigate to="/" replace />} />`.

- [ ] **Step 4: Run tests**

Run: `pnpm test -- src/app/router.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/router.tsx src/app/router.test.tsx
git commit -m "feat(nav): English route slugs + sectioned routes + En progreso routes"
```

---

## Task 18: Sweep internal links to old slugs

**Files:**
- Modify: any `src/**` files still referencing old Spanish routes.

- [ ] **Step 1: Find remaining references**

Run (PowerShell):
```powershell
Select-String -Path src\**\*.tsx,src\**\*.ts -Pattern "'/diario|'/planificador|'/menus|'/recetas|'/ingredientes|'/entrenamiento|'/progreso|'/objetivos" -List
```
Expected: a handful of `navigate('/…')` / `<Link to="/…">` / `to="/…"` call sites (e.g. inside training/diario/recipes feature components, success redirects after create).

- [ ] **Step 2: Update each to its new slug**

Map per Task 17's table: `/diario`→`/diary`, `/planificador`→`/planner`, `/menus`→`/templates` (`/menus/nuevo`→`/templates/new`), `/recetas`→`/recipes` (`/recetas/nuevo`→`/recipes/new`), `/ingredientes`→`/recipes/ingredients`, `/entrenamiento`→`/training` (`/entrenamiento/nueva`→`/training/new`, `/entrenamiento/ejercicios/:id`→`/training/exercises/:id`), `/progreso`→`/progress`, `/objetivos`→`/progress/goals`.

- [ ] **Step 3: Verify none remain**

Re-run the Step 1 search.
Expected: no matches (outside the redirect-free router and this plan/spec docs).

- [ ] **Step 4: Commit**

```bash
git add -A src/
git commit -m "refactor(nav): update internal links to English slugs"
```

---

## Task 19: Full verification

- [ ] **Step 1: Lint, typecheck, build, test**

Run: `pnpm lint && pnpm typecheck && pnpm build && pnpm test`
Expected: all PASS (CI ship gate).

- [ ] **Step 2: Manual smoke (dev server)**

Run: `pnpm dev`, then check at <768px and ≥768px widths:
- Mobile: bottom nav shows 4 tabs; section switcher toggles Nutrición↔Entreno; `/routine` & `/exercises` show En progreso; avatar → Ajustes/Salir.
- Desktop: sidebar groups (Home, Progreso, Nutrición, Entreno) with colour accents; `/home` shows the placeholder; Recipes/Progress tabs switch sub-routes.

- [ ] **Step 3: (Optional) agent-browser E2E**

Drive the live app with the seeded `qa-bot@hudsonsfitness.app` per the spec's Testing section.

- [ ] **Step 4: Finalize**

The branch is ready for a PR into `develop` (per CLAUDE.md ship flow). Do not push/PR until the user asks.

---

## Self-Review

**Spec coverage:**
- Responsive shell (bottom nav / sidebar, width-keyed) → Tasks 1, 9, 10, 11. ✓
- Two sections + shared, colour identity → Tasks 2, 4, 9, 10. ✓
- English slugs + route map → Task 17 (+ sweep 18). ✓
- Demote Templates/Ingredients/Goals → Tasks 16, 15, 14. ✓
- Section switcher (mobile) → Task 8. ✓
- Avatar menu (Settings/Logout) → Task 7. ✓
- `/home` desktop-only + mobile redirect → Task 13. ✓
- En progreso placeholder for Rutina/Ejercicios → Tasks 12, 17. ✓
- i18n nav rewrite (es+en complete) → Tasks 5, 7, 15, 16. ✓
- `useActiveSection` route→section + localStorage → Task 3. ✓
- Testing (unit + component) → per-task TDD + Task 19. ✓
- No schema/RLS/RPC change → confirmed (no migration tasks). ✓

**Type consistency:** `Section`/`NavGroup`/`NavItem` defined in Task 2 and consumed unchanged in Tasks 3, 8, 9, 10; helper names `sectionOf`/`bottomNavItems`/`sidebarGroups` consistent across tasks. `nav` i18n keys (`home, diary, planner, recipes, progress, today, routine, exercises, settings, ingredients, section.*, inProgress.*, account, switchSection`) are introduced across Tasks 5/7/15 and consumed by the components that need them.

**Placeholder scan:** route test (Task 17) is described with an implementation note rather than full code because it depends on extracting an `AppRoutes` export — the note specifies exactly what to extract and assert. All other steps carry complete code.
