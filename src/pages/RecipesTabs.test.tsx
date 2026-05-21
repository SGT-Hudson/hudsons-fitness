// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { RecipesTabs } from './RecipesTabs';

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('RecipesTabs', () => {
  it('links to recipes and ingredients sub-routes', () => {
    render(<MemoryRouter initialEntries={['/recipes']}><RecipesTabs /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Recetas' })).toHaveAttribute('href', '/recipes');
    expect(screen.getByRole('link', { name: 'Ingredientes' })).toHaveAttribute('href', '/recipes/ingredients');
  });
});
