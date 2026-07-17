import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatDate, type Locale } from '@/lib/dates';
import { roundMacro, computeRecipeMacros, type Macros } from '@/features/recipes/macros';
import { useNum } from '@/hooks/useNum';
import { useRecipes } from '@/features/recipes/hooks';
import { useLocalIngredientSearch } from '@/features/ingredients/hooks';
import { ingredientDisplayName, type Ingredient } from '@/features/ingredients/api';
import { useQuickAddRecipes } from '../hooks';
import { computeMealLogMacros, subtractMacros } from '../macros';
import type { MealLogWithJoins, MealType } from '../api';
import type { RecipeOption } from './RecipeAutocomplete';
import { MealSlotSelector, type MealSubtotals } from './MealSlotSelector';
import { AddResultRow } from './AddResultRow';
import { RacionStep } from './RacionStep';

export type AddSheetStep = 'explore' | 'racion';
type AddSheetTab = 'recientes' | 'recetas' | 'alimentos';

/**
 * What the explore step hands off to the ración step (Task 4): a full recipe
 * (with per-serving macros when available), a loose ingredient, or the
 * custom-entry path (typed macros, no library item behind it).
 */
export type AddSheetSelection =
  | { kind: 'recipe'; recipe: RecipeOption }
  | { kind: 'ingredient'; ingredient: Ingredient }
  | { kind: 'custom' };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loggedOn: string;
  initialMealType?: MealType;
  /** Per-slot kcal subtotal for today, keyed by meal type. */
  mealSubtotals: MealSubtotals;
  totals: Macros;
  targets?: Macros;
  /** Active phase label for the header subline (e.g. "Definición"). Omitted when there's no active phase. */
  phaseLabel?: string;
  /**
   * Edit mode (task 5): the existing entry to edit. When set, the sheet opens
   * straight into the ración step locked to this entry's kind, pre-filled with
   * its quantity/macros, and confirming updates (or deleting removes) it.
   */
  editing?: MealLogWithJoins | null;
  /**
   * Open straight on a chosen item (R-33 wave 5: the Recetas list's "+ añadir al
   * diario" already knows which recipe you meant, so making you search for it
   * again would be silly). Ignored in edit mode.
   *
   * Read at the moment the sheet opens (see the reset effect below), so it needs
   * no referential stability: rebuilding the object on a re-render is a no-op.
   */
  initialSelection?: AddSheetSelection | null;
}

/**
 * Turn a logged entry into the ración step's selection. The per-serving /
 * per-unit macros come straight off the entry's already-joined data (no fetch,
 * no reliance on RecipeOption.perServing, which is absent on an edit): a logged
 * recipe carries its full ingredient tree → computeRecipeMacros; a logged
 * ingredient carries the ingredient row → ingredientMacros (inside RacionStep);
 * custom → the entry's typed macros.
 */
function editSelection(log: MealLogWithJoins): AddSheetSelection {
  if (log.recipe_id && log.recipe) {
    const { perServing } = computeRecipeMacros({
      servings: log.recipe.servings,
      rows: log.recipe.recipe_ingredients.map((ri) => ({
        ingredient: ri.ingredient,
        quantity: Number(ri.quantity),
        perServing: ri.per_serving,
      })),
    });
    return {
      kind: 'recipe',
      recipe: {
        id: log.recipe.id,
        name: log.recipe.name,
        servings: log.recipe.servings,
        ingredient_count: log.recipe.recipe_ingredients.length,
        perServing,
      },
    };
  }
  if (log.ingredient_id && log.ingredient) {
    return { kind: 'ingredient', ingredient: log.ingredient };
  }
  return { kind: 'custom' };
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

interface ResultItem {
  key: string;
  kind: 'recipe' | 'ingredient';
  name: string;
  kcal: number | null;
  subtitle?: string;
  selection: AddSheetSelection;
}

type TFn = (key: string, options?: Record<string, unknown>) => string;

function servingsLabel(servings: number, t: TFn): string {
  return servings === 1 ? t('addSheet.oneServing') : t('addSheet.nServings', { n: servings });
}

/**
 * The "Añadir a hoy" drawer — bottom sheet on mobile, docked-right panel on
 * desktop (same content, repositioned; see the render at the bottom for why
 * this composition was chosen over a single responsive vaul `direction`).
 *
 * Owns a two-step flow: `explore` (this file) lets the user pick a meal slot
 * and search/browse recientes · recetas · alimentos; picking a result (or the
 * "crear personalizado" affordance) sets the selection and advances to
 * `racion`, whose UI (quantity stepper, live macro projection, create
 * mutation) is `RacionStep`.
 */
export function AddToDaySheet({
  open,
  onOpenChange,
  loggedOn,
  initialMealType = 'breakfast',
  mealSubtotals,
  totals,
  targets,
  phaseLabel,
  editing,
  initialSelection,
}: Props) {
  const { t, i18n } = useTranslation('diario');
  const { t: tIngredientes } = useTranslation('ingredientes');
  const num = useNum();
  const lang: 'es' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'es';
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;

  const [step, setStep] = useState<AddSheetStep>('explore');
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [tab, setTab] = useState<AddSheetTab>('recientes');
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<AddSheetSelection | null>(null);
  const debouncedQuery = useDebouncedValue(query, 200);

  // Reset all transient state on the closed → open transition, and only there —
  // a stale step / tab / query from a previous open would otherwise leak
  // through. Edit mode skips explore entirely: it opens straight into the ración
  // step locked to the entry's kind, at the entry's own meal slot. A
  // caller-supplied `initialSelection` does the same, but at the caller's meal
  // slot and with "back" still returning to explore.
  //
  // The props are read once, at the moment of opening; from there the sheet owns
  // its state. Re-running the reset on a prop change would let a value that
  // settles *after* the open (callers derive `initialMealType` from the day's
  // meal-log query, which resolves a tick later) overwrite what the user has
  // already picked — silently logging the meal into the wrong slot. Hence the
  // transition guard rather than a dependency list.
  const prevOpen = useRef(false);
  useEffect(() => {
    const justOpened = open && !prevOpen.current;
    prevOpen.current = open;
    if (!justOpened) return;
    if (editing) {
      setStep('racion');
      setMealType((editing.meal_type as MealType) ?? 'breakfast');
      setSelection(editSelection(editing));
      return;
    }
    setMealType(initialMealType);
    setTab('recientes');
    setQuery('');
    if (initialSelection) {
      setStep('racion');
      setSelection(initialSelection);
      return;
    }
    setStep('explore');
    setSelection(null);
  });

  const quickAdd = useQuickAddRecipes();
  const recipes = useRecipes();
  // U-7: only fetch once the user has typed, and only while the Alimentos tab
  // is actually active — no point paying for a debounced search the other
  // two tabs never look at.
  const ingredientSearch = useLocalIngredientSearch(
    debouncedQuery,
    12,
    tab === 'alimentos' && debouncedQuery.trim() !== '',
  );

  const q = query.trim().toLowerCase();

  const recientesItems = useMemo<ResultItem[]>(
    () =>
      (quickAdd.data ?? [])
        .filter((it) => q === '' || it.name.toLowerCase().includes(q))
        .map((it) => {
          // The quick-add row only carries id/name/kcal; look up the full
          // recipe (perServing macros, servings) from the already-fetched
          // recipes list when it's still in the library, so a selection here
          // is just as capable for Task 4's projection as one from Recetas.
          const full = recipes.data?.find((r) => r.id === it.recipeId);
          return {
            key: `qa-${it.recipeId}`,
            kind: 'recipe' as const,
            name: it.name,
            kcal: roundMacro(it.kcalPerServing),
            subtitle: full ? servingsLabel(full.servings, t) : undefined,
            selection: {
              kind: 'recipe' as const,
              recipe: full ?? {
                id: it.recipeId,
                name: it.name,
                servings: 1,
                ingredient_count: 0,
              },
            },
          };
        }),
    [quickAdd.data, recipes.data, q, t],
  );

  const recetasItems = useMemo<ResultItem[]>(
    () =>
      (recipes.data ?? [])
        .filter((r) => q === '' || r.name.toLowerCase().includes(q))
        .map((r) => ({
          key: `r-${r.id}`,
          kind: 'recipe' as const,
          name: r.name,
          kcal: roundMacro(r.perServing.kcal),
          subtitle: servingsLabel(r.servings, t),
          selection: {
            kind: 'recipe' as const,
            recipe: {
              id: r.id,
              name: r.name,
              servings: r.servings,
              ingredient_count: r.ingredient_count,
              perServing: r.perServing,
            },
          },
        })),
    [recipes.data, q, t],
  );

  const alimentosItems = useMemo<ResultItem[]>(
    () =>
      (ingredientSearch.data ?? []).map((ing) => ({
        key: `i-${ing.id}`,
        kind: 'ingredient' as const,
        name: ingredientDisplayName(ing, lang),
        kcal: ing.kcal_per_unit,
        subtitle:
          [ing.brand, ing.unit_type === 'unit' ? tIngredientes('list.perUnit') : tIngredientes('list.per100g')]
            .filter(Boolean)
            .join(' · ') || undefined,
        selection: { kind: 'ingredient' as const, ingredient: ing },
      })),
    [ingredientSearch.data, lang, tIngredientes],
  );

  function selectResult(item: ResultItem) {
    setSelection(item.selection);
    setStep('racion');
  }

  function selectCustom() {
    setSelection({ kind: 'custom' });
    setStep('racion');
  }

  const sheetTitle = editing ? t('addSheet.editTitle') : t('addSheet.title');
  const dateSubline = formatDate(loggedOn, 'EEE d MMM', locale);
  const subline = phaseLabel
    ? t('addSheet.subtitle', { date: dateSubline, phase: phaseLabel })
    : t('addSheet.subtitleNoPhase', { date: dateSubline });

  // Only the mobile Drawer needs a hand-rolled close button — the shared
  // Dialog primitive already renders its own (top-right X), so adding a
  // second one there would just duplicate the affordance. A plain render
  // function (not a nested component) — defining a component type inside
  // the render body would force a remount on every state change.
  function renderHeader(showClose: boolean) {
    return (
      <div className="shrink-0 space-y-3 px-4.5 pb-3 pt-1">
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-semibold">{sheetTitle}</h2>
            <span className="tabular-nums text-[11.5px] text-muted-foreground">{subline}</span>
          </div>
          {showClose && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-[30px] w-[30px] shrink-0 rounded-[9px] text-muted-foreground"
              aria-label={t('addSheet.close')}
              onClick={() => onOpenChange(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <MealSlotSelector value={mealType} onChange={setMealType} subtotals={mealSubtotals} />
      </div>
    );
  }

  function renderList(items: ResultItem[], emptyMessage: string) {
    if (items.length === 0) {
      return <p className="px-1 py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
    }
    return (
      <div className="space-y-1.5">
        {items.map((item) => (
          <AddResultRow
            key={item.key}
            kind={item.kind}
            name={item.name}
            kcal={item.kcal}
            subtitle={item.subtitle}
            onSelect={() => selectResult(item)}
          />
        ))}
      </div>
    );
  }

  const alimentosEmptyMessage =
    query.trim() === '' ? t('addSheet.emptyFoodsPrompt') : t('addSheet.emptyFoodsNoResults');

  const exploreBody = (
    <>
      <div className="shrink-0 px-4.5 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('addSheet.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('addSheet.searchPlaceholder')}
          />
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as AddSheetTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0 px-4.5 pb-2">
          <TabsList className="h-8 gap-1 bg-transparent p-0">
            <TabsTrigger
              value="recientes"
              className="h-7 rounded-full border border-border bg-muted text-[11.5px] data-[state=active]:border-accent-line data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink data-[state=active]:shadow-none"
            >
              {t('addSheet.tabs.recent')}
            </TabsTrigger>
            <TabsTrigger
              value="recetas"
              className="h-7 rounded-full border border-border bg-muted text-[11.5px] data-[state=active]:border-accent-line data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink data-[state=active]:shadow-none"
            >
              {t('addSheet.tabs.recipes')}
            </TabsTrigger>
            <TabsTrigger
              value="alimentos"
              className="h-7 rounded-full border border-border bg-muted text-[11.5px] data-[state=active]:border-accent-line data-[state=active]:bg-accent-soft data-[state=active]:text-accent-ink data-[state=active]:shadow-none"
            >
              {t('addSheet.tabs.foods')}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4.5 pb-3">
          <TabsContent value="recientes" className="mt-0">
            {renderList(recientesItems, t('addSheet.emptyRecent'))}
          </TabsContent>
          <TabsContent value="recetas" className="mt-0">
            {renderList(recetasItems, t('addSheet.emptyRecipes'))}
          </TabsContent>
          <TabsContent value="alimentos" className="mt-0 space-y-3">
            {renderList(alimentosItems, alimentosEmptyMessage)}
            <button
              type="button"
              onClick={selectCustom}
              className="w-full rounded-[10px] border border-dashed border-border px-2.5 py-2 text-center text-[12px] font-medium text-muted-foreground hover:bg-muted"
            >
              {t('addSheet.customCta')}
            </button>
          </TabsContent>
        </div>
      </Tabs>

      <div className="shrink-0 space-y-2 border-t border-border bg-muted px-4.5 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-text-dim">
            {t('addSheet.balance')}
          </span>
          {targets && (
            <span className="tabular-nums text-[11px] text-muted-foreground">
              {t('addSheet.balanceTarget', { n: roundMacro(targets.kcal) })}
            </span>
          )}
        </div>
        <div className="relative h-[9px] overflow-hidden rounded-[6px] border border-border bg-card">
          {targets && targets.kcal > 0 && (
            <div
              className="h-full bg-accent"
              style={{ width: `${Math.min(100, (totals.kcal / targets.kcal) * 100)}%` }}
            />
          )}
        </div>
        <div className="flex items-baseline gap-1.5">
          {targets ? (
            <>
              <span className="tabular-nums text-lg font-semibold tracking-tight">
                {num.qty(Math.round(targets.kcal - totals.kcal))}
              </span>
              <span className="text-[11.5px] text-muted-foreground">
                {t('addSheet.balanceRemaining')}
              </span>
            </>
          ) : (
            <span className="text-[11.5px] text-muted-foreground">{t('totals.targetsHint')}</span>
          )}
          <span className="tabular-nums ml-auto text-[11.5px] text-muted-foreground">
            {t('addSheet.balanceConsumed', { n: roundMacro(totals.kcal) })}
          </span>
        </div>
      </div>
    </>
  );

  // In edit mode `totals` already includes the entry being edited, so the
  // ración-step projection base must subtract that entry's current macros —
  // otherwise the edited entry double-counts against itself.
  const racionBase = editing ? subtractMacros(totals, computeMealLogMacros(editing)) : totals;

  const racionBody = selection && (
    <RacionStep
      selection={selection}
      mealType={mealType}
      loggedOn={loggedOn}
      totals={racionBase}
      targets={targets}
      lang={lang}
      editing={editing}
      onBack={() => setStep('explore')}
      onDone={() => {
        setStep('explore');
        setSelection(null);
        onOpenChange(false);
      }}
    />
  );

  const body = step === 'explore' ? exploreBody : racionBody;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={sheetTitle} variant="panel">
      {({ isMobile }) => (
        <>
          {renderHeader(isMobile)}
          {body}
        </>
      )}
    </ResponsiveDialog>
  );
}
