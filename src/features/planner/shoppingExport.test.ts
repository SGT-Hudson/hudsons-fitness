import { describe, expect, it } from 'vitest';
import { appendExtra, formatShoppingListText } from './shoppingExport';
import type { ExtraItem } from './shoppingExport';

describe('appendExtra', () => {
  const base: ExtraItem[] = [{ id: '1', name: 'Café' }];

  it('appends a trimmed item with the given id, preserving order', () => {
    expect(appendExtra(base, '  Leche  ', '2')).toEqual([
      { id: '1', name: 'Café' },
      { id: '2', name: 'Leche' },
    ]);
  });

  it('ignores blank / whitespace-only names', () => {
    expect(appendExtra(base, '   ', '2')).toEqual(base);
    expect(appendExtra(base, '', '2')).toEqual(base);
  });

  it('ignores a case-insensitive duplicate', () => {
    expect(appendExtra(base, 'café', '2')).toEqual(base);
  });
});

describe('formatShoppingListText', () => {
  const items = [
    { name: 'Pollo', brand: null, totalQuantity: 1340, unitType: 'gram' },
    { name: 'Huevo', brand: 'Eco', totalQuantity: 6, unitType: 'unit' },
  ];

  it('renders a title and one line per item with the right unit suffix', () => {
    const txt = formatShoppingListText({
      title: 'Lista de la compra',
      items,
      extras: [],
      extrasTitle: 'Extras',
      unitWord: 'ud',
    });
    expect(txt).toBe(
      ['Lista de la compra', '- Pollo — 1340 g', '- Huevo · Eco — 6 ud'].join('\n'),
    );
  });

  it('appends an Extras section (blank-line separated) only when there are extras', () => {
    const withExtras = formatShoppingListText({
      title: 'List',
      items: [items[0]],
      extras: [{ id: 'a', name: 'Bin bags' }],
      extrasTitle: 'Extras',
      unitWord: 'units',
    });
    expect(withExtras).toBe(
      ['List', '- Pollo — 1340 g', '', 'Extras', '- Bin bags'].join('\n'),
    );

    const noExtras = formatShoppingListText({
      title: 'List',
      items: [items[0]],
      extras: [],
      extrasTitle: 'Extras',
      unitWord: 'units',
    });
    expect(noExtras).not.toContain('Extras');
  });
});
