// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadDraft, saveDraft, clearDraft, DRAFT_KEY } from './useRunnerDraft';
import type { RunnerState } from '@/core/runner';

const state = { routineName: 'Push Day', exercises: [], savedAtMs: 123 } as unknown as RunnerState;

describe('runner draft persistence', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when no draft is stored', () => {
    expect(loadDraft()).toBeNull();
  });

  it('round-trips a saved draft', () => {
    saveDraft(state);
    expect(loadDraft()).toEqual(state);
  });

  it('clearDraft removes it', () => {
    saveDraft(state);
    clearDraft();
    expect(loadDraft()).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('returns null on corrupt JSON', () => {
    localStorage.setItem(DRAFT_KEY, '{not json');
    expect(loadDraft()).toBeNull();
  });
});
