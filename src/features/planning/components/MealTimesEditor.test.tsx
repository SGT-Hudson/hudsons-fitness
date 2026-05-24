import i18n from '@/i18n';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MealTimesEditor } from './MealTimesEditor';

beforeAll(() => {
  void i18n.changeLanguage('es'); // assertions use the Spanish copy
});

describe('MealTimesEditor', () => {
  it('removes a time when its remove button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MealTimesEditor times={['08:00', '13:00']} onChange={onChange} />);
    const removes = screen.getAllByRole('button', { name: 'Quitar' });
    expect(removes).toHaveLength(2);
    await user.click(removes[0]);
    expect(onChange).toHaveBeenCalledWith(['13:00']);
  });

  it('shows no remove button when only one time remains', () => {
    render(<MealTimesEditor times={['08:00']} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Quitar' })).toBeNull();
  });

  it('renders the remove button as a destructive (red) control', () => {
    render(<MealTimesEditor times={['08:00', '13:00']} onChange={() => {}} />);
    const remove = screen.getAllByRole('button', { name: 'Quitar' })[0];
    expect(remove.className).toContain('bg-destructive');
  });
});
