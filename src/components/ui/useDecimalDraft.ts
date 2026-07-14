import { useState } from 'react';
import { parseDecimalInput } from '@/lib/number';

/**
 * The bridge for a decimal input whose value lives as a **number in the parent**
 * — the training runner's steppers, where the ± buttons and the keyboard edit
 * the same number.
 *
 * A react-hook-form field needs none of this: it holds the raw string and the
 * schema parses it once, at submit. But an input controlled by a number cannot
 * parse on every keystroke and echo the result back, because the half-typed
 * `"82,"` parses to 82, and re-rendering the field as `"82"` **eats the comma
 * the moment it is typed** — the user could never reach `82,5`. So the raw
 * keystrokes are held here as a draft string while the field is being edited,
 * and only what parses is committed upward.
 *
 * - Commits on every keystroke that parses, so the parent stays live.
 * - Clearing the field commits **0** — what `Number('')` did before, kept so
 *   the ± buttons still step from a known number.
 * - What does not parse is not committed at all (it used to commit `NaN`); the
 *   draft keeps showing it, and blur resyncs the field from the parent.
 *
 * `display` is the string to show when there is no draft — the caller formats
 * it, so each stepper keeps its own zero convention (the working-weight anchor
 * renders blank at 0; the set stepper renders a "0").
 */
export function useDecimalDraft(display: string, onCommit: (n: number) => void) {
  const [draft, setDraft] = useState<string | null>(null);

  return {
    value: draft ?? display,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setDraft(raw);
      const n = parseDecimalInput(raw);
      if (n !== null) onCommit(n);
      else if (raw.trim() === '') onCommit(0);
    },
    // Drop the draft and fall back to the parent's number. This is also what
    // keeps the ± buttons honest: clicking one blurs the input first, so the
    // stepped value is never masked by a stale draft.
    onBlur: () => setDraft(null),
  };
}
