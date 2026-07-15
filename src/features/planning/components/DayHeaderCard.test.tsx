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

  it('dims a past day and only a past day', () => {
    const { container: pastContainer } = render(
      <DayHeaderCard dateIso="2026-05-26" isToday={false} isPast totals={totals} targets={targets} phaseType="cut" />,
    );
    expect(pastContainer.querySelector('[data-day-header]')?.className).toContain('opacity-60');

    const { container: presentContainer } = render(
      <DayHeaderCard dateIso="2026-05-26" isToday={false} totals={totals} targets={targets} phaseType="cut" />,
    );
    expect(presentContainer.querySelector('[data-day-header]')?.className).not.toContain('opacity-60');
  });

  it('renders a day with nothing planned as neutral — never good — in a cut', () => {
    // classify('kcal', 0, 2180, 'cut') is `good` (the cut band only guards the
    // upper side), so an unplanned day would otherwise read as "perfect": green
    // stripe, green 0, green −2180 — while its macro chips scream red/amber.
    const { container } = render(
      <DayHeaderCard
        dateIso="2026-05-28"
        isToday={false}
        totals={ZERO_MACROS}
        targets={targets}
        phaseType="cut"
        weightKg={80}
      />,
    );

    const stripe = container.querySelector('[data-stripe]');
    expect(stripe?.className).toContain('bg-muted-foreground/50');
    expect(stripe?.className).not.toContain('bg-tone-good');

    // The kcal hero (the chips render their own "0" too) and the delta.
    const hero = screen.getAllByText('0').find((el) => el.className.includes('text-[19px]'));
    expect(hero?.className).toContain('text-muted-foreground');
    expect(hero?.className).not.toContain('text-tone-good');
    expect(screen.getByText('-2180').className).toContain('text-muted-foreground');

    for (const metric of ['protein', 'carbs', 'fat', 'fiber']) {
      const chip = container.querySelector(`[data-macro="${metric}"]`);
      expect(chip?.className).toContain('bg-muted');
      expect(chip?.className).not.toContain('border-destructive');
      expect(chip?.className).not.toContain('bg-tone-good');
    }
    // No fat-floor alarm on a day you simply have not planned yet.
    expect(container.querySelector('[data-tick="min"]')).toBeNull();
    expect(screen.queryByText(/falta grasa/i)).not.toBeInTheDocument();
  });

  it('outlines only the fat chip when weightKg drives fat below its essential floor', () => {
    const floorTargets: Macros = { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 70, fiberG: 30 };
    const floorTotals: Macros = { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 30, fiberG: 30 };
    const { container } = render(
      <DayHeaderCard
        dateIso="2026-05-26"
        isToday={false}
        totals={floorTotals}
        targets={floorTargets}
        phaseType="cut"
        weightKg={80}
      />,
    );
    // 0.6 g/kg × 80 kg = 48 g floor; 30 g consumed is below it.
    const fatChip = container.querySelector('[data-macro="fat"]');
    expect(fatChip?.className).toContain('border-destructive');
    expect(fatChip?.querySelector('[data-tick="min"]')).not.toBeNull();

    for (const metric of ['protein', 'carbs', 'fiber']) {
      const chip = container.querySelector(`[data-macro="${metric}"]`);
      expect(chip?.className).not.toContain('border-destructive');
    }
  });

  it('renders a passed label verbatim, with no date parsing, when given a label identity', () => {
    render(
      <DayHeaderCard label="Lunes" isToday={false} totals={totals} targets={targets} phaseType="cut" />,
    );
    expect(screen.getByText('Lunes')).toBeInTheDocument();
    // A label identity carries no dateIso at all — nothing to parse into a
    // weekday/day-number pair; the kcal hero and delta still render normally.
    expect(screen.getByText('2240')).toBeInTheDocument();
    expect(screen.getByText('+60')).toBeInTheDocument();
  });

  it('renders the optional sublabel alongside the label, verbatim', () => {
    render(
      <DayHeaderCard
        label="Lunes"
        sublabel="Semana 1"
        isToday={false}
        totals={totals}
        targets={targets}
        phaseType="cut"
      />,
    );
    expect(screen.getByText('Lunes')).toBeInTheDocument();
    expect(screen.getByText('Semana 1')).toBeInTheDocument();
  });
});
