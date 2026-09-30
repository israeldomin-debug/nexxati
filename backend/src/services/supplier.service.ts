import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const nullableText = z.string().trim().max(255).optional().nullable().transform((value) => value || null);

export const supplierSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do fornecedor').max(120),
  legalName: nullableText,
  taxId: nullableText,
  email: z.string().trim().email().optional().nullable().or(z.literal('')).transform((value) => value || null),
  phone: nullableText,
  contactName: nullableText,
  category: nullableText,
  website: nullableText,
  address: z.string().trim().max(500).optional().nullable().transform((value) => value || null),
  notes: z.string().trim().max(3000).optional().nullable().transform((value) => value || null),
  active: z.boolean().default(true),
});

export const updateSupplierSchema = supplierSchema.partial();

const supplierInclude = {
  _count: { select: { assets: true, accessories: true, softwareLicenses: true } },
} satisfies Prisma.SupplierInclude;

export class SupplierService {
  async findAll(search = '') {
    const term = search.trim();
    const where: Prisma.SupplierWhereInput = term ? {
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { legalName: { contains: term, mode: 'insensitive' } },
        { taxId: { contains: term, mode: 'insensitive' } },
        { contactName: { contains: term, mode: 'insensitive' } },
        { category: { contains: term, mode: 'insensitive' } },
      ],
    } : {};

    return prisma.supplier.findMany({
      where,
      include: supplierInclude,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async findById(id: string) {
    const supplier = await prisma.supplier.findUnique({ where: { id }, include: supplierInclude });
    if (!supplier) throw new Error('Fornecedor não encontrado');
    return supplier;
  }

  async create(input: unknown) {
    return prisma.supplier.create({ data: supplierSchema.parse(input), include: supplierInclude });
  }

  async update(id: string, input: unknown) {
    await this.findById(id);
    return prisma.supplier.update({ where: { id }, data: updateSupplierSchema.parse(input), include: supplierInclude });
  }

  async delete(id: string) {
    const supplier = await this.findById(id);
    if (supplier._count.assets || supplier._count.accessories || supplier._count.softwareLicenses) {
      return prisma.supplier.update({ where: { id }, data: { active: false } });
    }
    await prisma.supplier.update({ where: { id }, data: { active: false } });
  }
}
