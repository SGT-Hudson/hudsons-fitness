import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const useExercise = vi.fn();
vi.mock('@/features/training/exercises/hooks', () => ({
  useExercise: (...a: unknown[]) => useExercise(...a),
}));

// The add sheet's data hooks read the auth context; stub them so the page
// renders without an AuthProvider (the sheet itself is tested on its own).
const mutate = vi.fn();
vi.mock('@/features/training/routines/hooks', () => ({
  useRoutines: () => ({ data: [{ id: 'r-1', name: 'Torso A', routine_exercises: [] }] }),
  useSaveRoutine: () => ({ mutate, isPending: false }),
}));
vi.mock('@/features/training/programs/hooks', () => ({
  useActiveProgram: () => ({ data: null }),
}));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => true })); // desktop → Dialog

import { ExerciseDetailPage } from './ExerciseDetailPage';
import type { Exercise } from '@/features/training/exercises/api';

const ex: Exercise = {
  category: 'strength', created_at: '', created_by_user_id: null, default_increment_kg: 2.5,
  equipment: 'barbell', external_id: null, force: null, id: 'ex-1', images: [],
  instructions_en: ['Step one.'], instructions_es: ['Paso uno.'], is_verified: true,
  level: 'beginner', mechanic: null, name_en: 'Bench press', name_es: 'Press de banca',
  primary_muscles: ['pec_lower'], secondary_muscles: [], source: 'free-exercise-db', updated_at: '',
};

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/exercises/${id}`]}>
      <Routes><Route path="/exercises/:id" element={<ExerciseDetailPage />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => { useExercise.mockReset(); mutate.mockReset(); await i18n.changeLanguage('es'); });

describe('ExerciseDetailPage', () => {
  it('shows the exercise on success', () => {
    useExercise.mockReturnValue({
      data: ex, isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    renderAt('ex-1');
    expect(screen.getByRole('heading', { name: 'Press de banca' })).toBeInTheDocument();
  });

  it('opens the add sheet and appends the exercise to the chosen routine', () => {
    useExercise.mockReturnValue({
      data: ex, isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    renderAt('ex-1');
    fireEvent.click(screen.getByRole('button', { name: 'Añadir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Añadir a la rutina' }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        routineId: 'r-1',
        exercises: [
          expect.objectContaining({
            exercise_id: 'ex-1', position: 1, target_sets: 3,
            target_reps_min: 8, target_reps_max: 12,
          }),
        ],
      }),
      expect.anything(),
    );
  });

  it('does not offer the add sheet when the exercise failed to load', () => {
    useExercise.mockReturnValue({
      data: undefined, isLoading: false, isError: true,
      error: { code: 'PGRST116' }, refetch: vi.fn(),
    });
    renderAt('missing');
    expect(screen.queryByRole('button', { name: 'Añadir' })).not.toBeInTheDocument();
  });

  it('shows a loading status while fetching', () => {
    useExercise.mockReturnValue({
      data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn(),
    });
    renderAt('ex-1');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the not-found block on error', () => {
    useExercise.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { code: 'PGRST116' },
      refetch: vi.fn(),
    });
    renderAt('missing');
    expect(screen.getByText('Ejercicio no encontrado')).toBeInTheDocument();
  });

  it('shows a load failure, not "not found", when the fetch fails', async () => {
    useExercise.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new TypeError('Failed to fetch'),
      refetch: vi.fn(),
    });
    renderAt('ex-1');
    expect(await screen.findByText(i18n.t('common:errors.loadFailedTitle'))).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('entrenamiento:browse.notFound.title'))).not.toBeInTheDocument();
  });

  it('still shows "not found" for PGRST116', async () => {
    useExercise.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { code: 'PGRST116' },
      refetch: vi.fn(),
    });
    renderAt('missing');
    expect(await screen.findByText(i18n.t('entrenamiento:browse.notFound.title'))).toBeInTheDocument();
  });
});
