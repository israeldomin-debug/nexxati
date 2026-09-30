import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Edit3, PackageSearch, Plus, Search, Trash2, Truck, X } from 'lucide-react';
import { AppNav } from '../components/AppNav';
import { PremiumPageHeader, premiumHeaderPrimaryAction } from '../components/PremiumPageHeader';
import { supplierService } from '../services/supplier.service';
import { handleApiError } from '../services/api';
import { requestDeletePassword } from '../utils/deleteConfirmation';
import { Supplier, SupplierInput } from '../types';
import { useAuthStore } from '../store/useAuthStore';
import { hasPermission } from '../utils/permissions';
import { nextSort, SortableHeader, SortState, sortByDirection } from '../utils/tableSort';
import { PaginationControls, useClientPagination } from '../components/PaginationControls';

const blankSupplier: SupplierInput = {
  name: '',
  legalName: '',
  taxId: '',
  email: '',
  phone: '',
  contactName: '',
  category: '',
  website: '',
  address: '',
  notes: '',
  active: true,
};

type SupplierSortKey = 'name' | 'category' | 'contactName' | 'active' | 'assets';
const field = 'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const label = 'text-sm font-medium text-slate-700';

function SupplierForm({ supplier, onClose, onSaved }: { supplier: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<SupplierInput>(() => supplier ? {
    name: supplier.name,
    legalName: supplier.legalName || '',
    taxId: supplier.taxId || '',
    email: supplier.email || '',
    phone: supplier.phone || '',
    contactName: supplier.contactName || '',
    category: supplier.category || '',
    website: supplier.website || '',
    address: supplier.address || '',
    notes: supplier.notes || '',
    active: supplier.active,
  } : blankSupplier);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = <K extends keyof SupplierInput>(key: K, value: SupplierInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        legalName: form.legalName || null,
        taxId: form.taxId || null,
        email: form.email || null,
        phone: form.phone || null,
        contactName: form.contactName || null,
        category: form.category || null,
        website: form.website || null,
        address: form.address || null,
        notes: form.notes || null,
      };
      if (supplier) await supplierService.update(supplier.id, payload);
      else await supplierService.create(payload);
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
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Cadastro</p>
            <h2 className="text-xl font-bold text-slate-900">{supplier ? 'Editar fornecedor' : 'Cadastrar fornecedor'}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>

        <div className="grid gap-5 p-6 sm:grid-cols-2">
          {error && <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <label className={label}>Nome do fornecedor *<input required value={form.name} onChange={(event) => update('name', event.target.value)} className={field} placeholder="Intelbras, Dell, revenda..." /></label>
          <label className={label}>Razão social<input value={form.legalName || ''} onChange={(event) => update('legalName', event.target.value)} className={field} /></label>
          <label className={label}>CNPJ / CPF<input value={form.taxId || ''} onChange={(event) => update('taxId', event.target.value)} className={field} placeholder="00.000.000/0000-00" /></label>
          <label className={label}>Categoria<input value={form.category || ''} onChange={(event) => update('category', event.target.value)} className={field} placeholder="Software, hardware, rede..." /></label>
          <label className={label}>Contato<input value={form.contactName || ''} onChange={(event) => update('contactName', event.target.value)} className={field} /></label>
          <label className={label}>Telefone<input value={form.phone || ''} onChange={(event) => update('phone', event.target.value)} className={field} /></label>
          <label className={label}>E-mail<input type="email" value={form.email || ''} onChange={(event) => update('email', event.target.value)} className={field} /></label>
          <label className={label}>Site<input value={form.website || ''} onChange={(event) => update('website', event.target.value)} className={field} placeholder="https://..." /></label>
          <label className={`${label} sm:col-span-2`}>Endereço<input value={form.address || ''} onChange={(event) => update('address', event.target.value)} className={field} /></label>
          <label className={`${label} sm:col-span-2`}>Observações<textarea rows={3} value={form.notes || ''} onChange={(event) => update('notes', event.target.value)} className={field} /></label>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700 sm:col-span-2"><input type="checkbox" checked={form.active} onChange={(event) => update('active', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" /> Fornecedor ativo</label>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button>
          <button disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar fornecedor'}</button>
        </div>
      </form>
    </div>
  );
}

export function Suppliers() {
  const { user } = useAuthStore();
  const canManage = hasPermission(user, 'MANAGE_SUPPLIERS');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [sort, setSort] = useState<SortState<SupplierSortKey>>({ key: 'name', direction: 'asc' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSuppliers(await supplierService.list(search || undefined));
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const summary = useMemo(() => ({
    total: suppliers.length,
    active: suppliers.filter((item) => item.active).length,
    linked: suppliers.reduce((sum, item) => sum + (item._count?.assets || 0) + (item._count?.accessories || 0) + (item._count?.softwareLicenses || 0), 0),
  }), [suppliers]);

  const sortedSuppliers = useMemo(() => sortByDirection(suppliers, sort.direction, (supplier) => {
    if (sort.key === 'assets') return (supplier._count?.assets || 0) + (supplier._count?.accessories || 0) + (supplier._count?.softwareLicenses || 0);
    if (sort.key === 'active') return supplier.active ? 'Ativo' : 'Inativo';
    return supplier[sort.key] || '';
  }), [suppliers, sort]);
  const supplierPagination = useClientPagination(sortedSuppliers, `${search}-${sort.key}-${sort.direction}`);

  const remove = async (supplier: Supplier) => {
    if (!window.confirm(`Excluir fornecedor ${supplier.name}?`)) return;
    const password = requestDeletePassword(`o fornecedor ${supplier.name}`); if (!password) return;
    try {
      await supplierService.delete(supplier.id, password);
      setNotice('Fornecedor excluído.');
      await load();
    } catch (err) {
      setError(handleApiError(err));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <AppNav />
      <main className="mx-auto max-w-[1500px]">
        <PremiumPageHeader eyebrow="Cadastro externo" title="Fornecedores" description="Organize fornecedores e vincule compras de ativos, itens de estoque e licenças." icon={Truck} actions={canManage && <button onClick={() => { setEditing(null); setFormOpen(true); }} className={premiumHeaderPrimaryAction}><Plus size={18} /> Novo fornecedor</button>} />

        {notice && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</div>}
        {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-500">Fornecedores</p><p className="mt-2 text-2xl font-bold text-slate-900">{summary.total}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-500">Ativos</p><p className="mt-2 text-2xl font-bold text-emerald-600">{summary.active}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-500">Vínculos</p><p className="mt-2 text-2xl font-bold text-blue-600">{summary.linked}</p></div>
        </div>

        <div className="mb-5 max-w-lg">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm" placeholder="Buscar por nome, CNPJ, contato, categoria..." />
          </label>
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] divide-y divide-slate-200">
              <thead className="bg-slate-50"><tr>
                {[
                  ['Fornecedor', 'name'],
                  ['Categoria', 'category'],
                  ['Contato', 'contactName'],
                  ['Vínculos', 'assets'],
                  ['Status', 'active'],
                  ['', undefined],
                ].map(([title, key]) => <SortableHeader key={title} label={title || ''} sortKey={key as SupplierSortKey | undefined} current={sort} onSort={(nextKey) => setSort((current) => nextSort(current, nextKey))} />)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? <tr><td colSpan={6} className="py-16 text-center text-sm text-slate-500">Carregando fornecedores...</td></tr>
                  : sortedSuppliers.length ? supplierPagination.paginatedItems.map((supplier) => {
                    const links = (supplier._count?.assets || 0) + (supplier._count?.accessories || 0) + (supplier._count?.softwareLicenses || 0);
                    return (
                      <tr key={supplier.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <span className="rounded-lg bg-slate-100 p-2 text-slate-600"><Building2 size={18} /></span>
                            <div>
                              <p className="font-semibold text-slate-900">{supplier.name}</p>
                              <p className="text-xs text-slate-500">{supplier.legalName || supplier.taxId || 'Sem razão social/CNPJ'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">{supplier.category || 'Não informada'}</td>
                        <td className="px-5 py-4 text-sm text-slate-600"><p>{supplier.contactName || 'Sem contato'}</p><p className="text-xs text-slate-400">{[supplier.email, supplier.phone].filter(Boolean).join(' · ') || 'Sem e-mail/telefone'}</p></td>
                        <td className="px-5 py-4 text-sm text-slate-600"><span className="inline-flex items-center gap-1.5"><PackageSearch size={15} />{links} vínculo(s)</span><p className="text-xs text-slate-400">{supplier._count?.assets || 0} ativos · {supplier._count?.accessories || 0} itens de estoque · {supplier._count?.softwareLicenses || 0} licenças</p></td>
                        <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${supplier.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{supplier.active ? 'Ativo' : 'Inativo'}</span></td>
                        <td className="px-5 py-4 text-right">{canManage ? <><button onClick={() => { setEditing(supplier); setFormOpen(true); }} className="mr-3 text-sm font-semibold text-blue-700 hover:text-blue-900"><Edit3 size={16} className="inline" /> Editar</button><button onClick={() => remove(supplier)} className="text-sm font-semibold text-red-600 hover:text-red-800"><Trash2 size={16} className="inline" /> Excluir</button></> : <span className="text-xs text-slate-400">Somente leitura</span>}</td>
                      </tr>
                    );
                  }) : <tr><td colSpan={6} className="py-16 text-center text-sm text-slate-500">Nenhum fornecedor cadastrado.</td></tr>}
              </tbody>
            </table>
          </div>
          {sortedSuppliers.length > 0 && <PaginationControls {...supplierPagination} />}
        </section>
      </main>

      {canManage && formOpen && <SupplierForm supplier={editing} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); setNotice(editing ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.'); load(); }} />}
    </div>
  );
}
