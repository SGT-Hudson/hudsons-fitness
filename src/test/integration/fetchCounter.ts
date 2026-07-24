// Counts HTTP requests issued during a test case. A registry case that
// completes without issuing one is not exercising a select string at all —
// it short-circuited (e.g. an empty id array returns early). Such a case
// would sit in the suite as a permanently green test that proves nothing,
// so the runner fails it. Installed from the setup file, before any test
// module imports `@/lib/supabase`, so supabase-js captures the wrapper.
let count = 0;

export function installFetchCounter(): void {
  const original = globalThis.fetch;
  globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
    count += 1;
    return original(...args);
  }) as typeof fetch;
}

export function resetFetchCount(): void {
  count = 0;
}

export function fetchCount(): number {
  return count;
}
