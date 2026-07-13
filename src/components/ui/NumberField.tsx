import { forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// The shared decimal input (hard invariant 6). Promoted from the private
// `MacroField` that lived at the bottom of `IngredientEditorForm`.
//
// It renders `type="text" inputMode="decimal"`, NOT `type="number"`. That is
// the entire point: `type="number"` accepts only `.` as the decimal separator
// and STRIPS a typed comma before React or react-hook-form ever see the value
// (`1,2` arrives as `"12"`, silently, with `validity.valid === true`). A
// Spanish keyboard puts `,` on the numeric keypad, so the comma is the default
// thing a user types. `inputMode="decimal"` still raises the numeric keypad on
// mobile, so nothing is lost there; the desktop spinner is — which is why this
// component is for FRACTION-capable fields only. Integer-by-schema fields
// (series, reps, rest seconds, servings) keep `type="number"` and its spinner.
//
// ⚠️ On `type="text"` the browser stops enforcing `required` / `min` / `max` /
// `step`. Those are SCHEMA concerns now — this component deliberately hardcodes
// none of them, and every field using it must carry the equivalent zod rule.
// (This also fixes two defects the native gates caused: a browser bubble that
// preempted the app's own zod message, and `MacroField`'s hardcoded `max={100}`
// blocking a legitimate save on a per-unit ingredient.)
//
// The raw string this hands to react-hook-form is parsed by `parseDecimalInput`
// (`@/lib/number`) at the schema boundary — accept-both (`,`/`.`), emit-point.

/** Macro identity dot tokens — the same ones the ingredient list's dots use. */
const DOT = {
  protein: 'bg-macro-p',
  carbs: 'bg-macro-c',
  fat: 'bg-macro-g',
  fiber: 'bg-macro-fib',
} as const;

export interface NumberFieldProps
  extends Omit<React.ComponentPropsWithoutRef<'input'>, 'type'> {
  /** Wires the `<Label>` to the input — required, so the field is always labelled. */
  id: string;
  /**
   * Rendered as the field's `<Label>`. Omit it only when the call site renders
   * its own `<Label htmlFor>` — e.g. when something (a warning banner) has to
   * sit between the label and the field.
   */
  label?: string;
  /** Unit suffix shown inside the input's right edge ('g', 'kcal', 'kg', '%'). */
  suffix?: string;
  /** The shared macro identity dot, before the label text. */
  dot?: keyof typeof DOT;
  /** An "of which" sub-macro: indented under its parent, with the canvas's ↳. */
  sub?: boolean;
  /** Class for the `<Label>` (a compact label style is passed by the macro grid). */
  labelClassName?: string;
  /** Class for the `<input>`. */
  className?: string;
}

/**
 * `forwardRef` is load-bearing — `{...register(name)}` hands over a ref, and
 * without it react-hook-form holds no DOM node for the field: `reset()` (the
 * seed/prefill path) would silently fail to repopulate it.
 */
export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(
  function NumberField(
    { id, label, suffix, dot, sub, labelClassName, className, ...input },
    ref,
  ) {
    return (
      <div className="min-w-0 space-y-1.5">
        {label && (
          <Label
            htmlFor={id}
            className={cn('flex items-center gap-1', sub && 'text-text-dim', labelClassName)}
          >
            {sub && <span aria-hidden="true">↳</span>}
            {dot && (
              <span
                className={cn('size-[6px] shrink-0 rounded-full', DOT[dot])}
                aria-hidden="true"
              />
            )}
            <span className="truncate">{label}</span>
          </Label>
        )}
        <div className="relative">
          <Input
            ref={ref}
            id={id}
            type="text"
            inputMode="decimal"
            className={cn('tnum', suffix && 'pr-6', className)}
            {...input}
          />
          {suffix && (
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10.5px] text-text-dim">
              {suffix}
            </span>
          )}
        </div>
      </div>
    );
  },
);
