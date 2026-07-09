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
import { PageShell } from '@/components/layout/PageShell';
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
    <PageShell title={t('biometrics.title')} back="/settings">
    <div className="space-y-6 max-w-2xl">
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
    </PageShell>
  );
}
