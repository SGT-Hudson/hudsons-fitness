import { findMatchRange } from '@/lib/highlightMatch';
import { cn } from '@/lib/utils';

interface Props {
  /** The string as it should read — already display-resolved (e.g. `ingredientDisplayName`). */
  text: string;
  /** What the user typed. Blank, or no match, renders `text` untouched. */
  query: string;
  /** Extra classes for the `<mark>` (the surrounding text is never wrapped). */
  className?: string;
}

/**
 * The canvas's `HiName`, once: a search result with the matched substring
 * wrapped in an accent-tinted `<mark>`.
 *
 * Matching is accent- and case-insensitive but the highlight lands on the
 * original characters — see `findMatchRange`, which owns that offset bookkeeping
 * (and the reason the query never becomes a `RegExp`).
 *
 * `<mark>` carries the semantics for free (a screen reader can announce the
 * marked run), so the tint is not the only signal. Tailwind's preflight leaves
 * the UA's yellow background in place, hence the explicit `bg-*`/`text-*`.
 */
export function HighlightedText({ text, query, className }: Props) {
  const range = findMatchRange(text, query);
  if (range === null) return <>{text}</>;

  return (
    <>
      {text.slice(0, range.start)}
      <mark
        className={cn('rounded-[3px] bg-accent-soft px-[1px] text-accent-ink', className)}
      >
        {text.slice(range.start, range.end)}
      </mark>
      {text.slice(range.end)}
    </>
  );
}
