import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  fetchRecipe,
  listRecipes,
  saveRecipe,
  softDeleteRecipe,
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
    },
  });
}

export function useSoftDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recipeId: string) => softDeleteRecipe(recipeId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['recipes'] });
    },
  });
}
