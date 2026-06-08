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
        lat: 3, trap: 0, rhomboids: 0, lower_back: 0, neck: 0,
        biceps: 0, tri_long: 0, tri_lateral: 0, forearms: 0,
        abs_upper: 0, abs_lower: 0, obliques: 0,
        quads: 0, hamstrings: 0, glutes: 0, abductors: 0, adductors: 0, calves: 0, tibialis: 0,
      },
      maxMuscleValue: 7,
      totalWorkingSets: 10,
      fullBodySetCount: 2,
    },
  }),
}));

import { MuscleActivityView } from './MuscleActivityView';

describe('MuscleActivityView', () => {
  it('renders two bodies, the fine ranked list sorted desc with values, and the footnote', () => {
    const { container } = render(<MuscleActivityView />);
    expect(screen.getAllByTestId('body')).toHaveLength(2);
    // ranked at fine resolution, highest-first: pec_lower(7) → lat(3) → the zeros.
    const labels = [...container.querySelectorAll('li span.flex-1')].map((s) => s.textContent);
    expect(labels).toHaveLength(24);
    expect(labels[0]).toBe('exerciseDialog.muscle.pec_lower');
    expect(labels[1]).toBe('exerciseDialog.muscle.lat');
    // the working-set value is rendered, not just the label.
    expect(container.querySelector('li strong')?.textContent).toBe('7');
    expect(screen.getByText('muscleMap.fullBodyFootnote:2')).toBeInTheDocument();
  });
});
