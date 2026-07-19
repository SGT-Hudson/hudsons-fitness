// Characterizes the one place in the app that decides what an error *means*.
// The malformed-input cases are the point: a classifier that throws turns a
// handled error into a blank screen.
import { describe, it, expect } from 'vitest';
import { classifyError, errorMessageKey } from './errors';

describe('classifyError', () => {
  it('reads PGRST116 (no rows from .single()) as notFound', () => {
    expect(classifyError({ code: 'PGRST116', message: 'JSON object requested' })).toBe('notFound');
  });

  it('reads 42501 (RLS refused) as denied', () => {
    expect(classifyError({ code: '42501', message: 'permission denied' })).toBe('denied');
  });

  it('reads 23505 (unique violation) as duplicate', () => {
    expect(classifyError({ code: '23505', message: 'duplicate key value' })).toBe('duplicate');
  });

  it.each(['PGRST200', 'PGRST202', 'PGRST205'])('reads %s as staleSchema', (code) => {
    expect(classifyError({ code })).toBe('staleSchema');
  });

  it('reads a bare TypeError (fetch never reached the server) as offline', () => {
    expect(classifyError(new TypeError('Failed to fetch'))).toBe('offline');
  });

  it('falls back to unknown for an unrecognised code', () => {
    expect(classifyError({ code: 'PGRST999' })).toBe('unknown');
  });

  it('falls back to unknown for an Error carrying a message but no code', () => {
    expect(classifyError(new Error('boom'))).toBe('unknown');
  });

  it.each([[null], [undefined], ['a thrown string'], [42], [{}], [{ code: '' }], [{ code: 7 }]])(
    'never throws on malformed input: %s',
    (input) => {
      expect(classifyError(input)).toBe('unknown');
    },
  );
});

describe('errorMessageKey', () => {
  it('maps each kind to its own common-namespace key', () => {
    expect(errorMessageKey('notFound')).toBe('common:errors.notFound');
    expect(errorMessageKey('denied')).toBe('common:errors.denied');
    expect(errorMessageKey('duplicate')).toBe('common:errors.duplicate');
    expect(errorMessageKey('offline')).toBe('common:errors.offline');
    expect(errorMessageKey('staleSchema')).toBe('common:errors.staleSchema');
  });

  it('maps unknown to the pre-existing generic key rather than a new one', () => {
    expect(errorMessageKey('unknown')).toBe('common:errors.generic');
  });
});
