import type { ReactNode } from 'react';
import { BackHeader } from './BackHeader';
import { MobileTopBar } from './MobileTopBar';

interface PageHeaderV2Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

/** Desktop page header (canvas PageHeaderV2): 56px, full-bleed, actions right. */
export function PageHeaderV2({ title, subtitle, actions }: PageHeaderV2Props) {
  return (
    <header className="hidden h-14 shrink-0 items-center gap-3.5 border-b bg-card px-6 md:flex">
      <h1 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h1>
      {subtitle && <span className="tnum text-[13.5px] text-text-dim">{subtitle}</span>}
      <div className="flex-1" />
      {actions}
    </header>
  );
}

interface PageShellProps extends PageHeaderV2Props {
  /** Sub-screen: render BackHeader on mobile. String = target route, true = history back. */
  back?: string | true;
  children: ReactNode;
}

/**
 * Unified page frame: MobileTopBar (root) or BackHeader (sub-screen) below md,
 * PageHeaderV2 at md+, body centred and capped at --content-max (1280px).
 */
export function PageShell({ title, subtitle, actions, back, children }: PageShellProps) {
  return (
    <>
      {back !== undefined ? (
        <BackHeader
          title={title}
          subtitle={subtitle}
          to={typeof back === 'string' ? back : undefined}
          actions={actions}
        />
      ) : (
        <MobileTopBar title={title} subtitle={subtitle} actions={actions} />
      )}
      <PageHeaderV2 title={title} subtitle={subtitle} actions={actions} />
      <div className="mx-auto w-full max-w-content px-4 py-5 md:px-6">{children}</div>
    </>
  );
}
