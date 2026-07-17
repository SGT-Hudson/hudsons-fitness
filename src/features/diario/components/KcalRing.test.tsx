import i18n from '@/i18n';
import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { KcalRing } from './KcalRing';

// Pin Spanish: the ring now formats kcal in the active language, and es-ES
// grouping only kicks in at 5+ digits (so typical kcal render ungrouped). In
// English these 4-digit values would group ('1,180'), which is not what this
// test asserts.
beforeAll(async () => {
  await i18n.changeLanguage('es');
});

const SIZE = 118;
const STROKE = 11;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

function getArc(container: HTMLElement): SVGCircleElement {
  return container.querySelector('[data-testid="kcal-ring-arc"]') as SVGCircleElement;
}

describe('KcalRing', () => {
  it('0% consumed → dash-offset equals the full circumference (empty ring)', () => {
    const { container } = render(<KcalRing consumed={0} target={2000} phase="cut" />);
    const offset = Number(getArc(container).getAttribute('stroke-dashoffset'));
    expect(offset).toBeCloseTo(CIRC, 5);
  });

  it('50% consumed → dash-offset equals half the circumference', () => {
    const { container } = render(<KcalRing consumed={1000} target={2000} phase="cut" />);
    const offset = Number(getArc(container).getAttribute('stroke-dashoffset'));
    expect(offset).toBeCloseTo(CIRC * 0.5, 5);
  });

  it('100% consumed → dash-offset is 0 (ring fully drawn)', () => {
    const { container } = render(<KcalRing consumed={2000} target={2000} phase="cut" />);
    const offset = Number(getArc(container).getAttribute('stroke-dashoffset'));
    expect(offset).toBeCloseTo(0, 5);
  });

  it('over 100% (consumed > target) clamps the dash-offset at 0, same as exactly 100%', () => {
    const { container } = render(<KcalRing consumed={2600} target={2000} phase="cut" />);
    const offset = Number(getArc(container).getAttribute('stroke-dashoffset'));
    expect(offset).toBeCloseTo(0, 5);
  });

  it('cut phase, well under target → good tone: tone-good stroke + text class on the center number', () => {
    const { container } = render(<KcalRing consumed={1000} target={2000} phase="cut" />);
    expect(getArc(container).getAttribute('stroke')).toBe('var(--tone-good)');
    const value = container.querySelector('[data-testid="kcal-ring-value"]');
    expect(value).toHaveClass('text-tone-good');
    expect(value).not.toHaveClass('text-destructive');
  });

  it('cut phase, +10% over target → over tone: destructive stroke + text class on the center number', () => {
    const { container } = render(<KcalRing consumed={2200} target={2000} phase="cut" />);
    expect(getArc(container).getAttribute('stroke')).toBe('var(--destructive)');
    const value = container.querySelector('[data-testid="kcal-ring-value"]');
    expect(value).toHaveClass('text-destructive');
  });

  it('track circle uses the sunken-background token, not a literal color', () => {
    const { container } = render(<KcalRing consumed={500} target={2000} phase="cut" />);
    const track = container.querySelector('circle:not([data-testid="kcal-ring-arc"])');
    expect(track?.getAttribute('stroke')).toBe('var(--bg-sunken)');
  });

  it('renders the consumed number and the "of target kcal" sub-caption', () => {
    // es-ES grouping only kicks in at 5+ digits (Node's CLDR data), so
    // typical kcal values (under 10,000) render ungrouped.
    const { getByText } = render(<KcalRing consumed={1180} target={2000} phase="cut" />);
    expect(getByText('1180')).toBeInTheDocument();
    expect(getByText(/2000/)).toBeInTheDocument();
  });
});
