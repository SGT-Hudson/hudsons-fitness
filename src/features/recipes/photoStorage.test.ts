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
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ photo_url: 'recipe-1/full.webp' }),
    );
    expect(eq).toHaveBeenCalledWith('id', RECIPE_ID);
  });

  // Load-bearing: the object key is stable, so `publicPhotoUrl`'s `?v=` is the
  // ONLY thing that makes a replaced photo visible instead of the browser and
  // the CDN re-serving the old bytes from the identical URL. Nothing else in
  // the schema bumps `updated_at` (there is no trigger) — drop this write and
  // a replace silently shows the previous photo.
  it('bumps updated_at in the same statement, so the cache-bust actually moves', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:34:56.000Z'));
    try {
      await setRecipePhoto(RECIPE_ID, new File([], 'photo.jpg'));
    } finally {
      vi.useRealTimers();
    }

    expect(update).toHaveBeenCalledWith({
      photo_url: 'recipe-1/full.webp',
      updated_at: '2026-07-21T12:34:56.000Z',
    });
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

  // The other half-failure, and the one the ordering argument deliberately
  // ACCEPTS: the objects are gone but the column write failed, so `photo_url`
  // dangles. It must surface as a rejection (the caller retries / shows an
  // error) rather than resolving as if the clear had worked — the UI already
  // degrades to the placeholder on the image's onError, and a retry fixes the
  // column. Asserted explicitly because this is the state the remove-before-null
  // ordering was chosen to prefer over a stranded, unreferenced object.
  it('rejects when the objects were removed but nulling photo_url failed, leaving the pointer dangling', async () => {
    eq.mockResolvedValue({ error: new Error('db unavailable') });

    await expect(clearRecipePhoto(RECIPE_ID)).rejects.toThrow('db unavailable');
    expect(remove).toHaveBeenCalledWith(['recipe-1/full.webp', 'recipe-1/thumb.webp']);
    expect(update).toHaveBeenCalledWith({ photo_url: null });
  });
});

describe('publicPhotoUrl', () => {
  it('returns null when the recipe has no photo', () => {
    expect(
      publicPhotoUrl({ id: RECIPE_ID, photo_url: null, updated_at: '2026-07-20T00:00:00.000Z' }),
    ).toBeNull();
  });

  it('derives the full-size URL from the recipe id, cache-busted with updated_at', () => {
    const url = publicPhotoUrl({
      id: RECIPE_ID,
      photo_url: 'recipe-1/full.webp',
      updated_at: '2026-07-20T00:00:00.000Z',
    });

    expect(getPublicUrl).toHaveBeenCalledWith('recipe-1/full.webp');
    expect(url).toBe('https://cdn.example/recipe-photos/x?v=2026-07-20T00%3A00%3A00.000Z');
  });

  it('asks for the thumb key when asked for the thumb variant', () => {
    publicPhotoUrl(
      { id: RECIPE_ID, photo_url: 'recipe-1/full.webp', updated_at: '2026-07-20T00:00:00.000Z' },
      'thumb',
    );

    expect(getPublicUrl).toHaveBeenCalledWith('recipe-1/thumb.webp');
  });

  // photo_url is a presence flag; both keys come from the id. String surgery on
  // the stored path would hand back the full-size key for anything that doesn't
  // literally contain "full.webp".
  it('derives both keys from the id, not by string-replacing the stored path', () => {
    publicPhotoUrl(
      { id: RECIPE_ID, photo_url: 'legacy/whatever.webp', updated_at: '2026-07-20T00:00:00.000Z' },
      'thumb',
    );

    expect(getPublicUrl).toHaveBeenCalledWith('recipe-1/thumb.webp');
  });

  // PostgREST hands back `2026-07-20 00:00:00+00:00`; a raw `+` in a query
  // string decodes as a space, so the CDN sees a different (wrong) value than
  // the one we meant to send.
  it('URL-encodes the cache-bust value', () => {
    const url = publicPhotoUrl({
      id: RECIPE_ID,
      photo_url: 'recipe-1/full.webp',
      updated_at: '2026-07-20T00:00:00+00:00',
    });

    expect(url).toBe('https://cdn.example/recipe-photos/x?v=2026-07-20T00%3A00%3A00%2B00%3A00');
    expect(url).not.toContain('+');
  });
});
