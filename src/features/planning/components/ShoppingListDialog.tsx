import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipboardCopy,
  EyeOff,
  Plus,
  RotateCcw,
  Share2,
  ShoppingCart,
  X,
} from 'lucide-react';
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
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

// A checked row shrinks a hair and centres, the canvas's signature check-off
// gesture. Shared by the aggregated list and the manual extras below it.
const ROW_BASE =
  'mx-auto flex w-full items-center gap-3 rounded-[10px] border border-border bg-card px-3.5 py-2.5 transition-[width] duration-300 ease-out';

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
      setView('total');
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

  const totalItems = visibleTotals.length + extras.length;
  const doneItems =
    visibleTotals.filter((i) => checked.has(i.ingredientId)).length +
    extras.filter((e) => checked.has(e.id)).length;

  function buildShareText(): string {
    return formatShoppingListText({
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
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ variant: 'success', title: t('shopping.copied') });
    } catch {
      toast({ variant: 'destructive', title: t('shopping.copyFailed') });
    }
  }

  async function handleShare() {
    const text = buildShareText();
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: t('shopping.title'), text });
        return;
      }
    } catch (err) {
      // User dismissed the native share sheet — not an error.
      if ((err as Error)?.name === 'AbortError') return;
      // Any other share failure → fall through to clipboard.
    }
    await copyText(text);
  }

  async function handleCopy() {
    await copyText(buildShareText());
  }

  const isLoading = query.isLoading;
  const isEmpty = !isLoading && recipes.length === 0;
  const showChrome = !isLoading && !isEmpty;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('shopping.title')}
      variant="panel"
    >
      {({ isMobile }) => (
        <>
          <div className="flex shrink-0 items-start gap-2.5 px-4.5 pb-3 pt-1">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[18px] font-semibold">
                {t('shopping.title')}
              </h2>
              <p className="text-[11.5px] leading-snug text-muted-foreground">
                {t('shopping.subtitle')}
              </p>
            </div>
            {showChrome && (
              <Badge variant="secondary" className="tnum mt-0.5 shrink-0">
                {t('shopping.itemCount', { count: totalItems })}
              </Badge>
            )}
            {isMobile && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-[30px] w-[30px] shrink-0 rounded-[9px] text-muted-foreground"
                aria-label={t('addRecipe.close')}
                onClick={() => onOpenChange(false)}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-muted px-4.5 py-3">
            {isLoading ? (
              <div className="flex flex-col gap-1.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-[10px]" />
                ))}
              </div>
            ) : isEmpty ? (
              <EmptyState icon={ShoppingCart} title={t('shopping.empty')} />
            ) : (
              <>
                <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
                  <SegmentedControl
                    ariaLabel={t('shopping.viewLabel')}
                    options={[
                      { value: 'total', label: t('shopping.viewTotal') },
                      { value: 'byRecipe', label: t('shopping.viewByRecipe') },
                    ]}
                    value={view}
                    onChange={setView}
                  />
                  {view === 'total' && checked.size > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-[12px] text-text-dim"
                      onClick={() => setChecked(new Set())}
                    >
                      {t('shopping.clearChecked')}
                    </Button>
                  )}
                </div>

                {view === 'total' ? (
                  <div className="space-y-4">
                    <ul className="flex flex-col gap-1.5">
                      {visibleTotals.map((item) => {
                        const isChecked = checked.has(item.ingredientId);
                        const isStaple = staples.has(item.ingredientId);
                        return (
                          <li
                            key={item.ingredientId}
                            className={cn(
                              ROW_BASE,
                              isChecked && 'w-[94%]',
                              isStaple && !isChecked && 'opacity-70',
                            )}
                          >
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                              <input
                                type="checkbox"
                                className="h-[18px] w-[18px] shrink-0 rounded-[6px] accent-accent"
                                checked={isChecked}
                                onChange={() => toggleChecked(item.ingredientId)}
                              />
                              <span
                                className={cn(
                                  'min-w-0 flex-1 truncate text-[14px] font-medium',
                                  isChecked
                                    ? 'text-text-dim line-through'
                                    : 'text-foreground',
                                )}
                              >
                                {item.name}
                                {item.brand ? (
                                  <span className="font-normal text-muted-foreground">
                                    {' '}
                                    · {item.brand}
                                  </span>
                                ) : null}
                              </span>
                              <span
                                className={cn(
                                  'tnum shrink-0 rounded-[7px] border border-border bg-muted px-2.5 py-0.5 text-[12.5px] font-medium',
                                  isChecked
                                    ? 'text-text-dim line-through'
                                    : 'text-muted-foreground',
                                )}
                              >
                                {qtyLabel(
                                  item.totalQuantity,
                                  item.unitType,
                                  t('shopping.unit'),
                                )}
                              </span>
                            </label>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 rounded-[8px] text-text-dim"
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
                        className="text-[11px] text-text-dim underline hover:text-foreground"
                        onClick={() => setShowStaples((s) => !s)}
                      >
                        {showStaples
                          ? t('shopping.hideStaples')
                          : t('shopping.showStaples', { count: hiddenCount })}
                      </button>
                    )}

                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-dim">
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
                        <ul className="flex flex-col gap-1.5">
                          {extras.map((e) => {
                            const isChecked = checked.has(e.id);
                            return (
                              <li
                                key={e.id}
                                className={cn(ROW_BASE, isChecked && 'w-[94%]')}
                              >
                                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                                  <input
                                    type="checkbox"
                                    className="h-[18px] w-[18px] shrink-0 rounded-[6px] accent-accent"
                                    checked={isChecked}
                                    onChange={() => toggleChecked(e.id)}
                                  />
                                  <span
                                    className={cn(
                                      'min-w-0 flex-1 truncate text-[14px] font-medium',
                                      isChecked
                                        ? 'text-text-dim line-through'
                                        : 'text-foreground',
                                    )}
                                  >
                                    {e.name}
                                  </span>
                                  <Badge
                                    variant="accent"
                                    className="h-[18px] shrink-0 px-[7px] text-[9.5px]"
                                  >
                                    {t('shopping.extraTag')}
                                  </Badge>
                                </label>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0 rounded-[8px] text-text-dim"
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
                  <div className="space-y-3">
                    {recipes.map((r) => (
                      <div
                        key={r.recipeId}
                        className="space-y-2 rounded-[14px] border border-border bg-card p-3"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <h3 className="min-w-0 truncate text-[13px] font-semibold">
                            {r.recipeName}
                          </h3>
                          <Badge variant="accent" className="tnum shrink-0">
                            {t('shopping.cook', { count: r.batches })}
                          </Badge>
                        </div>
                        <p className="tnum text-[11px] text-text-dim">
                          {t('shopping.yield', {
                            produced: r.producedServings,
                            consumed: r.consumedServings,
                            leftover: r.leftoverServings,
                          })}
                        </p>
                        <ul className="divide-y border-t border-border">
                          {r.ingredients.map((ing) => (
                            <li
                              key={ing.ingredientId}
                              className="flex items-center gap-3 py-1.5 text-[13px]"
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {ing.name}
                                {ing.brand ? (
                                  <span className="text-muted-foreground">
                                    {' '}
                                    · {ing.brand}
                                  </span>
                                ) : null}
                              </span>
                              <span className="tnum shrink-0 text-muted-foreground">
                                {qtyLabel(
                                  ing.quantity,
                                  ing.unitType,
                                  t('shopping.unit'),
                                )}
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
          </div>

          {showChrome && view === 'total' && (
            <div className="flex shrink-0 items-center gap-2 border-t border-border px-4.5 py-3">
              <span className="tnum text-[12px] text-text-dim">
                {t('shopping.bought', { done: doneItems, total: totalItems })}
              </span>
              <span className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCopy()}
              >
                <ClipboardCopy className="h-4 w-4" />
                {t('shopping.copy')}
              </Button>
              <Button size="sm" onClick={() => void handleShare()}>
                <Share2 className="h-4 w-4" />
                {t('shopping.share')}
              </Button>
            </div>
          )}
        </>
      )}
    </ResponsiveDialog>
  );
}
