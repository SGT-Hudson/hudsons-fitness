import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { toastDeleted, toastError, toastSaved } from '@/lib/toast-helpers';
import {
  deleteMeasurement,
  fetchLatestMeasurement,
  fetchRecentMeasurements,
  fetchSmoothedMeasurements,
  upsertMeasurement,
  type MeasurementInput,
} from './api';
import { isoDate } from '@/lib/dates';

export type TimeRange = '30d' | '90d' | '1y' | 'all';

export function fromDateForRange(range: TimeRange, now: Date = new Date()): string | null {
  if (range === 'all') return null;
  const d = new Date(now);
  if (range === '30d') d.setDate(d.getDate() - 30);
  else if (range === '90d') d.setDate(d.getDate() - 90);
  else if (range === '1y') d.setFullYear(d.getFullYear() - 1);
  return isoDate(d);
}

const KEYS = {
  recent: (userId: string | undefined) => ['measurements', 'recent', userId] as const,
  latest: (userId: string | undefined) => ['measurements', 'latest', userId] as const,
  smoothed: (userId: string | undefined, fromDate: string | null) =>
    ['measurements', 'smoothed', userId, fromDate] as const,
};

export function useRecentMeasurements(limit = 30) {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: [...KEYS.recent(user?.id), limit],
    queryFn: () => fetchRecentMeasurements(user!.id, limit),
  });
}

export function useLatestMeasurement() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: KEYS.latest(user?.id),
    queryFn: () => fetchLatestMeasurement(user!.id),
  });
}

export function useSmoothedMeasurements(range: TimeRange) {
  const { user } = useAuth();
  const fromDate = fromDateForRange(range);
  return useQuery({
    enabled: !!user,
    queryKey: KEYS.smoothed(user?.id, fromDate),
    queryFn: () => fetchSmoothedMeasurements(user!.id, fromDate),
  });
}

export function useUpsertMeasurement() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MeasurementInput) => upsertMeasurement(user!.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['measurements'] });
      toastSaved();
    },
    onError: toastError,
  });
}

export function useDeleteMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMeasurement(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['measurements'] });
      toastDeleted();
    },
    onError: toastError,
  });
}
