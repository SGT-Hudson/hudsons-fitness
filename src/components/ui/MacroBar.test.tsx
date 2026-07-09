import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MacroBar } from './MacroBar';

function widths(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-seg]')).map(
    (el) => (el as HTMLElement).style.width,
  );
}

describe('MacroBar', () => {
  it('renders a single base fill when not over', () => {
    const { container } = render(<MacroBar consumed={92} target={100} tone="good" excess="neutral" />);
    expect(widths(container)).toEqual(['92%']);
    expect(container.querySelector('[data-tick="target"]')).toBeNull();
  });

  it('renders base-to-tick + excess segment when over, with a target tick', () => {
    // consumed 220 / target 200 → tick at 200/220 = 90.909%
    const { container } = render(<MacroBar consumed={220} target={200} tone="neutral" excess="bad" />);
    const segs = widths(container);
    expect(segs[0]).toMatch(/^90\.9/);
    expect(segs[1]).toMatch(/^9\.0/);
    expect(container.querySelector('[data-tick="target"]')).not.toBeNull();
    expect(container.querySelector('[data-excess="bad"]')).not.toBeNull();
  });

  it('renders a min-floor tick when minFloorG is given (fat low)', () => {
    // floor 44 / target 65 = 67.69%
    const { container } = render(
      <MacroBar consumed={30} target={65} tone="over" excess="bad" minFloorG={44} />,
    );
    const tick = container.querySelector('[data-tick="min"]') as HTMLElement | null;
    expect(tick).not.toBeNull();
    expect(tick!.style.left).toMatch(/^67\.6/);
  });

  it('does nothing for a non-positive target', () => {
    const { container } = render(<MacroBar consumed={50} target={0} tone="neutral" excess="neutral" />);
    expect(widths(container)).toEqual(['0%']);
  });

  it('paints a good-tone overshoot with excess-neutral', () => {
    // protein/fibre overshoot past target while tone stays "good": excess is neutral, not a reward colour.
    const { container } = render(<MacroBar consumed={110} target={100} tone="good" excess="neutral" />);
    const excessSeg = container.querySelector('[data-excess="neutral"]');
    expect(excessSeg).not.toBeNull();
    expect(excessSeg!.className).toMatch(/bg-excess-neutral/);
  });
});
