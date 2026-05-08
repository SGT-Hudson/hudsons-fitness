import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  createMealLog,
  deleteMealLog,
  fetchMealLogsForDay,
  updateMealLog,
  type CreateMealLogInput,
} from './api';
import type { TablesUpdate } from '@/types/database';

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
    },
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
    },
  });
}

export function useDeleteMealLog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMealLog(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['meal_logs', user?.id] });
    },
  });
}
