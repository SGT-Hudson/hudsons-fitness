// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRestTimer } from './useRestTimer';

describe('useRestTimer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns idle view when no rest is running', () => {
    const { result } = renderHook(() => useRestTimer(null, 90));
    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.running).toBe(false);
  });

  it('counts down from a start timestamp and fires onDone once at zero', () => {
    const onDone = vi.fn();
    const start = Date.now();
    const { result } = renderHook(() => useRestTimer(start, 2, onDone));
    expect(result.current.remainingSeconds).toBe(2);
    act(() => { vi.advanceTimersByTime(2100); });
    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.done).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onDone).toHaveBeenCalledTimes(1); // not re-fired
  });
});
