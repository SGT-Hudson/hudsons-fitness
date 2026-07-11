import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MacroBar } from '@/components/ui/MacroBar';
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog';
import { MacroProjBar } from '@/features/diario/components/MacroProjBar';
import { useRecipes } from '@/features/recipes/hooks';
import { normalizeText } from '@/features/recipes/recipeFilter';
import { roundMacro, scale, type Macros } from '@/features/recipes/macros';
import { classify, type PhaseType, type Tone } from '@/core/nutritionTone';
import { formatDate, type Locale } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { RECIPE_MEAL_TYPES, type RecipeMealType } from '@/features/recipes/mealTypes';
import { projectDay } from '../addRecipe';
import { mealLabelKey } from '../weekSummary';

const TEXT_TONE: Record<Tone, string> = {
  good: 'text-tone-good',
  onTarget: 'text-tone-good',
  slightOver: 'text-tone-warn',
  low: 'text-tone-warn',
  over: 'text-destructive',
  neutral: 'text-muted-foreground',
};

/** The plan slot this drawer writes into. */
export interface AddRecipeTarget {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  mealIndex: number;
  mealTime: string | null;
  /** The day's current totals, for the balance footer. */
  dayTotals: Macros;
}

/** The existing slot entry being edited, when the drawer opens in edit mode. */
export interface AddRecipeEditing {
  id: string;
  recipe_id: string;
  recipe_name: string;
  servings: number;
  /** This entry's contribution — subtracted from the base so it isn't double-counted. */
  macros: Macros;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: AddRecipeTarget;
  editing?: AddRecipeEditing | null;
  /** The day's macro target. Absent → no bars, but the projected kcal still shows. */
  targets?: Macros;
  phaseType?: PhaseType;
  busy?: boolean;
  /**
   * The caller owns the mutation AND the close — it is the only one that knows
   * whether the write actually landed (a failed mutation must keep the drawer
   * open with the user's pick intact).
   */
  onAdd: (recipeId: string, recipeName: string, servings: number) => void;
  onUpdate: (entryId: string, recipeId: string, recipeName: string, servings: number) => void;
  onRemove: (entryId: string) => void;
}

/** What the drawer needs of a recipe: identity + its per-serving macros. */
interface PickedRecipe {
  id: string;
  name: string;
  perServing: Macros;
}

/**
 * Rebuild the picked recipe from the entry being edited, without depending on
 * the recipe still being in the user's library (it may have been deleted since
 * it was planned): the entry carries its own contribution, so per-serving is
 * just that divided by its servings.
 */
function editingPick(editing: AddRecipeEditing): PickedRecipe {
  return {
    id: editing.recipe_id,
    name: editing.recipe_name,
    perServing: editing.servings > 0 ? scale(editing.macros, 1 / editing.servings) : editing.macros,
  };
}

/**
 * Half-serving increments across the whole range — floor 0.5 — matching the
 * Diario's ración stepper (`RacionStep`'s `roundToStep`): 0.5, 1, 1.5, 2, 2.5…
 */
function stepServings(v: number, dir: 1 | -1): number {
  const step = 0.5;
  return Math.max(step, Math.round((v + dir * step) * 100) / 100);
}

/**
 * The planner's add/edit-recipe drawer (canvas `AñadirRecetaDrawerV1`): pick a
 * recipe, set its servings, and see — live, before confirming — what the day's
 * balance becomes. Recipes only: `meal_plan_week_slots.recipe_id` is NOT NULL,
 * so unlike the Diario's sheet there is no loose-ingredient or custom path.
 *
 * All arithmetic is `projectDay`'s; all macro data comes off the already-loaded
 * recipe list (`perServing`) — no fetch of its own.
 */
export function AddRecipeDrawer({
  open,
  onOpenChange,
  target,
  editing,
  targets,
  phaseType,
  busy,
  onAdd,
  onUpdate,
  onRemove,
}: Props) {
  const { t, i18n } = useTranslation('planning');
  const { t: tRecetas } = useTranslation('recetas');
  const locale: Locale = i18n.language?.startsWith('en') ? 'en' : 'es';
  const recipes = useRecipes();

  const [query, setQuery] = useState('');
  const [mealTypeFilter, setMealTypeFilter] = useState<RecipeMealType | null>(null);
  const [picked, setPicked] = useState<PickedRecipe | null>(() =>
    editing ? editingPick(editing) : null,
  );
  const [servings, setServings] = useState(() => editing?.servings ?? 1);

  // Reset the transient state on every (re)open — a stale query/pick/filter
  // from the previous slot would otherwise leak into this one.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setMealTypeFilter(null);
    setPicked(editing ? editingPick(editing) : null);
    setServings(editing?.servings ?? 1);
  }, [open, editing]);

  // Chips: only the meal types the user's recipes actually carry, in the
  // library's canonical order — "Todas" plus whichever of these are in play.
  const mealTypeOptions = useMemo(() => {
    const present = new Set<string>();
    for (const r of recipes.data ?? []) {
      for (const m of r.meal_types) present.add(m);
    }
    return RECIPE_MEAL_TYPES.filter((k) => present.has(k));
  }, [recipes.data]);

  const results = useMemo(() => {
    const q = normalizeText(query);
    const all = recipes.data ?? [];
    return all.filter((r) => {
      if (mealTypeFilter && !r.meal_types.includes(mealTypeFilter)) return false;
      if (q !== '' && !normalizeText(r.name).includes(q)) return false;
      return true;
    });
  }, [recipes.data, query, mealTypeFilter]);

  const { key: mealKey, params: mealParams } = mealLabelKey(target.mealIndex);
  const destination = {
    day: formatDate(target.date, 'EEE d', locale),
    meal: t(mealKey, mealParams ?? {}),
    time: target.mealTime?.slice(0, 5) ?? '',
  };
  const destinationLabel = target.mealTime
    ? t('addRecipe.destination', destination)
    : t('addRecipe.destinationNoTime', destination);

  const title = editing ? t('addRecipe.editTitle') : t('addRecipe.title');

  const projection = picked
    ? projectDay({
        dayTotals: target.dayTotals,
        perServing: picked.perServing,
        servings,
        replacing: editing?.macros,
      })
    : null;
  const kcalStatus = classify('kcal', projection?.projected.kcal ?? 0, targets?.kcal, phaseType);

  function confirm() {
    if (!picked) return;
    if (editing) {
      onUpdate(editing.id, picked.id, picked.name, servings);
      return;
    }
    onAdd(picked.id, picked.name, servings);
  }

  const servingsLabel = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-ES').format(servings);

  // Only the mobile Drawer needs a close button — the desktop Dialog draws its own.
  function renderHeader(showClose: boolean) {
    return (
      <div className="flex shrink-0 items-start gap-2.5 px-4.5 pb-3 pt-1">
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-semibold">{title}</h2>
          <span
            data-testid="destination"
            className="tnum text-[11.5px] text-muted-foreground"
          >
            {destinationLabel}
          </span>
        </div>
        {showClose && (
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
    );
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={title} variant="panel">
      {({ isMobile }) => (
        <>
          {renderHeader(isMobile)}

          <div className="shrink-0 px-4.5 pb-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                className="pl-9"
                placeholder={t('addRecipe.search')}
                aria-label={t('addRecipe.searchLabel')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {mealTypeOptions.length > 0 && (
            <div className="shrink-0 px-4.5 pb-2">
              <div
                role="radiogroup"
                aria-label={t('addRecipe.filterLabel')}
                className="flex flex-wrap gap-1.5"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={mealTypeFilter === null}
                  onClick={() => setMealTypeFilter(null)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] font-medium',
                    mealTypeFilter === null
                      ? 'border-accent-line bg-accent-soft'
                      : 'border-border bg-card text-muted-foreground',
                  )}
                >
                  {t('addRecipe.filterAll')}
                </button>
                {mealTypeOptions.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={mealTypeFilter === key}
                    onClick={() => setMealTypeFilter(key)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] font-medium',
                      mealTypeFilter === key
                        ? 'border-accent-line bg-accent-soft'
                        : 'border-border bg-card text-muted-foreground',
                    )}
                  >
                    {tRecetas(`mealTypes.${key}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4.5 pb-3">
            {results.length === 0 && (
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                {(recipes.data ?? []).length === 0
                  ? t('addRecipe.empty')
                  : t('addRecipe.noResults')}
              </p>
            )}
            {results.map((r) => {
              const active = picked?.id === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setPicked({ id: r.id, name: r.name, perServing: r.perServing })
                  }
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-[10px] border px-2.5 py-2 text-left',
                    active ? 'border-accent-line bg-accent-soft' : 'border-border bg-card',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium">{r.name}</div>
                    <div className="tnum mt-0.5 flex items-baseline gap-2 text-[10px]">
                      <span className="text-macro-p">
                        {roundMacro(r.perServing.proteinG)}{' '}
                        <span className="opacity-70">{t('summary.letter.protein')}</span>
                      </span>
                      <span className="text-macro-c">
                        {roundMacro(r.perServing.carbsG)}{' '}
                        <span className="opacity-70">{t('summary.letter.carbs')}</span>
                      </span>
                      <span className="text-macro-g">
                        {roundMacro(r.perServing.fatG)}{' '}
                        <span className="opacity-70">{t('summary.letter.fat')}</span>
                      </span>
                    </div>
                  </div>
                  <span className="tnum shrink-0 text-[11.5px] text-muted-foreground">
                    {roundMacro(r.perServing.kcal)}
                  </span>
                </button>
              );
            })}
          </div>

          {picked && projection && (
            <div className="shrink-0 space-y-3 border-t border-border bg-muted px-4.5 py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">{picked.name}</p>
                  <p className="tnum text-[10.5px] text-text-dim">
                    {roundMacro(picked.perServing.kcal)} · {t('addRecipe.perServing')}
                  </p>
                </div>
                <div className="flex h-9 shrink-0 items-stretch overflow-hidden rounded-xl border border-border bg-card">
                  <button
                    type="button"
                    aria-label={t('addRecipe.less')}
                    onClick={() => setServings((v) => stepServings(v, -1))}
                    className="flex w-9 items-center justify-center border-r border-border text-muted-foreground"
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <div className="flex min-w-[62px] flex-col items-center justify-center leading-tight">
                    <span className="tnum text-[13px] font-semibold">{servingsLabel}</span>
                    <span className="text-[9px] text-text-dim">{t('addRecipe.servings')}</span>
                  </div>
                  <button
                    type="button"
                    aria-label={t('addRecipe.more')}
                    onClick={() => setServings((v) => stepServings(v, 1))}
                    className="flex w-9 items-center justify-center border-l border-border text-muted-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-text-dim">
                    {t('addRecipe.projected')}
                  </span>
                  <span
                    className={cn(
                      'tnum ml-auto text-[17px] font-semibold tracking-tight',
                      TEXT_TONE[kcalStatus.tone],
                    )}
                    data-testid="projected-kcal"
                  >
                    {roundMacro(projection.projected.kcal)}
                  </span>
                  {targets && (
                    <span className="tnum text-[11px] text-muted-foreground">
                      / {roundMacro(targets.kcal)}
                    </span>
                  )}
                </div>
                {targets && (
                  <>
                    <MacroBar
                      consumed={projection.projected.kcal}
                      target={targets.kcal}
                      tone={kcalStatus.tone}
                      excess={kcalStatus.excess}
                    />
                    <p className={cn('tnum text-[10.5px]', TEXT_TONE[kcalStatus.tone])}>
                      {kcalStatus.overG > 0
                        ? t('addRecipe.over', { n: roundMacro(kcalStatus.overG) })
                        : t('addRecipe.remaining', { n: roundMacro(kcalStatus.remaining) })}
                    </p>
                  </>
                )}
              </div>

              {targets && (
                <div className="space-y-2">
                  <MacroProjBar
                    metric="protein"
                    base={projection.base.proteinG}
                    added={projection.added.proteinG}
                    target={targets.proteinG}
                  />
                  <MacroProjBar
                    metric="carbs"
                    base={projection.base.carbsG}
                    added={projection.added.carbsG}
                    target={targets.carbsG}
                  />
                  <MacroProjBar
                    metric="fat"
                    base={projection.base.fatG}
                    added={projection.added.fatG}
                    target={targets.fatG}
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                {editing && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t('addRecipe.remove')}
                    title={t('addRecipe.remove')}
                    disabled={busy}
                    onClick={() => onRemove(editing.id)}
                    className="shrink-0 text-destructive"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
                <Button type="button" className="flex-1" disabled={busy} onClick={confirm}>
                  {editing ? t('addRecipe.confirmSave') : t('addRecipe.confirmAdd')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </ResponsiveDialog>
  );
}
