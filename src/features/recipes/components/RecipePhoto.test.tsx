// @vitest-environment jsdom
import i18n from '@/i18n';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// `publicPhotoUrl` reads the bucket's public base off the client, and CI has
// no Supabase env — so the client is stubbed with just the storage surface it
// touches. The path→URL mapping is echoed back so the assertions below can see
// WHICH rendition (full/thumb) each slot asked for.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://cdn.test/recipe-photos/${path}` },
        }),
      }),
    },
  },
}));

import { RecipePhoto, type RecipePhotoSource } from './RecipePhoto';

function source(over: Partial<RecipePhotoSource> = {}): RecipePhotoSource {
  return {
    id: 'r-1',
    name: 'Pollo con arroz',
    photo_url: 'r-1/full.webp',
    updated_at: '2026-07-21T10:00:00Z',
    ...over,
  };
}

beforeAll(async () => {
  await i18n.changeLanguage('es');
});

describe('RecipePhoto', () => {
  it('falls back to the placeholder when the recipe has no photo', () => {
    render(<RecipePhoto recipe={source({ photo_url: null })} variant="card" />);
    expect(screen.getByRole('img', { name: 'Receta sin foto' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Foto de/ })).not.toBeInTheDocument();
  });

  it('renders the photo, named after the recipe, when there is one', () => {
    render(<RecipePhoto recipe={source()} variant="card" />);
    const img = screen.getByRole('img', { name: 'Foto de Pollo con arroz' });
    expect(img).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Receta sin foto' })).not.toBeInTheDocument();
  });

  it.each([
    ['card', 'r-1/thumb.webp'],
    ['thumbnail', 'r-1/thumb.webp'],
    ['hero', 'r-1/full.webp'],
  ] as const)('the %s slot asks for %s', (variant, key) => {
    const { unmount } = render(<RecipePhoto recipe={source()} variant={variant} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', expect.stringContaining(key));
    unmount();
  });

  it('an explicit rendition overrides the variant-implied choice — the editor tile keeps the hero placeholder look but fetches the cheap thumb', () => {
    render(<RecipePhoto recipe={source()} variant="hero" rendition="thumb" />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      expect.stringContaining('r-1/thumb.webp'),
    );
  });

  it('falls back to the placeholder if the photo itself fails to load (a dangling photo_url)', () => {
    render(<RecipePhoto recipe={source()} variant="card" />);
    const img = screen.getByRole('img', { name: 'Foto de Pollo con arroz' });

    fireEvent.error(img);

    expect(screen.getByRole('img', { name: 'Receta sin foto' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Foto de/ })).not.toBeInTheDocument();
  });

  it('cache-busts on updated_at, so a replaced photo is not served from the CDN cache', () => {
    const { unmount } = render(<RecipePhoto recipe={source()} variant="hero" />);
    const before = screen.getByRole('img').getAttribute('src');
    unmount();

    render(
      <RecipePhoto recipe={source({ updated_at: '2026-07-21T12:30:00Z' })} variant="hero" />,
    );
    const after = screen.getByRole('img').getAttribute('src');

    expect(before).toContain('?v=2026-07-21T10:00:00Z');
    expect(after).toContain('?v=2026-07-21T12:30:00Z');
    expect(after).not.toBe(before);
  });
});
