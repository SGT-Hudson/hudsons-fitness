import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTemplates } from '@/features/templates/hooks';
import {
  applyTemplateFormSchema,
  type ApplyTemplateFormValues,
} from '../schema';
import { formatDate, type Locale } from '@/lib/dates';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetDate: string;
  onApply: (templateId: string) => Promise<void>;
  busy?: boolean;
}

export function ApplyTemplateDialog({
  open,
  onOpenChange,
  targetDate,
  onApply,
  busy,
}: Props) {
  const { t, i18n } = useTranslation('planning');
  const { t: tCommon } = useTranslation('common');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;
  const templates = useTemplates();
  const [error, setError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ApplyTemplateFormValues>({
    resolver: zodResolver(applyTemplateFormSchema),
    defaultValues: { templateId: '' },
  });

  useEffect(() => {
    if (open) {
      setError(null);
      reset({ templateId: '' });
    }
  }, [open, reset]);

  async function onValid(values: ApplyTemplateFormValues) {
    setError(null);
    try {
      await onApply(values.templateId);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Parity: the page showed t('apply.errors.pickTemplate') when none picked.
  const pickError = errors.templateId ? t('apply.errors.pickTemplate') : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('apply.title')}</DialogTitle>
          <DialogDescription>
            {t('apply.subtitle', {
              date: formatDate(targetDate, 'd MMM yyyy', locale),
            })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onValid)}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apply-template">{t('apply.template')}</Label>
              <Controller
                control={control}
                name="templateId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="apply-template">
                      <SelectValue placeholder={t('apply.placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {(templates.data ?? []).map((tpl) => (
                        <SelectItem key={tpl.id} value={tpl.id}>
                          {tpl.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {(templates.data ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">{t('apply.noTemplates')}</p>
              )}
            </div>
            {(pickError || error) && (
              <p className="text-sm text-destructive">{pickError ?? error}</p>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? tCommon('loading') : t('apply.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
