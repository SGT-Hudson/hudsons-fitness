import { describe, it, expect } from 'vitest';
import { LIBRARY_ANON_OWNER_ID, isLibraryAnonOwner } from './library';

// Direct coverage of the shared library-model constants (R-01). Pins the
// sentinel UUID value so a future accidental edit cannot silently change
// what every call site means by "anonymized creator." If this test fails
// because someone changed the literal, that's a deliberate review decision
// (the value lives in a migration too — both must move together).

describe('LIBRARY_ANON_OWNER_ID', () => {
  it('is the exact sentinel value pinned by the R-01 anon-seed migration', () => {
    expect(LIBRARY_ANON_OWNER_ID).toBe('00000000-0000-0000-0000-00000000a0a0');
  });

  it('is provably not gen_random_uuid output (RFC-4122 v4 version/variant bits unset)', () => {
    // v4 UUIDs put '4' in position 14 and one of '8'/'9'/'a'/'b' in position 19.
    // Our sentinel leaves those positions as '0' — it CANNOT be v4 output.
    expect(LIBRARY_ANON_OWNER_ID.charAt(14)).not.toBe('4');
    expect(['8', '9', 'a', 'b']).not.toContain(LIBRARY_ANON_OWNER_ID.charAt(19));
  });

  it('is distinct from the nil UUID', () => {
    expect(LIBRARY_ANON_OWNER_ID).not.toBe('00000000-0000-0000-0000-000000000000');
  });
});

describe('isLibraryAnonOwner', () => {
  it('matches the sentinel value', () => {
    expect(isLibraryAnonOwner(LIBRARY_ANON_OWNER_ID)).toBe(true);
  });

  it('returns false for null, undefined, and any other id', () => {
    expect(isLibraryAnonOwner(null)).toBe(false);
    expect(isLibraryAnonOwner(undefined)).toBe(false);
    expect(isLibraryAnonOwner('')).toBe(false);
    expect(isLibraryAnonOwner('00000000-0000-0000-0000-000000000000')).toBe(false);
    expect(isLibraryAnonOwner('11111111-1111-1111-1111-111111111111')).toBe(false);
  });
});
