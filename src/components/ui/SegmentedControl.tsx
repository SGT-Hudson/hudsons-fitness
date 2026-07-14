import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  /** Already-translated label — this component never owns copy. */
  label: string;
}

interface Props<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Accessible name of the group (pass a translated string, or use `labelledBy`). */
  ariaLabel?: string;
  /** Id of an existing visible label, when the group already has one on screen. */
  labelledBy?: string;
  className?: string;
}

/**
 * The iOS-style segmented control: a sunken track with one raised pill on the
 * active option. Single-select, so a radiogroup (`role="radio"` +
 * `aria-checked`), with roving tabindex and arrow-key navigation like native
 * radios. Shared: the chart time-range filter, the %/kg unit toggle.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  labelledBy,
  className,
}: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, step: 1 | -1) => {
    const next = (from + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      move(index, 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(index, -1);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      className={cn('inline-flex gap-1 rounded-[10px] border bg-muted p-[3px]', className)}
    >
      {options.map((option, index) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            ref={(el) => {
              refs.current[index] = el;
            }}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              'tnum rounded-[8px] border px-2.5 py-1 text-[12px] font-semibold transition-colors',
              on
                ? 'border-accent-line bg-card text-accent-ink shadow-card'
                : 'border-transparent text-text-dim hover:bg-card/60 hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
