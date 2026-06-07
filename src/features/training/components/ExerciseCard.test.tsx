import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ExerciseCard } from './ExerciseCard';
import type { Exercise } from '../exercises/api';

const base: Exercise = {
  category: 'strength', created_at: '', created_by_user_id: null, default_increment_kg: 2.5,
  equipment: 'barbell', external_id: null, force: null, id: 'ex-1',
  images: ['Bench_Press/0.jpg'], instructions_en: [], instructions_es: [],
  is_verified: true, level: 'beginner', mechanic: null, name_en: 'Bench press',
  name_es: 'Press de banca', primary_muscles: ['pec_lower'], secondary_muscles: [],
  source: 'free-exercise-db', updated_at: '',
};

function renderCard(ex: Exercise) {
  return render(<MemoryRouter><ExerciseCard exercise={ex} /></MemoryRouter>);
}

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('ExerciseCard', () => {
  it('shows the name, primary-muscle + equipment badges, and links to the detail page', () => {
    renderCard(base);
    expect(screen.getByText('Press de banca')).toBeInTheDocument();
    expect(screen.getByText('Pectoral inferior')).toBeInTheDocument(); // exerciseDialog.muscle.pec_lower (verified)
    expect(screen.getByText('Barra')).toBeInTheDocument();             // exerciseDialog.equipment.barbell (verified)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/exercises/ex-1');
  });

  it('hides the equipment badge when equipment is null', () => {
    renderCard({ ...base, equipment: null });
    expect(screen.queryByText('Barra')).not.toBeInTheDocument();
  });

  it('renders a placeholder (no <img>) when there are no images', () => {
    renderCard({ ...base, images: [] });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
