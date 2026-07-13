// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { useBarcodeCamera, type BarcodeCamera } from './useBarcodeCamera';

/**
 * The camera LIFECYCLE, which jsdom can absolutely test (it is plain promise
 * interleaving — no pixels, no CSS, no device). What it cannot test is on-device
 * behaviour: that the phone's light physically goes out is Task 7's job.
 *
 * The bug these tests exist to kill: a leaked `MediaStreamTrack`. Before the
 * fix, the "was I stopped?" flag and the stream slot were component-level refs
 * that every effect run reset/overwrote, so an in-flight `getUserMedia` from a
 * torn-down run could clobber the slot — and the orphaned stream was never
 * stopped. Nothing in the suite noticed: the two callers mock the hook and the
 * component. Deleting the track-stopping line kept all 19 tests green. Hence
 * these: they call the REAL hook against a fake `getUserMedia` whose tracks
 * carry a `stop` spy, and assert the tracks actually die.
 */

// A checksum-valid EAN-13 (isValidEan gates every decode).
const VALID_EAN = '5000112637922';

interface FakeStream {
  stream: MediaStream;
  stop: ReturnType<typeof vi.fn>;
}

function makeFakeStream(): FakeStream {
  const stop = vi.fn();
  const track = {
    kind: 'video',
    stop,
    getCapabilities: () => ({}),
  } as unknown as MediaStreamTrack;
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  return { stream, stop };
}

/** A `getUserMedia` we resolve by hand — the whole point is the in-flight window. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let getUserMedia: ReturnType<typeof vi.fn>;
let detect: ReturnType<typeof vi.fn>;

// The hook's last return value, so a test can drive `restart()`.
let api: BarcodeCamera | null = null;

function Harness() {
  api = useBarcodeCamera(onDetected);
  return <video ref={api.videoRef} data-testid="video" />;
}

let onDetected: ReturnType<typeof vi.fn>;

beforeEach(() => {
  api = null;
  onDetected = vi.fn();
  getUserMedia = vi.fn();
  // Frames decode to nothing unless a test says otherwise; the rAF loop just spins.
  detect = vi.fn().mockResolvedValue([]);

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
    writable: true,
  });
  // Take the native-BarcodeDetector branch: deterministic, and it keeps the lazy
  // `@zxing/browser` import (the iOS path) out of jsdom entirely.
  vi.stubGlobal(
    'BarcodeDetector',
    class {
      detect = detect;
    },
  );
  // jsdom does not implement media playback.
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useBarcodeCamera — the camera is always released', () => {
  it('stops every track on unmount (navigate away, close, Escape, back)', async () => {
    const first = makeFakeStream();
    getUserMedia.mockResolvedValue(first.stream);

    const { unmount } = render(<Harness />);
    await waitFor(() => expect(api?.status).toBe('scanning'));
    expect(first.stop).not.toHaveBeenCalled();

    unmount();

    expect(first.stop).toHaveBeenCalledTimes(1);
  });

  it('releases a getUserMedia that resolves AFTER its effect run was torn down', async () => {
    const late = makeFakeStream();
    const pending = deferred<MediaStream>();
    getUserMedia.mockReturnValue(pending.promise);

    const { unmount } = render(<Harness />);
    // Still `starting`: the permission prompt is up, the promise has not settled.
    expect(api?.status).toBe('starting');

    unmount();
    // The user grants only now — the browser hands a live stream to a dead run.
    await act(async () => {
      pending.resolve(late.stream);
      await pending.promise;
    });

    expect(late.stop).toHaveBeenCalledTimes(1);
  });

  it('restart() while getUserMedia is in flight leaks nothing: the orphan dies, the new stream lives', async () => {
    // The production repro: the permission prompt is still up (stream A pending)
    // when the user takes the manual hatch, gets a not-found, taps "escanear
    // otro" → restart() → a SECOND getUserMedia. Then they grant. Two live
    // streams; before the fix, A was orphaned forever and the light stayed on.
    const a = makeFakeStream();
    const b = makeFakeStream();
    const pendingA = deferred<MediaStream>();
    const pendingB = deferred<MediaStream>();
    getUserMedia
      .mockReturnValueOnce(pendingA.promise)
      .mockReturnValueOnce(pendingB.promise);

    const { unmount } = render(<Harness />);
    expect(api?.status).toBe('starting');

    // restart() tears run A down and opens the camera again.
    await act(async () => {
      api!.restart();
    });
    expect(getUserMedia).toHaveBeenCalledTimes(2);

    // Now BOTH promises settle. A belongs to the dead run: it must be released.
    await act(async () => {
      pendingA.resolve(a.stream);
      pendingB.resolve(b.stream);
      await Promise.all([pendingA.promise, pendingB.promise]);
    });

    expect(a.stop).toHaveBeenCalledTimes(1); // the orphan is released
    await waitFor(() => expect(api?.status).toBe('scanning'));
    expect(b.stop).not.toHaveBeenCalled(); // the live one is still filming

    unmount();
    expect(b.stop).toHaveBeenCalledTimes(1);
  });

  it('stops the camera on a decode, before handing the code to the caller', async () => {
    const first = makeFakeStream();
    getUserMedia.mockResolvedValue(first.stream);
    detect.mockResolvedValue([{ rawValue: VALID_EAN }]);

    render(<Harness />);

    await waitFor(() => expect(onDetected).toHaveBeenCalledWith(VALID_EAN));
    // The found/not-found panel sits over a DEAD feed — the track is already gone.
    expect(first.stop).toHaveBeenCalledTimes(1);
  });
});
