import { AccessoryMovementType, Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from './audit.service';

const prisma = new PrismaClient();
const auditService = new AuditService();
const optionalText = z.string().trim().max(255).optional().nullable().transform((value) => value || null);
const optionalDate = z.string().optional().nullable().transform((value) => value ? new Date(`${value}T00:00:00.000Z`) : null);
const accessoryConditionSchema = z.enum(['NEW', 'USED']).default('NEW');

export const accessorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  quantity: z.coerce.number().int().min(0).default(0),
  minQuantity: z.coerce.number().int().min(0).default(0),
  unit: z.string().trim().min(1).max(20).default('un'),
  condition: accessoryConditionSchema,
  imageUrl: optionalText,
  serialNumber: optionalText,
  partNumber: optionalText,
  bandFrequency: optionalText,
  manufacturer: optionalText,
  model: optionalText,
  location: optionalText,
  companyId: z.string().uuid().optional().nullable(),
  purchasedByCompanyId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  purchaseSupplier: optionalText,
  purchaseInvoiceNumber: optionalText,
  purchaseInvoiceAccessKey: optionalText,
  purchaseDate: optionalDate,
  warrantyExpires: optionalDate,
  purchaseCost: z.coerce.number().nonnegative().optional().nullable(),
  notes: z.string().trim().max(3000).optional().nullable().transform((value) => value || null),
  active: z.boolean().default(true),
});

export const updateAccessorySchema = accessorySchema.partial();
export const accessoryListStatusSchema = z.enum(['ACTIVE', 'TRASH']).default('ACTIVE');

export const movementSchema = z.object({
  type: z.nativeEnum(AccessoryMovementType).default(AccessoryMovementType.OUT),
  quantity: z.coerce.number().int().positive(),
  reason: z.string().trim().max(500).optional().nullable().transform((value) => value || null),
  assetId: z.string().uuid().optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
  balanceId: z.string().uuid().optional().nullable(),
}).superRefine((data, context) => {
  if (data.type === AccessoryMovementType.OUT && !data.userId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['userId'], message: 'Informe quem retirou o item' });
  }
});
export const cancelMovementSchema = z.object({
  password: z.string().min(1, 'Informe sua senha').max(500),
  reason: z.string().trim().min(3, 'Informe o motivo do cancelamento').max(500),
});
export const updateMovementSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable().transform((value) => value || null),
});
export const transferStockSchema = z.object({
  fromBalanceId: z.string().uuid(),
  toCompanyId: z.string().uuid().optional().nullable(),
  toLocation: z.string().trim().max(255).optional().nullable().transform((value) => value || null),
  quantity: z.coerce.number().int().positive(),
});
const movementInclude = {
  accessory: { select: { id: true, name: true, category: true, unit: true } },
  asset: { select: { id: true, name: true, assetTag: true, ipAddress: true } },
  user: { select: { id: true, name: true, email: true } },
  performedBy: { select: { id: true, name: true, email: true } },
  canceledBy: { select: { id: true, name: true, email: true } },
  balance: { select: { id: true, companyId: true, location: true } },
} satisfies Prisma.AccessoryMovementInclude;

const accessoryInclude = {
  company: { select: { id: true, name: true, code: true } },
  purchasedByCompany: { select: { id: true, name: true, code: true } },
  supplier: { select: { id: true, name: true, taxId: true } },
  balances: { include: { company: { select: { id: true, name: true, code: true } } }, orderBy: [{ company: { name: 'asc' as const } }, { location: 'asc' as const }] },
} satisfies Prisma.AccessoryInclude;

export class AccessoryService {
  async findAll(search = '', status: unknown = 'ACTIVE') {
    const selectedStatus = accessoryListStatusSchema.parse(status);
    const where: Prisma.AccessoryWhereInput = { active: selectedStatus === 'ACTIVE' };
    const term = search.trim();
    if (term) {
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { category: { contains: term, mode: 'insensitive' } },
        { condition: { contains: term, mode: 'insensitive' } },
        { serialNumber: { contains: term, mode: 'insensitive' } },
        { partNumber: { contains: term, mode: 'insensitive' } },
        { bandFrequency: { contains: term, mode: 'insensitive' } },
        { manufacturer: { contains: term, mode: 'insensitive' } },
        { model: { contains: term, mode: 'insensitive' } },
        { location: { contains: term, mode: 'insensitive' } },
        { purchaseSupplier: { contains: term, mode: 'insensitive' } },
        { purchaseInvoiceNumber: { contains: term, mode: 'insensitive' } },
        { company: { name: { contains: term, mode: 'insensitive' } } },
        { purchasedByCompany: { name: { contains: term, mode: 'insensitive' } } },
        { supplier: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    return prisma.accessory.findMany({
      where,
      include: accessoryInclude,
      orderBy: [{ active: 'desc' }, { category: 'asc' }, { name: 'asc' }],
    });
  }

  async findMovements(limit = 50) {
    return prisma.accessoryMovement.findMany({
      include: movementInclude,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }

  async findById(id: string) {
    const accessory = await prisma.accessory.findUnique({ where: { id }, include: accessoryInclude });
    if (!accessory) throw new Error('Item de estoque não encontrado');
    return accessory;
  }

  async create(input: unknown) {
    const data = accessorySchema.parse(input);
    return prisma.$transaction(async (tx) => {
      const created = await tx.accessory.create({
        data: { ...data, purchaseCost: data.purchaseCost == null ? null : new Prisma.Decimal(data.purchaseCost) },
      });
      await tx.accessoryStockBalance.create({ data: { accessoryId: created.id, companyId: created.companyId, location: created.location, scopeKey: `${created.companyId || 'NONE'}|${created.location || ''}`, quantity: created.quantity } });
      return tx.accessory.findUniqueOrThrow({ where: { id: created.id }, include: accessoryInclude });
    });
  }

  async update(id: string, input: unknown) {
    const current = await this.findById(id);
    const data = updateAccessorySchema.parse(input);
    const scopeChanged = (data.companyId !== undefined && data.companyId !== current.companyId)
      || (data.location !== undefined && data.location !== current.location);
    if (scopeChanged && current.quantity > 0) throw new Error('Use a opção Transferir para mover o saldo entre empresa ou local');
    return prisma.$transaction(async (tx) => {
      const updated = await tx.accessory.update({
        where: { id },
        data: {
          ...data,
          purchaseCost: data.purchaseCost === undefined ? undefined : data.purchaseCost == null ? null : new Prisma.Decimal(data.purchaseCost),
        },
      });
      if (data.quantity !== undefined && data.quantity !== current.quantity) {
        const primary = await tx.accessoryStockBalance.findFirst({ where: { accessoryId: id }, orderBy: { createdAt: 'asc' } });
        if (primary) await tx.accessoryStockBalance.update({ where: { id: primary.id }, data: { quantity: { increment: data.quantity - current.quantity } } });
      }
      if ((data.companyId !== undefined || data.location !== undefined) && updated.quantity === 0) {
        const balances = await tx.accessoryStockBalance.findMany({ where: { accessoryId: id } });
        if (balances.length === 1) await tx.accessoryStockBalance.update({ where: { id: balances[0].id }, data: { companyId: updated.companyId, location: updated.location, scopeKey: `${updated.companyId || 'NONE'}|${updated.location || ''}` } });
      }
      return tx.accessory.findUniqueOrThrow({ where: { id }, include: accessoryInclude });
    });
  }

  async updateImage(id: string, imageUrl: string | null) {
    await this.findById(id);
    return prisma.accessory.update({
      where: { id },
      data: { imageUrl },
      include: accessoryInclude,
    });
  }

  async findImageFilenames() {
    const items = await prisma.accessory.findMany({
      where: { imageUrl: { not: null } },
      select: { imageUrl: true },
    });
    return items
      .map((item) => item.imageUrl?.split('/').pop())
      .filter((filename): filename is string => Boolean(filename));
  }

  async move(id: string, input: unknown, performedById: string) {
    const accessory = await this.findById(id);
    if (!accessory.active) throw new Error('Restaure o item da lixeira antes de movimentá-lo');
    const data = movementSchema.parse(input);
    const delta = data.type === AccessoryMovementType.OUT ? -data.quantity : data.quantity;

    if (data.type === AccessoryMovementType.OUT && accessory.quantity < data.quantity) {
      throw new Error('Quantidade insuficiente em estoque');
    }

    if (data.assetId) {
      const asset = await prisma.asset.findUnique({ where: { id: data.assetId } });
      if (!asset) throw new Error('Ativo não encontrado');
    }

    if (data.userId) {
      const user = await prisma.user.findFirst({ where: { id: data.userId, active: true } });
      if (!user) throw new Error('Usuário não encontrado ou inativo');
    }

    return prisma.$transaction(async (tx) => {
      const selectedBalance = data.balanceId
        ? await tx.accessoryStockBalance.findFirst({ where: { id: data.balanceId, accessoryId: id } })
        : await tx.accessoryStockBalance.findFirst({ where: { accessoryId: id, ...(data.type === AccessoryMovementType.OUT ? { quantity: { gte: data.quantity } } : {}) }, orderBy: { createdAt: 'asc' } });
      if (data.type === AccessoryMovementType.OUT && !selectedBalance) throw new Error('Nenhum saldo por empresa/local possui quantidade suficiente');
      const primaryBalance = selectedBalance || await tx.accessoryStockBalance.upsert({ where: { accessoryId_scopeKey: { accessoryId: id, scopeKey: `${accessory.companyId || 'NONE'}|${accessory.location || ''}` } }, create: { accessoryId: id, companyId: accessory.companyId, location: accessory.location, scopeKey: `${accessory.companyId || 'NONE'}|${accessory.location || ''}`, quantity: 0 }, update: {} });
      const balanceDelta = data.type === AccessoryMovementType.ADJUSTMENT ? data.quantity - primaryBalance.quantity : delta;
      if (primaryBalance.quantity + balanceDelta < 0) throw new Error('Quantidade insuficiente neste saldo por empresa/local');
      await tx.accessoryStockBalance.update({ where: { id: primaryBalance.id }, data: { quantity: { increment: balanceDelta } } });
      const updatedAccessory = await tx.accessory.update({ where: { id }, data: { quantity: { increment: balanceDelta } }, include: accessoryInclude });

      const movement = await tx.accessoryMovement.create({
        data: {
          accessoryId: id,
          type: data.type,
          quantity: data.quantity,
          reason: data.reason,
          assetId: data.assetId || null,
          userId: data.userId || null,
          performedById,
          balanceId: primaryBalance.id,
        },
        include: movementInclude,
      });

      return { accessory: updatedAccessory, movement };
    });
  }

  async cancelMovement(movementId: string, input: unknown, performedById: string) {
    const data = cancelMovementSchema.parse(input);
    await auditService.verifyPassword(performedById, data.password);

    return prisma.$transaction(async (tx) => {
      const movement = await tx.accessoryMovement.findUnique({
        where: { id: movementId },
        include: movementInclude,
      });
      if (!movement) throw new Error('MOVEMENT_NOT_FOUND');
      if (movement.type !== AccessoryMovementType.OUT) throw new Error('MOVEMENT_NOT_OUT');
      if (movement.reason?.trim().toLowerCase().startsWith('descarte')) throw new Error('MOVEMENT_DISPOSAL');

      const cancellation = await tx.accessoryMovement.updateMany({
        where: { id: movementId, canceledAt: null },
        data: { canceledAt: new Date(), canceledById: performedById, cancellationReason: data.reason },
      });
      if (!cancellation.count) throw new Error('MOVEMENT_ALREADY_CANCELED');

      const accessory = await tx.accessory.update({
        where: { id: movement.accessoryId },
        data: { quantity: { increment: movement.quantity } },
        include: accessoryInclude,
      });
      if (movement.balanceId) await tx.accessoryStockBalance.update({ where: { id: movement.balanceId }, data: { quantity: { increment: movement.quantity } } });
      const canceledMovement = await tx.accessoryMovement.findUniqueOrThrow({
        where: { id: movementId },
        include: movementInclude,
      });
      await tx.auditLog.create({
        data: {
          action: 'CANCEL_ACCESSORY_MOVEMENT',
          resourceType: 'AccessoryMovement',
          resourceId: movementId,
          resourceName: movement.accessory.name,
          changedFields: ['canceledAt', 'canceledById', 'cancellationReason', 'quantity'],
          details: {
            movementType: movement.type,
            restoredQuantity: movement.quantity,
            unit: movement.accessory.unit,
            originalPerformedBy: movement.performedBy.name,
            originalCreatedAt: movement.createdAt.toISOString(),
            reason: data.reason,
          },
          performedById,
        },
      });

      return { accessory, movement: canceledMovement };
    });
  }

  async updateMovement(movementId: string, input: unknown, performedById: string) {
    const data = updateMovementSchema.parse(input);
    const movement = await prisma.accessoryMovement.findUnique({
      where: { id: movementId },
      include: movementInclude,
    });
    if (!movement) throw new Error('MOVEMENT_NOT_FOUND');

    const updated = await prisma.accessoryMovement.update({
      where: { id: movementId },
      data: { reason: data.reason },
      include: movementInclude,
    });

    await auditService.record({
      action: 'UPDATE_ACCESSORY_MOVEMENT',
      resourceType: 'AccessoryMovement',
      resourceId: movementId,
      resourceName: movement.accessory.name,
      changedFields: ['reason'],
      details: {
        before: { reason: movement.reason },
        after: { reason: updated.reason },
      },
      performedById,
    });

    return updated;
  }

  async transfer(id: string, input: unknown, performedById: string) {
    const data = transferStockSchema.parse(input);
    const destinationKey = `${data.toCompanyId || 'NONE'}|${data.toLocation || ''}`;
    return prisma.$transaction(async (tx) => {
      const source = await tx.accessoryStockBalance.findFirst({ where: { id: data.fromBalanceId, accessoryId: id } });
      if (!source) throw new Error('Saldo de origem não encontrado');
      if (source.quantity < data.quantity) throw new Error('Quantidade insuficiente no local de origem');
      const destination = await tx.accessoryStockBalance.upsert({
        where: { accessoryId_scopeKey: { accessoryId: id, scopeKey: destinationKey } },
        create: { accessoryId: id, companyId: data.toCompanyId || null, location: data.toLocation, scopeKey: destinationKey, quantity: 0 },
        update: {},
      });
      if (destination.id === source.id) throw new Error('Origem e destino são iguais');
      await tx.accessoryStockBalance.update({ where: { id: source.id }, data: { quantity: { decrement: data.quantity } } });
      await tx.accessoryStockBalance.update({ where: { id: destination.id }, data: { quantity: { increment: data.quantity } } });
      await tx.auditLog.create({ data: { action: 'TRANSFER_STOCK', resourceType: 'ACCESSORY', resourceId: id, resourceName: (await tx.accessory.findUniqueOrThrow({ where: { id }, select: { name: true } })).name, performedById, details: { quantity: data.quantity, fromBalanceId: source.id, toBalanceId: destination.id, toCompanyId: data.toCompanyId, toLocation: data.toLocation } } });
      return tx.accessory.findUniqueOrThrow({ where: { id }, include: accessoryInclude });
    });
  }

  async delete(id: string) {
    await this.findById(id);
    await prisma.accessory.update({ where: { id }, data: { active: false } });
  }

  async restore(id: string, performedById: string) {
    const accessory = await this.findById(id);
    if (accessory.active) return accessory;
    return prisma.$transaction(async (tx) => {
      const restored = await tx.accessory.update({ where: { id }, data: { active: true } });
      await tx.auditLog.create({
        data: {
          action: 'RESTORE', resourceType: 'ACCESSORY', resourceId: id,
          resourceName: accessory.name, changedFields: ['active'],
          details: { restoredFromTrash: true }, performedById,
        },
      });
      return restored;
    });
  }
}
