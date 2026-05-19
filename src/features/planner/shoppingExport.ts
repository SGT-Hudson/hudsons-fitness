// Pure helpers for the manual extras list + plain-text export of the
// shopping list. Dependency-free + deterministic → unit-tested (R-16
// Tier-1). The component owns localStorage + the Web Share / clipboard I/O.

export interface ExtraItem {
  id: string;
  name: string;
}

/**
 * Append a free-text extra. Trims; ignores blank input and
 * case-insensitive duplicates (returns the list unchanged). `id` is supplied
 * by the caller (kept pure/testable — no crypto here).
 */
export function appendExtra(
  list: ExtraItem[],
  rawName: string,
  id: string,
): ExtraItem[] {
  const name = rawName.trim();
  if (name === '') return list;
  const dup = list.some((e) => e.name.toLowerCase() === name.toLowerCase());
  if (dup) return list;
  return [...list, { id, name }];
}

export interface FormatShoppingListInput {
  title: string;
  items: Array<{
    name: string;
    brand?: string | null;
    totalQuantity: number;
    unitType: string;
  }>;
  extras: ExtraItem[];
  extrasTitle: string;
  unitWord: string;
}

/** Plain-text rendering for Web Share / clipboard export. */
export function formatShoppingListText(
  input: FormatShoppingListInput,
): string {
  const { title, items, extras, extrasTitle, unitWord } = input;
  const lines: string[] = [title];

  for (const item of items) {
    const suffix = item.unitType === 'unit' ? ` ${unitWord}` : ' g';
    const brand = item.brand ? ` · ${item.brand}` : '';
    lines.push(`- ${item.name}${brand} — ${item.totalQuantity}${suffix}`);
  }

  if (extras.length > 0) {
    lines.push('', extrasTitle);
    for (const e of extras) lines.push(`- ${e.name}`);
  }

  return lines.join('\n');
}
