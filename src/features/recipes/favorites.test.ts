import { describe, expect, it } from 'vitest';
import { partitionFavorites, toggleFavorite } from './favorites';

describe('partitionFavorites', () => {
  const items = [
    { id: 'a' },
    { id: 'b' },
    { id: 'c' },
    { id: 'd' },
  ];

  it('moves favorites to the front, keeping original order within each group', () => {
    const out = partitionFavorites(items, new Set(['c', 'a']));
    expect(out.map((i) => i.id)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('returns the list unchanged when there are no favorites', () => {
    const out = partitionFavorites(items, new Set());
    expect(out.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps order when everything is a favorite', () => {
    const out = partitionFavorites(items, new Set(['a', 'b', 'c', 'd']));
    expect(out.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('toggleFavorite', () => {
  it('adds an id that is absent and does not mutate the input', () => {
    const input = new Set(['x']);
    const out = toggleFavorite(input, 'y');
    expect([...out].sort()).toEqual(['x', 'y']);
    expect([...input]).toEqual(['x']);
  });

  it('removes an id that is present', () => {
    const out = toggleFavorite(new Set(['x', 'y']), 'x');
    expect([...out]).toEqual(['y']);
  });
});
