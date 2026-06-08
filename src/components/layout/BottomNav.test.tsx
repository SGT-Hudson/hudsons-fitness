// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { BottomNav } from './BottomNav';

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('es');
});

describe('BottomNav', () => {
  it('shows the four Nutrición tabs on a nutrición route', () => {
    render(
      <MemoryRouter initialEntries={['/diary']}>
        <BottomNav />
      </MemoryRouter>,
    );
    for (const label of ['Diario', 'Planificador', 'Recetas', 'Progreso']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('shows the Entreno tabs on a training route', () => {
    render(
      <MemoryRouter initialEntries={['/training']}>
        <BottomNav />
      </MemoryRouter>,
    );
    for (const label of ['Hoy', 'Rutina', 'Ejercicios', 'Progreso']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });
});
