import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import type { TablesUpdate } from '@/types/database';
import {
  createPhase,
  deletePhase,
  fetchActivePhase,
  listPhases,
  updatePhase,
  type PhaseInput,
} from './api';

const KEYS = {
  list: (userId: string | undefined) => ['phases', 'list', userId] as const,
  active: (userId: string | undefined) => ['phases', 'active', userId] as const,
};

export function usePhases() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: KEYS.list(user?.id),
    queryFn: () => listPhases(user!.id),
  });
}

export function useActivePhase() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: KEYS.active(user?.id),
    queryFn: () => fetchActivePhase(user!.id),
  });
}

export function useCreatePhase() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PhaseInput) => createPhase(user!.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['phases'] });
    },
  });
}

export function useUpdatePhase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<'phases'> }) =>
      updatePhase(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['phases'] });
    },
  });
}

export function useDeletePhase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePhase(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['phases'] });
    },
  });
}
