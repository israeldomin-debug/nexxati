import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { discoverySchema } from './network-discovery.service';
import { encryptPassword } from './password-vault.service';

const prisma = new PrismaClient();

const cleanText = (value: unknown, maxLength: number) => typeof value === 'string' && value.trim()
  ? value.trim().slice(0, maxLength)
  : null;

const sanitizeInstalledApplications = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 2000).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const name = cleanText(record.name, 300);
    if (!name) return [];
    return [{
      name,
      version: cleanText(record.version, 100),
      publisher: cleanText(record.publisher, 200),
      installDate: cleanText(record.installDate, 50),
    }];
  });
};

const sanitizeConnectedPeripherals = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const kind = cleanText(record.kind, 30);
    const name = cleanText(record.name, 300);
    if (!kind || !name || !['MONITOR', 'MOUSE', 'KEYBOARD'].includes(kind)) return [];
    return [{
      kind,
      name,
      manufacturer: cleanText(record.manufacturer, 200),
      model: cleanText(record.model, 200),
      serialNumber: cleanText(record.serialNumber, 200),
      deviceId: cleanText(record.deviceId, 500),
    }];
  });
};

const protectAgentInfo = (value: Record<string, unknown>) => ({
  ...value,
  installedApplications: sanitizeInstalledApplications(value.installedApplications),
  installedApplicationCount: sanitizeInstalledApplications(value.installedApplications).length,
  connectedPeripherals: sanitizeConnectedPeripherals(value.connectedPeripherals),
  windowsProductKey: typeof value.windowsProductKey === 'string' && value.windowsProductKey
    ? encryptPassword(value.windowsProductKey)
    : null,
});

const exposeAgentInfo = (value: unknown) => {
  const info = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    ...info,
    windowsProductKey: null,
    windowsProductKeyProtected: typeof info.windowsProductKey === 'string' ? info.windowsProductKey : null,
  };
};

const createJobSchema = z.object({
  siteName: z.string().trim().min(2).max(100),
  prefix: z.string().trim().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/),
  firstIp: z.number().int().min(1).max(254),
  lastIp: z.number().int().min(1).max(254),
}).refine((value) => value.lastIp >= value.firstIp && value.lastIp - value.firstIp < 254, {
  message: 'Faixa remota inválida',
});

const completeJobSchema = z.object({
  agentName: z.string().trim().min(1).max(100),
  agentInfo: z.record(z.unknown()).optional(),
  devices: z.array(z.object({
    ipAddress: z.string(),
    hostname: z.string().nullable().optional(),
    macAddress: z.string().nullable().optional(),
    manufacturer: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    serialNumber: z.string().nullable().optional(),
    firmware: z.string().nullable().optional(),
    online: z.boolean(),
    responseTimeMs: z.number().nullable().optional(),
    source: z.string(),
    type: z.string(),
    openPorts: z.array(z.number().int()),
  })).max(500),
  error: z.string().max(5000).optional(),
});

const heartbeatSchema = z.object({
  agentName: z.string().trim().min(1).max(100),
  agentInfo: z.record(z.unknown()).refine((value) => typeof value.computerName === 'string' && value.computerName.length > 0, {
    message: 'Nome da máquina não informado',
  }),
});

export class RemoteDiscoveryService {
  async heartbeat(input: unknown) {
    const data = heartbeatSchema.parse(input);
    const computerName = String(data.agentInfo.computerName);
    const protectedInfo = protectAgentInfo(data.agentInfo);
    return prisma.remoteDiscoveryAgent.upsert({
      where: { agentName_computerName: { agentName: data.agentName, computerName } },
      create: { agentName: data.agentName, computerName, agentInfo: protectedInfo as Prisma.InputJsonValue },
      update: { agentInfo: protectedInfo as Prisma.InputJsonValue },
    });
  }

  async listAgents() {
    const agents = await prisma.remoteDiscoveryAgent.findMany({ orderBy: { lastSeenAt: 'desc' } });
    return agents.map((agent) => ({ ...agent, agentInfo: exposeAgentInfo(agent.agentInfo) }));
  }

  async createJob(input: unknown, userId: string) {
    const data = createJobSchema.parse(input);
    discoverySchema.parse({
      targets: Array.from({ length: data.lastIp - data.firstIp + 1 }, (_, index) => `${data.prefix}.${data.firstIp + index}`),
    });
    return prisma.remoteDiscoveryJob.create({ data: { ...data, createdById: userId } });
  }

  async getJob(id: string) {
    const job = await prisma.remoteDiscoveryJob.findUnique({ where: { id } });
    if (!job) throw new Error('Busca remota não encontrada');
    return { ...job, agentInfo: exposeAgentInfo(job.agentInfo) };
  }

  async claimNext(agentName: string) {
    const pending = await prisma.remoteDiscoveryJob.findFirst({ where: { status: 'PENDING', siteName: agentName }, orderBy: { createdAt: 'asc' } });
    if (!pending) return null;
    return prisma.remoteDiscoveryJob.update({
      where: { id: pending.id },
      data: { status: 'RUNNING', agentName, claimedAt: new Date() },
    });
  }

  async complete(id: string, input: unknown) {
    const data = completeJobSchema.parse(input);
    const status = data.error ? 'FAILED' : 'COMPLETED';
    const protectedInfo = data.agentInfo ? protectAgentInfo(data.agentInfo) : undefined;
    return prisma.remoteDiscoveryJob.update({
      where: { id },
      data: { status, agentName: data.agentName, agentInfo: protectedInfo as Prisma.InputJsonValue | undefined, results: data.devices, error: data.error || null, completedAt: new Date() },
    });
  }
}
