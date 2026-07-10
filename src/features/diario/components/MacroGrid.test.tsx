import '@/i18n';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MacroGrid } from './MacroGrid';

const ITEMS = [
  { metric: 'protein' as const, consumed: 90, target: 165, unit: 'g' },
  { metric: 'carbs' as const, consumed: 120, target: 180, unit: 'g' },
  { metric: 'fat' as const, consumed: 40, target: 60, unit: 'g' },
  { metric: 'fiber' as const, consumed: 20, target: 30, unit: 'g' },
];

describe('MacroGrid', () => {
  it('non-collapsible: renders all 4 tiles immediately, no toggle button', () => {
    render(<MacroGrid items={ITEMS} />);
    expect(screen.queryByRole('button', { name: /macros/i })).toBeNull();
    ITEMS.forEach((item) => {
      expect(screen.getByText(new RegExp(`^${item.metric}$`, 'i'), { exact: false })).toBeTruthy();
    });
  });

  it('collapsible: closed by default — toggle visible, tiles not rendered', () => {
    render(<MacroGrid items={ITEMS} collapsible />);
    const toggle = screen.getByRole('button', { name: /macros/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/^protein$|^proteína$/i)).toBeNull();
  });

  it('collapsible: clicking the toggle opens the grid and rotates the chevron', () => {
    const { container } = render(<MacroGrid items={ITEMS} collapsible />);
    const toggle = screen.getByRole('button', { name: /macros/i });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/^protein$|^proteína$/i)).toBeInTheDocument();
    const chevron = container.querySelector('svg');
    expect(chevron?.getAttribute('class')).toMatch(/rotate-180/);
  });

  it('collapsible: clicking again closes it', () => {
    render(<MacroGrid items={ITEMS} collapsible />);
    const toggle = screen.getByRole('button', { name: /macros/i });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/^protein$|^proteína$/i)).toBeNull();
  });
});
