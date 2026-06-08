import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { toastCreated, toastError } from '@/lib/toast-helpers';
import {
  createExercise,
  getExercise,
  searchExercises,
  searchExercisesPaged,
  type Exercise,
  type ExerciseBrowseParams,
  type ExerciseCreateInput,
  type ExerciseSearchOptions,
} from './api';

export function useExerciseSearch(query: string, opts: ExerciseSearchOptions = {}) {
  const { limit = 20, muscle = null, textMuscles = [], groupMuscles = [] } = opts;
  return useQuery({
    queryKey: ['exercises', 'search', query, limit, muscle, textMuscles, groupMuscles] as const,
    queryFn: () => searchExercises(query, { limit, muscle, textMuscles, groupMuscles }),
    placeholderData: (prev) => prev,
  });
}

export function useExercisesBrowse(params: ExerciseBrowseParams) {
  const { query, category, equipment, level, muscleValue, textMuscles, page, pageSize } = params;
  return useQuery({
    queryKey: [
      'exercises', 'browse',
      query, category, equipment, level, muscleValue, textMuscles, page, pageSize,
    ] as const,
    queryFn: () => searchExercisesPaged(params),
    placeholderData: (prev) => prev,
  });
}

export function useExercise(
  id: string | undefined,
  opts: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ['exercises', 'byId', id] as const,
    queryFn: () => getExercise(id as string),
    enabled: (opts.enabled ?? true) && !!id,
  });
}

export function useCreateExercise() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation<Exercise, Error, ExerciseCreateInput>({
    mutationFn: (input) => {
      if (!user) throw new Error('not authenticated');
      return createExercise(user.id, input);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['exercises'] });
      toastCreated();
    },
    onError: toastError,
  });
}
