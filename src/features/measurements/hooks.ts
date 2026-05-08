import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  deleteMeasurement,
  fetchLatestMeasurement,
  fetchRecentMeasurements,
  upsertMeasurement,
  type MeasurementInput,
} from './api';

const KEYS = {
  recent: (userId: string | undefined) => ['measurements', 'recent', userId] as const,
  latest: (userId: string | undefined) => ['measurements', 'latest', userId] as const,
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

export function useUpsertMeasurement() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MeasurementInput) => upsertMeasurement(user!.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['measurements'] });
    },
  });
}

export function useDeleteMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMeasurement(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['measurements'] });
    },
  });
}
