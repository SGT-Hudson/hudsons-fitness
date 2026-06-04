import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: { count?: number }) => (o?.count != null ? `${k}:${o.count}` : k),
  }),
}));
vi.mock('@/features/profile/hooks', () => ({ useProfile: () => ({ data: { sex: 'female' } }) }));
vi.mock('./MuscleBody', () => ({ MuscleBody: () => <svg data-testid="body" /> }));
// byMuscle must carry every fine code — the component renders one ranked row per
// MUSCLE_CODES entry and formats its value, so a missing key would crash.
vi.mock('./hooks', () => ({
  useMuscleVolume: () => ({
    data: {
      byMuscle: {
        delt_front: 0, delt_side: 0, delt_rear: 0,
        pec_upper: 0, pec_lower: 7,
        lat: 3, trap: 0, rhomboids: 0, lower_back: 0,
        biceps: 0, tri_long: 0, tri_lateral: 0, forearms: 0,
        abs_upper: 0, abs_lower: 0, obliques: 0,
        quads: 0, hamstrings: 0, glutes: 0, adductors: 0, calves: 0, tibialis: 0,
      },
      maxMuscleValue: 7,
      totalWorkingSets: 10,
      fullBodySetCount: 2,
    },
  }),
}));

import { MuscleActivityView } from './MuscleActivityView';

describe('MuscleActivityView', () => {
  it('renders two bodies, the fine-resolution ranked list and the full-body footnote', () => {
    render(<MuscleActivityView />);
    expect(screen.getAllByTestId('body')).toHaveLength(2);
    expect(screen.getByText('exerciseDialog.muscle.pec_lower')).toBeInTheDocument();
    expect(screen.getByText('muscleMap.fullBodyFootnote:2')).toBeInTheDocument();
  });
});
