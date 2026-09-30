import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Edit3, Globe2, Laptop, Plus, Radar, Search, Trash2, X } from 'lucide-react';
import { AppNav } from '../components/AppNav';
import { PremiumPageHeader, premiumHeaderPrimaryAction } from '../components/PremiumPageHeader';
import { ipAddressService } from '../services/ip-address.service';
import { handleApiError } from '../services/api';
import { requestDeletePassword } from '../utils/deleteConfirmation';
import { Asset, IpAddressSource, NetworkIpAddress, NetworkIpAddressInput } from '../types';
import { useAuthStore } from '../store/useAuthStore';
import { hasPermission } from '../utils/permissions';
import { nextSort, SortableHeader, SortState, sortByDirection } from '../utils/tableSort';
import { PaginationControls, useClientPagination } from '../components/PaginationControls';

const sourceLabels: Record<IpAddressSource, string> = {
  MANUAL: 'Manual',
  ASSET: 'Ativo',
  DISCOVERY: 'Rastreado',
  FREE: 'Livre',
};

type IpSortKey = 'ipAddress' | 'source' | 'hostname' | 'asset' | 'description' | 'active';

const blankForm: NetworkIpAddressInput = {
  ipAddress: '',
  hostname: '',
  macAddress: '',
  description: '',
  assetId: null,
  companyId: null,
  networkSegmentId: null,
  active: true,
};

function IpAddressForm({ item, assets, onClose, onSaved }: {
  item: NetworkIpAddress | null;
  assets: Asset[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<NetworkIpAddressInput>(() => item ? {
    ipAddress: item.ipAddress,
    hostname: item.hostname || '',
    macAddress: item.macAddress || '',
    description: item.description || '',
    assetId: item.assetId,
    companyId: item.companyId,
    networkSegmentId: null,
    active: item.active,
  } : blankForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputClass = 'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
  const labelClass = 'text-sm font-medium text-slate-700';
  const update = <K extends keyof NetworkIpAddressInput>(key: K, value: NetworkIpAddressInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const selectAsset = (assetId: string) => {
    const asset = assets.find((item) => item.id === assetId);
    setForm((current) => ({
      ...current,
      assetId: assetId || null,
      companyId: asset?.companyId || current.companyId || null,
      networkSegmentId: null,
      ipAddress: asset?.ipAddress || current.ipAddress,
      hostname: asset?.hostname || current.hostname,
      macAddress: asset?.macAddress || current.macAddress,
      description: current.description || (asset ? asset.name : ''),
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const selectedAsset = assets.find((asset) => asset.id === form.assetId);
      const payload = {
        ...form,
        assetId: form.assetId || null,
        companyId: selectedAsset?.companyId || form.companyId || null,
        networkSegmentId: null,
      };
      if (item) await ipAddressService.update(item.id, payload);
      else await ipAddressService.create(payload);
      onSaved();
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[1px]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 cursor-default" aria-hidden="true" />
      <div className="relative h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-5">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Controle de rede</p><h2 className="text-xl font-bold text-slate-900">{item ? 'Editar IP manual' : 'Incluir IP manual'}</h2></div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="space-y-5 p-6">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <label className={labelClass}>Endereço IP *<input required value={form.ipAddress} onChange={(e) => update('ipAddress', e.target.value)} className={inputClass} placeholder="192.168.1.10" /></label>
          <label className={labelClass}>Hostname<input value={form.hostname || ''} onChange={(e) => update('hostname', e.target.value)} className={inputClass} placeholder="PC-FINANCEIRO" /></label>
          <label className={labelClass}>MAC<input value={form.macAddress || ''} onChange={(e) => update('macAddress', e.target.value)} className={inputClass} placeholder="00:11:22:33:44:55" /></label>
          <label className={labelClass}>Atrelar a um ativo<select value={form.assetId || ''} onChange={(e) => selectAsset(e.target.value)} className={inputClass}><option value="">Sem ativo vinculado</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}{asset.ipAddress ? ` · ${asset.ipAddress}` : ''}</option>)}</select></label>
          <label className={labelClass}>Descrição<textarea value={form.description || ''} onChange={(e) => update('description', e.target.value)} className={`${inputClass} min-h-24`} placeholder="Reserva, impressora, câmera, roteador..." /></label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={form.active} onChange={(e) => update('active', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" /> IP ativo/em uso</label>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button>
            <button disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar IP'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function IpAddresses() {
  const { user } = useAuthStore();
  const canManage = hasPermission(user, 'MANAGE_IP_ADDRESSES');
  const [items, setItems] = useState<NetworkIpAddress[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<IpAddressSource | ''>('');
  const [activeFilter, setActiveFilter] = useState<'true' | 'false' | ''>('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<NetworkIpAddress | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [sort, setSort] = useState<SortState<IpSortKey>>({ key: 'ipAddress', direction: 'asc' });
  const [summaryItems, setSummaryItems] = useState<NetworkIpAddress[]>([]);
  const [freeCount, setFreeCount] = useState(0);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [ipList, options, usedList, freeList] = await Promise.all([
        ipAddressService.list({ search, source, active: activeFilter }),
        ipAddressService.options(),
        ipAddressService.list({ active: 'true' }),
        ipAddressService.list({ active: 'false' }),
      ]);
      setItems(ipList);
      setAssets(options.assets);
      setSummaryItems(usedList);
      setFreeCount(freeList.length);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [source, activeFilter]);

  const summary = useMemo(() => ({
    total: summaryItems.length + freeCount,
    manual: summaryItems.filter((item) => item.source === 'MANUAL').length,
    asset: summaryItems.filter((item) => item.source === 'ASSET').length,
    active: summaryItems.length,
    free: freeCount,
  }), [summaryItems, freeCount]);

  const sortedItems = useMemo(() => sortByDirection(items, sort.direction, (item) => {
    if (sort.key === 'asset') return item.asset ? item.asset.name : '';
    if (sort.key === 'active') return item.active ? 1 : 0;
    return item[sort.key] || '';
  }), [items, sort]);
  const ipPagination = useClientPagination(sortedItems, `${search}-${source}-${activeFilter}-${sort.key}-${sort.direction}`);

  const remove = async (item: NetworkIpAddress) => {
    if (!item.editable) return;
    if (!window.confirm(`Excluir definitivamente o IP ${item.ipAddress}? Essa ação não pode ser desfeita.`)) return;
    const password = requestDeletePassword(`o IP ${item.ipAddress}`); if (!password) return;
    try { await ipAddressService.delete(item.id, password); setNotice('IP excluído.'); await load(); }
    catch (err) { setError(handleApiError(err)); }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <AppNav />
      <main className="mx-auto max-w-[1500px]">
        <PremiumPageHeader eyebrow="Controle de rede" title="Endereços de IP" description="Acompanhe IPs por empresa, ativo e status em uma lista direta." icon={Globe2} actions={canManage && <button onClick={() => { setEditing(null); setFormOpen(true); }} className={premiumHeaderPrimaryAction}><Plus size={18} /> Incluir IP</button>} />

        <div className="mb-5 grid gap-4 md:grid-cols-5">
          <button type="button" onClick={() => { setActiveFilter(''); setSource(''); }} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300"><p className="text-xs font-semibold uppercase text-slate-500">Total</p><p className="mt-1 text-2xl font-bold">{summary.total}</p></button>
          <button type="button" onClick={() => { setActiveFilter('true'); setSource(''); }} className={`rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 ${activeFilter === 'true' ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200'}`}><p className="text-xs font-semibold uppercase text-slate-500">Em uso</p><p className="mt-1 text-2xl font-bold">{summary.active}</p></button>
          <button type="button" onClick={() => { setActiveFilter('false'); setSource(''); }} className={`rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-amber-300 ${activeFilter === 'false' ? 'border-amber-500 ring-2 ring-amber-100' : 'border-slate-200'}`}><p className="text-xs font-semibold uppercase text-slate-500">IPs liberados</p><p className="mt-1 text-2xl font-bold">{summary.free}</p></button>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-500">Vindos de ativos</p><p className="mt-1 text-2xl font-bold">{summary.asset}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-500">Manuais</p><p className="mt-1 text-2xl font-bold">{summary.manual}</p></div>
        </div>

        {notice && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="mb-5 grid gap-3 md:grid-cols-[1fr_220px_190px_auto]">
          <label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm" placeholder="Buscar por IP, hostname, MAC, ativo..." /></label>
          <select value={source} onChange={(e) => setSource(e.target.value as IpAddressSource | '')} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Todas as origens</option><option value="ASSET">Ativos</option><option value="MANUAL">Manual</option><option value="DISCOVERY">Rastreado</option></select>
          <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as typeof activeFilter)} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Todos os status</option><option value="true">Em uso</option><option value="false">IPs liberados</option></select>
          <button onClick={load} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Filtrar</button>
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1050px] divide-y divide-slate-200">
              <thead className="bg-slate-50"><tr>
                {[
                  ['IP', 'ipAddress'],
                  ['Origem', 'source'],
                  ['Hostname / MAC', 'hostname'],
                  ['Vínculo', 'asset'],
                  ['Descrição', 'description'],
                  ['Status', 'active'],
                  ['', undefined],
                ].map(([title, key]) => <SortableHeader key={title} label={title || ''} sortKey={key as IpSortKey | undefined} current={sort} onSort={(nextKey) => setSort((current) => nextSort(current, nextKey))} />)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? <tr><td colSpan={7} className="px-5 py-8"><div className="space-y-3" aria-label="Carregando IPs"><div className="premium-skeleton h-4 w-1/4 rounded-full" /><div className="premium-skeleton h-12 w-full rounded-xl" /><div className="premium-skeleton h-12 w-full rounded-xl" /><div className="premium-skeleton h-12 w-3/4 rounded-xl" /></div></td></tr> : sortedItems.length ? ipPagination.paginatedItems.map((item) => (
                  <tr key={`${item.source}-${item.id}`}>
                    <td className="px-5 py-4 font-mono text-sm font-semibold text-slate-900">{item.ipAddress}</td>
                    <td className="px-5 py-4 text-sm text-slate-600"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${item.source === 'ASSET' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>{item.source === 'ASSET' ? <Laptop size={14} /> : <Radar size={14} />}{sourceLabels[item.source]}</span></td>
                    <td className="px-5 py-4 text-sm text-slate-600"><p>{item.hostname || '—'}</p><p className="font-mono text-xs text-slate-400">{item.macAddress || 'Sem MAC'}</p></td>
                    <td className="px-5 py-4 text-sm text-slate-600">{item.asset ? item.asset.name : 'Sem ativo'}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{item.description || '—'}</td>
                    <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.active ? 'bg-emerald-50 text-emerald-700' : item.source === 'FREE' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{item.active ? 'Em uso' : item.source === 'FREE' ? 'Livre' : 'Inativo'}</span></td>
                    <td className="px-5 py-4 text-right">{canManage && item.editable ? <><button onClick={() => { setEditing(item); setFormOpen(true); }} className="mr-3 text-sm font-semibold text-blue-700"><Edit3 size={16} className="inline" /> Editar</button><button onClick={() => remove(item)} className="text-sm font-semibold text-red-600"><Trash2 size={16} className="inline" /> Excluir</button></> : <span className="text-xs text-slate-400">Automático</span>}</td>
                  </tr>
                )) : <tr><td colSpan={7} className="py-16 text-center text-sm text-slate-500">Nenhum IP encontrado.</td></tr>}
              </tbody>
            </table>
          </div>
          {sortedItems.length > 0 && <PaginationControls {...ipPagination} />}
        </section>
      </main>
      {formOpen && <IpAddressForm item={editing} assets={assets} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); setNotice(editing ? 'IP atualizado.' : 'IP cadastrado.'); load(); }} />}
    </div>
  );
}
