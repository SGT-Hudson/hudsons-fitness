import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { fromDateForRange, type TimeRange } from '@/features/measurements/hooks';
import { fetchDailyNutritionHistory } from './api';

export function useDailyNutritionHistory(range: TimeRange) {
  const { user } = useAuth();
  const fromDate = fromDateForRange(range);
  return useQuery({
    enabled: !!user,
    queryKey: ['nutrition', 'history', user?.id, fromDate] as const,
    queryFn: () => fetchDailyNutritionHistory(user!.id, fromDate),
  });
}
