import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchLatestTdee } from './api';

export function useLatestTdee() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['tdee', 'latest', user?.id] as const,
    queryFn: () => fetchLatestTdee(user!.id),
  });
}
