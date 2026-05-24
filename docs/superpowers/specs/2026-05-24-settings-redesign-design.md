# Settings redesign — grouped list + drill-in sub-pages — Design

**Status:** design — approved (user greenlit through to develop)
**Origin:** user request (2026-05-24) — "improve the appearance of the settings tab".

## 1. Goal

Replace the flat single-column stack of five cards at `/settings` with an iOS-style
**grouped settings list**: a profile hero, grouped rows, simple instant-apply controls
inline, and form-heavy sections drilling into their own **full sub-pages**. All existing
behaviour (validation, instant-apply persistence, delete-account flow) is preserved —
this is a presentation/structure change.

## 2. Decisions (brainstorming 2026-05-24, confirmed via mockups)

1. **Direction B** — grouped list rows + profile hero (not polished-cards).
2. **Drill-in = full sub-pages** (routes), consistent with the app's existing editor
   pages; real URLs + browser back.
3. **Hybrid row behaviour:** Idioma + Tema are **inline** instant-apply controls on the
   index; Perfil, Biometría, and Cuenta **drill into sub-pages**.
4. **Grouping/order:** profile hero → **Preferencias** (Idioma, Tema) → **Tú** (Perfil,
   Biometría) → **Cuenta** (Cuenta y sesión).
5. **English route paths** (`/settings/profile|biometrics|account`) per app convention.

## 3. Routing & decomposition

`SettingsPage` (one ~300-line file today) splits into an index + three sub-pages, each
a focused file under `src/pages/settings/`:

- `src/pages/SettingsPage.tsx` → **index** (hero + groups + inline Idioma/Tema).
- `src/pages/settings/SettingsProfilePage.tsx` → display-name form.
- `src/pages/settings/SettingsBiometricsPage.tsx` → sex / birth date / height form.
- `src/pages/settings/SettingsAccountPage.tsx` → email, sign out, delete.
- `src/components/layout/SettingsSubpageHeader.tsx` → shared back-header (`‹` link to
  `/settings` + title).

`router.tsx`: add three routes beside `/settings` (same `RequireOnboarded` group):
`/settings/profile`, `/settings/biometrics`, `/settings/account`. The avatar-menu link
to `/settings` is unchanged.

Shared data hooks `useProfile` / `useUpdateProfile` are reused in each sub-page; the
per-section "Saved" feedback and the `saveSection` helper move into the sub-pages.

## 4. Index page (`SettingsPage`)

- **Profile hero:** a rounded gradient card — initials avatar (first letter of
  `display_name`, else email) + display name (or email local-part) + email — wrapped in
  a `<Link to="/settings/profile">`.
- **Group component** (local to the page): a labelled, bordered, rounded container with
  divided rows. A **row** = colored lucide icon chip + label + (right slot: inline
  control for Idioma/Tema, or a `ChevronRight` for drill-in rows). Drill-in rows are
  `<Link>`s.
- **Preferencias:**
  - **Idioma** — inline segmented control (ES / EN). Selecting persists via the existing
    flow: `i18n.changeLanguage(next)` + `useUpdateProfile({ language: next })` (D-E1).
  - **Tema** — inline compact `Select` (system/light/dark) → `setTheme` (localStorage,
    D-F6). Both instant-apply, no Save button.
- **Tú:** Perfil → `/settings/profile`, Biometría → `/settings/biometrics`.
- **Cuenta:** "Cuenta y sesión" → `/settings/account`.
- Icons: `User` (perfil), `Globe` (idioma), `Palette` (tema), `Ruler` (biometría),
  `UserCog`/`Settings` (cuenta) — colored chips (indigo/green/amber/rose) via small
  per-icon tone classes.

## 5. Sub-pages

Each sub-page: `<SettingsSubpageHeader title={…} />` then the section body. The form
logic is moved verbatim from today's `SettingsPage` (no behavioural change):

- **Profile:** `displayNameFormSchema` RHF form; submit maps blank → null; "Saved"
  line; Save button (`useUpdateProfile`).
- **Biometrics:** `biometricsFormSchema` RHF form — sex Select, birth_date (`max` =
  `todayInTZ()`), height_cm; the combined `required` / `range` error lines
  (`isSubmitted` + message-code split) and the disabled read-only initial-weight field;
  Save + "Saved".
- **Account:** email (disabled Input), Sign out (`signOut`), Delete (opens the existing
  `DeleteAccountDialog`). The shell `error` banner for save failures lives where
  relevant (profile/biometrics).

`SettingsSubpageHeader` is a presentational back-header: a `<Link to="/settings">` with
a `ChevronLeft` + back label, and the page title. No data.

## 6. i18n

Add to the `settings` namespace (ES + EN):
- `groups.preferences` / `groups.you` / `groups.account` (group headers).
- `back` (sub-page back label, e.g. "Ajustes" / "Settings").
- `rows.accountAndSession` (the "Cuenta y sesión" row label) — other row labels reuse
  existing `profile.title`, `language.title`, `appearance.title`, `biometrics.title`.
- `hero.emailLabel` not needed; the hero shows raw values.
Reuse all existing keys for titles/fields/errors/actions/delete. No raw strings.

## 7. Testing

- **Index (`SettingsPage`)** Tier-2: renders the hero (name/email), the three group
  headers and five rows; Idioma segmented toggles language (calls `i18n.changeLanguage`
  + mutation); Tema control changes theme; Perfil/Biometría/Cuenta rows are links to
  their routes. Stub `useProfile`/`useUpdateProfile` and `@/features/theme/ThemeProvider`
  (or wrap in the real provider).
- **SettingsProfilePage** Tier-2: saving submits the trimmed display name (null when
  blank); header back-link points to `/settings`.
- **SettingsBiometricsPage** Tier-2: submitting blanks shows the required line; an
  out-of-range height shows the range line; a valid submit calls the mutation.
- **SettingsAccountPage** Tier-2: shows the email; Sign out calls `signOut`; Delete opens
  the dialog.
- All sub-page tests render within a `MemoryRouter`; stub the auth/profile hooks. Mock
  any supabase-touching imports (memory *component test supabase env*).
- Full gate green (lint, typecheck, all tests, build).

## 8. Risks / notes

- **Behaviour parity is the bar** — the forms, validation codes, instant-apply
  persistence, and delete flow are moved, not rewritten. Verify the biometrics
  required/range split still works post-move.
- **Back navigation** is a simple `<Link to="/settings">` (no history stack reliance) so
  it works on a hard-loaded sub-page URL.
- **No schema/API/RPC changes.** Theme stays localStorage-only (D-F6); language stays
  profile-backed (D-E1).
- Visual change — eyeball the develop preview (hero, groups, sub-page back nav, inline
  Idioma/Tema) before the eventual main promotion (batched with the sidebar fix).
