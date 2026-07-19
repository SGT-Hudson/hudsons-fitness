import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const useExercise = vi.fn();
vi.mock('@/features/training/exercises/hooks', () => ({
  useExercise: (...a: unknown[]) => useExercise(...a),
}));

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

beforeEach(async () => { useExercise.mockReset(); await i18n.changeLanguage('es'); });

describe('ExerciseDetailPage', () => {
  it('shows the exercise on success', () => {
    useExercise.mockReturnValue({
      data: ex, isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    renderAt('ex-1');
    expect(screen.getByRole('heading', { name: 'Press de banca' })).toBeInTheDocument();
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
