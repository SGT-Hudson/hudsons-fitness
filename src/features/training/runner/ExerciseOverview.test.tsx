import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen, fireEvent } from '@testing-library/react';

// ExerciseOverview will import ExerciseInfoButton, which transitively imports
// @/lib/supabase + useExercise (needs a QueryClient) + useMediaQuery. Mock them so
// the row renders without a provider; the popup stays closed in these tests.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => false }));
vi.mock('@/features/training/exercises/hooks', () => ({
  useExercise: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { ExerciseOverview } from './ExerciseOverview';
import type { RunnerExercise } from '@/core/runner';

const exercises = [
  { exerciseId: 'ex-1', position: 1, status: 'pending' },
] as unknown as RunnerExercise[];

function renderOverview(onJump = vi.fn()) {
  render(
    <ExerciseOverview
      exercises={exercises}
      currentIndex={-1}
      names={{ 'ex-1': 'Press de banca' }}
      onJump={onJump}
      onSkipCurrent={vi.fn()}
      onFinishEarly={vi.fn()}
      onClose={vi.fn()}
      onAddExercise={vi.fn()}
    />,
  );
  return onJump;
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('ExerciseOverview detail button', () => {
  const openAria = () => i18n.t('entrenamiento:exerciseDetail.openAria');

  it('renders an Info button alongside the jump button', () => {
    renderOverview();
    expect(screen.getByText(/Press de banca/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: openAria() })).toBeInTheDocument();
  });

  it('the Info button does not trigger onJump', () => {
    const onJump = renderOverview();
    fireEvent.click(screen.getByRole('button', { name: openAria() }));
    expect(onJump).not.toHaveBeenCalled();
  });

  it('the jump button still triggers onJump', () => {
    const onJump = renderOverview();
    fireEvent.click(screen.getByRole('button', { name: /Press de banca/ }));
    expect(onJump).toHaveBeenCalledWith(0);
  });
});
