import { beforeEach, describe, expect, it, vi } from 'vitest';

// Tier-1 test (vitest.config.ts): no network/Supabase. notes.ts creates a
// real Supabase client at module load (for fetchRecipeNote/saveRecipeNote) —
// mocked here the same way api.test.ts mocks it, so the import doesn't try
// to open a real client under Node.
const update = vi.fn();
const eq = vi.fn();
const from = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
  },
}));

import { normalizeNote, saveRecipeNote } from './notes';

beforeEach(() => {
  from.mockReset().mockReturnValue({ update });
  update.mockReset().mockReturnValue({ eq });
  eq.mockReset().mockResolvedValue({ error: null });
});

describe('normalizeNote', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeNote('  sale mejor con menos sal  ')).toBe('sale mejor con menos sal');
  });

  it('maps an empty or whitespace-only note to null so the column clears', () => {
    expect(normalizeNote('')).toBeNull();
    expect(normalizeNote('   \n  ')).toBeNull();
  });

  it('preserves interior line breaks', () => {
    expect(normalizeNote('linea uno\nlinea dos')).toBe('linea uno\nlinea dos');
  });
});

// normalizeNote alone doesn't prove the network boundary is honest: it's the
// payload saveRecipeNote actually sends that determines whether the column
// clears. A regression that sent '' instead of null would leave the row's
// note as an empty string forever (RLS UPDATE succeeds either way — nothing
// else catches it).
describe('saveRecipeNote — payload sent to Supabase', () => {
  it('sends the trimmed note text for a non-empty note', async () => {
    await saveRecipeNote('recipe-1', '  sale mejor con menos sal  ');

    expect(from).toHaveBeenCalledWith('user_recipe_refs');
    expect(update).toHaveBeenCalledTimes(1);
    const payload = update.mock.calls[0][0];
    expect(payload.note).toBe('sale mejor con menos sal');
  });

  it('sends note: null (not "") when the note is cleared', async () => {
    await saveRecipeNote('recipe-1', '   \n  ');

    expect(update).toHaveBeenCalledTimes(1);
    const payload = update.mock.calls[0][0];
    expect(payload.note).toBeNull();
  });
});
