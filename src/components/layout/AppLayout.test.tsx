// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18n from '@/i18n';
import { AppLayout } from './AppLayout';

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: vi.fn(), user: { email: 'qa@x.dev' } }),
}));

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('AppLayout', () => {
  it('renders both shells and the routed outlet content', () => {
    render(
      <MemoryRouter initialEntries={['/diary']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/diary" element={<div>diary-content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('diary-content')).toBeInTheDocument();
    // mobile switcher trigger + desktop sidebar group label both in DOM (CSS toggles visibility)
    expect(screen.getByRole('button', { name: /Nutrición/ })).toBeInTheDocument();
    expect(screen.getByText('Entreno')).toBeInTheDocument();
  });

  it('toggles the section-accent class on <html> (not the layout div) so portaled overlays inherit it', () => {
    // MemoryRouter builds its history once from initialEntries at mount, so each
    // route under test needs its own render/unmount rather than a single rerender.
    const gym = render(
      <MemoryRouter initialEntries={['/training']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/training" element={<div>training-content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(document.documentElement.classList.contains('section-gym')).toBe(true);
    expect(document.documentElement.classList.contains('section-nutri')).toBe(false);
    gym.unmount();

    render(
      <MemoryRouter initialEntries={['/diary']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/diary" element={<div>diary-content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(document.documentElement.classList.contains('section-nutri')).toBe(true);
    expect(document.documentElement.classList.contains('section-gym')).toBe(false);
  });
});
