import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PAGE_SIZE_OPTIONS, type PageSize } from '@/hooks/usePagination';

export interface PaginationBarProps {
  page: number;
  pageSize: PageSize;
  total: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
}

/** Windowed page list: 1 … current-1, current, current+1 … last (ellipses for gaps). */
export function pageRange(current: number, count: number): (number | 'ellipsis')[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const out: (number | 'ellipsis')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(count - 1, current + 1);
  if (start > 2) out.push('ellipsis');
  for (let p = start; p <= end; p++) out.push(p);
  if (end < count - 1) out.push('ellipsis');
  out.push(count);
  return out;
}

export function PaginationBar({
  page,
  pageSize,
  total,
  pageCount,
  onPageChange,
  onPageSizeChange,
}: PaginationBarProps) {
  const { t } = useTranslation('pagination');
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground tabular-nums">{t('summary', { from, to, total })}</p>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={t('prev')}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pageRange(page, pageCount).map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e${i}`} className="px-1 text-sm text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="icon"
              className="h-8 w-8 tabular-nums"
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={t('next')}
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange(Number(v) as PageSize)}
        >
          <SelectTrigger className="h-8 w-19 ml-1" aria-label={t('perPage')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
