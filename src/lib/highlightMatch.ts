// The search-result match finder behind `<HighlightedText>` (R-33 wave 6 — the
// canvas's `HiName`, which it repeats in three artboards).
//
// Two things it deliberately does NOT do:
//
//   • It never builds a `RegExp` from the query. `new RegExp(query)` throws on
//     an unbalanced "(" and matches wildly on "." or "*" — and a food name like
//     "Aceite (virgen extra)" makes that a normal thing to type.
//   • It never highlights on the *folded* string. Matching has to be accent- and
//     case-insensitive ("jamon" must find "Jamón"), but the highlight has to
//     wrap the ORIGINAL characters, so the offsets must survive the fold. NFD +
//     stripping the combining marks happens to be length-preserving for Latin
//     accents, but `toLowerCase()` is not in general (İ → i̇), so nothing here
//     leans on that: the fold is applied per code point and each folded unit
//     records the original slice it came from.

import { foldText, normalizeText } from '@/features/recipes/recipeFilter';

/** Offsets into the ORIGINAL string — `text.slice(start, end)` is the match. */
export interface MatchRange {
  start: number;
  end: number;
}

/**
 * The first occurrence of `query` inside `text`, compared with the same
 * normalisation the filters use (lowercase, accent-insensitive), reported as
 * offsets into the original `text`.
 *
 * Returns `null` when the query is blank or nothing matches.
 */
export function findMatchRange(text: string, query: string): MatchRange | null {
  const q = normalizeText(query);
  if (q === '') return null;

  let folded = '';
  // starts[i] / ends[i] = the slice of `text` that folded unit i came from.
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;

  // Iterating the string yields code points, so a surrogate pair is never split.
  for (const ch of text) {
    const f = foldText(ch);
    for (let k = 0; k < f.length; k += 1) {
      starts.push(offset);
      ends.push(offset + ch.length);
    }
    folded += f;
    offset += ch.length;
  }

  const i = folded.indexOf(q);
  if (i < 0) return null;

  return { start: starts[i], end: ends[i + q.length - 1] };
}
