import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWeekShopping } from '@/features/planner/hooks';
import { aggregateShoppingList } from '@/features/planner/shopping';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: string;
}

function storageKey(weekStart: string) {
  return `hudsons-fitness-shopping-${weekStart}`;
}

function loadChecked(weekStart: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(weekStart));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function ShoppingListDialog({ open, onOpenChange, weekStart }: Props) {
  const { t } = useTranslation('planning');
  const query = useWeekShopping(weekStart, open);

  const items = useMemo(
    () => (query.data ? aggregateShoppingList(query.data) : []),
    [query.data],
  );

  const [checked, setChecked] = useState<Set<string>>(() => loadChecked(weekStart));

  useEffect(() => {
    if (open) setChecked(loadChecked(weekStart));
  }, [open, weekStart]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      storageKey(weekStart),
      JSON.stringify([...checked]),
    );
  }, [checked, weekStart]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('shopping.title')}</DialogTitle>
          <DialogDescription>{t('shopping.subtitle')}</DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('shopping.empty')}
          </p>
        ) : (
          <>
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                disabled={checked.size === 0}
                onClick={() => setChecked(new Set())}
              >
                {t('shopping.clearChecked')}
              </Button>
            </div>
            <ul className="max-h-[55vh] overflow-y-auto divide-y">
              {items.map((item) => {
                const isChecked = checked.has(item.ingredientId);
                const suffix =
                  item.unitType === 'unit' ? ` ${t('shopping.unit')}` : ' g';
                return (
                  <li key={item.ingredientId}>
                    <label
                      className={cn(
                        'flex items-center gap-3 py-2 px-1 cursor-pointer',
                        isChecked && 'opacity-50',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-primary"
                        checked={isChecked}
                        onChange={() => toggle(item.ingredientId)}
                      />
                      <span
                        className={cn(
                          'flex-1 min-w-0 truncate text-sm',
                          isChecked && 'line-through',
                        )}
                      >
                        {item.name}
                        {item.brand ? (
                          <span className="text-muted-foreground">
                            {' '}
                            · {item.brand}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {item.totalQuantity}
                        {suffix}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
