import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Building2, Edit3, Eye, FileText, KeyRound, Link2, Plus, Printer, Search, Trash2, X } from 'lucide-react';
import { AppNav } from '../components/AppNav';
import { PremiumPageHeader, premiumHeaderPrimaryAction, premiumHeaderSecondaryAction } from '../components/PremiumPageHeader';
import { licenseService } from '../services/license.service';
import { Asset, Company, SoftwareLicense, SoftwareLicenseInput, Supplier } from '../types';
import { handleApiError } from '../services/api';
import { requestDeletePassword } from '../utils/deleteConfirmation';
import { useAuthStore } from '../store/useAuthStore';
import { hasPermission } from '../utils/permissions';
import { nextSort, SortableHeader, SortState, sortByDirection } from '../utils/tableSort';
import { PaginationControls, useClientPagination } from '../components/PaginationControls';

const blankForm: SoftwareLicenseInput = {
  softwareName: '',
  version: '',
  ownerCompanyId: null,
  supplierId: null,
  invoiceNumber: '',
  licenseNumber: '',
  purchasedFrom: '',
  purchaseDate: '',
  seats: 1,
  isPerpetual: false,
  expiresAt: '',
  notes: '',
  assetIds: [],
};

const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';
const normalizeLicenseKey = (value: string | null | undefined) => (value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');
const usageFor = (license: SoftwareLicense) => license.usage || {
  used: license.assets.length,
  available: Math.max(license.seats - license.assets.length, 0),
  exceeded: Math.max(license.assets.length - license.seats, 0),
  detectedByAgent: license.assets.filter((item) => item.detectedByAgent).length,
};
type LicenseSortKey = 'softwareName' | 'ownerCompany' | 'invoiceNumber' | 'licenseNumber' | 'purchaseDate' | 'expiresAt' | 'assetCount';

const validityFor = (license: Pick<SoftwareLicense, 'isPerpetual' | 'expiresAt'>) => {
  if (license.isPerpetual) return { label: 'Vitalícia', detail: 'Sem vencimento', expired: false };
  if (!license.expiresAt) return { label: 'Não informada', detail: 'Defina a validade', expired: false };
  const expiration = new Date(`${license.expiresAt.slice(0, 10)}T23:59:59`);
  const days = Math.ceil((expiration.getTime() - Date.now()) / 86_400_000);
  return {
    label: days < 0 ? 'Vencida' : days === 0 ? 'Vence hoje' : `${days} dia(s)`,
    detail: formatDate(license.expiresAt),
    expired: days < 0,
  };
};

function LicenseForm({ license, companies, assets, suppliers, onClose, onSaved }: {
  license: SoftwareLicense | null;
  companies: Company[];
  assets: Asset[];
  suppliers: Supplier[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<SoftwareLicenseInput>(() => license ? {
    softwareName: license.softwareName,
    version: license.version || '',
    ownerCompanyId: license.ownerCompanyId,
    supplierId: license.supplierId,
    invoiceNumber: license.invoiceNumber || '',
    licenseNumber: license.licenseNumber,
    purchasedFrom: license.purchasedFrom || '',
    purchaseDate: license.purchaseDate?.slice(0, 10) || '',
    seats: license.seats,
    isPerpetual: license.isPerpetual,
    expiresAt: license.expiresAt?.slice(0, 10) || '',
    notes: license.notes || '',
    assetIds: license.assets.filter((item) => item.source !== 'AGENT').map((item) => item.assetId),
  } : blankForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAssets, setShowAssets] = useState(false);
  const [assetSearch, setAssetSearch] = useState('');
  const [assetCompanyFilter, setAssetCompanyFilter] = useState('');
  const [assetLinkFilter, setAssetLinkFilter] = useState<'ALL' | 'LINKED' | 'UNLINKED'>('ALL');
  const [autoLinkedKey, setAutoLinkedKey] = useState('');
  const inputClass = 'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
  const labelClass = 'text-sm font-medium text-slate-700';

  const update = <K extends keyof SoftwareLicenseInput>(key: K, value: SoftwareLicenseInput[K]) => setForm((current) => ({ ...current, [key]: value }));

  const detectedAssetIds = useMemo(() => new Set(license?.assets.filter((item) => item.detectedByAgent).map((item) => item.assetId) || []), [license]);
  const effectiveAssetIds = useMemo(() => [...new Set([...form.assetIds, ...detectedAssetIds])], [form.assetIds, detectedAssetIds]);
  const effectiveAssetIdSet = useMemo(() => new Set(effectiveAssetIds), [effectiveAssetIds]);

  const filteredAssets = useMemo(() => {
    const term = assetSearch.trim().toLowerCase();
    return assets.filter((asset) => {
      if (assetCompanyFilter && asset.companyId !== assetCompanyFilter) return false;
      const linked = effectiveAssetIdSet.has(asset.id);
      if (assetLinkFilter === 'LINKED' && !linked) return false;
      if (assetLinkFilter === 'UNLINKED' && linked) return false;
      if (!term) return true;
      return [
        asset.name,
        asset.assetTag,
        asset.ipAddress,
        asset.hostname,
        asset.serialNumber,
        asset.manufacturer,
        asset.model,
        asset.windowsLicenseKey,
        asset.windowsProductKeyPartial,
        asset.company?.name,
        ...(asset.softwareLicenses || []).map((item) => item.license.softwareName),
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(term));
    });
  }, [assets, assetSearch, assetCompanyFilter, assetLinkFilter, effectiveAssetIdSet]);

  const linkedLicensesFor = (asset: Asset) => (asset.softwareLicenses || []).filter((item) => item.licenseId !== license?.id);
  const detectedLinkFor = (assetId: string) => license?.assets.find((item) => item.assetId === assetId && item.detectedByAgent);
  const normalizedFormKey = normalizeLicenseKey(form.licenseNumber);
  const windowsKeyAssets = useMemo(() => normalizedFormKey.length >= 25 ? assets.filter((asset) => normalizeLicenseKey(asset.windowsLicenseKey) === normalizedFormKey) : [], [assets, normalizedFormKey]);

  useEffect(() => {
    if (!windowsKeyAssets.length || autoLinkedKey === normalizedFormKey) return;
    const missingIds = windowsKeyAssets.map((asset) => asset.id).filter((id) => !form.assetIds.includes(id));
    if (missingIds.length) update('assetIds', [...form.assetIds, ...missingIds]);
    setAutoLinkedKey(normalizedFormKey);
  }, [windowsKeyAssets, normalizedFormKey, autoLinkedKey, form.assetIds]);

  const toggleAsset = (assetId: string) => {
    if (detectedAssetIds.has(assetId)) {
      setError('Este uso foi detectado pelo agente e será removido automaticamente quando o software não estiver mais instalado.');
      return;
    }
    if (!form.assetIds.includes(assetId) && effectiveAssetIds.length >= Number(form.seats || 0)) {
      setError(`Todas as ${form.seats} posições desta licença já estão em uso.`);
      return;
    }
    const asset = assets.find((item) => item.id === assetId);
    const linkedLicenses = asset ? linkedLicensesFor(asset) : [];
    if (!form.assetIds.includes(assetId) && linkedLicenses.length > 0) {
      const confirmLink = window.confirm(`Este ativo já possui ${linkedLicenses.length} licença(s): ${linkedLicenses.map((item) => item.license.softwareName).join(', ')}. Deseja vincular mesmo assim?`);
      if (!confirmLink) return;
    }
    setError('');
    update('assetIds', form.assetIds.includes(assetId) ? form.assetIds.filter((id) => id !== assetId) : [...form.assetIds, assetId]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (effectiveAssetIds.length > Number(form.seats)) {
      setError(`Existem ${effectiveAssetIds.length} instalações para somente ${form.seats} posições. Aumente a quantidade ou remova vínculos manuais.`);
      return;
    }
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        ownerCompanyId: form.ownerCompanyId || null,
        supplierId: form.supplierId || null,
        purchaseDate: form.purchaseDate || null,
        expiresAt: form.isPerpetual ? null : form.expiresAt || null,
        seats: Number(form.seats) || 1,
      };
      if (license) await licenseService.update(license.id, payload);
      else await licenseService.create(payload);
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
      <div className="relative h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-5">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Licenciamento</p><h2 className="text-xl font-bold text-slate-900">{license ? 'Editar licença' : 'Cadastrar licença'}</h2></div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="space-y-7 p-6">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <section>
            <h3 className="mb-4 font-semibold text-slate-900">Dados da licença</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>Software *<input required value={form.softwareName} onChange={(e) => update('softwareName', e.target.value)} className={inputClass} placeholder="Microsoft Office" /></label>
              <label className={labelClass}>Versão<input value={form.version || ''} onChange={(e) => update('version', e.target.value)} className={inputClass} placeholder="2021 / 365 / Pro" /></label>
              <label className={labelClass}>Empresa proprietária<select value={form.ownerCompanyId || ''} onChange={(e) => update('ownerCompanyId', e.target.value || null)} className={inputClass}><option value="">Não informada</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
              <label className={labelClass}>Nº da nota fiscal<input value={form.invoiceNumber || ''} onChange={(e) => update('invoiceNumber', e.target.value)} className={inputClass} placeholder="NF-000123" /></label>
              <label className={labelClass}>Nº da licença *<input required value={form.licenseNumber} onChange={(e) => update('licenseNumber', e.target.value)} className={inputClass} placeholder="XXXXX-XXXXX-XXXXX" /></label>
              <label className={labelClass}>Fornecedor cadastrado<select value={form.supplierId || ''} onChange={(e) => update('supplierId', e.target.value || null)} className={inputClass}><option value="">Sem fornecedor vinculado</option>{suppliers.filter((supplier) => supplier.active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
              <label className={labelClass}>Adquirida de / observação<input value={form.purchasedFrom || ''} onChange={(e) => update('purchasedFrom', e.target.value)} className={inputClass} placeholder="Fornecedor manual / revenda" /></label>
              <label className={labelClass}>Data da compra<input type="date" value={form.purchaseDate || ''} onChange={(e) => update('purchaseDate', e.target.value)} className={inputClass} /></label>
              <label className={labelClass}>Quantidade de licenças<input type="number" min={1} value={form.seats} onChange={(e) => update('seats', Number(e.target.value))} className={inputClass} /></label>
              <label className={labelClass}>Validade<select value={form.isPerpetual ? 'PERPETUAL' : 'EXPIRATION'} onChange={(e) => update('isPerpetual', e.target.value === 'PERPETUAL')} className={inputClass}><option value="EXPIRATION">Possui vencimento</option><option value="PERPETUAL">Vitalícia</option></select></label>
              {!form.isPerpetual && <label className={labelClass}>Data de vencimento *<input required type="date" value={form.expiresAt || ''} onChange={(e) => update('expiresAt', e.target.value)} className={inputClass} /></label>}
            </div>
            <label className={`${labelClass} mt-4 block`}>Observações<textarea value={form.notes || ''} onChange={(e) => update('notes', e.target.value)} className={`${inputClass} min-h-24`} /></label>
          </section>
          <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={showAssets} onChange={(event) => setShowAssets(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600" />
                <span><strong className="block text-sm text-slate-900">Ativos</strong><span className="block text-xs text-slate-500">Marque para buscar equipamentos e atribuir esta licença.</span></span>
              </label>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${effectiveAssetIds.length > Number(form.seats) ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'}`}>{effectiveAssetIds.length} de {form.seats} em uso</span>
            </div>
            {showAssets && <div className="mt-4 border-t border-slate-200 pt-4">
            <p className="mb-3 text-sm text-slate-500">Selecione os ativos que usam esta licença. Instalações encontradas pelo agente são marcadas automaticamente.</p>
            {windowsKeyAssets.length > 0 && <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Chave do Windows encontrada em {windowsKeyAssets.length} ativo(s): {windowsKeyAssets.map((asset) => asset.name).join(', ')}. O vínculo foi marcado automaticamente.</div>}
            <label className="relative mb-3 block">
              <span className="sr-only">Buscar ativo</span>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                value={assetSearch}
                onChange={(event) => setAssetSearch(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="Buscar ativo por nome, IP, série..."
              />
            </label>
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>Empresa<select value={assetCompanyFilter} onChange={(event) => setAssetCompanyFilter(event.target.value)} className={inputClass}><option value="">Todas as empresas</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
              <label className={labelClass}>Vínculo<select value={assetLinkFilter} onChange={(event) => setAssetLinkFilter(event.target.value as 'ALL' | 'LINKED' | 'UNLINKED')} className={inputClass}><option value="ALL">Todos os ativos</option><option value="LINKED">Somente vinculados</option><option value="UNLINKED">Somente não vinculados</option></select></label>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white">
              {filteredAssets.map((asset) => {
                const linkedLicenses = linkedLicensesFor(asset);
                const detectedLink = detectedLinkFor(asset.id);
                return (
                <label key={asset.id} className={`flex cursor-pointer items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0 hover:bg-slate-50 ${linkedLicenses.length ? 'bg-amber-50/40' : ''}`}>
                  <span><strong className="text-slate-800">{asset.name}</strong><span className="block text-xs text-slate-500">{asset.ipAddress || asset.hostname || 'Sem IP/hostname'}</span><span className="block text-xs text-slate-400">{asset.company?.name || 'Empresa não informada'}</span></span>
                  <span className="ml-auto text-right">{detectedLink && <span className="block max-w-72 text-xs font-semibold text-emerald-700">Detectado pelo agente: {detectedLink.detectedApplicationName}{detectedLink.detectedApplicationVersion ? ` ${detectedLink.detectedApplicationVersion}` : ''}</span>}{linkedLicenses.length > 0 && <span className="block max-w-72 text-xs font-semibold text-amber-700">Já possui {linkedLicenses.length} licença(s): {linkedLicenses.map((item) => item.license.softwareName).join(', ')}</span>}</span>
                  <input type="checkbox" checked={effectiveAssetIds.includes(asset.id)} onChange={() => toggleAsset(asset.id)} className="h-4 w-4 rounded border-slate-300 text-blue-600" aria-label={detectedLink ? 'Instalação detectada pelo agente' : `Vincular ${asset.name}`} />
                </label>
                );
              })}
              {!filteredAssets.length && <p className="px-4 py-6 text-center text-sm text-slate-500">{assetSearch ? 'Nenhum ativo encontrado para essa busca.' : 'Nenhum ativo disponível.'}</p>}
            </div>
            <p className="mt-2 text-right text-xs text-slate-500">{filteredAssets.length} ativo(s) exibido(s)</p>
            </div>}
          </section>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button>
            <button disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar licença'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LicenseDetails({ license, onClose, onEdit }: { license: SoftwareLicense; onClose: () => void; onEdit?: () => void }) {
  const usage = usageFor(license);
  const validity = validityFor(license);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[1px]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 cursor-default" aria-hidden="true" />
      <div className="relative h-full w-full max-w-3xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-5">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Licenciamento</p><h2 className="text-xl font-bold text-slate-900">{license.softwareName}</h2><p className="mt-1 text-sm text-slate-500">{license.version || 'Sem versão'} · {license.seats} licença(s)</p></div>
          <div className="flex items-center gap-2">{onEdit && <button onClick={onEdit} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"><Edit3 size={16} /> Editar</button>}<button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button></div>
        </div>
        <div className="space-y-6 p-6">
          <section className="grid gap-3 sm:grid-cols-2">
            <div className={`rounded-xl border p-4 ${usage.exceeded ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'}`}><p className="text-xs font-semibold uppercase text-slate-500">Utilização</p><p className={`mt-1 text-xl font-bold ${usage.exceeded ? 'text-red-700' : 'text-blue-700'}`}>{usage.used} de {license.seats}</p><p className="mt-1 text-xs text-slate-500">{usage.exceeded ? `${usage.exceeded} acima do contratado` : `${usage.available} disponível(is)`}</p></div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Detectadas pelo agente</p><p className="mt-1 text-xl font-bold text-emerald-700">{usage.detectedByAgent}</p><p className="mt-1 text-xs text-slate-500">Instalações identificadas nas máquinas</p></div>
            <div className={`rounded-xl border p-4 ${validity.expired ? 'border-red-200 bg-red-50' : 'border-violet-200 bg-violet-50'}`}><p className="text-xs font-semibold uppercase text-slate-500">Validade</p><p className={`mt-1 text-xl font-bold ${validity.expired ? 'text-red-700' : 'text-violet-700'}`}>{validity.label}</p><p className="mt-1 text-xs text-slate-500">{validity.detail}</p></div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Empresa proprietária</p><p className="mt-1 font-semibold text-slate-900">{license.ownerCompany?.name || 'Não informada'}</p></div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Fornecedor</p><p className="mt-1 font-semibold text-slate-900">{license.supplier?.name || license.purchasedFrom || 'Não informado'}</p></div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Nota fiscal</p><p className="mt-1 font-mono text-sm font-semibold text-slate-900">{license.invoiceNumber || '—'}</p></div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Data da compra</p><p className="mt-1 font-semibold text-slate-900">{formatDate(license.purchaseDate)}</p></div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2"><p className="text-xs font-semibold uppercase text-slate-500">Número da licença</p><p className="mt-1 break-words font-mono text-sm font-semibold text-slate-900">{license.licenseNumber}</p></div>
          </section>
          <section>
            <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-semibold text-slate-900">Ativos utilizando</h3><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{usage.used} ativo(s)</span></div>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              {license.assets.length ? license.assets.map(({ id, asset }) => (
                <div key={id} className="grid gap-2 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0 sm:grid-cols-[1.2fr_1fr_1fr]">
                  <div><p className="font-semibold text-slate-900">{asset.name}</p><p className="text-xs text-slate-500">{asset.ipAddress || asset.hostname || 'Sem IP/hostname'}</p>{license.assets.find((item) => item.id === id)?.detectedByAgent && <p className="mt-1 text-xs font-semibold text-emerald-700">Agente: {license.assets.find((item) => item.id === id)?.detectedApplicationName || 'instalação detectada'}</p>}</div>
                  <div><p className="text-xs font-semibold uppercase text-slate-400">IP</p><p className="font-mono text-slate-700">{asset.ipAddress || '—'}</p></div>
                  <div><p className="text-xs font-semibold uppercase text-slate-400">Hostname</p><p className="text-slate-700">{asset.hostname || '—'}</p></div>
                </div>
              )) : <p className="px-4 py-8 text-center text-sm text-slate-500">Nenhum ativo vinculado a esta licença.</p>}
            </div>
          </section>
          {license.assignmentHistory && license.assignmentHistory.length > 0 && <section><h3 className="mb-3 font-semibold text-slate-900">Histórico de atribuições</h3><div className="overflow-hidden rounded-xl border border-slate-200">{license.assignmentHistory.map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-sm last:border-0"><div><p className="font-semibold text-slate-800">{entry.action === 'ASSIGNED' ? 'Atribuída' : entry.action === 'UNASSIGNED' ? 'Removida' : 'Detectada'} · {entry.asset.name}</p><p className="text-xs text-slate-500">{entry.asset.assetTag} · {entry.source === 'MANUAL' ? 'Manual' : 'Agente'}</p></div><div className="text-right text-xs text-slate-500"><p>{new Date(entry.createdAt).toLocaleString('pt-BR')}</p><p>{entry.performedBy?.name || 'Sistema'}</p></div></div>)}</div></section>}
          {license.notes && <section className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Observações</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{license.notes}</p></section>}
        </div>
      </div>
    </div>
  );
}

type LicenseReportRow = {
  id: string;
  license: SoftwareLicense;
  asset: SoftwareLicense['assets'][number]['asset'] | null;
};

function LicenseReportModal({ licenses, onClose, onPrint }: { licenses: SoftwareLicense[]; onClose: () => void; onPrint: () => void }) {
  const rows = licenses.flatMap((license): LicenseReportRow[] => license.assets.length
    ? license.assets.map(({ id, asset }) => ({ id, license, asset }))
    : [{ id: `${license.id}-unlinked`, license, asset: null }]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="license-report-title">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-violet-600">Relatório de licenças</p><h2 id="license-report-title" className="text-xl font-bold text-slate-900">Aquisição e utilização</h2><p className="mt-1 text-sm text-slate-500">{licenses.length} licença(s) · {rows.length} linha(s) no relatório</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar relatório"><X size={20} /></button>
        </div>
        <div className="overflow-auto p-6">
          <table className="min-w-[900px] w-full divide-y divide-slate-200 rounded-xl border border-slate-200 text-left">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Software</th><th className="px-4 py-3">Adquirida por</th><th className="px-4 py-3">Validade</th><th className="px-4 py-3">Número da licença</th><th className="px-4 py-3">Ativo utilizando</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{rows.length ? rows.map(({ id, license, asset }) => { const validity = validityFor(license); return <tr key={id} className="text-sm"><td className="px-4 py-3"><p className="font-semibold text-slate-900">{license.softwareName}</p><p className="text-xs text-slate-500">{license.version || 'Sem versão'}</p></td><td className="px-4 py-3 text-slate-700">{license.ownerCompany?.name || 'Não informado'}</td><td className={`px-4 py-3 font-semibold ${validity.expired ? 'text-red-700' : 'text-slate-700'}`}>{validity.label}<p className="text-xs font-normal text-slate-500">{validity.detail}</p></td><td className="px-4 py-3 font-mono text-xs text-slate-700">{license.licenseNumber}</td><td className="px-4 py-3"><p className="font-semibold text-slate-800">{asset?.name || 'Nenhum ativo vinculado'}</p>{asset && <p className="text-xs text-slate-500">{asset.assetTag}{asset.hostname ? ` · ${asset.hostname}` : ''}</p>}</td></tr>; }) : <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">Nenhuma licença para exibir.</td></tr>}</tbody>
          </table>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Fechar</button><button type="button" onClick={onPrint} disabled={!rows.length} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"><Printer size={17} /> Imprimir / Salvar PDF</button></div>
      </div>
    </div>
  );
}

export function Licenses() {
  const { user } = useAuthStore();
  const canManage = hasPermission(user, 'MANAGE_LICENSES');
  const [licenses, setLicenses] = useState<SoftwareLicense[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SoftwareLicense | null>(null);
  const [viewing, setViewing] = useState<SoftwareLicense | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [sort, setSort] = useState<SortState<LicenseSortKey>>({ key: 'softwareName', direction: 'asc' });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [licenseList, options] = await Promise.all([
        licenseService.list({ search }),
        licenseService.options(),
      ]);
      setLicenses(licenseList);
      setCompanies(options.companies);
      setAssets(options.assets);
      setSuppliers(options.suppliers || []);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const sortedLicenses = useMemo(() => sortByDirection(licenses, sort.direction, (license) => {
    if (sort.key === 'ownerCompany') return license.ownerCompany?.name || '';
    if (sort.key === 'assetCount') return license.assets.length;
    return license[sort.key] || '';
  }), [licenses, sort]);
  const licensePagination = useClientPagination(sortedLicenses, `${search}-${sort.key}-${sort.direction}`);

  const remove = async (license: SoftwareLicense) => {
    if (!window.confirm(`Excluir licença de ${license.softwareName}?`)) return;
    const password = requestDeletePassword(`a licença de ${license.softwareName}`); if (!password) return;
    try { await licenseService.delete(license.id, password); setNotice('Licença excluída.'); await load(); }
    catch (err) { setError(handleApiError(err)); }
  };

  const printLicenseReport = () => {
    const rows = sortedLicenses.flatMap((license) => {
      const assetsInUse = license.assets.length ? license.assets.map((item) => item.asset) : [null];
      const validity = validityFor(license);
      return assetsInUse.map((asset) => `<tr><td>${escapeHtml(license.softwareName)}${license.version ? `<br><small>${escapeHtml(license.version)}</small>` : ''}</td><td>${escapeHtml(license.ownerCompany?.name || 'Não informado')}</td><td>${escapeHtml(validity.label)}<br><small>${escapeHtml(validity.detail)}</small></td><td class="license">${escapeHtml(license.licenseNumber)}</td><td>${escapeHtml(asset?.name || 'Nenhum ativo vinculado')}${asset ? `<br><small>${escapeHtml(asset.assetTag)}${asset.hostname ? ` · ${escapeHtml(asset.hostname)}` : ''}</small>` : ''}</td></tr>`);
    }).join('');
    const popup = window.open('', '_blank', 'width=1200,height=800');
    if (!popup) {
      setError('Não foi possível abrir o relatório. Verifique se o navegador bloqueou pop-ups.');
      return;
    }
    popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de Licenças</title><style>body{font-family:Arial,sans-serif;color:#0f172a;margin:24px}h1{margin:0;font-size:24px}.meta{color:#64748b;font-size:12px;margin:6px 0 18px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #cbd5e1;padding:9px;text-align:left;vertical-align:top}th{background:#f1f5f9;text-transform:uppercase;font-size:10px}.license{font-family:monospace;word-break:break-all}small{color:#64748b}@media print{button{display:none}body{margin:12mm}}</style></head><body><button onclick="window.print()" style="margin-bottom:16px;padding:8px 12px">Imprimir / Salvar PDF</button><h1>Relatório de Licenças</h1><p class="meta">Gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))} · ${sortedLicenses.length} licença(s)</p><table><thead><tr><th>Software</th><th>Adquirida por</th><th>Validade</th><th>Número da licença</th><th>Ativo utilizando</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Nenhuma licença encontrada</td></tr>'}</tbody></table><script>setTimeout(() => window.print(), 300);</script></body></html>`);
    popup.document.close();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <AppNav />
      <main className="mx-auto max-w-[1500px]">
        <PremiumPageHeader eyebrow="Gestão de software" title="Licenças" description="Controle notas, chaves, fornecedores e vínculo com ativos." icon={KeyRound} actions={<><button onClick={() => setReportOpen(true)} className={premiumHeaderSecondaryAction}><Printer size={18} /> Relatório</button>{canManage && <button onClick={() => { setEditing(null); setFormOpen(true); }} className={premiumHeaderPrimaryAction}><Plus size={18} /> Nova licença</button>}</>} />
        {notice && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="mb-5 max-w-xl"><label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm" placeholder="Buscar por software, nota, licença ou fornecedor..." /></label></div>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] divide-y divide-slate-200">
              <thead className="bg-slate-50"><tr>
                {[
                  ['Software', 'softwareName'],
                  ['Empresa proprietária', 'ownerCompany'],
                  ['Nota fiscal', 'invoiceNumber'],
                  ['Licença', 'licenseNumber'],
                  ['Compra', 'purchaseDate'],
                  ['Validade', 'expiresAt'],
                  ['Ativos', 'assetCount'],
                  ['', undefined],
                ].map(([title, key]) => <SortableHeader key={title} label={title || ''} sortKey={key as LicenseSortKey | undefined} current={sort} onSort={(nextKey) => setSort((current) => nextSort(current, nextKey))} />)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? <tr><td colSpan={8} className="px-5 py-8"><div className="space-y-3" aria-label="Carregando licenças"><div className="premium-skeleton h-4 w-1/4 rounded-full" /><div className="premium-skeleton h-12 w-full rounded-xl" /><div className="premium-skeleton h-12 w-full rounded-xl" /><div className="premium-skeleton h-12 w-3/4 rounded-xl" /></div></td></tr> : sortedLicenses.length ? licensePagination.paginatedItems.map((license) => (
                  <tr key={license.id}>
                    <td className="px-5 py-4"><p className="font-semibold text-slate-900">{license.softwareName}</p><p className="text-xs text-slate-500">{license.version || 'Sem versão'} · {license.seats} licença(s)</p>{usageFor(license).detectedByAgent > 0 && <p className="mt-1 text-xs font-semibold text-emerald-700">{usageFor(license).detectedByAgent} detectada(s) pelo agente</p>}</td>
                    <td className="px-5 py-4 text-sm text-slate-600"><span className="inline-flex items-center gap-1.5"><Building2 size={15} />{license.ownerCompany?.name || 'Não informada'}</span></td>
                    <td className="px-5 py-4 text-sm text-slate-600"><span className="inline-flex items-center gap-1.5"><FileText size={15} />{license.invoiceNumber || '—'}</span></td>
                    <td className="px-5 py-4 font-mono text-xs text-slate-700">{license.licenseNumber}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{formatDate(license.purchaseDate)}<p className="text-xs text-slate-400">{license.supplier?.name || license.purchasedFrom || 'Fornecedor não informado'}</p></td>
                    <td className={`px-5 py-4 text-sm font-semibold ${validityFor(license).expired ? 'text-red-700' : 'text-slate-700'}`}>{validityFor(license).label}<p className="text-xs font-normal text-slate-400">{validityFor(license).detail}</p></td>
                    <td className="px-5 py-4 text-sm text-slate-600"><button type="button" onClick={() => setViewing(license)} className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-semibold hover:bg-blue-50 ${usageFor(license).exceeded ? 'text-red-700' : 'text-blue-700'}`}><Link2 size={15} />{usageFor(license).used}/{license.seats} em uso</button><p className={`mt-1 text-xs font-semibold ${usageFor(license).exceeded ? 'text-red-600' : 'text-emerald-600'}`}>{usageFor(license).exceeded ? `${usageFor(license).exceeded} acima do limite` : `${usageFor(license).available} disponível(is)`}</p>{license.assets[0]?.asset && <p className="mt-1 max-w-60 truncate text-xs text-slate-400">{license.assets.map((item) => item.asset.name).join(', ')}</p>}</td>
                    <td className="px-5 py-4 text-right">{canManage ? <><button onClick={() => setViewing(license)} className="mr-3 text-sm font-semibold text-slate-700"><Eye size={16} className="inline" /> Ver</button><button onClick={() => { setEditing(license); setViewing(null); setFormOpen(true); }} className="mr-3 text-sm font-semibold text-blue-700"><Edit3 size={16} className="inline" /> Editar</button><button onClick={() => remove(license)} className="text-sm font-semibold text-red-600"><Trash2 size={16} className="inline" /> Excluir</button></> : <button onClick={() => setViewing(license)} className="text-sm font-semibold text-blue-700"><Eye size={16} className="inline" /> Ver</button>}</td>
                  </tr>
                )) : <tr><td colSpan={8} className="py-16 text-center text-sm text-slate-500">Nenhuma licença cadastrada.</td></tr>}
              </tbody>
            </table>
          </div>
          {sortedLicenses.length > 0 && <PaginationControls {...licensePagination} />}
        </section>
      </main>
      {viewing && <LicenseDetails license={viewing} onClose={() => setViewing(null)} onEdit={canManage ? () => { setEditing(viewing); setViewing(null); setFormOpen(true); } : undefined} />}
      {reportOpen && <LicenseReportModal licenses={sortedLicenses} onClose={() => setReportOpen(false)} onPrint={printLicenseReport} />}
      {formOpen && <LicenseForm license={editing} companies={companies} assets={assets} suppliers={suppliers} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); setNotice(editing ? 'Licença atualizada.' : 'Licença cadastrada.'); load(); }} />}
    </div>
  );
}
