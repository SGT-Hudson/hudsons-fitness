import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import coachEs from '@/i18n/es/coach.json';
import coachEn from '@/i18n/en/coach.json';

/**
 * The coach rules hand i18n keys to the UI as plain strings, and both consumers
 * (CoachSuggestions, ExerciseStart) resolve them inside the `coach` namespace.
 * Nothing in the type system connects the two: a key that does not exist just
 * renders as itself on screen, and every unit test still passes — which is
 * exactly what happened, an emitted `coach.rules.*` prefix that resolved to
 * `coach:coach.rules.*` and missed.
 *
 * So this reads the emitted literals out of the source rather than restating
 * them, and a rule added later is covered without anyone remembering to.
 */

const SOURCE = resolve(__dirname, 'training.ts');

function emittedHeadlineKeys(): string[] {
  const src = readFileSync(SOURCE, 'utf8');
  return [...src.matchAll(/headline: '([^']+)'/g)].map((m) => m[1]);
}

function lookup(bundle: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, bundle);
}

describe('coach headline keys resolve in the coach namespace', () => {
  const keys = emittedHeadlineKeys();

  // Denominator guard: if the regex ever stops matching, every it.each below
  // silently vanishes and the suite still goes green. Pin the floor.
  it('finds the emitted headline keys in the source', () => {
    expect(keys.length).toBeGreaterThanOrEqual(6);
  });

  it.each(keys)('resolves %s in Spanish', (key) => {
    expect(typeof lookup(coachEs, key)).toBe('string');
  });

  it.each(keys)('resolves %s in English', (key) => {
    expect(typeof lookup(coachEn, key)).toBe('string');
  });

  // The checks above walk the JSON the way i18next's default keySeparator
  // would. This one asks i18next itself, so a future nsSeparator/keySeparator
  // change cannot quietly invalidate them: a missing key returns the key back.
  it.each(keys)('%s translates to real text, not the key itself', async (key) => {
    await i18n.changeLanguage('es');
    const out = i18n.t(key, { ns: 'coach' });
    expect(out).not.toBe(key);
    expect(out.length).toBeGreaterThan(0);
  });
});
