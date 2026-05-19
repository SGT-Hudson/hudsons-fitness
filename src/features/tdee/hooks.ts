import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchLatestTdee, fetchTdeeState } from './api';

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
