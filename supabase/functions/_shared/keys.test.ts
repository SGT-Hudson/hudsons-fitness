import { describe, expect, it } from 'vitest';
import {
  isServerCall,
  keyMapValues,
  publishableKey,
  secretKey,
  timingSafeEqual,
  unauthorized,
  type EnvGet,
} from './keys.ts';

// Fake values only — shaped like the real ones, never real keys.
const SECRET = 'sb_secret_defaultFAKEdefaultFAKE00';
const SECRET_OPS = 'sb_secret_opsFAKEopsFAKEopsFAKE000';
const LEGACY_SERVICE = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.legacySig';
const LEGACY_ANON = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.anonSig';
const PUBLISHABLE = 'sb_publishable_FAKEpublishableFAKE0';
const USER_JWT = 'eyJhbGciOiJFUzI1NiJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.userSig';

function envOf(vars: Record<string, string>): EnvGet {
  return (name) => vars[name];
}

const fullEnv = envOf({
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: SECRET, ops: SECRET_OPS }),
  SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE,
  SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUBLISHABLE }),
  SUPABASE_ANON_KEY: LEGACY_ANON,
});

function req(headers: Record<string, string>): Request {
  return new Request('https://example.test/functions/v1/cron-healthcheck', {
    method: 'POST',
    headers,
  });
}

describe('keyMapValues', () => {
  it('returns the values of the JSON map', () => {
    expect(keyMapValues(JSON.stringify({ default: SECRET, ops: SECRET_OPS }))).toEqual([
      SECRET,
      SECRET_OPS,
    ]);
  });

  it('is empty when unset, malformed, not an object or holding no strings', () => {
    expect(keyMapValues(undefined)).toEqual([]);
    expect(keyMapValues('')).toEqual([]);
    expect(keyMapValues('{not json')).toEqual([]);
    expect(keyMapValues(JSON.stringify([SECRET]))).toEqual([]);
    expect(keyMapValues(JSON.stringify(SECRET))).toEqual([]);
    expect(keyMapValues(JSON.stringify({ default: '', other: 42 }))).toEqual([]);
  });
});

describe('secretKey / publishableKey', () => {
  it('prefers the "default" entry of the new map over the legacy variable', () => {
    expect(secretKey(fullEnv)).toBe(SECRET);
    expect(publishableKey(fullEnv)).toBe(PUBLISHABLE);
  });

  it('picks "default" even when it is not the first entry', () => {
    const env = envOf({ SUPABASE_SECRET_KEYS: JSON.stringify({ ops: SECRET_OPS, default: SECRET }) });
    expect(secretKey(env)).toBe(SECRET);
  });

  it('falls back to the only named key when there is no "default"', () => {
    const env = envOf({ SUPABASE_SECRET_KEYS: JSON.stringify({ ops: SECRET_OPS }) });
    expect(secretKey(env)).toBe(SECRET_OPS);
  });

  it('falls back to the legacy variable when the map is missing or malformed', () => {
    expect(secretKey(envOf({ SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE }))).toBe(LEGACY_SERVICE);
    expect(
      secretKey(envOf({ SUPABASE_SECRET_KEYS: '{oops', SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE })),
    ).toBe(LEGACY_SERVICE);
    expect(publishableKey(envOf({ SUPABASE_ANON_KEY: LEGACY_ANON }))).toBe(LEGACY_ANON);
  });

  it('is undefined when nothing is configured', () => {
    expect(secretKey(envOf({}))).toBeUndefined();
    expect(secretKey(envOf({ SUPABASE_SERVICE_ROLE_KEY: '' }))).toBeUndefined();
    expect(publishableKey(envOf({}))).toBeUndefined();
  });
});

describe('timingSafeEqual', () => {
  it('matches equal strings only', () => {
    expect(timingSafeEqual(SECRET, SECRET)).toBe(true);
    expect(timingSafeEqual(SECRET, SECRET.slice(0, -1) + 'X')).toBe(false);
  });

  it('rejects a prefix and an extension of the key', () => {
    expect(timingSafeEqual(SECRET.slice(0, 12), SECRET)).toBe(false);
    expect(timingSafeEqual(SECRET, SECRET + 'X')).toBe(false);
    expect(timingSafeEqual('', SECRET)).toBe(false);
  });
});

describe('isServerCall (cron gate)', () => {
  it('accepts the secret key on the apikey header (how pg_cron sends it)', () => {
    expect(isServerCall(req({ apikey: SECRET }), fullEnv)).toBe(true);
  });

  it('accepts any named secret key, not only "default"', () => {
    expect(isServerCall(req({ apikey: SECRET_OPS }), fullEnv)).toBe(true);
  });

  it('accepts the secret key as a Bearer token, case-insensitively', () => {
    expect(isServerCall(req({ Authorization: `Bearer ${SECRET}` }), fullEnv)).toBe(true);
    expect(isServerCall(req({ Authorization: `bearer ${SECRET}` }), fullEnv)).toBe(true);
  });

  it('accepts the legacy service_role key while it is configured (transition)', () => {
    expect(isServerCall(req({ Authorization: `Bearer ${LEGACY_SERVICE}` }), fullEnv)).toBe(true);
    expect(isServerCall(req({ apikey: LEGACY_SERVICE }), fullEnv)).toBe(true);
  });

  it('rejects a request with no credentials', () => {
    expect(isServerCall(req({}), fullEnv)).toBe(false);
  });

  it("rejects a signed-in user's JWT and the public keys", () => {
    expect(isServerCall(req({ Authorization: `Bearer ${USER_JWT}` }), fullEnv)).toBe(false);
    expect(
      isServerCall(req({ apikey: PUBLISHABLE, Authorization: `Bearer ${USER_JWT}` }), fullEnv),
    ).toBe(false);
    expect(isServerCall(req({ apikey: LEGACY_ANON }), fullEnv)).toBe(false);
    expect(isServerCall(req({ Authorization: `Bearer ${LEGACY_ANON}` }), fullEnv)).toBe(false);
  });

  it('rejects a near-miss of the secret key', () => {
    expect(isServerCall(req({ apikey: SECRET.slice(0, -1) }), fullEnv)).toBe(false);
    expect(isServerCall(req({ apikey: SECRET + 'X' }), fullEnv)).toBe(false);
    expect(isServerCall(req({ Authorization: SECRET }), fullEnv)).toBe(false); // no "Bearer "
  });

  it('fails closed when no key is configured, even for empty credentials', () => {
    const empty = envOf({ SUPABASE_SECRET_KEYS: '', SUPABASE_SERVICE_ROLE_KEY: '' });
    expect(isServerCall(req({ apikey: '' }), empty)).toBe(false);
    expect(isServerCall(req({ Authorization: 'Bearer ' }), empty)).toBe(false);
    expect(isServerCall(req({ apikey: SECRET }), envOf({}))).toBe(false);
  });
});

describe('unauthorized', () => {
  it('is a JSON 401', async () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });
});
