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
