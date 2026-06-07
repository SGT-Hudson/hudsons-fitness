import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => true })); // desktop → Dialog
const useExercise = vi.fn();
vi.mock('../exercises/hooks', () => ({ useExercise: (...a: unknown[]) => useExercise(...a) }));

import { ExerciseInfoButton } from './ExerciseInfoButton';
import type { Exercise } from '../exercises/api';

const base: Exercise = {
  category: null, created_at: '2026-01-01T00:00:00Z', created_by_user_id: null,
  default_increment_kg: 2.5, equipment: 'barbell', external_id: null, force: null,
  id: 'ex-1', images: [], instructions_en: ['Step one.'], instructions_es: ['Paso uno.'],
  is_verified: true, level: null, mechanic: null, name_en: 'Bench press',
  name_es: 'Press de banca', primary_muscles: ['pec_lower'], secondary_muscles: [],
  source: 'free-exercise-db', updated_at: '2026-01-01T00:00:00Z',
};

beforeEach(async () => {
  useExercise.mockReset();
  useExercise.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });
  await i18n.changeLanguage('es');
});

describe('ExerciseInfoButton', () => {
  it('object path: opens the sheet and shows the exercise without fetching', () => {
    render(<ExerciseInfoButton exercise={base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalles del ejercicio' }));
    expect(screen.getByRole('heading', { name: 'Press de banca' })).toBeInTheDocument();
    // enabled=false on the object path → no real fetch
    expect(useExercise).toHaveBeenCalledWith(undefined, expect.objectContaining({ enabled: false }));
  });

  it('id path: shows a loading status while fetching', () => {
    useExercise.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    render(<ExerciseInfoButton exerciseId="ex-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalles del ejercicio' }));
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('id path: shows the exercise on success', () => {
    useExercise.mockReturnValue({ data: base, isLoading: false, isError: false, refetch: vi.fn() });
    render(<ExerciseInfoButton exerciseId="ex-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalles del ejercicio' }));
    expect(screen.getByRole('heading', { name: 'Press de banca' })).toBeInTheDocument();
  });

  it('id path: shows an error + retry that refetches', () => {
    const refetch = vi.fn();
    useExercise.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    render(<ExerciseInfoButton exerciseId="ex-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalles del ejercicio' }));
    expect(screen.getByText('No se pudo cargar el ejercicio')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('trigger stops mousedown + click propagation', () => {
    const onMouseDown = vi.fn();
    const onClick = vi.fn();
    render(
      <div onMouseDown={onMouseDown} onClick={onClick}>
        <ExerciseInfoButton exercise={base} />
      </div>,
    );
    const trigger = screen.getByRole('button', { name: 'Ver detalles del ejercicio' });
    fireEvent.mouseDown(trigger);
    fireEvent.click(trigger);
    expect(onMouseDown).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });
});
