import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';

interface BackHeaderProps {
  title: string;
  subtitle?: string;
  /** Explicit back target; omitted → history back. */
  to?: string;
  actions?: ReactNode;
}

/** Sub-screen mobile header (canvas BackHeader). No section switch. Hidden at md+. */
export function BackHeader({ title, subtitle, to, actions }: BackHeaderProps) {
  const { t } = useTranslation('nav');
  const navigate = useNavigate();
  return (
    <header className="flex items-center gap-2.5 border-b bg-card px-3.5 pb-3 pt-2 md:hidden">
      <button
        type="button"
        aria-label={t('back')}
        onClick={() => (to ? navigate(to) : navigate(-1))}
        className="grid size-9 shrink-0 place-items-center rounded-[11px] border bg-card text-muted-foreground"
      >
        <ArrowLeft className="size-4" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col leading-[1.15]">
        <h1 className="truncate text-[17px] font-semibold tracking-[-0.02em]">{title}</h1>
        {subtitle && <span className="tnum text-[11.5px] text-text-dim">{subtitle}</span>}
      </div>
      {actions}
    </header>
  );
}
