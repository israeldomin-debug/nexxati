import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArchiveX, ArrowRightLeft, BarChart3, Edit3, History, LogOut, Package, Plus, Search, Trash2, X } from 'lucide-react';
import { AppNav } from '../components/AppNav';
import { PremiumPageHeader, premiumHeaderPrimaryAction, premiumHeaderSecondaryAction } from '../components/PremiumPageHeader';
import { Accessory, AccessoryInput, AccessoryMovement, AccessoryMovementInput, Asset, Company, Supplier, User } from '../types';
import { accessoryService } from '../services/accessory.service';
import { assetService } from '../services/asset.service';
import { disposalService } from '../services/disposal.service';
import { companyService } from '../services/company.service';
import { supplierService } from '../services/supplier.service';
import { userService } from '../services/user.service';
import { handleApiError } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { hasPermission } from '../utils/permissions';
import { nextSort, SortableHeader, SortState, sortByDirection } from '../utils/tableSort';
import { PaginationControls, useClientPagination } from '../components/PaginationControls';
import { CancelAccessoryMovementModal } from '../components/CancelAccessoryMovementModal';
import { requestDeletePassword } from '../utils/deleteConfirmation';
import { matchesRegistrationDate, matchesStock, stockQuantity, StockFilter } from '../utils/stockFilters';

const blankAccessory: AccessoryInput = {
  name: '',
  category: '',
  quantity: 0,
  minQuantity: 0,
  unit: 'un',
  condition: 'NEW',
  imageUrl: '',
  serialNumber: '',
  partNumber: '',
  bandFrequency: '',
  manufacturer: '',
  model: '',
  location: '',
  companyId: null,
  supplierId: null,
  purchasedByCompanyId: null,
  purchaseSupplier: '',
  purchaseInvoiceNumber: '',
  purchaseInvoiceAccessKey: '',
  purchaseDate: '',
  warrantyExpires: '',
  purchaseCost: null,
  notes: '',
  active: true,
};

const categoryOptions = ['DVR', 'Cooler', 'SSD', 'NVMe', 'Nobreak', 'Switch', 'Roteador', 'Telefone', 'Cabo', 'Fonte', 'Memória', 'Periférico', 'Outro'];
const locationOptions = ['Armário', 'Gaveta', 'Arquivo Morto'];
const conditionLabels = { NEW: 'Novo', USED: 'Usado' } as const;
const field = 'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const backendUrl = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');
const uploadUrl = (path?: string | null) => path ? `${backendUrl}${path}` : '';
type AccessorySortKey = 'name' | 'category' | 'condition' | 'quantity' | 'minQuantity' | 'location' | 'status' | 'company';

function AccessoryForm({ accessory, companies, suppliers, onClose, onSaved }: { accessory: Accessory | null; companies: Company[]; suppliers: Supplier[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<AccessoryInput>(() => accessory ? {
    name: accessory.name,
    category: accessory.category,
    quantity: accessory.quantity,
    minQuantity: accessory.minQuantity,
    unit: accessory.unit,
    condition: accessory.condition || 'NEW',
    imageUrl: accessory.imageUrl || '',
    serialNumber: accessory.serialNumber || '',
    partNumber: accessory.partNumber || '',
    bandFrequency: accessory.bandFrequency || '',
    manufacturer: accessory.manufacturer || '',
    model: accessory.model || '',
    location: accessory.location || '',
    companyId: accessory.companyId,
    supplierId: accessory.supplierId,
    purchasedByCompanyId: accessory.purchasedByCompanyId,
    purchaseSupplier: accessory.purchaseSupplier || '',
    purchaseInvoiceNumber: accessory.purchaseInvoiceNumber || '',
    purchaseInvoiceAccessKey: accessory.purchaseInvoiceAccessKey || '',
    purchaseDate: accessory.purchaseDate?.slice(0, 10) || '',
    warrantyExpires: accessory.warrantyExpires?.slice(0, 10) || '',
    purchaseCost: accessory.purchaseCost ? Number(accessory.purchaseCost) : null,
    notes: accessory.notes || '',
    active: accessory.active,
  } : blankAccessory);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [quantityInput, setQuantityInput] = useState(() => accessory ? String(accessory.quantity) : '');
  const [minQuantityInput, setMinQuantityInput] = useState(() => accessory ? String(accessory.minQuantity) : '');
  const update = <K extends keyof AccessoryInput>(key: K, value: AccessoryInput[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const payload: AccessoryInput = {
        ...form,
        quantity: Number(quantityInput),
        minQuantity: minQuantityInput === '' ? 0 : Number(minQuantityInput),
      };
      const saved = accessory ? await accessoryService.update(accessory.id, payload) : await accessoryService.create(payload);
      if (imageFile) await accessoryService.uploadImage(saved.id, imageFile);
      onSaved();
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0" aria-hidden="true" />
      <form onSubmit={submit} className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Estoque técnico</p>
            <h2 className="text-xl font-bold text-slate-900">{accessory ? 'Editar item de estoque' : 'Cadastrar item de estoque'}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>

        <div className="grid gap-5 p-6 sm:grid-cols-2">
          {error && <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <label className="text-sm font-medium text-slate-700">Nome *<input required value={form.name} onChange={(event) => update('name', event.target.value)} className={field} placeholder="SSD Kingston 480GB" /></label>
          <div className="text-sm font-medium text-slate-700">
            <label htmlFor="accessory-category">Categoria *</label>
            <input id="accessory-category" required value={form.category} onChange={(event) => update('category', event.target.value)} className={field} placeholder="Digite ou escolha uma sugestão" />
            <div className="mt-2 flex flex-wrap gap-2">
              {categoryOptions.map((item) => <button key={item} type="button" onClick={() => update('category', item)} className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${form.category === item ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-300 hover:text-blue-700'}`}>{item}</button>)}
            </div>
          </div>

          <label className="text-sm font-medium text-slate-700">Quantidade *<input type="number" min="0" required value={quantityInput} onChange={(event) => setQuantityInput(event.target.value)} className={field} placeholder="Digite a quantidade" /></label>
          <label className="text-sm font-medium text-slate-700">Estoque mínimo<input type="number" min="0" value={minQuantityInput} onChange={(event) => setMinQuantityInput(event.target.value)} className={field} placeholder="Ex.: 5" /></label>
          <label className="text-sm font-medium text-slate-700">Unidade<input value={form.unit} onChange={(event) => update('unit', event.target.value)} className={field} placeholder="un, caixa, metro..." /></label>
          <label className="text-sm font-medium text-slate-700">Condição<select value={form.condition || 'NEW'} onChange={(event) => update('condition', event.target.value as AccessoryInput['condition'])} className={field}>{Object.entries(conditionLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">Foto pequena do item<input type="file" accept="image/jpeg,image/png,image/gif" onChange={(event) => setImageFile(event.target.files?.[0] || null)} className={field} /><span className="mt-1 block text-xs font-normal text-slate-500">Use imagem pequena em JPG, PNG ou GIF. O arquivo fica salvo em uploads, não dentro do banco.</span></label>
          <label className="text-sm font-medium text-slate-700">Localização<select value={form.location || ''} onChange={(event) => update('location', event.target.value)} className={field}><option value="">Selecione</option>{locationOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>

          <label className="text-sm font-medium text-slate-700">Empresa<select value={form.companyId || ''} onChange={(event) => update('companyId', event.target.value || null)} className={field}><option value="">Sem empresa definida</option>{companies.filter((company) => company.active).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Adquirido por<select value={form.purchasedByCompanyId || ''} onChange={(event) => update('purchasedByCompanyId', event.target.value || null)} className={field}><option value="">Não informado</option>{companies.filter((company) => company.active).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>

          <label className="text-sm font-medium text-slate-700">Fabricante<input value={form.manufacturer || ''} onChange={(event) => update('manufacturer', event.target.value)} className={field} /></label>
          <label className="text-sm font-medium text-slate-700">Modelo<input value={form.model || ''} onChange={(event) => update('model', event.target.value)} className={field} /></label>
          <label className="text-sm font-medium text-slate-700">Número de série<input value={form.serialNumber || ''} onChange={(event) => update('serialNumber', event.target.value)} className={field} /></label>
          <label className="text-sm font-medium text-slate-700">Part number / código<input value={form.partNumber || ''} onChange={(event) => update('partNumber', event.target.value)} className={field} /></label>
          <label className="text-sm font-medium text-slate-700">Frequência/Banda<input value={form.bandFrequency || ''} onChange={(event) => update('bandFrequency', event.target.value)} className={field} placeholder="2.4 GHz, 5 GHz, dual band..." /></label>
          <label className="text-sm font-medium text-slate-700">Fornecedor cadastrado<select value={form.supplierId || ''} onChange={(event) => update('supplierId', event.target.value || null)} className={field}><option value="">Sem fornecedor vinculado</option>{suppliers.filter((supplier) => supplier.active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Fornecedor manual / observação<input value={form.purchaseSupplier || ''} onChange={(event) => update('purchaseSupplier', event.target.value)} className={field} /></label>
          <label className="text-sm font-medium text-slate-700">Nº da nota fiscal<input value={form.purchaseInvoiceNumber || ''} onChange={(event) => update('purchaseInvoiceNumber', event.target.value)} className={field} /></label>
          <label className="text-sm font-medium text-slate-700">Chave de acesso da NF<input value={form.purchaseInvoiceAccessKey || ''} onChange={(event) => update('purchaseInvoiceAccessKey', event.target.value)} className={field} /></label>
          <label className="text-sm font-medium text-slate-700">Data da compra<input type="date" value={form.purchaseDate || ''} onChange={(event) => update('purchaseDate', event.target.value)} className={field} /></label>
          <label className="text-sm font-medium text-slate-700">Fim da garantia<input type="date" value={form.warrantyExpires || ''} onChange={(event) => update('warrantyExpires', event.target.value)} className={field} /></label>
          <label className="text-sm font-medium text-slate-700">Valor (R$)<input type="number" min="0" step="0.01" value={form.purchaseCost ?? ''} onChange={(event) => update('purchaseCost', event.target.value ? Number(event.target.value) : null)} className={field} placeholder="0,00" /></label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">Observações<textarea rows={3} value={form.notes || ''} onChange={(event) => update('notes', event.target.value)} className={field} /></label>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700 sm:col-span-2"><input type="checkbox" checked={form.active} onChange={(event) => update('active', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" /> Item ativo</label>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button>
          <button disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar item'}</button>
        </div>
      </form>
    </div>
  );
}

function MovementForm({ accessory, users, assets, onClose, onSaved }: { accessory: Accessory; users: User[]; assets: Asset[]; onClose: () => void; onSaved: (accessory: Accessory) => void }) {
  const [form, setForm] = useState<AccessoryMovementInput>({ type: 'OUT', quantity: 1, assetId: '', userId: '', reason: '', balanceId: accessory.balances.find((balance) => balance.quantity > 0)?.id || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requiresBalance = form.type === 'OUT';
  const balanceOptions = requiresBalance ? accessory.balances.filter((balance) => balance.quantity > 0) : accessory.balances;
  const defaultScopeLabel = `${accessory.company?.name || 'Sem empresa'} · ${accessory.location || 'Sem local'} · saldo principal`;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await accessoryService.move(accessory.id, {
        ...form,
        assetId: form.assetId || null,
        userId: form.userId || null,
        reason: form.reason || null,
        balanceId: form.balanceId || null,
      });
      onSaved(result.accessory);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0" aria-hidden="true" />
      <form onSubmit={submit} className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-600">Movimentação</p><h2 className="text-xl font-bold text-slate-900">Registrar movimentação: {accessory.name}</h2></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button></div>
        <div className="grid gap-5 p-6 sm:grid-cols-2">
          {error && <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <label className="text-sm font-medium text-slate-700">{form.type === 'ADJUSTMENT' ? 'Quantidade final *' : 'Quantidade *'}<input required type="number" min="1" max={form.type === 'OUT' ? accessory.quantity : undefined} value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: Number(event.target.value) }))} className={field} /></label>
          <label className="text-sm font-medium text-slate-700">Tipo<select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as AccessoryMovementInput['type'], balanceId: event.target.value === 'OUT' ? current.balanceId || accessory.balances.find((balance) => balance.quantity > 0)?.id || '' : current.balanceId || '' }))} className={field}><option value="OUT">Saída</option><option value="IN">Entrada</option><option value="ADJUSTMENT">Ajuste</option></select></label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">Saldo por empresa/local<select required={requiresBalance} value={form.balanceId || ''} onChange={(event) => setForm((current) => ({ ...current, balanceId: event.target.value }))} className={field}>{!requiresBalance && <option value="">{defaultScopeLabel}</option>}{balanceOptions.map((balance) => <option key={balance.id} value={balance.id}>{balance.company?.name || 'Sem empresa'} · {balance.location || 'Sem local'} · {balance.quantity} {accessory.unit}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Atrelar a um ativo<select value={form.assetId || ''} onChange={(event) => setForm((current) => ({ ...current, assetId: event.target.value }))} className={field}><option value="">Nenhum ativo</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}{asset.ipAddress ? ` · ${asset.ipAddress}` : ''}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">{form.type === 'OUT' ? 'Retirado por *' : 'Pessoa relacionada'}<select required={form.type === 'OUT'} value={form.userId || ''} onChange={(event) => setForm((current) => ({ ...current, userId: event.target.value }))} className={field}><option value="">{form.type === 'OUT' ? 'Selecione quem retirou' : 'Nenhuma pessoa'}</option>{users.filter((user) => user.active).map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">Motivo / observação<textarea rows={3} value={form.reason || ''} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} className={field} placeholder="Ex: Instalado no DVR da portaria" /></label>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button><button disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{saving ? 'Registrando...' : 'Registrar movimentação'}</button></div>
      </form>
    </div>
  );
}

function EditMovementDescriptionModal({ movement, onClose, onConfirm }: { movement: AccessoryMovement; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState(movement.reason || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onConfirm(reason);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0" aria-hidden="true" />
      <form onSubmit={submit} className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Movimentação</p>
            <h2 className="text-xl font-bold text-slate-900">Editar descrição</h2>
            <p className="mt-1 text-sm text-slate-500">{movement.type === 'OUT' ? 'Saída' : movement.type === 'IN' ? 'Entrada' : 'Ajuste'} de {movement.quantity} {movement.accessory.unit} · {movement.accessory.name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="p-6">
          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <label className="text-sm font-medium text-slate-700">Descrição do lançamento<textarea rows={5} value={reason} onChange={(event) => setReason(event.target.value)} className={field} placeholder="Descreva o motivo, observação ou correção deste lançamento" /></label>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button>
          <button disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar descrição'}</button>
        </div>
      </form>
    </div>
  );
}

function TransferForm({ accessory, companies, onClose, onSaved }: { accessory: Accessory; companies: Company[]; onClose: () => void; onSaved: () => void }) {
  const [fromBalanceId, setFromBalanceId] = useState(accessory.balances.find((balance) => balance.quantity > 0)?.id || '');
  const [toCompanyId, setToCompanyId] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const source = accessory.balances.find((balance) => balance.id === fromBalanceId);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try { await accessoryService.transfer(accessory.id, { fromBalanceId, toCompanyId: toCompanyId || null, toLocation: toLocation || null, quantity }); onSaved(); }
    catch (err) { setError(handleApiError(err)); } finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><form onSubmit={submit} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b px-6 py-5"><div><p className="text-xs font-bold uppercase text-blue-600">Transferência interna</p><h2 className="text-xl font-bold">Mover saldo: {accessory.name}</h2></div><button type="button" onClick={onClose}><X size={20} /></button></div><div className="space-y-5 p-6">{error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}<label className="text-sm font-medium">Origem<select required value={fromBalanceId} onChange={(e) => setFromBalanceId(e.target.value)} className={field}>{accessory.balances.filter((balance) => balance.quantity > 0).map((balance) => <option key={balance.id} value={balance.id}>{balance.company?.name || 'Sem empresa'} · {balance.location || 'Sem local'} · {balance.quantity}</option>)}</select></label><label className="text-sm font-medium">Empresa de destino<select value={toCompanyId} onChange={(e) => setToCompanyId(e.target.value)} className={field}><option value="">Sem empresa</option>{companies.filter((company) => company.active).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label className="text-sm font-medium">Local de destino<input required value={toLocation} onChange={(e) => setToLocation(e.target.value)} className={field} placeholder="Armário, setor, unidade..." /></label><label className="text-sm font-medium">Quantidade<input required type="number" min="1" max={source?.quantity || 1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className={field} /></label></div><div className="flex justify-end gap-3 border-t bg-slate-50 px-6 py-4"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2.5 text-sm font-semibold">Cancelar</button><button disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">{saving ? 'Transferindo...' : 'Transferir saldo'}</button></div></form></div>;
}

function DiscardForm({ accessory, onClose, onSaved }: { accessory: Accessory; onClose: () => void; onSaved: () => void }) {
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [destination, setDestination] = useState('Descarte');
  const [disposalDate, setDisposalDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!window.confirm(`Confirmar descarte de ${quantity} ${accessory.unit} de ${accessory.name}? Essa ação vai baixar o estoque.`)) return;
    setSaving(true);
    setError('');
    try {
      await disposalService.create({
        accessoryId: accessory.id,
        itemName: accessory.name,
        category: accessory.category,
        serialNumber: accessory.serialNumber,
        quantity,
        reason: reason || null,
        destination: destination || null,
        disposalDate,
        notes: notes || null,
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
      <form onSubmit={submit} className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-red-600">Descarte de estoque</p>
            <h2 className="text-xl font-bold text-slate-900">Descartar: {accessory.name}</h2>
            <p className="mt-1 text-sm text-slate-500">Disponível: {accessory.quantity} {accessory.unit}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="grid gap-5 p-6 sm:grid-cols-2">
          {error && <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <label className="text-sm font-medium text-slate-700">Quantidade *<input required type="number" min="1" max={accessory.quantity} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className={field} /></label>
          <label className="text-sm font-medium text-slate-700">Data do descarte<input type="date" value={disposalDate} onChange={(event) => setDisposalDate(event.target.value)} className={field} /></label>
          <label className="text-sm font-medium text-slate-700">Motivo<input value={reason} onChange={(event) => setReason(event.target.value)} className={field} placeholder="Defeito, obsoleto, quebrado..." /></label>
          <label className="text-sm font-medium text-slate-700">Destino<input value={destination} onChange={(event) => setDestination(event.target.value)} className={field} placeholder="Lixo eletrônico, doação, sucata..." /></label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">Observações<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className={field} /></label>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button>
          <button disabled={saving} className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{saving ? 'Registrando...' : 'Registrar descarte'}</button>
        </div>
      </form>
    </div>
  );
}

export function Accessories() {
  const { user } = useAuthStore();
  const canManage = hasPermission(user, 'MANAGE_ACCESSORIES');
  const canDelete = user?.role === 'ADMIN';
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [movements, setMovements] = useState<AccessoryMovement[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conditionFilter, setConditionFilter] = useState<'ALL' | 'NEW' | 'USED'>('ALL');
  const [stockFilter, setStockFilter] = useState<StockFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [manufacturerFilter, setManufacturerFilter] = useState('');
  const [registrationFilter, setRegistrationFilter] = useState<'ALL' | 'WEEK' | 'CUSTOM'>('ALL');
  const [registrationStart, setRegistrationStart] = useState('');
  const [registrationEnd, setRegistrationEnd] = useState('');
  const invalidRegistrationRange = registrationFilter === 'CUSTOM' && !!registrationStart && !!registrationEnd && registrationStart > registrationEnd;
  const [companyFilter, setCompanyFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [viewMode, setViewMode] = useState<'ACTIVE' | 'TRASH'>('ACTIVE');
  const [editing, setEditing] = useState<Accessory | null>(null);
  const [moving, setMoving] = useState<Accessory | null>(null);
  const [transferring, setTransferring] = useState<Accessory | null>(null);
  const [discarding, setDiscarding] = useState<Accessory | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<Accessory | null>(null);
  const [cancelingMovement, setCancelingMovement] = useState<AccessoryMovement | null>(null);
  const [editingMovement, setEditingMovement] = useState<AccessoryMovement | null>(null);
  const [sort, setSort] = useState<SortState<AccessorySortKey>>({ key: 'name', direction: 'asc' });
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError('');
    try {
      const [items, history] = await Promise.all([accessoryService.list(search || undefined, viewMode), accessoryService.movements(10)]);
      if (sequence !== loadSequence.current) return;
      setAccessories(items);
      setMovements(history);
    } catch (err) {
      if (sequence !== loadSequence.current) return;
      setError(handleApiError(err));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [search, viewMode]);

  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(load, 250);
    return () => { window.clearTimeout(timer); loadSequence.current += 1; };
  }, [load]);
  useEffect(() => {
    userService.getAllUsers().then(setUsers).catch(() => setUsers([]));
    assetService.list({ page: 1, limit: 100 }).then((data) => setAssets(data.assets)).catch(() => setAssets([]));
    companyService.list().then(setCompanies).catch(() => setCompanies([]));
    supplierService.list().then(setSuppliers).catch(() => setSuppliers([]));
  }, []);

  const summary = useMemo(() => ({
    total: accessories.filter((item) => item.active).reduce((sum, item) => sum + item.quantity, 0),
    newItems: accessories.filter((item) => item.active && (item.condition || 'NEW') === 'NEW').reduce((sum, item) => sum + item.quantity, 0),
    usedItems: accessories.filter((item) => item.active && item.condition === 'USED').reduce((sum, item) => sum + item.quantity, 0),
    low: accessories.filter((item) => item.active && item.quantity <= item.minQuantity).length,
    categories: new Set(accessories.map((item) => item.category)).size,
  }), [accessories]);

  const filteredAccessories = useMemo(() => accessories.filter((item) => {
    const matchesCondition = conditionFilter === 'ALL' || (item.condition || 'NEW') === conditionFilter;
    const quantity = stockQuantity(item, companyFilter, locationFilter);
    const matchesRegistration = matchesRegistrationDate(item.createdAt, registrationFilter, registrationStart, registrationEnd);
    const matchesManufacturer = !manufacturerFilter || (manufacturerFilter === '__NONE__'
      ? !item.manufacturer?.trim()
      : item.manufacturer?.trim().toLocaleLowerCase('pt-BR') === manufacturerFilter);
    return matchesCondition && matchesRegistration && matchesManufacturer && (!categoryFilter || item.category === categoryFilter) &&
      quantity !== null && matchesStock(quantity, item.minQuantity, stockFilter);
  }), [accessories, conditionFilter, stockFilter, categoryFilter, companyFilter, locationFilter, manufacturerFilter, registrationFilter, registrationStart, registrationEnd]);

  const filterCategories = [...new Set(accessories.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const filterManufacturers = [...new Map(accessories.flatMap((item) => {
    const name = item.manufacturer?.trim();
    return name ? [[name.toLocaleLowerCase('pt-BR'), name] as const] : [];
  })).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  const filterLocations = [...new Set(accessories.flatMap((item) => [item.location, ...item.balances.map((balance) => balance.location)]).filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const hasFilters = !!(search || conditionFilter !== 'ALL' || stockFilter !== 'ALL' || categoryFilter || companyFilter || locationFilter || manufacturerFilter || registrationFilter !== 'ALL');
  const clearFilters = () => {
    setSearch(''); setConditionFilter('ALL'); setStockFilter('ALL');
    setCategoryFilter(''); setCompanyFilter(''); setLocationFilter('');
    setManufacturerFilter(''); setRegistrationFilter('ALL');
    setRegistrationStart(''); setRegistrationEnd('');
  };

  const activeFilters = [
    ...(search ? [{ label: `Busca: ${search}`, clear: () => setSearch('') }] : []),
    ...(stockFilter !== 'ALL' ? [{ label: ({ OUT: 'Fora de estoque', IN: 'Em estoque', LOW: 'No mínimo ou abaixo', OK: 'Acima do mínimo' })[stockFilter], clear: () => setStockFilter('ALL') }] : []),
    ...(conditionFilter !== 'ALL' ? [{ label: conditionFilter === 'NEW' ? 'Novos' : 'Usados', clear: () => setConditionFilter('ALL') }] : []),
    ...(categoryFilter ? [{ label: `Categoria: ${categoryFilter}`, clear: () => setCategoryFilter('') }] : []),
    ...(manufacturerFilter ? [{ label: `Fabricante: ${manufacturerFilter === '__NONE__' ? 'Não informado' : filterManufacturers.find(([value]) => value === manufacturerFilter)?.[1] || manufacturerFilter}`, clear: () => setManufacturerFilter('') }] : []),
    ...(companyFilter ? [{ label: `Empresa: ${companyFilter === 'NONE' ? 'Não informada' : companies.find((company) => company.id === companyFilter)?.name || 'Selecionada'}`, clear: () => setCompanyFilter('') }] : []),
    ...(locationFilter ? [{ label: `Local: ${locationFilter === 'NONE' ? 'Não informado' : locationFilter}`, clear: () => setLocationFilter('') }] : []),
    ...(registrationFilter !== 'ALL' ? [{ label: registrationFilter === 'WEEK' ? 'Cadastro recente · 7 dias' : `Cadastro: ${registrationStart ? registrationStart.split('-').reverse().join('/') : 'Sem início'} até ${registrationEnd ? registrationEnd.split('-').reverse().join('/') : 'Sem fim'}`, clear: () => { setRegistrationFilter('ALL'); setRegistrationStart(''); setRegistrationEnd(''); } }] : []),
  ];
  const visibleQuantity = (item: Accessory) => stockQuantity(item, companyFilter, locationFilter) ?? 0;
  const stockStatus = (item: Accessory) => !item.active ? 'Inativo' : visibleQuantity(item) <= 0 ? 'Fora de estoque' : visibleQuantity(item) <= item.minQuantity ? 'Baixo estoque' : 'Ok';

  const sortedAccessories = useMemo(() => sortByDirection(filteredAccessories, sort.direction, (item) => {
    if (sort.key === 'status') return stockStatus(item);
    if (sort.key === 'quantity') return visibleQuantity(item);
    if (sort.key === 'company') return item.company?.name || '';
    return item[sort.key] || '';
  }), [filteredAccessories, sort, companyFilter, locationFilter]);
  const accessoryPagination = useClientPagination(sortedAccessories, JSON.stringify([search, viewMode, conditionFilter, stockFilter, categoryFilter, companyFilter, locationFilter, manufacturerFilter, registrationFilter, registrationStart, registrationEnd, sort.key, sort.direction]));

  const remove = async (item: Accessory) => {
    if (!window.confirm(`Mover ${item.name} para a lixeira? O item e todo o histórico poderão ser restaurados.`)) return;
    const password = requestDeletePassword(`o item ${item.name}`); if (!password) return;
    try { await accessoryService.delete(item.id, password); load(); }
    catch (err) { setError(handleApiError(err)); }
  };

  const movementTarget = (movement: AccessoryMovement) => {
    const details = [
      movement.asset ? `Ativo: ${movement.asset.name}` : null,
      movement.user ? `${movement.type === 'OUT' ? 'Retirado por' : 'Pessoa'}: ${movement.user.name}` : null,
    ].filter(Boolean);
    return details.length ? details.join(' · ') : 'Sem vínculo';
  };

  const restore = async (item: Accessory) => {
    try {
      await accessoryService.restore(item.id);
      setNotice(`${item.name} foi restaurado.`);
      await load();
    } catch (err) { setError(handleApiError(err)); }
  };

  const cancelMovement = async (password: string, reason: string) => {
    if (!cancelingMovement) return;
    await accessoryService.cancelMovement(cancelingMovement.id, password, reason);
    setNotice(`Saída cancelada. ${cancelingMovement.quantity} ${cancelingMovement.accessory.unit} devolvido(s) ao estoque.`);
    setCancelingMovement(null);
    await load();
  };

  const updateMovementDescription = async (reason: string) => {
    if (!editingMovement) return;
    await accessoryService.updateMovement(editingMovement.id, { reason: reason.trim() || null });
    setNotice('Descrição do lançamento atualizada.');
    setEditingMovement(null);
    await load();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <AppNav />
      <main className="mx-auto max-w-[1500px]">
        <PremiumPageHeader eyebrow="Estoque técnico" title={viewMode === 'TRASH' ? 'Lixeira do estoque' : 'Estoque'} description={viewMode === 'TRASH' ? 'Itens excluídos ficam separados do estoque atual e podem ser restaurados.' : 'Controle itens e registre saídas vinculadas a ativos ou usuários.'} icon={viewMode === 'TRASH' ? Trash2 : Archive} actions={<>{canManage && viewMode === 'ACTIVE' && <button onClick={() => { setEditing(null); setFormOpen(true); }} className={premiumHeaderPrimaryAction}><Plus size={18} /> Novo item</button>}<button type="button" onClick={() => { setViewMode((current) => current === 'ACTIVE' ? 'TRASH' : 'ACTIVE'); clearFilters(); }} className={premiumHeaderSecondaryAction}>{viewMode === 'TRASH' ? <><Archive size={18} /> Voltar ao estoque</> : <><Trash2 size={18} /> Lixeira</>}</button><a href="/accessories/reports?mode=MOVEMENTS" className={premiumHeaderSecondaryAction}><History size={18} /> Movimentações</a><a href="/accessories/reports" className={premiumHeaderSecondaryAction}><BarChart3 size={18} /> Relatório do estoque</a></>} />

        {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {notice && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

        {viewMode === 'ACTIVE' && <p className="mb-3 text-xs font-medium text-slate-500">Resumo geral{search ? ' da busca' : ' do estoque'} · os filtros abaixo refinam a tabela</p>}
        {viewMode === 'ACTIVE' ? <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <button type="button" onClick={() => { setConditionFilter('ALL'); setStockFilter('IN'); }} className={`rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-blue-300 ${conditionFilter === 'ALL' && stockFilter === 'IN' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'}`}><p className="text-xs font-semibold uppercase text-slate-500">Itens em estoque</p><p className="mt-2 text-2xl font-bold text-slate-900">{summary.total}</p></button>
          <button type="button" onClick={() => { setConditionFilter('NEW'); setStockFilter('ALL'); }} className={`rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 ${conditionFilter === 'NEW' ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200'}`}><p className="text-xs font-semibold uppercase text-slate-500">Novos</p><p className="mt-2 text-2xl font-bold text-emerald-700">{summary.newItems}</p></button>
          <button type="button" onClick={() => { setConditionFilter('USED'); setStockFilter('ALL'); }} className={`rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-amber-300 ${conditionFilter === 'USED' ? 'border-amber-500 ring-2 ring-amber-100' : 'border-slate-200'}`}><p className="text-xs font-semibold uppercase text-slate-500">Usados</p><p className="mt-2 text-2xl font-bold text-amber-700">{summary.usedItems}</p></button>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-500">Categorias</p><p className="mt-2 text-2xl font-bold text-slate-900">{summary.categories}</p></div>
          <button type="button" onClick={() => setStockFilter(stockFilter === 'LOW' ? 'ALL' : 'LOW')} className={`rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-red-300 ${stockFilter === 'LOW' ? 'border-red-500 ring-2 ring-red-100' : 'border-slate-200'}`}><p className="text-xs font-semibold uppercase text-slate-500">No mínimo ou abaixo</p><p className={`mt-2 text-2xl font-bold ${summary.low ? 'text-red-600' : 'text-emerald-600'}`}>{summary.low}</p></button>
        </div> : <div className="mb-6 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm"><strong className="text-slate-800">Itens excluídos</strong><p className="mt-1">Estes registros não fazem parte do saldo atual. Use “Restaurar” somente se precisar devolvê-los ao estoque.</p></div>}

        <section aria-label="Filtros do estoque" className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div><h2 className="font-semibold text-slate-900">Encontre os itens do estoque</h2><p className="mt-1 text-sm text-slate-500">Combine os filtros para refinar sua consulta.</p></div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{activeFilters.length ? `${activeFilters.length} filtro${activeFilters.length === 1 ? '' : 's'} ativo${activeFilters.length === 1 ? '' : 's'}` : 'Todos os itens'}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">Buscar item
              <span className="relative mt-1.5 block"><Search className="absolute left-3 top-3 text-slate-400" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm" placeholder="Nome, série, NF, empresa ou local..." /></span>
            </label>
            <label className="text-sm font-medium text-slate-700">Disponibilidade
              <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value as StockFilter)} className={field}>
                <option value="ALL">Todas as quantidades</option><option value="OUT">Fora de estoque (saldo zero)</option><option value="IN">Somente em estoque</option><option value="LOW">Estoque baixo (no mínimo ou abaixo)</option><option value="OK">Acima do estoque mínimo</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Condição
              <select value={conditionFilter} onChange={(event) => setConditionFilter(event.target.value as typeof conditionFilter)} className={field}><option value="ALL">Todas as condições</option><option value="NEW">Novos</option><option value="USED">Usados</option></select>
            </label>
            <label className="text-sm font-medium text-slate-700">Categoria
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={field}><option value="">Todas as categorias</option>{filterCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
            </label>
            <label className="text-sm font-medium text-slate-700">Fabricante
              <select value={manufacturerFilter} onChange={(event) => setManufacturerFilter(event.target.value)} className={field}><option value="">Todos os fabricantes</option><option value="__NONE__">Sem fabricante informado</option>{filterManufacturers.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select>
            </label>
            <label className="text-sm font-medium text-slate-700">Data de cadastro
              <select value={registrationFilter} onChange={(event) => setRegistrationFilter(event.target.value as typeof registrationFilter)} className={field}><option value="ALL">Qualquer data</option><option value="WEEK">Cadastro recente</option><option value="CUSTOM">Selecionar período</option></select>
              {registrationFilter === 'WEEK' && <span className="mt-1 block text-xs font-normal text-slate-500">Cadastros dos últimos 7 dias.</span>}
            </label>
            {registrationFilter === 'CUSTOM' && <>
              <label className="text-sm font-medium text-slate-700">Data inicial
                <input type="date" value={registrationStart} max={registrationEnd || undefined} onChange={(event) => setRegistrationStart(event.target.value)} className={field} aria-invalid={invalidRegistrationRange} />
              </label>
              <label className="text-sm font-medium text-slate-700">Data final
                <input type="date" value={registrationEnd} min={registrationStart || undefined} onChange={(event) => setRegistrationEnd(event.target.value)} className={field} aria-invalid={invalidRegistrationRange} />
              </label>
              {invalidRegistrationRange && <p role="alert" className="text-sm text-red-600 sm:col-span-2 lg:col-span-3">A data final deve ser igual ou posterior à data inicial.</p>}
            </>}
            <label className="text-sm font-medium text-slate-700">Empresa do saldo
              <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} className={field}><option value="">Todas as empresas</option><option value="NONE">Sem empresa</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select>
            </label>
            <label className="text-sm font-medium text-slate-700">Localização do saldo
              <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} className={field}><option value="">Todas as localizações</option><option value="NONE">Sem localização</option>{filterLocations.map((location) => <option key={location} value={location}>{location}</option>)}</select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <p role="status" aria-live="polite" className="text-sm font-medium text-slate-600">{loading ? 'Carregando...' : invalidRegistrationRange ? 'Corrija o período para consultar os resultados.' : `${filteredAccessories.length} de ${accessories.length} registros encontrados`}</p>
            <button type="button" disabled={!hasFilters} onClick={clearFilters} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">Limpar filtros</button>
          </div>
          {activeFilters.length > 0 && <div className="mt-3 flex flex-wrap gap-2" aria-label="Filtros ativos">{activeFilters.map((filter) => <button key={filter.label} type="button" onClick={filter.clear} aria-label={`Remover filtro ${filter.label}`} className="inline-flex max-w-full items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 transition hover:border-blue-300 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400"><span className="truncate">{filter.label}</span><X size={13} className="shrink-0" aria-hidden="true" /></button>)}</div>}
          {(companyFilter || locationFilter) && <p className="mt-2 text-xs text-slate-500">A disponibilidade considera o saldo na empresa e no local selecionados. O mínimo é o cadastrado para o item.</p>}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto"><table className="min-w-[1180px] divide-y divide-slate-200">
            <thead className="bg-slate-50"><tr>
              {[
                ['Item', 'name'],
                ['Categoria', 'category'],
                ['Foto', undefined],
                ['Condição', 'condition'],
                ['Empresa', 'company'],
                [companyFilter || locationFilter ? 'Qtd. no filtro' : 'Qtd.', 'quantity'],
                ['Mínimo', 'minQuantity'],
                ['Localização', 'location'],
                [companyFilter || locationFilter ? 'Status no filtro' : 'Status', 'status'],
                ['', undefined],
              ].map(([title, key]) => <SortableHeader key={title} label={title || ''} sortKey={key as AccessorySortKey | undefined} current={sort} onSort={(nextKey) => setSort((current) => nextSort(current, nextKey))} />)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={10} className="px-5 py-8"><div className="space-y-3" aria-label="Carregando estoque"><div className="premium-skeleton h-4 w-1/4 rounded-full" /><div className="premium-skeleton h-12 w-full rounded-xl" /><div className="premium-skeleton h-12 w-full rounded-xl" /><div className="premium-skeleton h-12 w-3/4 rounded-xl" /></div></td></tr>
                : sortedAccessories.length ? accessoryPagination.paginatedItems.map((item) => <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="rounded-lg bg-slate-100 p-2 text-slate-600"><Package size={18} /></span><div><p className="font-semibold text-slate-900">{item.name}</p><p className="text-xs text-slate-500">{[item.manufacturer, item.model].filter(Boolean).join(' ') || 'Sem fabricante/modelo'}</p><p className="mt-1 text-xs text-slate-400">Cadastro: {new Date(item.createdAt).toLocaleDateString('pt-BR')}</p>{(item.serialNumber || item.partNumber || item.bandFrequency) && <p className="mt-0.5 text-xs text-slate-400">{[item.serialNumber && `Série: ${item.serialNumber}`, item.partNumber && `Código: ${item.partNumber}`, item.bandFrequency].filter(Boolean).join(' · ')}</p>}</div></div></td>
                  <td className="px-5 py-4 text-sm text-slate-600">{item.category}</td>
                  <td className="px-5 py-4">{item.imageUrl ? <button type="button" onClick={() => setImagePreview(item)} className="group relative rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" title={`Ampliar foto de ${item.name}`}><img src={uploadUrl(item.imageUrl)} alt={item.name} className="h-12 w-12 rounded-lg border border-slate-200 object-cover transition group-hover:scale-105 group-hover:border-blue-400" /><span className="pointer-events-none absolute inset-0 rounded-lg bg-slate-950/0 transition group-hover:bg-slate-950/10" /></button> : <span className="text-xs text-slate-400">Sem foto</span>}</td>
                  <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${(item.condition || 'NEW') === 'NEW' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{conditionLabels[item.condition || 'NEW']}</span></td>
                  <td className="px-5 py-4 text-sm text-slate-600"><p>{item.company?.name || 'Não definida'}</p>{item.balances.length > 1 && <div className="mt-1 space-y-0.5 text-xs text-blue-700">{item.balances.filter((balance) => balance.quantity > 0).map((balance) => <p key={balance.id}>{balance.company?.name || 'Sem empresa'}: {balance.quantity} {item.unit}</p>)}</div>}<p className="text-xs text-slate-400">Comprado por: {item.purchasedByCompany?.name || '—'}</p><p className="text-xs text-slate-400">Fornecedor: {item.supplier?.name || item.purchaseSupplier || '—'}</p></td>
                  <td className="px-5 py-4 text-sm font-semibold text-slate-900">{visibleQuantity(item)} {item.unit}{(companyFilter || locationFilter) && <p className="mt-1 text-xs font-normal text-slate-500">Total do item: {item.quantity} {item.unit}</p>}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{item.minQuantity} {item.unit}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{item.location || '—'}</td>
                  <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${!item.active ? 'bg-slate-100 text-slate-500' : visibleQuantity(item) <= 0 ? 'bg-red-50 text-red-700' : visibleQuantity(item) <= item.minQuantity ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{stockStatus(item)}</span></td>
                  <td className="px-5 py-4 text-right">{canManage ? item.active ? <div className="flex min-w-[260px] flex-wrap justify-end gap-x-3 gap-y-2"><button onClick={() => setMoving(item)} className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-900"><LogOut size={16} /> Saída</button><button onClick={() => setTransferring(item)} className="inline-flex items-center gap-1 text-sm font-semibold text-violet-700 hover:text-violet-900"><ArrowRightLeft size={16} /> Transferir</button><button disabled={item.quantity <= 0} onClick={() => setDiscarding(item)} className="inline-flex items-center gap-1 text-sm font-semibold text-red-600 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-40"><ArchiveX size={16} /> Descarte</button><button onClick={() => { setEditing(item); setFormOpen(true); }} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900"><Edit3 size={16} /> Editar</button>{canDelete && <button onClick={() => remove(item)} className="inline-flex items-center gap-1 text-sm font-semibold text-red-600 hover:text-red-800"><Trash2 size={16} /> Lixeira</button>}</div> : canDelete ? <button onClick={() => restore(item)} className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-900"><History size={16} /> Restaurar</button> : <span className="text-xs text-slate-400">Somente leitura</span> : <span className="text-xs text-slate-400">Somente leitura</span>}</td>
                </tr>) : <tr><td colSpan={10} className="py-16 text-center"><Archive className="mx-auto mb-3 text-slate-300" size={38} /><p className="font-semibold text-slate-700">{hasFilters ? 'Nenhum item corresponde aos filtros' : viewMode === 'TRASH' ? 'A lixeira está vazia' : 'Nenhum item cadastrado'}</p><p className="mt-1 text-sm text-slate-500">{hasFilters ? 'Altere ou limpe os filtros para ver outros itens.' : viewMode === 'TRASH' ? 'Nenhum item excluído foi encontrado.' : 'Cadastre o primeiro item do estoque técnico.'}</p></td></tr>}
            </tbody>
          </table></div>
          {sortedAccessories.length > 0 && <PaginationControls {...accessoryPagination} />}
        </section>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <History size={18} className="text-blue-600" />
            <h2 className="font-semibold text-slate-900">Últimas movimentações</h2>
          </div>
          <div className="space-y-3">
            {movements.length ? movements.map((movement) => {
              const canCancelMovement = movement.type === 'OUT' && !movement.canceledAt && !movement.reason?.trim().toLowerCase().startsWith('descarte');
              return (
                <div key={movement.id} className={`rounded-lg border px-4 py-3 text-sm ${movement.canceledAt ? 'border-slate-200 bg-slate-100' : 'border-slate-100 bg-slate-50'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className={`font-semibold ${movement.canceledAt ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                        {movement.type === 'OUT' ? 'Saída' : movement.type === 'IN' ? 'Entrada' : 'Ajuste'} de {movement.quantity} {movement.accessory.unit} · {movement.accessory.name}
                      </p>
                      <p className="text-slate-500">{movementTarget(movement)} · por {movement.performedBy.name} · {new Date(movement.createdAt).toLocaleString('pt-BR')}</p>
                      {movement.reason && <p className="mt-1 text-slate-600">{movement.reason}</p>}
                      {movement.canceledAt && <p className="mt-2 font-medium text-amber-700">Cancelada por {movement.canceledBy?.name || 'usuário'} em {new Date(movement.canceledAt).toLocaleString('pt-BR')} · {movement.cancellationReason}</p>}
                    </div>
                    {canManage && (
                      <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={() => { setNotice(''); setEditingMovement(movement); }} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100">
                          <Edit3 size={15} /> Editar descrição
                        </button>
                        {canCancelMovement && <button type="button" onClick={() => { setNotice(''); setCancelingMovement(movement); }} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"><History size={15} /> Cancelar saída</button>}
                      </div>
                    )}
                  </div>
                </div>
              );
            }) : <p className="text-sm text-slate-500">Nenhuma movimentação registrada ainda.</p>}
          </div>
        </section>
      </main>

      {canManage && formOpen && <AccessoryForm accessory={editing} companies={companies} suppliers={suppliers} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); load(); }} />}
      {canManage && moving && <MovementForm accessory={moving} users={users} assets={assets} onClose={() => setMoving(null)} onSaved={(updatedAccessory) => { setMoving(null); setAccessories((current) => current.map((item) => item.id === updatedAccessory.id ? updatedAccessory : item)); load(); }} />}
      {canManage && transferring && <TransferForm accessory={transferring} companies={companies} onClose={() => setTransferring(null)} onSaved={() => { setTransferring(null); setNotice('Saldo transferido entre empresa/local.'); load(); }} />}
      {canManage && discarding && <DiscardForm accessory={discarding} onClose={() => setDiscarding(null)} onSaved={() => { setDiscarding(null); load(); }} />}
      {canManage && cancelingMovement && <CancelAccessoryMovementModal movement={cancelingMovement} onClose={() => setCancelingMovement(null)} onConfirm={cancelMovement} />}
      {canManage && editingMovement && <EditMovementDescriptionModal movement={editingMovement} onClose={() => setEditingMovement(null)} onConfirm={updateMovementDescription} />}
      {imagePreview?.imageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true">
          <button className="absolute inset-0 cursor-zoom-out" onClick={() => setImagePreview(null)} aria-label="Fechar foto ampliada" />
          <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Foto do item</p>
                <h2 className="text-lg font-bold text-slate-900">{imagePreview.name}</h2>
              </div>
              <button type="button" onClick={() => setImagePreview(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar"><X size={22} /></button>
            </div>
            <div className="flex max-h-[78vh] items-center justify-center bg-slate-100 p-4">
              <img src={uploadUrl(imagePreview.imageUrl)} alt={imagePreview.name} className="max-h-[72vh] max-w-full rounded-xl object-contain shadow-sm" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
