import { listRecipes, fetchRecipe } from '@/features/recipes/api';
import { fetchRoutine } from '@/features/training/routines/api';
import { fetchMealLogsForDay, fetchQuickAddRecipeRows } from '@/features/diario/api';
import { listIngredients, listMyIngredientRefIds } from '@/features/ingredients/api';
import { fetchActiveWeek, fetchWeekShopping } from '@/features/planner/api';
import { fetchRecipeNote } from '@/features/recipes/notes';
import { listTemplates, fetchTemplate } from '@/features/templates/api';
import { fetchRecipeMacrosByIds } from '@/features/templates/recipeMacros';
import { listSessions, fetchSession, fetchExerciseHistory } from '@/features/training/api';
import { fetchWorkoutSetsForVolume } from '@/features/training/muscleMap/api';
import { listPrograms, fetchActiveProgram } from '@/features/training/programs/api';
import { listRoutines } from '@/features/training/routines/api';

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
  {
    id: 'diario/fetchMealLogsForDay',
    file: 'src/features/diario/api.ts',
    fn: 'fetchMealLogsForDay',
    run: () => fetchMealLogsForDay(MISSING_USER_ID, FIXED_DATE),
  },
  {
    id: 'diario/fetchQuickAddRecipeRows',
    file: 'src/features/diario/api.ts',
    fn: 'fetchQuickAddRecipeRows',
    run: () => fetchQuickAddRecipeRows(MISSING_USER_ID, `${FIXED_DATE}T00:00:00.000Z`),
  },
  {
    id: 'ingredients/listIngredients',
    file: 'src/features/ingredients/api.ts',
    fn: 'listIngredients',
    run: () => listIngredients(5),
  },
  {
    id: 'ingredients/listMyIngredientRefIds',
    file: 'src/features/ingredients/api.ts',
    fn: 'listMyIngredientRefIds',
    run: () => listMyIngredientRefIds(),
  },
  {
    id: 'planner/fetchActiveWeek',
    file: 'src/features/planner/api.ts',
    fn: 'fetchActiveWeek',
    run: () => fetchActiveWeek(MISSING_USER_ID, FIXED_DATE),
  },
  {
    id: 'planner/fetchWeekShopping',
    file: 'src/features/planner/api.ts',
    fn: 'fetchWeekShopping',
    run: () => fetchWeekShopping(MISSING_USER_ID, FIXED_DATE),
  },
  {
    id: 'recipes/fetchRecipeNote',
    file: 'src/features/recipes/notes.ts',
    fn: 'fetchRecipeNote',
    run: () => fetchRecipeNote(MISSING_ID),
  },
  {
    id: 'templates/listTemplates',
    file: 'src/features/templates/api.ts',
    fn: 'listTemplates',
    run: () => listTemplates(MISSING_USER_ID),
  },
  {
    id: 'templates/fetchTemplate',
    file: 'src/features/templates/api.ts',
    fn: 'fetchTemplate',
    run: () => fetchTemplate(MISSING_ID),
  },
  {
    id: 'templates/fetchRecipeMacrosByIds',
    file: 'src/features/templates/recipeMacros.ts',
    fn: 'fetchRecipeMacrosByIds',
    // NOT an empty array: an empty input short-circuits before querying and
    // the runner's request counter would (correctly) fail the case.
    run: () => fetchRecipeMacrosByIds([MISSING_ID]),
  },
  {
    id: 'training/listSessions',
    file: 'src/features/training/api.ts',
    fn: 'listSessions',
    run: () => listSessions(MISSING_USER_ID, 5),
  },
  {
    id: 'training/fetchSession',
    file: 'src/features/training/api.ts',
    fn: 'fetchSession',
    run: () => fetchSession(MISSING_ID),
  },
  {
    id: 'training/fetchExerciseHistory',
    file: 'src/features/training/api.ts',
    fn: 'fetchExerciseHistory',
    run: () => fetchExerciseHistory(MISSING_USER_ID, MISSING_ID),
  },
  {
    id: 'training/muscleMap/fetchWorkoutSetsForVolume',
    file: 'src/features/training/muscleMap/api.ts',
    fn: 'fetchWorkoutSetsForVolume',
    run: () => fetchWorkoutSetsForVolume(FIXED_DATE),
  },
  {
    id: 'training/programs/listPrograms',
    file: 'src/features/training/programs/api.ts',
    fn: 'listPrograms',
    run: () => listPrograms(MISSING_USER_ID),
  },
  {
    id: 'training/programs/fetchActiveProgram',
    file: 'src/features/training/programs/api.ts',
    fn: 'fetchActiveProgram',
    run: () => fetchActiveProgram(MISSING_USER_ID),
  },
  {
    id: 'training/routines/listRoutines',
    file: 'src/features/training/routines/api.ts',
    fn: 'listRoutines',
    run: () => listRoutines(MISSING_USER_ID),
  },
];
