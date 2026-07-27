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

export function loadExtras(): RunnerExtras {
  try {
    const raw = localStorage.getItem(EXTRAS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as RunnerExtras;
  } catch {
    return {};
  }
}

export function saveExtras(extras: RunnerExtras): void {
  try {
    localStorage.setItem(EXTRAS_KEY, JSON.stringify(extras));
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
export function useRunnerExtrasMirror(extras: RunnerExtras): void {
  useEffect(() => {
    saveExtras(extras);
  }, [extras]);
}
