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
import { scheduledSlotForDate } from '@/core/programs';
import type { RoutineWithExercises, RoutineWarmupSet } from '@/features/training/routines/api';
import type { ProgramDay } from '@/features/training/programs/api';
import type { ProgramDaySlot } from '@/core/programs';
import { supabase } from '@/lib/supabase';
import type { Exercise } from '@/features/training/exercises/api';
import { fetchExerciseHistory } from '@/features/training/api';
import { lastWorkingSetForExercise, prefillSetsForExercise } from '@/core/training';
import type { CoachContext, CoreSessionSet } from '@/core/training';
import i18n from '@/i18n';

function toSlot(d: ProgramDay): ProgramDaySlot {
  return { dayIndex: d.day_index, isRest: d.is_rest, routineId: d.routine_id };
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
    const res = routine.routine_exercises.slice().sort((a, b) => a.position - b.position);
    const ids = res.map((re) => re.exercise_id);

    const [exercisesResult, histories] = await Promise.all([
      ids.length > 0
        ? supabase.from('exercises').select('*').in('id', ids)
        : Promise.resolve({ data: [] as Exercise[] }),
      user
        ? Promise.all(
            res.map((re) =>
              fetchExerciseHistory(user.id, re.exercise_id).then((history) => ({
                exerciseId: re.exercise_id,
                history,
              })),
            ),
          )
        : Promise.resolve(res.map((re) => ({ exerciseId: re.exercise_id, history: [] as CoreSessionSet[] }))),
    ]);

    const exById: Record<string, Exercise> = {};
    for (const ex of (exercisesResult.data ?? []) as Exercise[]) exById[ex.id] = ex;

    const historyByExercise: Record<string, CoreSessionSet[]> = {};
    for (const { exerciseId, history } of histories) historyByExercise[exerciseId] = history;

    const lang = (i18n.language || 'es').startsWith('en') ? 'en' : 'es';
    const names: Record<string, string> = {};
    const coachContextByExercise: Record<string, CoachContext> = {};
    const todayISO = todayInTZ();

    const exercises = res.map((re) => {
      const history = historyByExercise[re.exercise_id] ?? [];
      const last = lastWorkingSetForExercise(history);
      const exRow = exById[re.exercise_id];
      names[re.exercise_id] =
        (lang === 'en' ? exRow?.name_en : null) ?? exRow?.name_es ?? re.exercise_id;
      coachContextByExercise[re.exercise_id] = {
        exerciseId: re.exercise_id,
        primaryMuscle: exRow?.primary_muscle ?? null,
        equipment: exRow?.equipment ?? null,
        defaultIncrementKg: exRow?.default_increment_kg ?? null,
        history,
        todayISO,
      };
      return {
        exerciseId: re.exercise_id,
        position: re.position,
        targetSets: re.target_sets,
        targetRepsMin: re.target_reps_min,
        targetRepsMax: re.target_reps_max,
        restSeconds: re.rest_seconds,
        targetRpe: re.target_rpe,
        defaultIncrementKg: exRow?.default_increment_kg ?? 2.5,
        warmupSets: ((re.warmup_sets as RoutineWarmupSet[] | null) ?? []),
        lastWorkingWeightKg: last != null ? Number(last.weightKg) : null,
        workingSetPrefill: prefillSetsForExercise(history, re.target_sets, re.target_reps_min),
      };
    });

    navigate('/training/run', {
      state: {
        runner: {
          programId: active?.id ?? null,
          routineId: routine.id,
          routineName: routine.name,
          exercises,
          names,
          historyByExercise,
          coachContextByExercise,
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
        <Button asChild>
          <Link to="/training/new">
            <Plus className="h-4 w-4 mr-1" />
            {t('page.newSession')}
          </Link>
        </Button>
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
