// R-36b task 2 — client-side resize to WebP, entirely in the browser.
//
// This is what keeps the recipe cover-photo feature free: Supabase's image
// transform add-on bills per-transform ($5/1k), so instead of storing one
// original and transforming on every read, the client produces two
// pre-sized WebP blobs up front (a large "full" for the cover, a small
// "thumb" for list rows) and both get uploaded as-is.
//
// Orientation: phone photos are frequently portrait with an EXIF orientation
// tag. We deliberately do NOT read or apply that tag ourselves — decoding a
// `<img>` and drawing it to a `<canvas>` already bakes in EXIF orientation in
// every modern browser. Touching orientation here would only risk fighting
// (and breaking) that built-in behaviour.
//
// HEIC: canvas cannot decode HEIC (the format iOS Files hands over when a
// user picks straight from Photos without an on-device conversion). That
// failure surfaces as the `<img>` `onerror` event, which this module turns
// into a rejected promise with a typed error — never a resolved, blank blob.

/** Starting points only — tune by eye against real photos in the browser pass (Task 4). */
const FULL_MAX_EDGE = 1600;
const FULL_QUALITY = 0.82;
const THUMB_MAX_EDGE = 400;
const THUMB_QUALITY = 0.7;

/** Thrown when a picked file cannot be turned into pixels (e.g. raw HEIC) or re-encoded. */
export class PhotoDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoDecodeError';
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // A decode can "succeed" with no pixels — a truncated/corrupt file, or an
      // SVG with no intrinsic size. Drawing that to a canvas yields a blank
      // image and a perfectly successful upload of a blank photo, which is the
      // silent-blank outcome this module exists to make impossible. It is the
      // same class of failure as a format the browser cannot read at all, so it
      // gets the same typed rejection, before the canvas is ever touched.
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        reject(
          new PhotoDecodeError(
            `"${file.name}" decoded to an empty image (0×0) — nothing to resize`,
          ),
        );
        return;
      }
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new PhotoDecodeError(
          `could not decode "${file.name}" as an image (unsupported format, e.g. HEIC)`,
        ),
      );
    };
    img.src = url;
  });
}

/** Long-edge cap, aspect-ratio preserved, never upscaled. */
function targetDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return { width, height };
  const scale = maxEdge / longEdge;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function drawToWebp(img: HTMLImageElement, maxEdge: number, quality: number): Promise<Blob> {
  const { width, height } = targetDimensions(img.naturalWidth, img.naturalHeight, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Promise.reject(new PhotoDecodeError('canvas 2d context unavailable'));
  }
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new PhotoDecodeError('canvas failed to encode WebP'));
      },
      'image/webp',
      quality,
    );
  });
}

/**
 * Resizes a picked `File` into two WebP blobs: `full` (cover, 1600px long
 * edge) and `thumb` (list rows, 400px long edge). A source smaller than a
 * cap is left at its own size — this never upscales. Rejects with
 * `PhotoDecodeError` if the file can't be decoded (never resolves with a
 * blank blob).
 */
export async function resizeToWebp(file: File): Promise<{ full: Blob; thumb: Blob }> {
  const img = await loadImage(file);
  const [full, thumb] = await Promise.all([
    drawToWebp(img, FULL_MAX_EDGE, FULL_QUALITY),
    drawToWebp(img, THUMB_MAX_EDGE, THUMB_QUALITY),
  ]);
  return { full, thumb };
}
