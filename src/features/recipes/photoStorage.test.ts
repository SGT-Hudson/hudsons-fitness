// R-36b task 3 — Tier-1 test (vitest.config.ts): no network/Supabase. Mocks
// the storage client's `upload`/`remove`/`getPublicUrl` and the `recipes`
// table's `update`, the same way api.test.ts/notes.test.ts mock `.from()`.
// resizeToWebp itself is Task 2's concern (photoResize.test.ts); here it's
// stubbed to hand back two distinguishable blobs so the assertions below are
// about what photoStorage.ts does with them, not how they were produced.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const FULL_BLOB = new Blob(['full'], { type: 'image/webp' });
const THUMB_BLOB = new Blob(['thumb'], { type: 'image/webp' });

const resizeToWebp = vi.fn();
vi.mock('./photoResize', () => ({
  resizeToWebp: (...args: unknown[]) => resizeToWebp(...args),
}));

const upload = vi.fn();
const remove = vi.fn();
const getPublicUrl = vi.fn();
const storageFrom = vi.fn();
const update = vi.fn();
const eq = vi.fn();
const from = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: (...args: unknown[]) => storageFrom(...args),
    },
    from: (...args: unknown[]) => from(...args),
  },
}));

import { clearRecipePhoto, publicPhotoUrl, setRecipePhoto } from './photoStorage';

const RECIPE_ID = 'recipe-1';

beforeEach(() => {
  resizeToWebp.mockReset().mockResolvedValue({ full: FULL_BLOB, thumb: THUMB_BLOB });
  storageFrom.mockReset().mockReturnValue({ upload, remove, getPublicUrl });
  upload.mockReset().mockResolvedValue({ error: null });
  remove.mockReset().mockResolvedValue({ error: null });
  getPublicUrl.mockReset().mockReturnValue({ data: { publicUrl: 'https://cdn.example/recipe-photos/x' } });
  from.mockReset().mockReturnValue({ update });
  update.mockReset().mockReturnValue({ eq });
  eq.mockReset().mockResolvedValue({ error: null });
});

describe('setRecipePhoto', () => {
  it('uploads full and thumb at the stable per-recipe keys with upsert: true', async () => {
    await setRecipePhoto(RECIPE_ID, new File([], 'photo.jpg'));

    expect(storageFrom).toHaveBeenCalledWith('recipe-photos');
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenNthCalledWith(1, 'recipe-1/full.webp', FULL_BLOB, {
      upsert: true,
      contentType: 'image/webp',
    });
    expect(upload).toHaveBeenNthCalledWith(2, 'recipe-1/thumb.webp', THUMB_BLOB, {
      upsert: true,
      contentType: 'image/webp',
    });
  });

  it('writes photo_url as the full-size object PATH, not a URL', async () => {
    await setRecipePhoto(RECIPE_ID, new File([], 'photo.jpg'));

    expect(from).toHaveBeenCalledWith('recipes');
    expect(update).toHaveBeenCalledWith({ photo_url: 'recipe-1/full.webp' });
    expect(eq).toHaveBeenCalledWith('id', RECIPE_ID);
  });

  it('throws and never writes photo_url when the full upload fails', async () => {
    upload.mockResolvedValueOnce({ error: new Error('boom') });

    await expect(setRecipePhoto(RECIPE_ID, new File([], 'photo.jpg'))).rejects.toThrow('boom');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('clearRecipePhoto — remove-before-null ordering', () => {
  it('removes both keys before nulling photo_url', async () => {
    const order: string[] = [];
    remove.mockImplementation(async () => {
      order.push('remove');
      return { error: null };
    });
    eq.mockImplementation(async () => {
      order.push('update');
      return { error: null };
    });

    await clearRecipePhoto(RECIPE_ID);

    expect(remove).toHaveBeenCalledWith(['recipe-1/full.webp', 'recipe-1/thumb.webp']);
    expect(update).toHaveBeenCalledWith({ photo_url: null });
    expect(order).toEqual(['remove', 'update']);
  });

  it('never nulls photo_url when the remove fails, leaving the pointer intact', async () => {
    remove.mockResolvedValue({ error: new Error('storage unavailable') });

    await expect(clearRecipePhoto(RECIPE_ID)).rejects.toThrow('storage unavailable');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('publicPhotoUrl', () => {
  it('returns null when the recipe has no photo', () => {
    expect(publicPhotoUrl({ photo_url: null, updated_at: '2026-07-20T00:00:00.000Z' })).toBeNull();
  });

  it('derives the full-size URL from photo_url, cache-busted with updated_at', () => {
    const url = publicPhotoUrl({
      photo_url: 'recipe-1/full.webp',
      updated_at: '2026-07-20T00:00:00.000Z',
    });

    expect(getPublicUrl).toHaveBeenCalledWith('recipe-1/full.webp');
    expect(url).toBe('https://cdn.example/recipe-photos/x?v=2026-07-20T00:00:00.000Z');
  });

  it('swaps full for thumb when asked for the thumb variant', () => {
    publicPhotoUrl(
      { photo_url: 'recipe-1/full.webp', updated_at: '2026-07-20T00:00:00.000Z' },
      'thumb',
    );

    expect(getPublicUrl).toHaveBeenCalledWith('recipe-1/thumb.webp');
  });
});
