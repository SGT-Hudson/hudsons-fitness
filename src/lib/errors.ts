// One module decides what an error *means*. Nothing else in the app inspects
// error codes: consumers ask for a kind, or for the i18n key of a kind. The
// map grows by adding a code here — no consumer changes.
//
// Defensive by design: PostgREST rejects with a plain `{ code, message }`
// object, not an Error instance, so neither `instanceof Error` nor a bare
// property read is safe on its own.

export type ErrorKind =
  | 'notFound' // PGRST116 — .single() matched no rows
  | 'denied' // 42501 — RLS refused
  | 'duplicate' // 23505 — unique violation
  | 'offline' // fetch never reached the server
  | 'staleSchema' // PostgREST schema cache disagrees with the deployed frontend
  | 'unknown';

const CODE_KINDS: Record<string, ErrorKind> = {
  PGRST116: 'notFound',
  '42501': 'denied',
  '23505': 'duplicate',
  PGRST200: 'staleSchema',
  PGRST202: 'staleSchema',
  PGRST205: 'staleSchema',
};

function errorCode(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' && code ? code : null;
}

export function classifyError(err: unknown): ErrorKind {
  const code = errorCode(err);
  if (code) return CODE_KINDS[code] ?? 'unknown';
  // A request that never reached the server rejects with a TypeError and no
  // code — that is the browser's offline/DNS/CORS signal.
  if (err instanceof TypeError) return 'offline';
  return 'unknown';
}

/**
 * The single place a kind becomes copy, so no call site invents its own
 * wording. Returns an `ns:key` string, usable both from the i18n singleton in
 * `.ts` modules and from a namespaced `t` in components (an explicit prefix
 * wins over the hook's namespace).
 */
export function errorMessageKey(kind: ErrorKind): string {
  // `errors.generic` predates this module and is already used elsewhere; the
  // unknown kind reuses it rather than introducing a second generic string.
  return kind === 'unknown' ? 'common:errors.generic' : `common:errors.${kind}`;
}
