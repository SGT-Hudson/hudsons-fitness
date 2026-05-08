import { useEffect, useState } from 'react';
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
  const [templateId, setTemplateId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setTemplateId('');
    }
  }, [open]);

  async function handleSubmit() {
    if (!templateId) {
      setError(t('apply.errors.pickTemplate'));
      return;
    }
    try {
      await onApply(templateId);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

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
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apply-template">{t('apply.template')}</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
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
            {(templates.data ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">{t('apply.noTemplates')}</p>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon('cancel')}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={busy}>
            {busy ? tCommon('loading') : t('apply.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
