export type SortDirection = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

export function compareValues(a: unknown, b: unknown) {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;

  const dateA = typeof a === 'string' ? Date.parse(a) : Number.NaN;
  const dateB = typeof b === 'string' ? Date.parse(b) : Number.NaN;
  if (!Number.isNaN(dateA) && !Number.isNaN(dateB)) return dateA - dateB;

  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

export function sortByDirection<T>(items: T[], direction: SortDirection, getter: (item: T) => unknown) {
  return [...items].sort((left, right) => {
    const result = compareValues(getter(left), getter(right));
    return direction === 'asc' ? result : -result;
  });
}

export function nextSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  return { key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' };
}

export function SortableHeader<K extends string>({
  label,
  sortKey,
  current,
  onSort,
  className = 'px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500',
}: {
  label: string;
  sortKey?: K;
  current: SortState<K>;
  onSort: (key: K) => void;
  className?: string;
}) {
  if (!sortKey) return <th className={className}>{label}</th>;
  const active = current.key === sortKey;

  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-left transition hover:bg-slate-100 hover:text-slate-900 ${active ? 'text-blue-700' : ''}`}
        title={`Ordenar por ${label}`}
      >
        {label}
        <span className="text-[10px] leading-none">{active ? (current.direction === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}
