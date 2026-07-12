import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RECIPE_GOAL_KEYS, type RecipeGoalKey } from '../labels';
import { RECIPE_MEAL_TYPES, type RecipeMealType } from '../mealTypes';

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-medium transition-colors md:h-7 md:text-[12px]',
        active
          ? 'border-accent-line bg-accent-soft text-accent-ink'
          : 'border-border bg-muted text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

interface Props {
  /** Recipes in the library (the count on the "Todas" chip). */
  total: number;
  favoritesCount: number;
  favoritesOnly: boolean;
  mealTypes: RecipeMealType[];
  goals: RecipeGoalKey[];
  onToggleFavoritesOnly: () => void;
  onToggleMealType: (key: RecipeMealType) => void;
  onToggleGoal: (key: RecipeGoalKey) => void;
  /** The "Todas" chip — clears every facet (search included).*/
  onClearAll: () => void;
  /** Any facet active? Drives the "Todas" chip's own selected state. */
  anyActive: boolean;
}

/**
 * The canvas's filter row: Todas · Favoritas · the 5 meal types · the U-3 goal
 * chips, with the sort label pinned right.
 *
 * On mobile they ride a **single swipeable strip** (one row, no visible
 * scrollbar): the mobile artboard drew 5 chips, we have 11, and wrapping them
 * stacked four rows of chips above the list on a 390px screen. The bleed
 * (`-mx-4 px-4`, cancelling the page gutter) is what lets the strip scroll edge
 * to edge instead of ending inside the gutter. At md+ they wrap inside the
 * artboard's surface card, as drawn.
 *
 * The sort label is a label, not a control: `listRecipes` orders by
 * `created_at desc` and nothing in this wave changes that.
 */
export function RecipeFilterBar({
  total,
  favoritesCount,
  favoritesOnly,
  mealTypes,
  goals,
  onToggleFavoritesOnly,
  onToggleMealType,
  onToggleGoal,
  onClearAll,
  anyActive,
}: Props) {
  const { t } = useTranslation('recetas');

  return (
    <div
      role="group"
      aria-label={t('filters.groupLabel')}
      className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:overflow-x-visible md:rounded-[14px] md:border md:bg-card md:px-3.5 md:py-2.5"
    >
      <FilterChip active={!anyActive} onClick={onClearAll}>
        {t('filters.all', { count: total })}
      </FilterChip>
      <FilterChip active={favoritesOnly} onClick={onToggleFavoritesOnly}>
        <Star className="h-3 w-3" fill={favoritesOnly ? 'currentColor' : 'none'} aria-hidden="true" />
        {t('filters.favorites', { count: favoritesCount })}
      </FilterChip>
      {RECIPE_MEAL_TYPES.map((key) => (
        <FilterChip
          key={key}
          active={mealTypes.includes(key)}
          onClick={() => onToggleMealType(key)}
        >
          {t(`mealTypes.${key}`)}
        </FilterChip>
      ))}
      {RECIPE_GOAL_KEYS.map((key) => (
        <FilterChip key={key} active={goals.includes(key)} onClick={() => onToggleGoal(key)}>
          {t(`filters.${key}`)}
        </FilterChip>
      ))}
      <span className="tnum ml-auto hidden text-[11.5px] text-text-dim md:inline">
        {t('sort.label')} <b className="font-semibold text-muted-foreground">{t('sort.recent')}</b>
      </span>
    </div>
  );
}
