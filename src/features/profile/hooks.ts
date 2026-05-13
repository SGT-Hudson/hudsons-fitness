import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { toastError, toastSaved } from '@/lib/toast-helpers';
import { fetchProfile, updateProfile, type Profile } from './api';
import type { TablesUpdate } from '@/types/database';

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['profile', user?.id],
    queryFn: () => fetchProfile(user!.id),
  });
}

export function useUpdateProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: TablesUpdate<'profiles'>) => updateProfile(user!.id, patch),
    onSuccess: (next: Profile) => {
      qc.setQueryData(['profile', user?.id], next);
      toastSaved();
    },
    onError: toastError,
  });
}
