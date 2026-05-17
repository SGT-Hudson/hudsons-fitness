// Shared pure date/TZ core (D-F3 / R-17).
//
// The cross-runtime date logic: timezone-aware day-boundary helpers used by
// BOTH the client and the Deno edge functions. Dependency-free — only the
// standard `Date` and `Intl` globals (NO `date-fns`, which is a browser-only
// client dependency Deno cannot import). The `date-fns`-based client helpers
// (`formatDate`/`isoDate`/`mondayOf`/`daysBetween`) stay in `src/lib/dates.ts`
// because they are client-only and not part of the edge duplication this core
// removes.
//
// Import paths: client via `@/core/dates`; edge via a relative path from
// `supabase/functions/_shared/`. No transpile/codegen.

/** Date in a given IANA timezone, formatted YYYY-MM-DD. */
export function isoDateInTZ(date: Date, tz = 'Europe/Madrid'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** The calendar day before "today" in `tz`, as YYYY-MM-DD. */
export function previousDayInTZ(tz = 'Europe/Madrid'): string {
  const today = isoDateInTZ(new Date(), tz);
  const [y, m, d] = today.split('-').map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d) - 86_400_000);
  return yesterday.toISOString().slice(0, 10);
}

/** The Monday (ISO weekday) of the week containing "today" in `tz`. */
export function mondayOfTodayInTZ(tz = 'Europe/Madrid'): string {
  const today = isoDateInTZ(new Date(), tz);
  const [y, m, d] = today.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dow = utc.getUTCDay(); // 0 Sun..6 Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(Date.UTC(y, m - 1, d + diff));
  return monday.toISOString().slice(0, 10);
}
