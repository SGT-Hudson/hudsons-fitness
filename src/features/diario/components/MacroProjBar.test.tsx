import '@/i18n';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MacroProjBar } from './MacroProjBar';

function seg(container: HTMLElement, name: string): HTMLElement | null {
  return container.querySelector(`[data-seg="${name}"]`);
}

describe('MacroProjBar', () => {
  it('under target: renders base + added segments, no overflow segment', () => {
    // target 200: baseX = 50/200*76 = 19%, totalX = 75/200*76 = 28.5%
    const { container } = render(
      <MacroProjBar metric="protein" base={50} added={25} target={200} />,
    );
    const base = seg(container, 'base');
    const added = seg(container, 'added');
    expect(base).not.toBeNull();
    expect(base!.style.width).toBe('19%');
    expect(added).not.toBeNull();
    expect(added!.style.width).toBe('9.5%');
    expect(seg(container, 'over')).toBeNull();
  });

  it('base segment is rendered at faint opacity regardless of values', () => {
    const { container } = render(
      <MacroProjBar metric="carbs" base={50} added={25} target={200} />,
    );
    const base = seg(container, 'base')!;
    expect(base.className).toMatch(/opacity-\[0\.32\]/);
  });

  it('the target line sits at a fixed 76% whether under or over target', () => {
    const under = render(<MacroProjBar metric="protein" base={50} added={25} target={200} />);
    const over = render(<MacroProjBar metric="protein" base={150} added={70} target={200} />);
    const underTick = under.container.querySelector('[data-tick="target"]') as HTMLElement;
    const overTick = over.container.querySelector('[data-tick="target"]') as HTMLElement;
    expect(underTick.style.left).toBe('76%');
    expect(overTick.style.left).toBe('76%');
  });

  it('over target: renders a striped overflow segment and the over pill with correct grams', () => {
    // target 200, total 220 → over 20. baseX = 150/200*76 = 57%, totalX = 220/200*76 = 83.6%
    // added segment capped at TX (76): width = 76 - 57 = 19%. over segment: 83.6 - 76 = 7.6%
    const { container, getByText } = render(
      <MacroProjBar metric="fat" base={150} added={70} target={200} />,
    );
    const added = seg(container, 'added')!;
    expect(added.style.width).toBe('19%');
    const over = seg(container, 'over');
    expect(over).not.toBeNull();
    expect(over!.style.width).toMatch(/^7\.6/);
    expect(getByText(/20 g de más|20 g over/i)).toBeInTheDocument();
  });

  it('not over target: no overflow segment and no over pill', () => {
    const { container, queryByText } = render(
      <MacroProjBar metric="fat" base={50} added={25} target={200} />,
    );
    expect(seg(container, 'over')).toBeNull();
    expect(queryByText(/g de más|g over/i)).toBeNull();
  });

  it('renders the floating +added label and the axis base/target labels', () => {
    const { getByText } = render(
      <MacroProjBar metric="protein" base={50} added={25} target={200} />,
    );
    expect(getByText(/\+25 g/)).toBeInTheDocument();
    expect(getByText('50')).toBeInTheDocument();
    expect(getByText(/obj 200|target 200/i)).toBeInTheDocument();
  });
});
