import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] font-medium border',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground border-transparent',
        secondary: 'bg-muted text-muted-foreground border-border',
        outline: 'border-border text-muted-foreground',
        accent: 'bg-accent-soft text-accent-ink border-accent-line',
        warning: 'bg-amber-soft text-amber-ink border-transparent',
      },
    },
    defaultVariants: { variant: 'secondary' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
