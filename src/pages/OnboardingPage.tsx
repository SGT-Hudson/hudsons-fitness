import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import {
  onboardingFormSchema,
  type OnboardingFormValues,
  type ParsedOnboardingForm,
} from '@/features/profile/schema';
import { estimateBoneKg } from '@/lib/macros';
import { todayInTZ } from '@/lib/dates';
import { differenceInYears, parseISO } from 'date-fns';

export function OnboardingPage() {
  const { t } = useTranslation('onboarding');
  const { t: tCommon } = useTranslation('common');
  const { t: tAuth } = useTranslation('auth');
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const update = useUpdateProfile();
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitted },
  } = useForm<OnboardingFormValues, unknown, ParsedOnboardingForm>({
    resolver: zodResolver(onboardingFormSchema),
    defaultValues: {
      sex: '',
      birth_date: '',
      height_cm: '',
      initial_weight_kg: '',
      bone_kg: '',
    },
  });

  useEffect(() => {
    if (!profile) return;
    reset({
      sex: (['male', 'female', 'other'] as const).includes(profile.sex as 'male')
        ? (profile.sex as OnboardingFormValues['sex'])
        : '',
      birth_date: profile.birth_date ?? '',
      height_cm: profile.height_cm != null ? String(profile.height_cm) : '',
      initial_weight_kg:
        profile.initial_weight_kg != null ? String(profile.initial_weight_kg) : '',
      bone_kg: profile.bone_kg != null ? String(profile.bone_kg) : '',
    });
  }, [profile, reset]);

  const sex = watch('sex');
  const birthDate = watch('birth_date');
  const heightCm = watch('height_cm');
  const initialWeightKg = watch('initial_weight_kg');

  if (isLoading) {
    return <div className="p-8 text-muted-foreground">{tCommon('loading')}</div>;
  }
  if (profile && isProfileOnboarded(profile)) {
    return <Navigate to="/diario" replace />;
  }

  const canEstimateBone =
    !!sex &&
    !!birthDate &&
    Number.isFinite(Number(heightCm)) &&
    Number(heightCm) > 0 &&
    Number.isFinite(Number(initialWeightKg)) &&
    Number(initialWeightKg) > 0;

  function handleEstimate() {
    if (!canEstimateBone) return;
    const ageYears = differenceInYears(new Date(), parseISO(birthDate));
    const estimated = estimateBoneKg({
      heightCm: Number(heightCm),
      weightKg: Number(initialWeightKg),
      ageYears,
      sex: sex as 'male' | 'female' | 'other',
    });
    if (Number.isFinite(estimated) && estimated > 0) {
      setValue('bone_kg', estimated.toFixed(2), { shouldValidate: true });
    }
  }

  async function onSubmit(values: ParsedOnboardingForm) {
    setError(null);
    try {
      await update.mutateAsync({
        sex: values.sex,
        birth_date: values.birth_date,
        height_cm: values.height_cm,
        initial_weight_kg: values.initial_weight_kg,
        bone_kg: values.bone_kg,
      });
      navigate('/diario', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Preserve the prior UX: combined message line(s) only after a submit
  // attempt, never per-field, never before first submit. The schema now tags
  // an out-of-bound numeric value with the distinct `range` code (vs the
  // `required` code for a blank field), so a non-empty out-of-range value
  // surfaces a range-specific line instead of the misleading "fill in all
  // fields" copy. Enforcement (which values submit) is unchanged.
  const errorList = Object.values(errors);
  const showRange =
    isSubmitted && errorList.some((e) => e?.message === 'range');
  const showRequired =
    isSubmitted && errorList.some((e) => e?.message !== 'range');

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
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sex">{t('sex.label')}</Label>
                <Controller
                  control={control}
                  name="sex"
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
                      <SelectTrigger id="sex">
                        <SelectValue placeholder={t('sex.placeholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">{t('sex.male')}</SelectItem>
                        <SelectItem value="female">{t('sex.female')}</SelectItem>
                        <SelectItem value="other">{t('sex.other')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthDate">{t('birthDate')}</Label>
                <Input
                  id="birthDate"
                  type="date"
                  max={todayInTZ()}
                  {...register('birth_date')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="heightCm">{t('heightCm')}</Label>
                <Input
                  id="heightCm"
                  type="number"
                  inputMode="decimal"
                  min={100}
                  max={250}
                  step="0.1"
                  {...register('height_cm')}
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
                  min={20}
                  max={400}
                  step="0.1"
                  {...register('initial_weight_kg')}
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
                    disabled={!canEstimateBone}
                    onClick={handleEstimate}
                  >
                    {t('boneKg.estimate')}
                  </Button>
                </div>
                <Input
                  id="boneKg"
                  type="number"
                  inputMode="decimal"
                  min={0.5}
                  max={20}
                  step="0.01"
                  {...register('bone_kg')}
                />
                <p className="text-xs text-muted-foreground">{t('boneKg.help')}</p>
              </div>
              {showRequired && <p className="text-sm text-destructive">{t('errors.required')}</p>}
              {showRange && <p className="text-sm text-destructive">{t('errors.outOfRange')}</p>}
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
