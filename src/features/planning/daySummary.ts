import { add, ZERO_MACROS, type Macros } from '@/core/macros';

export interface DayMacroItem {
  key: string;
  macros: Macros;
}

/** Field-wise sum of each item's macros, grouped by `key`. */
export function aggregateDayMacros(items: DayMacroItem[]): Map<string, Macros> {
  const out = new Map<string, Macros>();
  for (const { key, macros } of items) {
    out.set(key, add(out.get(key) ?? ZERO_MACROS, macros));
  }
  return out;
}
