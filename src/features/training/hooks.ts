import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { toastDeleted, toastError, toastSaved } from '@/lib/toast-helpers';
import {
  deleteSession,
  fetchExerciseHistory,
  fetchSession,
  listSessions,
  saveWorkout,
  type SaveWorkoutPayload,
} from './api';

export function useSessions() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['training', 'sessions', user?.id] as const,
    queryFn: () => listSessions(user!.id),
  });
}

export function useSession(sessionId: string | null | undefined) {
  return useQuery({
    enabled: !!sessionId,
    queryKey: ['training', 'session', sessionId] as const,
    queryFn: () => fetchSession(sessionId!),
  });
}

export function useExerciseHistory(exerciseId: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user && !!exerciseId,
    queryKey: ['training', 'history', user?.id, exerciseId] as const,
    queryFn: () => fetchExerciseHistory(user!.id, exerciseId!),
  });
}

export function useSaveWorkout() {
  const qc = useQueryClient();
  return useMutation<string, Error, SaveWorkoutPayload>({
    mutationFn: (payload) => saveWorkout(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['training'] });
      toastSaved();
    },
    onError: toastError,
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteSession(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['training', 'sessions'] });
      toastDeleted();
    },
    onError: toastError,
  });
}
