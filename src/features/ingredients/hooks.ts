import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  createManualIngredient,
  getIngredient,
  hideOwnedIngredient,
  importIngredientFromOFF,
  listIngredients,
  listMyIngredientRefIds,
  listPoolIngredients,
  searchLocalIngredients,
  updateIngredient,
  type Ingredient,
  type ManualIngredientInput,
} from './api';
import type { OFFSearchResult } from '@/lib/openfoodfacts';
import { getProductByBarcode, searchOpenFoodFacts } from '@/lib/openfoodfacts';
import type { TablesUpdate } from '@/types/database';
import i18n from '@/i18n';
import { toast } from '@/hooks/use-toast';
import { toastCreated, toastError, toastSaved } from '@/lib/toast-helpers';

export function useIngredients(limit = 100) {
  return useQuery({
    queryKey: ['ingredients', 'list', limit],
    queryFn: () => listIngredients(limit),
  });
}

export function useLocalIngredientSearch(query: string, limit = 15, enabled = true) {
  return useQuery({
    queryKey: ['ingredients', 'search-local', query, limit],
    queryFn: () => searchLocalIngredients(query, limit),
    placeholderData: (prev) => prev,
    // U-7: callers can disable the fetch (e.g. the recipe autocomplete skips the
    // empty-query search until the user types). Defaults true for other callers.
    enabled,
  });
}

/**
 * Single ingredient by id (R-33 wave 6 — the `/:id/edit` route). Mirrors
 * `useRecipe`: a nullish id disables the fetch, so the edit route can call
 * this unconditionally with `id ?? null` before it has resolved a param.
 */
export function useIngredient(id: string | null | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ['ingredients', 'detail', id],
    queryFn: () => getIngredient(id!),
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
      overrides: ManualIngredientInput;
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

// R-01: replaces `useDeleteIngredient` + `IngredientInUseError`. Hard delete
// is impossible under the pool model (recipe_ingredients FK keeps the pool row
// alive); the hide RPC just drops my reference row (R-25 — the pooled item and
// its ownership are untouched). The "in use" error path is gone — there is no
// error case to translate.
export function useHideIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => hideOwnedIngredient(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ingredients'] });
      // NOT "Eliminado": nothing is deleted. The pool row survives (and stays
      // visible in the list) — what went away is my reference to it.
      toast({ variant: 'success', title: i18n.t('ingredientes:list.removedToast') });
    },
    onError: toastError,
  });
}

/** The whole pool, once — the Ingredientes list filters, counts and pages it in memory. */
export function usePoolIngredients() {
  return useQuery({
    queryKey: ['ingredients', 'pool'],
    queryFn: () => listPoolIngredients(),
  });
}

// Hoisted so its identity is stable across renders — an inline arrow here
// would get a fresh function every render, which defeats react-query's select
// memoization and hands out a brand-new `Set` (and therefore a new `libraryIds`
// reference) on every re-render, cascading into every `useMemo` downstream
// that depends on it.
function toIdSet(ids: string[]): Set<string> {
  return new Set(ids);
}

/** The ingredient ids in my library, as a Set (gates `IngredientRowMenu`'s
 * "quitar de mi biblioteca" and `usePagination`'s reset key). */
export function useMyIngredientRefIds() {
  return useQuery({
    queryKey: ['ingredients', 'refs'],
    queryFn: () => listMyIngredientRefIds(),
    select: toIdSet,
  });
}
