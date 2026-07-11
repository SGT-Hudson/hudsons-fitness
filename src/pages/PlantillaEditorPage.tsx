import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageShell } from '@/components/layout/PageShell';
import { PhasePicker } from '@/components/ui/PhasePicker';
import { MealTimesEditor } from '@/features/planning/components/MealTimesEditor';
import {
  AddRecipeDrawer,
  type AddRecipeEditing,
  type AddRecipeTarget,
} from '@/features/planning/components/AddRecipeDrawer';
import {
  CopyMealDialog,
  type CopyMode,
  type CopyTarget,
} from '@/features/planning/components/CopyMealDialog';
import {
  TemplateGrid,
  type TemplateSlotInput,
} from '@/features/planning/components/TemplateGrid';
import { WeekStrip } from '@/features/planning/components/WeekStrip';
import type { PlannerCellEntry } from '@/features/planning/components/PlannerMealCell';
import { TemplateDayList } from '@/features/templates/components/TemplateDayList';
import { templateMealTargets } from '@/features/planning/copyTargets';
import { mealLabelKey } from '@/features/planning/weekSummary';
import { copyTemplateMeal } from '@/features/templates/copyMeal';
import { dayOfWeekFor, templateDayTotals, templateWeekDates } from '@/features/templates/templateWeek';
import { roundMacro, ZERO_MACROS, type Macros } from '@/features/recipes/macros';
import { formatDate, type Locale } from '@/lib/dates';
import { useSaveTemplate, useTemplate, useRecipeMacros } from '@/features/templates/hooks';
import { useDailyTarget } from '@/features/planning/useDailyTarget';
import {
  firstTemplateError,
  templateFormSchema,
  type TemplateFormValues,
} from '@/features/templates/schema';

let rowIdCounter = 0;
function newRowId() {
  rowIdCounter += 1;
  return `tslot-${Date.now()}-${rowIdCounter}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const DEFAULT_TIMES = ['08:00', '13:00', '17:00', '21:00'];

export function PlantillaEditorPage() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('planning');
  const { t: tCommon } = useTranslation('common');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;

  const templateQuery = useTemplate(isNew ? null : id);
  const save = useSaveTemplate();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    // A NEW template is born untagged. The user's active phase is a different
    // concept and must never seed this field.
    defaultValues: { name: '', meal_times: DEFAULT_TIMES, phase_type: null },
  });
  const mealTimes = watch('meal_times');
  const [slots, setSlots] = useState<TemplateSlotInput[]>([]);
  const recipeMacros = useRecipeMacros(slots.map((s) => s.recipe_id));

  // The user's ACTIVE phase and its macro targets: they score the day headers
  // and the add drawer's balance. Not the template's own `phase_type` — that is
  // a label the picker above owns.
  const { targets, phaseType, weightKg } = useDailyTarget();

  const [copySource, setCopySource] = useState<{ dayOfWeek: number; mealIndex: number } | null>(null);

  // Below `md` the week grid is hidden, so the day list is the only editable
  // surface — the week strip picks which day it shows (and writes to). A
  // template has no "today", so it opens on Monday.
  const [selectedDay, setSelectedDay] = useState(0);

  // The add drawer is mounted ONCE, here — the grid and the day list only raise
  // intents. `addTarget` holds its CONTENT and `addOpen` its visibility, kept
  // apart (as on PlanificadorPage) so closing doesn't yank the props out from
  // under vaul mid-exit-transition.
  const [addTarget, setAddTarget] = useState<{
    dayOfWeek: number;
    mealIndex: number;
    target: AddRecipeTarget;
    editing?: AddRecipeEditing;
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // A presentational bridge (Task 2, R-33 wave 4): the reference Monday's dates
  // exist only to derive a full localized weekday label from a `day_of_week`
  // index, and to give the date-shaped shared components (WeekStrip, the add
  // drawer's target) something to hold. They never reach the DB.
  const weekDates = useMemo(() => templateWeekDates(new Date()), []);
  const dayLabel = (dow: number) => capitalize(formatDate(weekDates[dow], 'EEEE', locale));

  const macrosMap = recipeMacros.data ?? new Map<string, Macros>();
  const dayTotals = templateDayTotals(slots, macrosMap);
  const selectedTotals = dayTotals.get(selectedDay) ?? ZERO_MACROS;

  const stripDays = weekDates.map((date, dow) => ({
    date,
    kcal: (dayTotals.get(dow) ?? ZERO_MACROS).kcal,
    isToday: false,
  }));

  const copyTargets: CopyTarget[] = copySource
    ? templateMealTargets(slots, copySource.dayOfWeek, copySource.mealIndex).map((tg) => ({
        key: tg.key,
        label: dayLabel(Number(tg.key)),
        willOverwrite: tg.willOverwrite,
      }))
    : [];

  const copyEntries = copySource
    ? slots.filter(
        (s) => s.day_of_week === copySource.dayOfWeek && s.meal_index === copySource.mealIndex,
      )
    : [];

  const copySourceLabel = copySource
    ? `${mealTimes[copySource.mealIndex] ?? ''} · ${dayLabel(copySource.dayOfWeek)}`.trim()
    : '';

  // Templates have no append mode yet (`copyTemplateMeal` only replaces) — the
  // mode arg is accepted so this compiles against the restyled dialog, and
  // ignored until a future task extends templates the same way weeks were.
  function handleCopyMeal(keys: string[], _mode: CopyMode) {
    if (!copySource) return;
    setSlots((s) =>
      copyTemplateMeal(s, copySource.dayOfWeek, copySource.mealIndex, keys.map(Number), newRowId),
    );
  }

  useEffect(() => {
    if (isNew) return;
    if (templateQuery.data) {
      reset({
        name: templateQuery.data.name,
        meal_times:
          templateQuery.data.default_meal_times.length > 0
            ? templateQuery.data.default_meal_times.map((tt) => tt.slice(0, 5))
            : DEFAULT_TIMES,
        phase_type: templateQuery.data.phase_type,
      });
      setSlots(
        templateQuery.data.slots.map((s) => ({
          rowId: newRowId(),
          day_of_week: s.day_of_week,
          meal_index: s.meal_index,
          recipe_id: s.recipe_id,
          recipe_name: s.recipe_name,
          servings: s.servings,
          display_order: s.display_order,
        })),
      );
    }
  }, [isNew, templateQuery.data, reset]);

  if (!isNew && templateQuery.isLoading) {
    return <div className="text-muted-foreground">{tCommon('loading')}</div>;
  }
  if (!isNew && templateQuery.error) {
    return <Navigate to="/templates" replace />;
  }

  function addSlot(
    day: number,
    meal: number,
    recipeId: string,
    recipeName: string,
    servings: number,
  ) {
    setSlots((s) => {
      const existing = s.filter((x) => x.day_of_week === day && x.meal_index === meal);
      return [
        ...s,
        {
          rowId: newRowId(),
          day_of_week: day,
          meal_index: meal,
          recipe_id: recipeId,
          recipe_name: recipeName,
          servings,
          display_order: existing.length,
        },
      ];
    });
  }

  function updateSlot(rowId: string, recipeId: string, recipeName: string, servings: number) {
    setSlots((s) =>
      s.map((x) =>
        x.rowId === rowId
          ? { ...x, recipe_id: recipeId, recipe_name: recipeName, servings }
          : x,
      ),
    );
  }

  function removeSlot(rowId: string) {
    setSlots((s) => s.filter((x) => x.rowId !== rowId));
  }

  /** "Jueves · Desayuno · 08:00" — a weekday, never a date: a template has none. */
  function slotLabel(dayOfWeek: number, mealIndex: number): string {
    const { key, params } = mealLabelKey(mealIndex);
    const time = mealTimes[mealIndex];
    const parts = {
      day: dayLabel(dayOfWeek),
      meal: t(key, params ?? {}),
      time: time?.slice(0, 5) ?? '',
    };
    return time ? t('addRecipe.destination', parts) : t('addRecipe.destinationNoTime', parts);
  }

  function drawerTarget(dayOfWeek: number, mealIndex: number): AddRecipeTarget {
    return {
      date: weekDates[dayOfWeek],
      mealIndex,
      mealTime: mealTimes[mealIndex] ?? null,
      dayTotals: dayTotals.get(dayOfWeek) ?? ZERO_MACROS,
    };
  }

  /** Open the add drawer on an empty slot. */
  function openAdd(dayOfWeek: number, mealIndex: number) {
    setAddTarget({ dayOfWeek, mealIndex, target: drawerTarget(dayOfWeek, mealIndex) });
    setAddOpen(true);
  }

  /**
   * Open the drawer on an EXISTING slot. `dayTotals` stays the day's full
   * totals — the drawer subtracts `editing.macros` itself, so pre-subtracting
   * here would double-count the swap.
   */
  function openEdit(entry: PlannerCellEntry, dayOfWeek: number, mealIndex: number) {
    setAddTarget({
      dayOfWeek,
      mealIndex,
      target: drawerTarget(dayOfWeek, mealIndex),
      editing: {
        id: entry.id,
        recipe_id: entry.recipe_id,
        recipe_name: entry.recipe_name,
        servings: entry.servings,
        macros: entry.macros,
      },
    });
    setAddOpen(true);
  }

  // One localized message, original precedence (name → times) — D-C2 parity.
  const validationCode = firstTemplateError(
    errors as Record<string, { message?: string } | undefined>,
  );
  const validationError = validationCode ? t(`editor.errors.${validationCode}`) : null;

  function onInvalid() {
    setError(null);
  }

  async function onValid(values: TemplateFormValues) {
    setError(null);
    try {
      const newId = await save.mutateAsync({
        templateId: isNew ? null : id!,
        name: values.name.trim(),
        sameScheduleAllDays: true,
        defaultMealTimes: values.meal_times,
        slots: slots.map((s, i) => ({
          day_of_week: s.day_of_week,
          meal_index: s.meal_index,
          recipe_id: s.recipe_id,
          servings: s.servings,
          display_order: i,
        })),
        // `save_template` writes `p_phase_type` unconditionally, so null is a
        // write of null: the picker's "Sin fase" genuinely clears the tag.
        phaseType: values.phase_type,
      });
      navigate(isNew ? `/templates/${newId}` : '/templates', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <PageShell title={isNew ? t('editor.newTitle') : t('editor.editTitle')} back="/templates">
      <form onSubmit={handleSubmit(onValid, onInvalid)} className="space-y-6">
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/templates')}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? tCommon('loading') : tCommon('save')}
          </Button>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">{t('editor.name')}</Label>
              <Input
                id="tpl-name"
                placeholder={t('editor.namePlaceholder')}
                {...register('name')}
              />
            </div>

            <Controller
              control={control}
              name="meal_times"
              render={({ field }) => (
                <MealTimesEditor times={field.value} onChange={field.onChange} />
              )}
            />

            {/* The template's own phase — changeable here, and clearable back to
                "Sin fase" (null). Independent of the user's active phase. */}
            <div className="space-y-2">
              <p className="text-sm font-medium leading-none">{t('phase.pick')}</p>
              <Controller
                control={control}
                name="phase_type"
                render={({ field }) => (
                  <PhasePicker value={field.value} onChange={field.onChange} />
                )}
              />
            </div>
          </CardContent>
        </Card>

        {(validationError || error) && (
          <p className="text-sm text-destructive">{validationError ?? error}</p>
        )}

        {/* Mobile: the week strip picks a day, the day list edits it. */}
        <div data-mobile-stack="day" className="space-y-3 md:hidden">
          <WeekStrip
            days={stripDays}
            selectedDate={weekDates[selectedDay]}
            onSelect={(dateIso) => setSelectedDay(dayOfWeekFor(dateIso, weekDates))}
            target={targets?.kcal}
            phase={phaseType}
            dateless
          />

          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
              {dayLabel(selectedDay)}
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

          <TemplateDayList
            dayOfWeek={selectedDay}
            mealTimes={mealTimes}
            slots={slots}
            recipeMacros={recipeMacros.data}
            onAddRequest={(mealIndex) => openAdd(selectedDay, mealIndex)}
            onOpenEntry={(entry, mealIndex) => openEdit(entry, selectedDay, mealIndex)}
            onCopyMeal={(mealIndex) => setCopySource({ dayOfWeek: selectedDay, mealIndex })}
          />
        </div>

        {/* Web: the full 7-day grid. */}
        <Card data-web-grid className="hidden md:block">
          <CardContent className="pt-6">
            <TemplateGrid
              mealTimes={mealTimes}
              slots={slots}
              onAddRequest={openAdd}
              onOpenEntry={openEdit}
              recipeMacros={recipeMacros.data}
              targets={targets}
              phaseType={phaseType}
              weightKg={weightKg}
              onCopyMeal={(dayOfWeek, mealIndex) => setCopySource({ dayOfWeek, mealIndex })}
            />
          </CardContent>
        </Card>

        <CopyMealDialog
          open={!!copySource}
          onOpenChange={(o) => !o && setCopySource(null)}
          sourceLabel={copySourceLabel}
          entryNames={copyEntries.map((s) => s.recipe_name)}
          targets={copyTargets}
          onConfirm={handleCopyMeal}
        />

        {addTarget && (
          <AddRecipeDrawer
            open={addOpen}
            onOpenChange={setAddOpen}
            target={addTarget.target}
            editing={addTarget.editing}
            targets={targets}
            phaseType={phaseType}
            destinationLabel={slotLabel(addTarget.dayOfWeek, addTarget.mealIndex)}
            onAdd={(recipeId, recipeName, servings) => {
              addSlot(addTarget.dayOfWeek, addTarget.mealIndex, recipeId, recipeName, servings);
              setAddOpen(false);
            }}
            onUpdate={(entryId, recipeId, recipeName, servings) => {
              updateSlot(entryId, recipeId, recipeName, servings);
              setAddOpen(false);
            }}
            onRemove={(entryId) => {
              removeSlot(entryId);
              setAddOpen(false);
            }}
          />
        )}
      </form>
    </PageShell>
  );
}
