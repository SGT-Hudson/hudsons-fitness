import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  createManualIngredient,
  hideOwnedIngredient,
  importIngredientFromOFF,
  listIngredients,
  searchLocalIngredients,
  updateIngredient,
  type Ingredient,
  type ManualIngredientInput,
} from './api';
import type { OFFSearchResult } from '@/lib/openfoodfacts';
import { getProductByBarcode, searchOpenFoodFacts } from '@/lib/openfoodfacts';
import type { TablesUpdate } from '@/types/database';
import { toastCreated, toastDeleted, toastError, toastSaved } from '@/lib/toast-helpers';

export function useIngredients(limit = 100) {
  return useQuery({
    queryKey: ['ingredients', 'list', limit],
    queryFn: () => listIngredients(limit),
  });
}

export function useLocalIngredientSearch(query: string, limit = 15) {
  return useQuery({
    queryKey: ['ingredients', 'search-local', query, limit],
    queryFn: () => searchLocalIngredients(query, limit),
    placeholderData: (prev) => prev,
  });
}

export function useBarcodeLookup() {
  return useMutation({
    mutationFn: (code: string) => getProductByBarcode(code),
    onError: toastError,
    // No success toast — the dialog shows the prefilled form or a
    // "not found" message; a toast here would double up.
  });
}

export function useOFFSearch(query: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && query.trim().length >= 3,
    queryKey: ['off', query],
    queryFn: ({ signal }) => searchOpenFoodFacts(query, { signal }),
    staleTime: 5 * 60_000,
    retry: 0,
  });
}

export function useCreateManualIngredient() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ManualIngredientInput) => createManualIngredient(user!.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ingredients'] });
      toastCreated();
    },
    onError: toastError,
  });
}

export function useImportFromOFF() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      product,
      overrides,
    }: {
      product: OFFSearchResult;
      overrides?: Partial<ManualIngredientInput>;
    }) => importIngredientFromOFF(user!.id, product, overrides),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ingredients'] });
      toastCreated();
    },
    onError: toastError,
  });
}

export function useUpdateIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<'ingredients'> }) =>
      updateIngredient(id, patch),
    onSuccess: (next: Ingredient) => {
      qc.setQueryData<Ingredient[]>(['ingredients', 'list', 100], (old) =>
        old?.map((i) => (i.id === next.id ? next : i)),
      );
      void qc.invalidateQueries({ queryKey: ['ingredients'] });
      toastSaved();
    },
    onError: toastError,
  });
}

// R-01 (spec §6, §7): replaces `useDeleteIngredient` + `IngredientInUseError`.
// Hard delete is impossible under the pool model (recipe_ingredients FK
// keeps the pool row alive); the unified hide RPC drops my ref and, if I
// am the owner, transfers pool ownership to anon. The "in use" error
// path is gone — there is no error case to translate.
export function useHideIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hideOwnedIngredient(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ingredients'] });
      toastDeleted();
    },
    onError: toastError,
  });
}
