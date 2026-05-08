import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MealTimesEditor } from '@/features/planning/components/MealTimesEditor';
import {
  TemplateGrid,
  type TemplateSlotInput,
} from '@/features/planning/components/TemplateGrid';
import { useSaveTemplate, useTemplate } from '@/features/templates/hooks';

let rowIdCounter = 0;
function newRowId() {
  rowIdCounter += 1;
  return `tslot-${Date.now()}-${rowIdCounter}`;
}

const DEFAULT_TIMES = ['08:00', '13:00', '17:00', '21:00'];

export function PlantillaEditorPage() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id || id === 'nuevo';
  const navigate = useNavigate();
  const { t } = useTranslation('planning');
  const { t: tCommon } = useTranslation('common');

  const templateQuery = useTemplate(isNew ? null : id);
  const save = useSaveTemplate();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [mealTimes, setMealTimes] = useState<string[]>(DEFAULT_TIMES);
  const [slots, setSlots] = useState<TemplateSlotInput[]>([]);

  useEffect(() => {
    if (isNew) return;
    if (templateQuery.data) {
      setName(templateQuery.data.name);
      setMealTimes(
        templateQuery.data.default_meal_times.length > 0
          ? templateQuery.data.default_meal_times.map((tt) => tt.slice(0, 5))
          : DEFAULT_TIMES,
      );
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
  }, [isNew, templateQuery.data]);

  if (!isNew && templateQuery.isLoading) {
    return <div className="text-muted-foreground">{tCommon('loading')}</div>;
  }
  if (!isNew && templateQuery.error) {
    return <Navigate to="/menus" replace />;
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

  async function handleSave() {
    setError(null);
    const trimmed = name.trim();
    if (trimmed === '') {
      setError(t('editor.errors.nameRequired'));
      return;
    }
    if (mealTimes.length === 0) {
      setError(t('editor.errors.timesRequired'));
      return;
    }
    try {
      const newId = await save.mutateAsync({
        templateId: isNew ? null : id!,
        name: trimmed,
        sameScheduleAllDays: true,
        defaultMealTimes: mealTimes,
        slots: slots.map((s, i) => ({
          day_of_week: s.day_of_week,
          meal_index: s.meal_index,
          recipe_id: s.recipe_id,
          servings: s.servings,
          display_order: i,
        })),
      });
      navigate(isNew ? `/menus/${newId}` : '/menus', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl font-bold tracking-tight">
          {isNew ? t('editor.newTitle') : t('editor.editTitle')}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/menus')}>
            {tCommon('cancel')}
          </Button>
          <Button onClick={() => void handleSave()} disabled={save.isPending}>
            {save.isPending ? tCommon('loading') : tCommon('save')}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tpl-name">{t('editor.name')}</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('editor.namePlaceholder')}
            />
          </div>
          <MealTimesEditor times={mealTimes} onChange={setMealTimes} />
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="pt-6">
          <TemplateGrid
            mealTimes={mealTimes}
            slots={slots}
            onAdd={addSlot}
            onUpdate={updateSlot}
            onRemove={removeSlot}
          />
        </CardContent>
      </Card>
    </div>
  );
}

