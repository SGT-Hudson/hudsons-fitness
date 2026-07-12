import i18n from '@/i18n';
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecipeMediaPlaceholder } from './RecipeMediaPlaceholder';
import { recipeMediaHue } from '../mediaHue';

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('RecipeMediaPlaceholder', () => {
  it('renders an accessible placeholder, not a broken <img>', () => {
    render(<RecipeMediaPlaceholder recipeId="9c858901-8a57-4791-81fe-4c455b099bc9" />);
    expect(screen.getByRole('img', { name: 'Receta sin foto' })).toBeInTheDocument();
  });

  it('fills the same recipe id with the same hue every render', () => {
    const id = '9c858901-8a57-4791-81fe-4c455b099bc9';
    const hue = recipeMediaHue(id);
    const { container: a } = render(<RecipeMediaPlaceholder recipeId={id} />);
    const { container: b } = render(<RecipeMediaPlaceholder recipeId={id} />);
    const styleA = a.firstElementChild?.getAttribute('style') ?? '';
    const styleB = b.firstElementChild?.getAttribute('style') ?? '';
    expect(styleA).toContain(String(hue));
    expect(styleA).toBe(styleB);
  });

  it('gives different recipe ids a different fill', () => {
    const { container: a } = render(<RecipeMediaPlaceholder recipeId="recipe-a" />);
    const { container: b } = render(<RecipeMediaPlaceholder recipeId="recipe-b" />);
    expect(a.firstElementChild?.getAttribute('style')).not.toBe(b.firstElementChild?.getAttribute('style'));
  });

  it('uses a tighter stripe pitch for the thumbnail variant than the card/hero', () => {
    const id = 'recipe-variant-check';
    const { container: card } = render(<RecipeMediaPlaceholder recipeId={id} variant="card" />);
    const { container: thumb } = render(<RecipeMediaPlaceholder recipeId={id} variant="thumbnail" />);
    expect(card.firstElementChild?.getAttribute('style')).toContain('0 14px');
    expect(thumb.firstElementChild?.getAttribute('style')).toContain('0 12px');
  });

  it('accepts a className for the caller to size and round', () => {
    const { container } = render(<RecipeMediaPlaceholder recipeId="recipe-a" className="rounded-t-3xl h-full" />);
    expect(container.firstElementChild?.className).toContain('rounded-t-3xl');
  });
});
