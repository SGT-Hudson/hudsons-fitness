import i18n from '@/i18n';
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhaseChip } from './PhaseChip';

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('PhaseChip', () => {
  it('labels and tints a cut', () => {
    const { container } = render(<PhaseChip phase="cut" />);
    expect(screen.getByText('Corte')).toBeInTheDocument();
    expect(container.firstElementChild?.className).toContain('bg-phase-cut-soft');
  });

  it('labels and tints a bulk', () => {
    const { container } = render(<PhaseChip phase="bulk" />);
    expect(screen.getByText('Volumen')).toBeInTheDocument();
    expect(container.firstElementChild?.className).toContain('bg-phase-bulk-soft');
  });
});
