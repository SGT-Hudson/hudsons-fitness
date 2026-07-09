// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import i18n from '@/i18n';
import { BackHeader } from './BackHeader';

function Loc() {
  return <div data-testid="loc">{useLocation().pathname}</div>;
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('BackHeader', () => {
  it('renders title and navigates to `to`', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/settings/profile']}>
        <Routes>
          <Route path="*" element={<><BackHeader title="Perfil" to="/settings" /><Loc /></>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Perfil' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('/settings');
  });

  it('without `to`, goes back in history', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/exercises', '/exercises/abc']} initialIndex={1}>
        <Routes>
          <Route path="*" element={<><BackHeader title="Detalle" /><Loc /></>} />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('/exercises');
  });

  it('with `onBack`, invokes the handler', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="*" element={<BackHeader title="Perfil" onBack={onBack} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Perfil' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('prefers `onBack` over `to`', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(
      <MemoryRouter initialEntries={['/settings/profile']}>
        <Routes>
          <Route path="*" element={<><BackHeader title="Perfil" onBack={onBack} to="/settings" /><Loc /></>} />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('loc')).toHaveTextContent('/settings/profile');
  });
});
