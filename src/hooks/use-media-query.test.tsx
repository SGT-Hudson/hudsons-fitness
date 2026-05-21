// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMediaQuery } from './use-media-query';

const add = vi.fn();
const remove = vi.fn();

function stubMatchMedia(matches: boolean) {
  add.mockClear();
  remove.mockClear();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: add,
    removeEventListener: remove,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('useMediaQuery', () => {
  it('returns true when the query matches', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('returns false when the query does not match', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);
  });

  it('removes its change listener on unmount', () => {
    stubMatchMedia(true);
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(add).toHaveBeenCalledWith('change', expect.any(Function));
    unmount();
    expect(remove).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('re-subscribes when the query changes', () => {
    stubMatchMedia(true);
    const { rerender } = renderHook(({ q }) => useMediaQuery(q), {
      initialProps: { q: '(min-width: 768px)' },
    });
    expect(add).toHaveBeenCalledTimes(1);
    rerender({ q: '(min-width: 1024px)' });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(2);
  });
});
