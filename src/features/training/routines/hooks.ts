import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { toastDeleted, toastError, toastSaved } from '@/lib/toast-helpers';
import {
  deleteRoutine,
  fetchRoutine,
  listRoutines,
  saveRoutine,
  type SaveRoutinePayload,
} from './api';

export function useRoutines() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['training', 'routines', user?.id] as const,
    queryFn: () => listRoutines(user!.id),
  });
}

export function useRoutine(routineId: string | null | undefined) {
  return useQuery({
    enabled: !!routineId,
    queryKey: ['training', 'routine', routineId] as const,
    queryFn: () => fetchRoutine(routineId!),
  });
}

export function useSaveRoutine() {
  const qc = useQueryClient();
  return useMutation<string, Error, SaveRoutinePayload>({
    mutationFn: (payload) => saveRoutine(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['training', 'routines'] });
      toastSaved();
    },
    onError: toastError,
  });
}

export function useDeleteRoutine() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteRoutine(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['training', 'routines'] });
      toastDeleted();
    },
    onError: toastError,
  });
}
