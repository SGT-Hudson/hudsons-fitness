# R-33 PR-2 — Foundation Retheme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-theme the whole app (gym included) onto the design-canvas token system: oklch warm-neutral tokens, section-scoped accents, Rubik + Geist Mono, restyled shadcn primitives, and zero hardcoded palette classes — spec §3.2–3.5 of `docs/superpowers/specs/2026-07-02-r33-ui-redesign-design.md`.

**Architecture:** Two token layers in `src/index.css` — the canvas `tokens.css` ported near-verbatim (design tokens, `:root` + `.dark`) and shadcn role tokens *defined from* design tokens, wired through `@theme inline` so utilities resolve per-subtree. `.section-nutri`/`.section-gym` set `--accent*`; `AppLayout` applies the class from the route via the existing `useActiveSection`. `--primary` follows `--accent`, so every primary control is section-aware for free. Old layouts wear the new skin ("plain but coherent" is the accepted intermediate state).

**Tech Stack:** Tailwind 4 (CSS-first, `@theme`), CVA, `@fontsource-variable/rubik`, `@fontsource-variable/geist-mono`, React 18, vendored shadcn primitives.

## Global Constraints

- Canvas `D:/dev/claude-design-hudson-fitness/tokens.css` (WSL: `/mnt/d/dev/claude-design-hudson-fitness/tokens.css`) is the token source of truth; port values **verbatim** (light `:root`, dark = canvas `.theme-dark` → app `.dark`).
- Dark-mode mechanism untouched (D-F6): ThemeProvider + `index.html` pre-paint IIFE byte-identical; storage key `hf-theme`; class `.dark` on `<html>`. Only token *values* change.
- Design names canonical: `nutricion|entreno` → `nutri|gym` (CSS vars + TS `Section` type). i18n **strings/namespaces are NOT renamed** (`entrenamiento.json` etc. stay).
- Prefer standard mechanism (Tailwind utility / shadcn / CVA variant) over bespoke CSS. Canvas `.surface`/`.btn`/`.chip` are *specifications*, not code to vendor.
- No schema/RLS/RPC changes. No new logic (tone-core `getKcalStatus` etc. is a later wave — this PR only tokenises existing colours).
- All new user-facing strings ES **and** EN (none expected in this PR).
- CI gate: `corepack pnpm lint` + `build` + `test` green. pnpm via `corepack pnpm` (Node 20; pnpm 11 crashes).
- No AI attribution in commits; plain conventional commits.
- Worktree: `.claude/worktrees/r33-pr2-foundation`, branch `claude/r33-pr2-foundation`, created from WSL off `origin/develop`.
- Success-criterion grep (must end clean): no `-(red|green|blue|amber|yellow|orange|stone|slate|gray|zinc|neutral|emerald|lime|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-<n>` classes and no hex literals in `src/` outside `src/index.css`.

### New tokens beyond canvas `tokens.css` (documented deviations, recorded in decisions.md in Task 7)

The canvas tone palette lives in `planificador-tone.jsx` (not `tokens.css`); dark values and a few gaps are filled here so the sweep can be colour-complete. All go in `src/index.css` clearly commented `/* app extensions — not in canvas tokens.css */`:

| Token | Light | Dark | Serves |
|---|---|---|---|
| `--tone-info` | `oklch(0.55 0.14 256)` | `oklch(0.72 0.14 256)` | MacroTone `budget` (today's sky) |
| `--tone-good` | `oklch(0.52 0.13 148)` | `oklch(0.74 0.14 148)` | onTarget/floorMet, runner "beat", toast success |
| `--tone-warn` | `oklch(0.62 0.13 75)` | `oklch(0.80 0.14 75)` | slightOver/surplusHigh, runner "short" |
| `--excess-neutral` | `oklch(0.82 0.03 95)` | `oklch(0.40 0.02 95)` | excess bar segment |
| `--excess-warn` | `oklch(0.78 0.13 75)` | `oklch(0.60 0.12 75)` | excess bar segment (tolerance) |
| `--excess-bad` | `oklch(0.66 0.17 27)` | `oklch(0.55 0.15 27)` | excess bar segment (over) |
| `--excess-good` | `oklch(0.38 0.10 148)` | `oklch(0.55 0.12 148)` | excess over a floor (positive) |
| `--amber-ink` | `oklch(0.50 0.11 75)` | `oklch(0.85 0.12 75)` | text on `--amber-soft` |
| `--heat-zero` | `oklch(0.945 0.005 250)` | `oklch(0.30 0.008 250)` | heatmap zero-load fill |
| `--heat-part` | `oklch(0.92 0.004 250)` | `oklch(0.35 0.008 250)` | heatmap non-muscle parts |

`--tone-bad` is not added — `over`/`fatLow` map to the existing `--danger` role (`destructive`).

---

### Task 0: Worktree setup

- [ ] **Step 1:** From WSL:

```bash
cd /mnt/d/dev/hudsons-fitness
git fetch origin
git worktree add .claude/worktrees/r33-pr2-foundation -b claude/r33-pr2-foundation origin/develop
cd .claude/worktrees/r33-pr2-foundation && corepack pnpm install
```

Expected: clean install. All later tasks run inside this worktree.

---

### Task 1: Section rename `nutricion|entreno` → `nutri|gym`

Mechanical sweep, old token *values* kept (Task 2 replaces values). Independent, testable, committed first.

**Files:**
- Modify: `src/components/layout/nav-config.ts` (+ its test)
- Modify: `src/components/layout/useActiveSection.ts` (+ its test)
- Modify: `src/components/layout/AppSidebar.tsx`, `BottomNav.tsx`, `SectionSwitcher.tsx` (+ tests)
- Modify: `src/pages/RecipesTabs.tsx`
- Modify: `src/index.css` (var names only)

**Interfaces:**
- Produces: `export type Section = 'nutri' | 'gym'` in `nav-config.ts`; utilities `bg-nutri`, `text-nutri`, `bg-gym`, `text-gym` (and `/10` opacity forms) resolving in CSS. Tasks 2–6 rely on these names.

- [ ] **Step 1: Update the failing tests first.** In `nav-config.test.ts` and `useActiveSection.test.tsx`, replace every `'nutricion'` → `'nutri'` and `'entreno'` → `'gym'` (values compared against `Section`). Add one new test to `useActiveSection.test.tsx` for legacy storage migration:

```tsx
it('treats a stored legacy "entreno" value as gym on shared routes', () => {
  localStorage.setItem('hf-section', 'entreno');
  // render the hook on a shared route, e.g. /progress (reuse the file's existing harness)
  expect(result.current).toBe('gym');
});
```

- [ ] **Step 2:** Run `corepack pnpm vitest run src/components/layout --project unit 2>/dev/null || corepack pnpm vitest run src/components/layout` → expect FAIL (type/value mismatches).

- [ ] **Step 3: Rename in source.**
  - `nav-config.ts`: `Section = 'nutri' | 'gym'`; all `group:` literals; `sidebarGroups()` order array `['shared', 'nutri', 'gym']`. Keep `key`/i18n keys unchanged.
  - `useActiveSection.ts`: return-fallback becomes

```ts
const stored = localStorage.getItem(STORAGE_KEY);
return stored === 'gym' || stored === 'entreno' ? 'gym' : 'nutri';
```

  (legacy `'entreno'` values in existing localStorage keep resolving; writes now store the new names).
  - `AppSidebar.tsx` / `BottomNav.tsx` / `SectionSwitcher.tsx` / `RecipesTabs.tsx`: record keys and class strings `nutricion`→`nutri`, `entreno`→`gym` (`bg-nutri/10 text-nutri before:bg-nutri`, `text-gym`, `border-nutri` …).
  - `src/index.css`: rename `--nutricion`→`--nutri`, `--nutricion-foreground`→`--nutri-foreground`, `--entreno`→`--gym`, `--entreno-foreground`→`--gym-foreground` and the `@theme` lines `--color-nutricion`→`--color-nutri` etc. **Values unchanged.**
  - Sweep leftovers: `grep -rn "nutricion\|entreno" src/ --include='*.ts' --include='*.tsx' --include='*.css' | grep -v i18n` must return nothing.

- [ ] **Step 4:** `corepack pnpm vitest run src/components/layout src/pages` → PASS. `corepack pnpm build` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: rename section identity nutricion/entreno -> nutri/gym"
```

---

### Task 2: Token architecture in `src/index.css` + section classes

**Files:**
- Modify: `src/index.css` (full rewrite of the token blocks; keep the TW4 compat/base rules and keyframes from PR-1)
- Modify: `src/components/layout/AppLayout.tsx` (apply section class)
- Modify: any `hsl(var(--…))` consumer found by grep (charts etc.)

**Interfaces:**
- Consumes: Task 1 names (`nutri`/`gym`).
- Produces: role utilities (`bg-background`, `bg-card`, `text-muted-foreground`, `bg-primary`, `bg-destructive`…) now resolve to design-token values; new utilities `bg-accent-soft`, `text-accent-ink`, `border-accent-line`, `bg-nutri-soft`, `text-nutri-ink`, `border-nutri-line` (same for `gym`, `danger`, `amber`, `phase-cut|bulk|maint`, `macro-p|c|g|fib`, `tone-info|good|warn`, `excess-*`, `heat-zero|part`), `shadow-card`, `shadow-hi`, `max-w-content`. Classes `.section-nutri`/`.section-gym`. **Role vars now hold complete colors — `hsl(var(--x))` no longer works anywhere.**

- [ ] **Step 1: Rewrite the token blocks in `src/index.css`.** Keep from PR-1: the two `@import` lines, `@custom-variant dark`, `@utility container`, the border-color/cursor compat `@layer base`, and the accordion/exercise-frame keyframes + `--animate-*` theme lines. Replace the old `:root`/`.dark` HSL sets and the `--color-*: hsl(var(--*))` theme lines with:

```css
/* ── Design tokens — ported from canvas tokens.css (source of truth) ── */
:root {
  /* Neutrals (light) — warm tinted */
  --bg:          oklch(0.985 0.003 95);
  --bg-elev:     #ffffff;
  --bg-sunken:   oklch(0.965 0.004 95);
  --line:        oklch(0.92 0.005 95);
  --line-strong: oklch(0.84 0.006 95);
  --text:        oklch(0.18 0.01 95);
  --text-muted:  oklch(0.48 0.01 95);
  --text-dim:    oklch(0.62 0.008 95);

  /* Accents */
  --nutri:        oklch(0.48 0.13 148);
  --nutri-soft:   oklch(0.94 0.04 148);
  --nutri-ink:    oklch(0.34 0.09 148);
  --nutri-line:   oklch(0.82 0.06 148);
  --gym:          #007cfb;
  --gym-soft:     oklch(0.95 0.045 256);
  --gym-ink:      oklch(0.46 0.16 256);
  --gym-line:     oklch(0.83 0.09 256);

  /* Danger — always red, section-independent */
  --danger:       oklch(0.55 0.20 27);
  --danger-soft:  oklch(0.95 0.035 27);
  --danger-ink:   oklch(0.47 0.17 27);
  --danger-line:  oklch(0.84 0.07 27);
  --amber:        oklch(0.74 0.15 75);
  --amber-soft:   oklch(0.95 0.05 80);

  /* Nutritional phases */
  --phase-cut:        oklch(0.62 0.14 350);
  --phase-cut-soft:   oklch(0.94 0.045 350);
  --phase-cut-ink:    oklch(0.34 0.098 350);
  --phase-cut-line:   oklch(0.82 0.063 350);
  --phase-bulk:       oklch(0.62 0.14 300);
  --phase-bulk-soft:  oklch(0.94 0.045 300);
  --phase-bulk-ink:   oklch(0.34 0.098 300);
  --phase-bulk-line:  oklch(0.82 0.063 300);
  --phase-maint:      oklch(0.58 0.015 95);
  --phase-maint-soft: oklch(0.945 0.006 95);
  --phase-maint-ink:  oklch(0.34 0.012 95);
  --phase-maint-line: oklch(0.84 0.010 95);

  /* Macro identity dots (identity only — bars use the section accent) */
  --macro-p:   oklch(0.74 0.13 30);
  --macro-c:   oklch(0.78 0.10 250);
  --macro-g:   oklch(0.84 0.12 92);
  --macro-fib: oklch(0.70 0.10 150);

  /* app extensions — not in canvas tokens.css (see plan header table) */
  --tone-info:      oklch(0.55 0.14 256);
  --tone-good:      oklch(0.52 0.13 148);
  --tone-warn:      oklch(0.62 0.13 75);
  --excess-neutral: oklch(0.82 0.03 95);
  --excess-warn:    oklch(0.78 0.13 75);
  --excess-bad:     oklch(0.66 0.17 27);
  --excess-good:    oklch(0.38 0.10 148);
  --amber-ink:      oklch(0.50 0.11 75);
  --heat-zero:      oklch(0.945 0.005 250);
  --heat-part:      oklch(0.92 0.004 250);

  /* Shadows (raw; wired to utilities via @theme inline below) */
  --shadow-card-raw: 0 1px 0 oklch(0.92 0.005 95), 0 1px 2px oklch(0.18 0.01 95 / 0.04);
  --shadow-hi-raw:   0 8px 24px oklch(0.18 0.01 95 / 0.08);

  /* Default accent = nutri (shared routes); section classes override */
  --accent: var(--nutri); --accent-soft: var(--nutri-soft);
  --accent-ink: var(--nutri-ink); --accent-line: var(--nutri-line);
  --on-accent: #ffffff; /* text on solid accent; dark mode flips to --bg */

  /* shadcn role tokens := design tokens */
  --background: var(--bg);
  --foreground: var(--text);
  --card: var(--bg-elev);
  --card-foreground: var(--text);
  --popover: var(--bg-elev);
  --popover-foreground: var(--text);
  --muted: var(--bg-sunken);
  --muted-foreground: var(--text-muted);
  --border: var(--line);
  --input: var(--line-strong);
  --ring: var(--accent);
  --primary: var(--accent);
  --primary-foreground: var(--on-accent);
  --secondary: var(--bg-sunken);
  --secondary-foreground: var(--text);
  --destructive: var(--danger);
  --destructive-foreground: #ffffff;
  --nutri-foreground: #ffffff;
  --gym-foreground: #ffffff;
}

.dark {
  --bg:          oklch(0.16 0.008 250);
  --bg-elev:     oklch(0.21 0.01 250);
  --bg-sunken:   oklch(0.13 0.008 250);
  --line:        oklch(0.27 0.008 250);
  --line-strong: oklch(0.36 0.008 250);
  --text:        oklch(0.97 0.003 250);
  --text-muted:  oklch(0.70 0.008 250);
  --text-dim:    oklch(0.55 0.008 250);

  --nutri:       oklch(0.74 0.14 148);
  --nutri-soft:  oklch(0.30 0.07 148);
  --nutri-ink:   oklch(0.86 0.12 148);
  --nutri-line:  oklch(0.40 0.07 148);
  --gym:         oklch(0.70 0.17 256);
  --gym-soft:    oklch(0.30 0.10 256);
  --gym-ink:     oklch(0.84 0.13 256);
  --gym-line:    oklch(0.44 0.12 256);

  --danger:      oklch(0.70 0.17 27);
  --danger-soft: oklch(0.30 0.09 27);
  --danger-ink:  oklch(0.82 0.14 27);
  --danger-line: oklch(0.44 0.10 27);
  --amber:       oklch(0.80 0.14 75);
  --amber-soft:  oklch(0.32 0.07 75);

  --phase-cut:        oklch(0.72 0.14 350);
  --phase-cut-soft:   oklch(0.30 0.08 350);
  --phase-cut-ink:    oklch(0.84 0.11 350);
  --phase-cut-line:   oklch(0.44 0.10 350);
  --phase-bulk:       oklch(0.72 0.14 300);
  --phase-bulk-soft:  oklch(0.30 0.08 300);
  --phase-bulk-ink:   oklch(0.84 0.11 300);
  --phase-bulk-line:  oklch(0.44 0.10 300);
  --phase-maint:      oklch(0.70 0.015 95);
  --phase-maint-soft: oklch(0.29 0.008 95);
  --phase-maint-ink:  oklch(0.84 0.012 95);
  --phase-maint-line: oklch(0.42 0.012 95);

  --macro-p:   oklch(0.72 0.15 30);
  --macro-c:   oklch(0.72 0.14 250);
  --macro-g:   oklch(0.80 0.14 92);
  --macro-fib: oklch(0.72 0.13 150);

  /* app extensions */
  --tone-info:      oklch(0.72 0.14 256);
  --tone-good:      oklch(0.74 0.14 148);
  --tone-warn:      oklch(0.80 0.14 75);
  --excess-neutral: oklch(0.40 0.02 95);
  --excess-warn:    oklch(0.60 0.12 75);
  --excess-bad:     oklch(0.55 0.15 27);
  --excess-good:    oklch(0.55 0.12 148);
  --amber-ink:      oklch(0.85 0.12 75);
  --heat-zero:      oklch(0.30 0.008 250);
  --heat-part:      oklch(0.35 0.008 250);

  --on-accent: var(--bg); /* canvas: .theme-dark .btn-primary { color: var(--bg) } */
  --destructive-foreground: var(--bg);
  --nutri-foreground: var(--bg);
  --gym-foreground: var(--bg);

  --shadow-card-raw: 0 1px 0 oklch(0.27 0.008 250), 0 1px 2px oklch(0 0 0 / 0.4);
  --shadow-hi-raw:   0 12px 32px oklch(0 0 0 / 0.5);
}

/* Section-scoped accent (spec §3.2) — applied by AppLayout from the route */
.section-nutri { --accent: var(--nutri); --accent-soft: var(--nutri-soft); --accent-ink: var(--nutri-ink); --accent-line: var(--nutri-line); }
.section-gym   { --accent: var(--gym);   --accent-soft: var(--gym-soft);   --accent-ink: var(--gym-ink);   --accent-line: var(--gym-line); }
```

Then the `@theme` wiring (replaces the old `--color-*: hsl(...)` lines; keep `--animate-*` and add radii/shadows/layout):

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);

  /* section accent — resolves per-subtree via .section-* */
  --color-accent: var(--accent);
  --color-accent-foreground: var(--on-accent);
  --color-accent-soft: var(--accent-soft);
  --color-accent-ink: var(--accent-ink);
  --color-accent-line: var(--accent-line);

  --color-nutri: var(--nutri);
  --color-nutri-foreground: var(--nutri-foreground);
  --color-nutri-soft: var(--nutri-soft);
  --color-nutri-ink: var(--nutri-ink);
  --color-nutri-line: var(--nutri-line);
  --color-gym: var(--gym);
  --color-gym-foreground: var(--gym-foreground);
  --color-gym-soft: var(--gym-soft);
  --color-gym-ink: var(--gym-ink);
  --color-gym-line: var(--gym-line);
  --color-danger: var(--danger);
  --color-danger-soft: var(--danger-soft);
  --color-danger-ink: var(--danger-ink);
  --color-danger-line: var(--danger-line);
  --color-amber: var(--amber);
  --color-amber-soft: var(--amber-soft);
  --color-amber-ink: var(--amber-ink);

  --color-phase-cut: var(--phase-cut);
  --color-phase-cut-soft: var(--phase-cut-soft);
  --color-phase-cut-ink: var(--phase-cut-ink);
  --color-phase-cut-line: var(--phase-cut-line);
  --color-phase-bulk: var(--phase-bulk);
  --color-phase-bulk-soft: var(--phase-bulk-soft);
  --color-phase-bulk-ink: var(--phase-bulk-ink);
  --color-phase-bulk-line: var(--phase-bulk-line);
  --color-phase-maint: var(--phase-maint);
  --color-phase-maint-soft: var(--phase-maint-soft);
  --color-phase-maint-ink: var(--phase-maint-ink);
  --color-phase-maint-line: var(--phase-maint-line);

  --color-macro-p: var(--macro-p);
  --color-macro-c: var(--macro-c);
  --color-macro-g: var(--macro-g);
  --color-macro-fib: var(--macro-fib);

  --color-tone-info: var(--tone-info);
  --color-tone-good: var(--tone-good);
  --color-tone-warn: var(--tone-warn);
  --color-excess-neutral: var(--excess-neutral);
  --color-excess-warn: var(--excess-warn);
  --color-excess-bad: var(--excess-bad);
  --color-excess-good: var(--excess-good);
  --color-heat-zero: var(--heat-zero);
  --color-heat-part: var(--heat-part);

  --shadow-card: var(--shadow-card-raw);
  --shadow-hi: var(--shadow-hi-raw);
}

@theme {
  /* Radii — canvas scale; shadcn names map onto it (cards md·14, fields sm·10) */
  --radius-xs: 6px;
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 14px;   /* rounded-lg (cards/dialogs) → canvas md */
  --radius-xl: 20px;
  --spacing-content: 1280px; /* --content-max: max-w-content via spacing? no — see note */
}
```

**Wiring notes:**
1. **Shadows:** the raw tokens use the `-raw` suffix (`--shadow-card-raw`) precisely so the `@theme inline` names (`--shadow-card`, which generates the `shadow-card` utility) don't self-reference. The `inline` keyword inlines `var(--shadow-card-raw)` into the utility, so `.dark`'s override resolves at paint time.
2. **Content cap:** delete the `--spacing-content` line; instead add a plain utility:

```css
@utility max-w-content {
  max-width: 1280px; /* canvas --content-max (V2 web convention) */
}
```

(Nothing consumes it yet in this PR; the shell wave does. Cheap to ship now with the token set.)

- [ ] **Step 2: Apply the section class in `AppLayout.tsx`.**

```tsx
import { useActiveSection } from './useActiveSection';
// inside AppLayout():
const section = useActiveSection();
// root div:
<div className={`flex min-h-dvh ${section === 'gym' ? 'section-gym' : 'section-nutri'}`}>
```

Shared routes default to nutri via `useActiveSection`'s existing fallback — matches spec §4.1.

- [ ] **Step 3: Fix all `hsl(var(--…))` consumers.** Run `grep -rn "hsl(var(" src/ --include='*.ts' --include='*.tsx'`. Replace each `hsl(var(--x))` with `var(--x)` and `hsl(var(--x) / 0.n)` with `color-mix(in oklab, var(--x) n%, transparent)`. Chart components (Recharts `stroke`/`fill` props) are the expected hits.

- [ ] **Step 4:** Also update the base layer body font block: leave the font stack as-is for now (Task 3 replaces it) but confirm `* { @apply border-border }` still compiles (it does — `border-border` now resolves via `@theme inline`).

- [ ] **Step 5:** `corepack pnpm build` → PASS. `corepack pnpm vitest run src/components` → PASS (fix any class-resolution fallout). Launch `corepack pnpm dev`, load `/diary` and `/training`: nutrition shows green primaries, training shows blue (`--gym`), dark toggle works.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: port canvas design tokens, section-scoped accents, shadcn role wiring"
```

---

### Task 3: Typography — Rubik + Geist Mono, type utilities, PWA identity

**Files:**
- Modify: `package.json` (`corepack pnpm add @fontsource-variable/rubik @fontsource-variable/geist-mono` — both exist at 5.2.8)
- Modify: `src/main.tsx` (font imports + preload)
- Modify: `src/index.css` (font tokens, body, type utilities)
- Modify: `index.html` (`theme-color`)
- Modify: `public/favicon.svg`, `public/icon.svg` (green swap)

**Interfaces:**
- Produces: `font-sans` = Rubik Variable, `font-mono` = Geist Mono Variable; utilities `tnum`, `text-title-screen`, `text-title-sheet`, `text-title-card`, `text-body-app`, `text-meta`, `text-cap-label` for later waves.

- [ ] **Step 1:** `corepack pnpm add @fontsource-variable/rubik @fontsource-variable/geist-mono`

- [ ] **Step 2:** In `src/main.tsx`, above the `./index.css` import:

```ts
import '@fontsource-variable/rubik';
import '@fontsource-variable/geist-mono';
import rubikWoff2 from '@fontsource-variable/rubik/files/rubik-latin-wght-normal.woff2?url';

// Preload the primary face (fontsource CSS is font-display: swap already).
const preload = document.createElement('link');
preload.rel = 'preload';
preload.as = 'font';
preload.type = 'font/woff2';
preload.crossOrigin = 'anonymous';
preload.href = rubikWoff2;
document.head.appendChild(preload);
```

(If the `?url` file path differs, check `node_modules/@fontsource-variable/rubik/files/` for the latin wght normal woff2 name.) Verify in the built `dist/` that no CDN font request exists (fontsource is self-hosted by construction).

- [ ] **Step 3:** In `src/index.css` add font tokens + swap the body stack + type utilities:

```css
@theme {
  --font-sans: 'Rubik Variable', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'Geist Mono Variable', ui-monospace, 'JetBrains Mono', monospace;
}
```

Body block (replaces the hardcoded stack):

```css
body {
  @apply bg-background text-foreground font-sans;
  letter-spacing: -0.005em;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
```

Type utilities (Convenciones §02: 22/600 → 9.5/500 CAPS; titles -0.02em; figures tabular):

```css
@utility tnum {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
}
@utility text-title-screen { font-size: 22px;   font-weight: 600; letter-spacing: -0.02em; }
@utility text-title-sheet  { font-size: 18px;   font-weight: 600; letter-spacing: -0.02em; }
@utility text-title-card   { font-size: 13.5px; font-weight: 600; letter-spacing: -0.02em; }
@utility text-body-app     { font-size: 12.5px; font-weight: 400; }
@utility text-meta         { font-size: 11px;   font-weight: 500; }
@utility text-cap-label    { font-size: 9.5px;  font-weight: 500; letter-spacing: 0.045em; text-transform: uppercase; color: var(--text-dim); }
```

- [ ] **Step 4:** `index.html`: `theme-color` `#16a34a` → `#13702f` (hex of `--nutri` light `oklch(0.48 0.13 148)`). In `public/favicon.svg` + `public/icon.svg` replace the old green fill(s) (`#16a34a` or equivalent — inspect the files) with `#13702f`. Check `vite.config.ts` PWA manifest for a `theme_color` field and update it too if present.

- [ ] **Step 5:** `corepack pnpm build` → PASS. Dev-run: text renders in Rubik (inspect computed font-family), numbers with `tnum` where already applied, no network font requests.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: self-hosted Rubik + Geist Mono, type-scale utilities, new PWA green"
```

---

### Task 4: shadcn primitive restyle

**Files:**
- Modify: `src/components/ui/button.tsx`, `badge.tsx`, `card.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx`, `tabs.tsx`, `dialog.tsx`, `drawer.tsx`, `dropdown-menu.tsx`, `toast.tsx`, `skeleton.tsx`, `label.tsx`
- Modify: their colocated tests + any snapshot (`ExerciseDetail.test.tsx.snap` re-record if it embeds primitive classes)

**Interfaces:**
- Consumes: Task 2 utilities (`bg-accent-soft`, `border-accent-line`, `shadow-card`, `shadow-hi`, `rounded-full`…).
- Produces: same exported component names, same **variant prop names** (`default|destructive|outline|secondary|ghost|link`, sizes `default|sm|lg|icon` + new `xl`; Badge adds variant `accent`) — call sites don't churn.

**Variant → Convenciones anatomy mapping (§04–§06), keeping existing names:**

| Existing variant | New anatomy |
|---|---|
| Button `default` | Primary: `bg-primary text-primary-foreground` (accent fill, follows section), pill `rounded-full`, `hover:bg-primary/90` |
| Button `outline` | Secondary: `bg-card border border-input text-foreground hover:bg-muted` (bg-elev + line-strong border), pill |
| Button `secondary` | Soft/cancel: `bg-muted text-foreground hover:bg-muted/70` borderless, pill |
| Button `ghost` | Ghost: `text-muted-foreground hover:bg-muted hover:text-foreground`, pill |
| Button `destructive` | `bg-destructive text-destructive-foreground hover:bg-destructive/90`, pill |
| Button `link` | unchanged apart from token colors |

- [ ] **Step 1: Button.** New `buttonVariants`:

```tsx
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-[13px] font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-card text-foreground hover:bg-muted',
        secondary: 'bg-muted text-foreground hover:bg-muted/70',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-3.5 py-2',
        sm: 'h-8 px-3',
        lg: 'h-11 px-8',
        xl: 'h-12 w-full text-[14px] font-semibold', // footer confirm (44–48px, full width)
        icon: 'h-9 w-9 rounded-[11px] border border-border bg-card text-foreground', // 36×36 icon-button, r-11
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);
```

Note: `size: 'icon'` carries its own border/bg per the icon-button spec; when composed with `variant="ghost"` the variant classes come first so the size's bg/border win (CVA order) — verify visually and drop the size's `border/bg-card` into a check if any call site double-styles.

- [ ] **Step 2: Badge.** Pill + status-badge height:

```tsx
const badgeVariants = cva(
  'inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] font-medium border',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground border-transparent',
        secondary: 'bg-muted text-muted-foreground border-border',
        outline: 'border-border text-muted-foreground',
        accent: 'bg-accent-soft text-accent-ink border-accent-line',
        warning: 'bg-amber-soft text-amber-ink border-transparent',
      },
      defaultVariants: { variant: 'secondary' },
    },
  },
);
```

(keep the actual CVA shape valid — `defaultVariants` sits beside `variants`, not inside).

- [ ] **Step 3: Card.** Base: `rounded-lg border bg-card text-card-foreground shadow-card` (border color already `--line` via the base rule; `rounded-lg` = 14px after Task 2). `CardTitle`: `text-title-card leading-none` (Convenciones 13.5/600 — replaces `text-2xl font-semibold tracking-tight`). `CardHeader`/`CardContent`/`CardFooter` paddings unchanged this PR (screen waves re-space per artboard).

- [ ] **Step 4: Fields.** `input.tsx`/`textarea.tsx`/`select.tsx` trigger: `rounded-md` → `rounded-sm`? No — keep `rounded-md` (now 14px) *only* for cards; fields per Convenciones use sm·10 → set field wrappers to `rounded-[10px]` via the theme name `rounded-sm` (10px after Task 2). So: replace `rounded-md` with `rounded-sm` in input/textarea/select trigger/content, keep `border-input bg-background` (now line-strong on bg). Select content/dropdown panels: `shadow-md` → `shadow-hi`, `rounded-sm`.

- [ ] **Step 5: Overlays.** `dialog.tsx`: content `shadow-lg` → `shadow-hi`, `rounded-lg`, `sm:rounded-lg`. `drawer.tsx` (vaul): content top radius → `rounded-t-[22px]`, ensure the grabber bar exists (`mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted` — keep if already there from B2b), `shadow-hi`. `dropdown-menu.tsx`: panel `shadow-hi rounded-sm`; **highlighted/hover items `focus:bg-accent focus:text-accent-foreground` → `focus:bg-muted focus:text-foreground`** (the `accent` role is now the section accent — solid green/blue hover fills would be wrong). Same substitution in `select.tsx` item highlight and anywhere `bg-accent`/`text-accent-foreground` appears as a *hover/highlight* (grep `-rn "bg-accent\b\|text-accent-foreground" src/components/ui src/`): hover/highlight → `muted`, real call-to-action accents stay.

- [ ] **Step 6: Toast.** `toast.tsx`: default `border bg-background text-foreground shadow-hi`; success variant `border-emerald-500/40 bg-emerald-500/10` → `border-tone-good/40 bg-tone-good/10`; destructive keeps `destructive` tokens. `tabs.tsx`: list `bg-muted rounded-full p-1`, trigger active `bg-card shadow-card rounded-full` (pill segmented control). `skeleton.tsx`/`label.tsx`: verify token-only (likely `bg-muted` already — no palette classes were found in them); adjust radius names only if they use `rounded-md`.

- [ ] **Step 7:** `corepack pnpm vitest run src/components/ui` → update failing class-assertion tests to the new strings (semantics unchanged: same variants exist). Delete + re-record any snapshot that embeds old classes: `corepack pnpm vitest run -u src/features/training`.

- [ ] **Step 8:** `corepack pnpm build && corepack pnpm lint` → PASS.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: restyle shadcn primitives to the design anatomies"
```

---

### Task 5: Hardcoded-color sweep — macro/status system

**Files:**
- Modify: `src/components/ui/MacroBar.tsx` (+ `MacroBar.test.tsx`)
- Modify: `src/features/diario/components/DayTotalsCard.tsx` (+ test), `QuickAddStrip.tsx`
- Modify: `src/features/planning/components/DaySummary.tsx`

**Interfaces:**
- Consumes: `bg-tone-info|good|warn`, `bg-excess-*`, `text-tone-*`, `bg-amber`, accent utilities from Task 2.
- Produces: `MacroBar` public API unchanged (`consumed/target/tone/excess/minFloorG`).

Mapping (visuals near-identical; only the palette source changes — **no logic edits**, `src/lib/macroStatus.ts` untouched):

| Current | New |
|---|---|
| `bg-sky-600 dark:bg-sky-500` (budget) | `bg-tone-info` |
| `bg-emerald-600 dark:bg-emerald-500` (onTarget/floorMet) | `bg-tone-good` |
| `bg-amber-500 dark:bg-amber-400` (slightOver/surplusHigh) | `bg-tone-warn` |
| `bg-emerald-900 dark:bg-emerald-800` (excess good) | `bg-excess-good` |
| `bg-red-900 dark:bg-red-800` (excess bad) | `bg-excess-bad` |
| `bg-amber-700 dark:bg-amber-600` (excess tolerance) | `bg-excess-warn` |
| min-tick `bg-amber-500` | `bg-amber` |
| `text-sky-600 dark:text-sky-400` | `text-tone-info` |
| `text-emerald-600 dark:text-emerald-400` | `text-tone-good` |
| `text-amber-600 dark:text-amber-400` | `text-tone-warn` |
| QuickAddStrip sky banner (`border-sky-200 bg-sky-50 text-sky-700` + dark set) | Accent surface per Convenciones §05: `border-accent-line bg-accent-soft text-accent-ink` (single set — tokens carry dark) |
| QuickAddStrip `text-sky-500 dark:text-sky-400` icon | `text-accent-ink` |

- [ ] **Step 1:** Apply the table to `MacroBar.tsx` (`BASE_TONE`, `EXCESS_TONE`, min-tick), `DayTotalsCard.tsx` + `DaySummary.tsx` (`TEXT_TONE` records and the inline `floorMet` span), `QuickAddStrip.tsx`.
- [ ] **Step 2:** `corepack pnpm vitest run src/components/ui/MacroBar src/features/diario src/features/planning` → update class assertions (e.g. `DayTotalsCard.test.tsx` matched `text-emerald…`), PASS.
- [ ] **Step 3:** Dev-run `/diary` + `/planner`: bars/labels read as before (blue budget, green on-target, amber over-ish, dark red excess) in light + dark.
- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor: move macro status colours onto tone tokens"
```

---

### Task 6: Hardcoded-color sweep — remaining files + heatmap ramp

**Files:**
- Modify: `src/pages/SettingsPage.tsx`, `OnboardingPage.tsx`, `RecetasPage.tsx`
- Modify: `src/features/phases/components/PhaseDialog.tsx`, `src/features/planning/components/CopyMealDialog.tsx`, `src/features/ingredients/components/IngredientFormFields.tsx`, `src/features/progreso/components/MacrosChart.tsx`, `src/features/measurements/components/LatestMeasurementCard.tsx`
- Modify: `src/features/training/runner/ExerciseOverview.tsx`, `SetView.tsx`, `SkipRecovery.tsx`
- Modify: `src/features/training/muscleMap/muscleColor.ts` (+ its test if one exists), `MuscleBody.tsx`

**Interfaces:**
- Consumes: Task 2 token utilities.
- Produces: `muscleColor(value, max): string` now returns CSS `color-mix()` strings; `NEUTRAL_PART` becomes `'var(--heat-part)'`.

Rules (apply per occurrence; when a colour encodes *meaning*, keep the meaning):

| Semantic | Old classes | New |
|---|---|---|
| Warning banner/badge (amber) | `bg-amber-50/100 text-amber-600/700/900 border-amber-200/300` + dark sets | `bg-amber-soft text-amber-ink border-transparent` (single set; drop `dark:` twins) |
| Warning inline text | `text-amber-600 dark:text-amber-500` / `text-amber-400` | `text-amber-ink` (on soft bg) or `text-tone-warn` (on plain bg) |
| Favorite/star fill (RecetasPage) | `fill-amber-400 text-amber-400` | `fill-amber text-amber` |
| Runner "info" chip (sky) | `bg-sky-500/10 text-sky-700 dark:text-sky-400` | `bg-gym-soft text-gym-ink` (gym section blue) |
| Runner amber chip | `bg-amber-500/10 text-amber-700 dark:text-amber-400` | `bg-amber-soft text-amber-ink` |
| Settings icon tiles | indigo pair → `bg-gym-soft text-gym-ink`; emerald pair → `bg-nutri-soft text-nutri-ink`; amber pair → `bg-amber-soft text-amber-ink`; rose pair → `bg-danger-soft text-danger-ink` (drop `dark:` twins) |
| Success/positive text (emerald) in LatestMeasurementCard etc. | `text-emerald-*` | `text-tone-good`; negative red → `text-danger` |
| Any remaining green/red pairs | map good→`tone-good`, bad→`danger`, neutral-info→`tone-info` |

If any occurrence is genuinely phase-coloured (cut/bulk/maint UI in `PhaseDialog`), use the matching `bg-phase-*-soft text-phase-*-ink`; the 4 hits found there are an amber warning badge → amber-soft mapping.

- [ ] **Step 1:** Sweep every file in the list against the table. After each file: `grep -nE "-(red|green|blue|amber|yellow|orange|stone|slate|gray|zinc|neutral|emerald|lime|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-[0-9]" <file>` → no hits.

- [ ] **Step 2: Heatmap ramp** (Auditoría decision #2: gray→amber→red becomes light→gym-blue; token-driven so dark mode works). Rewrite `muscleColor.ts`:

```ts
/**
 * Map a value in [0, max] to the gym-blue heat ramp (zero → --heat-zero,
 * max → --gym), token-driven via color-mix so light/dark both resolve.
 */
export function muscleColor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return 'var(--heat-zero)';
  const t = Math.min(1, value / max);
  const pct = Math.round(15 + t * 85); // floor 15% so the lowest load is visibly tinted
  return `color-mix(in oklab, var(--gym) ${pct}%, var(--heat-zero))`;
}

/** Fill for non-muscle parts (head/hands/feet) — distinct from the zero fill. */
export const NEUTRAL_PART = 'var(--heat-part)';
```

`MuscleBody.tsx`: `stroke="#ffffff"` → `stroke="var(--bg-elev)"`. Update `muscleColor` unit tests (check `src/features/training/muscleMap/` for a test file) to assert the new return shapes (`'var(--heat-zero)'` for zero; `color-mix` string containing `var(--gym)` and a clamped pct for max).

- [ ] **Step 3:** Full grep gate over `src/`:

```bash
grep -rnE "[a-z-]+-(red|green|blue|amber|yellow|orange|stone|slate|gray|zinc|neutral|emerald|lime|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}" src --include='*.ts' --include='*.tsx'
grep -rnE "#[0-9a-fA-F]{3,8}\b" src --include='*.ts' --include='*.tsx'
```

Expected: zero hits (test files asserting new token classes are fine; fix any test still asserting old palette classes instead of excluding it).

- [ ] **Step 4:** `corepack pnpm vitest run src/features src/pages` → PASS (update class assertions). Dev-run: Settings tiles, onboarding banner, runner chips, muscle heatmap (now blue ramp) in light + dark.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: tokenise remaining hardcoded colours; blue muscle-heat ramp"
```

---

### Task 7: Docs, full verification, visual pass, PR

**Files:**
- Modify: `docs/architecture.md` (§Theme model, §shell), `docs/conventions.md` (§UI, §Theme) — divergence markers
- Modify: `docs/decisions.md` — new D-ids
- Modify: `docs/roadmap.md` — R-33 status note (PR-2 done)

- [ ] **Step 1: Divergence markers.** At the top of the Theme/UI sections of `architecture.md` and `conventions.md`, add `> ⚠ Changing — see R-33` if not already present (PR-1 may not have added them).

- [ ] **Step 2: Decisions.** Append to `docs/decisions.md` following its existing ID scheme (next free `D-F` numbers), one short entry each:
  - Token architecture: canvas `tokens.css` = source of truth, two-layer role mapping, section-scoped `--accent` via `.section-nutri|gym`, `@theme inline`.
  - Typography: Rubik Variable + Geist Mono Variable, self-hosted via fontsource (PWA, no CDN).
  - Heatmap ramp: gray→amber→red replaced by `--heat-zero`→`--gym` color-mix ramp (Auditoría decision #2).
  - Tone/excess/amber-ink/heat token extensions beyond canvas `tokens.css` (the header table), to be reconciled when the tone core (§5) lands.

- [ ] **Step 3: Full suite.**

```bash
corepack pnpm lint && corepack pnpm build && corepack pnpm test
```

Expected: all PASS (~11–15 min for tests). Run the Task 6 Step 3 grep gates once more. `git status` clean after commit.

- [ ] **Step 4: Visual pass** (spec §7): dev server + agent-browser harness with QA user `qa-bot@hudsonsfitness.app`. Screenshot at 390px and desktop, light + dark: `/diary`, `/planner`, `/settings`, `/training`, `/exercises` + the muscle heatmap. Checks: warm-tinted bg (`#fbfaf8`-ish), Rubik everywhere, green accent in nutrition / blue in gym, pill buttons, no unreadable text (especially dark mode on the new soft/ink pairs), heatmap blue ramp. Fix drift; commit as `fix: visual drift from token retheme`.

- [ ] **Step 5: PR.**

```bash
git push -u origin claude/r33-pr2-foundation
gh pr create --base develop --title "feat: R-33 PR-2 — foundation retheme (tokens, fonts, primitives, colour sweep)" --body "<summary of tasks 1-6; note: old layouts on the new skin is the accepted intermediate state per the R-33 spec>"
gh pr merge --squash --auto
```

Wait for CI green (do not `--auto` while still pushing). After merge: `git worktree remove` + delete local branch.

---

## Self-review notes

- **Spec coverage:** §3.2 tokens+section mechanism+rename (Tasks 1–2), §3.3 primitives+type utilities (Tasks 3–4), §3.4 fonts+PWA identity (Task 3), §3.5 sweep+runner tokens+heatmap (Tasks 5–6), §7 verification + §8 docs (Task 7). Shell/nav (§4) and tone-core logic (§5) are explicitly NOT here — wave 0/1.
- **Known judgement calls for the reviewer:** `--tone-*`/`--excess-*` dark values are invented (canvas has no dark tone palette); `CardTitle` drops from 24px to 13.5px per Convenciones §02 — flag in the PR body for the visual pass; `--input` role maps to `--line-strong` (field-border affordance); Button `size=icon` carries the icon-button box styles.
