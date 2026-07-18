import { describe, expect, it, vi } from 'vitest';

// Tier-1 test (vitest.config.ts): pure-logic only, no network/Supabase. This
// suite only exercises normalizeNote, but notes.ts creates a real Supabase
// client at module load (for fetchRecipeNote/saveRecipeNote) — mocked here
// the same way api.test.ts mocks it, so the import doesn't try to open a
// real client under Node.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { normalizeNote } from './notes';

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
