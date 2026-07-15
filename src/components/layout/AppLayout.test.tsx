// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18n from '@/i18n';
import { AppLayout } from './AppLayout';

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: vi.fn(), user: { email: 'qa@x.dev' } }),
}));

vi.mock('@/features/phases/hooks', () => ({
  useActivePhase: () => ({ data: null }),
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
    // sidebar group label (desktop) confirms AppSidebar renders
    expect(screen.getByText('Entrenamiento')).toBeInTheDocument();
    // "Diario" link renders in both the desktop sidebar and the mobile bottom
    // nav (CSS toggles visibility) — confirms BottomNav renders too.
    const diaryLinks = screen.getAllByRole('link', { name: 'Diario' });
    expect(diaryLinks).toHaveLength(2);
    for (const link of diaryLinks) expect(link).toHaveAttribute('href', '/diary');
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
