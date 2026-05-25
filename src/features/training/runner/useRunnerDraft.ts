import { useEffect } from 'react';
import type { RunnerState } from '@/core/runner';

export const DRAFT_KEY = 'hf:runner:draft:v1';

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

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/** Mirror the live runner state to localStorage on every change (spec §3.2). */
export function useRunnerDraftMirror(state: RunnerState | null): void {
  useEffect(() => {
    if (state) saveDraft(state);
  }, [state]);
}
