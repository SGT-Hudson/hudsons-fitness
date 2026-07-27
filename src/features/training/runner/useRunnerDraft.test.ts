// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadDraft, saveDraft, clearDraft, DRAFT_KEY,
  loadExtras, saveExtras, EXTRAS_KEY, type RunnerExtras,
} from './useRunnerDraft';
import type { RunnerState } from '@/core/runner';

const state = { routineName: 'Push Day', exercises: [], savedAtMs: 123 } as unknown as RunnerState;

const stamp = { routineId: 'r1', startedAtMs: 1_000_000 };
const otherStamp = { routineId: 'r2', startedAtMs: 2_000_000 };

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
    expect(loadExtras(stamp)).toEqual({});
  });

  it('round-trips saved extras for the same session stamp', () => {
    saveExtras(stamp, extras);
    expect(loadExtras(stamp)).toEqual(extras);
  });

  it('refuses a different session\'s extras (stamp mismatch) — the cross-session leak this guards against', () => {
    saveExtras(stamp, extras);
    expect(loadExtras(otherStamp)).toEqual({});
  });

  it('returns {} on corrupt JSON', () => {
    localStorage.setItem(EXTRAS_KEY, '{not json');
    expect(loadExtras(stamp)).toEqual({});
  });

  it('returns {} when the stored value is the literal "null"', () => {
    // JSON.parse('null') is a real `null`, which is truthy as a raw string and
    // would otherwise be cast straight to RunnerExtras, crashing Object.entries
    // downstream in Runner's merged-maps useMemos.
    localStorage.setItem(EXTRAS_KEY, 'null');
    expect(loadExtras(stamp)).toEqual({});
  });

  it('clearDraft also clears extras — a stale map must not leak into the next workout', () => {
    saveDraft(state);
    saveExtras(stamp, extras);
    clearDraft();
    expect(loadDraft()).toBeNull();
    expect(loadExtras(stamp)).toEqual({});
    expect(localStorage.getItem(EXTRAS_KEY)).toBeNull();
  });
});
