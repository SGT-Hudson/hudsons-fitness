import { listRecipes, fetchRecipe } from '@/features/recipes/api';
import { fetchRoutine } from '@/features/training/routines/api';

/** A case invokes one real helper with constants that match no row. */
export interface SelectCase {
  /** Stable label, `feature/fnName`. */
  id: string;
  /** Repo-relative file the helper lives in — the coverage meta-test keys on this. */
  file: string;
  /** Exported function name — the coverage meta-test keys on this. */
  fn: string;
  run: () => Promise<unknown>;
}

/** Never seeded. PostgREST validates the select before it applies filters. */
export const MISSING_USER_ID = '00000000-0000-4000-8000-000000000001';
export const MISSING_ID = '00000000-0000-4000-8000-000000000002';
export const FIXED_DATE = '2026-01-05';

export const REGISTRY: SelectCase[] = [
  {
    id: 'recipes/listRecipes',
    file: 'src/features/recipes/api.ts',
    fn: 'listRecipes',
    run: () => listRecipes(MISSING_USER_ID),
  },
  {
    id: 'recipes/fetchRecipe',
    file: 'src/features/recipes/api.ts',
    fn: 'fetchRecipe',
    run: () => fetchRecipe(MISSING_ID),
  },
  {
    id: 'training/routines/fetchRoutine',
    file: 'src/features/training/routines/api.ts',
    fn: 'fetchRoutine',
    run: () => fetchRoutine(MISSING_ID),
  },
];
