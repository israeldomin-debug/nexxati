import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Copy, Edit3, Eye, EyeOff, KeyRound, LockKeyhole, Plus, Radar, Search, Trash2, X } from 'lucide-react';
import { AppNav } from '../components/AppNav';
import { PremiumPageHeader, premiumHeaderPrimaryAction } from '../components/PremiumPageHeader';
import { passwordVaultService } from '../services/password-vault.service';
import { handleApiError } from '../services/api';
import { requestDeletePassword } from '../utils/deleteConfirmation';
import { NetworkIpAddress, PasswordVaultDeviceType, PasswordVaultEntry, PasswordVaultEntryType, PasswordVaultInput } from '../types';
import { useAuthStore } from '../store/useAuthStore';
import { hasPermission } from '../utils/permissions';
import { nextSort, SortableHeader, SortState, sortByDirection } from '../utils/tableSort';
import { PaginationControls } from '../components/PaginationControls';

const entryTypeLabels: Record<PasswordVaultEntryType, string> = {
  SOFTWARE: 'Software',
  NETWORK_DEVICE: 'Dispositivo de rede',
  OTHER: 'Outros',
  USER: 'Usuário / outros',
};

const deviceLabels: Record<PasswordVaultDeviceType, string> = {
  DVR: 'DVR',
  NVR: 'NVR',
  ROUTER: 'Roteador',
  ANTENNA: 'Antena',
  ACCESS_POINT: 'Access point',
  SWITCH: 'Switch',
  CAMERA: 'Câmera',
  PRINTER: 'Impressora',
  SERVER: 'Servidor',
  OTHER: 'Outro',
};

const blankForm: PasswordVaultInput = {
  name: '',
  entryType: 'NETWORK_DEVICE',
  deviceType: 'OTHER',
  ipAddressId: null,
  assetId: null,
  host: '',
  url: '',
  port: null,
  protocol: '',
  username: '',
  password: '',
  adminUsername: '',
  adminPassword: '',
  userUsername: '',
  userPassword: '',
  internetUsername: '',
  internetPassword: '',
  p12Username: '',
  p12Password: '',
  emailUsername: '',
  emailPassword: '',
  notes: '',
  active: true,
};

type OptionAsset = { id: string; name: string; assetTag: string; type: string; category: string; ipAddress: string | null; hostname: string | null; assignedTo?: { id: string; name: string; email: string } | null };
type IpOption = Pick<NetworkIpAddress, 'id' | 'ipAddress' | 'hostname' | 'description' | 'assetId'>;
type VaultSortKey = 'name' | 'entryType' | 'deviceType' | 'ipAddress' | 'username' | 'active' | 'updatedAt';
type NetworkInspection = Awaited<ReturnType<typeof passwordVaultService.inspect>>;
const field = 'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const label = 'text-sm font-medium text-slate-700';

function CredentialFields({ title, userLabel, passwordLabel, userValue, passwordValue, onUser, onPassword, placeholder }: {
  title: string;
  userLabel: string;
  passwordLabel: string;
  userValue: string | null | undefined;
  passwordValue: string | null | undefined;
  onUser: (value: string) => void;
  onPassword: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:col-span-2">
      <p className="mb-3 text-sm font-bold text-slate-800">{title}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>{userLabel}<input value={userValue || ''} onChange={(event) => onUser(event.target.value)} className={field} placeholder={placeholder || userLabel} /></label>
        <label className={label}>{passwordLabel}<input type="password" value={passwordValue || ''} onChange={(event) => onPassword(event.target.value)} className={field} placeholder="Senha" /></label>
      </div>
    </div>
  );
}

const networkCredentialSlots = [
  { title: 'Usuário 1', userLabel: 'Usuário', userKey: 'username', passwordKey: 'password', placeholder: 'admin' },
  { title: 'Usuário 2', userLabel: 'Usuário', userKey: 'userUsername', passwordKey: 'userPassword', placeholder: undefined },
  { title: 'Usuário 3', userLabel: 'Usuário', userKey: 'internetUsername', passwordKey: 'internetPassword', placeholder: undefined },
  { title: 'Usuário 4', userLabel: 'Usuário', userKey: 'p12Username', passwordKey: 'p12Password', placeholder: undefined },
  { title: 'Usuário 5', userLabel: 'Usuário', userKey: 'emailUsername', passwordKey: 'emailPassword', placeholder: undefined },
  { title: 'Usuário 6', userLabel: 'Usuário', userKey: 'adminUsername', passwordKey: 'adminPassword', placeholder: undefined },
] as const;

const userCredentialSlots = [
  { key: 'machine', title: 'Máquina', description: 'Usuário local ou de domínio da máquina', userLabel: 'Usuário da máquina', userKey: 'userUsername', passwordKey: 'userPassword', placeholder: '.\\usuario ou DOMINIO\\usuario' },
  { key: 'internet', title: 'Internet', description: 'Acesso à internet', userLabel: 'Usuário de internet', userKey: 'internetUsername', passwordKey: 'internetPassword', placeholder: undefined },
  { key: 'p12', title: 'P12', description: 'Acesso ao sistema P12', userLabel: 'Usuário P12', userKey: 'p12Username', passwordKey: 'p12Password', placeholder: undefined },
  { key: 'email', title: 'E-mail', description: 'Conta de e-mail', userLabel: 'E-mail do usuário', userKey: 'emailUsername', passwordKey: 'emailPassword', placeholder: 'usuario@empresa.com' },
  { key: 'vpn', title: 'VPN', description: 'Acesso remoto por VPN', userLabel: 'Usuário VPN', userKey: 'adminUsername', passwordKey: 'adminPassword', placeholder: undefined },
] as const;

type UserCredentialSlotKey = typeof userCredentialSlots[number]['key'];

const initialVisibleUserCredentials = (form: PasswordVaultInput): Record<UserCredentialSlotKey, boolean> => ({
  machine: true,
  internet: Boolean(form.internetUsername || form.internetPassword),
  p12: Boolean(form.p12Username || form.p12Password),
  email: Boolean(form.emailUsername || form.emailPassword),
  vpn: Boolean(form.adminUsername || form.adminPassword),
});

const filledNetworkCredentialCount = (form: PasswordVaultInput) => {
  const lastFilled = networkCredentialSlots.reduce((last, slot, index) => (
    form[slot.userKey] || form[slot.passwordKey] ? index + 1 : last
  ), 1);
  return Math.min(networkCredentialSlots.length, Math.max(1, lastFilled));
};

const entryCredentialItems = (entry: PasswordVaultEntry) => (
  entry.entryType === 'USER'
    ? [
      { label: 'Máquina', username: entry.userUsername, password: entry.userPassword, configured: entry.userPasswordConfigured },
      { label: 'Internet', username: entry.internetUsername, password: entry.internetPassword, configured: entry.internetPasswordConfigured },
      { label: 'P12', username: entry.p12Username, password: entry.p12Password, configured: entry.p12PasswordConfigured },
      { label: 'E-mail', username: entry.emailUsername, password: entry.emailPassword, configured: entry.emailPasswordConfigured },
      { label: 'VPN', username: entry.adminUsername, password: entry.adminPassword, configured: entry.adminPasswordConfigured },
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

function VaultForm({ entry, ipAddresses, assets, onClose, onSaved }: {
  entry: PasswordVaultEntry | null;
  ipAddresses: IpOption[];
  assets: OptionAsset[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<PasswordVaultInput>(() => entry ? {
    name: entry.name,
    entryType: entry.entryType,
    deviceType: entry.deviceType,
    ipAddressId: entry.ipAddressId,
    assetId: entry.assetId,
    host: entry.host || '',
    url: entry.url || '',
    port: entry.port,
    protocol: entry.protocol || '',
    username: entry.username || '',
    password: '',
    adminUsername: entry.adminUsername || '',
    adminPassword: '',
    userUsername: entry.userUsername || '',
    userPassword: '',
    internetUsername: entry.internetUsername || '',
    internetPassword: '',
    p12Username: entry.p12Username || '',
    p12Password: '',
    emailUsername: entry.emailUsername || '',
    emailPassword: '',
    notes: entry.notes || '',
    active: entry.active,
  } : blankForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [assetSearch, setAssetSearch] = useState('');
  const [credentialSlotCount, setCredentialSlotCount] = useState(() => filledNetworkCredentialCount(form));
  const [visibleUserCredentials, setVisibleUserCredentials] = useState(() => initialVisibleUserCredentials(form));

  const update = <K extends keyof PasswordVaultInput>(key: K, value: PasswordVaultInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const isUserEntry = form.entryType === 'USER';
  const isNetworkEntry = form.entryType === 'NETWORK_DEVICE' || (form.entryType === 'OTHER' && form.deviceType !== 'OTHER');
  const userIdentity = [form.name, form.userUsername, form.emailUsername].filter(Boolean).map((value) => String(value).trim().toLowerCase());
  const assetMatchesUser = (asset: OptionAsset) => {
    if (!asset.assignedTo) return true;
    return userIdentity.some((value) => value && (asset.assignedTo!.name.toLowerCase() === value || asset.assignedTo!.email.toLowerCase() === value));
  };
  const assetsByUserRule = isUserEntry
    ? assets.filter((asset) => !asset.assignedTo || asset.id === form.assetId || assetMatchesUser(asset))
    : assets;
  const assetSearchTerm = assetSearch.trim().toLowerCase();
  const visibleAssets = assetSearchTerm
    ? assetsByUserRule.filter((asset) => [asset.name, asset.ipAddress, asset.hostname, asset.assignedTo?.name, asset.assignedTo?.email]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(assetSearchTerm)))
    : assetsByUserRule;
  const assetIpOptions = useMemo(() => {
    return assets
      .filter((asset) => asset.ipAddress)
      .sort((left, right) => {
        const leftPriority = form.deviceType === 'ROUTER' && left.type === 'ROUTER' ? 0 : 1;
        const rightPriority = form.deviceType === 'ROUTER' && right.type === 'ROUTER' ? 0 : 1;
        return leftPriority - rightPriority || String(left.ipAddress).localeCompare(String(right.ipAddress), undefined, { numeric: true });
      });
  }, [assets, form.deviceType]);
  const ipSelectionValue = form.ipAddressId
    ? `ip:${form.ipAddressId}`
    : form.assetId && assets.some((asset) => asset.id === form.assetId && asset.ipAddress)
      ? `asset:${form.assetId}`
      : '';

  const selectIp = (value: string) => {
    const [source, id = ''] = value.split(':', 2);
    const selected = source === 'ip' ? ipAddresses.find((item) => item.id === id) : null;
    const selectedAsset = source === 'asset' ? assets.find((item) => item.id === id) : null;
    setForm((current) => ({
      ...current,
      ipAddressId: selected?.id || null,
      assetId: selectedAsset?.id || selected?.assetId || current.assetId || null,
      host: selectedAsset?.ipAddress || selected?.ipAddress || current.host || '',
      name: current.name || selectedAsset?.name || '',
    }));
  };

  const selectAsset = (id: string) => {
    const selected = assets.find((item) => item.id === id);
    if (isUserEntry && selected?.assignedTo && !assetMatchesUser(selected)) {
      const confirmChange = window.confirm(`Este ativo já está vinculado ao usuário ${selected.assignedTo.name}. Deseja usar/atualizar o vínculo deste registro mesmo assim?`);
      if (!confirmChange) return;
    }
    setForm((current) => ({
      ...current,
      assetId: id || null,
      host: selected?.ipAddress || selected?.hostname || current.host || '',
      name: current.name || selected?.name || '',
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload: PasswordVaultInput = {
        ...form,
        deviceType: isNetworkEntry ? form.deviceType : 'OTHER',
        ipAddressId: isNetworkEntry ? form.ipAddressId || null : null,
        assetId: form.assetId || null,
        host: form.entryType === 'USER' ? null : form.host || null,
        url: form.entryType === 'USER' ? null : form.url || null,
        port: form.entryType === 'USER' ? null : form.port || null,
        protocol: form.entryType === 'USER' ? null : form.protocol || null,
        notes: form.notes || null,
      };

      if (entry) {
        for (const key of ['password', 'adminPassword', 'userPassword', 'internetPassword', 'p12Password', 'emailPassword'] as const) {
          if (!payload[key]) delete payload[key];
        }
      }

      if (entry) await passwordVaultService.update(entry.id, payload);
      else await passwordVaultService.create(payload);
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
      <div className="relative h-full w-full max-w-3xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-5">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Banco de senhas</p><h2 className="text-xl font-bold text-slate-900">{entry ? 'Editar registro' : 'Cadastrar registro'}</h2></div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="grid gap-5 p-6 sm:grid-cols-2">
          {error && <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <label className={label}>Nome *<input required value={form.name} onChange={(event) => update('name', event.target.value)} className={field} placeholder="DVR Portaria / Usuário externo" /></label>
          <label className={label}>Tipo de registro<select value={form.entryType} onChange={(event) => update('entryType', event.target.value as PasswordVaultEntryType)} className={field}>{Object.entries(entryTypeLabels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>

          {!isUserEntry && <label className={label}>Tipo do equipamento<select value={form.deviceType} onChange={(event) => update('deviceType', event.target.value as PasswordVaultDeviceType)} className={field}>{Object.entries(deviceLabels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>}
          {!isUserEntry && <label className={label}>IP cadastrado<select value={ipSelectionValue} onChange={(event) => selectIp(event.target.value)} className={field}><option value="">Sem IP vinculado</option>{ipAddresses.length > 0 && <optgroup label="IPs cadastrados">{ipAddresses.map((item) => <option key={item.id} value={`ip:${item.id}`}>{item.ipAddress}{item.hostname ? ` · ${item.hostname}` : ''}</option>)}</optgroup>}{assetIpOptions.length > 0 && <optgroup label="IPs dos ativos">{assetIpOptions.map((asset) => <option key={asset.id} value={`asset:${asset.id}`}>{asset.ipAddress} · {asset.name} ({asset.category})</option>)}</optgroup>}</select><span className="mt-1 block text-xs font-normal text-slate-500">A lista reúne os endereços da página IPs e os IPs informados diretamente nos ativos.</span></label>}
          <label className={`${label} ${isUserEntry ? 'sm:col-span-2' : ''}`}>Ativo cadastrado<select value={form.assetId || ''} onChange={(event) => selectAsset(event.target.value)} className={field}><option value="">Sem ativo vinculado</option>{visibleAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}{asset.ipAddress ? ` - ${asset.ipAddress}` : ''}{asset.hostname ? ` - ${asset.hostname}` : ''}{asset.assignedTo ? ` - usuário: ${asset.assignedTo.name}` : ' - sem usuário'}</option>)}</select>{isUserEntry && <span className="mt-1 block text-xs font-normal text-slate-500">Para cadastro de usuário, aparecem ativos sem usuário vinculado ou já ligados a este usuário.</span>}</label>
          <label className={`${label} ${isUserEntry ? 'sm:col-span-2' : ''}`}>Buscar ativo<input value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} className={field} placeholder="Buscar por nome, IP, serie ou usuario..." /></label>
          {!isUserEntry && <label className={label}>Host / IP manual<input value={form.host || ''} onChange={(event) => update('host', event.target.value)} className={field} placeholder="192.168.2.10" /></label>}
          {!isUserEntry && <label className={label}>URL<input value={form.url || ''} onChange={(event) => update('url', event.target.value)} className={field} placeholder="http://192.168.2.10" /></label>}
          {!isUserEntry && <label className={label}>Porta<input type="number" min={1} max={65535} value={form.port ?? ''} onChange={(event) => update('port', event.target.value ? Number(event.target.value) : null)} className={field} placeholder="80, 443, 8080..." /></label>}
          {!isUserEntry && <label className={label}>Protocolo<input value={form.protocol || ''} onChange={(event) => update('protocol', event.target.value)} className={field} placeholder="HTTP, HTTPS, RTSP, SSH..." /></label>}

          {!isUserEntry && !isNetworkEntry && (
            <CredentialFields
              title="Credencial principal"
              userLabel="Usuário"
              passwordLabel={entry ? 'Senha (preencha apenas se for trocar)' : 'Senha'}
              userValue={form.username}
              passwordValue={form.password}
              onUser={(value) => update('username', value)}
              onPassword={(value) => update('password', value)}
              placeholder="usuário"
            />
          )}

          {isNetworkEntry && (
            <div className="space-y-3 sm:col-span-2">
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
                Cadastre quantos acessos forem necessários para este dispositivo. Use o botão abaixo para adicionar mais usuários e senhas.
              </div>
              {networkCredentialSlots.slice(0, credentialSlotCount).map((slot) => (
                <CredentialFields
                  key={slot.title}
                  title={slot.title}
                  userLabel={slot.userLabel}
                  passwordLabel={entry ? 'Senha (preencha apenas se for trocar)' : 'Senha'}
                  userValue={form[slot.userKey]}
                  passwordValue={form[slot.passwordKey]}
                  onUser={(value) => update(slot.userKey, value)}
                  onPassword={(value) => update(slot.passwordKey, value)}
                  placeholder={slot.placeholder}
                />
              ))}
              {credentialSlotCount < networkCredentialSlots.length && (
                <button
                  type="button"
                  onClick={() => setCredentialSlotCount((current) => Math.min(networkCredentialSlots.length, current + 1))}
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                >
                  <Plus size={16} /> Adicionar usuário/senha
                </button>
              )}
            </div>
          )}

          {isUserEntry && (
            <div className="space-y-4 sm:col-span-2">
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                <p className="text-sm font-bold text-slate-900">Campos utilizados por este usuário</p>
                <p className="mt-1 text-xs text-slate-600">Marque apenas os acessos que deseja preencher. Ocultar um campo não apaga informações já salvas.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {userCredentialSlots.map((slot) => (
                    <label key={slot.key} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${visibleUserCredentials[slot.key] ? 'border-blue-300 bg-white text-blue-900 shadow-sm' : 'border-slate-200 bg-slate-50/70 text-slate-600 hover:border-slate-300'}`}>
                      <input
                        type="checkbox"
                        checked={visibleUserCredentials[slot.key]}
                        onChange={(event) => setVisibleUserCredentials((current) => ({ ...current, [slot.key]: event.target.checked }))}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
                      />
                      <span><span className="block text-sm font-semibold">{slot.title}</span><span className="block text-xs font-normal opacity-75">{slot.description}</span></span>
                    </label>
                  ))}
                </div>
              </div>

              {userCredentialSlots.filter((slot) => visibleUserCredentials[slot.key]).map((slot) => (
                <CredentialFields
                  key={slot.key}
                  title={slot.title}
                  userLabel={slot.userLabel}
                  passwordLabel={entry ? 'Senha (preencha apenas se for trocar)' : 'Senha'}
                  userValue={form[slot.userKey]}
                  passwordValue={form[slot.passwordKey]}
                  onUser={(value) => update(slot.userKey, value)}
                  onPassword={(value) => update(slot.passwordKey, value)}
                  placeholder={slot.placeholder}
                />
              ))}
            </div>
          )}

          <label className={`${label} sm:col-span-2`}>Observações<textarea rows={3} value={form.notes || ''} onChange={(event) => update('notes', event.target.value)} className={field} placeholder="Local, modelo, acesso alternativo, observações..." /></label>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700 sm:col-span-2"><input type="checkbox" checked={form.active} onChange={(event) => update('active', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" /> Registro ativo</label>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-5 sm:col-span-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancelar</button>
            <button disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar registro'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PasswordVault() {
  const { user } = useAuthStore();
  const canManage = hasPermission(user, 'MANAGE_PASSWORD_VAULT');
  const [entries, setEntries] = useState<PasswordVaultEntry[]>([]);
  const [ipAddresses, setIpAddresses] = useState<IpOption[]>([]);
  const [assets, setAssets] = useState<OptionAsset[]>([]);
  const [search, setSearch] = useState('');
  const [entryType, setEntryType] = useState<PasswordVaultEntryType | ''>('');
  const [deviceType, setDeviceType] = useState<PasswordVaultDeviceType | ''>('');
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PasswordVaultEntry | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [sort, setSort] = useState<SortState<VaultSortKey>>({ key: 'name', direction: 'asc' });
  const [sectionSearches, setSectionSearches] = useState({ software: '', users: '', devices: '' });
  const [sectionPages, setSectionPages] = useState({ software: 1, users: 1, devices: 1 });
  const [pageSize, setPageSize] = useState(20);
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<NetworkInspection | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [list, options] = await Promise.all([
        passwordVaultService.list({ search, entryType, deviceType }),
        passwordVaultService.options(),
      ]);
      setEntries(list);
      setIpAddresses(options.ipAddresses);
      setAssets(options.assets);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const summary = useMemo(() => ({
    total: entries.length,
    active: entries.filter((item) => item.active).length,
    userEntries: entries.filter((item) => item.entryType === 'USER').length,
  }), [entries]);

  const sortedEntries = useMemo(() => sortByDirection(entries, sort.direction, (entry) => {
    if (sort.key === 'ipAddress') return entry.ipAddress?.ipAddress || entry.asset?.ipAddress || entry.host || '';
    if (sort.key === 'active') return entry.active ? 1 : 0;
    if (sort.key === 'username') return entry.username || entry.userUsername || entry.internetUsername || entry.p12Username || entry.emailUsername || '';
    return entry[sort.key] || '';
  }), [entries, sort]);

  const matchesSectionSearch = (entry: PasswordVaultEntry, value: string) => {
    const term = value.trim().toLowerCase();
    if (!term) return true;
    return [
      entry.name,
      entry.username,
      entry.userUsername,
      entry.internetUsername,
      entry.p12Username,
      entry.emailUsername,
      entry.ipAddress?.ipAddress,
      entry.asset?.name,
      entry.asset?.ipAddress,
      entry.host,
      entry.url,
      entry.notes,
    ].filter(Boolean).some((item) => String(item).toLowerCase().includes(term));
  };

  const softwareEntries = sortedEntries.filter((entry) => (entry.entryType === 'SOFTWARE' || (entry.entryType === 'OTHER' && entry.deviceType === 'OTHER')) && matchesSectionSearch(entry, sectionSearches.software));
  const userPasswordEntries = sortedEntries.filter((entry) => entry.entryType === 'USER' && matchesSectionSearch(entry, sectionSearches.users));
  const networkDeviceEntries = sortedEntries.filter((entry) => (entry.entryType === 'NETWORK_DEVICE' || (entry.entryType === 'OTHER' && entry.deviceType !== 'OTHER')) && matchesSectionSearch(entry, sectionSearches.devices));

  const copy = async (text: string | null | undefined, message: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setNotice(message);
  };

  const toggleReveal = async (entry: PasswordVaultEntry) => {
    if (visible[entry.id]) {
      setVisible((current) => ({ ...current, [entry.id]: false }));
      setEntries((current) => current.map((item) => item.id === entry.id ? {
        ...item,
        password: '', adminPassword: '', userPassword: '', internetPassword: '', p12Password: '', emailPassword: '',
      } : item));
      return;
    }
    const password = window.prompt(`Digite sua senha para visualizar as credenciais de ${entry.name}. A consulta será registrada na auditoria.`);
    if (password === null) return;
    if (!password.trim()) { setError('Digite sua senha para visualizar a credencial.'); return; }
    try {
      setError('');
      const revealed = await passwordVaultService.reveal(entry.id, password);
      setEntries((current) => current.map((item) => item.id === entry.id ? revealed : item));
      setVisible((current) => ({ ...current, [entry.id]: true }));
      setNotice('Credencial revelada. A consulta foi registrada na auditoria.');
    } catch (err) { setError(handleApiError(err)); }
  };

  const remove = async (entry: PasswordVaultEntry) => {
    if (!window.confirm(`Excluir registro ${entry.name}?`)) return;
    const password = requestDeletePassword(`o registro ${entry.name}`); if (!password) return;
    try {
      await passwordVaultService.delete(entry.id, password);
      setNotice('Registro excluído.');
      await load();
    } catch (err) {
      setError(handleApiError(err));
    }
  };

  const inspect = async (entry: PasswordVaultEntry) => {
    setInspectingId(entry.id);
    setInspection(null);
    setError('');
    try {
      setInspection(await passwordVaultService.inspect(entry.id));
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setInspectingId(null);
    }
  };

  const credentialSummary = (entry: PasswordVaultEntry) => {
    if (entry.entryType !== 'USER') return entryCredentialItems(entry).map((item) => item.label).join(' / ') || 'Sem credenciais';
    return [
      entry.userUsername && 'Máquina',
      entry.internetUsername && 'Internet',
      entry.p12Username && 'P12',
      entry.emailUsername && 'E-mail',
      entry.adminUsername && 'VPN',
    ].filter(Boolean).join(' · ') || 'Sem credenciais';
  };

  const passwordSummary = (entry: PasswordVaultEntry, isVisible: boolean) => {
    if (entry.entryType !== 'USER') {
      return <div className="space-y-1">{entryCredentialItems(entry).map((item) => <CredentialDisplay key={item.label} label={item.label} username={item.username} password={item.password} configured={item.configured} visible={isVisible} onCopy={copy} />)}</div>;
    }
    return (
      <div className="space-y-1">
        <CredentialDisplay label="Máquina" username={entry.userUsername} password={entry.userPassword} configured={entry.userPasswordConfigured} visible={isVisible} onCopy={copy} />
        <CredentialDisplay label="Internet" username={entry.internetUsername} password={entry.internetPassword} configured={entry.internetPasswordConfigured} visible={isVisible} onCopy={copy} />
        <CredentialDisplay label="P12" username={entry.p12Username} password={entry.p12Password} configured={entry.p12PasswordConfigured} visible={isVisible} onCopy={copy} />
        <CredentialDisplay label="E-mail" username={entry.emailUsername} password={entry.emailPassword} configured={entry.emailPasswordConfigured} visible={isVisible} onCopy={copy} />
        <CredentialDisplay label="VPN" username={entry.adminUsername} password={entry.adminPassword} configured={entry.adminPasswordConfigured} visible={isVisible} onCopy={copy} />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <AppNav />
      <main className="mx-auto max-w-[1500px]">
        <PremiumPageHeader eyebrow="Segurança de rede" title="Banco de senhas" description="Gerencie acessos de equipamentos, usuários, internet, P12 e e-mails." icon={LockKeyhole} actions={canManage && <button onClick={() => { setEditing(null); setFormOpen(true); }} className={premiumHeaderPrimaryAction}><Plus size={18} /> Novo registro</button>} />

        <div className="mb-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-500">Registros</p><p className="mt-1 text-2xl font-bold">{summary.total}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-500">Ativos</p><p className="mt-1 text-2xl font-bold text-emerald-600">{summary.active}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-500">Usuário / outros</p><p className="mt-1 text-2xl font-bold text-blue-600">{summary.userEntries}</p></div>
        </div>

        {notice && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {inspection && <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">Consulta concluída: {inspection.host}</p><p className="mt-1">{[inspection.manufacturer, inspection.model, inspection.modelFullName, inspection.firmware ? `Firmware ${inspection.firmware}` : null].filter(Boolean).join(' · ') || 'Interface administrativa localizada'}</p><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-blue-800"><span>Autenticação: <strong>{inspection.authenticated ? 'confirmada' : 'não confirmada'}</strong></span>{inspection.serialNumber && <span>Série: <strong>{inspection.serialNumber}</strong></span>}{inspection.macAddress && <span>MAC: <strong>{inspection.macAddress}</strong></span>}</div><p className="mt-2 text-xs text-blue-700">{inspection.message}</p>{inspection.managementUrl && <a href={inspection.managementUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold text-blue-700 underline">Abrir interface do equipamento</a>}</div><button onClick={() => setInspection(null)} className="rounded p-1 text-blue-700 hover:bg-blue-100" title="Fechar"><X size={18} /></button></div></div>}

        <div className="mb-5 grid gap-3 md:grid-cols-[1fr_190px_220px_auto]">
          <label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && load()} className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm" placeholder="Buscar por nome, IP, usuário, ativo..." /></label>
          <select value={entryType} onChange={(event) => setEntryType(event.target.value as PasswordVaultEntryType | '')} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Todos os registros</option>{Object.entries(entryTypeLabels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select>
          <select value={deviceType} onChange={(event) => setDeviceType(event.target.value as PasswordVaultDeviceType | '')} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Todos os tipos</option>{Object.entries(deviceLabels).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select>
          <button onClick={load} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Filtrar</button>
        </div>

        <div className="space-y-5">
          {[
            { key: 'software' as const, title: 'Senhas de Software', description: 'Acessos de sistemas, plataformas e registros gerais.', items: softwareEntries },
            { key: 'users' as const, title: 'Senhas de Usuários', description: 'Usuários, internet, P12 e e-mails.', items: userPasswordEntries },
            { key: 'devices' as const, title: 'Senha de dispositivos de rede', description: 'Câmeras, DVR, NVR, roteadores, antenas, switches e access points.', items: networkDeviceEntries },
          ].map((section) => {
            const page = sectionPages[section.key];
            const totalPages = Math.max(1, Math.ceil(section.items.length / pageSize));
            const pageItems = section.items.slice((page - 1) * pageSize, page * pageSize);
            return (
            <section key={section.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{section.title}</h2>
                  <p className="text-sm text-slate-500">{section.description}</p>
                </div>
                <label className="relative block w-full lg:max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                  <input value={sectionSearches[section.key]} onChange={(event) => { setSectionSearches((current) => ({ ...current, [section.key]: event.target.value })); setSectionPages((current) => ({ ...current, [section.key]: 1 })); }} className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm" placeholder={`Buscar em ${section.title.toLowerCase()}...`} />
                </label>
              </div>
              <div className="divide-y divide-slate-100">
                {loading ? <div className="py-10 text-center text-sm text-slate-500">Carregando banco de senhas...</div> : section.items.length ? pageItems.map((entry) => {
                  const isVisible = visible[entry.id];
                  const target = entry.ipAddress?.ipAddress || entry.asset?.ipAddress || entry.host || entry.url || 'Sem IP/host';
                  return (
                    <div key={entry.id} className="grid gap-4 p-4 hover:bg-slate-50 xl:grid-cols-[1.2fr_1fr_1.4fr_auto] xl:items-start">
                      <div><p className="font-semibold text-slate-900">{entry.name}</p><p className="mt-0.5 text-xs text-slate-500">{entry.asset ? `${entry.asset.name}${entry.asset.ipAddress ? ` - ${entry.asset.ipAddress}` : ''}` : entry.notes || 'Sem vínculo adicional'}</p></div>
                      <div className="text-sm text-slate-600"><p>{entry.entryType === 'USER' ? 'Usuário' : deviceLabels[entry.deviceType]}</p><p className="font-mono text-xs text-slate-500">{target}</p></div>
                  <div className="text-xs text-slate-700"><div className="mb-1 flex justify-end"><button onClick={() => toggleReveal(entry)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-slate-500 hover:bg-white hover:text-blue-700">{isVisible ? <EyeOff size={14} /> : <Eye size={14} />}{isVisible ? 'Ocultar' : 'Mostrar'}</button></div>{passwordSummary(entry, isVisible)}</div>
                      <div className="flex flex-wrap items-center justify-end gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${entry.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{entry.active ? 'Ativo' : 'Inativo'}</span>{entry.entryType === 'NETWORK_DEVICE' && <button disabled={inspectingId === entry.id} onClick={() => inspect(entry)} className="text-sm font-semibold text-emerald-700 disabled:opacity-50"><Radar size={16} className="inline" /> {inspectingId === entry.id ? 'Consultando...' : 'Consultar'}</button>}{canManage ? <><button onClick={() => { setEditing(entry); setFormOpen(true); }} className="text-sm font-semibold text-blue-700"><Edit3 size={16} className="inline" /> Editar</button><button onClick={() => remove(entry)} className="text-sm font-semibold text-red-600"><Trash2 size={16} className="inline" /> Excluir</button></> : <KeyRound className="text-slate-300" size={18} />}</div>
                    </div>
                  );
                }) : <div className="py-10 text-center text-sm text-slate-500">Nenhum registro nesta categoria.</div>}
              </div>
              {section.items.length > 0 && <PaginationControls page={page} pageSize={pageSize} total={section.items.length} totalPages={totalPages} onPageChange={(nextPage) => setSectionPages((current) => ({ ...current, [section.key]: nextPage }))} onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setSectionPages({ software: 1, users: 1, devices: 1 }); }} />}
            </section>
            );
          })}
        </div>

        <section className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1300px] divide-y divide-slate-200">
              <thead className="bg-slate-50"><tr>
                {[
                  ['Registro', 'name'],
                  ['Categoria', 'entryType'],
                  ['Tipo', 'deviceType'],
                  ['IP / Host', 'ipAddress'],
                  ['Credenciais', 'username'],
                  ['Senhas', undefined],
                  ['Status', 'active'],
                  ['Atualizado', 'updatedAt'],
                  ['', undefined],
                ].map(([title, key]) => <SortableHeader key={title} label={title || ''} sortKey={key as VaultSortKey | undefined} current={sort} onSort={(nextKey) => setSort((current) => nextSort(current, nextKey))} />)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? <tr><td colSpan={9} className="py-16 text-center text-sm text-slate-500">Carregando banco de senhas...</td></tr> : sortedEntries.length ? sortedEntries.map((entry) => {
                  const isVisible = visible[entry.id];
                  const target = entry.ipAddress?.ipAddress || entry.asset?.ipAddress || entry.host || 'Sem IP/host';
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4"><p className="font-semibold text-slate-900">{entry.name}</p><p className="text-xs text-slate-500">{entry.asset ? `${entry.asset.name}${entry.asset.ipAddress ? ` · ${entry.asset.ipAddress}` : ''}` : entry.url || entry.notes || 'Sem vínculo adicional'}</p></td>
                      <td className="px-5 py-4 text-sm text-slate-600">{entryTypeLabels[entry.entryType]}</td>
                      <td className="px-5 py-4 text-sm text-slate-600">{deviceLabels[entry.deviceType]}</td>
                      <td className="px-5 py-4 text-sm text-slate-600"><p className="font-mono">{target}</p><p className="text-xs text-slate-400">{[entry.protocol, entry.port ? `Porta ${entry.port}` : null].filter(Boolean).join(' · ') || entry.ipAddress?.hostname || '—'}</p></td>
                      <td className="px-5 py-4 text-sm text-slate-700">{credentialSummary(entry)}</td>
                      <td className="px-5 py-4 text-xs text-slate-700">
                        <div className="mb-1 flex justify-end">
                          <button onClick={() => toggleReveal(entry)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-blue-700">{isVisible ? <EyeOff size={14} /> : <Eye size={14} />}{isVisible ? 'Ocultar' : 'Mostrar'}</button>
                        </div>
                        {passwordSummary(entry, isVisible)}
                      </td>
                      <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${entry.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{entry.active ? 'Ativo' : 'Inativo'}</span></td>
                      <td className="px-5 py-4 text-sm text-slate-500">{new Date(entry.updatedAt).toLocaleDateString('pt-BR')}</td>
                      <td className="px-5 py-4 text-right">{canManage ? <><button onClick={() => { setEditing(entry); setFormOpen(true); }} className="mr-3 text-sm font-semibold text-blue-700"><Edit3 size={16} className="inline" /> Editar</button><button onClick={() => remove(entry)} className="text-sm font-semibold text-red-600"><Trash2 size={16} className="inline" /> Excluir</button></> : <KeyRound className="ml-auto text-slate-300" size={18} />}</td>
                    </tr>
                  );
                }) : <tr><td colSpan={9} className="py-16 text-center text-sm text-slate-500">Nenhum registro cadastrado.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      {canManage && formOpen && <VaultForm entry={editing} ipAddresses={ipAddresses} assets={assets} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); setNotice(editing ? 'Registro atualizado.' : 'Registro cadastrado.'); load(); }} />}
    </div>
  );
}

function CredentialDisplay({ label, username, password, configured, visible, onCopy }: {
  label: string;
  username: string | null | undefined;
  password: string | null | undefined;
  configured: boolean;
  visible: boolean;
  onCopy: (text: string | null | undefined, message: string) => void;
}) {
  if (!username && !password && !configured) return null;
  return (
    <div className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1">
      <span><strong>{label}:</strong> {username || '—'} / {visible ? (password || '—') : '••••••••'}</span>
      <div className="flex">
        {username && <button onClick={() => onCopy(username, `${label}: usuário copiado.`)} className="rounded p-1 text-slate-400 hover:bg-white hover:text-blue-700" title="Copiar usuário"><Copy size={13} /></button>}
        {password && <button onClick={() => onCopy(password, `${label}: senha copiada.`)} className="rounded p-1 text-slate-400 hover:bg-white hover:text-blue-700" title="Copiar senha"><Copy size={13} /></button>}
      </div>
    </div>
  );
}
