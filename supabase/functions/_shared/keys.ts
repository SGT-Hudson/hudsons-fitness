// Supabase API keys for the edge functions, and the auth gate of the cron
// functions. Runs under Deno (edge) and Node (vitest): web-standard APIs only.
//
// Keys: Supabase injects the new keys as JSON maps keyed by key name
// (`SUPABASE_SECRET_KEYS`, `SUPABASE_PUBLISHABLE_KEYS`, e.g.
// `{"default":"sb_secret_..."}`) next to the legacy single-value
// `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY`, which retire with the
// legacy JWT keys. The new map is read first; the legacy variable is only a
// fallback.
//
// Cron gate: a `sb_secret_` key is not a JWT, so the gateway's `verify_jwt`
// cannot check it. The cron functions are deployed with `verify_jwt = false`
// (supabase/config.toml) and call `isServerCall` before doing anything: the
// request must carry one of the project's secret keys, on the `apikey` header
// (how `private.invoke_edge_function` sends it) or as a Bearer token. Without
// this check a `verify_jwt = false` function is public.

export type EnvGet = (name: string) => string | undefined;

/** Values of a `SUPABASE_*_KEYS` JSON map; [] when unset or malformed. */
export function keyMapValues(raw: string | undefined): string[] {
  return Object.values(parseKeyMap(raw));
}

function parseKeyMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.length > 0) out[name] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function pickKey(env: EnvGet, mapVar: string, legacyVar: string): string | undefined {
  const map = parseKeyMap(env(mapVar));
  return map['default'] ?? Object.values(map)[0] ?? (env(legacyVar) || undefined);
}

/** The secret key for admin (RLS-bypassing) clients. */
export function secretKey(env: EnvGet): string | undefined {
  return pickKey(env, 'SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
}

/** The publishable key for user-scoped clients. */
export function publishableKey(env: EnvGet): string | undefined {
  return pickKey(env, 'SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
}

/** Constant-time string equality (the time depends only on the lengths). */
export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/**
 * True when the request carries one of the project's secret keys: any value of
 * `SUPABASE_SECRET_KEYS`, or the legacy `SUPABASE_SERVICE_ROLE_KEY` while the
 * legacy keys are still enabled. Fails closed when no key is configured.
 */
export function isServerCall(req: Request, env: EnvGet): boolean {
  const accepted = [
    ...keyMapValues(env('SUPABASE_SECRET_KEYS')),
    env('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  ].filter((k) => k.length > 0);
  const auth = req.headers.get('Authorization') ?? '';
  const bearer = /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, '').trim() : '';
  const presented = [req.headers.get('apikey') ?? '', bearer].filter((k) => k.length > 0);
  let ok = false;
  // No early exit: every pair is compared, so timing does not reveal which matched.
  for (const p of presented) {
    for (const a of accepted) {
      if (timingSafeEqual(p, a)) ok = true;
    }
  }
  return ok;
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
