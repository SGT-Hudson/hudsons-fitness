import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { addDays, parseISO } from 'date-fns';
import { ArrowLeftRight, FileBox, Save, ShoppingCart, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { PageShell } from '@/components/layout/PageShell';
import { PhaseChip } from '@/components/ui/PhaseChip';
import { ApplyTemplateDialog } from '@/features/planning/components/ApplyTemplateDialog';
import { CopyMealDialog, type CopyTarget } from '@/features/planning/components/CopyMealDialog';
import { SaveAsTemplateDialog } from '@/features/planning/components/SaveAsTemplateDialog';
import { ShoppingListDialog } from '@/features/planning/components/ShoppingListDialog';
import { RecipePickerDialog } from '@/features/planning/components/RecipePickerDialog';
import { WeekGrid } from '@/features/planning/components/WeekGrid';
import { WeekStrip } from '@/features/planning/components/WeekStrip';
import { WeekSummaryCard } from '@/features/planning/components/WeekSummaryCard';
import { TodayPlanList, type TodayMeal } from '@/features/planning/components/TodayPlanList';
import type { PlannerCellEntry } from '@/features/planning/components/PlannerMealCell';
import { weekMealTargets } from '@/features/planning/copyTargets';
import { isoWeekNumber, weekAverages } from '@/features/planning/weekSummary';
import { aggregateDayMacros } from '@/features/planning/daySummary';
import {
  useActiveWeek,
  useAddWeekSlot,
  useApplyTemplateToWeek,
  useCopyWeekMeal,
  useDeleteWeekSlot,
  useSaveWeekAsTemplate,
  useUpdateWeekSlot,
} from '@/features/planner/hooks';
import { useTemplates } from '@/features/templates/hooks';
import { useDailyTarget } from '@/features/planning/useDailyTarget';
import { roundMacro, ZERO_MACROS, type Macros } from '@/features/recipes/macros';
import { formatDate, isoDate, mondayOf, type Locale } from '@/lib/dates';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function PlanificadorPage() {
  const { t, i18n } = useTranslation('planning');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;

  const today = isoDate();
  const weekStart = formatDate(mondayOf(new Date()), 'yyyy-MM-dd', locale);

  const { targets, phaseType, weightKg } = useDailyTarget();

  const week = useActiveWeek(weekStart);
  const templates = useTemplates();
  const apply = useApplyTemplateToWeek();
  const saveAs = useSaveWeekAsTemplate();
  const addSlot = useAddWeekSlot();
  const updateSlot = useUpdateWeekSlot();
  const deleteSlot = useDeleteWeekSlot();

  const [applyOpen, setApplyOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [shoppingOpen, setShoppingOpen] = useState(false);

  // Below `md` the week grid is hidden, so the plan list is the only editable
  // surface — the week strip picks which day it shows (and writes to).
  const [selectedDate, setSelectedDate] = useState(today);

  const copyMeal = useCopyWeekMeal();
  const [copySource, setCopySource] = useState<{ date: string; mealIndex: number } | null>(null);

  // Mobile add/edit goes through the existing RecipePickerDialog until PR-B's
  // add drawer + recipe peek replace it. Without this the mobile list would have
  // no way to add a meal — the web grid's cell picker is desktop-only.
  const [mobilePick, setMobilePick] = useState<{
    mealIndex: number;
    mealTime: string | null;
    entry: PlannerCellEntry | null;
  } | null>(null);
  const pickedEntry = mobilePick?.entry ?? null;

  const weekDates = Array.from({ length: 7 }, (_, i) =>
    formatDate(addDays(parseISO(weekStart), i), 'yyyy-MM-dd', locale),
  );

  const slots = week.data?.slots ?? [];
  const dayTotals = aggregateDayMacros(slots.map((s) => ({ key: s.date, macros: s.macros })));
  const perDay: Macros[] = weekDates.map((d) => dayTotals.get(d) ?? ZERO_MACROS);
  const { avgKcal, avgProteinG, proteinPct } = weekAverages(perDay, targets);

  const chartDays = weekDates.map((d) => ({
    date: d,
    kcal: (dayTotals.get(d) ?? ZERO_MACROS).kcal,
    isToday: d === today,
  }));

  const selectedTotals = dayTotals.get(selectedDate) ?? ZERO_MACROS;
  const selectedIsToday = selectedDate === today;

  // Mobile plan list for the SELECTED day: one block per configured meal time,
  // plus orphan (meal_index, meal_time) rows unioned across the WHOLE week's
  // slots — like WeekGrid — not just the selected day's. meal_times comes only
  // from the source template, and source_template_id is ON DELETE SET NULL, so
  // a week whose template got deleted keeps its slots but reports
  // meal_times: []; deriving orphans from one day alone would leave that day
  // with zero rows (no way to add a meal) whenever it happens to have no slots.
  // Entries are still filtered down to the selected date, and — like WeekGrid's
  // entriesFor — matched on BOTH meal_index and meal_time: a divergent week can
  // carry two rows sharing a meal_index but differing in meal_time (per-day
  // custom template times + apply_template_to_week's partial rewrite leaves
  // pre-target-date days on the old template), so meal_index alone would
  // double-render the day's slot under both rows.
  const mealTimes = week.data?.meal_times ?? [];
  const selectedSlots = slots.filter((s) => s.date === selectedDate);
  const weekOrphans = new Map<string, { mealIndex: number; mealTime: string | null }>();
  for (const s of slots) {
    if (s.meal_index < mealTimes.length) continue;
    const key = `${s.meal_index}|${s.meal_time ?? ''}`;
    if (!weekOrphans.has(key)) weekOrphans.set(key, { mealIndex: s.meal_index, mealTime: s.meal_time });
  }
  const dayMeals: TodayMeal[] = [
    ...mealTimes.map((time, i) => ({ mealIndex: i, mealTime: time })),
    ...Array.from(weekOrphans.values()).sort(
      (a, b) => a.mealIndex - b.mealIndex || (a.mealTime ?? '').localeCompare(b.mealTime ?? ''),
    ),
  ].map((row) => ({
    ...row,
    entries: selectedSlots
      .filter((s) => s.meal_index === row.mealIndex && (s.meal_time ?? '') === (row.mealTime ?? ''))
      .sort((a, b) => a.display_order - b.display_order)
      .map((s) => ({
        id: s.id,
        recipe_id: s.recipe_id,
        recipe_name: s.recipe_name,
        servings: s.servings,
        macros: s.macros,
      })),
  }));

  const copyTargets: CopyTarget[] = copySource
    ? weekMealTargets(slots, weekDates, copySource.date, copySource.mealIndex).map((tg) => ({
        key: tg.key,
        label: capitalize(formatDate(parseISO(tg.key), 'EEEE', locale)),
        sublabel: formatDate(parseISO(tg.key), 'd MMM', locale),
        willOverwrite: tg.willOverwrite,
      }))
    : [];

  const copyEntries = copySource
    ? slots.filter((s) => s.date === copySource.date && s.meal_index === copySource.mealIndex)
    : [];

  const copySourceLabel = copySource
    ? `${copyEntries[0]?.meal_time?.slice(0, 5) ?? ''} · ${capitalize(formatDate(parseISO(copySource.date), 'EEEE', locale))}`.trim()
    : '';

  async function handleApply(templateId: string) {
    await apply.mutateAsync({ templateId, targetDate: today });
  }

  async function handleSaveAs(name: string) {
    if (!week.data) return;
    await saveAs.mutateAsync({ weekId: week.data.id, name });
  }

  async function handleAdd(
    date: string,
    mealIndex: number,
    mealTime: string | null,
    recipe: { id: string; name: string },
    servings: number,
  ) {
    if (!week.data) return;
    const sameSlot = week.data.slots.filter(
      (s) =>
        s.date === date && s.meal_index === mealIndex && (s.meal_time ?? '') === (mealTime ?? ''),
    );
    await addSlot.mutateAsync({
      plan_week_id: week.data.id,
      date,
      meal_index: mealIndex,
      meal_time: mealTime,
      recipe_id: recipe.id,
      servings,
      display_order: sameSlot.length,
    });
  }

  const hasTemplates = (templates.data ?? []).length > 0;
  const hasSlots = (week.data?.slots.length ?? 0) > 0;
  const isEmpty = !week.isLoading && !hasSlots;

  const busy =
    apply.isPending ||
    addSlot.isPending ||
    updateSlot.isPending ||
    deleteSlot.isPending ||
    saveAs.isPending;

  const weekLabel = t('planner.weekLabel', {
    week: isoWeekNumber(weekStart),
    from: formatDate(parseISO(weekStart), 'd MMM', locale),
    to: formatDate(addDays(parseISO(weekStart), 6), 'd MMM', locale),
  });

  const applyLabel = week.data?.source_template_id
    ? t('planner.swapTemplate')
    : t('planner.applyTemplate');

  // Desktop header meta: week label + phase chip. The two week metrics live in
  // the body (above the grid) — in the header they made the row too long to fit
  // any realistic desktop width.
  const headerMeta = (
    <div className="flex items-center gap-3.5">
      <span className="h-5 w-px bg-border" aria-hidden="true" />
      <span className="tnum whitespace-nowrap text-[13.5px] font-medium">{weekLabel}</span>
      {phaseType && <PhaseChip phase={phaseType} />}
    </div>
  );

  // Week metrics (desktop only — the mobile stack has its own summary card).
  const weekMetrics = targets && (
    <div className="ml-auto hidden items-center gap-3.5 md:flex">
      <span className="flex items-baseline gap-1.5 text-[12.5px]">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-dim">
          {t('planner.avgKcal')}
        </span>
        <span className="tnum font-semibold text-foreground">{avgKcal}</span>
        <span className="tnum text-[11.5px] text-text-dim">/ {roundMacro(targets.kcal)} kcal</span>
      </span>
      <span className="h-5 w-px bg-border" aria-hidden="true" />
      <span className="flex items-baseline gap-1.5 text-[12.5px]">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-dim">
          {t('planner.proteinAvg')}
        </span>
        <span className="tnum font-semibold text-foreground">{avgProteinG} g</span>
        {proteinPct != null && (
          <span className="tnum text-[11.5px] text-text-dim">
            {t('planner.proteinPct', { pct: proteinPct })}
          </span>
        )}
      </span>
    </div>
  );

  const headerActions = (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" asChild>
        <Link to="/templates">
          <FileBox className="h-4 w-4" />
          {t('planner.manageTemplates')}
        </Link>
      </Button>
      <Button
        variant="outline"
        onClick={() => setApplyOpen(true)}
        disabled={!hasTemplates}
        title={!hasTemplates ? t('planner.needTemplate') : undefined}
      >
        <ArrowLeftRight className="h-4 w-4" />
        {applyLabel}
      </Button>
      <Button variant="outline" onClick={() => setSaveOpen(true)} disabled={!hasSlots}>
        <Save className="h-4 w-4" />
        {t('planner.saveAsTemplate')}
      </Button>
      <Button onClick={() => setShoppingOpen(true)} disabled={!hasSlots}>
        <ShoppingCart className="h-4 w-4" />
        {t('shopping.open')}
      </Button>
    </div>
  );

  return (
    <PageShell title={t('planner.pageTitle')} meta={headerMeta} actions={headerActions}>
      <div className="space-y-4">
        {/* Mobile header block: week label + phase chip + the shopping-list button
            (the desktop header carries all three). */}
        <div data-mobile-stack="header" className="flex items-center gap-2 md:hidden">
          <span className="tnum text-[11.5px] text-text-dim">{weekLabel}</span>
          {phaseType && <PhaseChip phase={phaseType} className="ml-auto" />}
          <Button
            variant="outline"
            size="icon"
            className={phaseType ? undefined : 'ml-auto'}
            onClick={() => setShoppingOpen(true)}
            disabled={!hasSlots}
            aria-label={t('shopping.open')}
            title={t('shopping.open')}
          >
            <ShoppingCart className="h-4 w-4" />
          </Button>
        </div>

        {/* Source template + the two week metrics: one line above the grid. */}
        {(week.data?.source_template_name || (weekMetrics && hasSlots)) && (
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-sm text-muted-foreground">
            {week.data?.source_template_name && (
              <div className="flex flex-wrap items-center gap-2">
                <span>{t('planner.basedOn', { name: week.data.source_template_name })}</span>
                {week.data.has_diverged && (
                  <Badge variant="warning" className="gap-1">
                    <Sparkles className="h-3 w-3" />
                    {t('planner.diverged')}
                  </Badge>
                )}
              </div>
            )}
            {hasSlots && weekMetrics}
          </div>
        )}

        {week.isLoading ? (
          <Card>
            <CardContent className="space-y-3 py-6">
              <Skeleton className="h-6 w-40" />
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 21 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : isEmpty ? (
          <Card>
            <CardContent className="space-y-3 py-10 text-center">
              <FileBox className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">
                {hasTemplates ? t('planner.empty.hasTemplates') : t('planner.empty.noTemplates')}
              </p>
              {hasTemplates ? (
                <Button onClick={() => setApplyOpen(true)}>{t('planner.empty.applyCta')}</Button>
              ) : (
                <Button asChild>
                  <Link to="/templates/new">{t('planner.empty.createCta')}</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          week.data && (
            <>
              {/* Mobile: strip + summary chart + today's plan. */}
              <div data-mobile-stack="today" className="space-y-3 md:hidden">
                <WeekStrip
                  days={chartDays}
                  selectedDate={selectedDate}
                  onSelect={setSelectedDate}
                  target={targets?.kcal}
                  phase={phaseType}
                />
                <WeekSummaryCard days={chartDays} targets={targets} phase={phaseType} />

                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                    {t(selectedIsToday ? 'planner.todayHeading' : 'planner.dayHeading', {
                      date: capitalize(formatDate(parseISO(selectedDate), 'EEE d', locale)),
                    })}
                  </span>
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  {targets && (
                    <span className="tnum text-[11px] text-text-dim">
                      {t('planner.todayKcal', {
                        consumed: roundMacro(selectedTotals.kcal),
                        target: roundMacro(targets.kcal),
                      })}
                    </span>
                  )}
                </div>

                <TodayPlanList
                  meals={dayMeals}
                  busy={busy}
                  onAddMeal={(mealIndex, mealTime) =>
                    setMobilePick({ mealIndex, mealTime, entry: null })
                  }
                  onCopyMeal={(mealIndex) => setCopySource({ date: selectedDate, mealIndex })}
                  onOpenEntry={(entry) => {
                    const row = dayMeals.find((m) => m.entries.some((e) => e.id === entry.id));
                    setMobilePick({
                      mealIndex: row?.mealIndex ?? 0,
                      mealTime: row?.mealTime ?? null,
                      entry,
                    });
                  }}
                />

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setApplyOpen(true)}
                    disabled={!hasTemplates}
                    title={!hasTemplates ? t('planner.needTemplate') : undefined}
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                    {applyLabel}
                  </Button>
                  <Button variant="outline" onClick={() => setSaveOpen(true)} disabled={!hasSlots}>
                    <Save className="h-4 w-4" />
                    {t('planner.saveAsTemplate')}
                  </Button>
                </div>
              </div>

              {/* Web: the full week grid. */}
              <div className="hidden md:block">
                <WeekGrid
                  weekStart={week.data.week_start}
                  slots={week.data.slots}
                  mealTimes={week.data.meal_times}
                  todayIso={today}
                  busy={busy}
                  targets={targets}
                  phaseType={phaseType}
                  weightKg={weightKg}
                  onAdd={handleAdd}
                  onUpdate={async (slotId, recipe, servings) => {
                    await updateSlot.mutateAsync({
                      id: slotId,
                      patch: { recipe_id: recipe.id, servings },
                    });
                  }}
                  onRemove={async (slotId) => {
                    await deleteSlot.mutateAsync(slotId);
                  }}
                  onCopyMeal={(date, mealIndex) => setCopySource({ date, mealIndex })}
                />
              </div>
            </>
          )
        )}

        <ApplyTemplateDialog
          open={applyOpen}
          onOpenChange={setApplyOpen}
          targetDate={today}
          onApply={handleApply}
          busy={apply.isPending}
        />
        <SaveAsTemplateDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          weekStart={weekStart}
          onSave={handleSaveAs}
          busy={saveAs.isPending}
        />
        <ShoppingListDialog
          open={shoppingOpen}
          onOpenChange={setShoppingOpen}
          weekStart={weekStart}
        />
        <RecipePickerDialog
          open={!!mobilePick}
          onOpenChange={(o) => !o && setMobilePick(null)}
          initialRecipe={
            pickedEntry
              ? {
                  id: pickedEntry.recipe_id,
                  name: pickedEntry.recipe_name,
                  servings: pickedEntry.servings,
                }
              : null
          }
          busy={busy}
          onSave={async (recipeId, recipeName, servings) => {
            if (!mobilePick) return;
            if (pickedEntry) {
              await updateSlot.mutateAsync({
                id: pickedEntry.id,
                patch: { recipe_id: recipeId, servings },
              });
            } else {
              await handleAdd(
                selectedDate,
                mobilePick.mealIndex,
                mobilePick.mealTime,
                { id: recipeId, name: recipeName },
                servings,
              );
            }
          }}
          onDelete={
            pickedEntry
              ? async () => {
                  await deleteSlot.mutateAsync(pickedEntry.id);
                  setMobilePick(null);
                }
              : undefined
          }
        />
        <CopyMealDialog
          open={!!copySource}
          onOpenChange={(o) => !o && setCopySource(null)}
          sourceLabel={copySourceLabel}
          entryNames={copyEntries.map((s) => s.recipe_name)}
          targets={copyTargets}
          busy={copyMeal.isPending}
          allowAppend
          onConfirm={async (keys, /* mode wired in the next task */ _mode) => {
            if (!copySource || !week.data) return;
            await copyMeal.mutateAsync({
              plan_week_id: week.data.id,
              source_date: copySource.date,
              meal_index: copySource.mealIndex,
              target_dates: keys,
            });
          }}
        />
      </div>
    </PageShell>
  );
}
