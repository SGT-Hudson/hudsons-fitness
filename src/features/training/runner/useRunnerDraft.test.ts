// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadDraft, saveDraft, clearDraft, DRAFT_KEY,
  loadExtras, saveExtras, EXTRAS_KEY, type RunnerExtras,
} from './useRunnerDraft';
import type { RunnerState } from '@/core/runner';

const state = { routineName: 'Push Day', exercises: [], savedAtMs: 123 } as unknown as RunnerState;

const extras: RunnerExtras = {
  curl: {
    name: 'Biceps Curl',
    lastTime: '10 × 14 kg',
    coach: {
      exerciseId: 'curl', primaryMuscles: ['biceps'], equipment: null,
      defaultIncrementKg: 1.25, history: [], todayISO: '2026-07-26',
    },
  },
};

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

describe('added-exercise extras persistence (R-46)', () => {
  beforeEach(() => localStorage.clear());

  it('returns {} when nothing is stored', () => {
    expect(loadExtras()).toEqual({});
  });

  it('round-trips saved extras', () => {
    saveExtras(extras);
    expect(loadExtras()).toEqual(extras);
  });

  it('returns {} on corrupt JSON', () => {
    localStorage.setItem(EXTRAS_KEY, '{not json');
    expect(loadExtras()).toEqual({});
  });

  it('clearDraft also clears extras — a stale map must not leak into the next workout', () => {
    saveDraft(state);
    saveExtras(extras);
    clearDraft();
    expect(loadDraft()).toBeNull();
    expect(loadExtras()).toEqual({});
    expect(localStorage.getItem(EXTRAS_KEY)).toBeNull();
  });
});
