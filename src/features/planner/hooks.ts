import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  addWeekSlot,
  applyTemplateToWeek,
  deleteWeekSlot,
  fetchActiveWeek,
  saveWeekAsTemplate,
  updateWeekSlot,
} from './api';

export function useActiveWeek(weekStart: string) {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['planner', 'week', user?.id, weekStart],
    queryFn: () => fetchActiveWeek(user!.id, weekStart),
  });
}

export function useApplyTemplateToWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, targetDate }: { templateId: string; targetDate: string }) =>
      applyTemplateToWeek(templateId, targetDate),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['planner'] });
    },
  });
}

export function useSaveWeekAsTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ weekId, name }: { weekId: string; name: string }) =>
      saveWeekAsTemplate(weekId, name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}

export function useAddWeekSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addWeekSlot,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['planner'] });
    },
  });
}

export function useUpdateWeekSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { servings?: number; recipe_id?: string } }) =>
      updateWeekSlot(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['planner'] });
    },
  });
}

export function useDeleteWeekSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWeekSlot(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['planner'] });
    },
  });
}
