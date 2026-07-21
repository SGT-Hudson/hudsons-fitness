import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resizeToWebp, PhotoDecodeError } from './photoResize';

// Tier-1 test (vitest.config.ts): Node environment, no jsdom — and even
// jsdom has no real canvas encoder, so there is nothing to gain from it here.
// Instead this file stubs the whole browser boundary photoResize.ts talks to
// (document.createElement('canvas'), the 2d context, canvas.toBlob, `Image`,
// `URL.createObjectURL`/`revokeObjectURL`) and asserts the ORCHESTRATION:
// what dimensions/quality get handed to the canvas, what blob types come
// back out, and that a decode failure rejects instead of resolving. Pixel
// fidelity and real WebP encoding are not covered here — that only happens
// in a real browser, which is the Task 4 manual/browser pass.

let mockNaturalWidth = 800;
let mockNaturalHeight = 600;
let mockImageShouldError = false;

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;

  set src(_value: string) {
    queueMicrotask(() => {
      if (mockImageShouldError) {
        this.onerror?.();
        return;
      }
      this.naturalWidth = mockNaturalWidth;
      this.naturalHeight = mockNaturalHeight;
      this.onload?.();
    });
  }
}

interface ToBlobCall {
  type: string;
  quality: number;
  canvasWidth: number;
  canvasHeight: number;
}

interface DrawImageCall {
  width: number;
  height: number;
}

let toBlobCalls: ToBlobCall[] = [];
let drawImageCalls: DrawImageCall[] = [];
let revokedUrls: string[] = [];

function makeMockCanvas() {
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({
      drawImage: vi.fn((_img: unknown, _x: number, _y: number, w: number, h: number) => {
        drawImageCalls.push({ width: w, height: h });
      }),
    })),
    toBlob: vi.fn((cb: (blob: Blob | null) => void, type: string, quality: number) => {
      toBlobCalls.push({ type, quality, canvasWidth: canvas.width, canvasHeight: canvas.height });
      cb(new Blob([], { type }));
    }),
  };
  return canvas;
}

beforeEach(() => {
  mockNaturalWidth = 800;
  mockNaturalHeight = 600;
  mockImageShouldError = false;
  toBlobCalls = [];
  drawImageCalls = [];
  revokedUrls = [];

  vi.stubGlobal('Image', MockImage);
  vi.stubGlobal('document', {
    createElement: vi.fn((tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected document.createElement("${tag}")`);
      return makeMockCanvas();
    }),
  });
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:mock-url'),
    revokeObjectURL: vi.fn((url: string) => {
      revokedUrls.push(url);
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeFile(name = 'photo.jpg'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });
}

describe('resizeToWebp', () => {
  it('produces two WebP blobs', async () => {
    const { full, thumb } = await resizeToWebp(makeFile());
    expect(full.type).toBe('image/webp');
    expect(thumb.type).toBe('image/webp');
  });

  it('honours the long-edge caps and preserves aspect ratio for a portrait source', async () => {
    // 1200x3000 portrait: long edge is the 3000 height.
    mockNaturalWidth = 1200;
    mockNaturalHeight = 3000;

    await resizeToWebp(makeFile());

    expect(toBlobCalls).toHaveLength(2);
    const [full, thumb] = toBlobCalls;

    // full: 1600 long edge, scale = 1600/3000
    expect(full.canvasWidth).toBe(640);
    expect(full.canvasHeight).toBe(1600);
    expect(full.quality).toBeCloseTo(0.82);
    expect(full.type).toBe('image/webp');

    // thumb: 400 long edge, scale = 400/3000
    expect(thumb.canvasWidth).toBe(160);
    expect(thumb.canvasHeight).toBe(400);
    expect(thumb.quality).toBeCloseTo(0.7);
    expect(thumb.type).toBe('image/webp');

    // drawImage was asked to draw at the same target size as the canvas.
    expect(drawImageCalls).toEqual([
      { width: 640, height: 1600 },
      { width: 160, height: 400 },
    ]);
  });

  it('does not upscale a source smaller than both caps', async () => {
    mockNaturalWidth = 200;
    mockNaturalHeight = 150;

    await resizeToWebp(makeFile());

    const [full, thumb] = toBlobCalls;
    expect(full.canvasWidth).toBe(200);
    expect(full.canvasHeight).toBe(150);
    expect(thumb.canvasWidth).toBe(200);
    expect(thumb.canvasHeight).toBe(150);
  });

  it('rejects with a typed error when the image cannot be decoded (e.g. HEIC), and resolves nothing', async () => {
    mockImageShouldError = true;

    await expect(resizeToWebp(makeFile('photo.heic'))).rejects.toBeInstanceOf(PhotoDecodeError);
    // The canvas boundary was never reached — nothing was encoded either.
    expect(toBlobCalls).toHaveLength(0);
  });

  // A 0×0 "successful" decode (truncated file, an SVG with no intrinsic size)
  // would otherwise draw a blank canvas and upload a blank photo as if all were
  // well — the silent-blank outcome the spec forbids.
  it('rejects a decode that succeeded with no pixels, instead of uploading a blank', async () => {
    mockNaturalWidth = 0;
    mockNaturalHeight = 0;

    await expect(resizeToWebp(makeFile('truncated.jpg'))).rejects.toBeInstanceOf(PhotoDecodeError);
    expect(toBlobCalls).toHaveLength(0);
  });

  it('rejects when only one dimension decodes to zero', async () => {
    mockNaturalWidth = 800;
    mockNaturalHeight = 0;

    await expect(resizeToWebp(makeFile('degenerate.jpg'))).rejects.toBeInstanceOf(PhotoDecodeError);
    expect(toBlobCalls).toHaveLength(0);
  });

  it('revokes the object URL after both success and decode failure', async () => {
    await resizeToWebp(makeFile());
    expect(revokedUrls).toEqual(['blob:mock-url']);

    revokedUrls = [];
    mockImageShouldError = true;
    await expect(resizeToWebp(makeFile('photo.heic'))).rejects.toThrow();
    expect(revokedUrls).toEqual(['blob:mock-url']);
  });
});
