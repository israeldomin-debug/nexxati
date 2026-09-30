import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ArchiveX, Plus, Search, ShieldAlert, Trash2, X } from 'lucide-react';
import { AppNav } from '../components/AppNav';
import { PremiumPageHeader, premiumHeaderPrimaryAction } from '../components/PremiumPageHeader';
import { PaginationControls, useClientPagination } from '../components/PaginationControls';
import { assetService } from '../services/asset.service';
import { disposalService } from '../services/disposal.service';
import { Asset, DisposalInput, DisposalItem } from '../types';
import { handleApiError } from '../services/api';
import { requestDeletePassword } from '../utils/deleteConfirmation';
import { useAuthStore } from '../store/useAuthStore';
import { hasPermission } from '../utils/permissions';

const blankDisposal: DisposalInput = {
  assetId: '',
  itemName: '',
  category: '',
  assetTag: '',
  serialNumber: '',
  quantity: 1,
  reason: '',
  destination: '',
  disposalDate: new Date().toISOString().slice(0, 10),
  notes: '',
};

const field = 'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const label = 'text-sm font-medium text-slate-700';

const formatDate = (value: string | null) => value
  ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  : '—';

const loadAssetOptions = async () => {
  const firstPage = await assetService.list({ page: 1, limit: 100 });
  const allAssets = [...firstPage.assets];

  for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
    const nextPage = await assetService.list({ page, limit: 100 });
    allAssets.push(...nextPage.assets);
  }

  return allAssets;
};

function DisposalForm({ assets, onClose, onSaved }: { assets: Asset[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<DisposalInput>(blankDisposal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const availableAssets = useMemo(
    () => assets
      .filter((asset) => asset.status !== 'RETIRED')
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true })),
    [assets],
  );
  const selectedAsset = useMemo(() => availableAssets.find((asset) => asset.id === form.assetId), [availableAssets, form.assetId]);
  const update = <K extends keyof DisposalInput>(key: K, value: DisposalInput[K]) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!selectedAsset) return;
    setForm((current) => ({
      ...current,
      itemName: selectedAsset.name,
      category: selectedAsset.category,
      assetTag: selectedAsset.assetTag,
      serialNumber: selectedAsset.serialNumber || '',
      quantity: 1,
    }));
  }, [selectedAsset]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await disposalService.create({
        ...form,
        assetId: form.assetId || null,
        itemName: form.itemName || undefined,
        category: form.category || null,
        assetTag: form.assetTag || null,
        serialNumber: form.serialNumber || null,
        reason: form.reason || null,
        destination: form.destination || null,
        notes: form.notes || null,
      });
      onSaved();
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0" aria-hidden="true" />
      <form onSubmit={submit} className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Controle patrimonial</p>
            <h2 className="text-xl font-bold text-slate-900">Registrar descarte</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>

        <div className="grid gap-5 p-6 sm:grid-cols-2">
          {error && <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <label className={`${label} sm:col-span-2`}>Selecionar ativo cadastrado
            <select value={form.assetId || ''} onChange={(event) => update('assetId', event.target.value || null)} className={field}>
              <option value="">Inserir item manualmente</option>
              {!availableAssets.length && <option value="" disabled>Nenhum ativo disponível encontrado</option>}
              {availableAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>{asset.name}{asset.ipAddress ? ` · ${asset.ipAddress}` : ''}</option>
              ))}
            </select>
          </label>

          <label className={label}>Item descartado *<input required={!form.assetId} disabled={Boolean(form.assetId)} value={form.itemName || ''} onChange={(event) => update('itemName', event.target.value)} className={field} placeholder="Monitor, DVR, cadeira, sucata..." /></label>
          <label className={label}>Categoria<input disabled={Boolean(form.assetId)} value={form.category || ''} onChange={(event) => update('category', event.target.value)} className={field} placeholder="Eletrônico, rede, periférico..." /></label>
          <label className={label}>Número de série<input disabled={Boolean(form.assetId)} value={form.serialNumber || ''} onChange={(event) => update('serialNumber', event.target.value)} className={field} /></label>
          <label className={label}>Quantidade *<input required type="number" min="1" value={form.quantity} onChange={(event) => update('quantity', Number(event.target.value))} className={field} /></label>
          <label className={label}>Data do descarte<input type="date" value={form.disposalDate || ''} onChange={(event) => update('disposalDate', event.target.value)} className={field} /></label>
          <label className={label}>Motivo<input value={form.reason || ''} onChange={(event) => update('reason', event.target.value)} className={field} placeholder="Defeito, obsoleto, quebrado..." /></label>
          <label className={label}>Destino<input value={form.destination || ''} onChange={(event) => update('destination', event.target.value)} className={field} placeholder="Lixo eletrônico, doação, venda, arquivo..." /></label>
          <label className={`${label} sm:col-span-2`}>Observações<textarea rows={3} value={form.notes || ''} onChange={(event) => update('notes', event.target.value)} className={field} /></label>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button>
          <button disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{saving ? 'Salvando...' : 'Registrar descarte'}</button>
        </div>
      </form>
    </div>
  );
}

export function Disposals() {
  const { user } = useAuthStore();
  const canManage = hasPermission(user, 'MANAGE_ASSETS');
  const [items, setItems] = useState<DisposalItem[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const disposalPagination = useClientPagination(items, search);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [disposals, assetData] = await Promise.all([
        disposalService.list(search || undefined),
        loadAssetOptions(),
      ]);
      setItems(disposals);
      setAssets(assetData);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { const timer = window.setTimeout(load, 250); return () => window.clearTimeout(timer); }, [load]);

  const remove = async (item: DisposalItem) => {
    if (!window.confirm(`Excluir registro de descarte de ${item.itemName}?`)) return;
    const password = requestDeletePassword(`o descarte de ${item.itemName}`); if (!password) return;
    try {
      await disposalService.delete(item.id, password);
      await load();
    } catch (err) {
      setError(handleApiError(err));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <AppNav />
      <main className="mx-auto max-w-[1500px]">
        <PremiumPageHeader eyebrow="Controle patrimonial" title="Descarte" description="Registre ativos retirados e itens descartados manualmente." icon={ArchiveX} actions={canManage && <button onClick={() => setFormOpen(true)} className={premiumHeaderPrimaryAction}><Plus size={18} /> Novo descarte</button>} />

        {error && <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><ShieldAlert size={18} />{error}</div>}

        <div className="mb-5 max-w-lg"><label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm" placeholder="Buscar item, série, motivo ou destino..." /></label></div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1050px] divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>{['Data', 'Item', 'Categoria', 'Série', 'Qtd.', 'Motivo / destino', 'Registrado por', ''].map((title) => <th key={title} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? <tr><td colSpan={8} className="py-16 text-center text-sm text-slate-500">Carregando descartes...</td></tr>
                  : items.length ? disposalPagination.paginatedItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">{formatDate(item.disposalDate)}</td>
                      <td className="px-5 py-4"><p className="text-sm font-semibold text-slate-900">{item.itemName}</p><p className="text-xs text-slate-500">{item.asset ? 'Ativo cadastrado' : item.accessory ? 'Item de estoque' : 'Item manual'}</p></td>
                      <td className="px-5 py-4 text-sm text-slate-600">{item.category || '—'}</td>
                      <td className="px-5 py-4 text-sm text-slate-600">{item.serialNumber || 'Sem série'}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-900">{item.quantity}</td>
                      <td className="px-5 py-4 text-sm text-slate-600"><p>{item.reason || '—'}</p><p className="text-xs text-slate-400">{item.destination || 'Sem destino informado'}</p>{item.notes && <p className="mt-1 text-xs text-slate-500">{item.notes}</p>}</td>
                      <td className="px-5 py-4 text-sm text-slate-600">{item.performedBy.name}</td>
                      <td className="px-5 py-4 text-right">{user?.role === 'ADMIN' && <button onClick={() => remove(item)} className="text-sm font-semibold text-red-600 hover:text-red-800"><Trash2 size={16} className="inline" /> Excluir</button>}</td>
                    </tr>
                  )) : <tr><td colSpan={8} className="py-16 text-center"><ArchiveX className="mx-auto mb-3 text-slate-300" size={38} /><p className="font-semibold text-slate-700">Nenhum descarte registrado</p><p className="mt-1 text-sm text-slate-500">Registre ativos retirados ou itens descartados manualmente.</p></td></tr>}
              </tbody>
            </table>
          </div>
          {items.length > 0 && <PaginationControls {...disposalPagination} />}
        </section>
      </main>

      {canManage && formOpen && <DisposalForm assets={assets} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); load(); }} />}
    </div>
  );
}
