// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import i18n from '@/i18n';
import { PageShell, PageHeaderV2 } from './PageShell';

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

  it('root mode keeps actions out of the mobile top bar (desktop header only)', () => {
    renderShell(
      <PageShell title="Diario" actions={<button type="button">Añadir</button>}>
        <p>cuerpo</p>
      </PageShell>,
    );
    // Only one button reaches the DOM: PageHeaderV2 (desktop). MobileTopBar no
    // longer forwards `actions`, so the title survives at 390px (R-33 fix).
    expect(screen.getAllByRole('button', { name: 'Añadir' })).toHaveLength(1);
    // The mobile top bar is identified by its section switch (BackHeader has
    // none); that header must not contain the action button.
    const mobileHeader = screen.getByRole('link', { name: 'Cambiar de sección' }).closest('header');
    expect(mobileHeader).not.toBeNull();
    expect(
      within(mobileHeader as HTMLElement).queryByRole('button', { name: 'Añadir' }),
    ).not.toBeInTheDocument();
  });

  it('back mode still forwards actions to BackHeader', () => {
    renderShell(
      <PageShell title="Perfil" back="/settings" actions={<button type="button">Añadir</button>}>
        <p>cuerpo</p>
      </PageShell>,
    );
    // Unlike root mode, back mode forwards `actions` unchanged to both
    // BackHeader (mobile) and PageHeaderV2 (desktop) — both mounted in jsdom.
    expect(screen.getAllByRole('button', { name: 'Añadir' })).toHaveLength(2);
    const backHeader = screen.getByRole('button', { name: 'Volver' }).closest('header');
    expect(backHeader).not.toBeNull();
    expect(within(backHeader as HTMLElement).getByRole('button', { name: 'Añadir' })).toBeInTheDocument();
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

describe('PageHeaderV2', () => {
  function header(container: HTMLElement) {
    return container.querySelector('header') as HTMLElement;
  }

  it('grows instead of clipping: min height, wrapping row, vertical padding', () => {
    // The planner packs the row (title + week meta + 4 actions); a fixed `h-14`
    // + `overflow` clipped the actions off the top of the page below ~1750px.
    // The row must be free to wrap and the header free to grow with it.
    const { container } = render(
      <MemoryRouter>
        <PageHeaderV2 title="Planificador" meta={<span>meta</span>} actions={<button>A</button>} />
      </MemoryRouter>,
    );
    const el = header(container);
    expect(el.className).toContain('min-h-14');
    expect(el.className).toContain('flex-wrap');
    // a wrapped row still needs to breathe
    expect(el.className).toMatch(/(^|\s)py-2(\s|$)/);
    // no fixed height — that is what clipped the content
    expect(el.className).not.toMatch(/(^|\s)h-14(\s|$)/);
  });

  it('a header that fits on one row is unchanged: 56px tall, vertically centred', () => {
    // min-h-14 (56px) + py-2 (16px) still measures 56px for any row up to 40px
    // tall — every other page's header (title + a button, h-9) stays put.
    const { container } = render(
      <MemoryRouter>
        <PageHeaderV2 title="Diario" />
      </MemoryRouter>,
    );
    const el = header(container);
    expect(el.className).toContain('min-h-14');
    expect(el.className).toContain('items-center');
  });
});
