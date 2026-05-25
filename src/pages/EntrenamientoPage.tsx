import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SessionList } from '@/features/training/components/SessionList';
import { TodayPlan } from '@/features/training/components/TodayPlan';
import { useSessions } from '@/features/training/hooks';
import { useRoutines } from '@/features/training/routines/hooks';
import { useActiveProgram, useSetActiveProgram } from '@/features/training/programs/hooks';
import { useAuth } from '@/features/auth/AuthProvider';
import { todayInTZ } from '@/lib/dates';
import { scheduledSlotForDate, prefillSetsFromRoutine } from '@/core/programs';
import type { RoutineWithExercises, RoutineWarmupSet } from '@/features/training/routines/api';
import type { ProgramDay } from '@/features/training/programs/api';
import type { ProgramDaySlot } from '@/core/programs';
import { supabase } from '@/lib/supabase';
import type { Exercise } from '@/features/training/exercises/api';
import { fetchExerciseHistory } from '@/features/training/api';
import { lastWorkingSetForExercise } from '@/core/training';

function toSlot(d: ProgramDay): ProgramDaySlot {
  return { dayIndex: d.day_index, isRest: d.is_rest, routineId: d.routine_id };
}

function toPrescription(
  re: RoutineWithExercises['routine_exercises'][number],
  lastWorkingWeightKg: number | null,
) {
  return {
    exerciseId: re.exercise_id,
    position: re.position,
    targetSets: re.target_sets,
    targetRepsMin: re.target_reps_min,
    targetRepsMax: re.target_reps_max,
    restSeconds: re.rest_seconds,
    targetRpe: re.target_rpe,
    warmupSets: ((re.warmup_sets as RoutineWarmupSet[] | null) ?? []),
    lastWorkingWeightKg,
  };
}

export function EntrenamientoPage() {
  const { t } = useTranslation('entrenamiento');
  const navigate = useNavigate();
  const { user } = useAuth();

  const activeProgram = useActiveProgram();
  const routinesQuery = useRoutines();
  const sessions = useSessions();
  const setActiveProgramMutation = useSetActiveProgram();

  const today = todayInTZ();
  const active = activeProgram.data ?? null;

  const routinesById: Record<string, RoutineWithExercises> = Object.fromEntries(
    (routinesQuery.data ?? []).map((r) => [r.id, r]),
  );

  const slot = active
    ? scheduledSlotForDate(active.program_days.map(toSlot), active.anchor_date ?? today, today)
    : null;

  const completedToday =
    !!slot?.routineId &&
    (sessions.data ?? []).some(
      (s) => s.performed_on === today && s.routine_id === slot.routineId,
    );

  async function startWorkout(routine: RoutineWithExercises) {
    const ids = routine.routine_exercises.map((re) => re.exercise_id);

    // Resolve exercise rows + per-exercise last working weight in parallel
    const [exercisesResult, historyResults] = await Promise.all([
      ids.length > 0
        ? supabase.from('exercises').select('*').in('id', ids)
        : Promise.resolve({ data: [] as Exercise[] }),
      user
        ? Promise.all(
            routine.routine_exercises.map((re) =>
              fetchExerciseHistory(user.id, re.exercise_id).then((history) => ({
                exerciseId: re.exercise_id,
                lastSet: lastWorkingSetForExercise(history),
              })),
            ),
          )
        : Promise.resolve(routine.routine_exercises.map((re) => ({ exerciseId: re.exercise_id, lastSet: null }))),
    ]);

    const exercisesById: Record<string, Exercise> = {};
    for (const ex of (exercisesResult.data ?? []) as Exercise[]) {
      exercisesById[ex.id] = ex;
    }

    const lastWeightById: Record<string, number | null> = {};
    for (const { exerciseId, lastSet } of historyResults) {
      lastWeightById[exerciseId] = lastSet != null ? Number(lastSet.weightKg) : null;
    }

    const exercises = prefillSetsFromRoutine(
      routine.routine_exercises.map((re) => toPrescription(re, lastWeightById[re.exercise_id] ?? null)),
    );

    navigate('/training/new', {
      state: {
        prefill: {
          programId: active?.id ?? null,
          routineId: routine.id,
          exercises,
          exercisesById,
        },
      },
    });
  }

  function restart() {
    if (!active) return;
    setActiveProgramMutation.mutate({ programId: active.id, anchorDateISO: todayInTZ() });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('page.title')}</h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/training/muscles">{t('muscleMap.title')}</Link>
          </Button>
          <Button asChild>
            <Link to="/training/new">
              <Plus className="h-4 w-4 mr-1" />
              {t('page.newSession')}
            </Link>
          </Button>
        </div>
      </div>

      <TodayPlan
        activeProgram={active}
        routinesById={routinesById}
        todayISO={today}
        completedToday={completedToday}
        onStart={startWorkout}
        onRestartCycle={restart}
        onBuildProgram={() => navigate('/routine')}
      />

      <div className="space-y-2">
        <h2 className="text-base font-medium">{t('today.recentSessions')}</h2>
        <SessionList />
      </div>
    </div>
  );
}
