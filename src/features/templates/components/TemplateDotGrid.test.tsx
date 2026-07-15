import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TemplateDotGrid } from './TemplateDotGrid';

// 7 days × 2 meals; Monday breakfast and Sunday dinner filled.
const filled = Array.from({ length: 7 }, () => [false, false]);
filled[0][0] = true;
filled[6][1] = true;

describe('TemplateDotGrid', () => {
  it('renders one dot per day and meal', () => {
    const { container } = render(<TemplateDotGrid mealCount={2} filled={filled} />);
    expect(container.querySelectorAll('[data-dot]').length).toBe(14);
  });

  it('marks exactly the filled cells', () => {
    const { container } = render(<TemplateDotGrid mealCount={2} filled={filled} />);
    expect(container.querySelectorAll('[data-dot="on"]').length).toBe(2);
    expect(container.querySelector('[data-dot="on"][data-day="0"][data-meal="0"]')).not.toBeNull();
    expect(container.querySelector('[data-dot="on"][data-day="6"][data-meal="1"]')).not.toBeNull();
  });

  it('tints the filled dots by phase, and stays neutral without one', () => {
    const { container: cut } = render(<TemplateDotGrid mealCount={2} filled={filled} phase="cut" />);
    expect(cut.querySelector('[data-dot="on"]')?.className).toContain('bg-phase-cut');

    const { container: none } = render(<TemplateDotGrid mealCount={2} filled={filled} />);
    expect(none.querySelector('[data-dot="on"]')?.className).not.toContain('bg-phase-cut');
  });
});
