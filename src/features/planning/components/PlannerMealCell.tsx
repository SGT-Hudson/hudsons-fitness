import { useTranslation } from 'react-i18next';
import { Copy, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { add, roundMacro, ZERO_MACROS, type Macros } from '@/features/recipes/macros';
import { useNum } from '@/hooks/useNum';

export interface PlannerCellEntry {
  id: string;
  recipe_id: string;
  recipe_name: string;
  servings: number;
  /** This slot's macros (recipe per-serving × servings), straight off the query. */
  macros: Macros;
}

interface Props {
  entries: PlannerCellEntry[];
  /** "añadir comida" / "añadir" — the page opens its one add drawer on this cell. */
  onAddRequest: () => void;
  /** A recipe bullet — the page opens its one recipe peek on this entry. */
  onOpenEntry: (entry: PlannerCellEntry) => void;
  onCopy?: () => void;
  busy?: boolean;
  className?: string;
}

/**
 * One (day × meal) cell of the web grid: recipe bullets, a copy affordance, an
 * inline add link and a kcal·P·C·G footer; dashed + sunken when empty. Purely
 * presentational: adding and opening an entry are raised to the page, which owns
 * the single add drawer and the single recipe peek (28 cells used to mount 28
 * picker dialogs of their own).
 */
export function PlannerMealCell({
  entries,
  onAddRequest,
  onOpenEntry,
  onCopy,
  busy,
  className,
}: Props) {
  const { t } = useTranslation('planning');
  const num = useNum();
  const empty = entries.length === 0;
  const cell = entries.reduce<Macros>((acc, e) => add(acc, e.macros), ZERO_MACROS);

  return (
    <div
      data-empty={empty}
      className={cn(
        'relative flex flex-col gap-1 rounded-md border p-2.5',
        empty ? 'border-dashed bg-muted' : 'bg-card',
        className,
      )}
    >
      {empty ? (
        <button
          type="button"
          onClick={onAddRequest}
          disabled={busy}
          className="flex h-full min-h-12 items-center justify-center gap-1 text-[11px] text-text-dim hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          {t('cell.addFirst')}
        </button>
      ) : (
        <>
          {onCopy && (
            <button
              type="button"
              onClick={onCopy}
              aria-label={t('slot.copy')}
              title={t('slot.copy')}
              disabled={busy}
              className="absolute right-1.5 top-1.5 grid h-[22px] w-[22px] place-items-center rounded-md border border-transparent text-text-dim hover:border-accent-line hover:bg-accent-soft hover:text-accent-ink"
            >
              <Copy className="h-3 w-3" />
            </button>
          )}

          <div className="flex flex-col gap-0.5 pr-6">
            {entries.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onOpenEntry(e)}
                className="flex items-baseline gap-1.5 text-left text-[11.5px] leading-tight hover:underline"
              >
                <span aria-hidden="true" className="shrink-0 text-[9px] text-text-dim">
                  •
                </span>
                <span className="min-w-0 truncate font-medium">{e.recipe_name}</span>
                {e.servings !== 1 && (
                  <span className="tnum shrink-0 text-[10px] text-text-dim">×{num.qty(e.servings)}</span>
                )}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onAddRequest}
            disabled={busy}
            className="-ml-1 mt-0.5 inline-flex items-center gap-1 self-start rounded px-1 py-0.5 text-[10.5px] text-text-dim hover:text-foreground"
          >
            <Plus className="h-2.5 w-2.5" />
            {t('cell.addMore')}
          </button>

          <div className="tnum mt-auto flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 border-t pt-1 text-[10px] text-text-dim">
            <span>
              <b className="font-medium text-muted-foreground">{num.qty(roundMacro(cell.kcal))}</b>{' '}
              {t('cell.kcal')}
            </span>
            <span>
              {num.qty(roundMacro(cell.proteinG))} <span className="opacity-65">{t('summary.letter.protein')}</span>
            </span>
            <span>
              {num.qty(roundMacro(cell.carbsG))} <span className="opacity-65">{t('summary.letter.carbs')}</span>
            </span>
            <span>
              {num.qty(roundMacro(cell.fatG))} <span className="opacity-65">{t('summary.letter.fat')}</span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
