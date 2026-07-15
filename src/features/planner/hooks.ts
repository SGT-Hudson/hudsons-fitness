import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  toastApplied,
  toastDeleted,
  toastError,
  toastSaved,
} from '@/lib/toast-helpers';
import type { TemplatePhase } from '@/features/templates/api';
import {
  addWeekSlot,
  appendWeekMeal,
  applyTemplateToWeek,
  copyWeekMeal,
  deleteWeekSlot,
  fetchActiveWeek,
  fetchWeekShopping,
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

export function useWeekShopping(weekStart: string, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user && enabled,
    queryKey: ['planner', 'shopping', user?.id, weekStart],
    queryFn: () => fetchWeekShopping(user!.id, weekStart),
  });
}

export function useApplyTemplateToWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, targetDate }: { templateId: string; targetDate: string }) =>
      applyTemplateToWeek(templateId, targetDate),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['planner'] });
      toastApplied();
    },
    onError: toastError,
  });
}

export function useSaveWeekAsTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      weekId,
      name,
      phaseType,
    }: {
      weekId: string;
      name: string;
      phaseType: TemplatePhase | null;
    }) => saveWeekAsTemplate(weekId, name, phaseType),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['templates'] });
      toastSaved();
    },
    onError: toastError,
  });
}

export function useAddWeekSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addWeekSlot,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['planner'] });
    },
    onError: toastError,
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
    onError: toastError,
  });
}

export function useDeleteWeekSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWeekSlot(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['planner'] });
      toastDeleted();
    },
    onError: toastError,
  });
}

export function useCopyWeekMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: copyWeekMeal,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['planner'] });
      toastSaved();
    },
    onError: toastError,
  });
}

export function useAppendWeekMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: appendWeekMeal,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['planner'] });
      toastSaved();
    },
    onError: toastError,
  });
}
