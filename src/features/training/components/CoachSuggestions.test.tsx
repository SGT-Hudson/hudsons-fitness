import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { CoachContext } from '@/core/training';

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
