import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Building2, Edit3, Mail, MapPin, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { AppNav } from '../components/AppNav';
import { PremiumPageHeader, premiumHeaderPrimaryAction } from '../components/PremiumPageHeader';
import { companyService } from '../services/company.service';
import { handleApiError } from '../services/api';
import { requestDeletePassword } from '../utils/deleteConfirmation';
import { Company, CompanyInput } from '../types';
import { useAuthStore } from '../store/useAuthStore';
import { hasPermission } from '../utils/permissions';

const blankCompany: CompanyInput = { name: '', legalName: '', code: '', taxId: '', email: '', phone: '', address: '', active: true };

function CompanyForm({ company, onClose, onSaved }: { company: Company | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CompanyInput>(() => company ? {
    name: company.name, legalName: company.legalName || '', code: company.code, taxId: company.taxId || '',
    email: company.email || '', phone: company.phone || '', address: company.address || '', active: company.active,
  } : blankCompany);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const update = <K extends keyof CompanyInput>(key: K, value: CompanyInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const field = 'mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try { company ? await companyService.update(company.id, form) : await companyService.create(form); onSaved(); }
    catch (err) { setError(handleApiError(err)); }
    finally { setSaving(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true">
    <div className="absolute inset-0" aria-hidden="true" />
    <form onSubmit={submit} className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-600">Alocação patrimonial</p><h2 className="text-xl font-bold text-slate-900">{company ? 'Editar empresa' : 'Cadastrar empresa'}</h2></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button></div>
      <div className="grid gap-5 p-6 sm:grid-cols-2">
        {error && <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <label className="text-sm font-medium text-slate-700">Nome da empresa *<input required value={form.name} onChange={(e) => update('name', e.target.value)} className={field} placeholder="Empresa do Grupo" /></label>
        <label className="text-sm font-medium text-slate-700">Código *<input required value={form.code} onChange={(e) => update('code', e.target.value.toUpperCase())} className={field} placeholder="EMP01" /></label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Razão social<input value={form.legalName || ''} onChange={(e) => update('legalName', e.target.value)} className={field} /></label>
        <label className="text-sm font-medium text-slate-700">CNPJ<input value={form.taxId || ''} onChange={(e) => update('taxId', e.target.value)} className={field} placeholder="00.000.000/0001-00" /></label>
        <label className="text-sm font-medium text-slate-700">Telefone<input value={form.phone || ''} onChange={(e) => update('phone', e.target.value)} className={field} /></label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">E-mail<input type="email" value={form.email || ''} onChange={(e) => update('email', e.target.value)} className={field} /></label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Endereço<textarea rows={3} value={form.address || ''} onChange={(e) => update('address', e.target.value)} className={field} /></label>
        <label className="flex items-center gap-3 text-sm font-medium text-slate-700 sm:col-span-2"><input type="checkbox" checked={form.active} onChange={(e) => update('active', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" /> Empresa ativa</label>
      </div>
      <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button><button disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar empresa'}</button></div>
    </form>
  </div>;
}

export function Companies() {
  const { user } = useAuthStore();
  const canManageCompanies = hasPermission(user, 'MANAGE_COMPANIES');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Company | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setCompanies(await companyService.list(search || undefined)); }
    catch (err) { setError(handleApiError(err)); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { const timer = window.setTimeout(load, 250); return () => clearTimeout(timer); }, [load]);
  const remove = async (company: Company) => {
    if (!window.confirm(`Excluir a empresa ${company.name}?`)) return;
    const password = requestDeletePassword(`a empresa ${company.name}`); if (!password) return;
    try { await companyService.delete(company.id, password); load(); }
    catch (err) { setError(handleApiError(err)); }
  };

  return <div className="min-h-screen bg-slate-50 p-4 sm:p-6"><AppNav /><main className="mx-auto max-w-[1500px]">
    <PremiumPageHeader eyebrow="Alocação dos ativos" title="Empresas" description="Cadastre as empresas onde os ativos estão instalados ou em uso." icon={Building2} actions={canManageCompanies && <button onClick={() => { setEditing(null); setFormOpen(true); }} className={premiumHeaderPrimaryAction}><Plus size={18} /> Nova empresa</button>} />
    {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    <div className="mb-5 max-w-lg"><label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm" placeholder="Buscar por nome, código ou CNPJ..." /></label></div>
    {loading ? <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-500">Carregando empresas...</div> : companies.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{companies.map((company) => <article key={company.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md"><div className="flex items-start justify-between"><div className="flex gap-3"><span className="rounded-xl bg-blue-50 p-3 text-blue-700"><Building2 size={22} /></span><div><h2 className="font-bold text-slate-900">{company.name}</h2><p className="text-sm text-slate-500">{company.code}{company.taxId ? ` · ${company.taxId}` : ''}</p></div></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${company.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{company.active ? 'Ativa' : 'Inativa'}</span></div><div className="mt-5 space-y-2 text-sm text-slate-600">{company.email && <p className="flex items-center gap-2"><Mail size={15} />{company.email}</p>}{company.address && <p className="flex items-center gap-2"><MapPin size={15} />{company.address}</p>}<p className="flex items-center gap-2"><Users size={15} />{company._count?.users || 0} usuários · {company._count?.assets || 0} ativos</p></div>{canManageCompanies && <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4"><button onClick={() => { setEditing(company); setFormOpen(true); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"><Edit3 size={15} /> Editar</button><button onClick={() => remove(company)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"><Trash2 size={15} /> Excluir</button></div>}</article>)}</div> : <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center"><Building2 className="mx-auto text-slate-300" size={42} /><h2 className="mt-3 font-bold text-slate-700">Nenhuma empresa cadastrada</h2><p className="mt-1 text-sm text-slate-500">Cadastre as empresas para organizar os ativos do grupo.</p></div>}
  </main>{formOpen && <CompanyForm company={editing} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); load(); }} />}</div>;
}
