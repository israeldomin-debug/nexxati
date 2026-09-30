import { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive, ArchiveX, Box, Camera, CheckCircle2, CircleDollarSign, Clock3, Copy, Edit3, Eye, FileUp, Keyboard, Mouse,
  Building2, HardDrive, Laptop, MapPin, Monitor, MoreHorizontal, PackageCheck, PackagePlus, PhoneCall, Plus, Printer, Radar, RotateCcw, Router, Search, Server, ServerCog, Shield, ShieldAlert, ShieldCheck,
  LockKeyhole, QrCode, SlidersHorizontal, Sparkles, Smartphone, Tablet, Trash2, UserRoundCheck, Wifi, Wrench, X,
} from 'lucide-react';
import { AppNav } from '../components/AppNav';
import { assetService, AssetListResult } from '../services/asset.service';
import { disposalService } from '../services/disposal.service';
import { userService } from '../services/user.service';
import { companyService } from '../services/company.service';
import { supplierService } from '../services/supplier.service';
import { passwordVaultService } from '../services/password-vault.service';
import { Asset, AssetCondition, AssetDetail, AssetDonorInput, AssetInput, AssetStatus, AssetType, Company, MaintenanceRecord, PasswordVaultEntry, Supplier, User } from '../types';
import { handleApiError } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { ImportSummary, NetworkDiscovery } from '../components/NetworkDiscovery';
import { hasPermission } from '../utils/permissions';
import { nextSort, SortableHeader, SortState } from '../utils/tableSort';
import { PaginationControls } from '../components/PaginationControls';
import { requestSensitivePassword } from '../utils/sensitivePassword';
import { SavedFilterViews, TableColumnPicker, useVisibleColumns } from '../components/DataViewPreferences';

const statusConfig: Record<AssetStatus, { label: string; badge: string; icon: typeof Box }> = {
  AVAILABLE: { label: 'Disponível', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', icon: CheckCircle2 },
  ASSIGNED: { label: 'Em uso', badge: 'bg-blue-50 text-blue-700 ring-blue-600/20', icon: UserRoundCheck },
  MAINTENANCE: { label: 'Manutenção', badge: 'bg-amber-50 text-amber-700 ring-amber-600/20', icon: Wrench },
  WARRANTY: { label: 'Em garantia', badge: 'bg-cyan-50 text-cyan-700 ring-cyan-600/20', icon: ShieldCheck },
  DONOR: { label: 'Doador de peças', badge: 'bg-violet-50 text-violet-700 ring-violet-600/20', icon: PackagePlus },
  RETIRED: { label: 'Retirado', badge: 'bg-slate-100 text-slate-600 ring-slate-500/20', icon: Archive },
};

const conditionLabels: Record<AssetCondition, string> = {
  NEW: 'Novo', GOOD: 'Bom', FAIR: 'Regular', POOR: 'Ruim',
};

const maintenanceServiceOptions = [
  ['FORMATACAO', 'Formatação'],
  ['LIMPEZA', 'Limpeza'],
  ['TROCA_PERIFERICOS', 'Troca de periféricos'],
  ['ATUALIZACAO', 'Atualização de sistema/software'],
  ['REPARO', 'Reparo de hardware'],
  ['TESTES', 'Testes e validação'],
  ['OUTRO', 'Outro serviço'],
] as const;

const assetTypeLabels: Record<AssetType, string> = {
  DESKTOP: 'Desktop', NOTEBOOK: 'Notebook', SERVER: 'Servidor', VIRTUAL_MACHINE: 'Máquina virtual',
  MONITOR: 'Monitor', MOUSE: 'Mouse', KEYBOARD: 'Teclado', PRINTER: 'Impressora', MOBILE: 'Celular', TABLET: 'Tablet', IP_PHONE: 'Telefone IP', VOIP_SERVER: 'Servidor VoIP / PABX', CAMERA: 'Câmera',
  DVR_NVR: 'DVR / NVR', ROUTER: 'Roteador', SWITCH: 'Switch', ACCESS_POINT: 'Access point',
  ANTENNA: 'Antena', TIME_CLOCK: 'Relógio de ponto', TURNSTILE: 'Catraca', FIREWALL: 'Firewall', UPS: 'Nobreak / UPS', OTHER: 'Outro',
};

const assetTypeIcons: Partial<Record<AssetType, typeof Box>> = {
  DESKTOP: Monitor,
  NOTEBOOK: Laptop,
  SERVER: Server,
  VIRTUAL_MACHINE: Server,
  MONITOR: Monitor,
  MOUSE: Mouse,
  KEYBOARD: Keyboard,
  PRINTER: Printer,
  MOBILE: Smartphone,
  TABLET: Tablet,
  IP_PHONE: PhoneCall,
  VOIP_SERVER: ServerCog,
  CAMERA: Camera,
  DVR_NVR: HardDrive,
  ROUTER: Router,
  SWITCH: Router,
  ACCESS_POINT: Wifi,
  ANTENNA: Wifi,
  TIME_CLOCK: Clock3,
  TURNSTILE: Clock3,
  FIREWALL: Shield,
  UPS: Box,
  OTHER: Box,
};

const getAssetIcon = (asset: Pick<Asset, 'type' | 'category'>) => {
  const category = normalizeCategoryLabel(asset.category).toLowerCase();
  if (asset.type === 'DVR_NVR' || category.includes('dvr') || category.includes('nvr')) return HardDrive;
  if (asset.type === 'PRINTER' || category.includes('impressora') || category.includes('printer')) return Printer;
  if (asset.type === 'CAMERA' || category.includes('camera') || category.includes('câmera')) return Camera;
  if (asset.type === 'VOIP_SERVER' || category.includes('pabx') || category.includes('servidor voip')) return ServerCog;
  if (asset.type === 'IP_PHONE' || category.includes('telefone ip') || category.includes('voip')) return PhoneCall;
  if (asset.type === 'NOTEBOOK' || category.includes('notebook')) return Laptop;
  if (asset.type === 'DESKTOP' || category.includes('desktop') || category.includes('computador') || category.includes('pc')) return Monitor;
  return assetTypeIcons[asset.type] || Box;
};

const passwordVaultDeviceLabels: Record<PasswordVaultEntry['deviceType'], string> = {
  DVR: 'DVR', NVR: 'NVR', ROUTER: 'Roteador', ANTENNA: 'Antena', ACCESS_POINT: 'Access point',
  SWITCH: 'Switch', CAMERA: 'Camera', PRINTER: 'Impressora', SERVER: 'Servidor', OTHER: 'Outro',
};

const normalizeCategoryLabel = (value: string) => {
  const cleaned = value.trim();
  const key = cleaned
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  if (key === 'dvr nvr' || key === 'dvr' || key === 'nvr') return 'DVR / NVR';
  if (['camera', 'cameras', 'cam', 'camera ip', 'cameras ip', 'ip camera', 'ip cameras', 'cam ip', 'cctv'].includes(key)) return 'Câmera';
  if (key === 'desktop') return 'Desktop';
  if (key === 'printer' || key === 'impressora') return 'Impressora';
  return cleaned;
};

const computerAssetTypes: AssetType[] = ['DESKTOP', 'NOTEBOOK', 'SERVER', 'VIRTUAL_MACHINE'];
const networkAssetTypes: AssetType[] = ['CAMERA', 'DVR_NVR', 'IP_PHONE', 'VOIP_SERVER', 'ROUTER', 'SWITCH', 'ACCESS_POINT', 'ANTENNA', 'TIME_CLOCK', 'TURNSTILE', 'FIREWALL'];
const bandAssetTypes: AssetType[] = [...networkAssetTypes];
const firmwareAssetTypes: AssetType[] = [...networkAssetTypes, 'PRINTER'];

const categoryFromAssetType = (type: AssetType) => assetTypeLabels[type] || 'Outro';

const blankAsset: AssetInput = {
  assetTag: '', name: '', category: '', type: 'OTHER', manufacturer: '', model: '', serialNumber: '', bandFrequency: '', firmware: '',
  status: 'AVAILABLE', condition: 'GOOD', location: '', assignedToId: null,
  companyId: null, supplierId: null, ipAddress: '', gateway: '', macAddress: '', hostname: '', operatingSystem: '',
  osVersion: '', osArchitecture: '', domain: '', workgroup: '', systemType: '', biosVersion: '',
  biosReleaseDate: '', windowsInstallDate: '', lastBootAt: '', windowsLicenseKey: '',
  purchaseDate: '', warrantyExpires: '', maintenanceIntervalDays: null, nextMaintenanceAt: '', purchaseCost: null, purchasedByCompanyId: null,
  purchaseSupplier: '', purchaseInvoiceNumber: '', purchaseInvoiceAccessKey: '', notes: '',
};
type AssetSortKey = 'name' | 'type' | 'company' | 'status' | 'assignedTo' | 'location' | 'windowsInstallDate' | 'lastFormattedAt' | 'updatedAt';
type AssetColumn = 'asset' | 'type' | 'company' | 'status' | 'user' | 'location' | 'installDate' | 'formattedAt' | 'updated';
const assetColumnOptions: { id: AssetColumn; label: string; required?: boolean }[] = [
  { id: 'asset', label: 'Ativo', required: true },
  { id: 'type', label: 'Tipo' },
  { id: 'company', label: 'Empresa' },
  { id: 'status', label: 'Status' },
  { id: 'user', label: 'Usuário' },
  { id: 'location', label: 'Localização' },
  { id: 'installDate', label: 'Instalação' },
  { id: 'formattedAt', label: 'Formatação' },
  { id: 'updated', label: 'Atualizado em' },
];
type AssetReportFilters = {
  search: string;
  status: AssetStatus | '';
  type: AssetType | '';
  location: string;
  companyId: string;
  purchasedByCompanyId: string;
  supplierId: string;
  warranty: 'ACTIVE' | 'EXPIRED' | '';
};

const formatDate = (value: string | null) => value
  ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  : '—';

const detectedUserName = (value: string | null | undefined) => {
  const fullName = value?.trim() || '';
  if (!fullName) return '';
  const parts = fullName.split('\\').filter(Boolean);
  return parts[parts.length - 1] || fullName;
};

const assetUserDisplay = (asset: Pick<Asset, 'assignedTo' | 'loggedUser'>) => {
  const detected = asset.loggedUser?.trim();
  if (asset.assignedTo) return {
    name: asset.assignedTo.name,
    detail: asset.assignedTo.email || 'Usuário atribuído manualmente',
    title: asset.assignedTo.name,
    detected: false,
  };
  if (detected) return {
    name: detectedUserName(detected),
    detail: 'Informado no ativo',
    title: detected,
    detected: false,
  };
  return { name: 'Sem usuário', detail: 'Disponível para atribuição', title: 'Sem usuário', detected: false };
};

const copyTextToClipboard = async (text: string) => {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
};

function StatusBadge({ status }: { status: AssetStatus }) {
  const config = statusConfig[status];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${config.badge}`}>{config.label}</span>;
}

interface AssetFormProps {
  asset: Asset | null;
  users: User[];
  companies: Company[];
  suppliers: Supplier[];
  onClose: () => void;
  onSaved: () => void;
}

function AssetForm({ asset, users, companies, suppliers, onClose, onSaved }: AssetFormProps) {
  const [form, setForm] = useState<AssetInput>(() => asset ? {
    assetTag: asset.assetTag, name: asset.name, category: asset.category, type: asset.type || 'OTHER',
    manufacturer: asset.manufacturer || '', model: asset.model || '', serialNumber: asset.serialNumber || '', bandFrequency: asset.bandFrequency || '', firmware: asset.firmware || '',
    status: asset.status, condition: asset.condition, location: asset.location || '', assignedToId: asset.assignedToId,
    companyId: asset.companyId, supplierId: asset.supplierId, ipAddress: asset.ipAddress || '', networkSegmentId: asset.networkSegmentId, gateway: asset.gateway || '', macAddress: asset.macAddress || '',
    hostname: asset.hostname || '', operatingSystem: asset.operatingSystem || '', osVersion: asset.osVersion || '',
    osArchitecture: asset.osArchitecture || '', processor: asset.processor || '', domain: asset.domain || '',
    workgroup: asset.workgroup || '', systemType: asset.systemType || '', biosVersion: asset.biosVersion || '',
    biosReleaseDate: asset.biosReleaseDate?.slice(0, 10) || '',
    windowsInstallDate: asset.windowsInstallDate?.slice(0, 10) || '', lastBootAt: asset.lastBootAt || '',
    loggedUser: asset.loggedUser || '',
    windowsLicenseKey: asset.windowsLicenseKey || '',
    memoryMb: asset.memoryMb, diskGb: asset.diskGb,
    purchaseDate: asset.purchaseDate?.slice(0, 10) || '', warrantyExpires: asset.warrantyExpires?.slice(0, 10) || '',
    maintenanceIntervalDays: asset.maintenanceIntervalDays, nextMaintenanceAt: asset.nextMaintenanceAt?.slice(0, 10) || '',
    purchaseCost: asset.purchaseCost ? Number(asset.purchaseCost) : null,
    purchasedByCompanyId: asset.purchasedByCompanyId,
    purchaseSupplier: asset.purchaseSupplier || '',
    purchaseInvoiceNumber: asset.purchaseInvoiceNumber || '',
    purchaseInvoiceAccessKey: asset.purchaseInvoiceAccessKey || '',
    notes: asset.notes || '',
  } : blankAsset);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [importingInvoice, setImportingInvoice] = useState(false);
  const [invoiceMessage, setInvoiceMessage] = useState('');
  const isComputerAsset = computerAssetTypes.includes(form.type);
  const showsBandFrequency = bandAssetTypes.includes(form.type);
  const showsFirmware = firmwareAssetTypes.includes(form.type);
  const showsNetworkConfiguration = networkAssetTypes.includes(form.type);

  const update = <K extends keyof AssetInput>(key: K, value: AssetInput[K]) => setForm((current) => ({ ...current, [key]: value }));

  const importInvoiceXml = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportingInvoice(true);
    setInvoiceMessage('');
    setError('');
    try {
      const invoice = await assetService.parseInvoiceXml(file);
      setForm((current) => ({
        ...current,
        purchaseInvoiceNumber: invoice.invoiceNumber || current.purchaseInvoiceNumber,
        purchaseInvoiceAccessKey: invoice.accessKey || current.purchaseInvoiceAccessKey,
        purchaseDate: invoice.issueDate || current.purchaseDate,
        purchaseCost: invoice.itemCount <= 1 && invoice.purchaseCost != null ? invoice.purchaseCost : current.purchaseCost,
        supplierId: invoice.supplier.id || current.supplierId,
        purchaseSupplier: invoice.supplier.name || current.purchaseSupplier,
        purchasedByCompanyId: invoice.buyer.id || current.purchasedByCompanyId,
      }));
      const matched = [invoice.supplier.id ? 'fornecedor vinculado' : null, invoice.buyer.id ? 'empresa adquirente vinculada' : null].filter(Boolean).join(' e ');
      setInvoiceMessage([`NF-e ${invoice.invoiceNumber || 'sem número'} importada${matched ? `; ${matched}` : ''}.`, ...invoice.warnings].join(' '));
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setImportingInvoice(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const payload: AssetInput = {
        ...form,
        category: categoryFromAssetType(form.type),
        assetTag: undefined,
        networkSegmentId: null,
        assignedToId: form.assignedToId || null,
        ...(!isComputerAsset ? {
          operatingSystem: null,
          osVersion: null,
          osArchitecture: null,
          processor: null,
          windowsLicenseKey: null,
          memoryMb: null,
          diskGb: null,
          diskFreeGb: null,
          loggedUser: null,
          domain: null,
          workgroup: null,
          systemType: null,
          biosVersion: null,
          biosReleaseDate: null,
          windowsInstallDate: null,
          lastBootAt: null,
        } : {}),
      };
      if (asset && isComputerAsset && !form.windowsLicenseKey) delete payload.windowsLicenseKey;
      if (asset) await assetService.update(asset.id, payload);
      else await assetService.create(payload);
      onSaved();
    } catch (err) { setError(handleApiError(err)); }
    finally { setSaving(false); }
  };

  const inputClass = 'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
  const labelClass = 'text-sm font-medium text-slate-700';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[1px]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 cursor-default" aria-hidden="true" />
      <div className="relative h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Inventário</p><h2 className="text-xl font-bold text-slate-900">{asset ? 'Editar ativo' : 'Cadastrar ativo'}</h2></div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar formulário"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="space-y-7 p-6">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <section>
            <h3 className="mb-4 font-semibold text-slate-900">Identificação</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>Nome do ativo *<input required value={form.name} onChange={(e) => update('name', e.target.value)} className={inputClass} placeholder="Notebook Financeiro" /></label>
              <label className={labelClass}>Tipo do ativo *<select value={form.type} onChange={(e) => update('type', e.target.value as AssetType)} className={inputClass}>{Object.entries(assetTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className={labelClass}>Número de série<input value={form.serialNumber || ''} onChange={(e) => update('serialNumber', e.target.value)} className={inputClass} placeholder="SN-123456" /></label>
              <label className={labelClass}>Fabricante<input value={form.manufacturer || ''} onChange={(e) => update('manufacturer', e.target.value)} className={inputClass} placeholder="Dell" /></label>
              <label className={labelClass}>Modelo<input value={form.model || ''} onChange={(e) => update('model', e.target.value)} className={inputClass} placeholder="Latitude 5440" /></label>
              {showsBandFrequency && <label className={labelClass}>Frequência/Banda<input value={form.bandFrequency || ''} onChange={(e) => update('bandFrequency', e.target.value)} className={inputClass} placeholder="2.4 GHz, 5 GHz, dual band..." /></label>}
            </div>
          </section>
          <section>
            <h3 className="mb-4 font-semibold text-slate-900">Situação e responsabilidade</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>Status<select value={form.status} onChange={(e) => update('status', e.target.value as AssetStatus)} className={inputClass}>{Object.entries(statusConfig).filter(([value]) => asset?.status === 'DONOR' ? value === 'DONOR' || value === 'RETIRED' : value !== 'DONOR').map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select></label>
              <label className={labelClass}>Condição<select value={form.condition} onChange={(e) => update('condition', e.target.value as AssetCondition)} className={inputClass}>{Object.entries(conditionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className={labelClass}>Usuário<select value={form.assignedToId || ''} onChange={(e) => update('assignedToId', e.target.value || null)} className={inputClass}><option value="">Sem usuário</option>{users.filter((user) => user.active).map((user) => <option key={user.id} value={user.id}>{user.name} — {user.email}</option>)}</select></label>
              <label className={labelClass}>Localização<input value={form.location || ''} onChange={(e) => update('location', e.target.value)} className={inputClass} placeholder="Matriz · 2º andar" /></label>
              <label className={`${labelClass} sm:col-span-2`}>Empresa<select value={form.companyId || ''} onChange={(e) => update('companyId', e.target.value || null)} className={inputClass}><option value="">Sem empresa definida</option>{companies.filter((company) => company.active).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
            </div>
          </section>
          <section>
            <h3 className="mb-4 font-semibold text-slate-900">Informações de rede e hardware</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>Endereço IP<input value={form.ipAddress || ''} onChange={(e) => update('ipAddress', e.target.value)} className={inputClass} placeholder="192.168.0.12" /></label>
              {showsNetworkConfiguration && <label className={labelClass}>Gateway<input value={form.gateway || ''} onChange={(e) => update('gateway', e.target.value)} className={inputClass} placeholder="192.168.0.1" /></label>}
              <label className={labelClass}>Endereço MAC<input value={form.macAddress || ''} onChange={(e) => update('macAddress', e.target.value)} className={inputClass} placeholder="38:31:AC:00:7B:0A" /></label>
              <label className={labelClass}>Nome na rede<input value={form.hostname || ''} onChange={(e) => update('hostname', e.target.value)} className={inputClass} placeholder="PC-FINANCEIRO-01" /></label>
              {showsFirmware && (
                <label className={labelClass}>Firmware<input value={form.firmware || ''} onChange={(e) => update('firmware', e.target.value)} className={inputClass} placeholder="Versão do firmware" /></label>
              )}
              {isComputerAsset && (
                <>
                  <label className={labelClass}>Sistema operacional<input value={form.operatingSystem || ''} onChange={(e) => update('operatingSystem', e.target.value)} className={inputClass} placeholder="Windows 11 Pro" /></label>
                  <label className={labelClass}>Versão do Windows<input value={form.osVersion || ''} onChange={(e) => update('osVersion', e.target.value)} className={inputClass} placeholder="10.0.22631" /></label>
                  <label className={labelClass}>Arquitetura<input value={form.osArchitecture || ''} onChange={(e) => update('osArchitecture', e.target.value)} className={inputClass} placeholder="64 bits" /></label>
                  <label className={labelClass}>Licença do Windows<input value={form.windowsLicenseKey || ''} onChange={(e) => update('windowsLicenseKey', e.target.value)} className={inputClass} placeholder={asset?.windowsProductKeyPartial ? `Protegida · final ${asset.windowsProductKeyPartial}` : 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX'} /></label>
                  <label className={labelClass}>Processador<input value={form.processor || ''} onChange={(e) => update('processor', e.target.value)} className={inputClass} /></label>
                  <label className={labelClass}>Usuário do Windows / último login<input value={form.loggedUser || ''} onChange={(e) => update('loggedUser', e.target.value)} className={inputClass} placeholder="DOMINIO\\usuario" /></label>
                  <label className={labelClass}>Domínio<input value={form.domain || ''} onChange={(e) => update('domain', e.target.value)} className={inputClass} /></label>
                  <label className={labelClass}>Grupo de trabalho<input value={form.workgroup || ''} onChange={(e) => update('workgroup', e.target.value)} className={inputClass} /></label>
                  <label className={labelClass}>Versão da BIOS<input value={form.biosVersion || ''} onChange={(e) => update('biosVersion', e.target.value)} className={inputClass} /></label>
                  <label className={labelClass}>Data da BIOS<input type="date" value={form.biosReleaseDate || ''} onChange={(e) => update('biosReleaseDate', e.target.value)} className={inputClass} /></label>
                  <label className={labelClass}>Instalação do Windows<input type="date" value={form.windowsInstallDate || ''} onChange={(e) => update('windowsInstallDate', e.target.value)} className={inputClass} /></label>
                  <div className="grid grid-cols-2 gap-3"><label className={labelClass}>Memória (MB)<input type="number" min="0" value={form.memoryMb ?? ''} onChange={(e) => update('memoryMb', e.target.value ? Number(e.target.value) : null)} className={inputClass} /></label><label className={labelClass}>Disco (GB)<input type="number" min="0" value={form.diskGb ?? ''} onChange={(e) => update('diskGb', e.target.value ? Number(e.target.value) : null)} className={inputClass} /></label></div>
                </>
              )}
            </div>
          </section>
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="font-semibold text-slate-900">Compra e garantia</h3><p className="mt-0.5 text-xs text-slate-500">Importe o XML da NF-e para preencher os dados fiscais automaticamente.</p></div>
              <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100 ${importingInvoice ? 'pointer-events-none opacity-60' : ''}`}>
                <FileUp size={15} /> {importingInvoice ? 'Lendo XML...' : 'Importar XML da NF-e'}
                <input type="file" accept=".xml,application/xml,text/xml" onChange={importInvoiceXml} className="sr-only" />
              </label>
            </div>
            {invoiceMessage && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-800">{invoiceMessage}</div>}
            <div className="grid gap-4 sm:grid-cols-3">
              <label className={`${labelClass} sm:col-span-3`}>Ativo adquirido por<select value={form.purchasedByCompanyId || ''} onChange={(e) => update('purchasedByCompanyId', e.target.value || null)} className={inputClass}><option value="">Não informado</option>{companies.filter((company) => company.active).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
              <label className={labelClass}>Fornecedor cadastrado<select value={form.supplierId || ''} onChange={(e) => update('supplierId', e.target.value || null)} className={inputClass}><option value="">Sem fornecedor vinculado</option>{suppliers.filter((supplier) => supplier.active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
              <label className={`${labelClass} sm:col-span-2`}>Fornecedor informado na NF-e<input value={form.purchaseSupplier || ''} onChange={(e) => update('purchaseSupplier', e.target.value)} className={inputClass} placeholder="Razão social do emitente" /></label>
              <label className={labelClass}>Nº da nota fiscal<input value={form.purchaseInvoiceNumber || ''} onChange={(e) => update('purchaseInvoiceNumber', e.target.value)} className={inputClass} placeholder="NF-000123" /></label>
              <label className={labelClass}>Chave de acesso da NF<input value={form.purchaseInvoiceAccessKey || ''} onChange={(e) => update('purchaseInvoiceAccessKey', e.target.value)} className={inputClass} placeholder="44 dígitos da NF-e" /></label>
              <label className={labelClass}>Data da compra<input type="date" value={form.purchaseDate || ''} onChange={(e) => update('purchaseDate', e.target.value)} className={inputClass} /></label>
              <label className={labelClass}>Fim da garantia<input type="date" value={form.warrantyExpires || ''} onChange={(e) => update('warrantyExpires', e.target.value)} className={inputClass} /></label>
              <label className={labelClass}>Valor (R$)<input type="number" min="0" step="0.01" value={form.purchaseCost ?? ''} onChange={(e) => update('purchaseCost', e.target.value ? Number(e.target.value) : null)} className={inputClass} placeholder="0,00" /></label>
              <label className={labelClass}>Intervalo de preventiva (dias)<input type="number" min="1" max="3650" value={form.maintenanceIntervalDays ?? ''} onChange={(e) => update('maintenanceIntervalDays', e.target.value ? Number(e.target.value) : null)} className={inputClass} placeholder="Ex.: 180" /></label>
              <label className={labelClass}>Próxima manutenção<input type="date" value={form.nextMaintenanceAt || ''} onChange={(e) => update('nextMaintenanceAt', e.target.value)} className={inputClass} /></label>
            </div>
          </section>
          <label className={`${labelClass} block`}>Observações<textarea rows={4} value={form.notes || ''} onChange={(e) => update('notes', e.target.value)} className={inputClass} placeholder="Itens de estoque, detalhes de configuração ou observações..." /></label>
          <div className="sticky bottom-0 -mx-6 -mb-6 flex justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
            <button disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60">{saving ? 'Salvando...' : asset ? 'Salvar alterações' : 'Cadastrar ativo'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AssetInfo({ label, value, copyable = false }: { label: string; value: unknown; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const text = value === null || value === undefined || value === '' ? '—' : String(value);

  const copy = async () => {
    if (!copyable || text === '—') return;
    try {
      const ok = await copyTextToClipboard(text);
      setCopied(ok);
      setCopyFailed(!ok);
      window.setTimeout(() => { setCopied(false); setCopyFailed(false); }, 1500);
    } catch {
      setCopied(false);
      setCopyFailed(true);
      window.setTimeout(() => setCopyFailed(false), 1500);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {copyable && text !== '—' && (
          <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50" title={`Copiar ${label.toLowerCase()}`}>
            <Copy size={13} /> {copyFailed ? 'Erro' : copied ? 'Copiado' : 'Copiar'}
          </button>
        )}
      </div>
      <p className="break-words text-sm font-medium text-slate-800">{text}</p>
    </div>
  );
}

const vaultCredentials = (entry: PasswordVaultEntry) => (
  entry.entryType === 'USER'
    ? [
      { label: 'Usuario', username: entry.userUsername, password: entry.userPassword, configured: entry.userPasswordConfigured },
      { label: 'Internet', username: entry.internetUsername, password: entry.internetPassword, configured: entry.internetPasswordConfigured },
      { label: 'P12', username: entry.p12Username, password: entry.p12Password, configured: entry.p12PasswordConfigured },
      { label: 'E-mail', username: entry.emailUsername, password: entry.emailPassword, configured: entry.emailPasswordConfigured },
    ]
    : [
      { label: 'Usuário 1', username: entry.username, password: entry.password, configured: entry.passwordConfigured },
      { label: 'Usuário 2', username: entry.userUsername, password: entry.userPassword, configured: entry.userPasswordConfigured },
      { label: 'Usuário 3', username: entry.internetUsername, password: entry.internetPassword, configured: entry.internetPasswordConfigured },
      { label: 'Usuário 4', username: entry.p12Username, password: entry.p12Password, configured: entry.p12PasswordConfigured },
      { label: 'Usuário 5', username: entry.emailUsername, password: entry.emailPassword, configured: entry.emailPasswordConfigured },
      { label: 'Usuário 6', username: entry.adminUsername, password: entry.adminPassword, configured: entry.adminPasswordConfigured },
    ]
).filter((item) => item.username || item.password || item.configured);

function AssetDetails({ asset, onClose, onEdit, onRefresh }: { asset: Asset | AssetDetail; onClose: () => void; onEdit?: () => void; onRefresh?: (asset: AssetDetail) => void }) {
  const { user } = useAuthStore();
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [revealedVaultEntries, setRevealedVaultEntries] = useState<Record<string, PasswordVaultEntry>>({});
  const [revealedWindowsKey, setRevealedWindowsKey] = useState('');
  const [licenseError, setLicenseError] = useState('');
  const [revealingLicense, setRevealingLicense] = useState(false);
  const [syncingPeripherals, setSyncingPeripherals] = useState(false);
  const [peripheralMessage, setPeripheralMessage] = useState('');
  const linkedPasswords = ('passwordVaultEntries' in asset ? asset.passwordVaultEntries || [] : []).map((entry) => revealedVaultEntries[entry.id] || entry);
  const agentInventory = 'agentInventory' in asset ? asset.agentInventory : null;
  const linkedPeripherals = 'peripherals' in asset ? asset.peripherals || [] : [];
  const system = [asset.operatingSystem, asset.osVersion, asset.osArchitecture].filter(Boolean).join(' · ');
  const isComputerAsset = computerAssetTypes.includes(asset.type);
  const showsFirmware = firmwareAssetTypes.includes(asset.type);
  const showsNetworkConfiguration = networkAssetTypes.includes(asset.type);
  const userDisplay = assetUserDisplay(asset);
  const purchaseValue = asset.purchaseCost
    ? Number(asset.purchaseCost).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—';

  const revealWindowsLicense = async () => {
    const password = await requestSensitivePassword(
      'Mostrar chave do Windows',
      'Esta consulta exige sua senha de administrador e será registrada na auditoria.',
    );
    if (!password) return;
    try {
      setRevealingLicense(true);
      setLicenseError('');
      setRevealedWindowsKey(await assetService.revealWindowsLicense(asset.id, password));
    } catch (error) {
      setLicenseError(handleApiError(error));
    } finally {
      setRevealingLicense(false);
    }
  };

  const toggleVaultEntry = async (entry: PasswordVaultEntry) => {
    if (visiblePasswords[entry.id]) {
      setVisiblePasswords((current) => ({ ...current, [entry.id]: false }));
      setRevealedVaultEntries((current) => { const next = { ...current }; delete next[entry.id]; return next; });
      return;
    }
    const password = await requestSensitivePassword('Mostrar senhas vinculadas', 'Informe sua senha. Esta visualização será registrada na auditoria.');
    if (!password) return;
    try {
      const revealed = await passwordVaultService.reveal(entry.id, password);
      setRevealedVaultEntries((current) => ({ ...current, [entry.id]: { ...entry, ...revealed } }));
      setVisiblePasswords((current) => ({ ...current, [entry.id]: true }));
    } catch (error) { setLicenseError(handleApiError(error)); }
  };

  const syncPeripherals = async () => {
    try {
      setSyncingPeripherals(true);
      setPeripheralMessage('');
      const result = await assetService.syncAgentPeripherals(asset.id);
      setPeripheralMessage(`${result.created} cadastrado(s), ${result.linked} atualizado(s)${result.skipped ? ` e ${result.skipped} ignorado(s) por estarem retirados/doadores` : ''}.`);
      onRefresh?.(await assetService.get(asset.id));
    } catch (error) {
      setPeripheralMessage(handleApiError(error));
    } finally {
      setSyncingPeripherals(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[1px]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 cursor-default" aria-hidden="true" />
      <div className="relative h-full w-full max-w-3xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Visualização do ativo</p>
            <h2 className="text-xl font-bold text-slate-900">{asset.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{assetTypeLabels[asset.type] || asset.category}</p>
          </div>
          <div className="flex items-center gap-2">
            {onEdit && <button type="button" onClick={onEdit} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Edit3 size={16} /> Editar</button>}
            <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar"><X size={20} /></button>
          </div>
        </div>

        <div className="space-y-6 p-6">
          <section>
            <h3 className="mb-3 font-semibold text-slate-900">Identificação</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <AssetInfo label="Nome" value={asset.name} copyable />
              <AssetInfo label="Tipo" value={assetTypeLabels[asset.type] || asset.type} />
              <AssetInfo label="Número de série" value={asset.serialNumber} copyable />
              <AssetInfo label="Fabricante" value={asset.manufacturer} />
              <AssetInfo label="Modelo" value={asset.model} />
              <AssetInfo label="Frequência/Banda" value={asset.bandFrequency} copyable />
            </div>
          </section>

          <section>
            <h3 className="mb-3 font-semibold text-slate-900">Situação e vínculo</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <AssetInfo label="Status" value={statusConfig[asset.status]?.label || asset.status} />
              <AssetInfo label="Condição" value={conditionLabels[asset.condition]} />
              <AssetInfo label="Usuário" value={userDisplay.name} />
              <AssetInfo label={asset.assignedTo ? 'E-mail do usuário' : 'Origem do usuário'} value={asset.assignedTo?.email || (asset.loggedUser ? 'Informado no ativo' : null)} copyable={Boolean(asset.assignedTo?.email)} />
              <AssetInfo label="Empresa" value={asset.company?.name || 'Não definida'} />
              <AssetInfo label="Localização" value={asset.location || 'Não informada'} />
            </div>
          </section>

          <section>
            <h3 className="mb-3 font-semibold text-slate-900">Rede e hardware</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <AssetInfo label="IP" value={asset.ipAddress} copyable />
              {showsNetworkConfiguration && <AssetInfo label="Gateway" value={asset.gateway} copyable />}
              <AssetInfo label="MAC" value={asset.macAddress} copyable />
              <AssetInfo label="Hostname" value={asset.hostname} copyable />
              {showsFirmware && <AssetInfo label="Firmware" value={asset.firmware} copyable />}
              {isComputerAsset && (
                <>
                  <AssetInfo label="Sistema" value={system || null} />
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Licença do Windows</p>
                    <p className="mt-1 break-all font-mono text-sm font-medium text-slate-800">{revealedWindowsKey || (asset.windowsProductKeyPartial ? `•••••-•••••-•••••-•••••-${asset.windowsProductKeyPartial}` : 'Não informada')}</p>
                    {licenseError && <p className="mt-1 text-xs text-red-600">{licenseError}</p>}
                    {user?.role === 'ADMIN' && !revealedWindowsKey && asset.windowsProductKeyPartial && (
                      <button type="button" disabled={revealingLicense} onClick={revealWindowsLicense} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 disabled:opacity-50">
                        <LockKeyhole size={13} /> {revealingLicense ? 'Verificando...' : 'Mostrar chave completa'}
                      </button>
                    )}
                  </div>
                  <AssetInfo label="Usuário do Windows / último login" value={asset.loggedUser} copyable />
                  <AssetInfo label="Instalação do Windows" value={formatDate(asset.windowsInstallDate)} />
                  <AssetInfo label="Última formatação" value={formatDate(asset.lastFormattedAt)} />
                  <AssetInfo label="Processador" value={asset.processor} />
                  <AssetInfo label="Memória (MB)" value={asset.memoryMb} />
                  <AssetInfo label="Disco (GB)" value={asset.diskGb} />
                </>
              )}
              <AssetInfo label="Portas abertas" value={asset.openPorts?.length ? asset.openPorts.join(', ') : null} copyable />
            </div>
          </section>

          {'parentAsset' in asset && asset.parentAsset && (
            <section>
              <h3 className="mb-3 font-semibold text-slate-900">Vínculo do periférico</h3>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                Este periférico acompanha <span className="font-semibold">{asset.parentAsset.name}</span> ({asset.parentAsset.assetTag}).
              </div>
            </section>
          )}

          {isComputerAsset && agentInventory && (
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div><h3 className="font-semibold text-slate-900">Softwares instalados</h3><p className="text-xs text-slate-500">Agente {agentInventory.agentName} · atualizado em {new Date(agentInventory.lastSeenAt).toLocaleString('pt-BR')}</p></div>
                <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700">{agentInventory.installedApplications.length} aplicativos</span>
              </div>
              {agentInventory.installedApplications.length ? (
                <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50">
                  {agentInventory.installedApplications.map((app, index) => <div key={`${app.name}-${app.version || ''}-${index}`} className="border-b border-slate-200 px-4 py-3 last:border-0"><p className="text-sm font-semibold text-slate-800">{app.name}</p><p className="text-xs text-slate-500">{[app.version, app.publisher, app.installDate].filter(Boolean).join(' · ') || 'Detalhes não informados'}</p></div>)}
                </div>
              ) : <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">O agente ainda não enviou a lista de aplicativos.</p>}
            </section>
          )}

          {isComputerAsset && (agentInventory?.connectedPeripherals.length || linkedPeripherals.length) ? (
            <section>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="font-semibold text-slate-900">Periféricos que acompanham o computador</h3><p className="text-xs text-slate-500">Revise os detectados e cadastre-os como ativos para permitir movimentação e descarte individual.</p></div>
                {hasPermission(user, 'MANAGE_ASSETS') && agentInventory?.connectedPeripherals.length ? <button type="button" disabled={syncingPeripherals} onClick={syncPeripherals} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-60"><RotateCcw size={14} className={syncingPeripherals ? 'animate-spin' : ''} /> {syncingPeripherals ? 'Sincronizando...' : 'Cadastrar / atualizar detectados'}</button> : null}
              </div>
              {peripheralMessage && <p className="mb-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">{peripheralMessage}</p>}
              {agentInventory?.connectedPeripherals.length ? <div className="mb-3 grid gap-2 sm:grid-cols-2">{agentInventory.connectedPeripherals.map((peripheral, index) => <div key={`${peripheral.kind}-${peripheral.deviceId || peripheral.serialNumber || index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-violet-600">{assetTypeLabels[peripheral.kind]}</p><p className="mt-1 text-sm font-semibold text-slate-800">{peripheral.name}</p><p className="mt-1 text-xs text-slate-500">{[peripheral.manufacturer, peripheral.model, peripheral.serialNumber ? `Série ${peripheral.serialNumber}` : null].filter(Boolean).join(' · ') || 'Identificação limitada pelo Windows'}</p></div>)}</div> : null}
              {linkedPeripherals.length ? <div><p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700">Ativos já vinculados</p><div className="space-y-2">{linkedPeripherals.map((peripheral) => <div key={peripheral.id} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><div><p className="text-sm font-semibold text-slate-800">{peripheral.name}</p><p className="text-xs text-slate-500">{assetTypeLabels[peripheral.type]} · {peripheral.assetTag}{peripheral.serialNumber ? ` · Série ${peripheral.serialNumber}` : ''}</p></div><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${statusConfig[peripheral.status].badge}`}>{statusConfig[peripheral.status].label}</span></div>)}</div></div> : null}
            </section>
          ) : null}

          {linkedPasswords.length > 0 && (
            <section>
              <h3 className="mb-3 font-semibold text-slate-900">Senhas vinculadas</h3>
              <div className="space-y-3">
                {linkedPasswords.map((entry) => {
                  const isVisible = Boolean(visiblePasswords[entry.id]);
                  const credentials = vaultCredentials(entry);
                  const hostInfo = [entry.ipAddress?.ipAddress, entry.host, entry.url].filter(Boolean).join(' · ');

                  return (
                    <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{entry.name}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{passwordVaultDeviceLabels[entry.deviceType] || entry.deviceType}{hostInfo ? ` · ${hostInfo}` : ''}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void toggleVaultEntry(entry)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          {isVisible ? 'Ocultar senhas' : 'Mostrar senhas'}
                        </button>
                      </div>

                      {credentials.length > 0 ? (
                        <div className="mt-3 grid gap-2">
                          {credentials.map((credential) => (
                            <div key={credential.label} className="grid gap-2 rounded-lg bg-white p-3 text-sm sm:grid-cols-[120px_1fr_1fr_auto] sm:items-center">
                              <span className="font-semibold text-slate-700">{credential.label}</span>
                              <span className="break-all text-slate-700">{credential.username || '—'}</span>
                              <span className="break-all font-mono text-slate-700">{credential.password ? (isVisible ? credential.password : '••••••••') : credential.configured ? '••••••••' : '—'}</span>
                              {credential.password && (
                                <button type="button" onClick={() => copyTextToClipboard(credential.password)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50">
                                  <Copy size={13} /> Copiar
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-slate-500">Registro vinculado sem usuario ou senha preenchidos.</p>
                      )}

                      {entry.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-white p-3 text-xs text-slate-500">{entry.notes}</p>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-3 font-semibold text-slate-900">Compra e garantia</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <AssetInfo label="Adquirido por" value={asset.purchasedByCompany?.name || 'Não informado'} />
              <AssetInfo label="Fornecedor" value={asset.supplier?.name || asset.purchaseSupplier} />
              <AssetInfo label="Nota fiscal" value={asset.purchaseInvoiceNumber} copyable />
              <AssetInfo label="Chave de acesso da NF" value={asset.purchaseInvoiceAccessKey} copyable />
              <AssetInfo label="Data da compra" value={formatDate(asset.purchaseDate)} />
              <AssetInfo label="Fim da garantia" value={formatDate(asset.warrantyExpires)} />
              <AssetInfo label="Valor" value={purchaseValue} />
              <AssetInfo label="Atualizado em" value={formatDate(asset.updatedAt)} />
            </div>
          </section>

          <section>
            <h3 className="mb-3 font-semibold text-slate-900">Observações</h3>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap">{asset.notes || '—'}</div>
          </section>
          {'history' in asset && asset.history.length > 0 && (
            <section>
              <h3 className="mb-3 font-semibold text-slate-900">Histórico do ativo</h3>
              <div className="space-y-2">{asset.history.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="whitespace-pre-wrap text-sm font-medium text-slate-800">{item.description}</p><p className="mt-1 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString('pt-BR')} · {item.performedBy.name}</p></div>)}</div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function AssetReportModal({
  initialFilters,
  locations,
  companies,
  suppliers,
  onClose,
  onPrint,
}: {
  initialFilters: AssetReportFilters;
  locations: string[];
  companies: Company[];
  suppliers: Supplier[];
  onClose: () => void;
  onPrint: (filters: AssetReportFilters) => void;
}) {
  const [filters, setFilters] = useState<AssetReportFilters>(initialFilters);
  const update = <K extends keyof AssetReportFilters>(key: K, value: AssetReportFilters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const inputClass = 'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
  const labelClass = 'text-sm font-medium text-slate-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[1px]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 cursor-default" aria-hidden="true" />
      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Relatório</p>
            <h2 className="text-xl font-bold text-slate-900">Relatório de ativos</h2>
            <p className="mt-1 text-sm text-slate-500">Escolha os filtros que devem sair na impressão/PDF.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar relatório"><X size={20} /></button>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
          <label className={`${labelClass} lg:col-span-3`}>Busca geral<input value={filters.search} onChange={(event) => update('search', event.target.value)} className={inputClass} placeholder="Nome, série, IP, usuário, fornecedor..." /></label>
          <label className={labelClass}>Status<select value={filters.status} onChange={(event) => update('status', event.target.value as AssetStatus | '')} className={inputClass}><option value="">Todos os status</option>{Object.entries(statusConfig).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select></label>
          <label className={labelClass}>Tipo<select value={filters.type} onChange={(event) => update('type', event.target.value as AssetType | '')} className={inputClass}><option value="">Todos os tipos</option>{Object.entries(assetTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className={labelClass}>Localização<select value={filters.location} onChange={(event) => update('location', event.target.value)} className={inputClass}><option value="">Todas as localizações</option>{locations.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className={labelClass}>Empresa onde está<select value={filters.companyId} onChange={(event) => update('companyId', event.target.value)} className={inputClass}><option value="">Todas as empresas</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
          <label className={labelClass}>Ativo adquirido por<select value={filters.purchasedByCompanyId} onChange={(event) => update('purchasedByCompanyId', event.target.value)} className={inputClass}><option value="">Qualquer empresa</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
          <label className={labelClass}>Fornecedor<select value={filters.supplierId} onChange={(event) => update('supplierId', event.target.value)} className={inputClass}><option value="">Todos os fornecedores</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
          <label className={labelClass}>Prazo de garantia<select value={filters.warranty} onChange={(event) => update('warranty', event.target.value as 'ACTIVE' | 'EXPIRED' | '')} className={inputClass}><option value="">Todos os prazos</option><option value="ACTIVE">Garantia vigente</option><option value="EXPIRED">Garantia vencida</option></select></label>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button type="button" onClick={() => onPrint(filters)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"><Printer size={18} /> Gerar impressão/PDF</button>
        </div>
      </div>
    </div>
  );
}

function DeleteAssetModal({ description, count, onClose, onConfirm }: { description: string; count: number; onClose: () => void; onConfirm: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(password);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-asset-title">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex gap-3"><span className="rounded-xl bg-red-50 p-2.5 text-red-600"><Trash2 size={21} /></span><div><h2 id="delete-asset-title" className="text-lg font-bold text-slate-900">Excluir {count === 1 ? 'ativo' : `${count} ativos`}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div></div>
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar"><X size={19} /></button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <p className="text-sm text-slate-600">Esta ação é definitiva. Digite sua senha para confirmar.</p>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <label className="block text-sm font-semibold text-slate-700">Senha *<span className="relative mt-1.5 block"><LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input autoFocus required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 font-normal focus:border-red-500 focus:ring-2 focus:ring-red-100" /></span></label>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button>
          <button disabled={submitting || !password} className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">{submitting ? 'Excluindo...' : 'Confirmar exclusão'}</button>
        </div>
      </form>
    </div>
  );
}

function CompleteMaintenanceModal({ asset, users, onClose, onConfirm }: {
  asset: Asset;
  users: User[];
  onClose: () => void;
  onConfirm: (data: { services: string[]; details: string; assignedToId: string | null }) => Promise<void>;
}) {
  const [services, setServices] = useState<string[]>([]);
  const [details, setDetails] = useState('');
  const [assignedToId, setAssignedToId] = useState(asset.assignedToId || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggleService = (service: string) => setServices((current) => current.includes(service)
    ? current.filter((item) => item !== service)
    : [...current, service]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!services.length || details.trim().length < 3) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm({ services, details: details.trim(), assignedToId: assignedToId || null });
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Conclusão da manutenção</p><h2 className="text-xl font-bold text-slate-900">{asset.name}</h2><p className="mt-1 text-sm text-slate-500">Informe obrigatoriamente o que foi realizado antes da devolução.</p></div>
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="space-y-5 p-6">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <fieldset><legend className="mb-2 text-sm font-semibold text-slate-700">Serviços realizados *</legend><div className="grid gap-2 sm:grid-cols-2">{maintenanceServiceOptions.map(([value, label]) => <label key={value} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${services.includes(value) ? 'border-blue-400 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-700'}`}><input type="checkbox" checked={services.includes(value)} onChange={() => toggleService(value)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />{label}</label>)}</div></fieldset>
          <label className="block text-sm font-semibold text-slate-700">Descrição do serviço *<textarea required minLength={3} rows={4} value={details} onChange={(event) => setDetails(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Ex.: formatado, instalado Windows, realizada limpeza interna e substituído teclado com defeito." /></label>
          <label className="block text-sm font-semibold text-slate-700">Destino após manutenção<select value={assignedToId} onChange={(event) => setAssignedToId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal"><option value="">Deixar disponível sem usuário</option>{users.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name} — {item.email}</option>)}</select></label>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4"><button type="button" onClick={onClose} disabled={submitting} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button><button disabled={submitting || !services.length || details.trim().length < 3} className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{submitting ? 'Registrando...' : 'Concluir e devolver'}</button></div>
      </form>
    </div>
  );
}

const donorPartOptions = [
  'Memória RAM',
  'SSD / HD',
  'Carregador / fonte',
  'Bateria',
  'Tela / display',
  'Teclado',
  'Touchpad / mouse',
  'Placa-mãe',
  'Processador',
  'Cooler / ventoinha',
  'Placa Wi-Fi',
  'Gabinete / carcaça',
];

function DonorAssetModal({ asset, onClose, onConfirm }: {
  asset: Asset;
  onClose: () => void;
  onConfirm: (data: AssetDonorInput) => Promise<void>;
}) {
  const [storeAll, setStoreAll] = useState(false);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [customPart, setCustomPart] = useState('');
  const [location, setLocation] = useState(asset.location || '');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const togglePart = (name: string) => setSelected((current) => {
    const next = { ...current };
    if (next[name]) delete next[name];
    else next[name] = 1;
    return next;
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parts = Object.entries(selected).map(([name, quantity]) => ({ name, quantity }));
    if (!storeAll && customPart.trim()) parts.push({ name: customPart.trim(), quantity: 1 });
    if ((!storeAll && !parts.length) || notes.trim().length < 3) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm({ storeAll, parts, location: location || null, notes: notes.trim() });
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="donor-asset-title">
      <form onSubmit={submit} className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex gap-3"><span className="rounded-xl bg-violet-50 p-2.5 text-violet-700"><PackagePlus size={22} /></span><div><p className="text-xs font-semibold uppercase tracking-wider text-violet-600">Aproveitamento de componentes</p><h2 id="donor-asset-title" className="text-xl font-bold text-slate-900">Transformar em doador de peças</h2><p className="mt-1 text-sm text-slate-500">{asset.name} · {asset.assetTag}</p></div></div>
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto p-6">
          <div className="space-y-5">
            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${storeAll ? 'border-violet-400 bg-violet-50' : 'border-slate-200'}`}><input type="checkbox" checked={storeAll} onChange={(event) => setStoreAll(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-600" /><span><span className="block text-sm font-semibold text-slate-900">Guardar o equipamento inteiro</span><span className="mt-1 block text-xs text-slate-500">O estoque receberá um único item completo para retirada futura de peças.</span></span></label>

            {!storeAll && <fieldset><legend className="mb-2 text-sm font-semibold text-slate-700">Peças que serão guardadas *</legend><div className="grid gap-2 sm:grid-cols-2">{donorPartOptions.map((name) => <label key={name} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${selected[name] ? 'border-violet-300 bg-violet-50 text-violet-900' : 'border-slate-200 text-slate-700'}`}><input type="checkbox" checked={Boolean(selected[name])} onChange={() => togglePart(name)} className="h-4 w-4 rounded border-slate-300 text-violet-600" /><span className="min-w-0 flex-1">{name}</span>{selected[name] && <input aria-label={`Quantidade de ${name}`} type="number" min="1" max="100" value={selected[name]} onChange={(event) => setSelected((current) => ({ ...current, [name]: Math.max(1, Number(event.target.value) || 1) }))} className="w-16 rounded-md border border-violet-200 bg-white px-2 py-1 text-center" />}</label>)}</div><label className="mt-3 block text-sm font-medium text-slate-700">Outra peça<input value={customPart} onChange={(event) => setCustomPart(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="Ex.: dobradiças, alto-falantes, cabo flat..." /></label></fieldset>}

            <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">Local onde ficará armazenado<input value={location} onChange={(event) => setLocation(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" placeholder="Ex.: Almoxarifado TI" /></label><label className="text-sm font-semibold text-slate-700">Motivo / estado do equipamento *<textarea required minLength={3} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" placeholder="Ex.: placa-mãe queimada; tela, memória e SSD em bom estado." /></label></div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">As peças entrarão no estoque como usadas, com movimentação de entrada vinculada a este ativo e ao responsável pela operação.</div>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4"><button type="button" onClick={onClose} disabled={submitting} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button><button disabled={submitting || notes.trim().length < 3 || (!storeAll && !Object.keys(selected).length && !customPart.trim())} className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50">{submitting ? 'Registrando...' : 'Confirmar e enviar ao estoque'}</button></div>
      </form>
    </div>
  );
}

export function Assets() {
  const { user } = useAuthStore();
  const canManage = hasPermission(user, 'MANAGE_ASSETS');
  const canDiscover = hasPermission(user, 'DISCOVER_ASSETS');
  const canDelete = user?.role === 'ADMIN';
  const [data, setData] = useState<AssetListResult | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
  const [status, setStatus] = useState<AssetStatus | ''>('');
  const [type, setType] = useState<AssetType | ''>('');
  const [location, setLocation] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [purchasedByCompanyId, setPurchasedByCompanyId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [warranty, setWarranty] = useState<'ACTIVE' | 'EXPIRED' | ''>('');
  const columns = useVisibleColumns('controlall-assets-columns', assetColumnOptions);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [viewing, setViewing] = useState<Asset | AssetDetail | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const [sort, setSort] = useState<SortState<AssetSortKey>>({ key: 'updatedAt', direction: 'desc' });
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(() => new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; description: string } | null>(null);
  const [maintenanceTarget, setMaintenanceTarget] = useState<Asset | null>(null);
  const [donorTarget, setDonorTarget] = useState<Asset | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await assetService.list({ search: search || undefined, status, type: type || undefined, location: location || undefined, companyId: companyId || undefined, purchasedByCompanyId: purchasedByCompanyId || undefined, supplierId: supplierId || undefined, warranty, sortKey: sort.key, sortDirection: sort.direction, page, limit: pageSize })); }
    catch (err) { setError(handleApiError(err)); }
    finally { setLoading(false); }
  }, [search, status, type, location, companyId, purchasedByCompanyId, supplierId, warranty, sort, page, pageSize]);

  useEffect(() => { const timer = window.setTimeout(load, 250); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { const timer = window.setInterval(load, 120000); return () => window.clearInterval(timer); }, [load]);
  useEffect(() => { if (canManage) userService.getAllUsers().then(setUsers).catch(() => setUsers([])); }, [canManage]);
  useEffect(() => { if (canManage || canDiscover) companyService.list().then(setCompanies).catch(() => setCompanies([])); }, [canManage, canDiscover]);
  useEffect(() => { supplierService.list().then(setSuppliers).catch(() => setSuppliers([])); }, []);
  useEffect(() => { setPage(1); }, [search, status, type, location, companyId, purchasedByCompanyId, supplierId, warranty]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 5000); return () => window.clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (!menu) return;
    const closeActionMenu = () => {
      setMenu(null);
      setMenuPosition(null);
    };
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-asset-action-menu]') || target.closest('[data-asset-action-trigger]')) return;
      closeActionMenu();
    };
    window.addEventListener('scroll', closeActionMenu);
    window.addEventListener('resize', closeActionMenu);
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => {
      window.removeEventListener('scroll', closeActionMenu);
      window.removeEventListener('resize', closeActionMenu);
      document.removeEventListener('pointerdown', closeOnOutsideClick);
    };
  }, [menu]);

  const totalValue = useMemo(() => data?.assets.reduce((sum, asset) => sum + Number(asset.purchaseCost || 0), 0) || 0, [data]);
  const totalAssets = useMemo(
    () => (data?.summary.AVAILABLE || 0) + (data?.summary.ASSIGNED || 0),
    [data],
  );
  const sortedAssets = data?.assets || [];
  const allPageSelected = sortedAssets.length > 0 && sortedAssets.every((asset) => selectedAssetIds.has(asset.id));
  const selectedCount = selectedAssetIds.size;
  const selectedAssets = useMemo(() => sortedAssets.filter((asset) => selectedAssetIds.has(asset.id)), [sortedAssets, selectedAssetIds]);

  useEffect(() => {
    const visibleIds = new Set((data?.assets || []).map((asset) => asset.id));
    setSelectedAssetIds((current) => new Set([...current].filter((id) => visibleIds.has(id))));
  }, [data]);

  const changeSort = (nextKey: AssetSortKey) => {
    setSort((current) => nextSort(current, nextKey));
    setPage(1);
  };

  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const togglePageSelection = () => {
    setSelectedAssetIds((current) => {
      const next = new Set(current);
      if (allPageSelected) sortedAssets.forEach((asset) => next.delete(asset.id));
      else sortedAssets.forEach((asset) => next.add(asset.id));
      return next;
    });
  };

  const toggleActionMenu = (event: ReactMouseEvent<HTMLButtonElement>, assetId: string) => {
    if (menu === assetId) {
      setMenu(null);
      setMenuPosition(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const estimatedMenuHeight = 440;
    setMenuPosition({
      top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - estimatedMenuHeight - 8)),
      right: Math.max(8, window.innerWidth - rect.right),
    });
    setMenu(assetId);
  };

  const deleteSelectedAssets = async () => {
    const ids = [...selectedAssetIds];
    if (!ids.length) return;
    setDeleteTarget({ ids, description: `${ids.length} ativo${ids.length === 1 ? '' : 's'} selecionado${ids.length === 1 ? '' : 's'}` });
  };

  const confirmAssetDeletion = async (password: string) => {
    if (!deleteTarget) return;
    const ids = deleteTarget.ids;
    setDeletingSelected(true);
    setMenu(null);
    try {
      for (const id of ids) await assetService.delete(id, password);
      setSelectedAssetIds(new Set());
      setNotice(`${ids.length} ativo${ids.length === 1 ? '' : 's'} excluído${ids.length === 1 ? '' : 's'}.`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      throw err;
    } finally {
      setDeletingSelected(false);
    }
  };
  const applyStatusFilter = (nextStatus: AssetStatus | '') => {
    setStatus(nextStatus);
    setPage(1);
  };
  const statsCards = [
    { label: 'Todos os ativos', value: totalAssets, Icon: Laptop, color: 'text-slate-700 bg-slate-100', targetStatus: '' as const },
    { label: 'DisponÃ­veis', value: data?.summary.AVAILABLE || 0, Icon: CheckCircle2, color: 'text-emerald-700 bg-emerald-50', targetStatus: 'AVAILABLE' as const },
    { label: 'Em uso', value: data?.summary.ASSIGNED || 0, Icon: UserRoundCheck, color: 'text-blue-700 bg-blue-50', targetStatus: 'ASSIGNED' as const },
    { label: 'Em manutenÃ§Ã£o', value: data?.summary.MAINTENANCE || 0, Icon: Wrench, color: 'text-amber-700 bg-amber-50', targetStatus: 'MAINTENANCE' as const },
    { label: 'Em garantia', value: data?.summary.WARRANTY || 0, Icon: ShieldCheck, color: 'text-cyan-700 bg-cyan-50', targetStatus: 'WARRANTY' as const },
    { label: 'Doadores', value: data?.summary.DONOR || 0, Icon: PackagePlus, color: 'text-violet-700 bg-violet-50', targetStatus: 'DONOR' as const },
  ];
  const completeAction = async (message: string, action: () => Promise<unknown>) => {
    setMenu(null);
    try { await action(); setNotice(message); await load(); }
    catch (err) { setError(handleApiError(err)); }
  };
  const cancelMaintenance = async (asset: Asset) => {
    if (!window.confirm(`Cancelar o envio de ${asset.name} para manutenção? Use isso quando o ativo foi marcado por engano.`)) return;
    const nextStatus: AssetStatus = asset.assignedToId ? 'ASSIGNED' : 'AVAILABLE';
    await completeAction(
      asset.assignedToId ? 'Envio à manutenção cancelado; ativo retornou para o usuário.' : 'Envio à manutenção cancelado; ativo voltou para disponível.',
      () => assetService.update(asset.id, { status: nextStatus, assignedToId: asset.assignedToId || null }),
    );
  };
  const completeMaintenance = async (data: { services: string[]; details: string; assignedToId: string | null }) => {
    if (!maintenanceTarget) return;
    await assetService.completeMaintenance(maintenanceTarget.id, data);
    setMaintenanceTarget(null);
    setNotice('Manutenção concluída e serviço registrado no relatório.');
    await load();
  };
  const makeDonor = async (input: AssetDonorInput) => {
    if (!donorTarget) return;
    const result = await assetService.makeDonor(donorTarget.id, input);
    setDonorTarget(null);
    setNotice(`Ativo marcado como doador. ${result.storedParts.length} item${result.storedParts.length === 1 ? '' : 's'} registrado${result.storedParts.length === 1 ? '' : 's'} no estoque.`);
    await load();
  };
  const disposeAsset = async (asset: Asset) => {
    if (!window.confirm(`Registrar descarte de ${asset.name}? O ativo será marcado como retirado.`)) return;
    await completeAction('Ativo registrado para descarte.', () => disposalService.create({
      assetId: asset.id,
      quantity: 1,
      reason: 'Descartado pela tela de ativos',
      disposalDate: new Date().toISOString().slice(0, 10),
    }));
  };
  const openView = async (asset: Asset) => {
    setViewing(asset);
    setMenu(null);
    try {
      setViewing(await assetService.get(asset.id));
    } catch (err) {
      setError(handleApiError(err));
    }
  };
  const openEdit = (asset: Asset) => { setEditing(asset); setViewing(null); setFormOpen(true); setMenu(null); };
  const handleImported = async (summary: ImportSummary) => {
    setDiscoveryOpen(false);
    setSearch('');
    setStatus('');
    setType('');
    setLocation('');
    setCompanyId('');
    setPurchasedByCompanyId('');
    setSupplierId('');
    setWarranty('');
    setPage(1);
    setNotice(summary.mode === 'detailed'
      ? `${summary.total} ativo${summary.total === 1 ? '' : 's'} com inventário Windows atualizado${summary.total === 1 ? '' : 's'}${summary.failed ? ` (${summary.failed} falha${summary.failed === 1 ? '' : 's'})` : ''}.`
      : summary.mode === 'printer'
        ? `${summary.created} impressora${summary.created === 1 ? '' : 's'} incluída${summary.created === 1 ? '' : 's'}${summary.updated ? `, ${summary.updated} atualizada${summary.updated === 1 ? '' : 's'}` : ''}${summary.skipped ? ` e ${summary.skipped} já conhecida${summary.skipped === 1 ? '' : 's'} sem alterações` : ''}${summary.failed ? ` (${summary.failed} falha${summary.failed === 1 ? '' : 's'})` : ''}.`
        : `${summary.total} ativo${summary.total === 1 ? '' : 's'} processado${summary.total === 1 ? '' : 's'} da rede (${summary.created} novo${summary.created === 1 ? '' : 's'}, ${summary.updated} atualizado${summary.updated === 1 ? '' : 's'}${summary.skipped ? `, ${summary.skipped} sem alteração física` : ''}, ${summary.failed} falha${summary.failed === 1 ? '' : 's'}).`);
    setLoading(true);
    try { setData(await assetService.list({ page: 1, limit: 20 })); }
    catch (err) { setError(handleApiError(err)); }
    finally { setLoading(false); }
  };

  const currentReportFilters: AssetReportFilters = {
    search,
    status,
    type,
    location,
    companyId,
    purchasedByCompanyId,
    supplierId,
    warranty,
  };
  const applySavedFilters = (filters: AssetReportFilters) => {
    setSearch(filters.search || '');
    setStatus(filters.status || '');
    setType(filters.type || '');
    setLocation(filters.location || '');
    setCompanyId(filters.companyId || '');
    setPurchasedByCompanyId(filters.purchasedByCompanyId || '');
    setSupplierId(filters.supplierId || '');
    setWarranty(filters.warranty || '');
    setPage(1);
  };
  const visibleTableColumns = assetColumnOptions.filter((column) => columns.isVisible(column.id));
  const tableColumnCount = visibleTableColumns.length + 1 + (canDelete ? 1 : 0);

  const printAssetsReport = async (filters: AssetReportFilters, assetsToPrint?: Asset[]) => {
    try {
      const escapeHtml = (value: unknown) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

      const selectedMode = Boolean(assetsToPrint?.length);
      const report = selectedMode ? null : await assetService.list({
        search: filters.search || undefined,
        status: filters.status || undefined,
        type: filters.type || undefined,
        location: filters.location || undefined,
        companyId: filters.companyId || undefined,
        purchasedByCompanyId: filters.purchasedByCompanyId || undefined,
        supplierId: filters.supplierId || undefined,
        warranty: filters.warranty || undefined,
        page: 1,
        limit: 1000,
      });
      const reportAssets = assetsToPrint?.length ? assetsToPrint : report?.assets || [];

      const activeFilters = [
        selectedMode && `${reportAssets.length} ativo(s) selecionado(s) manualmente`,
        filters.search && `Busca: ${filters.search}`,
        filters.status && `Status: ${statusConfig[filters.status]?.label || filters.status}`,
        filters.type && `Tipo: ${assetTypeLabels[filters.type] || filters.type}`,
        filters.location && `Local: ${filters.location}`,
        filters.companyId && `Empresa: ${companies.find((company) => company.id === filters.companyId)?.name || filters.companyId}`,
        filters.purchasedByCompanyId && `Adquirido por: ${companies.find((company) => company.id === filters.purchasedByCompanyId)?.name || filters.purchasedByCompanyId}`,
        filters.supplierId && `Fornecedor: ${suppliers.find((supplier) => supplier.id === filters.supplierId)?.name || filters.supplierId}`,
        filters.warranty === 'ACTIVE' && 'Garantia: Vigente',
        filters.warranty === 'EXPIRED' && 'Garantia: Vencida',
      ].filter(Boolean).map(escapeHtml).join(' | ') || 'Sem filtros aplicados';

      const reportSummary = {
        total: reportAssets.length,
        available: reportAssets.filter((asset) => asset.status === 'AVAILABLE').length,
        assigned: reportAssets.filter((asset) => asset.status === 'ASSIGNED').length,
        maintenance: reportAssets.filter((asset) => asset.status === 'MAINTENANCE').length,
        warranty: reportAssets.filter((asset) => asset.status === 'WARRANTY').length,
      };

      const rows = reportAssets.map((asset) => `
        <tr>
          <td>${escapeHtml(asset.name)}</td>
          <td>${escapeHtml(assetTypeLabels[asset.type] || asset.category)}</td>
          <td>${escapeHtml(asset.company?.name || 'Não definida')}</td>
          <td>${escapeHtml(asset.purchasedByCompany?.name || 'Não informado')}</td>
          <td>${escapeHtml(statusConfig[asset.status]?.label || asset.status)}</td>
          <td>${escapeHtml(asset.assignedTo?.name || asset.loggedUser || 'Sem usuário')}</td>
          <td>${escapeHtml(asset.location || 'Não informada')}</td>
          <td>${escapeHtml(asset.ipAddress || '—')}</td>
          <td>${escapeHtml(asset.serialNumber || '—')}</td>
          <td>${escapeHtml(asset.supplier?.name || asset.purchaseSupplier || '—')}</td>
          <td>${escapeHtml(asset.purchaseInvoiceNumber || '—')}</td>
          <td>${escapeHtml(asset.processor || '—')}</td>
          <td>${escapeHtml([asset.operatingSystem, asset.osVersion, asset.osArchitecture].filter(Boolean).join(' · ') || '—')}</td>
        </tr>
      `).join('');

      const popup = window.open('', '_blank', 'width=1200,height=800');
      if (!popup) {
        setError('Não foi possível abrir a janela de impressão. Verifique se o navegador bloqueou pop-ups.');
        return;
      }

      popup.document.write(`
        <!doctype html>
        <html lang="pt-BR">
          <head>
            <meta charset="utf-8" />
            <title>Relatório de Ativos</title>
            <style>
              body { font-family: Arial, sans-serif; color: #0f172a; margin: 24px; }
              h1 { margin: 0; font-size: 24px; }
              .meta { margin: 6px 0 18px; color: #475569; font-size: 12px; }
              table { width: 100%; border-collapse: collapse; font-size: 11px; }
              th, td { border: 1px solid #cbd5e1; padding: 7px; text-align: left; vertical-align: top; }
              th { background: #f1f5f9; text-transform: uppercase; font-size: 10px; }
              .summary { margin-bottom: 14px; font-size: 13px; }
              @media print { button { display: none; } body { margin: 12mm; } }
            </style>
          </head>
          <body>
            <button onclick="window.print()" style="margin-bottom:16px;padding:8px 12px;">Imprimir / Salvar PDF</button>
            <h1>Relatório de Ativos</h1>
            <p class="meta">Gerado em ${new Date().toLocaleString('pt-BR')} · ${selectedMode ? reportAssets.length : report?.pagination.total || 0} ativo(s) encontrado(s)</p>
            <p class="summary"><strong>Filtros:</strong> ${activeFilters}</p>
            <p class="summary">Resumo: ${reportSummary.total} ativo(s), ${reportSummary.available} disponível(is), ${reportSummary.assigned} em uso, ${reportSummary.maintenance} em manutenção e ${reportSummary.warranty} em garantia.${selectedMode ? ' Listando somente os ativos selecionados.' : ' Listando até 1000 ativos conforme os filtros selecionados.'}</p>
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Empresa</th>
                  <th>Adquirido por</th>
                  <th>Status</th>
                  <th>Usuário</th>
                  <th>Localização</th>
                  <th>IP</th>
                  <th>Série</th>
                  <th>Fornecedor</th>
                  <th>NF</th>
                  <th>Processador</th>
                  <th>Sistema</th>
                </tr>
              </thead>
              <tbody>${rows || '<tr><td colspan="13">Nenhum ativo encontrado</td></tr>'}</tbody>
            </table>
            <script>setTimeout(() => window.print(), 300);</script>
          </body>
        </html>
      `);
      popup.document.close();
      setReportOpen(false);
    } catch (err) {
      setError(handleApiError(err));
    }
  };

  const printMaintenanceReport = async () => {
    const popup = window.open('', '_blank');
    if (!popup) {
      setError('Não foi possível abrir o relatório. Verifique se o navegador bloqueou pop-ups.');
      return;
    }
    try {
      const records: MaintenanceRecord[] = await assetService.maintenanceReport();
      const escapeHtml = (value: unknown) => String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
      const rows = records.map((record) => `<tr><td>${escapeHtml(new Date(record.createdAt).toLocaleString('pt-BR'))}</td><td><strong>${escapeHtml(record.asset.name)}</strong><br><small>${escapeHtml(record.asset.assetTag)}${record.asset.serialNumber ? ` · Série: ${escapeHtml(record.asset.serialNumber)}` : ''}</small></td><td>${escapeHtml(assetTypeLabels[record.asset.type] || record.asset.type)}</td><td>${escapeHtml(record.description)}</td><td>${escapeHtml(record.performedBy.name)}</td><td>${escapeHtml(record.asset.location || '—')}</td></tr>`).join('');
      popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de manutenções</title><style>body{font-family:Arial,sans-serif;color:#0f172a;margin:28px}h1{margin:0 0 6px}.meta{color:#64748b;margin-bottom:22px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;vertical-align:top}th{background:#f1f5f9}small{color:#64748b}@media print{body{margin:10px}}</style></head><body><h1>Relatório de manutenções concluídas</h1><p class="meta">Gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))} · ${records.length} registro(s)</p><table><thead><tr><th>Data/hora</th><th>Ativo</th><th>Tipo</th><th>Serviços realizados e devolução</th><th>Registrado por</th><th>Localização</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Nenhuma manutenção concluída registrada.</td></tr>'}</tbody></table><script>setTimeout(()=>window.print(),300)</script></body></html>`);
      popup.document.close();
    } catch (err) {
      popup.close();
      setError(handleApiError(err));
    }
  };

  const printQrLabel = async (asset: Asset) => {
    setMenu(null);
    const popup = window.open('', '_blank', 'width=560,height=680');
    if (!popup) {
      setError('Não foi possível abrir a etiqueta. Verifique se o navegador bloqueou pop-ups.');
      return;
    }
    popup.document.write('<p style="font-family:Arial;padding:24px">Gerando etiqueta...</p>');
    try {
      const { toDataURL } = await import('qrcode');
      const assetUrl = `${window.location.origin}/assets?q=${encodeURIComponent(asset.assetTag)}`;
      const qr = await toDataURL(assetUrl, { width: 360, margin: 1, errorCorrectionLevel: 'M' });
      const escapeHtml = (value: unknown) => String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
      popup.document.open();
        popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Etiqueta ${escapeHtml(asset.assetTag)}</title><style>@page{size:62mm 90mm;margin:3mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#0f172a}.label{width:56mm;min-height:82mm;border:1px solid #cbd5e1;border-radius:10px;padding:4mm;text-align:center}.brand{font-size:10px;font-weight:800;letter-spacing:1.3px;color:#0b5ed7}.name{font-size:16px;font-weight:800;margin:5px 0 2px}.tag{font:700 13px monospace;color:#334155}.qr{width:43mm;height:43mm;margin:3mm auto}.details{font-size:9px;line-height:1.45;color:#475569;overflow-wrap:anywhere}@media print{.label{border:0}.actions{display:none}}</style></head><body><div class="label"><div class="brand">NEXXATI ATIVOS</div><div class="name">${escapeHtml(asset.name)}</div><div class="tag">${escapeHtml(asset.assetTag)}</div><img class="qr" src="${qr}" alt="QR Code"><div class="details">${escapeHtml([asset.manufacturer, asset.model].filter(Boolean).join(' ') || assetTypeLabels[asset.type])}<br>${asset.serialNumber ? `Série: ${escapeHtml(asset.serialNumber)}<br>` : ''}${asset.company?.name ? escapeHtml(asset.company.name) : ''}</div></div><div class="actions" style="margin:14px"><button onclick="window.print()">Imprimir etiqueta</button></div></body></html>`);
      popup.document.close();
    } catch (err) {
      popup.close();
      setError(handleApiError(err));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <AppNav />
      <main className="mx-auto max-w-[1500px]">
        <section className="premium-hero relative mb-7 overflow-hidden rounded-[1.75rem] border border-slate-800 p-6 text-white shadow-2xl shadow-slate-900/15 sm:p-8">
          <div className="premium-hero-glow absolute -right-20 -top-24 h-72 w-72 rounded-full opacity-20 blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-white/5 blur-3xl" />
          <PackageCheck className="absolute -bottom-12 right-8 hidden text-white opacity-[0.06] sm:block" size={210} strokeWidth={1.2} />
          <div className="relative flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white/75"><Sparkles size={14} /> Inventário inteligente</div>
              <h1 className="text-3xl font-black tracking-[-0.04em] sm:text-4xl">Ativos</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Controle equipamentos, responsáveis, localizações e todo o ciclo de vida em uma visão centralizada.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setReportOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white shadow-sm backdrop-blur transition hover:bg-white/20"><Printer size={18} /> Imprimir / PDF</button>
              <button onClick={printMaintenanceReport} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white shadow-sm backdrop-blur transition hover:bg-white/20"><Wrench size={18} /> Manutenções</button>
              {canDiscover && <button onClick={() => setDiscoveryOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-50"><Radar size={18} /> Descobrir na rede</button>}
              {canManage && <button onClick={() => { setEditing(null); setFormOpen(true); }} className="premium-primary-action inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5"><Plus size={18} /> Novo ativo</button>}
            </div>
          </div>
        </section>

        {notice && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</div>}
        {error && <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><ShieldAlert size={18} />{error}</div>}
        {canDelete && selectedCount > 0 && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-semibold text-red-800">{selectedCount} ativo{selectedCount === 1 ? '' : 's'} selecionado{selectedCount === 1 ? '' : 's'}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => printAssetsReport(currentReportFilters, selectedAssets)} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-50"><Printer size={16} /> Imprimir selecionados</button>
              <button onClick={() => setSelectedAssetIds(new Set())} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Limpar seleção</button>
              <button onClick={deleteSelectedAssets} disabled={deletingSelected} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60"><Trash2 size={16} /> {deletingSelected ? 'Excluindo...' : 'Excluir selecionados'}</button>
            </div>
          </div>
        )}

        <div className="mb-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
          {statsCards.map(({ label, value, Icon, color, targetStatus }) => {
            const active = status === targetStatus;
            const displayLabel = targetStatus === 'AVAILABLE' ? 'Disponíveis' : targetStatus === 'MAINTENANCE' ? 'Em manutenção' : label;
            return (
              <button
                key={targetStatus || 'ALL'}
                type="button"
                onClick={() => applyStatusFilter(targetStatus)}
                aria-pressed={active}
                title={`Filtrar por ${displayLabel.toLowerCase()}`}
                className={`premium-metric-card rounded-2xl border bg-white/90 p-4 text-left shadow-lg shadow-slate-900/5 backdrop-blur transition hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-200 ${active ? 'border-blue-500 ring-2 ring-blue-100' : 'border-white/80 hover:border-slate-300'}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-wide ${active ? 'text-blue-700' : 'text-slate-500'}`}>{displayLabel}</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
                  </div>
                  <span className={`rounded-xl p-3 ${color}`}><Icon size={21} /></span>
                </div>
              </button>
            );
          })}
          <div className="premium-metric-card rounded-2xl border border-white/80 bg-white/90 p-4 shadow-lg shadow-slate-900/5 backdrop-blur"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Valor nesta página</p><p className="mt-2 text-2xl font-bold text-slate-900">{totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div><span className="rounded-xl bg-violet-50 p-3 text-violet-700"><CircleDollarSign size={21} /></span></div></div>
        </div>

        <section className="premium-assets-surface overflow-visible rounded-[1.5rem] border border-white/80 bg-white/90 shadow-xl shadow-slate-900/5 backdrop-blur">
          <div className="premium-filter-panel border-b border-slate-200/80 bg-gradient-to-r from-slate-50 to-white p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3"><span className="rounded-xl bg-slate-900 p-2.5 text-white shadow-lg"><SlidersHorizontal size={18} /></span><div><h2 className="font-bold text-slate-900">Filtros inteligentes</h2><p className="text-xs text-slate-500">Refine o inventário sem perder o contexto da lista.</p></div></div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <SavedFilterViews storageKey="controlall-assets-saved-views" current={currentReportFilters} onApply={applySavedFilters} />
                <TableColumnPicker options={assetColumnOptions} visible={columns.visible} onToggle={columns.toggle} onReset={columns.reset} />
                {(search || status || type || location || companyId || purchasedByCompanyId || supplierId || warranty) && <button type="button" onClick={() => applySavedFilters({ search: '', status: '', type: '', location: '', companyId: '', purchasedByCompanyId: '', supplierId: '', warranty: '' })} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100">Limpar filtros</button>}
              </div>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
            <label className="relative sm:col-span-2"><span className="sr-only">Pesquisar ativos</span><Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="premium-input w-full rounded-xl border border-slate-200 bg-white/90 py-3 pl-11 pr-3 text-sm shadow-sm" placeholder="Nome, série, IP ou usuário..." /></label>
            <select aria-label="Filtrar por status" value={status} onChange={(e) => setStatus(e.target.value as AssetStatus | '')} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="">Todos os status</option>{Object.entries(statusConfig).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select>
            <select aria-label="Filtrar por tipo" value={type} onChange={(e) => setType(e.target.value as AssetType | '')} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="">Todos os tipos</option>{Object.entries(assetTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select aria-label="Filtrar por localização" value={location} onChange={(e) => setLocation(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="">Todas as localizações</option>{data?.filters.locations.map((item) => <option key={item}>{item}</option>)}</select>
            <select aria-label="Filtrar por empresa" value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="">Todas as empresas</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select>
            <select aria-label="Filtrar por empresa adquirente" value={purchasedByCompanyId} onChange={(e) => setPurchasedByCompanyId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="">Adquirido por qualquer empresa</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select>
            <select aria-label="Filtrar por fornecedor" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="">Todos os fornecedores</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>
            <select aria-label="Filtrar por garantia" value={warranty} onChange={(e) => setWarranty(e.target.value as 'ACTIVE' | 'EXPIRED' | '')} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="">Todos os prazos</option><option value="ACTIVE">Garantia vigente</option><option value="EXPIRED">Garantia vencida</option></select>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50/90"><tr>
                {canDelete && (
                  <th className="px-3 py-3 text-left">
                    <input type="checkbox" checked={allPageSelected} onChange={togglePageSelection} aria-label="Selecionar ativos desta página" className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  </th>
                )}
                {visibleTableColumns.map(({ id, label }) => <SortableHeader key={id} label={label} sortKey={({ asset: 'name', type: 'type', company: 'company', status: 'status', user: 'assignedTo', location: 'location', installDate: 'windowsInstallDate', formattedAt: 'lastFormattedAt', updated: 'updatedAt' } as Partial<Record<AssetColumn, AssetSortKey>>)[id]} current={sort} onSort={changeSort} className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500" />)}
                <th className="sticky right-0 z-10 w-16 min-w-16 bg-slate-50/95 px-2 py-3 text-right shadow-[-12px_0_18px_-18px_rgba(15,23,42,0.55)]"><span className="sr-only">Ações</span></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? <tr><td colSpan={tableColumnCount} className="px-5 py-8"><div className="space-y-3" aria-label="Carregando inventário"><div className="premium-skeleton h-4 w-1/3 rounded-full" /><div className="premium-skeleton h-12 w-full rounded-xl" /><div className="premium-skeleton h-12 w-full rounded-xl" /><div className="premium-skeleton h-12 w-4/5 rounded-xl" /></div></td></tr>
                : sortedAssets.length ? sortedAssets.map((asset) => {
                  const AssetIcon = getAssetIcon(asset);
                  const userDisplay = assetUserDisplay(asset);
                  return (
                  <tr key={asset.id} className="group transition-colors hover:bg-blue-50/35">
                    {canDelete && <td className="px-3 py-4"><input type="checkbox" checked={selectedAssetIds.has(asset.id)} onChange={() => toggleAssetSelection(asset.id)} aria-label={`Selecionar ${asset.name}`} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /></td>}
                    {columns.isVisible('asset') && <td className="min-w-52 px-3 py-4"><div className="flex min-w-0 items-center gap-2.5"><span className="shrink-0 rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm transition group-hover:border-blue-200 group-hover:text-blue-700"><AssetIcon size={19} /></span><div className="min-w-0"><button onClick={() => openView(asset)} title={asset.name} className="block w-full truncate text-left text-sm font-bold text-slate-900 hover:text-blue-700">{asset.name}</button><p className="mt-0.5 truncate text-xs font-medium text-slate-500" title={asset.serialNumber || asset.ipAddress || asset.hostname || asset.category}>{asset.serialNumber || asset.ipAddress || asset.hostname || asset.category}</p>{asset.lastFormattedAt && <p className="mt-0.5 truncate text-xs font-semibold text-amber-600">Formatado: {formatDate(asset.lastFormattedAt)}</p>}</div></div></td>}
                    {columns.isVisible('type') && <td className="min-w-40 px-3 py-4 text-sm text-slate-600"><p className="truncate" title={assetTypeLabels[asset.type] || asset.category}>{assetTypeLabels[asset.type] || asset.category}</p><p className="truncate text-xs text-slate-400" title={[asset.manufacturer, asset.model].filter(Boolean).join(' ') || asset.category}>{[asset.manufacturer, asset.model].filter(Boolean).join(' ') || asset.category}</p></td>}
                    {columns.isVisible('company') && <td className="min-w-52 px-3 py-4 text-sm text-slate-600"><span className="flex min-w-0 items-center gap-1.5"><Building2 size={15} className="shrink-0 text-slate-400" /><span className="truncate" title={asset.company?.name || 'Não definida'}>{asset.company?.name || 'Não definida'}</span></span>{asset.ipAddress && <p className="mt-1 truncate font-mono text-xs text-slate-400">{asset.ipAddress}</p>}</td>}
                    {columns.isVisible('status') && <td className="min-w-32 px-3 py-4"><StatusBadge status={asset.status} /><p className="mt-1 truncate text-xs text-slate-500">Condição: {conditionLabels[asset.condition]}</p></td>}
                    {columns.isVisible('user') && <td className="min-w-44 px-3 py-4 text-sm"><p className="truncate font-medium text-slate-700" title={userDisplay.title}>{userDisplay.name}</p><p className={`truncate text-xs ${userDisplay.detected ? 'font-medium text-blue-600' : 'text-slate-400'}`} title={userDisplay.detected ? `Usuário detectado: ${userDisplay.title}` : userDisplay.detail}>{userDisplay.detail}</p></td>}
                    {columns.isVisible('location') && <td className="min-w-40 px-3 py-4 text-sm text-slate-600"><span className="flex min-w-0 items-center gap-1.5"><MapPin size={15} className="shrink-0 text-slate-400" /><span className="truncate" title={asset.location || 'Não informada'}>{asset.location || 'Não informada'}</span></span></td>}
                    {columns.isVisible('installDate') && <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">{formatDate(asset.windowsInstallDate)}</td>}
                    {columns.isVisible('formattedAt') && <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">{formatDate(asset.lastFormattedAt)}</td>}
                    {columns.isVisible('updated') && <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">{formatDate(asset.updatedAt)}</td>}
                    <td className="sticky right-0 z-10 min-w-16 whitespace-nowrap bg-white px-2 py-4 text-right shadow-[-12px_0_18px_-18px_rgba(15,23,42,0.55)] group-hover:bg-blue-50">
                      <button data-asset-action-trigger onClick={(event) => toggleActionMenu(event, asset.id)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700" aria-label={`Ações para ${asset.name}`}><MoreHorizontal size={20} /></button>
                      {menu === asset.id && menuPosition && createPortal(
                        <div data-asset-action-menu style={{ top: menuPosition.top, right: menuPosition.right }} className="fixed z-50 max-h-[calc(100vh-1rem)] w-60 overflow-y-auto rounded-2xl border border-white bg-white/95 p-2 text-left shadow-2xl shadow-slate-900/20 backdrop-blur-xl">
                          <button onClick={() => openView(asset)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Eye size={16} /> Visualizar</button>
                          <button onClick={() => printQrLabel(asset)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><QrCode size={16} /> Imprimir etiqueta QR</button>
                          {canManage && <button onClick={() => openEdit(asset)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Edit3 size={16} /> Editar</button>}
                          {canManage && asset.assignedTo && asset.status === 'ASSIGNED' && <button onClick={() => completeAction('Ativo devolvido com sucesso.', () => assetService.checkin(asset.id))} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><RotateCcw size={16} /> Registrar devolução</button>}
                          {canManage && asset.status !== 'RETIRED' && asset.status !== 'DONOR' && asset.status !== 'MAINTENANCE' && <button onClick={() => completeAction('Ativo enviado para manutenção.', () => assetService.update(asset.id, { status: 'MAINTENANCE' }))} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Wrench size={16} /> Enviar à manutenção</button>}
                          {canManage && asset.status === 'MAINTENANCE' && <button onClick={() => { setMenu(null); setMaintenanceTarget(asset); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50"><RotateCcw size={16} /> Concluir manutenção / devolver</button>}
                          {canManage && asset.status === 'MAINTENANCE' && <button onClick={() => cancelMaintenance(asset)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><X size={16} /> Cancelar envio à manutenção</button>}
                          {canManage && asset.status !== 'RETIRED' && asset.status !== 'DONOR' && asset.status !== 'WARRANTY' && <button onClick={() => completeAction('Ativo enviado para garantia.', () => assetService.update(asset.id, { status: 'WARRANTY', assignedToId: null }))} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-cyan-700 hover:bg-cyan-50"><ShieldCheck size={16} /> Enviar para garantia</button>}
                          {canManage && asset.status === 'WARRANTY' && <button onClick={() => completeAction('Ativo retornou da garantia.', () => assetService.update(asset.id, { status: 'AVAILABLE', assignedToId: null }))} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50"><RotateCcw size={16} /> Retornar da garantia</button>}
                          {canManage && asset.status !== 'RETIRED' && asset.status !== 'DONOR' && <button onClick={() => { setMenu(null); setDonorTarget(asset); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"><PackagePlus size={16} /> Transformar em doador</button>}
                          {canManage && asset.status !== 'RETIRED' && <button onClick={() => disposeAsset(asset)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50"><ArchiveX size={16} /> Registrar descarte</button>}
                          {canManage && user?.role === 'ADMIN' && <button onClick={() => { setMenu(null); setDeleteTarget({ ids: [asset.id], description: asset.name }); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 size={16} /> Excluir</button>}
                        </div>,
                        document.body,
                      )}
                    </td>
                  </tr>
                ); }) : <tr><td colSpan={tableColumnCount} className="py-16 text-center"><Box size={38} className="mx-auto mb-3 text-slate-300" /><p className="font-semibold text-slate-700">Nenhum ativo encontrado</p><p className="mt-1 text-sm text-slate-500">Ajuste os filtros ou cadastre o primeiro item.</p></td></tr>}
              </tbody>
            </table>
          </div>
          {data && <PaginationControls page={data.pagination.page} pageSize={data.pagination.limit} total={data.pagination.total} totalPages={data.pagination.totalPages} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} itemLabel="ativo" />}
        </section>
      </main>
      {viewing && <AssetDetails asset={viewing} onClose={() => setViewing(null)} onEdit={canManage ? () => openEdit(viewing) : undefined} onRefresh={setViewing} />}
      {formOpen && <AssetForm asset={editing} users={users} companies={companies} suppliers={suppliers} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); setNotice(editing ? 'Ativo atualizado com sucesso.' : 'Ativo cadastrado com sucesso.'); load(); }} />}
      {reportOpen && <AssetReportModal initialFilters={currentReportFilters} locations={data?.filters.locations || []} companies={companies} suppliers={suppliers} onClose={() => setReportOpen(false)} onPrint={printAssetsReport} />}
      {canDiscover && discoveryOpen && <NetworkDiscovery companies={companies} onClose={() => setDiscoveryOpen(false)} onImported={handleImported} />}
      {deleteTarget && <DeleteAssetModal description={deleteTarget.description} count={deleteTarget.ids.length} onClose={() => { if (!deletingSelected) setDeleteTarget(null); }} onConfirm={confirmAssetDeletion} />}
      {maintenanceTarget && <CompleteMaintenanceModal asset={maintenanceTarget} users={users} onClose={() => setMaintenanceTarget(null)} onConfirm={completeMaintenance} />}
      {donorTarget && <DonorAssetModal asset={donorTarget} onClose={() => setDonorTarget(null)} onConfirm={makeDonor} />}
    </div>
  );
}
