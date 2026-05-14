import { type FormEvent, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
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
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { useAuth } from '@/features/auth/AuthProvider';
import { isProfileOnboarded } from '@/features/profile/api';
import { useProfile, useUpdateProfile } from '@/features/profile/hooks';
import { estimateBoneKg } from '@/lib/macros';
import { isoDate } from '@/lib/dates';
import { differenceInYears, parseISO } from 'date-fns';

type Sex = 'male' | 'female' | 'other';

export function OnboardingPage() {
  const { t } = useTranslation('onboarding');
  const { t: tCommon } = useTranslation('common');
  const { t: tAuth } = useTranslation('auth');
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const update = useUpdateProfile();

  const [sex, setSex] = useState<Sex | ''>('');
  const [birthDate, setBirthDate] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [initialWeightKg, setInitialWeightKg] = useState('');
  const [boneKg, setBoneKg] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    if (profile.sex && (['male', 'female', 'other'] as const).includes(profile.sex as Sex)) {
      setSex(profile.sex as Sex);
    }
    if (profile.birth_date) setBirthDate(profile.birth_date);
    if (profile.height_cm) setHeightCm(String(profile.height_cm));
    if (profile.initial_weight_kg) setInitialWeightKg(String(profile.initial_weight_kg));
    if (profile.bone_kg) setBoneKg(String(profile.bone_kg));
  }, [profile]);

  if (isLoading) {
    return <div className="p-8 text-muted-foreground">{tCommon('loading')}</div>;
  }
  if (profile && isProfileOnboarded(profile)) {
    return <Navigate to="/diario" replace />;
  }

  function canEstimateBone() {
    return sex !== '' && birthDate !== '' && heightCm !== '' && initialWeightKg !== '';
  }

  function handleEstimate() {
    if (!canEstimateBone()) return;
    const ageYears = differenceInYears(new Date(), parseISO(birthDate));
    const estimated = estimateBoneKg({
      heightCm: Number(heightCm),
      weightKg: Number(initialWeightKg),
      ageYears,
      sex: sex as Sex,
    });
    if (Number.isFinite(estimated) && estimated > 0) {
      setBoneKg(estimated.toFixed(2));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!sex || !birthDate || !heightCm || !initialWeightKg || !boneKg) {
      setError(t('errors.required'));
      return;
    }
    try {
      await update.mutateAsync({
        sex,
        birth_date: birthDate,
        height_cm: Number(heightCm),
        initial_weight_kg: Number(initialWeightKg),
        bone_kg: Number(boneKg),
      });
      navigate('/diario', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="flex justify-end mb-4 gap-2">
          <LanguageSwitcher />
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            {tAuth('signOut')}
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t('title')}</CardTitle>
            <CardDescription>{t('subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sex">{t('sex.label')}</Label>
                <Select value={sex} onValueChange={(v) => setSex(v as Sex)}>
                  <SelectTrigger id="sex">
                    <SelectValue placeholder={t('sex.placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">{t('sex.male')}</SelectItem>
                    <SelectItem value="female">{t('sex.female')}</SelectItem>
                    <SelectItem value="other">{t('sex.other')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthDate">{t('birthDate')}</Label>
                <Input
                  id="birthDate"
                  type="date"
                  required
                  max={isoDate()}
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="heightCm">{t('heightCm')}</Label>
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
                <Label htmlFor="initialWeightKg">{t('initialWeightKg')}</Label>
                <div
                  role="alert"
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  {t('initialWeightWarning')}
                </div>
                <Input
                  id="initialWeightKg"
                  type="number"
                  inputMode="decimal"
                  required
                  min={20}
                  max={400}
                  step="0.1"
                  value={initialWeightKg}
                  onChange={(e) => setInitialWeightKg(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="boneKg">{t('boneKg.label')}</Label>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    disabled={!canEstimateBone()}
                    onClick={handleEstimate}
                  >
                    {t('boneKg.estimate')}
                  </Button>
                </div>
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
                <p className="text-xs text-muted-foreground">{t('boneKg.help')}</p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={update.isPending}>
                {update.isPending ? tCommon('loading') : t('submit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
