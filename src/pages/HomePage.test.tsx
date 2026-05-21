// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18n from '@/i18n';
import { HomePage } from './HomePage';

function stubWidth(isDesktop: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: isDesktop, media: q,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(), onchange: null,
  }));
}

beforeEach(async () => { await i18n.changeLanguage('es'); });
afterEach(() => vi.unstubAllGlobals());

describe('HomePage', () => {
  it('renders the dashboard on desktop', () => {
    stubWidth(true);
    render(<MemoryRouter initialEntries={['/home']}><HomePage /></MemoryRouter>);
    expect(screen.getByText('Inicio')).toBeInTheDocument();
  });

  it('redirects to /diary on mobile', () => {
    stubWidth(false);
    render(
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route path="/home" element={<HomePage />} />
          <Route path="/diary" element={<div>diary</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('diary')).toBeInTheDocument();
  });
});
