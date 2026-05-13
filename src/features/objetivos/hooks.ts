import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchGoal, upsertGoal, type GoalInput } from './api';

const KEYS = {
  goal: (userId: string | undefined) => ['goals', userId] as const,
};

export function useGoal() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: KEYS.goal(user?.id),
    queryFn: () => fetchGoal(user!.id),
  });
}

export function useUpsertGoal() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GoalInput) => upsertGoal(user!.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['goals'] });
    },
  });
}
