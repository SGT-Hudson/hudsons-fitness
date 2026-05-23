import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, FileBox, Save, ShoppingCart, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ApplyTemplateDialog } from '@/features/planning/components/ApplyTemplateDialog';
import { SaveAsTemplateDialog } from '@/features/planning/components/SaveAsTemplateDialog';
import { ShoppingListDialog } from '@/features/planning/components/ShoppingListDialog';
import { WeekGrid } from '@/features/planning/components/WeekGrid';
import {
  useActiveWeek,
  useAddWeekSlot,
  useApplyTemplateToWeek,
  useDeleteWeekSlot,
  useSaveWeekAsTemplate,
  useUpdateWeekSlot,
} from '@/features/planner/hooks';
import { useTemplates } from '@/features/templates/hooks';
import { useDailyTarget } from '@/features/planning/useDailyTarget';
import { formatDate, isoDate, mondayOf, type Locale } from '@/lib/dates';

export function PlanificadorPage() {
  const { t, i18n } = useTranslation('planning');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;

  const today = isoDate();
  const weekStart = formatDate(mondayOf(new Date()), 'yyyy-MM-dd', locale);

  const { targets, phaseType } = useDailyTarget();

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

  async function handleApply(templateId: string) {
    await apply.mutateAsync({ templateId, targetDate: today });
  }

  async function handleSaveAs(name: string) {
    if (!week.data) return;
    await saveAs.mutateAsync({ weekId: week.data.id, name });
  }

  const hasTemplates = (templates.data ?? []).length > 0;
  const isEmpty = !week.isLoading && (!week.data || week.data.slots.length === 0);

  const busy =
    apply.isPending ||
    addSlot.isPending ||
    updateSlot.isPending ||
    deleteSlot.isPending ||
    saveAs.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('planner.pageTitle')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('planner.weekOf', {
              date: formatDate(weekStart, 'd MMM yyyy', locale),
            })}
          </p>
        </div>
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
            {week.data?.source_template_id ? t('planner.swapTemplate') : t('planner.applyTemplate')}
          </Button>
          <Button
            variant="outline"
            onClick={() => setSaveOpen(true)}
            disabled={!week.data || week.data.slots.length === 0}
          >
            <Save className="h-4 w-4" />
            {t('planner.saveAsTemplate')}
          </Button>
          <Button
            variant="outline"
            onClick={() => setShoppingOpen(true)}
            disabled={!week.data || week.data.slots.length === 0}
          >
            <ShoppingCart className="h-4 w-4" />
            {t('shopping.open')}
          </Button>
        </div>
      </div>

      {week.data?.source_template_name && (
        <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
          <span>
            {t('planner.basedOn', { name: week.data.source_template_name })}
          </span>
          {week.data.has_diverged && (
            <Badge variant="warning" className="gap-1">
              <Sparkles className="h-3 w-3" />
              {t('planner.diverged')}
            </Badge>
          )}
        </div>
      )}

      {week.isLoading ? (
        <Card>
          <CardContent className="py-6 space-y-3">
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
          <CardContent className="py-10 text-center space-y-3">
            <FileBox className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">
              {hasTemplates ? t('planner.empty.hasTemplates') : t('planner.empty.noTemplates')}
            </p>
            {hasTemplates ? (
              <Button onClick={() => setApplyOpen(true)}>
                {t('planner.empty.applyCta')}
              </Button>
            ) : (
              <Button asChild>
                <Link to="/templates/new">{t('planner.empty.createCta')}</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        week.data && (
          <WeekGrid
            weekStart={week.data.week_start}
            slots={week.data.slots}
            todayIso={today}
            busy={busy}
            targets={targets}
            phaseType={phaseType}
            onAdd={async (date, mealIndex, mealTime, recipe, servings) => {
              if (!week.data) return;
              const sameSlot = week.data.slots.filter(
                (s) =>
                  s.date === date &&
                  s.meal_index === mealIndex &&
                  (s.meal_time ?? '') === (mealTime ?? ''),
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
            }}
            onUpdate={async (slotId, recipe, servings) => {
              await updateSlot.mutateAsync({
                id: slotId,
                patch: { recipe_id: recipe.id, servings },
              });
            }}
            onRemove={async (slotId) => {
              await deleteSlot.mutateAsync(slotId);
            }}
          />
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
    </div>
  );
}
