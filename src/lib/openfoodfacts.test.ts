import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProductByBarcode, isValidEan, mapOFFNutriments } from './openfoodfacts';

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
      sugarPer100g: null, // OFF omitted sugars → unknown, not 0
      satFatPer100g: null,
      saltPer100g: null, // idem for salt
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
      sugarPer100g: null,
      satFatPer100g: null,
      saltPer100g: null,
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

  it('maps sugar + saturated fat + salt when OFF provides them', async () => {
    mockFetch({
      status: 1,
      product: {
        code: '5000112637922',
        product_name: 'Galleta',
        nutriments: {
          'energy-kcal_100g': 480,
          sugars_100g: 28,
          'saturated-fat_100g': 9.5,
          salt_100g: 0.68,
        },
      },
    });
    const result = await getProductByBarcode('5000112637922');
    expect(result?.sugarPer100g).toBe(28);
    expect(result?.satFatPer100g).toBe(9.5);
    expect(result?.saltPer100g).toBe(0.68);
  });

  it('leaves salt null when OFF has the other sub-macros but not salt', async () => {
    mockFetch({
      status: 1,
      product: {
        code: '5000112637922',
        product_name: 'Galleta sin sal declarada',
        nutriments: { 'energy-kcal_100g': 480, sugars_100g: 28 },
      },
    });
    const result = await getProductByBarcode('5000112637922');
    expect(result?.saltPer100g).toBeNull();
  });
});

describe('mapOFFNutriments', () => {
  it('maps sugar and saturated fat when present', () => {
    const r = mapOFFNutriments({ 'energy-kcal_100g': 100, sugars_100g: 9, 'saturated-fat_100g': 3 });
    expect(r.sugarPer100g).toBe(9);
    expect(r.satFatPer100g).toBe(3);
  });
  it('returns null (not 0) when OFF omits them', () => {
    const r = mapOFFNutriments({ 'energy-kcal_100g': 100 });
    expect(r.sugarPer100g).toBeNull();
    expect(r.satFatPer100g).toBeNull();
  });
  it('rounds to 2 decimals', () => {
    const r = mapOFFNutriments({ sugars_100g: 9.005, 'saturated-fat_100g': 3.001 });
    expect(r.sugarPer100g).toBe(9.01);
    expect(r.satFatPer100g).toBe(3);
  });

  // R-33 wave 6 — salt joins the U-1 nullable sub-macro contract.
  it('maps salt when OFF provides it', () => {
    const r = mapOFFNutriments({ salt_100g: 1.2 });
    expect(r.saltPer100g).toBe(1.2);
  });
  it('returns null (NOT 0) for salt when OFF omits it — a missing value is unknown, not "salt-free"', () => {
    const r = mapOFFNutriments({ 'energy-kcal_100g': 100, sugars_100g: 9 });
    expect(r.saltPer100g).toBeNull();
    expect(r.saltPer100g).not.toBe(0);
  });
  it('keeps an explicit 0 salt as 0 (a real claim), not null', () => {
    const r = mapOFFNutriments({ salt_100g: 0 });
    expect(r.saltPer100g).toBe(0);
  });
  it('rounds salt to 2 decimals', () => {
    expect(mapOFFNutriments({ salt_100g: 1.2345 }).saltPer100g).toBe(1.23);
  });
});
