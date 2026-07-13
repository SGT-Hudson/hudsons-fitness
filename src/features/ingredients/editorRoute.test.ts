import { describe, it, expect } from 'vitest';
import {
  ingredientEditPath,
  readIngredientEditorState,
  type IngredientEditorRouteState,
} from './editorRoute';
import type { OFFSearchResult } from '@/lib/openfoodfacts';

const product: OFFSearchResult = {
  code: '8410530305012',
  name: 'Yogur natural griego',
  brand: 'Pascual',
  thumbnailUrl: null,
  kcalPer100g: 116,
  proteinPer100g: 4.5,
  carbsPer100g: 4.2,
  fatPer100g: 9.7,
  fiberPer100g: 0,
  sugarPer100g: 4,
  satFatPer100g: 6.4,
  saltPer100g: null,
};

describe('readIngredientEditorState', () => {
  it('carries an OFF product through by REFERENCE', () => {
    const state: IngredientEditorRouteState = { offProduct: product };
    const read = readIngredientEditorState(state);
    // Identity, not equality: the editor re-seeds (and wipes what the user has
    // typed) whenever `offProduct`'s identity changes. A clone here would reset
    // the form on every re-render.
    expect(read.offProduct).toBe(product);
  });

  it('reads a scanned EAN and a prefilled name', () => {
    expect(readIngredientEditorState({ ean: '8410530305012', name: 'Kefir' })).toEqual({
      offProduct: null,
      ean: '8410530305012',
      name: 'Kefir',
    });
  });

  it('reads a bare navigation (no state) as a blank manual create', () => {
    expect(readIngredientEditorState(null)).toEqual({});
    expect(readIngredientEditorState(undefined)).toEqual({});
  });

  // History state is `unknown`: a stale entry, another page's navigation or a
  // hand-edited history can put anything here. Junk must degrade to a manual
  // create, never to an import with a garbage EAN.
  it('rejects a product-shaped value with no barcode', () => {
    expect(readIngredientEditorState({ offProduct: { name: 'Fake' } }).offProduct).toBeNull();
    expect(readIngredientEditorState({ offProduct: 'nope' }).offProduct).toBeNull();
    expect(readIngredientEditorState('nope')).toEqual({});
  });

  it('treats a blank EAN / name as absent', () => {
    const read = readIngredientEditorState({ ean: '  ', name: '' });
    expect(read.ean).toBeNull();
    expect(read.name).toBeNull();
  });

  it('builds the edit path', () => {
    expect(ingredientEditPath('i-1')).toBe('/recipes/ingredients/i-1/edit');
  });
});
