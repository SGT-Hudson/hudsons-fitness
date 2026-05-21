import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile, useUpdateProfile } from '@/features/profile/hooks';
import {
  biometricsFormSchema,
  displayNameFormSchema,
  type BiometricsFormValues,
  type DisplayNameFormValues,
  type ParsedBiometricsForm,
} from '@/features/profile/schema';
import { useTheme, type Theme } from '@/features/theme/ThemeProvider';
import { DeleteAccountDialog } from '@/features/account/components/DeleteAccountDialog';
import { todayInTZ } from '@/lib/dates';

type Lang = 'es' | 'en';

export function SettingsPage() {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { i18n } = useTranslation();
  const { user, signOut } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const update = useUpdateProfile();
  const { theme, setTheme } = useTheme();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [language, setLanguage] = useState<Lang>('es');
  const [contributeOff, setContributeOff] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedSection, setSavedSection] = useState<string | null>(null);

  // Profile card (display_name) — RHF + zod (D-C2/D-C3).
  const profileForm = useForm<DisplayNameFormValues>({
    resolver: zodResolver(displayNameFormSchema),
    defaultValues: { display_name: '' },
  });

  // Biometrics card — RHF + zod. Numeric inputs coerced via the schema.
  const bioForm = useForm<BiometricsFormValues, unknown, ParsedBiometricsForm>({
    resolver: zodResolver(biometricsFormSchema),
    defaultValues: { sex: '', birth_date: '', height_cm: '' },
  });

  useEffect(() => {
    if (!profile) return;
    setLanguage((profile.language === 'en' ? 'en' : 'es') as Lang);
    setContributeOff(profile.contribute_to_off ?? true);
    profileForm.reset({ display_name: profile.display_name ?? '' });
    bioForm.reset({
      sex: (['male', 'female', 'other'] as const).includes(profile.sex as 'male')
        ? (profile.sex as BiometricsFormValues['sex'])
        : '',
      birth_date: profile.birth_date ?? '',
      height_cm: profile.height_cm != null ? String(profile.height_cm) : '',
    });
  }, [profile, profileForm, bioForm]);

  async function saveSection<T extends object>(section: string, patch: T) {
    setError(null);
    setSavedSection(null);
    try {
      await update.mutateAsync(patch);
      setSavedSection(section);
    } catch (err) {
      setError((err as Error).message || t('errors.saveFailed'));
    }
  }

  async function onSaveProfile(values: DisplayNameFormValues) {
    await saveSection('profile', { display_name: values.display_name.trim() || null });
  }

  async function handleSaveLanguage(next: Lang) {
    setLanguage(next);
    await i18n.changeLanguage(next);
    await saveSection('language', { language: next });
  }

  async function handleToggleContribute(next: boolean) {
    setContributeOff(next);
    await saveSection('contribute', { contribute_to_off: next });
  }

  async function onSaveBiometrics(values: ParsedBiometricsForm) {
    await saveSection('biometrics', {
      sex: values.sex,
      birth_date: values.birth_date,
      height_cm: values.height_cm,
    });
  }

  // Combined biometrics message line(s): shown only after a submit attempt,
  // never per-field. The schema now tags an out-of-bound numeric value with
  // the distinct `range` code (vs `required` for a blank field), so an
  // out-of-range value surfaces a range-specific line instead of the
  // misleading "fill in all fields" copy. Enforcement is unchanged.
  const bioErrorList = Object.values(bioForm.formState.errors);
  const bioRange =
    bioForm.formState.isSubmitted &&
    bioErrorList.some((e) => e?.message === 'range');
  const bioRequired =
    bioForm.formState.isSubmitted &&
    bioErrorList.some((e) => e?.message !== 'range');

  if (isLoading || !profile) {
    return <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('profile.title')}</CardTitle>
          <CardDescription>{t('profile.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={profileForm.handleSubmit(onSaveProfile)}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="displayName">{t('profile.displayName')}</Label>
              <Input id="displayName" {...profileForm.register('display_name')} />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? t('actions.saving') : t('actions.save')}
              </Button>
              {savedSection === 'profile' && !update.isPending && (
                <span className="text-sm text-muted-foreground">{t('actions.saved')}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('language.title')}</CardTitle>
          <CardDescription>{t('language.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Language is an instant-apply single control (persists to
              profile.language on change, per D-E1) — not a validated submit
              form, so it stays a controlled Select (no RHF needed). */}
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="language">{t('language.title')}</Label>
            <Select
              value={language}
              onValueChange={(v) => void handleSaveLanguage(v as Lang)}
            >
              <SelectTrigger id="language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="es">{t('language.es')}</SelectItem>
                <SelectItem value="en">{t('language.en')}</SelectItem>
              </SelectContent>
            </Select>
            {savedSection === 'language' && !update.isPending && (
              <p className="text-sm text-muted-foreground">{t('actions.saved')}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('appearance.title')}</CardTitle>
          <CardDescription>{t('appearance.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Theme is localStorage-only (D-F6, never profile-backed) and
              instant-apply — a controlled Select, not a form. */}
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="theme">{t('appearance.theme')}</Label>
            <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
              <SelectTrigger id="theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">{t('appearance.system')}</SelectItem>
                <SelectItem value="light">{t('appearance.light')}</SelectItem>
                <SelectItem value="dark">{t('appearance.dark')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('privacy.title')}</CardTitle>
          <CardDescription>{t('privacy.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={contributeOff}
              onChange={(e) => void handleToggleContribute(e.target.checked)}
            />
            {t('privacy.contributeOff')}
          </label>
          {savedSection === 'contribute' && !update.isPending && (
            <p className="text-sm text-muted-foreground mt-2">{t('actions.saved')}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('biometrics.title')}</CardTitle>
          <CardDescription>{t('biometrics.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={bioForm.handleSubmit(onSaveBiometrics)}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="sex">{t('biometrics.sex')}</Label>
              <Controller
                control={bioForm.control}
                name="sex"
                render={({ field }) => (
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger id="sex">
                      <SelectValue />
                    </SelectTrigger>
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
              <Input
                id="birthDate"
                type="date"
                max={todayInTZ()}
                {...bioForm.register('birth_date')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="heightCm">{t('biometrics.heightCm')}</Label>
              <Input
                id="heightCm"
                type="number"
                inputMode="decimal"
                min={100}
                max={250}
                step="0.1"
                {...bioForm.register('height_cm')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="initialWeightKg">{t('biometrics.initialWeightKg')}</Label>
              <Input
                id="initialWeightKg"
                value={profile.initial_weight_kg != null ? String(profile.initial_weight_kg) : ''}
                disabled
              />
              <p className="text-xs text-muted-foreground">{t('biometrics.initialWeightKgHelp')}</p>
            </div>
            {bioRequired && (
              <p className="text-sm text-destructive">{t('errors.required')}</p>
            )}
            {bioRange && (
              <p className="text-sm text-destructive">{t('errors.outOfRange')}</p>
            )}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? t('actions.saving') : t('actions.save')}
              </Button>
              {savedSection === 'biometrics' && !update.isPending && (
                <span className="text-sm text-muted-foreground">{t('actions.saved')}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('account.title')}</CardTitle>
          <CardDescription>{t('account.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
