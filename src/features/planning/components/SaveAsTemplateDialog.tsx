import { useEffect, useState, type FormEvent } from 'react';
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
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const suggestion = t('save.defaultName', {
        date: formatDate(weekStart, 'd MMM yyyy', locale),
      });
      setName(suggestion);
      setError(null);
    }
  }, [open, weekStart, t, locale]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (trimmed === '') {
      setError(t('save.errors.nameRequired'));
      return;
    }
    try {
      await onSave(trimmed);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('save.title')}</DialogTitle>
          <DialogDescription>{t('save.subtitle')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="save-tpl-name">{t('save.name')}</Label>
            <Input
              id="save-tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
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
