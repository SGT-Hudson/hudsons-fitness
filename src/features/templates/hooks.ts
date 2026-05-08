import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  deleteTemplate,
  fetchTemplate,
  listTemplates,
  saveTemplate,
  type SaveTemplatePayload,
} from './api';

export function useTemplates() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['templates', 'list', user?.id],
    queryFn: () => listTemplates(user!.id),
  });
}

export function useTemplate(templateId: string | null | undefined) {
  return useQuery({
    enabled: !!templateId,
    queryKey: ['templates', 'detail', templateId],
    queryFn: () => fetchTemplate(templateId!),
  });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveTemplatePayload) => saveTemplate(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}
