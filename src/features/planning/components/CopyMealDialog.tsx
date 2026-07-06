import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface CopyTarget {
  key: string;
  label: string;
  sublabel?: string;
  willOverwrite: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceLabel: string;
  entryCount: number;
  targets: CopyTarget[];
  busy?: boolean;
  onConfirm: (selectedKeys: string[]) => void | Promise<void>;
}

function Box({ state }: { state: 'on' | 'off' | 'some' }) {
  return (
    <span
      className={cn(
        'flex h-4 w-4 items-center justify-center rounded border',
        state === 'off' ? 'border-muted-foreground/50' : 'border-primary bg-primary text-primary-foreground',
      )}
    >
      {state === 'on' && <Check className="h-3 w-3" />}
      {state === 'some' && <span className="h-0.5 w-2 bg-primary-foreground" />}
    </span>
  );
}

export function CopyMealDialog({
  open,
  onOpenChange,
  sourceLabel,
  entryCount,
  targets,
  busy,
  onConfirm,
}: Props) {
  const { t } = useTranslation('planning');
  const { t: tCommon } = useTranslation('common');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  const allSelected = targets.length > 0 && selected.size === targets.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === targets.length ? new Set() : new Set(targets.map((tg) => tg.key)),
    );
  }

  async function confirm() {
    // Preserve target order in the emitted keys.
    await onConfirm(targets.filter((tg) => selected.has(tg.key)).map((tg) => tg.key));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('copyMeal.title')}</DialogTitle>
          <DialogDescription>
            {sourceLabel} · {t('copyMeal.entryCount', { count: entryCount })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <button
            type="button"
            role="checkbox"
            aria-checked={allSelected ? 'true' : someSelected ? 'mixed' : 'false'}
            aria-label={t('copyMeal.selectAll')}
            onClick={toggleAll}
            className="flex w-full items-center gap-3 border-b border-dashed py-2 text-sm font-semibold"
          >
            <Box state={allSelected ? 'on' : someSelected ? 'some' : 'off'} />
            <span>{t('copyMeal.selectAll')}</span>
          </button>

          <div className="max-h-60 overflow-auto">
            {targets.map((tg) => {
              const on = selected.has(tg.key);
              return (
                <button
                  key={tg.key}
                  type="button"
                  role="checkbox"
                  aria-checked={on ? 'true' : 'false'}
                  aria-label={tg.label}
                  onClick={() => toggle(tg.key)}
                  className="flex w-full items-center gap-3 border-b py-2.5 text-sm last:border-b-0"
                >
                  <Box state={on ? 'on' : 'off'} />
                  <span className="flex-1 text-left">
                    {tg.label}
                    {tg.sublabel && (
                      <span className="ml-2 text-xs text-muted-foreground">{tg.sublabel}</span>
                    )}
                  </span>
                  {tg.willOverwrite && (
                    <span className="rounded-full border border-transparent bg-amber-soft px-2 py-0.5 text-xs text-amber-ink">
                      {t('copyMeal.willOverwrite')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter className="mt-2 items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {t('copyMeal.selectedCount', { count: selected.size })}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
            <Button type="button" onClick={confirm} disabled={busy || selected.size === 0}>
              {busy ? tCommon('loading') : t('copyMeal.confirm')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
