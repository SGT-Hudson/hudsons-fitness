import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  createMealLog,
  deleteMealLog,
  fetchMealLogsForDay,
  materializePlanForDate,
  updateMealLog,
  type CreateMealLogInput,
} from './api';
import type { TablesUpdate } from '@/types/database';
import { toastCreated, toastDeleted, toastError, toastSaved } from '@/lib/toast-helpers';

export function useMealLogsForDay(loggedOn: string) {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['meal_logs', user?.id, loggedOn],
    queryFn: () => fetchMealLogsForDay(user!.id, loggedOn),
  });
}

export function useCreateMealLog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMealLogInput) => createMealLog(user!.id, input),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['meal_logs', user?.id, variables.loggedOn] });
      toastCreated();
    },
    onError: toastError,
  });
}

export function useUpdateMealLog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<'meal_logs'> }) =>
      updateMealLog(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['meal_logs', user?.id] });
      toastSaved();
    },
    onError: toastError,
  });
}

// Auto-fired by DiarioPage on mount/date change. Idempotent — see
// materializePlanForDate. Silent on success (no toast: this is background
// behavior the user didn't trigger), but surfaces errors via toast so a real
// failure isn't swallowed.
export function useMaterializePlan() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (loggedOn: string) => materializePlanForDate(user!.id, loggedOn),
    onSuccess: (inserted, loggedOn) => {
      if (inserted > 0) {
        void qc.invalidateQueries({ queryKey: ['meal_logs', user?.id, loggedOn] });
      }
    },
    onError: toastError,
  });
}

export function useDeleteMealLog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMealLog(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['meal_logs', user?.id] });
      toastDeleted();
    },
    onError: toastError,
  });
}
