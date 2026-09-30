import { AccessoryMovementType, AssetHistoryAction, AssetStatus, Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const optionalText = z.preprocess((value) => value === '' ? null : value, z.string().trim().max(255).nullable().optional());
const optionalDate = z.preprocess((value) => value === '' ? undefined : value, z.string().optional());

const disposalSchema = z.object({
  assetId: z.preprocess((value) => value === '' ? null : value, z.string().uuid().nullable().optional()),
  accessoryId: z.preprocess((value) => value === '' ? null : value, z.string().uuid().nullable().optional()),
  itemName: z.string().trim().max(120).optional(),
  category: optionalText,
  assetTag: optionalText,
  serialNumber: optionalText,
  quantity: z.coerce.number().int().min(1).default(1),
  reason: optionalText,
  destination: optionalText,
  disposalDate: optionalDate,
  notes: z.preprocess((value) => value === '' ? null : value, z.string().trim().max(3000).nullable().optional()),
}).refine((data) => data.assetId || data.accessoryId || data.itemName?.trim(), {
  message: 'Selecione um ativo, um item de estoque ou informe manualmente o item descartado',
  path: ['itemName'],
});

const disposalInclude = {
  asset: { select: { id: true, assetTag: true, name: true, category: true, type: true, serialNumber: true, status: true } },
  accessory: { select: { id: true, name: true, category: true, unit: true, quantity: true, condition: true, serialNumber: true, partNumber: true } },
  performedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.DisposalItemInclude;

export class DisposalService {
  async findAll(search = '') {
    const normalized = search.trim();
    const where: Prisma.DisposalItemWhereInput = normalized ? {
      OR: [
        { itemName: { contains: normalized, mode: 'insensitive' } },
        { category: { contains: normalized, mode: 'insensitive' } },
        { assetTag: { contains: normalized, mode: 'insensitive' } },
        { serialNumber: { contains: normalized, mode: 'insensitive' } },
        { reason: { contains: normalized, mode: 'insensitive' } },
        { destination: { contains: normalized, mode: 'insensitive' } },
        { asset: { name: { contains: normalized, mode: 'insensitive' } } },
        { accessory: { name: { contains: normalized, mode: 'insensitive' } } },
      ],
    } : {};

    return prisma.disposalItem.findMany({
      where,
      include: disposalInclude,
      orderBy: [{ disposalDate: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
  }

  async create(input: unknown, performedById: string) {
    const data = disposalSchema.parse(input);
    const asset = data.assetId
      ? await prisma.asset.findUnique({ where: { id: data.assetId } })
      : null;
    const accessory = data.accessoryId
      ? await prisma.accessory.findUnique({ where: { id: data.accessoryId } })
      : null;

    if (data.assetId && !asset) throw new Error('Ativo não encontrado');
    if (data.accessoryId && !accessory) throw new Error('Item de estoque não encontrado');
    if (accessory && accessory.quantity < data.quantity) throw new Error(`Quantidade insuficiente em estoque. Disponível: ${accessory.quantity}`);

    const disposalDate = data.disposalDate ? new Date(`${data.disposalDate}T00:00:00.000Z`) : new Date();
    const itemName = asset?.name || accessory?.name || data.itemName!.trim();
    const category = asset?.category || accessory?.category || data.category || null;
    const assetTag = asset?.assetTag || data.assetTag || null;
    const serialNumber = asset?.serialNumber || accessory?.serialNumber || data.serialNumber || null;

    return prisma.$transaction(async (tx) => {
      const disposal = await tx.disposalItem.create({
        data: {
          assetId: asset?.id || null,
          accessoryId: accessory?.id || null,
          itemName,
          category,
          assetTag,
          serialNumber,
          quantity: data.quantity,
          reason: data.reason || null,
          destination: data.destination || null,
          disposalDate,
          notes: data.notes || null,
          performedById,
        },
        include: disposalInclude,
      });

      if (asset) {
        const peripherals = await tx.asset.findMany({
          where: { parentAssetId: asset.id, status: { notIn: [AssetStatus.RETIRED, AssetStatus.DONOR] } },
          select: { id: true },
        });
        await tx.asset.update({
          where: { id: asset.id },
          data: {
            status: AssetStatus.RETIRED,
            assignedToId: null,
            history: {
              create: {
                action: AssetHistoryAction.RETIRED,
                description: `Enviado para descarte${data.reason ? `: ${data.reason}` : ''}`,
                performedById,
              },
            },
          },
        });
        if (peripherals.length) {
          await tx.asset.updateMany({
            where: { id: { in: peripherals.map((item) => item.id) } },
            data: { parentAssetId: null, assignedToId: null, status: AssetStatus.AVAILABLE },
          });
          await tx.assetHistory.createMany({
            data: peripherals.map((item) => ({
              assetId: item.id,
              action: AssetHistoryAction.RETURNED,
              description: `Desvinculado e disponibilizado porque o equipamento principal ${asset.name} foi enviado para descarte`,
              performedById,
            })),
          });
        }
      }

      if (accessory) {
        const balance = await tx.accessoryStockBalance.findFirst({ where: { accessoryId: accessory.id, quantity: { gte: data.quantity } }, orderBy: { createdAt: 'asc' } });
        if (!balance) throw new Error('Nenhum saldo por empresa/local possui quantidade suficiente para o descarte');
        await tx.accessory.update({
          where: { id: accessory.id },
          data: { quantity: { decrement: data.quantity } },
        });
        await tx.accessoryStockBalance.update({ where: { id: balance.id }, data: { quantity: { decrement: data.quantity } } });
        await tx.accessoryMovement.create({
          data: {
            accessoryId: accessory.id,
            type: AccessoryMovementType.OUT,
            quantity: data.quantity,
            reason: `Descarte${data.reason ? `: ${data.reason}` : ''}`,
            performedById,
            balanceId: balance.id,
          },
        });
      }

      return disposal;
    });
  }

  async delete(id: string) {
    await prisma.disposalItem.delete({ where: { id } });
  }
}
