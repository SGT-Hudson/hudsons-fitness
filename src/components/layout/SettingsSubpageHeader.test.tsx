// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { SettingsSubpageHeader } from './SettingsSubpageHeader';

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('SettingsSubpageHeader', () => {
  it('shows the title and a back link to /settings', () => {
    render(
      <MemoryRouter>
        <SettingsSubpageHeader title="Perfil" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Perfil' })).toBeInTheDocument();
    const back = screen.getByRole('link', { name: /Ajustes/ });
    expect(back).toHaveAttribute('href', '/settings');
  });
});
