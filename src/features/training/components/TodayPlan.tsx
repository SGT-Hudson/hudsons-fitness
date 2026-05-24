import { useTranslation } from 'react-i18next';
import { scheduledSlotForDate, projectCycle } from '@/core/programs';
import type { ProgramDaySlot } from '@/core/programs';
import type { ProgramWithDays, ProgramDay } from '../programs/api';
import type { RoutineWithExercises } from '../routines/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Props {
  activeProgram: ProgramWithDays | null;
  routinesById: Record<string, RoutineWithExercises>;
  todayISO: string;
  /** True when a session stamped with today's scheduled routine_id already exists for today. */
  completedToday: boolean;
  onStart: (routine: RoutineWithExercises) => void;
  onRestartCycle: () => void;
  onBuildProgram: () => void;
}

function toSlot(d: ProgramDay): ProgramDaySlot {
  return { dayIndex: d.day_index, isRest: d.is_rest, routineId: d.routine_id };
}

export function TodayPlan({
  activeProgram,
  routinesById,
  todayISO,
  completedToday,
  onStart,
  onRestartCycle,
  onBuildProgram,
}: Props) {
  const { t } = useTranslation('entrenamiento');

  // No active program — empty state
  if (!activeProgram) {
    return (
      <Card>
        <CardContent className="p-6 flex flex-col gap-4 items-start">
          <p className="font-semibold text-lg">{t('today.heading')}</p>
          <p className="text-muted-foreground">{t('today.noActiveProgram')}</p>
          <Button onClick={onBuildProgram}>{t('today.createProgram')}</Button>
        </CardContent>
      </Card>
    );
  }

  const slots = activeProgram.program_days.map(toSlot);
  const anchor = activeProgram.anchor_date ?? todayISO;
  const todaySlot = scheduledSlotForDate(slots, anchor, todayISO);

  const upcomingDays = projectCycle(slots, anchor, todayISO, 5);

  function renderTodayContent() {
    if (!todaySlot || todaySlot.isRest) {
      return (
        <p className="text-muted-foreground">{t('today.rest')}</p>
      );
    }

    const routine = todaySlot.routineId ? routinesById[todaySlot.routineId] : undefined;
    if (!routine) {
      // Routine not found — degrade gracefully
      return (
        <p className="text-muted-foreground">{t('today.rest')}</p>
      );
    }

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-base">{routine.name}</span>
          {completedToday && (
            <Badge variant="primary">{t('today.done')}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {t('routine.exerciseCount', { count: routine.routine_exercises.length })}
        </p>
        <Button size="sm" onClick={() => onStart(routine)}>
          {t('today.start')}
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 flex flex-col gap-6">
        {/* Today heading */}
        <p className="font-semibold text-lg">{t('today.heading')}</p>

        {/* Today's slot */}
        {renderTodayContent()}

        {/* Upcoming strip */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t('today.upcoming')}</p>
          <div className="flex flex-wrap gap-2">
            {upcomingDays.map(({ dateISO, slot }) => {
              const label =
                slot && !slot.isRest && slot.routineId && routinesById[slot.routineId]
                  ? routinesById[slot.routineId].name
                  : t('today.rest');
              return (
                <span
                  key={dateISO}
                  title={label}
                  aria-label={`${dateISO.slice(5)} ${label}`}
                  className="flex flex-col items-center text-xs border rounded px-2 py-1 bg-muted"
                >
                  {`${dateISO.slice(5)} · ${label}`}
                </span>
              );
            })}
          </div>
        </div>

        {/* Restart cycle */}
        <Button variant="ghost" size="sm" onClick={onRestartCycle} className="self-start">
          {t('today.restartCycle')}
        </Button>
      </CardContent>
    </Card>
  );
}
