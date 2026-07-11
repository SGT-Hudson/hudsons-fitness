import i18n from '@/i18n';
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DayMacroChip } from './DayMacroChip';

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('DayMacroChip', () => {
  it('renders the metric letter and the consumed / target numbers', () => {
    render(<DayMacroChip metric="protein" consumed={165} target={168} phase="cut" />);
    expect(screen.getByText('P')).toBeInTheDocument();
    expect(screen.getByText('165')).toBeInTheDocument();
    expect(screen.getByText('168')).toBeInTheDocument();
  });

  it('paints an excess segment when consumed is over target', () => {
    const { container } = render(
      <DayMacroChip metric="carbs" consumed={275} target={245} phase="cut" />,
    );
    // Over target in a cut → MacroBar renders a second, excess-toned segment.
    expect(container.querySelector('[data-seg][data-excess]')).not.toBeNull();
  });

  it('outlines the chip when fat sits below the essential floor', () => {
    const { container } = render(
      <DayMacroChip metric="fat" consumed={30} target={68} phase="cut" floorG={48} />,
    );
    const chip = container.querySelector('[data-macro="fat"]');
    expect(chip?.className).toContain('border-destructive');
    expect(container.querySelector('[data-tick="min"]')).not.toBeNull();
  });

  it('signals a fat-floor breach with text, not colour alone', () => {
    const { container } = render(
      <DayMacroChip metric="fat" consumed={30} target={68} phase="cut" floorG={48} />,
    );
    const chip = container.querySelector('[data-macro="fat"]');
    // Health signal: reachable without perceiving the red outline or the tick.
    expect(chip?.getAttribute('title')).toBe(i18n.t('planning:summary.fatLowHelp'));
    expect(screen.getByText(i18n.t('planning:summary.fatLow'))).toBeInTheDocument();
  });

  it('carries no fat warning when fat clears the floor', () => {
    const { container } = render(
      <DayMacroChip metric="fat" consumed={60} target={68} phase="cut" floorG={48} />,
    );
    expect(container.querySelector('[data-macro="fat"]')?.getAttribute('title')).toBeNull();
    expect(screen.queryByText(/falta grasa/i)).not.toBeInTheDocument();
  });

  it('renders neutral on demand, ignoring the classifier and the fat floor', () => {
    const { container } = render(
      <DayMacroChip metric="fat" consumed={0} target={68} phase="cut" floorG={48} neutral />,
    );
    const chip = container.querySelector('[data-macro="fat"]');
    expect(chip?.className).toContain('bg-muted');
    expect(chip?.className).not.toContain('border-destructive');
    expect(container.querySelector('[data-tick="min"]')).toBeNull();
    // The target readout survives — only the tone is suppressed.
    expect(screen.getByText('68')).toBeInTheDocument();
  });

  it('stays neutral with no target', () => {
    const { container } = render(<DayMacroChip metric="fiber" consumed={12} />);
    expect(container.querySelector('[data-seg]')).toBeNull();
    expect(screen.getByText('12')).toBeInTheDocument();
  });
});
