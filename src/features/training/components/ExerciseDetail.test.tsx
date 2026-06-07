import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import { ExerciseDetail } from './ExerciseDetail';
import type { Exercise } from '../exercises/api';

const base: Exercise = {
  category: 'strength',
  created_at: '2026-01-01T00:00:00Z',
  created_by_user_id: null,
  default_increment_kg: 2.5,
  equipment: 'barbell',
  external_id: 'Bench_Press',
  force: 'push',
  id: 'ex-1',
  images: ['Bench_Press/0.jpg', 'Bench_Press/1.jpg'],
  instructions_en: ['Lie on the bench.', 'Press the bar up.'],
  instructions_es: ['Túmbate en el banco.', 'Empuja la barra hacia arriba.'],
  is_verified: true,
  level: 'beginner',
  mechanic: 'compound',
  name_en: 'Bench press',
  name_es: 'Press de banca',
  primary_muscles: ['pec_lower'],
  secondary_muscles: ['tri_long'],
  source: 'free-exercise-db',
  updated_at: '2026-01-01T00:00:00Z',
};

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('ExerciseDetail', () => {
  it('renders the name, Spanish steps in order, and the muscle/equipment badges (compact)', () => {
    render(<ExerciseDetail exercise={base} density="compact" />);
    expect(screen.getByRole('heading', { name: 'Press de banca' })).toBeInTheDocument();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['Túmbate en el banco.', 'Empuja la barra hacia arriba.']);
    expect(screen.getByText(i18n.t('entrenamiento:exerciseDialog.muscle.pec_lower'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('entrenamiento:exerciseDialog.equipment.barbell'))).toBeInTheDocument();
  });

  it('renders English steps when language is en', async () => {
    await i18n.changeLanguage('en');
    render(<ExerciseDetail exercise={base} density="compact" />);
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['Lie on the bench.', 'Press the bar up.']);
  });

  it('falls back to Spanish steps when English steps are empty', async () => {
    await i18n.changeLanguage('en');
    render(<ExerciseDetail exercise={{ ...base, instructions_en: [] }} density="compact" />);
    expect(screen.getByText('Túmbate en el banco.')).toBeInTheDocument();
  });

  it('shows the empty-state when there are no instructions', () => {
    render(
      <ExerciseDetail
        exercise={{ ...base, instructions_en: [], instructions_es: [] }}
        density="compact"
      />,
    );
    expect(
      screen.getByText(i18n.t('entrenamiento:exerciseDetail.noInstructions')),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('renders the image loop when images exist and nothing when they do not', () => {
    const { rerender } = render(<ExerciseDetail exercise={base} density="compact" />);
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    rerender(<ExerciseDetail exercise={{ ...base, images: [] }} density="compact" />);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('renders the full density without crashing', () => {
    render(<ExerciseDetail exercise={base} density="full" />);
    expect(screen.getByRole('heading', { name: 'Press de banca' })).toBeInTheDocument();
  });

  it('snapshots the full (visual-first) density layout', () => {
    const { container } = render(<ExerciseDetail exercise={base} density="full" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
