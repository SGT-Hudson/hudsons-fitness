import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EyeOff, Plus, RotateCcw, Share2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { useWeekShopping } from '@/features/planner/hooks';
import {
  aggregateTotals,
  buildRecipeShopping,
  roundShoppingQuantity,
} from '@/features/planner/shopping';
import {
  appendExtra,
  formatShoppingListText,
  type ExtraItem,
} from '@/features/planner/shoppingExport';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: string;
}

type ShoppingView = 'total' | 'byRecipe';

// Per-week check-off state.
const checkedKey = (weekStart: string) => `hudsons-fitness-shopping-${weekStart}`;
// "Always have it" staples are cross-week (salt is always salt) → global key.
const STAPLES_KEY = 'hudsons-fitness-shopping-staples';
// Manual extras are per shopping trip → per-week.
const extrasKey = (weekStart: string) =>
  `hudsons-fitness-shopping-extras-${weekStart}`;

function loadSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function loadExtras(weekStart: string): ExtraItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(extrasKey(weekStart));
    return raw ? (JSON.parse(raw) as ExtraItem[]) : [];
  } catch {
    return [];
  }
}

function qtyLabel(qty: number, unitType: string, unitWord: string): string {
  return `${roundShoppingQuantity(qty, unitType)}${
    unitType === 'unit' ? ` ${unitWord}` : ' g'
  }`;
}

export function ShoppingListDialog({ open, onOpenChange, weekStart }: Props) {
  const { t } = useTranslation('planning');
  const query = useWeekShopping(weekStart, open);

  const recipes = useMemo(
    () => (query.data ? buildRecipeShopping(query.data) : []),
    [query.data],
  );

  const [view, setView] = useState<ShoppingView>('total');
  const [checked, setChecked] = useState<Set<string>>(() =>
    loadSet(checkedKey(weekStart)),
  );
  const [staples, setStaples] = useState<Set<string>>(() => loadSet(STAPLES_KEY));
  const [showStaples, setShowStaples] = useState(false);
  const [extras, setExtras] = useState<ExtraItem[]>(() => loadExtras(weekStart));
  const [extraInput, setExtraInput] = useState('');

  useEffect(() => {
    if (open) {
      setChecked(loadSet(checkedKey(weekStart)));
      setStaples(loadSet(STAPLES_KEY));
      setShowStaples(false);
      setExtras(loadExtras(weekStart));
      setExtraInput('');
    }
  }, [open, weekStart]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      checkedKey(weekStart),
      JSON.stringify([...checked]),
    );
  }, [checked, weekStart]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STAPLES_KEY, JSON.stringify([...staples]));
  }, [staples]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(extrasKey(weekStart), JSON.stringify(extras));
  }, [extras, weekStart]);

  function handleAddExtra() {
    setExtras((prev) => appendExtra(prev, extraInput, crypto.randomUUID()));
    setExtraInput('');
  }

  function handleRemoveExtra(id: string) {
    setExtras((prev) => prev.filter((e) => e.id !== id));
    setChecked((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function toggleChecked(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleStaple(id: string) {
    setStaples((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Total view always computes the full list; staples are filtered for
  // display so they can be un-hidden without recomputing.
  const allTotals = useMemo(() => aggregateTotals(recipes), [recipes]);
  const hiddenCount = allTotals.filter((i) =>
    staples.has(i.ingredientId),
  ).length;
  const visibleTotals = showStaples
    ? allTotals
    : allTotals.filter((i) => !staples.has(i.ingredientId));

  async function handleShare() {
    const text = formatShoppingListText({
      title: t('shopping.title'),
      items: visibleTotals.map((i) => ({
        name: i.name,
        brand: i.brand,
        totalQuantity: i.totalQuantity,
        unitType: i.unitType,
      })),
      extras,
      extrasTitle: t('shopping.extrasTitle'),
      unitWord: t('shopping.unit'),
    });
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: t('shopping.title'), text });
        return;
      }
    } catch (err) {
      // User dismissed the native share sheet — not an error.
      if ((err as Error)?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast({ variant: 'success', title: t('shopping.copied') });
    } catch {
      toast({ variant: 'destructive', title: t('shopping.shareFailed') });
    }
  }

  const isLoading = query.isLoading;
  const isEmpty = !isLoading && recipes.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('shopping.title')}</DialogTitle>
          <DialogDescription>{t('shopping.subtitle')}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : isEmpty ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('shopping.empty')}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex rounded-md border bg-background p-0.5">
                {(['total', 'byRecipe'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={cn(
                      'px-3 py-1 text-sm rounded-sm transition-colors',
                      view === v
                        ? 'bg-secondary'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t(v === 'total' ? 'shopping.viewTotal' : 'shopping.viewByRecipe')}
                  </button>
                ))}
              </div>
              {view === 'total' && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleShare()}
                  >
                    <Share2 className="h-4 w-4" />
                    {t('shopping.share')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={checked.size === 0}
                    onClick={() => setChecked(new Set())}
                  >
                    {t('shopping.clearChecked')}
                  </Button>
                </div>
              )}
            </div>

            {view === 'total' ? (
              <div className="max-h-[55vh] overflow-y-auto">
                <ul className="divide-y">
                  {visibleTotals.map((item) => {
                    const isChecked = checked.has(item.ingredientId);
                    const isStaple = staples.has(item.ingredientId);
                    return (
                      <li
                        key={item.ingredientId}
                        className={cn(
                          'flex items-center gap-2 py-2 px-1',
                          isChecked && 'opacity-50',
                          isStaple && 'opacity-60',
                        )}
                      >
                        <label className="flex flex-1 min-w-0 items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 accent-primary"
                            checked={isChecked}
                            onChange={() => toggleChecked(item.ingredientId)}
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
                            {qtyLabel(item.totalQuantity, item.unitType, t('shopping.unit'))}
                          </span>
                        </label>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          aria-label={
                            isStaple
                              ? t('shopping.unmarkStaple')
                              : t('shopping.markStaple')
                          }
                          aria-pressed={isStaple}
                          title={
                            isStaple
                              ? t('shopping.unmarkStaple')
                              : t('shopping.markStaple')
                          }
                          onClick={() => toggleStaple(item.ingredientId)}
                        >
                          {isStaple ? (
                            <RotateCcw className="h-3.5 w-3.5" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    className="mt-2 text-xs text-muted-foreground hover:text-foreground underline"
                    onClick={() => setShowStaples((s) => !s)}
                  >
                    {showStaples
                      ? t('shopping.hideStaples')
                      : t('shopping.showStaples', { count: hiddenCount })}
                  </button>
                )}

                <div className="mt-4 border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    {t('shopping.extrasTitle')}
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={extraInput}
                      onChange={(e) => setExtraInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddExtra();
                        }
                      }}
                      placeholder={t('shopping.addExtraPlaceholder')}
                      className="h-9"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-9 w-9 shrink-0"
                      aria-label={t('shopping.addExtra')}
                      disabled={extraInput.trim() === ''}
                      onClick={handleAddExtra}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {extras.length > 0 && (
                    <ul className="divide-y mt-1">
                      {extras.map((e) => {
                        const isChecked = checked.has(e.id);
                        return (
                          <li
                            key={e.id}
                            className={cn(
                              'flex items-center gap-2 py-2 px-1',
                              isChecked && 'opacity-50',
                            )}
                          >
                            <label className="flex flex-1 min-w-0 items-center gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                className="h-4 w-4 shrink-0 accent-primary"
                                checked={isChecked}
                                onChange={() => toggleChecked(e.id)}
                              />
                              <span
                                className={cn(
                                  'flex-1 min-w-0 truncate text-sm',
                                  isChecked && 'line-through',
                                )}
                              >
                                {e.name}
                              </span>
                            </label>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              aria-label={t('shopping.removeExtra')}
                              onClick={() => handleRemoveExtra(e.id)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <div className="max-h-[55vh] overflow-y-auto space-y-4">
                {recipes.map((r) => (
                  <div key={r.recipeId}>
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-semibold text-sm truncate">
                        {r.recipeName}
                      </h3>
                      <span className="shrink-0 text-xs font-medium">
                        {t('shopping.cook', { count: r.batches })}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {t('shopping.yield', {
                        produced: r.producedServings,
                        consumed: r.consumedServings,
                        leftover: r.leftoverServings,
                      })}
                    </p>
                    <ul className="mt-1 divide-y border-t">
                      {r.ingredients.map((ing) => (
                        <li
                          key={ing.ingredientId}
                          className="flex items-center gap-3 py-1.5 text-sm"
                        >
                          <span className="flex-1 min-w-0 truncate">
                            {ing.name}
                            {ing.brand ? (
                              <span className="text-muted-foreground">
                                {' '}
                                · {ing.brand}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {qtyLabel(ing.quantity, ing.unitType, t('shopping.unit'))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
