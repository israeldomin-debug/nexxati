import { MaintenanceRecordStatus, Prisma, PrismaClient, PurchaseRequestStatus } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();
const text = (max = 3000) => z.string().trim().max(max).optional().nullable().transform((value) => value || null);
const dateValue = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
const openPurchaseStatuses: PurchaseRequestStatus[] = ['REQUESTED', 'QUOTING', 'APPROVED', 'ORDERED'];

const termSchema = z.object({
  type: z.enum(['DELIVERY', 'RETURN']),
  responsibleUserId: z.string().uuid(),
  assetIds: z.array(z.string().uuid()).min(1, 'Selecione ao menos um ativo'),
  accessoryItems: z.array(z.object({ name: z.string().trim().min(1).max(120), quantity: z.number().int().min(1), serialNumber: text(120) })).default([]),
  notes: text(),
});

const maintenanceSchema = z.object({
  assetId: z.string().uuid(),
  scheduledAt: z.string().min(10),
  checklist: z.array(z.object({ label: z.string().trim().min(1).max(160), done: z.boolean().default(false) })).default([]),
  workPerformed: text(5000),
  partsUsed: text(3000),
  cost: z.number().min(0).optional().nullable(),
  nextMaintenanceAt: z.string().optional().nullable(),
  parts: z.array(z.object({ accessoryId: z.string().uuid(), quantity: z.number().int().min(1) })).default([]),
});

const maintenanceUpdateSchema = maintenanceSchema.partial().extend({
  status: z.nativeEnum(MaintenanceRecordStatus).optional(),
});

const articleSchema = z.object({
  title: z.string().trim().min(3).max(180),
  category: z.string().trim().min(2).max(80),
  problem: z.string().trim().min(5).max(10000),
  solution: z.string().trim().min(5).max(20000),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  ticketId: z.string().uuid().optional().nullable(),
  published: z.boolean().default(true),
});

const purchaseSchema = z.object({
  accessoryId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  itemName: z.string().trim().min(2).max(180),
  requestedQuantity: z.number().int().min(1),
  unit: z.string().trim().min(1).max(30).default('un'),
  estimatedUnitCost: z.number().min(0).optional().nullable(),
  notes: text(),
});

const purchaseUpdateSchema = z.object({
  status: z.nativeEnum(PurchaseRequestStatus).optional(),
  supplierId: z.string().uuid().optional().nullable(),
  estimatedUnitCost: z.number().min(0).optional().nullable(),
  notes: text(),
});

const termInclude = {
  responsibleUser: { select: { id: true, name: true, email: true, company: { select: { name: true } } } },
  createdBy: { select: { id: true, name: true } },
  assets: { include: { asset: { select: { id: true, name: true, assetTag: true, serialNumber: true, manufacturer: true, model: true, type: true } } } },
} satisfies Prisma.CustodyTermInclude;

export class ManagementService {
  private async audit(action: string, resourceType: string, resourceId: string | null, resourceName: string, userId: string, details?: Prisma.InputJsonValue) {
    await prisma.auditLog.create({ data: { action, resourceType, resourceId, resourceName, performedById: userId, details } });
  }

  async overview() {
    const now = new Date();
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const inThirtyDays = new Date(today.getTime() + 30 * 86_400_000);
    const agentOnlineSince = new Date(now.getTime() - 5 * 60_000);
    const incompleteWhere: Prisma.AssetWhereInput = { status: { notIn: ['RETIRED', 'DONOR'] }, OR: [{ companyId: null }, { location: null }, { location: '' }] };
    const [agents, accessories, warranties, warrantyCount, maintenance, maintenanceCount, assetsIncomplete, incompleteAssetCount, licenses, purchasePending, duplicateHostnames, networkIps, knownAssets, stockBalances, overdueTickets] = await Promise.all([
      prisma.remoteDiscoveryAgent.findMany({ orderBy: { lastSeenAt: 'asc' }, select: { id: true, agentName: true, computerName: true, lastSeenAt: true, agentInfo: true } }),
      prisma.accessory.findMany({ where: { active: true }, select: { id: true, name: true, quantity: true, minQuantity: true, unit: true } }),
      prisma.asset.findMany({ where: { warrantyExpires: { gte: today, lte: inThirtyDays }, status: { notIn: ['RETIRED', 'DONOR'] } }, select: { id: true, name: true, assetTag: true, warrantyExpires: true }, orderBy: { warrantyExpires: 'asc' }, take: 20 }),
      prisma.asset.count({ where: { warrantyExpires: { gte: today, lte: inThirtyDays }, status: { notIn: ['RETIRED', 'DONOR'] } } }),
      prisma.asset.findMany({ where: { nextMaintenanceAt: { lt: today }, status: { notIn: ['RETIRED', 'DONOR'] } }, select: { id: true, name: true, assetTag: true, nextMaintenanceAt: true }, orderBy: { nextMaintenanceAt: 'asc' }, take: 20 }),
      prisma.asset.count({ where: { nextMaintenanceAt: { lt: today }, status: { notIn: ['RETIRED', 'DONOR'] } } }),
      prisma.asset.findMany({ where: incompleteWhere, select: { id: true, name: true, assetTag: true, companyId: true, location: true }, orderBy: { updatedAt: 'desc' }, take: 20 }),
      prisma.asset.count({ where: incompleteWhere }),
      prisma.softwareLicense.findMany({ select: { id: true, softwareName: true, licenseNumber: true, seats: true, _count: { select: { assets: true } } } }),
      prisma.purchaseRequest.findMany({ where: { status: { in: openPurchaseStatuses } }, select: { id: true, itemName: true, requestedQuantity: true, unit: true, status: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.asset.groupBy({ by: ['hostname'], where: { hostname: { not: null }, status: { notIn: ['RETIRED', 'DONOR'] } }, _count: { hostname: true }, having: { hostname: { _count: { gt: 1 } } }, orderBy: { _count: { hostname: 'desc' } }, take: 20 }),
      prisma.networkIpAddress.findMany({ where: { active: true, assetId: { not: null } }, select: { id: true, ipAddress: true, assetId: true, networkSegment: { select: { name: true } } }, take: 500 }),
      prisma.asset.findMany({ select: { id: true }, take: 5000 }),
      prisma.accessory.findMany({ where: { active: true }, select: { id: true, name: true, quantity: true, balances: { select: { quantity: true } } } }),
      prisma.ticket.findMany({ where: { dueAt: { lt: now }, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, select: { id: true, title: true, priority: true, dueAt: true }, orderBy: { dueAt: 'asc' }, take: 20 }),
    ]);
    const offlineAgents = agents.filter((agent) => agent.lastSeenAt < agentOnlineSince).map((agent) => ({ ...agent, minutesOffline: Math.floor((now.getTime() - agent.lastSeenAt.getTime()) / 60_000) }));
    const lowStock = accessories.filter((item) => item.minQuantity > 0 && item.quantity <= item.minQuantity);
    const licenseIssues = licenses.filter((license) => license._count.assets === 0 || license._count.assets > license.seats);
    const assetIds = new Set(knownAssets.map((asset) => asset.id));
    const orphanIps = networkIps.filter((item) => item.assetId && !assetIds.has(item.assetId));
    const stockMismatches = stockBalances.filter((item) => item.balances.reduce((total, balance) => total + balance.quantity, 0) !== item.quantity).map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, balanceQuantity: item.balances.reduce((total, balance) => total + balance.quantity, 0) }));
    return {
      counts: { offlineAgents: offlineAgents.length, lowStock: lowStock.length, warranties: warrantyCount, maintenance: maintenanceCount, incompleteAssets: incompleteAssetCount, licenseIssues: licenseIssues.length, purchasePending: purchasePending.length, duplicateHostnames: duplicateHostnames.length, orphanIps: orphanIps.length, stockMismatches: stockMismatches.length, overdueTickets: overdueTickets.length },
      offlineAgents, lowStock, warranties, maintenance, incompleteAssets: assetsIncomplete, licenseIssues, purchasePending, duplicateHostnames, orphanIps, stockMismatches, overdueTickets,
    };
  }

  async agents() {
    const onlineSince = new Date(Date.now() - 5 * 60_000);
    const agents = await prisma.remoteDiscoveryAgent.findMany({ orderBy: { lastSeenAt: 'desc' } });
    return agents.map((agent) => {
      const info = agent.agentInfo as Record<string, unknown>;
      return { ...agent, online: agent.lastSeenAt >= onlineSince, minutesSinceLastSeen: Math.max(0, Math.floor((Date.now() - agent.lastSeenAt.getTime()) / 60_000)), version: typeof info.agentVersion === 'string' ? info.agentVersion : null };
    });
  }

  async deleteAgent(id: string, userId: string) {
    const agent = await prisma.remoteDiscoveryAgent.delete({ where: { id } });
    await this.audit('DELETED', 'REMOTE_AGENT', id, agent.computerName, userId, { agentName: agent.agentName });
  }

  async terms() {
    return prisma.custodyTerm.findMany({ include: termInclude, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async createTerm(input: unknown, createdById: string) {
    const data = termSchema.parse(input);
    const number = `TR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const term = await prisma.$transaction(async (tx) => {
      const created = await tx.custodyTerm.create({
        data: { number, type: data.type, responsibleUserId: data.responsibleUserId, createdById, accessoryItems: data.accessoryItems, notes: data.notes, assets: { create: data.assetIds.map((assetId) => ({ assetId })) } },
        include: termInclude,
      });
      await tx.asset.updateMany({
        where: { id: { in: data.assetIds } },
        data: data.type === 'DELIVERY' ? { assignedToId: data.responsibleUserId, status: 'ASSIGNED' } : { assignedToId: null, status: 'AVAILABLE' },
      });
      await tx.assetHistory.createMany({ data: data.assetIds.map((assetId) => ({ assetId, action: data.type === 'DELIVERY' ? 'ASSIGNED' : 'RETURNED', description: `${data.type === 'DELIVERY' ? 'Entrega' : 'Devolução'} registrada pelo termo ${number}`, performedById: createdById })) });
      return created;
    });
    await this.audit('CREATED', 'CUSTODY_TERM', term.id, term.number, createdById, { type: term.type, responsibleUserId: term.responsibleUserId });
    return term;
  }

  async signTerm(id: string, signedByName: string, userId: string) {
    const term = await prisma.custodyTerm.update({ where: { id }, data: { status: 'SIGNED', signedByName: z.string().trim().min(2).max(120).parse(signedByName), signedAt: new Date() }, include: termInclude });
    await this.audit('SIGNED', 'CUSTODY_TERM', term.id, term.number, userId, { signedByName: term.signedByName });
    return term;
  }

  async maintenance() {
    return prisma.maintenanceRecord.findMany({ include: { asset: { select: { id: true, name: true, assetTag: true, type: true } }, createdBy: { select: { name: true } }, completedBy: { select: { name: true } }, parts: { include: { accessory: { select: { id: true, name: true, unit: true } } } } }, orderBy: [{ status: 'asc' }, { scheduledAt: 'asc' }], take: 300 });
  }

  async createMaintenance(input: unknown, createdById: string) {
    const data = maintenanceSchema.parse(input);
    const { parts: _parts, ...recordData } = data;
    const record = await prisma.maintenanceRecord.create({ data: { ...recordData, scheduledAt: dateValue(data.scheduledAt), nextMaintenanceAt: data.nextMaintenanceAt ? dateValue(data.nextMaintenanceAt) : null, checklist: data.checklist, createdById }, include: { asset: true } });
    await this.audit('CREATED', 'MAINTENANCE', record.id, record.asset.name, createdById, { scheduledAt: record.scheduledAt.toISOString() });
    return record;
  }

  async updateMaintenance(id: string, input: unknown, userId: string) {
    const parsed = maintenanceUpdateSchema.parse(input);
    const current = await prisma.maintenanceRecord.findUniqueOrThrow({ where: { id }, include: { asset: { select: { assignedToId: true } } } });
    const { parts = [], ...recordChanges } = parsed;
    const data: Prisma.MaintenanceRecordUpdateInput = {
      ...recordChanges,
      scheduledAt: recordChanges.scheduledAt ? dateValue(recordChanges.scheduledAt) : undefined,
      nextMaintenanceAt: recordChanges.nextMaintenanceAt ? dateValue(recordChanges.nextMaintenanceAt) : recordChanges.nextMaintenanceAt === null ? null : undefined,
      checklist: recordChanges.checklist,
      completedAt: recordChanges.status === 'COMPLETED' ? new Date() : undefined,
      completedBy: recordChanges.status === 'COMPLETED' ? { connect: { id: userId } } : undefined,
    };
    delete (data as Record<string, unknown>).assetId;
    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.maintenanceRecord.update({ where: { id }, data, include: { asset: true } });
      if (parsed.status === 'COMPLETED' && current.status !== 'COMPLETED') {
        for (const part of parts) {
          const accessory = await tx.accessory.findUniqueOrThrow({ where: { id: part.accessoryId } });
          const balance = await tx.accessoryStockBalance.findFirst({ where: { accessoryId: accessory.id, quantity: { gte: part.quantity } }, orderBy: { createdAt: 'asc' } });
          if (!balance) throw new Error(`Nenhum saldo por empresa/local possui quantidade suficiente para ${accessory.name}`);
          const changed = await tx.accessory.updateMany({ where: { id: accessory.id, active: true, quantity: { gte: part.quantity } }, data: { quantity: { decrement: part.quantity } } });
          if (!changed.count) throw new Error(`Estoque insuficiente para ${accessory.name}`);
          await tx.accessoryStockBalance.update({ where: { id: balance.id }, data: { quantity: { decrement: part.quantity } } });
          const movement = await tx.accessoryMovement.create({ data: { accessoryId: accessory.id, type: 'OUT', quantity: part.quantity, reason: `Peça aplicada na manutenção de ${record.asset.name}`, assetId: record.assetId, userId: current.asset.assignedToId, performedById: userId, balanceId: balance.id } });
          await tx.maintenancePart.create({ data: { maintenanceId: id, accessoryId: accessory.id, quantity: part.quantity, movementId: movement.id } });
        }
        await tx.asset.update({ where: { id: record.assetId }, data: { nextMaintenanceAt: record.nextMaintenanceAt } });
        await tx.assetHistory.create({ data: { assetId: record.assetId, action: 'UPDATED', description: `Manutenção concluída: ${record.workPerformed || 'serviço preventivo realizado'}`, performedById: userId } });
      }
      return record;
    });
    await this.audit(parsed.status === 'COMPLETED' ? 'COMPLETED' : 'UPDATED', 'MAINTENANCE', updated.id, updated.asset.name, userId, { status: updated.status });
    return updated;
  }

  async knowledge(search = '') {
    return prisma.knowledgeArticle.findMany({ where: search ? { OR: [{ title: { contains: search, mode: 'insensitive' } }, { problem: { contains: search, mode: 'insensitive' } }, { solution: { contains: search, mode: 'insensitive' } }, { tags: { has: search } }] } : {}, include: { createdBy: { select: { name: true } }, ticket: { select: { id: true, title: true } } }, orderBy: { updatedAt: 'desc' }, take: 300 });
  }

  async createArticle(input: unknown, createdById: string) {
    const article = await prisma.knowledgeArticle.create({ data: { ...articleSchema.parse(input), createdById }, include: { createdBy: { select: { name: true } }, ticket: { select: { id: true, title: true } } } });
    await this.audit('CREATED', 'KNOWLEDGE_ARTICLE', article.id, article.title, createdById, { category: article.category, ticketId: article.ticketId });
    return article;
  }

  async updateArticle(id: string, input: unknown, userId: string) {
    const article = await prisma.knowledgeArticle.update({ where: { id }, data: articleSchema.partial().parse(input), include: { createdBy: { select: { name: true } }, ticket: { select: { id: true, title: true } } } });
    await this.audit('UPDATED', 'KNOWLEDGE_ARTICLE', article.id, article.title, userId);
    return article;
  }

  async purchases() {
    return prisma.purchaseRequest.findMany({ include: { accessory: { select: { id: true, quantity: true, minQuantity: true } }, supplier: { select: { id: true, name: true } }, requestedBy: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 300 });
  }

  async createPurchase(input: unknown, requestedById: string) {
    const request = await prisma.purchaseRequest.create({ data: { ...purchaseSchema.parse(input), requestedById }, include: { supplier: true, accessory: true } });
    await this.audit('CREATED', 'PURCHASE_REQUEST', request.id, request.itemName, requestedById, { requestedQuantity: request.requestedQuantity });
    return request;
  }

  async generatePurchases(requestedById: string) {
    const [accessories, existing] = await Promise.all([
      prisma.accessory.findMany({ where: { active: true } }),
      prisma.purchaseRequest.findMany({ where: { status: { in: openPurchaseStatuses }, accessoryId: { not: null } }, select: { accessoryId: true } }),
    ]);
    const existingIds = new Set(existing.map((item) => item.accessoryId));
    const candidates = accessories.filter((item) => item.minQuantity > 0 && item.quantity <= item.minQuantity && !existingIds.has(item.id));
    if (candidates.length) await prisma.purchaseRequest.createMany({ data: candidates.map((item) => ({ accessoryId: item.id, supplierId: item.supplierId, itemName: item.name, requestedQuantity: Math.max(1, item.minQuantity - item.quantity), unit: item.unit, requestedById, notes: `Gerado automaticamente: estoque atual ${item.quantity}, mínimo ${item.minQuantity}.` })) });
    if (candidates.length) await this.audit('GENERATED', 'PURCHASE_REQUEST', null, `${candidates.length} solicitações automáticas`, requestedById, { accessoryIds: candidates.map((item) => item.id) });
    return { created: candidates.length };
  }

  async updatePurchase(id: string, input: unknown, userId: string) {
    const current = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id } });
    const parsed = purchaseUpdateSchema.parse(input);
    if (parsed.status === 'RECEIVED' && current.status !== 'RECEIVED' && current.accessoryId) {
      const received = await prisma.$transaction(async (tx) => {
        const updated = await tx.purchaseRequest.update({ where: { id }, data: { ...parsed, receivedAt: new Date() } });
        await tx.accessory.update({ where: { id: current.accessoryId! }, data: { quantity: { increment: current.requestedQuantity } } });
        const accessory = await tx.accessory.findUniqueOrThrow({ where: { id: current.accessoryId! } });
        const balance = await tx.accessoryStockBalance.upsert({ where: { accessoryId_scopeKey: { accessoryId: accessory.id, scopeKey: `${accessory.companyId || 'NONE'}|${accessory.location || ''}` } }, create: { accessoryId: accessory.id, companyId: accessory.companyId, location: accessory.location, scopeKey: `${accessory.companyId || 'NONE'}|${accessory.location || ''}`, quantity: 0 }, update: {} });
        await tx.accessoryStockBalance.update({ where: { id: balance.id }, data: { quantity: { increment: current.requestedQuantity } } });
        await tx.accessoryMovement.create({ data: { accessoryId: current.accessoryId!, type: 'IN', quantity: current.requestedQuantity, reason: `Recebimento da solicitação de compra ${id.slice(0, 8)}`, performedById: userId, balanceId: balance.id } });
        return updated;
      });
      await this.audit('RECEIVED', 'PURCHASE_REQUEST', received.id, received.itemName, userId, { quantity: received.requestedQuantity, accessoryId: received.accessoryId });
      return received;
    }
    const updated = await prisma.purchaseRequest.update({ where: { id }, data: parsed });
    await this.audit('UPDATED', 'PURCHASE_REQUEST', updated.id, updated.itemName, userId, { status: updated.status });
    return updated;
  }
}
