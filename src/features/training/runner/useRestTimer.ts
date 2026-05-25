import { useEffect, useRef, useState } from 'react';
import { computeTimerView, type TimerView } from '@/core/runner';

export interface RestTimerView extends TimerView {
  running: boolean;
}

const IDLE: RestTimerView = {
  running: false,
  isCountUp: false,
  elapsedSeconds: 0,
  remainingSeconds: 0,
  overSeconds: 0,
  done: false,
};

/**
 * Ticks every 250ms while a rest is running, deriving the view from the start
 * timestamp + target via the pure `computeTimerView` (spec §3.3 — wall-clock
 * math survives background throttling). Calls `onDone` exactly once when a
 * targeted countdown first reaches zero.
 */
export function useRestTimer(
  startedAtMs: number | null,
  targetSeconds: number | null,
  onDone?: () => void,
): RestTimerView {
  const [, force] = useState(0);
  const firedFor = useRef<number | null>(null);

  useEffect(() => {
    if (startedAtMs == null) return;
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [startedAtMs, targetSeconds]);

  if (startedAtMs == null) return IDLE;

  const view = computeTimerView(startedAtMs, targetSeconds, Date.now());

  if (view.done && targetSeconds != null && firedFor.current !== startedAtMs) {
    firedFor.current = startedAtMs;
    onDone?.();
  }

  return { ...view, running: true };
}
