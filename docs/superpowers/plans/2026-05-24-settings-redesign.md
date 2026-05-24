# Settings Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat 5-card `/settings` page with an iOS-style grouped list — profile hero, inline Idioma/Tema controls, and Perfil/Biometría/Cuenta drilling into their own sub-pages — preserving all existing behaviour.

**Architecture:** Split `SettingsPage` into an index (hero + grouped rows + inline instant controls) plus three sub-pages under `src/pages/settings/`, sharing a `SettingsSubpageHeader`. The form logic (display-name, biometrics validation, delete flow) moves verbatim. Three new routes beside `/settings`. No schema/API changes.

**Tech Stack:** React 18 + TS, react-router, react-i18next, RHF + zod, Tailwind, lucide, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-24-settings-redesign-design.md`
**Workspace:** worktree `D:\dev\hf-settings` (branch `claude/settings-redesign`, off `origin/develop`). Run all commands there.

---

## File Structure

- Modify: `src/i18n/es/settings.json`, `src/i18n/en/settings.json` — `groups.*`, `back`, `rows.accountAndSession`
- Create: `src/components/layout/SettingsSubpageHeader.tsx` (+ `.test.tsx`)
- Create: `src/pages/settings/SettingsProfilePage.tsx` (+ `.test.tsx`)
- Create: `src/pages/settings/SettingsBiometricsPage.tsx` (+ `.test.tsx`)
- Create: `src/pages/settings/SettingsAccountPage.tsx` (+ `.test.tsx`)
- Modify: `src/pages/SettingsPage.tsx` — rewrite as the index (+ `SettingsPage.test.tsx`)
- Modify: `src/app/router.tsx` — three new routes

---

## Task 1: i18n keys

**Files:** Modify `src/i18n/es/settings.json`, `src/i18n/en/settings.json`

- [ ] **Step 1: ES — add keys**

In `src/i18n/es/settings.json`, add a `"back"` key and two blocks (after `"title"`):

```json
  "back": "Ajustes",
  "groups": {
    "preferences": "Preferencias",
    "you": "Tú",
    "account": "Cuenta"
  },
  "rows": {
    "accountAndSession": "Cuenta y sesión"
  },
```

- [ ] **Step 2: EN — add keys**

In `src/i18n/en/settings.json`, add:

```json
  "back": "Settings",
  "groups": {
    "preferences": "Preferences",
    "you": "You",
    "account": "Account"
  },
  "rows": {
    "accountAndSession": "Account & session"
  },
```

- [ ] **Step 3: Verify both parse**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/i18n/es/settings.json','utf8'));JSON.parse(require('fs').readFileSync('src/i18n/en/settings.json','utf8'));console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add src/i18n/es/settings.json src/i18n/en/settings.json
git commit -m "feat(settings): i18n keys for grouped settings (groups, back, rows)"
```

---

## Task 2: SettingsSubpageHeader

**Files:** Create `src/components/layout/SettingsSubpageHeader.tsx` + `.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/layout/SettingsSubpageHeader.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { SettingsSubpageHeader } from './SettingsSubpageHeader';

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('SettingsSubpageHeader', () => {
  it('shows the title and a back link to /settings', () => {
    render(
      <MemoryRouter>
        <SettingsSubpageHeader title="Perfil" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Perfil' })).toBeInTheDocument();
    const back = screen.getByRole('link', { name: /Ajustes/ });
    expect(back).toHaveAttribute('href', '/settings');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/components/layout/SettingsSubpageHeader.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/layout/SettingsSubpageHeader.tsx
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function SettingsSubpageHeader({ title }: { title: string }) {
  const { t } = useTranslation('settings');
  return (
    <div className="space-y-3">
      <Link
        to="/settings"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        {t('back')}
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/components/layout/SettingsSubpageHeader.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/SettingsSubpageHeader.tsx src/components/layout/SettingsSubpageHeader.test.tsx
git commit -m "feat(settings): SettingsSubpageHeader (back link + title)"
```

---

## Task 3: SettingsProfilePage

**Files:** Create `src/pages/settings/SettingsProfilePage.tsx` + `.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/settings/SettingsProfilePage.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';

const mutateAsync = vi.fn().mockResolvedValue({});
vi.mock('@/features/profile/hooks', () => ({
  useProfile: () => ({ data: { display_name: 'Gonzalo' }, isLoading: false }),
  useUpdateProfile: () => ({ mutateAsync, isPending: false }),
}));

import { SettingsProfilePage } from './SettingsProfilePage';

beforeEach(async () => { await i18n.changeLanguage('es'); mutateAsync.mockClear(); });

describe('SettingsProfilePage', () => {
  it('saves the trimmed display name', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SettingsProfilePage /></MemoryRouter>);
    const input = screen.getByLabelText('Nombre');
    await user.clear(input);
    await user.type(input, '  Gon  ');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(mutateAsync).toHaveBeenCalledWith({ display_name: 'Gon' });
  });

  it('sends null when the name is blank', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SettingsProfilePage /></MemoryRouter>);
    await user.clear(screen.getByLabelText('Nombre'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(mutateAsync).toHaveBeenCalledWith({ display_name: null });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/pages/settings/SettingsProfilePage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/pages/settings/SettingsProfilePage.tsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingsSubpageHeader } from '@/components/layout/SettingsSubpageHeader';
import { useProfile, useUpdateProfile } from '@/features/profile/hooks';
import {
  displayNameFormSchema,
  type DisplayNameFormValues,
} from '@/features/profile/schema';

export function SettingsProfilePage() {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { data: profile, isLoading } = useProfile();
  const update = useUpdateProfile();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<DisplayNameFormValues>({
    resolver: zodResolver(displayNameFormSchema),
    defaultValues: { display_name: '' },
  });

  useEffect(() => {
    if (profile) form.reset({ display_name: profile.display_name ?? '' });
  }, [profile, form]);

  async function onSubmit(values: DisplayNameFormValues) {
    setError(null);
    setSaved(false);
    try {
      await update.mutateAsync({ display_name: values.display_name.trim() || null });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message || t('errors.saveFailed'));
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <SettingsSubpageHeader title={t('profile.title')} />
      <p className="text-sm text-muted-foreground">{t('profile.description')}</p>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">{t('profile.displayName')}</Label>
              <Input id="displayName" {...form.register('display_name')} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={update.isPending || isLoading}>
                {update.isPending ? t('actions.saving') : t('actions.save')}
              </Button>
              {saved && !update.isPending && (
                <span className="text-sm text-muted-foreground">{t('actions.saved')}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/pages/settings/SettingsProfilePage.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/settings/SettingsProfilePage.tsx src/pages/settings/SettingsProfilePage.test.tsx
git commit -m "feat(settings): profile sub-page"
```

---

## Task 4: SettingsBiometricsPage

**Files:** Create `src/pages/settings/SettingsBiometricsPage.tsx` + `.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/settings/SettingsBiometricsPage.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';

const mutateAsync = vi.fn().mockResolvedValue({});
vi.mock('@/features/profile/hooks', () => ({
  useProfile: () => ({
    data: { sex: 'male', birth_date: '1990-01-01', height_cm: 180, initial_weight_kg: 80 },
    isLoading: false,
  }),
  useUpdateProfile: () => ({ mutateAsync, isPending: false }),
}));

import { SettingsBiometricsPage } from './SettingsBiometricsPage';

beforeEach(async () => { await i18n.changeLanguage('es'); mutateAsync.mockClear(); });

describe('SettingsBiometricsPage', () => {
  it('shows the required error when fields are blanked', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SettingsBiometricsPage /></MemoryRouter>);
    await user.clear(screen.getByLabelText('Altura (cm)'));
    await user.clear(screen.getByLabelText('Fecha de nacimiento'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Completa todos los campos.')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('shows the range error for an out-of-range height', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SettingsBiometricsPage /></MemoryRouter>);
    await user.clear(screen.getByLabelText('Altura (cm)'));
    await user.type(screen.getByLabelText('Altura (cm)'), '999');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(/fuera del rango/i)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('saves a valid form', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SettingsBiometricsPage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(mutateAsync).toHaveBeenCalledWith({ sex: 'male', birth_date: '1990-01-01', height_cm: 180 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/pages/settings/SettingsBiometricsPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/pages/settings/SettingsBiometricsPage.tsx
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsSubpageHeader } from '@/components/layout/SettingsSubpageHeader';
import { useProfile, useUpdateProfile } from '@/features/profile/hooks';
import {
  biometricsFormSchema,
  type BiometricsFormValues,
  type ParsedBiometricsForm,
} from '@/features/profile/schema';
import { todayInTZ } from '@/lib/dates';

export function SettingsBiometricsPage() {
  const { t } = useTranslation('settings');
  const { data: profile, isLoading } = useProfile();
  const update = useUpdateProfile();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<BiometricsFormValues, unknown, ParsedBiometricsForm>({
    resolver: zodResolver(biometricsFormSchema),
    defaultValues: { sex: '', birth_date: '', height_cm: '' },
  });

  useEffect(() => {
    if (!profile) return;
    form.reset({
      sex: (['male', 'female', 'other'] as const).includes(profile.sex as 'male')
        ? (profile.sex as BiometricsFormValues['sex'])
        : '',
      birth_date: profile.birth_date ?? '',
      height_cm: profile.height_cm != null ? String(profile.height_cm) : '',
    });
  }, [profile, form]);

  async function onSubmit(values: ParsedBiometricsForm) {
    setError(null);
    setSaved(false);
    try {
      await update.mutateAsync({
        sex: values.sex,
        birth_date: values.birth_date,
        height_cm: values.height_cm,
      });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message || t('errors.saveFailed'));
    }
  }

  // Combined message lines (parity with the old card): only after submit, never
  // per-field. `range` code → range line; any other code → required line.
  const errs = Object.values(form.formState.errors);
  const showRange = form.formState.isSubmitted && errs.some((e) => e?.message === 'range');
  const showRequired = form.formState.isSubmitted && errs.some((e) => e?.message !== 'range');

  return (
    <div className="space-y-6 max-w-2xl">
      <SettingsSubpageHeader title={t('biometrics.title')} />
      <p className="text-sm text-muted-foreground">{t('biometrics.description')}</p>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sex">{t('biometrics.sex')}</Label>
              <Controller
                control={form.control}
                name="sex"
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger id="sex"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">{t('biometrics.sexMale')}</SelectItem>
                      <SelectItem value="female">{t('biometrics.sexFemale')}</SelectItem>
                      <SelectItem value="other">{t('biometrics.sexOther')}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="birthDate">{t('biometrics.birthDate')}</Label>
              <Input id="birthDate" type="date" max={todayInTZ()} {...form.register('birth_date')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="heightCm">{t('biometrics.heightCm')}</Label>
              <Input id="heightCm" type="number" inputMode="decimal" min={100} max={250} step="0.1" {...form.register('height_cm')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="initialWeightKg">{t('biometrics.initialWeightKg')}</Label>
              <Input
                id="initialWeightKg"
                value={profile?.initial_weight_kg != null ? String(profile.initial_weight_kg) : ''}
                disabled
              />
              <p className="text-xs text-muted-foreground">{t('biometrics.initialWeightKgHelp')}</p>
            </div>
            {showRequired && <p className="text-sm text-destructive">{t('errors.required')}</p>}
            {showRange && <p className="text-sm text-destructive">{t('errors.outOfRange')}</p>}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={update.isPending || isLoading}>
                {update.isPending ? t('actions.saving') : t('actions.save')}
              </Button>
              {saved && !update.isPending && (
                <span className="text-sm text-muted-foreground">{t('actions.saved')}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/pages/settings/SettingsBiometricsPage.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/settings/SettingsBiometricsPage.tsx src/pages/settings/SettingsBiometricsPage.test.tsx
git commit -m "feat(settings): biometrics sub-page"
```

---

## Task 5: SettingsAccountPage

**Files:** Create `src/pages/settings/SettingsAccountPage.tsx` + `.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/settings/SettingsAccountPage.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';

const signOut = vi.fn();
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut, user: { email: 'qa@x.dev' } }),
}));
// DeleteAccountDialog imports ../api (supabase client) at module load; stub it
// so the import chain stays inert in CI (no VITE_SUPABASE_* env).
vi.mock('@/features/account/api', () => ({ deleteAccount: vi.fn() }));

import { SettingsAccountPage } from './SettingsAccountPage';

beforeEach(async () => { await i18n.changeLanguage('es'); signOut.mockClear(); });

describe('SettingsAccountPage', () => {
  it('shows the email and signs out', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SettingsAccountPage /></MemoryRouter>);
    expect(screen.getByDisplayValue('qa@x.dev')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(signOut).toHaveBeenCalled();
  });

  it('opens the delete-account dialog', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SettingsAccountPage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Eliminar cuenta' }));
    expect(await screen.findByText('Eliminar cuenta', { selector: 'h2, [role="heading"]' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/pages/settings/SettingsAccountPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/pages/settings/SettingsAccountPage.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingsSubpageHeader } from '@/components/layout/SettingsSubpageHeader';
import { useAuth } from '@/features/auth/AuthProvider';
import { DeleteAccountDialog } from '@/features/account/components/DeleteAccountDialog';

export function SettingsAccountPage() {
  const { t } = useTranslation('settings');
  const { user, signOut } = useAuth();
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className="space-y-6 max-w-2xl">
      <SettingsSubpageHeader title={t('account.title')} />
      <p className="text-sm text-muted-foreground">{t('account.description')}</p>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="email">{t('account.email')}</Label>
            <Input id="email" value={user?.email ?? ''} disabled />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void signOut()}>
              {t('account.signOut')}
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              {t('account.delete.button')}
            </Button>
          </div>
        </CardContent>
      </Card>
      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/pages/settings/SettingsAccountPage.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/settings/SettingsAccountPage.tsx src/pages/settings/SettingsAccountPage.test.tsx
git commit -m "feat(settings): account sub-page (email, sign out, delete)"
```

---

## Task 6: SettingsPage index (hero + grouped rows + inline controls)

**Files:** Modify `src/pages/SettingsPage.tsx`; Create `src/pages/SettingsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/SettingsPage.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';

const updateMutate = vi.fn();
vi.mock('@/features/profile/hooks', () => ({
  useProfile: () => ({ data: { display_name: 'Gonzalo', language: 'es' }, isLoading: false }),
  useUpdateProfile: () => ({ mutate: updateMutate, isPending: false }),
}));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { email: 'gonzalo@x.dev' } }),
}));
const setTheme = vi.fn();
vi.mock('@/features/theme/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'system', setTheme }),
}));

import { SettingsPage } from './SettingsPage';

beforeEach(async () => { await i18n.changeLanguage('es'); updateMutate.mockClear(); });

describe('SettingsPage index', () => {
  it('renders the hero, group headers and drill-in rows', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    expect(screen.getByText('Gonzalo')).toBeInTheDocument();
    expect(screen.getByText('gonzalo@x.dev')).toBeInTheDocument();
    expect(screen.getByText('Preferencias')).toBeInTheDocument();
    expect(screen.getByText('Tú')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Biometría/ })).toHaveAttribute('href', '/settings/biometrics');
    expect(screen.getByRole('link', { name: /Cuenta y sesión/ })).toHaveAttribute('href', '/settings/account');
  });

  it('switches language inline (persists via mutation)', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'EN' }));
    expect(updateMutate).toHaveBeenCalledWith({ language: 'en' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/pages/SettingsPage.test.tsx`
Expected: FAIL — old `SettingsPage` has no hero/EN button.

- [ ] **Step 3: Rewrite the index**

Overwrite `src/pages/SettingsPage.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronRight, Globe, Palette, Ruler, User, UserCog } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile, useUpdateProfile } from '@/features/profile/hooks';
import { useTheme, type Theme } from '@/features/theme/ThemeProvider';

type Lang = 'es' | 'en';
type Tone = 'indigo' | 'green' | 'amber' | 'rose';

const TONE: Record<Tone, string> = {
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400',
  green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400',
};

function IconChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', TONE[tone])}>
      {children}
    </span>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="overflow-hidden rounded-xl border bg-card">{children}</div>
    </div>
  );
}

function ControlRow({
  icon, tone, label, children,
}: { icon: React.ReactNode; tone: Tone; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
      <IconChip tone={tone}>{icon}</IconChip>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

function LinkRow({
  to, icon, tone, label,
}: { to: string; icon: React.ReactNode; tone: Tone; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-accent"
    >
      <IconChip tone={tone}>{icon}</IconChip>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export function SettingsPage() {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const update = useUpdateProfile();
  const { theme, setTheme } = useTheme();

  const language: Lang = profile?.language === 'en' ? 'en' : 'es';

  async function changeLanguage(next: Lang) {
    if (next === language) return;
    await i18n.changeLanguage(next);
    update.mutate({ language: next });
  }

  if (isLoading || !profile) {
    return <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>;
  }

  const name = profile.display_name?.trim() || (user?.email?.split('@')[0] ?? '');
  const initial = (name || 'U').charAt(0).toUpperCase();

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>

      <Link
        to="/settings/profile"
        className="flex items-center gap-4 rounded-xl border bg-gradient-to-br from-primary/5 to-primary/10 p-4 transition-colors hover:from-primary/10 hover:to-primary/15"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
          {initial}
        </span>
        <div className="min-w-0">
          <div className="truncate font-semibold">{name}</div>
          <div className="truncate text-sm text-muted-foreground">{user?.email}</div>
        </div>
        <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-muted-foreground" />
      </Link>

      <Group label={t('groups.preferences')}>
        <ControlRow icon={<Globe className="h-4 w-4" />} tone="green" label={t('language.title')}>
          <div className="flex rounded-lg border p-0.5 text-xs">
            {(['es', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => void changeLanguage(l)}
                className={cn(
                  'rounded-md px-3 py-1 font-semibold transition-colors',
                  language === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </ControlRow>
        <ControlRow icon={<Palette className="h-4 w-4" />} tone="amber" label={t('appearance.theme')}>
          <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="system">{t('appearance.system')}</SelectItem>
              <SelectItem value="light">{t('appearance.light')}</SelectItem>
              <SelectItem value="dark">{t('appearance.dark')}</SelectItem>
            </SelectContent>
          </Select>
        </ControlRow>
      </Group>

      <Group label={t('groups.you')}>
        <LinkRow to="/settings/profile" icon={<User className="h-4 w-4" />} tone="indigo" label={t('profile.title')} />
        <LinkRow to="/settings/biometrics" icon={<Ruler className="h-4 w-4" />} tone="indigo" label={t('biometrics.title')} />
      </Group>

      <Group label={t('groups.account')}>
        <LinkRow to="/settings/account" icon={<UserCog className="h-4 w-4" />} tone="rose" label={t('rows.accountAndSession')} />
      </Group>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/pages/SettingsPage.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/SettingsPage.tsx src/pages/SettingsPage.test.tsx
git commit -m "feat(settings): grouped index with profile hero + inline controls"
```

---

## Task 7: Routes

**Files:** Modify `src/app/router.tsx`

- [ ] **Step 1: Add imports**

After the `import { SettingsPage } from '@/pages/SettingsPage';` line, add:

```tsx
import { SettingsProfilePage } from '@/pages/settings/SettingsProfilePage';
import { SettingsBiometricsPage } from '@/pages/settings/SettingsBiometricsPage';
import { SettingsAccountPage } from '@/pages/settings/SettingsAccountPage';
```

- [ ] **Step 2: Add the routes**

Replace `          <Route path="/settings" element={<SettingsPage />} />` with:

```tsx
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/profile" element={<SettingsProfilePage />} />
          <Route path="/settings/biometrics" element={<SettingsBiometricsPage />} />
          <Route path="/settings/account" element={<SettingsAccountPage />} />
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/router.tsx
git commit -m "feat(settings): routes for profile/biometrics/account sub-pages"
```

---

## Task 8: Full verification + PR

- [ ] **Step 1: Full gate**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all PASS (0 lint errors).

- [ ] **Step 2: Push + PR into develop**

```bash
git push -u origin claude/settings-redesign
gh pr create --base develop --title "feat(settings): grouped list redesign with drill-in sub-pages" --body "Implements docs/superpowers/specs/2026-05-24-settings-redesign-design.md. Grouped settings index (profile hero, inline Idioma/Tema) with Perfil/Biometría/Cuenta as drill-in sub-pages. Behaviour (validation, instant-apply, delete) preserved."
```

Expected: CI green; squash-merge into develop (don't `--auto` while still pushing — memory *develop CI gate*).

---

## Notes for the implementer

- **Worktree** `D:\dev\hf-settings` (branch `claude/settings-redesign`); run all `pnpm`/`git` there.
- **Behaviour parity** is the bar — the profile/biometrics forms and delete flow are moved, not redesigned. The biometrics `required`/`range` split keys off the zod message code (`'range'` vs other).
- **Tier-2 tests** are `*.test.tsx` with `// @vitest-environment jsdom`; stub `@/features/profile/hooks`, `@/features/auth/AuthProvider`, `@/features/theme/ThemeProvider` as shown. `DeleteAccountDialog` pulls in `@/features/account/api` (supabase) only on confirm; if the account test trips the supabase-env throw, mock `@/features/account/api`'s `deleteAccount` (memory *component test supabase env*).
- After develop merges, the main promotion is **batched with the sidebar fix** in one release PR (pending user approval).
