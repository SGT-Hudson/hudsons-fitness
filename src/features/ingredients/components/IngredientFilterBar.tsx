import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { INGREDIENT_FACETS, type IngredientFacet } from '../ingredientFilter';

interface Props {
  counts: Record<IngredientFacet, number>;
  active: IngredientFacet[];
  onToggle: (facet: IngredientFacet) => void;
}

/**
 * The web artboard's chip row — mi biblioteca · verificadas · por unidad · base
 * · mías — with the "Macros por 100 g" note pinned right, and the counts as
 * **real numbers** (the page holds the pool in memory and counts it in one
 * pass; see `ingredientFilter.ts`).
 *
 * The chips also ship on mobile, which the artboard does not draw: it assumed a
 * small personal library, and the shipped pool is a ~230-row shared catalogue
 * that a phone can otherwise only narrow by typing. They ride the same
 * swipeable single-row strip Recetas' filter bar uses (`-mx-4 px-4` bleeds the
 * page gutter so the strip scrolls edge to edge), and each chip keeps its
 * accessible name at every width.
 *
 * Facets AND-combine, and each carries `aria-pressed` — they are toggles, not a
 * radio group.
 */
export function IngredientFilterBar({ counts, active, onToggle }: Props) {
  const { t } = useTranslation('ingredientes');

  return (
    <div
      role="group"
      aria-label={t('filters.groupLabel')}
      className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:overflow-x-visible md:rounded-[14px] md:border md:bg-card md:px-3.5 md:py-2.5"
    >
      {INGREDIENT_FACETS.map((facet) => {
        const on = active.includes(facet);
        return (
          <button
            key={facet}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(facet)}
            className={cn(
              'inline-flex h-[26px] shrink-0 items-center gap-1 rounded-full border px-3 text-[11.5px] font-medium transition-colors md:h-7 md:text-[12px]',
              on
                ? 'border-accent-line bg-accent-soft text-accent-ink'
                : 'border-border bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`filters.${facet}`)}{' '}
            <span className={cn('tnum', on ? 'opacity-70' : 'text-text-dim')}>
              {counts[facet]}
            </span>
          </button>
        );
      })}
      <span className="ml-auto hidden shrink-0 text-[10.5px] text-text-dim md:inline">
        {t('list.macrosNote')}
      </span>
    </div>
  );
}
