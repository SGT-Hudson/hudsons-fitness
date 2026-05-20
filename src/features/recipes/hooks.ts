import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { toastDeleted, toastError, toastSaved } from '@/lib/toast-helpers';
import {
  fetchRecipe,
  hideOwnedRecipe,
  listRecipes,
  saveRecipe,
  type SaveRecipePayload,
} from './api';

export function useRecipes() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['recipes', 'list', user?.id],
    queryFn: () => listRecipes(user!.id),
  });
}

export function useRecipe(recipeId: string | null | undefined) {
  return useQuery({
    enabled: !!recipeId,
    queryKey: ['recipes', 'detail', recipeId],
    queryFn: () => fetchRecipe(recipeId!),
  });
}

export function useSaveRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveRecipePayload) => saveRecipe(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['recipes'] });
      toastSaved();
    },
    onError: toastError,
  });
}

// R-01 (spec §6, §7): replaces `useSoftDeleteRecipe`. Same UX surface
// ("Remove" / "Borrar" affordance); the server side is now a unified
// hide RPC — ref drop + owner-transfer-to-anon if I'm the owner.
export function useHideRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recipeId: string) => hideOwnedRecipe(recipeId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['recipes'] });
      toastDeleted();
    },
    onError: toastError,
  });
}
