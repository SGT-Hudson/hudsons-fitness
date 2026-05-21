// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMediaQuery } from './use-media-query';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
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
});
