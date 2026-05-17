import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  saveAsTemplateFormSchema,
  type SaveAsTemplateFormValues,
} from '../schema';
import { formatDate, type Locale } from '@/lib/dates';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: string;
  onSave: (name: string) => Promise<void>;
  busy?: boolean;
}

export function SaveAsTemplateDialog({
  open,
  onOpenChange,
  weekStart,
  onSave,
  busy,
}: Props) {
  const { t, i18n } = useTranslation('planning');
  const { t: tCommon } = useTranslation('common');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SaveAsTemplateFormValues>({
    resolver: zodResolver(saveAsTemplateFormSchema),
    defaultValues: { name: '' },
  });

  useEffect(() => {
    if (open) {
      const suggestion = t('save.defaultName', {
        date: formatDate(weekStart, 'd MMM yyyy', locale),
      });
      reset({ name: suggestion });
      setError(null);
    }
  }, [open, weekStart, t, locale, reset]);

  async function onValid(values: SaveAsTemplateFormValues) {
    setError(null);
    try {
      await onSave(values.name.trim());
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Parity: prior code showed t('save.errors.nameRequired') on blank name.
  const nameError = errors.name ? t('save.errors.nameRequired') : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('save.title')}</DialogTitle>
          <DialogDescription>{t('save.subtitle')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onValid)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="save-tpl-name">{t('save.name')}</Label>
            <Input id="save-tpl-name" {...register('name')} />
          </div>
          {(nameError || error) && (
            <p className="text-sm text-destructive">{nameError ?? error}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? tCommon('loading') : tCommon('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
