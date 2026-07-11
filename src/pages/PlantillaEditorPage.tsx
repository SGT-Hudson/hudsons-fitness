import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { addDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageShell } from '@/components/layout/PageShell';
import { MealTimesEditor } from '@/features/planning/components/MealTimesEditor';
import {
  CopyMealDialog,
  type CopyMode,
  type CopyTarget,
} from '@/features/planning/components/CopyMealDialog';
import {
  TemplateGrid,
  type TemplateSlotInput,
} from '@/features/planning/components/TemplateGrid';
import { templateMealTargets } from '@/features/planning/copyTargets';
import { copyTemplateMeal } from '@/features/templates/copyMeal';
import { formatDate, mondayOf, type Locale } from '@/lib/dates';
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

function capitalizeTpl(s: string): string {
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
    defaultValues: { name: '', meal_times: DEFAULT_TIMES },
  });
  const mealTimes = watch('meal_times');
  const [slots, setSlots] = useState<TemplateSlotInput[]>([]);
  const recipeMacros = useRecipeMacros(slots.map((s) => s.recipe_id));
  const { targets, phaseType, weightKg } = useDailyTarget();
  const [copySource, setCopySource] = useState<{ dayOfWeek: number; mealIndex: number } | null>(null);

  // Reference Monday so day-of-week → full localized weekday label (no date involved).
  const refMonday = mondayOf(new Date());
  const dayLabel = (dow: number) =>
    capitalizeTpl(formatDate(addDays(refMonday, dow), 'EEEE', locale));

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
        // write of null, not "leave alone" — carry the stored phase through
        // untouched until the editor grows its own picker. A new template has
        // no stored phase, so it is created untagged (never the active phase).
        phaseType: templateQuery.data?.phase_type ?? null,
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
        <CardContent className="pt-6 space-y-4">
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
        </CardContent>
      </Card>

      {(validationError || error) && (
        <p className="text-sm text-destructive">{validationError ?? error}</p>
      )}

      <Card>
        <CardContent className="pt-6">
          <TemplateGrid
            mealTimes={mealTimes}
            slots={slots}
            onAdd={addSlot}
            onUpdate={updateSlot}
            onRemove={removeSlot}
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
    </form>
    </PageShell>
  );
}

