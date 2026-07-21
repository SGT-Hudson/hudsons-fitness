// @vitest-environment jsdom
import i18n from '@/i18n';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The field renders through `publicPhotoUrl` (client-side, but it reads the
// bucket's public base off the Supabase client) — CI has no env, so the client
// is stubbed down to the storage surface that call touches.
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

// Who is signed in drives the ownership gate. Mutable so a test can model a
// pooled recipe someone else created; the returned object is rebuilt per call
// but only ever read, so it cannot destabilise a render.
let currentUserId: string | null = 'me';
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: currentUserId ? { id: currentUserId } : null }),
}));

// The two mutations, stubbed at the hook boundary: this test is about what the
// field DOES with them (which control it offers, what it says when the resize
// rejects), not about the upload itself — that is photoStorage's own suite.
const setPhoto = { mutateAsync: vi.fn(), isPending: false };
const clearPhoto = { mutate: vi.fn(), isPending: false };
vi.mock('@/features/recipes/hooks', () => ({
  useSetRecipePhoto: () => setPhoto,
  useClearRecipePhoto: () => clearPhoto,
}));

import { PhotoDecodeError } from '../photoResize';
import { RecipePhotoField } from './RecipePhotoField';

type FieldRecipe = Parameters<typeof RecipePhotoField>[0]['recipe'];

function recipe(over: Partial<FieldRecipe> = {}): FieldRecipe {
  return {
    id: 'r-1',
    name: 'Pollo con arroz',
    created_by_user_id: 'me',
    photo_url: null,
    updated_at: '2026-07-21T10:00:00Z',
    ...over,
  };
}

function jpeg() {
  return new File(['xx'], 'comida.jpg', { type: 'image/jpeg' });
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
  currentUserId = 'me';
  setPhoto.mutateAsync = vi.fn().mockResolvedValue(undefined);
  setPhoto.isPending = false;
  clearPhoto.mutate = vi.fn();
  clearPhoto.isPending = false;
});

describe('RecipePhotoField — the three states', () => {
  it('empty: the placeholder plus an add control, and nothing to remove', () => {
    render(<RecipePhotoField recipe={recipe()} />);
    expect(screen.getByRole('img', { name: 'Receta sin foto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Añadir foto' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quitar la foto' })).not.toBeInTheDocument();
  });

  it('present: the photo, plus replace and remove', () => {
    render(<RecipePhotoField recipe={recipe({ photo_url: 'r-1/full.webp' })} />);
    expect(screen.getByRole('img', { name: 'Foto de Pollo con arroz' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambiar la foto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar la foto' })).toBeInTheDocument();
  });

  it('uploading: a busy status and both controls disabled', () => {
    setPhoto.isPending = true;
    render(<RecipePhotoField recipe={recipe({ photo_url: 'r-1/full.webp' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Subiendo la foto…');
    expect(screen.getByRole('button', { name: 'Cambiar la foto' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Quitar la foto' })).toBeDisabled();
  });

  it('removing: the busy status announces removal, not upload', () => {
    clearPhoto.isPending = true;
    render(<RecipePhotoField recipe={recipe({ photo_url: 'r-1/full.webp' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Quitando la foto…');
  });

  it('requests the 400px thumb for the 70px tile, not the 1600px full image', () => {
    render(<RecipePhotoField recipe={recipe({ photo_url: 'r-1/full.webp' })} />);
    expect(screen.getByRole('img', { name: /Foto de/ })).toHaveAttribute(
      'src',
      expect.stringContaining('r-1/thumb.webp'),
    );
  });
});

describe('RecipePhotoField — the ownership gate (R-01)', () => {
  it('shows a pooled recipe’s photo to the holder but offers no controls', () => {
    render(
      <RecipePhotoField
        recipe={recipe({ created_by_user_id: 'someone-else', photo_url: 'r-1/full.webp' })}
      />,
    );
    expect(screen.getByRole('img', { name: 'Foto de Pollo con arroz' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('offers no controls to a signed-out render either', () => {
    currentUserId = null;
    render(<RecipePhotoField recipe={recipe({ photo_url: 'r-1/full.webp' })} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('RecipePhotoField — picking a file', () => {
  it('uploads the picked file for this recipe', async () => {
    const user = userEvent.setup();
    render(<RecipePhotoField recipe={recipe()} />);
    const file = jpeg();
    await user.upload(screen.getByLabelText('Archivo de foto'), file);

    expect(setPhoto.mutateAsync).toHaveBeenCalledWith({ recipeId: 'r-1', file });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('surfaces the unsupported-format message when the file cannot be decoded', async () => {
    setPhoto.mutateAsync = vi
      .fn()
      .mockRejectedValue(new PhotoDecodeError('could not decode "foto.heic" as an image'));
    const user = userEvent.setup();
    render(<RecipePhotoField recipe={recipe()} />);

    await user.upload(screen.getByLabelText('Archivo de foto'), jpeg());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Formato no admitido. Prueba con JPG o PNG.',
    );
  });

  it('stays quiet about the format when the upload fails for another reason', async () => {
    setPhoto.mutateAsync = vi.fn().mockRejectedValue({ code: '42501', message: 'denied' });
    const user = userEvent.setup();
    render(<RecipePhotoField recipe={recipe()} />);

    await user.upload(screen.getByLabelText('Archivo de foto'), jpeg());

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('removes the photo through the clear mutation', async () => {
    const user = userEvent.setup();
    render(<RecipePhotoField recipe={recipe({ photo_url: 'r-1/full.webp' })} />);

    await user.click(screen.getByRole('button', { name: 'Quitar la foto' }));

    expect(clearPhoto.mutate).toHaveBeenCalledWith('r-1');
  });

  it('clears a leftover unsupported-format message when the photo is removed', async () => {
    setPhoto.mutateAsync = vi
      .fn()
      .mockRejectedValue(new PhotoDecodeError('could not decode "foto.heic" as an image'));
    const user = userEvent.setup();
    render(<RecipePhotoField recipe={recipe({ photo_url: 'r-1/full.webp' })} />);

    await user.upload(screen.getByLabelText('Archivo de foto'), jpeg());
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Quitar la foto' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
