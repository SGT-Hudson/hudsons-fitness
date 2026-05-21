import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { toastCreated, toastError } from '@/lib/toast-helpers';
import {
  createExercise,
  searchExercises,
  type Exercise,
  type ExerciseCreateInput,
} from './api';

export function useExerciseSearch(query: string, limit = 20) {
  return useQuery({
    queryKey: ['exercises', 'search', query, limit] as const,
    queryFn: () => searchExercises(query, limit),
    placeholderData: (prev) => prev,
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
