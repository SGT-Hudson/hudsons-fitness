import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProductByBarcode, isValidEan } from './openfoodfacts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isValidEan', () => {
  it('accepts a valid EAN-13 (check digit correct)', () => {
    expect(isValidEan('5000112637922')).toBe(true);
  });
  it('accepts a valid EAN-8', () => {
    expect(isValidEan('96385074')).toBe(true);
  });
  it('accepts a valid UPC-A (12 digits)', () => {
    expect(isValidEan('036000291452')).toBe(true);
  });
  it('rejects a wrong check digit', () => {
    expect(isValidEan('5000112637923')).toBe(false);
  });
  it('rejects non-digit and wrong-length input', () => {
    expect(isValidEan('50001126ABCDE')).toBe(false);
    expect(isValidEan('12345')).toBe(false);
    expect(isValidEan('')).toBe(false);
  });
});

describe('getProductByBarcode', () => {
  function mockFetch(body: unknown, ok = true, status = 200) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok,
        status,
        json: () => Promise.resolve(body),
      }),
    );
  }

  it('maps a found product to OFFSearchResult', async () => {
    mockFetch({
      status: 1,
      product: {
        code: '5000112637922',
        product_name: 'Coca-Cola',
        brands: 'Coca-Cola, The Coca-Cola Company',
        nutriments: {
          'energy-kcal_100g': 42,
          proteins_100g: 0,
          carbohydrates_100g: 10.6,
          fat_100g: 0,
          fiber_100g: 0,
        },
        image_thumb_url: 'https://img/thumb.jpg',
      },
    });
    const result = await getProductByBarcode('5000112637922');
    expect(result).toEqual({
      code: '5000112637922',
      name: 'Coca-Cola',
      brand: 'Coca-Cola',
      thumbnailUrl: 'https://img/thumb.jpg',
      kcalPer100g: 42,
      proteinPer100g: 0,
      carbsPer100g: 10.6,
      fatPer100g: 0,
      fiberPer100g: 0,
      complete: true, // OFF had an energy value
    });
  });

  it('returns null when OFF reports status 0 (not found)', async () => {
    mockFetch({ status: 0 });
    expect(await getProductByBarcode('0000000000000')).toBeNull();
  });

  it('returns a partial product (zeros) when nutriments are incomplete — barcode path is lenient', async () => {
    mockFetch({
      status: 1,
      product: {
        code: '8410000000000',
        product_name: 'Producto español sin macros',
        brands: 'MarcaES',
        nutriments: {}, // name present, no energy/macros — common for ES OFF entries
      },
    });
    const result = await getProductByBarcode('8410000000000');
    expect(result).toEqual({
      code: '8410000000000',
      name: 'Producto español sin macros',
      brand: 'MarcaES',
      thumbnailUrl: null,
      kcalPer100g: 0,
      proteinPer100g: 0,
      carbsPer100g: 0,
      fatPer100g: 0,
      fiberPer100g: 0,
      complete: false, // no energy value → "fill the gaps" path
    });
  });

  it('still returns null when the product has no usable name', async () => {
    mockFetch({ status: 1, product: { code: '8410000000000', nutriments: { 'energy-kcal_100g': 50 } } });
    expect(await getProductByBarcode('8410000000000')).toBeNull();
  });

  it('returns null on HTTP 404 (OFF answers unknown barcodes with 404)', async () => {
    mockFetch({ status: 0, status_verbose: 'product not found' }, false, 404);
    expect(await getProductByBarcode('0000000000000')).toBeNull();
  });

  it('throws on a genuine non-OK HTTP response (e.g. 5xx)', async () => {
    mockFetch({}, false, 503);
    await expect(getProductByBarcode('5000112637922')).rejects.toThrow();
  });
});
