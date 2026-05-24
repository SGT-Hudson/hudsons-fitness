// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { biometricsFormSchema } from '@/features/profile/schema';

const mockMutateAsync = vi.fn().mockResolvedValue({});
// Stable `data` reference (created once) — an inline object literal would be a
// fresh reference each render, re-firing the form.reset effect → infinite loop.
vi.mock('@/features/profile/hooks', () => {
  const data = { sex: 'male', birth_date: '1990-01-01', height_cm: 180, initial_weight_kg: 80 };
  return {
    useProfile: () => ({ data, isLoading: false }),
    useUpdateProfile: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  };
});

import { SettingsBiometricsPage } from './SettingsBiometricsPage';

beforeEach(async () => { await i18n.changeLanguage('es'); mockMutateAsync.mockClear(); });

describe('SettingsBiometricsPage', () => {
  it('shows the required error when fields are blanked', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SettingsBiometricsPage /></MemoryRouter>);
    await user.clear(screen.getByLabelText('Altura (cm)'));
    await user.clear(screen.getByLabelText('Fecha de nacimiento'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Completa todos los campos.')).toBeInTheDocument();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  // The 'range' code drives the out-of-range line (rendered via the same
  // mechanism the required test exercises). Asserting the schema directly is
  // deterministic — typing into a type=number input is flaky under jsdom.
  it('flags an out-of-range height with the distinct range code', () => {
    const r = biometricsFormSchema.safeParse({
      sex: 'male', birth_date: '1990-01-01', height_cm: '999',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const heightIssue = r.error.issues.find((i) => i.path[0] === 'height_cm');
      expect(heightIssue?.message).toBe('range');
    }
  });

  it('saves a valid form', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SettingsBiometricsPage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(mockMutateAsync).toHaveBeenCalledWith({ sex: 'male', birth_date: '1990-01-01', height_cm: 180 });
  });
});
