import { type FormEvent, useEffect, useState } from 'react';
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
import { useTheme, type Theme } from '@/features/theme/ThemeProvider';

type Sex = 'male' | 'female' | 'other';
type Lang = 'es' | 'en';

const SEX_VALUES: Sex[] = ['male', 'female', 'other'];

export function SettingsPage() {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { i18n } = useTranslation();
  const { user, signOut } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const update = useUpdateProfile();
  const { theme, setTheme } = useTheme();

  const [displayName, setDisplayName] = useState('');
  const [language, setLanguage] = useState<Lang>('es');
  const [sex, setSex] = useState<Sex | ''>('');
  const [birthDate, setBirthDate] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [boneKg, setBoneKg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedSection, setSavedSection] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? '');
    setLanguage((profile.language === 'en' ? 'en' : 'es') as Lang);
    if (profile.sex && SEX_VALUES.includes(profile.sex as Sex)) {
      setSex(profile.sex as Sex);
    }
    setBirthDate(profile.birth_date ?? '');
    setHeightCm(profile.height_cm != null ? String(profile.height_cm) : '');
    setBoneKg(profile.bone_kg != null ? String(profile.bone_kg) : '');
  }, [profile]);

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

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    await saveSection('profile', { display_name: displayName.trim() || null });
  }

  async function handleSaveLanguage(next: Lang) {
    setLanguage(next);
    await i18n.changeLanguage(next);
    await saveSection('language', { language: next });
  }

  async function handleSaveBiometrics(e: FormEvent) {
    e.preventDefault();
    if (!sex || !birthDate || !heightCm || !boneKg) {
      setError(t('errors.required'));
      return;
    }
    await saveSection('biometrics', {
      sex,
      birth_date: birthDate,
      height_cm: Number(heightCm),
      bone_kg: Number(boneKg),
    });
  }

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
          <form onSubmit={(e) => void handleSaveProfile(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">{t('profile.displayName')}</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
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
          <CardTitle>{t('biometrics.title')}</CardTitle>
          <CardDescription>{t('biometrics.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSaveBiometrics(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sex">{t('biometrics.sex')}</Label>
              <Select value={sex} onValueChange={(v) => setSex(v as Sex)}>
                <SelectTrigger id="sex">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">{t('biometrics.sexMale')}</SelectItem>
                  <SelectItem value="female">{t('biometrics.sexFemale')}</SelectItem>
                  <SelectItem value="other">{t('biometrics.sexOther')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="birthDate">{t('biometrics.birthDate')}</Label>
              <Input
                id="birthDate"
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="heightCm">{t('biometrics.heightCm')}</Label>
                <Input
                  id="heightCm"
                  type="number"
                  inputMode="decimal"
                  required
                  min={100}
                  max={250}
                  step="0.1"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="boneKg">{t('biometrics.boneKg')}</Label>
                <Input
                  id="boneKg"
                  type="number"
                  inputMode="decimal"
                  required
                  min={0.5}
                  max={20}
                  step="0.01"
                  value={boneKg}
                  onChange={(e) => setBoneKg(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t('biometrics.boneKgHelp')}</p>
            <div className="space-y-2">
              <Label htmlFor="initialWeightKg">{t('biometrics.initialWeightKg')}</Label>
              <Input
                id="initialWeightKg"
                value={profile.initial_weight_kg != null ? String(profile.initial_weight_kg) : ''}
                disabled
              />
              <p className="text-xs text-muted-foreground">{t('biometrics.initialWeightKgHelp')}</p>
            </div>
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
          <Button variant="outline" onClick={() => void signOut()}>
            {t('account.signOut')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
