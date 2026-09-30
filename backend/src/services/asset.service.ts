import { AssetCondition, AssetHistoryAction, AssetStatus, AssetType, Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { decryptPassword, encryptPassword } from './password-vault.service';
import { AuditService } from './audit.service';
import { vaultEntryBelongsToAsset } from './asset-vault-link';

const prisma = new PrismaClient();
const auditService = new AuditService();

const optionalText = z.string().trim().max(255).optional().nullable().transform((value) => value || null);
const optionalDate = z.string().optional().nullable().transform((value) => value ? new Date(`${value}T00:00:00.000Z`) : null);
const deleteAssetSchema = z.object({
  password: z.string().min(1, 'Senha obrigatoria para excluir o ativo'),
});
const maintenanceServiceSchema = z.enum(['FORMATACAO', 'LIMPEZA', 'TROCA_PERIFERICOS', 'ATUALIZACAO', 'REPARO', 'TESTES', 'OUTRO']);
const completeMaintenanceSchema = z.object({
  services: z.array(maintenanceServiceSchema).min(1, 'Selecione pelo menos um serviço realizado'),
  details: z.string().trim().min(3, 'Descreva o que foi feito').max(2000),
  assignedToId: z.string().uuid().optional().nullable(),
});

const donorPartSchema = z.object({
  name: z.string().trim().min(2).max(120),
  quantity: z.coerce.number().int().min(1).max(100).default(1),
  serialNumber: optionalText,
  partNumber: optionalText,
  manufacturer: optionalText,
  model: optionalText,
  notes: z.string().trim().max(500).optional().nullable().transform((value) => value || null),
});

const donorAssetSchema = z.object({
  storeAll: z.boolean().default(false),
  parts: z.array(donorPartSchema).max(30).default([]),
  location: optionalText,
  notes: z.string().trim().min(3, 'Informe o motivo ou estado do equipamento').max(2000),
}).superRefine((data, context) => {
  if (!data.storeAll && !data.parts.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['parts'], message: 'Selecione pelo menos uma peça ou escolha guardar tudo' });
  }
});

const maintenanceServiceLabels: Record<z.infer<typeof maintenanceServiceSchema>, string> = {
  FORMATACAO: 'Formatação',
  LIMPEZA: 'Limpeza',
  TROCA_PERIFERICOS: 'Troca de periféricos',
  ATUALIZACAO: 'Atualização de sistema/software',
  REPARO: 'Reparo de hardware',
  TESTES: 'Testes e validação',
  OUTRO: 'Outro serviço',
};

const normalizeAssetCategory = (value: string) => {
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

const categoryVariants = (category: string) => {
  const normalized = normalizeAssetCategory(category);
  if (normalized === 'DVR / NVR') return ['DVR / NVR', 'DVR NVR', 'DVR_NVR'];
  if (normalized === 'Câmera') return ['Câmera', 'Camera', 'CAMERA', 'Câmera IP', 'Camera IP', 'CAMERA IP', 'CAMERA_IP', 'IP Camera', 'IP Cameras', 'CCTV'];
  if (normalized === 'Desktop') return ['Desktop', 'DESKTOP'];
  if (normalized === 'Impressora') return ['Impressora', 'PRINTER', 'Printer'];
  return [category];
};

const categoryFromAssetType = (type?: AssetType | null) => {
  if (type === AssetType.DVR_NVR) return 'DVR / NVR';
  if (type === AssetType.CAMERA) return 'Câmera';
  if (type === AssetType.IP_PHONE) return 'Telefone IP';
  if (type === AssetType.VOIP_SERVER) return 'Servidor VoIP / PABX';
  if (type === AssetType.PRINTER) return 'Impressora';
  if (type === AssetType.ANTENNA) return 'Antena';
  if (type === AssetType.TIME_CLOCK) return 'Relógio de ponto';
  if (type === AssetType.TURNSTILE) return 'Catraca';
  if (type === AssetType.DESKTOP) return 'Desktop';
  if (type === AssetType.NOTEBOOK) return 'Notebook';
  if (type === AssetType.MONITOR) return 'Monitor';
  if (type === AssetType.MOUSE) return 'Mouse';
  if (type === AssetType.KEYBOARD) return 'Teclado';
  if (type) return type.replace(/_/g, ' ');
  return 'Outro';
};

type AgentPeripheral = {
  kind: 'MONITOR' | 'MOUSE' | 'KEYBOARD';
  name: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  deviceId: string | null;
};

const agentText = (value: unknown, maxLength = 500) => typeof value === 'string' && value.trim()
  ? value.trim().slice(0, maxLength)
  : null;

const readAgentPeripherals = (value: unknown): AgentPeripheral[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const kind = agentText(record.kind, 30);
    const name = agentText(record.name, 300);
    if (!name || !kind || !['MONITOR', 'MOUSE', 'KEYBOARD'].includes(kind)) return [];
    return [{
      kind: kind as AgentPeripheral['kind'],
      name,
      manufacturer: agentText(record.manufacturer, 200),
      model: agentText(record.model, 200),
      serialNumber: agentText(record.serialNumber, 200),
      deviceId: agentText(record.deviceId, 500),
    }];
  });
};

const readInstalledApplications = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 2000).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const name = agentText(record.name, 300);
    if (!name) return [];
    return [{
      name,
      version: agentText(record.version, 100),
      publisher: agentText(record.publisher, 200),
      installDate: agentText(record.installDate, 50),
    }];
  });
};

const syncCategoryWithType = <T extends { type?: AssetType | null; category?: string }>(data: T) => {
  if (data.type) {
    data.category = categoryFromAssetType(data.type);
  } else if (data.category !== undefined) {
    data.category = data.category || 'Outro';
  }
  return data;
};

export const createAssetSchema = z.object({
  assetTag: z.string().trim().max(50).optional().nullable().transform((value) => value || undefined),
  name: z.string().trim().min(2).max(120),
  category: z.preprocess(
    (value) => typeof value === 'string' && value.trim() ? value : 'Outro',
    z.string().trim().min(2).max(80).transform(normalizeAssetCategory),
  ),
  type: z.nativeEnum(AssetType).default(AssetType.OTHER),
  manufacturer: optionalText,
  model: optionalText,
  serialNumber: optionalText,
  bandFrequency: optionalText,
  firmware: optionalText,
  status: z.nativeEnum(AssetStatus).default(AssetStatus.AVAILABLE),
  condition: z.nativeEnum(AssetCondition).default(AssetCondition.GOOD),
  location: optionalText,
  assignedToId: z.string().uuid().optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  ipAddress: optionalText,
  networkSegmentId: z.string().uuid().optional().nullable(),
  gateway: optionalText,
  macAddress: optionalText.transform((value) => value ? value.replace(/-/g, ':').toUpperCase() : null),
  hostname: optionalText,
  operatingSystem: optionalText,
  osVersion: optionalText,
  osArchitecture: optionalText,
  processor: optionalText,
  domain: optionalText,
  workgroup: optionalText,
  systemType: optionalText,
  biosVersion: optionalText,
  biosReleaseDate: optionalDate,
  windowsInstallDate: z.string().optional().nullable().transform((value) => value ? new Date(value) : null),
  lastBootAt: z.string().optional().nullable().transform((value) => value ? new Date(value) : null),
  windowsLicenseKey: optionalText,
  memoryMb: z.coerce.number().int().nonnegative().optional().nullable(),
  diskGb: z.coerce.number().int().nonnegative().optional().nullable(),
  diskFreeGb: z.coerce.number().int().nonnegative().optional().nullable(),
  loggedUser: optionalText,
  purchaseDate: optionalDate,
  warrantyExpires: optionalDate,
  maintenanceIntervalDays: z.coerce.number().int().min(1).max(3650).optional().nullable(),
  nextMaintenanceAt: optionalDate,
  purchaseCost: z.coerce.number().nonnegative().optional().nullable(),
  purchasedByCompanyId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  purchaseSupplier: optionalText,
  purchaseInvoiceNumber: optionalText,
  purchaseInvoiceAccessKey: optionalText,
  notes: z.string().trim().max(3000).optional().nullable().transform((value) => value || null),
});

export const updateAssetSchema = createAssetSchema.partial();

const optionalQueryText = z.preprocess((value) => value === '' ? undefined : value, z.string().trim().optional());
const optionalQueryStatus = z.preprocess((value) => value === '' ? undefined : value, z.nativeEnum(AssetStatus).optional());
const optionalQueryUuid = z.preprocess((value) => value === '' ? undefined : value, z.string().uuid().optional());
const optionalWarrantyFilter = z.preprocess((value) => value === '' ? undefined : value, z.enum(['ACTIVE', 'EXPIRED']).optional());
const assetSortKeySchema = z.enum(['name', 'type', 'company', 'status', 'assignedTo', 'location', 'windowsInstallDate', 'lastFormattedAt', 'updatedAt']);

export const assetListSchema = z.object({
  search: optionalQueryText,
  status: optionalQueryStatus,
  type: z.preprocess((value) => value === '' ? undefined : value, z.nativeEnum(AssetType).optional()),
  category: optionalQueryText,
  location: optionalQueryText,
  companyId: optionalQueryUuid,
  purchasedByCompanyId: optionalQueryUuid,
  supplierId: optionalQueryUuid,
  warranty: optionalWarrantyFilter,
  sortKey: assetSortKeySchema.default('updatedAt'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(25),
});

const assetInclude = {
  assignedTo: { select: { id: true, name: true, email: true } },
  company: { select: { id: true, name: true, code: true } },
  purchasedByCompany: { select: { id: true, name: true, code: true } },
  supplier: { select: { id: true, name: true, taxId: true } },
  networkSegment: { select: { id: true, name: true, cidr: true, gateway: true, location: true } },
} satisfies Prisma.AssetInclude;

const assetPasswordVaultInclude = {
  ipAddress: { select: { id: true, ipAddress: true, hostname: true, description: true, networkSegmentId: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.PasswordVaultEntryInclude;

type AssetPasswordVaultEntry = Prisma.PasswordVaultEntryGetPayload<{ include: typeof assetPasswordVaultInclude }>;

function summarizeAssetPasswordVaultEntry(entry: AssetPasswordVaultEntry) {
  const {
    passwordEncrypted,
    adminPasswordEncrypted,
    userPasswordEncrypted,
    internetPasswordEncrypted,
    p12PasswordEncrypted,
    emailPasswordEncrypted,
    ...rest
  } = entry;

  return {
    ...rest,
    password: '',
    adminPassword: '',
    userPassword: '',
    internetPassword: '',
    p12Password: '',
    emailPassword: '',
    passwordConfigured: Boolean(passwordEncrypted),
    adminPasswordConfigured: Boolean(adminPasswordEncrypted),
    userPasswordConfigured: Boolean(userPasswordEncrypted),
    internetPasswordConfigured: Boolean(internetPasswordEncrypted),
    p12PasswordConfigured: Boolean(p12PasswordEncrypted),
    emailPasswordConfigured: Boolean(emailPasswordEncrypted),
  };
}

function exposeAssetLicense<T extends { windowsLicenseKey?: string | null; windowsProductKeyPartial?: string | null }>(asset: T) {
  const key = asset.windowsLicenseKey ? decryptPassword(asset.windowsLicenseKey) : '';
  return {
    ...asset,
    windowsLicenseKey: null,
    windowsProductKeyPartial: asset.windowsProductKeyPartial
      ? asset.windowsProductKeyPartial
      : key.slice(-5) || null,
  };
}

export class AssetService {
  private async generateAssetTag(type: AssetType) {
    const prefix = type === AssetType.CAMERA ? 'CAM' : type === AssetType.DVR_NVR ? 'DVR' : 'ATV';

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const suffix = `${Date.now().toString(36).toUpperCase()}${attempt ? `-${attempt}` : ''}`;
      const assetTag = `${prefix}-${suffix}`;
      const existing = await prisma.asset.findUnique({ where: { assetTag }, select: { id: true } });
      if (!existing) return assetTag;
    }

    return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private async ensureUniqueIp(ipAddress: string | null | undefined, networkSegmentId?: string | null, currentAssetId?: string) {
    if (!ipAddress) return;

    const existing = await prisma.asset.findFirst({
      where: {
        ipAddress,
        networkSegmentId: networkSegmentId || null,
        ...(currentAssetId ? { id: { not: currentAssetId } } : {}),
      },
      select: { id: true, name: true, ipAddress: true },
    });

    if (existing) {
      throw new Error(`IP_DUPLICATE:${existing.ipAddress}:${existing.name}`);
    }
  }

  async findAll(query: unknown) {
    const filters = assetListSchema.parse(query);
    const where: Prisma.AssetWhereInput = {};

    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;
    if (filters.category) where.category = { in: categoryVariants(filters.category) };
    if (filters.location) where.location = filters.location;
    if (filters.companyId) where.companyId = filters.companyId;
    if (filters.purchasedByCompanyId) where.purchasedByCompanyId = filters.purchasedByCompanyId;
    if (filters.supplierId) where.supplierId = filters.supplierId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (filters.warranty === 'ACTIVE') where.warrantyExpires = { gte: today };
    if (filters.warranty === 'EXPIRED') where.warrantyExpires = { lt: today };
    if (filters.search) {
      where.OR = [
        { assetTag: { contains: filters.search, mode: 'insensitive' } },
        { name: { contains: filters.search, mode: 'insensitive' } },
        { manufacturer: { contains: filters.search, mode: 'insensitive' } },
        { model: { contains: filters.search, mode: 'insensitive' } },
        { serialNumber: { contains: filters.search, mode: 'insensitive' } },
        { bandFrequency: { contains: filters.search, mode: 'insensitive' } },
        { ipAddress: { contains: filters.search, mode: 'insensitive' } },
        { gateway: { contains: filters.search, mode: 'insensitive' } },
        { macAddress: { contains: filters.search, mode: 'insensitive' } },
        { hostname: { contains: filters.search, mode: 'insensitive' } },
        { loggedUser: { contains: filters.search, mode: 'insensitive' } },
        { purchaseSupplier: { contains: filters.search, mode: 'insensitive' } },
        { purchaseInvoiceNumber: { contains: filters.search, mode: 'insensitive' } },
        { purchaseInvoiceAccessKey: { contains: filters.search, mode: 'insensitive' } },
        { assignedTo: { name: { contains: filters.search, mode: 'insensitive' } } },
        { purchasedByCompany: { name: { contains: filters.search, mode: 'insensitive' } } },
        { supplier: { name: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    const direction = filters.sortDirection;
    const orderByByKey: Record<z.infer<typeof assetSortKeySchema>, Prisma.AssetOrderByWithRelationInput> = {
      name: { name: direction },
      type: { type: direction },
      company: { company: { name: direction } },
      status: { status: direction },
      assignedTo: { assignedTo: { name: direction } },
      location: { location: direction },
      windowsInstallDate: { windowsInstallDate: direction },
      lastFormattedAt: { lastFormattedAt: direction },
      updatedAt: { updatedAt: direction },
    };

    const [assets, total, statusCounts, categories, locations] = await prisma.$transaction([
      prisma.asset.findMany({
        where,
        include: assetInclude,
        orderBy: [orderByByKey[filters.sortKey], { name: 'asc' }, { id: 'asc' }],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.asset.count({ where }),
      prisma.asset.groupBy({ by: ['status'], _count: true, orderBy: { status: 'asc' } }),
      prisma.asset.findMany({ distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } }),
      prisma.asset.findMany({ where: { location: { not: null } }, distinct: ['location'], select: { location: true }, orderBy: { location: 'asc' } }),
    ]);

    return {
      assets: assets.map(exposeAssetLicense),
      pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.max(1, Math.ceil(total / filters.limit)) },
      summary: Object.values(AssetStatus).reduce<Record<string, number>>((acc, status) => {
        const count = statusCounts.find((item) => item.status === status)?._count;
        acc[status] = typeof count === 'number' ? count : 0;
        return acc;
      }, {}),
      filters: {
        categories: [...new Set(categories.map((item) => normalizeAssetCategory(item.category)))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
        locations: locations.map((item) => item.location).filter(Boolean),
      },
    };
  }

  async findById(id: string) {
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        ...assetInclude,
        parentAsset: { select: { id: true, name: true, assetTag: true, type: true, status: true } },
        peripherals: {
          select: { id: true, name: true, assetTag: true, type: true, category: true, manufacturer: true, model: true, serialNumber: true, status: true, condition: true, deviceIdentifier: true },
          orderBy: [{ type: 'asc' }, { name: 'asc' }],
        },
        history: {
          include: { performedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!asset) throw new Error('Ativo não encontrado');

    const passwordVaultLinks: Prisma.PasswordVaultEntryWhereInput[] = [{ assetId: id }];
    if (asset.ipAddress) {
      passwordVaultLinks.push(
        { ipAddress: { ipAddress: asset.ipAddress } },
        { host: asset.ipAddress },
        { url: { contains: asset.ipAddress, mode: 'insensitive' } },
      );
    }
    if (asset.hostname) {
      passwordVaultLinks.push(
        { host: asset.hostname },
        { url: { contains: asset.hostname, mode: 'insensitive' } },
      );
    }

    const passwordVaultEntries = await prisma.passwordVaultEntry.findMany({
      where: { active: true, OR: passwordVaultLinks },
      include: assetPasswordVaultInclude,
      orderBy: [{ entryType: 'asc' }, { deviceType: 'asc' }, { name: 'asc' }],
    });

    const agent = asset.hostname || asset.name
      ? await prisma.remoteDiscoveryAgent.findFirst({
          where: {
            OR: [asset.hostname, asset.name].filter(Boolean).map((computerName) => ({ computerName: { equals: computerName!, mode: 'insensitive' as const } })),
          },
          orderBy: { lastSeenAt: 'desc' },
          select: { computerName: true, agentName: true, lastSeenAt: true, agentInfo: true },
        })
      : null;
    const rawAgentInfo = agent?.agentInfo && typeof agent.agentInfo === 'object' && !Array.isArray(agent.agentInfo)
      ? agent.agentInfo as Record<string, unknown>
      : null;
    const agentInventory = agent && rawAgentInfo ? {
      computerName: agent.computerName,
      agentName: agent.agentName,
      lastSeenAt: agent.lastSeenAt,
      agentVersion: agentText(rawAgentInfo.agentVersion, 50),
      installedApplications: readInstalledApplications(rawAgentInfo.installedApplications),
      connectedPeripherals: readAgentPeripherals(rawAgentInfo.connectedPeripherals),
    } : null;

    return { ...exposeAssetLicense(asset), passwordVaultEntries: passwordVaultEntries.filter((entry) => vaultEntryBelongsToAsset(asset, entry)).map(summarizeAssetPasswordVaultEntry), agentInventory };
  }

  async syncAgentPeripherals(id: string, performedById: string) {
    const parent = await prisma.asset.findUnique({ where: { id } });
    if (!parent) throw new Error('Ativo não encontrado');
    const supportedComputerTypes: AssetType[] = [AssetType.DESKTOP, AssetType.NOTEBOOK, AssetType.SERVER];
    if (!supportedComputerTypes.includes(parent.type)) {
      throw new Error('A sincronização de periféricos está disponível somente para computadores');
    }

    const agent = await prisma.remoteDiscoveryAgent.findFirst({
      where: {
        OR: [parent.hostname, parent.name].filter(Boolean).map((computerName) => ({ computerName: { equals: computerName!, mode: 'insensitive' as const } })),
      },
      orderBy: { lastSeenAt: 'desc' },
      select: { computerName: true, agentInfo: true },
    });
    const rawAgentInfo = agent?.agentInfo && typeof agent.agentInfo === 'object' && !Array.isArray(agent.agentInfo)
      ? agent.agentInfo as Record<string, unknown>
      : null;
    const detected = readAgentPeripherals(rawAgentInfo?.connectedPeripherals);
    if (!agent) throw new Error('Nenhum agente foi localizado para este computador');
    if (!detected.length) throw new Error('O agente ainda não enviou periféricos detectados para este computador');

    let created = 0;
    let linked = 0;
    let skipped = 0;
    const assets = await prisma.$transaction(async (tx) => {
      const synced = [];
      for (const peripheral of detected) {
        const stableIdentity = peripheral.serialNumber || peripheral.deviceId || `${agent.computerName}|${peripheral.name}`;
        const fingerprint = createHash('sha256').update(`${peripheral.kind}|${stableIdentity}`).digest('hex').slice(0, 16).toUpperCase();
        const assetTag = `AGT-${peripheral.kind.slice(0, 3)}-${fingerprint}`;
        const type = peripheral.kind === 'MONITOR' ? AssetType.MONITOR : peripheral.kind === 'MOUSE' ? AssetType.MOUSE : AssetType.KEYBOARD;
        const existing = await tx.asset.findFirst({
          where: {
            OR: [
              { assetTag },
              ...(peripheral.serialNumber ? [{ serialNumber: peripheral.serialNumber }] : []),
            ],
          },
        });

        if (existing?.status === AssetStatus.RETIRED || existing?.status === AssetStatus.DONOR) {
          skipped += 1;
          continue;
        }

        if (existing) {
          const parentChanged = existing.parentAssetId !== parent.id;
          const updated = await tx.asset.update({
            where: { id: existing.id },
            data: {
              parentAssetId: parent.id,
              type,
              category: categoryFromAssetType(type),
              manufacturer: peripheral.manufacturer || existing.manufacturer,
              model: peripheral.model || existing.model,
              serialNumber: peripheral.serialNumber || existing.serialNumber,
              deviceIdentifier: peripheral.deviceId || existing.deviceIdentifier,
              companyId: parent.companyId,
              location: parent.location,
              assignedToId: parent.assignedToId,
              status: parent.assignedToId ? AssetStatus.ASSIGNED : AssetStatus.AVAILABLE,
              discoverySource: 'REMOTE_AGENT_PERIPHERAL',
              ...(parentChanged ? { history: { create: { action: AssetHistoryAction.UPDATED, description: `Periférico vinculado ao computador ${parent.name} (${parent.assetTag}) pelo agente`, performedById } } } : {}),
            },
          });
          linked += 1;
          synced.push(updated);
          continue;
        }

        const createdAsset = await tx.asset.create({
          data: {
            assetTag,
            name: peripheral.name,
            category: categoryFromAssetType(type),
            type,
            manufacturer: peripheral.manufacturer,
            model: peripheral.model,
            serialNumber: peripheral.serialNumber,
            deviceIdentifier: peripheral.deviceId,
            status: parent.assignedToId ? AssetStatus.ASSIGNED : AssetStatus.AVAILABLE,
            condition: AssetCondition.GOOD,
            location: parent.location,
            assignedToId: parent.assignedToId,
            companyId: parent.companyId,
            parentAssetId: parent.id,
            discoverySource: 'REMOTE_AGENT_PERIPHERAL',
            notes: `Detectado automaticamente pelo agente e vinculado a ${parent.name} (${parent.assetTag}).`,
            history: { create: { action: AssetHistoryAction.CREATED, description: `Periférico detectado e vinculado ao computador ${parent.name} (${parent.assetTag})`, performedById } },
          },
        });
        created += 1;
        synced.push(createdAsset);
      }
      return synced;
    });

    return { created, linked, skipped, peripherals: assets };
  }

  async revealWindowsLicense(id: string, performedById: string, password: unknown) {
    await auditService.verifyPassword(performedById, password);
    const asset = await prisma.asset.findUnique({
      where: { id },
      select: { id: true, name: true, assetTag: true, windowsLicenseKey: true },
    });
    if (!asset) throw new Error('Ativo nÃ£o encontrado');
    const licenseKey = decryptPassword(asset.windowsLicenseKey);
    if (!licenseKey) throw new Error('LicenÃ§a do Windows nÃ£o encontrada');
    await auditService.record({
      action: 'REVEALED',
      resourceType: 'asset-windows-license',
      resourceId: asset.id,
      resourceName: `${asset.name} (${asset.assetTag})`,
      changedFields: [],
      details: { reason: 'VisualizaÃ§Ã£o da chave completa do Windows' },
      performedById,
    });
    return licenseKey;
  }

  async create(input: unknown, performedById: string) {
    const data = syncCategoryWithType(createAssetSchema.parse(input));
    if (data.assignedToId) data.status = AssetStatus.ASSIGNED;
    await this.ensureUniqueIp(data.ipAddress, data.networkSegmentId);
    const assetTag = data.assetTag || await this.generateAssetTag(data.type);

    const created = await prisma.asset.create({
      data: {
        ...data,
        windowsLicenseKey: data.windowsLicenseKey ? encryptPassword(data.windowsLicenseKey) : null,
        assetTag,
        purchaseCost: data.purchaseCost == null ? null : new Prisma.Decimal(data.purchaseCost),
        history: { create: { action: AssetHistoryAction.CREATED, description: 'Ativo cadastrado', performedById } },
      },
      include: assetInclude,
    });
    return exposeAssetLicense(created);
  }

  async update(id: string, input: unknown, performedById: string) {
    const existing = await this.findById(id);
    const data = syncCategoryWithType(updateAssetSchema.parse(input));
    if (data.status === AssetStatus.DONOR && existing.status !== AssetStatus.DONOR) {
      throw new Error('Use a opção Transformar em doador para escolher as peças aproveitadas');
    }
    if (data.assignedToId) data.status = AssetStatus.ASSIGNED;
    await this.ensureUniqueIp(data.ipAddress, data.networkSegmentId === undefined ? existing.networkSegmentId : data.networkSegmentId, id);

    let action: AssetHistoryAction = AssetHistoryAction.UPDATED;
    let description = 'Informações do ativo atualizadas';
    if (data.status && data.status !== existing.status) {
      action = data.status === AssetStatus.RETIRED ? AssetHistoryAction.RETIRED : AssetHistoryAction.STATUS_CHANGED;
      description = `Status alterado de ${existing.status} para ${data.status}`;
    }

    const updated = await prisma.asset.update({
      where: { id },
      data: {
        ...data,
        windowsLicenseKey: data.windowsLicenseKey === undefined
          ? undefined
          : data.windowsLicenseKey
            ? encryptPassword(data.windowsLicenseKey)
            : null,
        purchaseCost: data.purchaseCost === undefined ? undefined : data.purchaseCost == null ? null : new Prisma.Decimal(data.purchaseCost),
        history: { create: { action, description, performedById } },
      },
      include: assetInclude,
    });
    return exposeAssetLicense(updated);
  }

  async checkout(id: string, assignedToId: string, performedById: string) {
    const user = await prisma.user.findFirst({ where: { id: assignedToId, active: true } });
    if (!user) throw new Error('Usuário responsável não encontrado');
    const asset = await this.findById(id);
    if (asset.status === AssetStatus.DONOR) throw new Error('Um ativo doador de peças não pode ser atribuído');
    if (asset.status === AssetStatus.RETIRED) throw new Error('Um ativo retirado não pode ser atribuído');

    return prisma.$transaction(async (tx) => {
      const updated = await tx.asset.update({
        where: { id },
        data: {
          assignedToId,
          status: AssetStatus.ASSIGNED,
          history: { create: { action: AssetHistoryAction.ASSIGNED, description: `Atribuído a ${user.name}`, performedById } },
        },
        include: assetInclude,
      });
      const peripherals = await tx.asset.findMany({ where: { parentAssetId: id, status: { notIn: [AssetStatus.RETIRED, AssetStatus.DONOR] } }, select: { id: true } });
      if (peripherals.length) {
        await tx.asset.updateMany({ where: { id: { in: peripherals.map((item) => item.id) } }, data: { assignedToId, status: AssetStatus.ASSIGNED } });
        await tx.assetHistory.createMany({ data: peripherals.map((item) => ({ assetId: item.id, action: AssetHistoryAction.ASSIGNED, description: `Acompanha ${asset.name}; atribuído a ${user.name}`, performedById })) });
      }
      return updated;
    });
  }

  async checkin(id: string, performedById: string) {
    const asset = await this.findById(id);
    if (!asset.assignedTo) throw new Error('Este ativo não está atribuído');
    const returnedByName = asset.assignedTo.name;

    return prisma.$transaction(async (tx) => {
      const updated = await tx.asset.update({
        where: { id },
        data: {
          assignedToId: null,
          status: AssetStatus.AVAILABLE,
          history: { create: { action: AssetHistoryAction.RETURNED, description: `Devolvido por ${returnedByName}`, performedById } },
        },
        include: assetInclude,
      });
      const peripherals = await tx.asset.findMany({ where: { parentAssetId: id, status: { notIn: [AssetStatus.RETIRED, AssetStatus.DONOR] } }, select: { id: true } });
      if (peripherals.length) {
        await tx.asset.updateMany({ where: { id: { in: peripherals.map((item) => item.id) } }, data: { assignedToId: null, status: AssetStatus.AVAILABLE } });
        await tx.assetHistory.createMany({ data: peripherals.map((item) => ({ assetId: item.id, action: AssetHistoryAction.RETURNED, description: `Devolvido junto com ${asset.name} por ${returnedByName}`, performedById })) });
      }
      return updated;
    });
  }

  async completeMaintenance(id: string, input: unknown, performedById: string) {
    const data = completeMaintenanceSchema.parse(input);
    const asset = await this.findById(id);
    if (asset.status !== AssetStatus.MAINTENANCE) throw new Error('O ativo não está em manutenção');

    const shouldUseExplicitDestination = Object.prototype.hasOwnProperty.call(data, 'assignedToId');
    const destinationUserId = shouldUseExplicitDestination ? data.assignedToId : asset.assignedToId;
    const assignedTo = destinationUserId
      ? await prisma.user.findFirst({ where: { id: destinationUserId, active: true }, select: { id: true, name: true } })
      : null;
    if (destinationUserId && !assignedTo) throw new Error('Usuário responsável não encontrado');

    const services = data.services.map((service) => maintenanceServiceLabels[service]).join(', ');
    const hasFormattingService = data.services.includes('FORMATACAO');
    const destination = assignedTo ? `Devolvido ao usuário: ${assignedTo.name}` : 'Destino: disponível para uso';
    const description = `Manutenção concluída | Serviços: ${services} | Descrição: ${data.details} | ${destination}`;

    return prisma.$transaction(async (tx) => {
      const completedAt = new Date();
      const nextStatus = assignedTo ? AssetStatus.ASSIGNED : AssetStatus.AVAILABLE;
      const nextMaintenanceAt = asset.maintenanceIntervalDays
        ? new Date(Date.now() + asset.maintenanceIntervalDays * 86_400_000)
        : asset.nextMaintenanceAt;
      const updated = await tx.asset.update({
        where: { id },
        data: {
          status: nextStatus,
          assignedToId: assignedTo?.id || null,
          nextMaintenanceAt,
          lastFormattedAt: hasFormattingService ? completedAt : undefined,
          history: { create: { action: AssetHistoryAction.RETURNED, description, performedById } },
        },
        include: assetInclude,
      });
      await tx.asset.updateMany({ where: { parentAssetId: id, status: { notIn: [AssetStatus.RETIRED, AssetStatus.DONOR] } }, data: { assignedToId: assignedTo?.id || null, status: nextStatus } });
      return updated;
    });
  }

  async makeDonor(id: string, input: unknown, performedById: string) {
    const data = donorAssetSchema.parse(input);
    const asset = await this.findById(id);
    if (asset.status === AssetStatus.DONOR) throw new Error('Este ativo já está marcado como doador de peças');
    if (asset.status === AssetStatus.RETIRED) throw new Error('Um ativo retirado não pode ser transformado em doador');

    const category = asset.type === AssetType.NOTEBOOK
      ? 'Peças de notebook'
      : asset.type === AssetType.DESKTOP
        ? 'Peças de desktop'
        : `Peças de ${asset.category.toLowerCase()}`;
    const parts = data.storeAll
      ? [{
          name: `${asset.name} completo para peças`,
          quantity: 1,
          serialNumber: asset.serialNumber,
          partNumber: asset.assetTag,
          manufacturer: asset.manufacturer,
          model: asset.model,
          notes: 'Equipamento completo preservado para retirada futura de componentes',
        }]
      : data.parts;

    return prisma.$transaction(async (tx) => {
      const storedParts: Array<{ id: string; name: string; quantity: number }> = [];
      for (const part of parts) {
        const partCategory = data.storeAll ? 'Equipamentos doadores' : category;
        const partLocation = data.location || asset.location;
        const existingPart = data.storeAll ? null : await tx.accessory.findFirst({
          where: {
            name: { equals: part.name, mode: 'insensitive' },
            category: partCategory,
            condition: 'USED',
            companyId: asset.companyId,
            location: partLocation,
            serialNumber: part.serialNumber || null,
          },
        });

        const accessory = existingPart
          ? await tx.accessory.update({ where: { id: existingPart.id }, data: { quantity: { increment: part.quantity } } })
          : await tx.accessory.create({
              data: {
                name: part.name,
                category: partCategory,
                quantity: part.quantity,
                minQuantity: 0,
                unit: 'un',
                condition: 'USED',
                serialNumber: part.serialNumber || null,
                partNumber: part.partNumber || null,
                manufacturer: part.manufacturer || asset.manufacturer,
                model: part.model || null,
                location: partLocation,
                companyId: asset.companyId,
                purchasedByCompanyId: asset.purchasedByCompanyId,
                notes: [`Retirado do ativo doador ${asset.name} (${asset.assetTag}).`, part.notes].filter(Boolean).join(' '),
              },
            });

        await tx.accessoryMovement.create({
          data: {
            accessoryId: accessory.id,
            type: 'IN',
            quantity: part.quantity,
            reason: `Aproveitado do ativo doador ${asset.name} (${asset.assetTag}). ${data.notes}`.slice(0, 500),
            assetId: asset.id,
            performedById,
          },
        });
        storedParts.push({ id: accessory.id, name: accessory.name, quantity: part.quantity });
      }

      const partSummary = parts.map((part) => `${part.quantity}x ${part.name}`).join(', ');
      const updatedAsset = await tx.asset.update({
        where: { id },
        data: {
          status: AssetStatus.DONOR,
          assignedToId: null,
          history: {
            create: {
              action: AssetHistoryAction.DONOR,
              description: `Transformado em doador de peças | Guardado: ${partSummary} | Observação: ${data.notes}`,
              performedById,
            },
          },
        },
        include: assetInclude,
      });

      return { asset: updatedAsset, storedParts };
    });
  }

  async maintenanceReport() {
    return prisma.assetHistory.findMany({
      where: {
        action: AssetHistoryAction.RETURNED,
        description: { startsWith: 'Manutenção concluída' },
      },
      include: {
        asset: { select: { id: true, name: true, assetTag: true, serialNumber: true, type: true, location: true } },
        performedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async delete(id: string, performedById: string, input: unknown) {
    const { password } = deleteAssetSchema.parse(input);
    const user = await prisma.user.findUnique({ where: { id: performedById }, select: { passwordHash: true, active: true } });
    if (!user || !user.active) throw new Error('DELETE_USER_INVALID');

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) throw new Error('DELETE_PASSWORD_INVALID');

    await this.findById(id);
    await prisma.asset.delete({ where: { id } });
  }
}
