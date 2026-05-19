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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCopyDay } from '@/features/diario/hooks';
import { isoDate } from '@/lib/dates';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The day being viewed — copy destination. */
  targetDate: string;
}

function previousISO(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function CopyDayDialog({ open, onOpenChange, targetDate }: Props) {
  const { t } = useTranslation('diario');
  const { t: tCommon } = useTranslation('common');
  const copy = useCopyDay();
  const [sourceDate, setSourceDate] = useState(() => previousISO(targetDate));

  useEffect(() => {
    if (open) setSourceDate(previousISO(targetDate));
  }, [open, targetDate]);

  const today = isoDate();
  const sameDay = sourceDate === targetDate;

  async function onConfirm() {
    if (sameDay) return;
    await copy.mutateAsync({ sourceDate, targetDate });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('copyDay.title')}</DialogTitle>
          <DialogDescription>{t('copyDay.subtitle')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="copy-day-source">{t('copyDay.sourceLabel')}</Label>
          <Input
            id="copy-day-source"
            type="date"
            value={sourceDate}
            max={today}
            onChange={(e) => setSourceDate(e.target.value)}
          />
          {sameDay && (
            <p className="text-sm text-destructive">{t('copyDay.sameDay')}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={sameDay || copy.isPending}
          >
            {copy.isPending ? tCommon('loading') : t('copyDay.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
