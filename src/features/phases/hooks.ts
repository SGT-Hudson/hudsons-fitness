import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import type { TablesUpdate } from '@/types/database';
import { toastCreated, toastDeleted, toastError, toastSaved } from '@/lib/toast-helpers';
import {
  createPhase,
  deletePhase,
  fetchActivePhase,
  isPhaseOverlapError,
  listPhases,
  updatePhase,
  type PhaseInput,
} from './api';

/**
 * A save that collided with another phase's dates is the ONE failure the editor
 * can explain precisely, and it renders it inline on the date fields that caused
 * it (`phases.form.errors.overlap`). A generic "algo ha ido mal" toast on top of
 * that is noise — and it is the exact message this wave exists to stop shipping.
 * Every other failure still toasts.
 */
function toastUnlessOverlap(err: unknown) {
  if (!isPhaseOverlapError(err)) toastError(err);
}

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
      toastCreated();
    },
    onError: toastUnlessOverlap,
  });
}

export function useUpdatePhase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<'phases'> }) =>
      updatePhase(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['phases'] });
      toastSaved();
    },
    onError: toastUnlessOverlap,
  });
}

export function useDeletePhase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePhase(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['phases'] });
      toastDeleted();
    },
    onError: toastError,
  });
}
