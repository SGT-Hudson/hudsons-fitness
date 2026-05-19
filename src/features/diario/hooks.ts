import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  createMealLog,
  deleteMealLog,
  fetchMealLogsForDay,
  fetchQuickAddRecipeRows,
  materializePlanForDate,
  updateMealLog,
  type CreateMealLogInput,
  type MealType,
} from './api';
import { buildQuickAddList, isoMinusDays } from './quickAdd';
import { buildCopyPayloads } from './copyDay';
import type { TablesUpdate } from '@/types/database';
import { toastCreated, toastDeleted, toastError, toastSaved, toastUndoableQuickAdd } from '@/lib/toast-helpers';

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

// Copies a previous day's entries onto `targetDate` as independent manual
// logs. Uses the raw createMealLog (not useCreateMealLog) so the batch fires
// ONE invalidate + ONE toast instead of N. Returns how many were copied.
export function useCopyDay() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { sourceDate: string; targetDate: string }) => {
      const sourceLogs = await fetchMealLogsForDay(user!.id, v.sourceDate);
      const payloads = buildCopyPayloads(sourceLogs, v.targetDate);
      for (const p of payloads) {
        await createMealLog(user!.id, p);
      }
      return payloads.length;
    },
    onSuccess: (count, v) => {
      void qc.invalidateQueries({ queryKey: ['meal_logs', user?.id, v.targetDate] });
      if (count > 0) toastCreated();
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

export function useQuickAddRecipes() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['quick_add', user?.id],
    queryFn: async () => {
      const rows = await fetchQuickAddRecipeRows(user!.id, isoMinusDays(new Date(), 60));
      return buildQuickAddList(rows, { now: new Date() });
    },
  });
}

// No success toast here on purpose: the caller (QuickAddStrip) shows an
// undoable toast via toastUndoableQuickAdd, which needs the created row id.
export function useQuickAddMealLog() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { recipeId: string; mealType: MealType; loggedOn: string }) =>
      createMealLog(user!.id, {
        loggedOn: v.loggedOn,
        mealType: v.mealType,
        source: { kind: 'recipe', recipeId: v.recipeId, servings: 1 },
        notes: null,
      }),
    onSuccess: (_created, v) => {
      void qc.invalidateQueries({ queryKey: ['meal_logs', user?.id, v.loggedOn] });
      void qc.invalidateQueries({ queryKey: ['quick_add', user?.id] });
    },
    onError: toastError,
  });
}

export { toastUndoableQuickAdd, deleteMealLog };
