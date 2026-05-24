// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePagination, DEFAULT_PAGE_SIZE } from './usePagination';

beforeEach(() => localStorage.clear());

describe('usePagination', () => {
  it('defaults page to 1 and pageSize to the default', () => {
    const { result } = renderHook(() => usePagination({ total: 100, resetKey: 'q' }));
    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(result.current.pageCount).toBe(10);
  });

  it('persists pageSize to localStorage and resets page to 1', () => {
    const { result } = renderHook(() => usePagination({ total: 100, resetKey: 'q' }));
    act(() => result.current.setPage(3));
    act(() => result.current.setPageSize(50));
    expect(result.current.pageSize).toBe(50);
    expect(result.current.page).toBe(1);
    expect(localStorage.getItem('hf.pageSize')).toBe('50');
  });

  it('reads a valid persisted pageSize on init, ignores invalid', () => {
    localStorage.setItem('hf.pageSize', '20');
    const { result } = renderHook(() => usePagination({ total: 100, resetKey: 'q' }));
    expect(result.current.pageSize).toBe(20);
    localStorage.setItem('hf.pageSize', '7');
    const { result: r2 } = renderHook(() => usePagination({ total: 100, resetKey: 'q' }));
    expect(r2.current.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it('resets page to 1 when resetKey changes', () => {
    const { result, rerender } = renderHook(
      ({ k }) => usePagination({ total: 100, resetKey: k }),
      { initialProps: { k: 'a' } },
    );
    act(() => result.current.setPage(4));
    expect(result.current.page).toBe(4);
    rerender({ k: 'b' });
    expect(result.current.page).toBe(1);
  });

  it('clamps page when total shrinks', () => {
    const { result, rerender } = renderHook(
      ({ total }) => usePagination({ total, resetKey: 'q' }),
      { initialProps: { total: 100 } },
    );
    act(() => result.current.setPage(9));
    rerender({ total: 12 });
    expect(result.current.page).toBe(2);
  });
});
