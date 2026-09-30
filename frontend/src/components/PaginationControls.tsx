import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const PAGE_SIZE_OPTIONS = [20, 50, 100, 500] as const;

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  itemLabel?: string;
};

export function PaginationControls({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  itemLabel = 'item',
}: PaginationControlsProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = total ? Math.min(page * pageSize, total) : 0;

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-500">
        {total ? `${first}–${last} de ${total} ${itemLabel}${total === 1 ? '' : 's'}` : `Nenhum ${itemLabel}`}
        <span className="ml-2 text-slate-400">Página {page} de {safeTotalPages}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Itens por página
          <select
            aria-label="Itens por página"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-semibold text-slate-700"
          >
            {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40" aria-label="Página anterior"><ChevronLeft size={18} /></button>
        <button type="button" disabled={page >= safeTotalPages} onClick={() => onPageChange(page + 1)} className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40" aria-label="Próxima página"><ChevronRight size={18} /></button>
      </div>
    </div>
  );
}

export function useClientPagination<T>(items: T[], resetKey = '') {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<number>(20);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => { setPage(1); }, [resetKey]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const paginatedItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  const setPageSize = (nextPageSize: number) => {
    setPageSizeState(nextPageSize);
    setPage(1);
  };

  return {
    page,
    pageSize,
    total: items.length,
    totalPages,
    paginatedItems,
    setPage,
    setPageSize,
    onPageChange: setPage,
    onPageSizeChange: setPageSize,
  };
}
