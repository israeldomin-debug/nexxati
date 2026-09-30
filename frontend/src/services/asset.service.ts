import { api } from './api';
import { Asset, AssetDetail, AssetDonorInput, AssetInput, AssetStatus, DiscoveredDevice, DiscoveryIgnoredIp, DiscoveryIgnoreMode, MaintenanceRecord } from '../types';

export interface AssetListParams {
  search?: string;
  status?: AssetStatus | '';
  type?: string;
  category?: string;
  location?: string;
  companyId?: string;
  purchasedByCompanyId?: string;
  supplierId?: string;
  warranty?: 'ACTIVE' | 'EXPIRED' | '';
  sortKey?: 'name' | 'type' | 'company' | 'status' | 'assignedTo' | 'location' | 'windowsInstallDate' | 'lastFormattedAt' | 'updatedAt';
  sortDirection?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface AssetListResult {
  assets: Asset[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  summary: Record<AssetStatus, number>;
  filters: { categories: string[]; locations: string[] };
}

export interface InvoiceXmlResult {
  invoiceNumber: string | null;
  accessKey: string | null;
  issueDate: string | null;
  purchaseCost: number | null;
  itemCount: number;
  supplier: { id: string | null; name: string | null; taxId: string | null };
  buyer: { id: string | null; name: string | null; taxId: string | null };
  warnings: string[];
}

export interface RemoteDiscoveryJob {
  id: string;
  siteName: string;
  prefix: string;
  firstIp: number;
  lastIp: number;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  agentName?: string | null;
  agentInfo?: {
    computerName?: string;
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    operatingSystem?: string;
    osVersion?: string;
    architecture?: string;
    processor?: string;
    cpuCores?: number;
    cpuLogicalProcessors?: number;
    memoryMb?: number;
    disks?: Array<{ name: string; sizeGb: number; freeGb: number }>;
    physicalDisks?: Array<Record<string, unknown>>;
    memoryModules?: Array<Record<string, unknown>>;
    videoControllers?: Array<Record<string, unknown>>;
    loggedUser?: string;
    domain?: string;
    workgroup?: string;
    systemType?: string;
    biosVersion?: string;
    biosReleaseDate?: string;
    windowsInstallDate?: string;
    lastBootAt?: string;
    networkAdapters?: Array<{ name: string; description?: string; ipAddresses: string[]; gatewayAddresses?: string[]; macAddress?: string; isVirtual?: boolean }>;
    agentVersion?: string;
    deviceType?: 'DESKTOP' | 'NOTEBOOK' | 'SERVER';
    chassisTypes?: number[];
    windowsLicenseStatus?: number;
    windowsProductKeyPartial?: string;
    windowsLicenseDescription?: string;
    windowsProductKey?: string;
    windowsProductKeyProtected?: string;
    elevated?: boolean;
    collectionWarnings?: string[];
    installedApplications?: Array<{ name: string; version?: string | null; publisher?: string | null; installDate?: string | null }>;
    installedApplicationCount?: number;
    connectedPeripherals?: Array<{ kind: 'MONITOR' | 'MOUSE' | 'KEYBOARD'; name: string; manufacturer?: string | null; model?: string | null; serialNumber?: string | null; deviceId?: string | null }>;
  } | null;
  results?: DiscoveredDevice[] | null;
  error?: string | null;
}

export interface RemoteDiscoveryAgent {
  id: string;
  agentName: string;
  computerName: string;
  agentInfo: NonNullable<RemoteDiscoveryJob['agentInfo']>;
  firstSeenAt: string;
  lastSeenAt: string;
}

export const assetService = {
  async list(params: AssetListParams): Promise<AssetListResult> {
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== '' && value !== null && value !== undefined),
    );
    const response = await api.get<AssetListResult>('/assets', { params: cleanParams });
    return response.data;
  },
  async get(id: string): Promise<AssetDetail> {
    const response = await api.get<{ asset: AssetDetail }>(`/assets/${id}`);
    return response.data.asset;
  },
  async parseInvoiceXml(file: File): Promise<InvoiceXmlResult> {
    const data = new FormData();
    data.append('file', file);
    const response = await api.post<{ invoice: InvoiceXmlResult }>('/assets/purchase-invoice/xml', data);
    return response.data.invoice;
  },
  async revealWindowsLicense(id: string, password: string): Promise<string> {
    const response = await api.post<{ licenseKey: string }>(`/assets/${id}/windows-license/reveal`, { password });
    return response.data.licenseKey;
  },
  async create(data: AssetInput): Promise<Asset> {
    const response = await api.post<{ asset: Asset }>('/assets', data);
    return response.data.asset;
  },
  async update(id: string, data: Partial<AssetInput>): Promise<Asset> {
    const response = await api.patch<{ asset: Asset }>(`/assets/${id}`, data);
    return response.data.asset;
  },
  async checkout(id: string, assignedToId: string): Promise<Asset> {
    const response = await api.post<{ asset: Asset }>(`/assets/${id}/checkout`, { assignedToId });
    return response.data.asset;
  },
  async checkin(id: string): Promise<Asset> {
    const response = await api.post<{ asset: Asset }>(`/assets/${id}/checkin`);
    return response.data.asset;
  },
  async completeMaintenance(id: string, data: { services: string[]; details: string; assignedToId?: string | null }): Promise<Asset> {
    const response = await api.post<{ asset: Asset }>(`/assets/${id}/maintenance/complete`, data);
    return response.data.asset;
  },
  async makeDonor(id: string, data: AssetDonorInput): Promise<{ asset: Asset; storedParts: Array<{ id: string; name: string; quantity: number }> }> {
    const response = await api.post<{ asset: Asset; storedParts: Array<{ id: string; name: string; quantity: number }> }>(`/assets/${id}/donor`, data);
    return response.data;
  },
  async syncAgentPeripherals(id: string): Promise<{ created: number; linked: number; skipped: number; peripherals: Asset[] }> {
    const response = await api.post<{ created: number; linked: number; skipped: number; peripherals: Asset[] }>(`/assets/${id}/agent-peripherals/sync`);
    return response.data;
  },
  async maintenanceReport(): Promise<MaintenanceRecord[]> {
    const response = await api.get<{ records: MaintenanceRecord[] }>('/assets/reports/maintenance');
    return response.data.records;
  },
  async delete(id: string, password: string): Promise<void> {
    await api.delete(`/assets/${id}`, { data: { password } });
  },
  async discover(targets: string[], mode: DiscoveryIgnoreMode = 'NETWORK', skipKnownIps = true, networkSegmentId?: string | null, scanDepth: 'standard' | 'deep' = 'standard'): Promise<{ devices: DiscoveredDevice[]; ignored: DiscoveryIgnoredIp[]; scanned: number; skippedKnown: number; online: number }> {
    const response = await api.post('/assets/discover', { targets, mode, skipKnownIps, networkSegmentId: networkSegmentId || null, scanDepth });
    return response.data;
  },
  async createRemoteDiscoveryJob(data: { siteName: string; prefix: string; firstIp: number; lastIp: number }): Promise<RemoteDiscoveryJob> {
    const response = await api.post<{ job: RemoteDiscoveryJob }>('/assets/remote-discovery/jobs', data);
    return response.data.job;
  },
  async getRemoteDiscoveryJob(id: string): Promise<RemoteDiscoveryJob> {
    const response = await api.get<{ job: RemoteDiscoveryJob }>(`/assets/remote-discovery/jobs/${id}`);
    return response.data.job;
  },
  async listRemoteDiscoveryAgents(): Promise<RemoteDiscoveryAgent[]> {
    const response = await api.get<{ agents: RemoteDiscoveryAgent[] }>('/assets/remote-discovery/agents');
    return response.data.agents;
  },
  async listDiscoveryIgnored(mode: DiscoveryIgnoreMode): Promise<DiscoveryIgnoredIp[]> {
    const response = await api.get<{ ignored: DiscoveryIgnoredIp[] }>('/assets/discovery/ignored', { params: { mode } });
    return response.data.ignored;
  },
  async ignoreDiscoveryIp(ipAddress: string, mode: DiscoveryIgnoreMode, reason?: string): Promise<DiscoveryIgnoredIp> {
    const response = await api.post<{ ignored: DiscoveryIgnoredIp }>('/assets/discovery/ignored', { ipAddress, mode, reason });
    return response.data.ignored;
  },
  async unignoreDiscoveryIp(id: string): Promise<void> {
    await api.delete(`/assets/discovery/ignored/${id}`);
  },
  async importDevices(devices: DiscoveredDevice[], companyId?: string | null, adminPassword?: string, importMode: 'NETWORK' | 'PRINTER' = 'NETWORK', networkSegmentId?: string | null): Promise<{ imported: number; created: number; updated: number; skipped: number; failed: number; failures: Array<{ ipAddress: string; error: string }>; duplicates: Array<{ ipAddress: string; assetName: string; hardwareChanged: boolean }>; assets: Asset[] }> {
    const response = await api.post('/assets/import', { devices, companyId: companyId || null, networkSegmentId: networkSegmentId || null, adminPassword, importMode });
    return response.data;
  },
  async detailedInventory(data: { targets: string[]; username?: string; password?: string; companyId?: string | null; networkSegmentId?: string | null; skipKnownIps?: boolean }): Promise<{ collected: number; failed: number; ignored: number; skippedKnown: number; results: Array<{ ipAddress: string; success: boolean; ignored?: boolean; error?: string }> }> {
    const response = await api.post('/assets/inventory/detailed', data);
    return response.data;
  },
  async cctvInventory(data: { targets: string[]; username: string; password: string; deviceType: 'DVR_NVR' | 'CAMERA'; companyId?: string | null; networkSegmentId?: string | null; skipKnownIps?: boolean }): Promise<{ collected: number; failed: number; skippedKnown: number; results: Array<{ ipAddress: string; success: boolean; error?: string }> }> {
    const response = await api.post('/assets/inventory/cctv', data);
    return response.data;
  },
};
