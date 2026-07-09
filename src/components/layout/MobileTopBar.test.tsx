// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { MobileTopBar } from './MobileTopBar';

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('MobileTopBar', () => {
  it('renders title and subtitle', () => {
    render(
      <MemoryRouter initialEntries={['/diary']}>
        <MobileTopBar title="Diario" subtitle="Lun 7 jul" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Diario' })).toBeInTheDocument();
    expect(screen.getByText('Lun 7 jul')).toBeInTheDocument();
  });

  it('in nutrition, the switch links to /training', () => {
    render(
      <MemoryRouter initialEntries={['/diary']}>
        <MobileTopBar title="Diario" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Cambiar de sección' })).toHaveAttribute(
      'href',
      '/training',
    );
  });

  it('in gym, the switch links to /diary', () => {
    render(
      <MemoryRouter initialEntries={['/training']}>
        <MobileTopBar title="Hoy" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Cambiar de sección' })).toHaveAttribute(
      'href',
      '/diary',
    );
  });
});
