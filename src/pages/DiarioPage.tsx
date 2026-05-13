import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DateNavigator } from '@/features/diario/components/DateNavigator';
import { DayTotalsCard } from '@/features/diario/components/DayTotalsCard';
import { MealLogEntry } from '@/features/diario/components/MealLogEntry';
import { MealLogDialog } from '@/features/diario/components/MealLogDialog';
import { useMealLogsForDay } from '@/features/diario/hooks';
import { computeMealLogMacros, sumMacros } from '@/features/diario/macros';
import { MEAL_TYPE_ORDER, type MealLogWithJoins, type MealType } from '@/features/diario/api';
import { useLatestMeasurement } from '@/features/measurements/hooks';
import { useActivePhase } from '@/features/phases/hooks';
import { computePhaseTargets } from '@/features/phases/targets';
import { isoDate } from '@/lib/dates';

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export function DiarioPage() {
  const { t } = useTranslation('diario');
  const navigate = useNavigate();
  const params = useParams<{ date?: string }>();
  const today = isoDate();
  const date = params.date && isValidDate(params.date) ? params.date : today;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMealType, setDialogMealType] = useState<MealType>('breakfast');
  const [editing, setEditing] = useState<MealLogWithJoins | null>(null);

  const logs = useMealLogsForDay(date);
  const latestMeasurement = useLatestMeasurement();
  const activePhase = useActivePhase();

  function changeDate(newDate: string) {
    navigate(newDate === today ? '/diario' : `/diario/${newDate}`);
  }

  useEffect(() => {
    if (params.date && !isValidDate(params.date)) {
      navigate('/diario', { replace: true });
    }
  }, [params.date, navigate]);

  const grouped = useMemo(() => {
    const map = new Map<MealType, MealLogWithJoins[]>();
    for (const mt of MEAL_TYPE_ORDER) map.set(mt, []);
    for (const log of logs.data ?? []) {
      const mt = (log.meal_type as MealType) ?? 'other';
      const list = map.get(mt) ?? [];
      list.push(log);
      map.set(mt, list);
    }
    return map;
  }, [logs.data]);

  const totals = useMemo(
    () => sumMacros((logs.data ?? []).map((l) => computeMealLogMacros(l))),
    [logs.data],
  );

  const targets = useMemo(() => {
    if (!activePhase.data || !latestMeasurement.data?.weight_kg) return undefined;
    return (
      computePhaseTargets(
        activePhase.data,
        latestMeasurement.data.weight_kg,
        latestMeasurement.data.body_fat_pct,
      ) ?? undefined
    );
  }, [activePhase.data, latestMeasurement.data]);

  function openNew(mealType: MealType) {
    setEditing(null);
    setDialogMealType(mealType);
    setDialogOpen(true);
  }

  function openEdit(log: MealLogWithJoins) {
    setEditing(log);
    setDialogMealType((log.meal_type as MealType) ?? 'other');
    setDialogOpen(true);
  }

  const isEmpty = (logs.data ?? []).length === 0 && !logs.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl font-bold tracking-tight">{t('pageTitle')}</h1>
        <Button onClick={() => openNew('breakfast')}>
          <Plus className="h-4 w-4" />
          {t('addEntry')}
        </Button>
      </div>

      <DateNavigator date={date} onChange={changeDate} />

      <DayTotalsCard totals={totals} targets={targets} />

      {logs.isLoading ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('loading')}
          </CardContent>
        </Card>
      ) : isEmpty ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-muted-foreground">{t('empty.message')}</p>
            <Button onClick={() => openNew('breakfast')}>
              <Plus className="h-4 w-4" />
              {t('empty.cta')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {MEAL_TYPE_ORDER.map((mt) => {
            const items = grouped.get(mt) ?? [];
            if (items.length === 0) return null;
            return (
              <Card key={mt}>
                <div className="flex items-center justify-between px-4 py-2 border-b">
                  <h2 className="font-semibold">{t(`mealType.${mt}`)}</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openNew(mt)}
                    aria-label={t('addToMeal')}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <ul className="divide-y">
                  {items.map((log) => (
                    <MealLogEntry key={log.id} log={log} onEdit={openEdit} />
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      <MealLogDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        loggedOn={date}
        initialMealType={dialogMealType}
        editing={editing}
      />
    </div>
  );
}
