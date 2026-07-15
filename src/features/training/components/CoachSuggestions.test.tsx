import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CoachContext, CoreSessionSet } from '@/core/training';

// ns-aware i18n stub: the 'entrenamiento' namespace resolves the muscle label,
// the 'coach' namespace interpolates the headline template with the values it
// is handed. This verifies the component feeds a LOCALIZED muscle name into the
// headline rather than the raw fine code — independent of how the real headline
// key resolves.
vi.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (ns === 'entrenamiento') {
        return key === 'exerciseDialog.muscle.pec_lower' ? 'Pectoral inferior' : key;
      }
      if (key.endsWith('muscleRecency.headlineNever')) {
        return `Aún no has entrenado ${String(opts?.primaryMuscle)}.`;
      }
      return key;
    },
  }),
}));

import { CoachSuggestions } from './CoachSuggestions';

const ctx: CoachContext = {
  exerciseId: 'ex1',
  primaryMuscles: ['pec_lower'],
  equipment: 'barbell',
  defaultIncrementKg: null,
  history: [],
  todayISO: '2026-05-20',
};

describe('CoachSuggestions muscle-recency headline', () => {
  it('feeds the localized muscle name into the headline, not the raw fine code', () => {
    const { container } = render(<CoachSuggestions context={ctx} />);
    expect(container.textContent).toContain('Pectoral inferior');
    expect(container.textContent).not.toContain('pec_lower');
  });
});

describe('CoachSuggestions editable suggested load', () => {
  // Three identical sessions at target reps and RPE ≤ max → double-progression
  // fires, which is what renders the editable load field.
  const progressionCtx: CoachContext = {
    ...ctx,
    history: [1, 2, 3].map((i): CoreSessionSet => ({
      sessionId: `s${i}`,
      exerciseId: 'ex1',
      performedOn: `2026-05-0${i}`,
      setIndex: 1,
      reps: 8,
      weightKg: 70,
      rpe: 7,
      isWarmup: false,
    })),
  };

  it('applies a comma-typed load as a decimal, not a 10× jump', async () => {
    const onApplySuggestedLoad = vi.fn();
    render(
      <CoachSuggestions context={progressionCtx} onApplySuggestedLoad={onApplySuggestedLoad} />,
    );

    // `type="number"` would have handed React "775" for these keystrokes.
    const field = screen.getByLabelText('suggestedNextLoad');
    await userEvent.clear(field);
    await userEvent.type(field, '77,5');
    await userEvent.click(screen.getByText('apply'));

    expect(onApplySuggestedLoad).toHaveBeenCalledWith(77.5);
  });
});
