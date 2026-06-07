import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const useExercisesBrowse = vi.fn();
vi.mock('@/features/training/exercises/hooks', () => ({
  useExercisesBrowse: (...a: unknown[]) => useExercisesBrowse(...a),
}));

import { ExercisesPage } from './ExercisesPage';
import type { Exercise } from '@/features/training/exercises/api';

const row: Exercise = {
  category: 'strength', created_at: '', created_by_user_id: null, default_increment_kg: 2.5,
  equipment: 'barbell', external_id: null, force: null, id: 'ex-1', images: ['Bench/0.jpg'],
  instructions_en: [], instructions_es: [], is_verified: true, level: 'beginner', mechanic: null,
  name_en: 'Bench press', name_es: 'Press de banca', primary_muscles: ['pec_lower'],
  secondary_muscles: [], source: 'free-exercise-db', updated_at: '',
};

function renderPage() {
  return render(<MemoryRouter><ExercisesPage /></MemoryRouter>);
}

beforeEach(async () => {
  useExercisesBrowse.mockReset();
  await i18n.changeLanguage('es');
});

describe('ExercisesPage', () => {
  it('renders a card per result row', () => {
    useExercisesBrowse.mockReturnValue({ data: { rows: [row], total: 1 }, isLoading: false });
    renderPage();
    expect(screen.getByText('Press de banca')).toBeInTheDocument();
  });

  it('shows the empty state when there are no results', () => {
    useExercisesBrowse.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false });
    renderPage();
    expect(screen.getByText('No se encontraron ejercicios.')).toBeInTheDocument();
  });

  it('shows a skeleton grid on first load (not the empty state)', () => {
    useExercisesBrowse.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    expect(screen.getByTestId('exercise-skeleton-grid')).toBeInTheDocument();
    expect(screen.queryByText('No se encontraron ejercicios.')).not.toBeInTheDocument();
  });

  it('does not render the skeleton once loaded', () => {
    useExercisesBrowse.mockReturnValue({ data: { rows: [row], total: 1 }, isLoading: false });
    renderPage();
    expect(screen.queryByTestId('exercise-skeleton-grid')).not.toBeInTheDocument();
  });
});
