# R-33 wave 9 — Ajustes + Más (the final screen wave)

**Spec date:** 2026-07-15 · **Roadmap:** R-33 §6 item 9 · **Base:** `develop @ 3e0dcd2`

## Context

Last of the eight R-33 screen waves. The shell wave (#183) already shipped the
`/more` hub (`MorePage.tsx`), the "Más" bottom-nav entry, the `/settings`
frame migration to `PageShell`, and the three settings sub-pages on `PageShell`.
So the routing/nav/frame plumbing is **done**; what remains is the **visual
restyle of `SettingsPage`'s internals** to the artboard + the design language
`MorePage` already embodies.

Artboard: `/mnt/d/dev/claude-design-hudson-fitness/src/ajustes-mobile.jsx`
(main + Perfil + Biometría + Cuenta sub-pages). No schema/RLS/RPC/data-hook
change anywhere — pure presentation.

## The gap (main `SettingsPage.tsx`)

1. **Profile hero** — currently a faint gradient (`from-primary/5 to-primary/10`)
   with a 48px avatar. Target: the flat **`bg-accent-soft` + `border-accent-line`**
   card `MorePage` already uses (46px `bg-accent` avatar, `text-text-dim`
   chevron). Copy that exact pattern for cross-page consistency.
2. **Row subtitles** — the artboard gives each link row a descriptive sub
   ("Nombre visible", "Sexo, nacimiento, altura", "Correo, cerrar sesión,
   eliminar"). New i18n keys, **ES + EN**.
3. **Theme control** — `Select` dropdown → **segmented control** (Sistema /
   Claro / Oscuro), matching the language toggle already on the page and the
   artboard's `AjSeg`. (Standing rule: mobile artboard wins.)
4. **Icon chips** 28→30px / `rounded-lg`→`rounded-[9px]`; group-label +
   row metrics nudged to the artboard. Tone tokens
   (`nutri/amber/gym/danger-soft`) unchanged — they are the current tokens.

Note: `--primary` **is** `--accent` per section (`index.css:210`), so the
existing `bg-primary` already renders the section accent — this is a card-style
and typography gap, not a colour-token gap.

## Out of scope / strip-list

- **"Fotos de los pasos"** setting — the artboard adds it, but R-33 §9 strips
  it (rides with R-36). Do **not** add it.
- The three settings sub-pages (Perfil / Biometría / Cuenta) are already on the
  design-system primitives (`Card`/`Input`/`Label`/`PageShell`, semantic
  tokens). Light polish only if an obvious artboard divergence remains
  (e.g. Account's separate danger-zone card); no structural rework.
- `/more` hub — already matches its (adapted) target. No change.

## Verification

- No new route ⇒ no `router.test.tsx` mock needed. `SettingsPage` has no test;
  sub-page tests must stay green.
- `pnpm lint + build + test` green.
- Real-browser pass (jsdom can't see CSS): `/settings` at mobile 390 + desktop,
  light + dark, against the artboard; drive the language + theme segmented
  controls.

## After this wave

R-33 is feature-complete on `develop`. Next = the **batch release**: doc-audit
(`operations.md`) reconciling docs to shipped code, then a user-approved
`release/*` PR to `main`.
