// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { PageShell } from './PageShell';

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
});
