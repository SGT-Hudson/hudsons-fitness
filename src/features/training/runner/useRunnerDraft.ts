import { useEffect } from 'react';
import type { CoachContext } from '@/core/training';
import type { RunnerState } from '@/core/runner';

export const DRAFT_KEY = 'hf:runner:draft:v1';
export const EXTRAS_KEY = 'hf:runner:extras:v1';

/** Display data for exercises added mid-workout (R-46) — they have no routine
 *  row, so `RunnerPage` can't rebuild their name/coach-context/last-time from
 *  the routine on resume. Persisted alongside the draft so a reload doesn't
 *  regress an added exercise back to its raw id. */
export type RunnerExtras = Record<string, { name: string; lastTime: string | null; coach: CoachContext }>;

/** Identifies which workout session an extras map belongs to. A single global
 *  key with no session identity would let an abandoned draft's extras leak
 *  into an unrelated later workout (possibly overwriting a routine-provided
 *  exercise's real name/history with stale data) — `routineId` alone isn't
 *  enough since the same routine can be started more than once. */
type ExtrasStamp = Pick<RunnerState, 'routineId' | 'startedAtMs'>;

interface StoredExtras extends ExtrasStamp {
  map: RunnerExtras;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadDraft(): RunnerState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RunnerState;
  } catch {
    return null;
  }
}

export function saveDraft(state: RunnerState): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode — best effort */
  }
}

/** Returns {} unless the stored extras were stamped for this exact session
 *  (same routine, same start time) — a stamp mismatch (different workout, or
 *  nothing stored) is treated the same as "no extras". Also tolerates a
 *  corrupt/unexpected stored shape (e.g. literal `"null"`), which would
 *  otherwise crash the merged-maps `useMemo`s downstream. */
export function loadExtras(stamp: ExtrasStamp): RunnerExtras {
  try {
    const raw = localStorage.getItem(EXTRAS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) return {};
    if (parsed.routineId !== stamp.routineId || parsed.startedAtMs !== stamp.startedAtMs) return {};
    return isPlainObject(parsed.map) ? (parsed.map as RunnerExtras) : {};
  } catch {
    return {};
  }
}

export function saveExtras(stamp: ExtrasStamp, extras: RunnerExtras): void {
  try {
    const stored: StoredExtras = { routineId: stamp.routineId, startedAtMs: stamp.startedAtMs, map: extras };
    localStorage.setItem(EXTRAS_KEY, JSON.stringify(stored));
  } catch {
    /* quota / private mode — best effort */
  }
}

export function clearExtras(): void {
  try {
    localStorage.removeItem(EXTRAS_KEY);
  } catch {
    /* ignore */
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
  clearExtras();
}

/** Mirror the live runner state to localStorage on every change (spec §3.2). */
export function useRunnerDraftMirror(state: RunnerState | null): void {
  useEffect(() => {
    if (state) saveDraft(state);
  }, [state]);
}

/** Mirror added-exercise display data alongside the draft — see `RunnerExtras`. */
export function useRunnerExtrasMirror(stamp: ExtrasStamp, extras: RunnerExtras): void {
  useEffect(() => {
    saveExtras(stamp, extras);
  }, [stamp, extras]);
}
