import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const nullableText = z.string().trim().max(255).optional().nullable().transform((value) => value || null);

export const createCompanySchema = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: nullableText,
  code: z.string().trim().min(2).max(20).transform((value) => value.toUpperCase()),
  taxId: nullableText,
  email: z.string().trim().email().optional().nullable().or(z.literal('')).transform((value) => value || null),
  phone: nullableText,
  address: z.string().trim().max(500).optional().nullable().transform((value) => value || null),
  active: z.boolean().default(true),
});

export const updateCompanySchema = createCompanySchema.partial();

export class CompanyService {
  async findAll(search?: string) {
    const where: Prisma.CompanyWhereInput = search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { legalName: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { taxId: { contains: search, mode: 'insensitive' } },
      ],
    } : {};

    return prisma.company.findMany({
      where,
      include: { _count: { select: { assets: true, users: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const company = await prisma.company.findUnique({
      where: { id },
      include: { _count: { select: { assets: true, users: true } } },
    });
    if (!company) throw new Error('Empresa não encontrada');
    return company;
  }

  async create(input: unknown) {
    return prisma.company.create({ data: createCompanySchema.parse(input) });
  }

  async update(id: string, input: unknown) {
    await this.findById(id);
    return prisma.company.update({ where: { id }, data: updateCompanySchema.parse(input) });
  }

  async delete(id: string) {
    const company = await this.findById(id);
    if (company._count.assets || company._count.users) {
      return prisma.company.update({ where: { id }, data: { active: false } });
    }
    await prisma.company.update({ where: { id }, data: { active: false } });
  }
}
