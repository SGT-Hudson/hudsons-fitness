import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: { count?: number }) => (o?.count != null ? `${k}:${o.count}` : k),
  }),
}));
vi.mock('@/features/profile/hooks', () => ({ useProfile: () => ({ data: { sex: 'female' } }) }));
vi.mock('./MuscleBody', () => ({ MuscleBody: () => <svg data-testid="body" /> }));
vi.mock('./hooks', () => ({
  useMuscleVolume: () => ({
    data: {
      byMuscle: {
        chest: 7,
        back: 3,
        shoulders: 0,
        quads: 0,
        hamstrings: 0,
        glutes: 0,
        calves: 0,
        biceps: 0,
        triceps: 0,
        core: 0,
        forearms: 0,
      },
      maxMuscleValue: 7,
      totalWorkingSets: 10,
      fullBodySetCount: 2,
    },
  }),
}));

import { MuscleActivityView } from './MuscleActivityView';

describe('MuscleActivityView', () => {
  it('renders two bodies, ranked list and the full-body footnote', () => {
    render(<MuscleActivityView />);
    expect(screen.getAllByTestId('body')).toHaveLength(2);
    expect(screen.getByText('exerciseDialog.primaryMuscle.chest')).toBeInTheDocument();
    expect(screen.getByText('muscleMap.fullBodyFootnote:2')).toBeInTheDocument();
  });
});
