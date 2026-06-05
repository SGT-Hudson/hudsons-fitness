import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen } from '@testing-library/react';

// Component transitively imports `../exercises/api`, which imports `@/lib/supabase`
// (throws on load without VITE_SUPABASE_* env). Stub it. Mock the hooks module so
// no real query runs — note ExercisePicker always renders <ExerciseDialog>, whose
// body calls useCreateExercise(), so BOTH hooks must be mocked or the render
// crashes on an undefined hook.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../exercises/hooks', () => ({
  useExerciseSearch: () => ({ data: [], isLoading: false }),
  useCreateExercise: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

import { ExercisePicker } from './ExercisePicker';
import { MUSCLE_GROUPS } from '@/core/muscles';

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('ExercisePicker group-level options', () => {
  it('renders a "<Group> — todos" option per group with a group: value', () => {
    render(<ExercisePicker selected={null} onSelect={() => {}} onClear={() => {}} />);
    for (const g of MUSCLE_GROUPS) {
      const label = i18n.t(`entrenamiento:exerciseDialog.muscleGroup.${g}`);
      const opt = screen.getByRole('option', {
        name: i18n.t('entrenamiento:picker.allInGroup', { group: label }),
      });
      expect(opt).toHaveValue(`group:${g}`);
    }
  });
});
