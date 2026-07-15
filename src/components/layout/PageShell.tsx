import type { ReactNode } from 'react';
import { BackHeader } from './BackHeader';
import { MobileTopBar } from './MobileTopBar';

interface PageHeaderV2Props {
  title: string;
  subtitle?: string;
  /** Inline header content between the title and the actions (e.g. the planner's week label + phase chip). */
  meta?: ReactNode;
  actions?: ReactNode;
}

/**
 * Desktop page header (canvas PageHeaderV2): 56px, full-bleed, actions right.
 *
 * The height is a floor (`min-h-14`), not a fixed size, and the row may wrap:
 * a header packed with meta + several actions (the planner) has to GROW at a
 * narrow desktop width, never clip its content or spill it over the body. A
 * header whose row fits — every other page — is unaffected: `min-h-14` (56px)
 * beats `py-2` + a ≤40px row, so it still measures 56px and stays centred.
 *
 * Actions are right-aligned by an auto margin rather than by a `flex-1` spacer:
 * a spacer is itself a flex item, so it burns one `gap-3.5` of the row and
 * wraps the actions one notch earlier than they need to. The auto margin also
 * keeps them right-aligned on the line they wrap onto.
 */
export function PageHeaderV2({ title, subtitle, meta, actions }: PageHeaderV2Props) {
  return (
    <header className="hidden min-h-14 shrink-0 flex-wrap items-center gap-3.5 border-b bg-card px-6 py-2 md:flex">
      <h1 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h1>
      {subtitle && <span className="tnum text-[13.5px] text-text-dim">{subtitle}</span>}
      {meta}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

interface PageShellProps extends PageHeaderV2Props {
  /**
   * Sub-screen: render BackHeader on mobile. String = target route,
   * true = history back, function = custom back handler (e.g. history back
   * with a same-section fallback).
   */
  back?: string | true | (() => void);
  children: ReactNode;
}

/**
 * Unified page frame: MobileTopBar (root) or BackHeader (sub-screen) below md,
 * PageHeaderV2 at md+, body centred and capped at --content-max (1280px).
 */
export function PageShell({ title, subtitle, meta, actions, back, children }: PageShellProps) {
  return (
    <>
      {back !== undefined ? (
        <BackHeader
          title={title}
          subtitle={subtitle}
          to={typeof back === 'string' ? back : undefined}
          onBack={typeof back === 'function' ? back : undefined}
          actions={actions}
        />
      ) : (
        <MobileTopBar title={title} subtitle={subtitle} />
      )}
      <PageHeaderV2 title={title} subtitle={subtitle} meta={meta} actions={actions} />
      <div className="mx-auto w-full max-w-content px-4 py-5 md:px-6">{children}</div>
    </>
  );
}
