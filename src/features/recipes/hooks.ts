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
import { fetchRecipeNote, saveRecipeNote } from './notes';
import { PhotoDecodeError } from './photoResize';
import { clearRecipePhoto, setRecipePhoto } from './photoStorage';

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

// R-36: a private, per-user note living on the caller's own user_recipe_refs
// row — see notes.ts for why it's a plain update rather than an RPC.
export function useRecipeNote(recipeId: string | null | undefined) {
  return useQuery({
    enabled: !!recipeId,
    queryKey: ['recipes', 'note', recipeId],
    queryFn: () => fetchRecipeNote(recipeId!),
  });
}

export function useSaveRecipeNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, note }: { recipeId: string; note: string }) =>
      saveRecipeNote(recipeId, note),
    onSuccess: (_data, { recipeId }) => {
      void qc.invalidateQueries({ queryKey: ['recipes', 'note', recipeId] });
    },
    onError: toastError,
  });
}

// R-36b task 3: cover-photo upload/clear. Both invalidate the whole
// ['recipes'] branch (list + detail) — after either mutation `photo_url`
// (and `updated_at`, which the cache-busting URL depends on) has changed, so
// both the card grid and the detail page need a refetch.
export function useSetRecipePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, file }: { recipeId: string; file: File }) =>
      setRecipePhoto(recipeId, file),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['recipes'] });
    },
    // A file the browser cannot decode (a raw HEIC) is the one failure the
    // user can act on, and the photo field reports it inline with copy that
    // says how — a second, generic "something went wrong" toast on top of that
    // would only be noise. Everything else still toasts.
    onError: (err) => {
      if (!(err instanceof PhotoDecodeError)) toastError(err);
    },
  });
}

export function useClearRecipePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recipeId: string) => clearRecipePhoto(recipeId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['recipes'] });
    },
    onError: toastError,
  });
}
