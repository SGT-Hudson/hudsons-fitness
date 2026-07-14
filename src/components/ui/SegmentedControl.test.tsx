import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SegmentedControl } from './SegmentedControl';

const OPTIONS = [
  { value: '1m', label: '1M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1A' },
  { value: 'all', label: 'Todo' },
] as const;

function setup(value: (typeof OPTIONS)[number]['value'], onChange = vi.fn()) {
  render(
    <SegmentedControl
      ariaLabel="Rango temporal"
      options={OPTIONS}
      value={value}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe('SegmentedControl', () => {
  it('renders a radiogroup with one radio per option', () => {
    setup('6m');
    expect(screen.getByRole('radiogroup', { name: 'Rango temporal' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });

  it('checks only the active option', () => {
    setup('6m');
    expect(screen.getByRole('radio', { name: '6M' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '1M' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Todo' })).not.toBeChecked();
  });

  it('emits the clicked option', async () => {
    const onChange = setup('6m');
    await userEvent.click(screen.getByRole('radio', { name: 'Todo' }));
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('gives only the active option a tab stop (roving tabindex)', () => {
    setup('1y');
    expect(screen.getByRole('radio', { name: '1A' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: '6M' })).toHaveAttribute('tabindex', '-1');
  });

  it('selects and focuses the next option on ArrowRight', async () => {
    const onChange = setup('6m');
    screen.getByRole('radio', { name: '6M' }).focus();

    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('1y');
    expect(screen.getByRole('radio', { name: '1A' })).toHaveFocus();
  });

  it('wraps backwards from the first option to the last', async () => {
    const onChange = setup('1m');
    screen.getByRole('radio', { name: '1M' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('all');
  });
});
