// Tipos de usuário
export type UserRole = 'USER' | 'ATTENDANT' | 'ADMIN';
export type UserPermission =
  | 'ACCESS_DASHBOARD'
  | 'ACCESS_TICKETS'
  | 'ACCESS_ASSETS'
  | 'MANAGE_ASSETS'
  | 'DISCOVER_ASSETS'
  | 'ACCESS_ACCESSORIES'
  | 'MANAGE_ACCESSORIES'
  | 'ACCESS_REPORTS'
  | 'ACCESS_COMPANIES'
  | 'MANAGE_COMPANIES'
  | 'ACCESS_SUPPLIERS'
  | 'MANAGE_SUPPLIERS'
  | 'ACCESS_USERS'
  | 'MANAGE_USERS'
  | 'ACCESS_LICENSES'
  | 'MANAGE_LICENSES'
  | 'ACCESS_IP_ADDRESSES'
  | 'MANAGE_IP_ADDRESSES'
  | 'ACCESS_PASSWORD_VAULT'
  | 'MANAGE_PASSWORD_VAULT';

export interface User {
  id: string;
  name: string;
  username: string | null;
  email: string;
  role: UserRole;
  permissions: UserPermission[];
  active: boolean;
  mustChangePassword: boolean;
  passwordResetRequestedAt?: string | null;
  passwordResetHandledAt?: string | null;
  avatarUrl: string | null;
  themePreference: 'controlall' | 'burgundy' | 'black-red' | 'blue-orange' | 'teal-gold' | 'violet-pink' | null;
  appearanceMode: 'LIGHT' | 'DARK' | 'SYSTEM';
  createdAt: string;
}

// Tipos de ticket
export type TicketStatus = 'OPEN' | 'IN_ANALYSIS' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type TicketCategory = 'TI' | 'FINANCEIRO' | 'COMPRAS' | 'MANUTENCAO_INDUSTRIAL' | 'DIRETORIA' | 'EXPEDICAO' | 'ENGENHARIA_DE_MINAS' | 'RECEPCAO' | 'PORTARIA' | 'RECURSOS_HUMANOS' | 'COMERCIAL' | 'SELECAO_E_RECRUTAMENTO' | 'MANUTENCAO_DE_AUTO';

export interface Ticket {
  id: string;
  title: string;
  description: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: number;
  computerUser: string | null;
  deviceHostname: string | null;
  deviceIp: string | null;
  sourceAgentId: string | null;
  assetId: string | null;
  asset?: Pick<Asset, 'id' | 'name' | 'assetTag' | 'hostname' | 'ipAddress'> | null;
  dueAt: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  attachments: string[];
  createdById: string;
  assignedToId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string;
    username?: string | null;
    email: string;
  };
  assignedTo: {
    id: string;
    name: string;
    email: string;
  } | null;
  _count?: {
    comments: number;
  };
}

export interface TicketDetail extends Ticket {
  comments: Comment[];
  history: TicketHistory[];
}

export interface Comment {
  id: string;
  message: string;
  ticketId: string;
  userId: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export interface TicketHistory {
  id: string;
  ticketId: string;
  oldStatus: TicketStatus;
  newStatus: TicketStatus;
  changedAt: string;
  changedBy: {
    id: string;
    name: string;
  };
}

// Tipos de formulários
export interface LoginCredentials {
  login: string;
  password: string;
}

export interface RegisterData {
  name: string;
  username: string;
  email: string;
  password: string;
  role?: UserRole;
}

export interface CreateTicketData {
  title: string;
  description: string;
  category: TicketCategory;
  priority: number;
  computerUser?: string | null;
  deviceHostname?: string | null;
  deviceIp?: string | null;
  sourceAgentId?: string | null;
  assetId?: string | null;
}

export interface UpdateTicketData {
  title?: string;
  description?: string;
  category?: TicketCategory;
  priority?: number;
  computerUser?: string | null;
  deviceHostname?: string | null;
  deviceIp?: string | null;
  sourceAgentId?: string | null;
  assetId?: string | null;
  status?: TicketStatus;
  assignedToId?: string | null;
}

// Tipos de filtros
export interface TicketFilters {
  view?: 'ACTIVE' | 'COMPLETED' | 'ALL';
  status?: TicketStatus;
  statusGroup?: 'IN_PROGRESS';
  category?: TicketCategory;
  assignedToMe?: boolean;
  createdByMe?: boolean;
  page?: number;
  limit?: number;
}

// Tipos de resposta da API
export interface ApiResponse<T> {
  message?: string;
  data?: T;
  error?: string;
  code?: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface TicketListResponse {
  tickets: Ticket[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TicketResolutionMetrics {
  completedCount: number;
  averageHours: number;
  medianHours: number;
  fastestHours: number;
}

// Tipos de Dashboard
export interface DashboardMetrics {
  summary: {
    open: number;
    inProgress: number;
    completed: number;
  };
  databaseUsage: {
    databaseName: string;
    sizeBytes: number;
    prettySize: string;
    topTables: Array<{
      tableName: string;
      sizeBytes: number;
      prettySize: string;
    }>;
  } | null;
  inventory: {
    assets: number;
    detectedIps: number;
    manualIps: number;
    licenses: number;
    disposalItems: number;
  };
  attention?: {
    upcomingLicenses: Array<{
      id: string;
      softwareName: string;
      version: string | null;
      expiresAt: string;
      seats: number;
      daysUntilExpiration: number;
      ownerCompany: Pick<Company, 'id' | 'name' | 'code'> | null;
    }>;
  };
}

export interface TrendData {
  date: string;
  count: number;
}

export type AssetStatus = 'AVAILABLE' | 'ASSIGNED' | 'MAINTENANCE' | 'WARRANTY' | 'DONOR' | 'RETIRED';
export type AssetCondition = 'NEW' | 'GOOD' | 'FAIR' | 'POOR';
export type AssetType = 'DESKTOP' | 'NOTEBOOK' | 'SERVER' | 'VIRTUAL_MACHINE' | 'MONITOR' | 'MOUSE' | 'KEYBOARD' | 'PRINTER' | 'MOBILE' | 'TABLET' | 'IP_PHONE' | 'VOIP_SERVER' | 'CAMERA' | 'DVR_NVR' | 'ROUTER' | 'SWITCH' | 'ACCESS_POINT' | 'ANTENNA' | 'TIME_CLOCK' | 'TURNSTILE' | 'FIREWALL' | 'UPS' | 'OTHER';

export interface Asset {
  id: string;
  assetTag: string;
  name: string;
  category: string;
  type: AssetType;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  bandFrequency: string | null;
  firmware: string | null;
  status: AssetStatus;
  condition: AssetCondition;
  location: string | null;
  companyId: string | null;
  company: Pick<Company, 'id' | 'name' | 'code'> | null;
  supplierId: string | null;
  supplier: Pick<Supplier, 'id' | 'name' | 'taxId'> | null;
  ipAddress: string | null;
  networkSegmentId: string | null;
  networkSegment?: Pick<NetworkSegment, 'id' | 'name' | 'cidr' | 'gateway' | 'location'> | null;
  gateway: string | null;
  macAddress: string | null;
  hostname: string | null;
  operatingSystem: string | null;
  osVersion: string | null;
  osArchitecture: string | null;
  processor: string | null;
  cpuCores: number | null;
  cpuLogicalProcessors: number | null;
  memoryMb: number | null;
  diskGb: number | null;
  diskFreeGb: number | null;
  loggedUser: string | null;
  domain: string | null;
  workgroup: string | null;
  systemType: string | null;
  biosVersion: string | null;
  biosReleaseDate: string | null;
  windowsInstallDate: string | null;
  lastFormattedAt: string | null;
  lastBootAt: string | null;
  windowsLicenseKey: string | null;
  windowsLicenseStatus: string | null;
  windowsProductKeyPartial: string | null;
  lastSeenAt: string | null;
  discoverySource: string | null;
  openPorts: number[];
  assignedToId: string | null;
  parentAssetId?: string | null;
  assignedTo: Pick<User, 'id' | 'name' | 'email'> | null;
  purchaseDate: string | null;
    warrantyExpires: string | null;
    maintenanceIntervalDays: number | null;
    nextMaintenanceAt: string | null;
  purchaseCost: string | null;
  purchasedByCompanyId: string | null;
  purchasedByCompany: Pick<Company, 'id' | 'name' | 'code'> | null;
  purchaseSupplier: string | null;
  purchaseInvoiceNumber: string | null;
  purchaseInvoiceAccessKey: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  softwareLicenses?: Array<{
    licenseId: string;
    license: Pick<SoftwareLicense, 'id' | 'softwareName' | 'version'>;
  }>;
}

export interface AssetDonorInput {
  storeAll: boolean;
  location?: string | null;
  notes: string;
  parts: Array<{
    name: string;
    quantity: number;
    serialNumber?: string | null;
    partNumber?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    notes?: string | null;
  }>;
}

export interface SoftwareLicense {
  id: string;
  softwareName: string;
  version: string | null;
  ownerCompanyId: string | null;
  ownerCompany: Pick<Company, 'id' | 'name' | 'code'> | null;
  supplierId: string | null;
  supplier: Pick<Supplier, 'id' | 'name' | 'taxId'> | null;
  invoiceNumber: string | null;
  licenseNumber: string;
  purchasedFrom: string | null;
  purchaseDate: string | null;
  seats: number;
  isPerpetual: boolean;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  assets: Array<{
    id: string;
    assetId: string;
    asset: Pick<Asset, 'id' | 'name' | 'assetTag' | 'ipAddress' | 'hostname' | 'companyId'> & { company?: Pick<Company, 'id' | 'name' | 'code'> | null };
    source?: 'MANUAL' | 'AGENT' | 'MANUAL_AND_AGENT';
    detectedByAgent?: boolean;
    detectedApplicationName?: string | null;
    detectedApplicationVersion?: string | null;
    lastDetectedAt?: string | null;
  }>;
  usage?: {
    used: number;
    available: number;
    exceeded: number;
    detectedByAgent: number;
  };
  assignmentHistory?: Array<{
    id: string;
    action: 'ASSIGNED' | 'UNASSIGNED' | 'DETECTED';
    source: string;
    createdAt: string;
    asset: Pick<Asset, 'id' | 'name' | 'assetTag' | 'ipAddress' | 'hostname'>;
    performedBy: Pick<User, 'id' | 'name' | 'email'> | null;
  }>;
}

export interface SoftwareLicenseInput {
  softwareName: string;
  version?: string | null;
  ownerCompanyId?: string | null;
  supplierId?: string | null;
  invoiceNumber?: string | null;
  licenseNumber: string;
  purchasedFrom?: string | null;
  purchaseDate?: string | null;
  seats: number;
  isPerpetual: boolean;
  expiresAt?: string | null;
  notes?: string | null;
  assetIds: string[];
}

export type IpAddressSource = 'MANUAL' | 'ASSET' | 'DISCOVERY' | 'FREE';

export interface NetworkIpAddress {
  id: string;
  ipAddress: string;
  networkSegmentId: string | null;
  networkSegment?: NetworkSegment | null;
  hostname: string | null;
  macAddress: string | null;
  description: string | null;
  source: IpAddressSource;
  companyId: string | null;
  company?: Pick<Company, 'id' | 'name' | 'code'> | null;
  assetId: string | null;
  asset?: Pick<Asset, 'id' | 'name' | 'assetTag'> | null;
  lastSeenAt: string | null;
  active: boolean;
  editable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NetworkIpAddressInput {
  ipAddress: string;
  networkSegmentId?: string | null;
  hostname?: string | null;
  macAddress?: string | null;
  description?: string | null;
  companyId?: string | null;
  assetId?: string | null;
  active: boolean;
}

export interface NetworkSegment {
  id: string;
  name: string;
  cidr: string;
  gateway: string | null;
  vlan: number | null;
  location: string | null;
  companyId: string | null;
  company?: Pick<Company, 'id' | 'name' | 'code'> | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NetworkSegmentInput {
  name: string;
  cidr: string;
  gateway?: string | null;
  vlan?: number | null;
  location?: string | null;
  companyId?: string | null;
  active: boolean;
}

export type PasswordVaultDeviceType = 'DVR' | 'NVR' | 'ROUTER' | 'ANTENNA' | 'ACCESS_POINT' | 'SWITCH' | 'CAMERA' | 'PRINTER' | 'SERVER' | 'OTHER';
export type PasswordVaultEntryType = 'SOFTWARE' | 'USER' | 'NETWORK_DEVICE' | 'OTHER';

export interface PasswordVaultEntry {
  id: string;
  name: string;
  entryType: PasswordVaultEntryType;
  deviceType: PasswordVaultDeviceType;
  ipAddressId: string | null;
  ipAddress: Pick<NetworkIpAddress, 'id' | 'ipAddress' | 'hostname' | 'description'> | null;
  assetId: string | null;
  asset: Pick<Asset, 'id' | 'name' | 'assetTag' | 'ipAddress' | 'hostname'> | null;
  host: string | null;
  url: string | null;
  port: number | null;
  protocol: string | null;
  username: string | null;
  password: string;
  adminUsername: string | null;
  adminPassword: string;
  userUsername: string | null;
  userPassword: string;
  internetUsername: string | null;
  internetPassword: string;
  p12Username: string | null;
  p12Password: string;
  emailUsername: string | null;
  emailPassword: string;
  passwordConfigured: boolean;
  adminPasswordConfigured: boolean;
  userPasswordConfigured: boolean;
  internetPasswordConfigured: boolean;
  p12PasswordConfigured: boolean;
  emailPasswordConfigured: boolean;
  notes: string | null;
  active: boolean;
  createdById: string | null;
  createdBy: Pick<User, 'id' | 'name' | 'email'> | null;
  createdAt: string;
  updatedAt: string;
}

export interface PasswordVaultInput {
  name: string;
  entryType: PasswordVaultEntryType;
  deviceType: PasswordVaultDeviceType;
  ipAddressId?: string | null;
  assetId?: string | null;
  host?: string | null;
  url?: string | null;
  port?: number | null;
  protocol?: string | null;
  username?: string | null;
  password?: string;
  adminUsername?: string | null;
  adminPassword?: string | null;
  userUsername?: string | null;
  userPassword?: string | null;
  internetUsername?: string | null;
  internetPassword?: string | null;
  p12Username?: string | null;
  p12Password?: string | null;
  emailUsername?: string | null;
  emailPassword?: string | null;
  notes?: string | null;
  active: boolean;
}

export interface AssetHistory {
  id: string;
  action: 'CREATED' | 'UPDATED' | 'ASSIGNED' | 'RETURNED' | 'STATUS_CHANGED' | 'RETIRED';
  description: string;
  createdAt: string;
  performedBy: Pick<User, 'id' | 'name'>;
}

export interface MaintenanceRecord extends AssetHistory {
  asset: Pick<Asset, 'id' | 'name' | 'assetTag' | 'serialNumber' | 'type' | 'location'>;
}

export interface AssetDetail extends Asset {
  history: AssetHistory[];
  passwordVaultEntries: PasswordVaultEntry[];
  parentAsset?: Pick<Asset, 'id' | 'name' | 'assetTag' | 'type' | 'status'> | null;
  peripherals: Array<Pick<Asset, 'id' | 'name' | 'assetTag' | 'type' | 'category' | 'manufacturer' | 'model' | 'serialNumber' | 'status' | 'condition'> & { deviceIdentifier: string | null }>;
  agentInventory: {
    computerName: string;
    agentName: string;
    lastSeenAt: string;
    agentVersion: string | null;
    installedApplications: Array<{ name: string; version: string | null; publisher: string | null; installDate: string | null }>;
    connectedPeripherals: Array<{ kind: 'MONITOR' | 'MOUSE' | 'KEYBOARD'; name: string; manufacturer: string | null; model: string | null; serialNumber: string | null; deviceId: string | null }>;
  } | null;
}

export interface AssetInput {
  assetTag?: string | null;
  name: string;
  category: string;
  type: AssetType;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  bandFrequency?: string | null;
  firmware?: string | null;
  status: AssetStatus;
  condition: AssetCondition;
  location?: string | null;
  companyId?: string | null;
  supplierId?: string | null;
  ipAddress?: string | null;
  networkSegmentId?: string | null;
  gateway?: string | null;
  macAddress?: string | null;
  hostname?: string | null;
  operatingSystem?: string | null;
  osVersion?: string | null;
  osArchitecture?: string | null;
  processor?: string | null;
  domain?: string | null;
  workgroup?: string | null;
  systemType?: string | null;
  biosVersion?: string | null;
  biosReleaseDate?: string | null;
  windowsInstallDate?: string | null;
  lastBootAt?: string | null;
  windowsLicenseKey?: string | null;
  windowsProductKeyProtected?: string | null;
  memoryMb?: number | null;
  diskGb?: number | null;
  diskFreeGb?: number | null;
  loggedUser?: string | null;
  assignedToId?: string | null;
  purchaseDate?: string | null;
    warrantyExpires?: string | null;
    maintenanceIntervalDays?: number | null;
    nextMaintenanceAt?: string | null;
  purchaseCost?: number | null;
  purchasedByCompanyId?: string | null;
  purchaseSupplier?: string | null;
  purchaseInvoiceNumber?: string | null;
  purchaseInvoiceAccessKey?: string | null;
  notes?: string | null;
}

export interface Company {
  id: string;
  name: string;
  legalName: string | null;
  code: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { assets: number; users: number };
}

export interface CompanyInput {
  name: string;
  legalName?: string | null;
  code: string;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  active: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  contactName: string | null;
  category: string | null;
  website: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { assets: number; accessories: number; softwareLicenses: number };
}

export interface SupplierInput {
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  contactName?: string | null;
  category?: string | null;
  website?: string | null;
  address?: string | null;
  notes?: string | null;
  active: boolean;
}

export interface Accessory {
  id: string;
  name: string;
  category: string;
  quantity: number;
  minQuantity: number;
  unit: string;
  condition: 'NEW' | 'USED';
  imageUrl: string | null;
  serialNumber: string | null;
  partNumber: string | null;
  bandFrequency: string | null;
  manufacturer: string | null;
  model: string | null;
  location: string | null;
  companyId: string | null;
  company: Pick<Company, 'id' | 'name' | 'code'> | null;
  supplierId: string | null;
  supplier: Pick<Supplier, 'id' | 'name' | 'taxId'> | null;
  purchasedByCompanyId: string | null;
  purchasedByCompany: Pick<Company, 'id' | 'name' | 'code'> | null;
  purchaseSupplier: string | null;
  purchaseInvoiceNumber: string | null;
  purchaseInvoiceAccessKey: string | null;
  purchaseDate: string | null;
  warrantyExpires: string | null;
  purchaseCost: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  balances: AccessoryStockBalance[];
}

export interface AccessoryStockBalance {
  id: string;
  accessoryId: string;
  companyId: string | null;
  company: Pick<Company, 'id' | 'name' | 'code'> | null;
  location: string | null;
  quantity: number;
}

export interface AccessoryInput {
  name: string;
  category: string;
  quantity: number;
  minQuantity: number;
  unit: string;
  condition: 'NEW' | 'USED';
  imageUrl?: string | null;
  serialNumber?: string | null;
  partNumber?: string | null;
  bandFrequency?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  location?: string | null;
  companyId?: string | null;
  supplierId?: string | null;
  purchasedByCompanyId?: string | null;
  purchaseSupplier?: string | null;
  purchaseInvoiceNumber?: string | null;
  purchaseInvoiceAccessKey?: string | null;
  purchaseDate?: string | null;
  warrantyExpires?: string | null;
  purchaseCost?: number | null;
  notes?: string | null;
  active: boolean;
}

export type AccessoryMovementType = 'IN' | 'OUT' | 'ADJUSTMENT';

export interface AccessoryMovement {
  id: string;
  accessoryId: string;
  type: AccessoryMovementType;
  quantity: number;
  reason: string | null;
  assetId: string | null;
  userId: string | null;
  performedById: string;
  balanceId: string | null;
  balance: Pick<AccessoryStockBalance, 'id' | 'companyId' | 'location'> | null;
  canceledAt: string | null;
  canceledById: string | null;
  cancellationReason: string | null;
  createdAt: string;
  accessory: Pick<Accessory, 'id' | 'name' | 'category' | 'unit'>;
  asset: Pick<Asset, 'id' | 'name' | 'assetTag' | 'ipAddress'> | null;
  user: Pick<User, 'id' | 'name' | 'email'> | null;
  performedBy: Pick<User, 'id' | 'name' | 'email'>;
  canceledBy: Pick<User, 'id' | 'name' | 'email'> | null;
}

export interface AccessoryMovementInput {
  type: AccessoryMovementType;
  quantity: number;
  reason?: string | null;
  assetId?: string | null;
  userId?: string | null;
  balanceId?: string | null;
}

export interface DisposalItem {
  id: string;
  assetId: string | null;
  accessoryId: string | null;
  itemName: string;
  category: string | null;
  assetTag: string | null;
  serialNumber: string | null;
  quantity: number;
  reason: string | null;
  destination: string | null;
  disposalDate: string;
  notes: string | null;
  performedById: string;
  performedBy: Pick<User, 'id' | 'name' | 'email'>;
  asset: Pick<Asset, 'id' | 'assetTag' | 'name' | 'category' | 'type' | 'serialNumber' | 'status'> | null;
  accessory: Pick<Accessory, 'id' | 'name' | 'category' | 'unit' | 'quantity' | 'condition' | 'serialNumber' | 'partNumber'> | null;
  createdAt: string;
  updatedAt: string;
}

export interface DisposalInput {
  assetId?: string | null;
  accessoryId?: string | null;
  itemName?: string;
  category?: string | null;
  assetTag?: string | null;
  serialNumber?: string | null;
  quantity: number;
  reason?: string | null;
  destination?: string | null;
  disposalDate?: string;
  notes?: string | null;
}

export type NotificationEventType = 'TICKET_CREATED' | 'TICKET_STATUS' | 'TICKET_COMMENT';

export interface NotificationEvent {
  id: string;
  type: NotificationEventType;
  title: string;
  message: string;
  occurredAt: string;
  actorName: string;
  link?: string;
}

export interface NotificationResponse {
  serverTime: string;
  events: NotificationEvent[];
}

export interface DiscoveredDevice {
  identificationNote?: string;
  scannedPortCount?: number;
  serviceEvidence?: Array<{ port: number; transport: 'TCP' | 'UDP'; service: string; confirmed: boolean; details: string }>;
  manufacturerSource?: 'device' | 'mac' | 'ports' | null;
  ipAddress: string;
  hostname: string | null;
  macAddress: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  firmware: string | null;
  online: boolean;
  responseTimeMs?: number | null;
  source: string;
  type: AssetType;
  openPorts: number[];
  operatingSystem?: string | null;
  osVersion?: string | null;
  osArchitecture?: string | null;
  processor?: string | null;
  cpuCores?: number | null;
  cpuLogicalProcessors?: number | null;
  memoryMb?: number | null;
  diskGb?: number | null;
  diskFreeGb?: number | null;
  loggedUser?: string | null;
  domain?: string | null;
  workgroup?: string | null;
  systemType?: string | null;
  biosVersion?: string | null;
  biosReleaseDate?: string | null;
  windowsInstallDate?: string | null;
  lastBootAt?: string | null;
  gateway?: string | null;
  windowsLicenseKey?: string | null;
  windowsProductKeyProtected?: string | null;
  windowsLicenseStatus?: string | null;
  windowsProductKeyPartial?: string | null;
}

export type DiscoveryIgnoreMode = 'NETWORK' | 'PRINTER' | 'WINDOWS';

export interface DiscoveryIgnoredIp {
  id: string;
  ipAddress: string;
  mode: DiscoveryIgnoreMode;
  reason: string | null;
  createdAt: string;
}
