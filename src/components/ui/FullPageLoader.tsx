/**
 * The whole-screen holding state, shown while something the app cannot render
 * without is still unknown: the session, the profile, or (in
 * `ProfileLanguageSync`) which language to render in. Deliberately wordless —
 * it is the one thing on screen that must not need translating, since one of
 * its callers is waiting for exactly that.
 */
export function FullPageLoader() {
  return <div className="p-8 text-muted-foreground">…</div>;
}
