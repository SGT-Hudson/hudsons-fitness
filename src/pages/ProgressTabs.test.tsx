// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { ProgressTabs } from './ProgressTabs';

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('ProgressTabs', () => {
  it('links to the overview and goals sub-routes', () => {
    render(<MemoryRouter initialEntries={['/progress']}><ProgressTabs /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Progreso' })).toHaveAttribute('href', '/progress');
    expect(screen.getByRole('link', { name: 'Objetivos' })).toHaveAttribute('href', '/progress/goals');
  });
});
