import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Component transitively imports `../exercises/api`, which imports `@/lib/supabase`
// (throws on load without VITE_SUPABASE_* env). Stub it. Mock the hooks module so
// no real query runs — note ExercisePicker always renders <ExerciseDialog>, whose
// body calls useCreateExercise(), so BOTH hooks must be mocked or the render
// crashes on an undefined hook.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
const searchResults: { id: string; name_es: string; name_en: string; equipment: string | null }[] = [];
vi.mock('../exercises/hooks', () => ({
  useExerciseSearch: () => ({ data: searchResults, isLoading: false }),
  useCreateExercise: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useExercise: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => false }));

import { ExercisePicker } from './ExercisePicker';
import { MUSCLE_GROUPS } from '@/core/muscles';

beforeEach(async () => {
  await i18n.changeLanguage('es');
  searchResults.length = 0;
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

describe('ExercisePicker excludeIds', () => {
  const rows = [
    { id: 'curl', name_es: 'Curl de bíceps', name_en: 'Biceps Curl', equipment: null },
    { id: 'bench', name_es: 'Press banca', name_en: 'Bench Press', equipment: null },
  ];

  it('lists every result when no ids are excluded', async () => {
    searchResults.push(...rows);
    render(<ExercisePicker selected={null} onSelect={() => {}} onClear={() => {}} />);
    await userEvent.click(screen.getByPlaceholderText(i18n.t('entrenamiento:picker.placeholder')));
    expect(screen.getByText('Curl de bíceps')).toBeInTheDocument();
    expect(screen.getByText('Press banca')).toBeInTheDocument();
  });

  it('hides excluded ids', async () => {
    searchResults.push(...rows);
    render(
      <ExercisePicker selected={null} onSelect={() => {}} onClear={() => {}} excludeIds={['bench']} />,
    );
    await userEvent.click(screen.getByPlaceholderText(i18n.t('entrenamiento:picker.placeholder')));
    expect(screen.getByText('Curl de bíceps')).toBeInTheDocument();
    expect(screen.queryByText('Press banca')).not.toBeInTheDocument();
  });

  it('shows the empty-results message when everything is excluded', async () => {
    searchResults.push(...rows);
    render(
      <ExercisePicker
        selected={null} onSelect={() => {}} onClear={() => {}}
        excludeIds={['bench', 'curl']}
      />,
    );
    const input = screen.getByPlaceholderText(i18n.t('entrenamiento:picker.placeholder'));
    await userEvent.click(input);
    await userEvent.type(input, 'x');
    expect(await screen.findByText(i18n.t('entrenamiento:picker.noResults'))).toBeInTheDocument();
  });
});
