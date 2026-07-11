import i18n from '@/i18n';
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DayHeaderCard } from './DayHeaderCard';
import { ZERO_MACROS, type Macros } from '@/features/recipes/macros';

const targets: Macros = { kcal: 2180, proteinG: 168, carbsG: 245, fatG: 68, fiberG: 30 };
const totals: Macros = { kcal: 2240, proteinG: 175, carbsG: 250, fatG: 65, fiberG: 28 };

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('DayHeaderCard', () => {
  it('renders the day number, the kcal hero and the signed delta', () => {
    render(
      <DayHeaderCard dateIso="2026-05-26" isToday totals={totals} targets={targets} phaseType="cut" />,
    );
    expect(screen.getByText('26')).toBeInTheDocument();
    expect(screen.getByText('2240')).toBeInTheDocument();
    expect(screen.getByText('+60')).toBeInTheDocument();
  });

  it('paints the status stripe with the kcal tone (cut, +2.8% → slightOver)', () => {
    const { container } = render(
      <DayHeaderCard dateIso="2026-05-26" isToday={false} totals={totals} targets={targets} phaseType="cut" />,
    );
    expect(container.querySelector('[data-stripe]')?.className).toContain('bg-tone-warn');
  });

  it('outlines today neutrally (no tone colour on the border)', () => {
    const { container } = render(
      <DayHeaderCard dateIso="2026-05-26" isToday totals={totals} targets={targets} phaseType="cut" />,
    );
    const card = container.querySelector('[data-day-header]');
    expect(card?.className).toContain('border-text-dim');
  });

  it('renders one chip per macro', () => {
    const { container } = render(
      <DayHeaderCard dateIso="2026-05-26" isToday={false} totals={totals} targets={targets} phaseType="cut" />,
    );
    expect(container.querySelectorAll('[data-macro]').length).toBe(4);
  });

  it('survives a day with no targets and no slots', () => {
    const { container } = render(
      <DayHeaderCard dateIso="2026-05-26" isToday={false} totals={ZERO_MACROS} />,
    );
    expect(container.querySelector('[data-day-header]')).not.toBeNull();
    expect(screen.queryByText('+0')).toBeNull(); // no target ⇒ no delta readout
  });
});
