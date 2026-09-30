import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Download, Inbox, PackageMinus, PackagePlus, Printer, RotateCcw, Search } from 'lucide-react';
import { AppNav } from '../components/AppNav';
import { PremiumPageHeader, premiumHeaderPrimaryAction, premiumHeaderSecondaryAction } from '../components/PremiumPageHeader';
import { Accessory, AccessoryMovement } from '../types';
import { accessoryService } from '../services/accessory.service';
import { handleApiError } from '../services/api';
import { nextSort, SortableHeader, SortState, sortByDirection } from '../utils/tableSort';
import { PaginationControls, useClientPagination } from '../components/PaginationControls';
import { useSearchParams } from 'react-router-dom';
import { CancelAccessoryMovementModal } from '../components/CancelAccessoryMovementModal';
import { useAuthStore } from '../store/useAuthStore';
import { hasPermission } from '../utils/permissions';

const movementLabel = (type: AccessoryMovement['type']) => type === 'OUT' ? 'Saída' : type === 'IN' ? 'Entrada' : 'Ajuste';
const movementTarget = (movement: AccessoryMovement) => movement.asset
  ? `Ativo: ${movement.asset.name}`
  : movement.user
    ? `Usuário: ${movement.user.name}`
    : 'Sem vínculo';

type ReportMode = 'STOCK' | 'MOVEMENTS' | 'OUT' | 'IN' | 'ZERO' | 'LOW' | 'OLD_PURCHASE';
type MovementSortKey = 'createdAt' | 'type' | 'status' | 'accessory' | 'quantity' | 'target' | 'performedBy' | 'reason';
type StockSortKey = 'name' | 'category' | 'quantity' | 'minQuantity' | 'location' | 'purchaseDate' | 'supplier';

const sixMonthsAgo = () => {
  const date = new Date();
  date.setMonth(date.getMonth() - 6);
  return date;
};

const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';
const accessorySupplier = (item: Accessory) => item.supplier?.name || item.purchaseSupplier || '—';

export function MovementReports() {
  const { user } = useAuthStore();
  const canManage = hasPermission(user, 'MANAGE_ACCESSORIES');
  const [searchParams, setSearchParams] = useSearchParams();
  const [movements, setMovements] = useState<AccessoryMovement[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [conditionFilter, setConditionFilter] = useState<'NEW' | 'USED' | ''>('');
  const requestedMode = searchParams.get('mode') as ReportMode | null;
  const [mode, setMode] = useState<ReportMode>(requestedMode === 'MOVEMENTS' || requestedMode === 'OUT' || requestedMode === 'IN' ? requestedMode : 'STOCK');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cancelingMovement, setCancelingMovement] = useState<AccessoryMovement | null>(null);
  const [movementSort, setMovementSort] = useState<SortState<MovementSortKey>>({ key: 'createdAt', direction: 'desc' });
  const [stockSort, setStockSort] = useState<SortState<StockSortKey>>({ key: 'name', direction: 'asc' });

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    return Promise.all([accessoryService.movements(500), accessoryService.list()])
      .then(([movementData, accessoryData]) => {
        setMovements(movementData);
        setAccessories(accessoryData);
      })
      .catch((err) => setError(handleApiError(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const cancelMovement = async (password: string, reason: string) => {
    if (!cancelingMovement) return;
    await accessoryService.cancelMovement(cancelingMovement.id, password, reason);
    setNotice(`Saída cancelada e ${cancelingMovement.quantity} ${cancelingMovement.accessory.unit} devolvido(s) ao estoque.`);
    setCancelingMovement(null);
    await load();
  };

  const oldPurchaseLimit = useMemo(() => sixMonthsAgo(), []);
  const accessoryById = useMemo(() => new Map(accessories.map((item) => [item.id, item])), [accessories]);
  const categoryOptions = useMemo(() => [...new Set(accessories.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [accessories]);
  const locationOptions = useMemo(() => [...new Set(accessories.map((item) => item.location).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR')), [accessories]);
  const companyOptions = useMemo(() => [...new Map(accessories.map((item) => item.company).filter(Boolean).map((company) => [company!.id, company!])).values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [accessories]);
  const supplierOptions = useMemo(() => [...new Map(accessories.map((item) => item.supplier).filter(Boolean).map((supplier) => [supplier!.id, supplier!])).values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [accessories]);

  const movementReports = useMemo(() => mode === 'MOVEMENTS' ? movements : movements.filter((movement) => movement.type === mode), [movements, mode]);
  const stockReports = useMemo(() => {
    if (mode === 'STOCK') return accessories.filter((item) => item.active);
    if (mode === 'ZERO') return accessories.filter((item) => item.active && item.quantity <= 0);
    if (mode === 'LOW') return accessories.filter((item) => item.active && item.quantity > 0 && item.quantity <= item.minQuantity);
    if (mode === 'OLD_PURCHASE') return accessories.filter((item) => {
      if (!item.active) return false;
      if (!item.purchaseDate) return true;
      return new Date(item.purchaseDate) <= oldPurchaseLimit;
    });
    return [];
  }, [accessories, mode, oldPurchaseLimit]);

  const filteredMovements = useMemo(() => {
    const term = search.trim().toLowerCase();
    return movementReports.filter((movement) => {
      const accessory = accessoryById.get(movement.accessory.id);
      if (categoryFilter && (accessory?.category || movement.accessory.category) !== categoryFilter) return false;
      if (locationFilter && accessory?.location !== locationFilter) return false;
      if (companyFilter && accessory?.companyId !== companyFilter) return false;
      if (supplierFilter && accessory?.supplierId !== supplierFilter) return false;
      if (conditionFilter && accessory?.condition !== conditionFilter) return false;
      if (!term) return true;
      return [
      movement.accessory.name,
      movement.accessory.category,
      movement.asset?.name,
      movement.user?.name,
      movement.user?.email,
      movement.performedBy.name,
      movement.reason,
      movement.canceledBy?.name,
      movement.cancellationReason,
      movement.canceledAt ? 'cancelada' : 'ativa',
      movementLabel(movement.type),
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(term));
    });
  }, [movementReports, search, categoryFilter, locationFilter, companyFilter, supplierFilter, conditionFilter, accessoryById]);

  const filteredStock = useMemo(() => {
    const term = search.trim().toLowerCase();
    return stockReports.filter((item) => {
      if (categoryFilter && item.category !== categoryFilter) return false;
      if (locationFilter && item.location !== locationFilter) return false;
      if (companyFilter && item.companyId !== companyFilter) return false;
      if (supplierFilter && item.supplierId !== supplierFilter) return false;
      if (conditionFilter && item.condition !== conditionFilter) return false;
      if (!term) return true;
      return [
      item.name,
      item.category,
      item.manufacturer,
      item.model,
      item.serialNumber,
      item.partNumber,
      item.location,
      item.company?.name,
      item.purchasedByCompany?.name,
      accessorySupplier(item),
      item.purchaseInvoiceNumber,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(term));
    });
  }, [stockReports, search, categoryFilter, locationFilter, companyFilter, supplierFilter, conditionFilter]);

  const sortedMovements = useMemo(() => sortByDirection(filteredMovements, movementSort.direction, (movement) => {
    if (movementSort.key === 'type') return movementLabel(movement.type);
    if (movementSort.key === 'accessory') return movement.accessory.name;
    if (movementSort.key === 'target') return movementTarget(movement);
    if (movementSort.key === 'performedBy') return movement.performedBy.name;
    if (movementSort.key === 'status') return movement.canceledAt ? 'Cancelada' : 'Ativa';
    return movement[movementSort.key] || '';
  }), [filteredMovements, movementSort]);

  const sortedStock = useMemo(() => sortByDirection(filteredStock, stockSort.direction, (item) => {
    if (stockSort.key === 'supplier') return accessorySupplier(item);
    return item[stockSort.key] || '';
  }), [filteredStock, stockSort]);
  const movementPagination = useClientPagination(sortedMovements, `${mode}-${search}-${categoryFilter}-${locationFilter}-${companyFilter}-${supplierFilter}-${conditionFilter}-${movementSort.key}-${movementSort.direction}`);
  const stockPagination = useClientPagination(sortedStock, `${mode}-${search}-${categoryFilter}-${locationFilter}-${companyFilter}-${supplierFilter}-${conditionFilter}-${stockSort.key}-${stockSort.direction}`);

  const isMovementMode = mode === 'MOVEMENTS' || mode === 'OUT' || mode === 'IN';
  const currentCount = isMovementMode ? sortedMovements.length : sortedStock.length;

  const summary = useMemo(() => ({
    stock: accessories.filter((item) => item.active).length,
    movements: movements.length,
    out: movements.filter((item) => item.type === 'OUT' && !item.canceledAt).length,
    in: movements.filter((item) => item.type === 'IN').length,
    zero: accessories.filter((item) => item.active && item.quantity <= 0).length,
    low: accessories.filter((item) => item.active && item.quantity > 0 && item.quantity <= item.minQuantity).length,
    oldPurchase: accessories.filter((item) => item.active && (!item.purchaseDate || new Date(item.purchaseDate) <= oldPurchaseLimit)).length,
  }), [movements, accessories, oldPurchaseLimit]);

  const reportCards = [
    { mode: 'STOCK' as const, title: 'Estoque atual', count: summary.stock, icon: Inbox, color: 'text-blue-700 bg-blue-50 border-blue-200' },
    { mode: 'MOVEMENTS' as const, title: 'Movimentações', count: summary.movements, icon: BarChart3, color: 'text-violet-700 bg-violet-50 border-violet-200' },
    { mode: 'OUT' as const, title: 'Saídas', count: summary.out, icon: PackageMinus, color: 'text-red-700 bg-red-50 border-red-200' },
    { mode: 'IN' as const, title: 'Entradas', count: summary.in, icon: PackagePlus, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    { mode: 'ZERO' as const, title: 'Fora do estoque', count: summary.zero, icon: Inbox, color: 'text-slate-700 bg-slate-50 border-slate-200' },
    { mode: 'LOW' as const, title: 'Abaixo do mínimo', count: summary.low, icon: AlertTriangle, color: 'text-amber-700 bg-amber-50 border-amber-200' },
    { mode: 'OLD_PURCHASE' as const, title: 'Sem compra há 6 meses', count: summary.oldPurchase, icon: BarChart3, color: 'text-blue-700 bg-blue-50 border-blue-200' },
  ];

  const exportCsv = () => {
    const rows = isMovementMode
      ? [
          ['Data', 'Tipo', 'Status', 'Item', 'Categoria', 'Quantidade', 'Destino', 'Registrado por', 'Observação'],
          ...sortedMovements.map((movement) => [
            new Date(movement.createdAt).toLocaleString('pt-BR'),
            movementLabel(movement.type),
            movement.canceledAt ? `Cancelada por ${movement.canceledBy?.name || 'usuário'} em ${new Date(movement.canceledAt).toLocaleString('pt-BR')}: ${movement.cancellationReason || ''}` : 'Ativa',
            movement.accessory.name,
            movement.accessory.category,
            `${movement.quantity} ${movement.accessory.unit}`,
            movementTarget(movement),
            movement.performedBy.name,
            movement.reason || '',
          ]),
        ]
      : [
          ['Item', 'Categoria', 'Quantidade', 'Mínimo', 'Unidade', 'Localização', 'Fornecedor', 'Data da compra', 'Nota fiscal'],
          ...sortedStock.map((item) => [
            item.name,
            item.category,
            item.quantity,
            item.minQuantity,
            item.unit,
            item.location || '',
            accessorySupplier(item),
            formatDate(item.purchaseDate),
            item.purchaseInvoiceNumber || '',
          ]),
        ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-estoque-${mode.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => window.print();

  return <div className="min-h-screen bg-slate-50 p-4 sm:p-6"><style>{`@media print { .no-print { display: none !important; } body { background: white !important; } main { max-width: none !important; } table { font-size: 11px; } th, td { padding: 6px 8px !important; } .print-card { box-shadow: none !important; border-color: #cbd5e1 !important; } }`}</style><div className="no-print"><AppNav /></div><main className="mx-auto max-w-[1500px]">
    <PremiumPageHeader eyebrow="Relatórios" title="Relatórios de estoque" description="Acompanhe entradas, saídas, itens críticos e compras antigas." icon={BarChart3} actions={<div className="no-print flex flex-wrap gap-2"><a href="/accessories" className={premiumHeaderSecondaryAction}>Voltar ao estoque</a><button onClick={printReport} className={premiumHeaderSecondaryAction}><Printer size={18} /> Imprimir</button><button onClick={exportCsv} className={premiumHeaderPrimaryAction}><Download size={18} /> Exportar CSV</button></div>} />
    {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    {notice && <div className="no-print mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

    <div className="no-print mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {reportCards.map((card) => {
        const Icon = card.icon;
        const active = mode === card.mode;
        return <button key={card.mode} type="button" onClick={() => { setMode(card.mode); setSearchParams({ mode: card.mode }); }} className={`rounded-xl border p-4 text-left shadow-sm transition hover:shadow-md ${card.color} ${active ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase">{card.title}</p><Icon size={20} /></div><p className="mt-2 text-2xl font-bold">{card.count}</p></button>;
      })}
    </div>

    <div className="no-print mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_160px_160px_180px_180px_140px_auto]">
        <label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm" placeholder="Buscar por item, ativo, usuário, fornecedor, NF..." /></label>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="">Todas categorias</option>{categoryOptions.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="">Todos locais</option>{locationOptions.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="">Todas empresas</option>{companyOptions.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select>
        <select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="">Todos fornecedores</option>{supplierOptions.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>
        <select value={conditionFilter} onChange={(event) => setConditionFilter(event.target.value as 'NEW' | 'USED' | '')} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="">Condição</option><option value="NEW">Novo</option><option value="USED">Usado</option></select>
        <span className="rounded-full bg-slate-50 px-4 py-2.5 text-center text-sm font-semibold text-slate-600">{currentCount} registro(s)</span>
      </div>
    </div>

    <section className="print-card overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        {isMovementMode ? <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50"><tr>
            {[
              ['Data', 'createdAt'],
              ['Tipo', 'type'],
              ['Status', 'status'],
              ['Item', 'accessory'],
              ['Qtd.', 'quantity'],
              ['Destino', 'target'],
              ['Registrado por', 'performedBy'],
              ['Observação', 'reason'],
            ].map(([title, key]) => <SortableHeader key={title} label={title} sortKey={key as MovementSortKey} current={movementSort} onSort={(nextKey) => setMovementSort((current) => nextSort(current, nextKey))} />)}
            <th className="no-print px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Ações</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={9} className="py-16 text-center text-sm text-slate-500">Carregando relatório...</td></tr>
              : sortedMovements.length ? movementPagination.paginatedItems.map((movement) => <tr key={movement.id} className={movement.canceledAt ? 'bg-slate-50 text-slate-500' : 'hover:bg-slate-50'}><td className="px-5 py-4 text-sm text-slate-600">{new Date(movement.createdAt).toLocaleString('pt-BR')}</td><td className={`px-5 py-4 text-sm font-semibold ${movement.canceledAt ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{movementLabel(movement.type)}</td><td className="px-5 py-4 text-sm">{movement.canceledAt ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Cancelada</span> : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Ativa</span>}{movement.canceledAt && <p className="mt-2 max-w-xs text-xs text-slate-500">Por {movement.canceledBy?.name || 'usuário'} em {new Date(movement.canceledAt).toLocaleString('pt-BR')} · {movement.cancellationReason}</p>}</td><td className="px-5 py-4"><p className="text-sm font-semibold text-slate-900">{movement.accessory.name}</p><p className="text-xs text-slate-500">{movement.accessory.category}</p></td><td className="px-5 py-4 text-sm text-slate-600">{movement.quantity} {movement.accessory.unit}</td><td className="px-5 py-4 text-sm text-slate-600">{movementTarget(movement)}</td><td className="px-5 py-4 text-sm text-slate-600">{movement.performedBy.name}</td><td className="px-5 py-4 text-sm text-slate-600">{movement.reason || '—'}</td><td className="no-print px-5 py-4 text-right">{canManage && movement.type === 'OUT' && !movement.canceledAt && !movement.reason?.trim().toLowerCase().startsWith('descarte') ? <button type="button" onClick={() => { setNotice(''); setCancelingMovement(movement); }} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"><RotateCcw size={15} /> Cancelar saída</button> : '—'}</td></tr>)
              : <tr><td colSpan={9} className="py-16 text-center text-sm text-slate-500">Nenhuma movimentação encontrada.</td></tr>}
          </tbody>
        </table> : <table className="min-w-[1050px] divide-y divide-slate-200">
          <thead className="bg-slate-50"><tr>
            {[
              ['Item', 'name'],
              ['Categoria', 'category'],
              ['Qtd.', 'quantity'],
              ['Mínimo', 'minQuantity'],
              ['Localização', 'location'],
              ['Fornecedor', 'supplier'],
              ['Compra', 'purchaseDate'],
            ].map(([title, key]) => <SortableHeader key={title} label={title} sortKey={key as StockSortKey} current={stockSort} onSort={(nextKey) => setStockSort((current) => nextSort(current, nextKey))} />)}
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={7} className="py-16 text-center text-sm text-slate-500">Carregando relatório...</td></tr>
              : sortedStock.length ? stockPagination.paginatedItems.map((item) => <tr key={item.id} className="hover:bg-slate-50"><td className="px-5 py-4"><p className="text-sm font-semibold text-slate-900">{item.name}</p><p className="text-xs text-slate-500">{[item.manufacturer, item.model, item.serialNumber].filter(Boolean).join(' · ') || 'Sem fabricante/modelo'}</p></td><td className="px-5 py-4 text-sm text-slate-600">{item.category}</td><td className="px-5 py-4 text-sm font-semibold text-slate-900">{item.quantity} {item.unit}</td><td className="px-5 py-4 text-sm text-slate-600">{item.minQuantity} {item.unit}</td><td className="px-5 py-4 text-sm text-slate-600">{item.location || '—'}</td><td className="px-5 py-4 text-sm text-slate-600">{accessorySupplier(item)}</td><td className="px-5 py-4 text-sm text-slate-600">{formatDate(item.purchaseDate)}{!item.purchaseDate && <p className="text-xs text-amber-600">Sem data de compra</p>}</td></tr>)
              : <tr><td colSpan={7} className="py-16 text-center text-sm text-slate-500">Nenhum item encontrado neste relatório.</td></tr>}
          </tbody>
        </table>}
      </div>
      {currentCount > 0 && <div className="no-print">{isMovementMode ? <PaginationControls {...movementPagination} /> : <PaginationControls {...stockPagination} />}</div>}
    </section>
  </main>
  {canManage && cancelingMovement && <CancelAccessoryMovementModal movement={cancelingMovement} onClose={() => setCancelingMovement(null)} onConfirm={cancelMovement} />}
  </div>;
}
