// Pure recent+frequent quick-add blend (Theme 2 / L1). No schema, no I/O:
// the caller fetches the user's recent recipe meal-logs and maps them to
// QuickAddRow[]; this picks the chip list. Deterministic (takes `now`).

export interface QuickAddRow {
  recipeId: string;
  name: string;
  kcalPerServing: number;
  loggedOn: string; // 'YYYY-MM-DD'
}

export interface QuickAddItem {
  recipeId: string;
  name: string;
  kcalPerServing: number;
}

export function isoMinusDays(now: Date, days: number): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function buildQuickAddList(
  rows: QuickAddRow[],
  opts: { now: Date; cap?: number; recentWindowDays?: number },
): QuickAddItem[] {
  const cap = opts.cap ?? 6;
  const recentWindowDays = opts.recentWindowDays ?? 14;
  if (rows.length === 0) return [];

  const cutoff = isoMinusDays(opts.now, recentWindowDays);

  // Most-recent loggedOn + frequency per recipe (over ALL rows).
  const latest = new Map<string, string>();
  const count = new Map<string, number>();
  const meta = new Map<string, QuickAddRow>();
  for (const r of rows) {
    count.set(r.recipeId, (count.get(r.recipeId) ?? 0) + 1);
    const prev = latest.get(r.recipeId);
    if (prev == null || r.loggedOn > prev) {
      latest.set(r.recipeId, r.loggedOn);
      meta.set(r.recipeId, r);
    }
  }

  const ids = [...latest.keys()];

  // 1. Recent: logged within the window, most-recent first.
  const recent = ids
    .filter((id) => (latest.get(id) as string) >= cutoff)
    .sort((a, b) => (latest.get(b) as string).localeCompare(latest.get(a) as string));

  const picked = new Set(recent);

  // 2. Backfill by frequency (count desc, then recency desc).
  const backfill = ids
    .filter((id) => !picked.has(id))
    .sort((a, b) => {
      const c = (count.get(b) ?? 0) - (count.get(a) ?? 0);
      if (c !== 0) return c;
      return (latest.get(b) as string).localeCompare(latest.get(a) as string);
    });

  return [...recent, ...backfill].slice(0, cap).map((id) => {
    // meta is co-written with latest, so the key is always present.
    const m = meta.get(id)!;
    return { recipeId: id, name: m.name, kcalPerServing: m.kcalPerServing };
  });
}
