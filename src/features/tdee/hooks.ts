import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchLatestTdee, fetchTdeeEstimatesSince, fetchTdeeState } from './api';

export function useLatestTdee() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['tdee', 'latest', user?.id] as const,
    queryFn: () => fetchLatestTdee(user!.id),
  });
}

export function useTdeeState() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['tdee', 'state', user?.id] as const,
    queryFn: () => fetchTdeeState(user!.id),
  });
}

export function useTdeeEstimates(fromDate: string | null) {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['tdee', 'estimates', user?.id, fromDate] as const,
    queryFn: () => fetchTdeeEstimatesSince(user!.id, fromDate),
  });
}
