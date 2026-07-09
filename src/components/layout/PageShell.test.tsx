// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import i18n from '@/i18n';
import { PageShell } from './PageShell';

function Loc() {
  return <div data-testid="loc">{useLocation().pathname}</div>;
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

function renderShell(ui: React.ReactElement) {
  return render(<MemoryRouter initialEntries={['/diary']}>{ui}</MemoryRouter>);
}

describe('PageShell', () => {
  it('root mode renders both headers (mobile topbar + desktop) and the body', () => {
    renderShell(
      <PageShell title="Diario" subtitle="hoy">
        <p>cuerpo</p>
      </PageShell>,
    );
    // two headings: one in MobileTopBar (md:hidden), one in PageHeaderV2 (hidden md:flex)
    expect(screen.getAllByRole('heading', { name: 'Diario' })).toHaveLength(2);
    expect(screen.getByText('cuerpo')).toBeInTheDocument();
    // root mode carries the section switch
    expect(screen.getByRole('link', { name: 'Cambiar de sección' })).toBeInTheDocument();
  });

  it('back mode renders BackHeader instead of the topbar (no switch)', () => {
    renderShell(
      <PageShell title="Perfil" back="/settings">
        <p>cuerpo</p>
      </PageShell>,
    );
    expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cambiar de sección' })).not.toBeInTheDocument();
  });

  it('back={true} goes back in history without navigating to a route', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/diary', '/settings']} initialIndex={1}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <PageShell title="Perfil" back={true}>
                  <p>cuerpo</p>
                </PageShell>
                <Loc />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('/diary');
  });

  it('back={function} invokes the handler', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route
            path="*"
            element={
              <PageShell title="Perfil" back={onBack}>
                <p>cuerpo</p>
              </PageShell>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
