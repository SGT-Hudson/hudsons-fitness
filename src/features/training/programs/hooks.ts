import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { toastDeleted, toastError, toastSaved } from '@/lib/toast-helpers';
import {
  deleteProgram,
  fetchActiveProgram,
  listPrograms,
  saveProgram,
  setActiveProgram,
  type SaveProgramPayload,
} from './api';

export function usePrograms() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['training', 'programs', user?.id] as const,
    queryFn: () => listPrograms(user!.id),
  });
}

export function useActiveProgram() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['training', 'activeProgram', user?.id] as const,
    queryFn: () => fetchActiveProgram(user!.id),
  });
}

export function useSaveProgram() {
  const qc = useQueryClient();
  return useMutation<string, Error, SaveProgramPayload>({
    mutationFn: (payload) => saveProgram(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['training', 'programs'] });
      void qc.invalidateQueries({ queryKey: ['training', 'activeProgram'] });
      toastSaved();
    },
    onError: toastError,
  });
}

export function useSetActiveProgram() {
  const qc = useQueryClient();
  return useMutation<void, Error, { programId: string; anchorDateISO: string }>({
    mutationFn: ({ programId, anchorDateISO }) => setActiveProgram(programId, anchorDateISO),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['training', 'programs'] });
      void qc.invalidateQueries({ queryKey: ['training', 'activeProgram'] });
      toastSaved();
    },
    onError: toastError,
  });
}

export function useDeleteProgram() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteProgram(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['training', 'programs'] });
      void qc.invalidateQueries({ queryKey: ['training', 'activeProgram'] });
      toastDeleted();
    },
    onError: toastError,
  });
}
