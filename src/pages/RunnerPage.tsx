import { useMemo, useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useNum } from '@/hooks/useNum';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSaveWorkout } from '@/features/training/hooks';
import { fetchExerciseHistory } from '@/features/training/api';
import { Runner } from '@/features/training/runner/Runner';
import { ResumePrompt } from '@/features/training/runner/ResumePrompt';
import { loadDraft, clearDraft } from '@/features/training/runner/useRunnerDraft';
import { loadAddedExercise } from '@/features/training/runner/loadAddedExercise';
import { buildRunnerState, type RunnerInput, type RunnerState } from '@/core/runner';
import type { CoachContext, CoreSessionSet } from '@/core/training';
import { lastWorkingSetForExercise } from '@/core/training';
import { todayInTZ } from '@/lib/dates';
import type { Exercise } from '@/features/training/exercises/api';

export interface RunnerRouteState {
  programId: string | null;
  routineId: string | null;
  routineName: string;
  exercises: RunnerInput['exercises'];
  names: Record<string, string>;
  historyByExercise: Record<string, CoreSessionSet[]>;
  coachContextByExercise: Record<string, CoachContext>;
}

export function RunnerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const save = useSaveWorkout();
  const num = useNum();
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const route = (location.state as { runner?: RunnerRouteState } | null)?.runner ?? null;

  const draft = useMemo(() => loadDraft(), []);
  const [resumed, setResumed] = useState<RunnerState | null>(null);
  const [discarded, setDiscarded] = useState(false);

  if (!route && !draft) {
    return <Navigate to="/training" replace />;
  }

  // Resume gate: a saved draft that matches the requested routine (and we haven't chosen yet).
  if (draft && !resumed && !discarded && (!route || draft.routineId === route.routineId)) {
    return (
      <ResumePrompt
        draft={draft}
        nowMs={Date.now()}
        onResume={() => setResumed(draft)}
        onDiscard={() => { clearDraft(); setDiscarded(true); }}
      />
    );
  }

  if (!route) {
    // Draft discarded but no fresh route → bounce home.
    return <Navigate to="/training" replace />;
  }

  const initialState =
    resumed ??
    buildRunnerState({
      programId: route.programId,
      routineId: route.routineId,
      routineName: route.routineName,
      performedOn: new Date().toISOString().slice(0, 10),
      nowMs: Date.now(),
      exercises: route.exercises,
    });

  const lastTimeByExercise: Record<string, string | null> = {};
  for (const [id, history] of Object.entries(route.historyByExercise)) {
    const last = lastWorkingSetForExercise(history);
    lastTimeByExercise[id] = last ? `${last.reps} × ${num.qty(Number(last.weightKg))} kg` : null;
  }

  const lang: 'es' | 'en' = (i18n.language || 'es').startsWith('en') ? 'en' : 'es';

  function handleLoadExercise(exercise: Exercise) {
    return loadAddedExercise({
      exercise,
      lang,
      todayISO: todayInTZ(),
      formatWeight: (kg) => num.qty(kg),
      fetchHistory: (exerciseId) =>
        user ? fetchExerciseHistory(user.id, exerciseId) : Promise.resolve([]),
    });
  }

  return (
    <Runner
      initialState={initialState}
      names={route.names}
      coachContextByExercise={route.coachContextByExercise}
      lastTimeByExercise={lastTimeByExercise}
      onSave={(payload) => save.mutateAsync(payload)}
      onExit={() => navigate('/training')}
      onSaved={() => { clearDraft(); navigate('/training'); }}
      onLoadExercise={handleLoadExercise}
    />
  );
}
