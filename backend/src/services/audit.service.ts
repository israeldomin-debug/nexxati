import bcrypt from 'bcryptjs';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class AuditService {
  async verifyPassword(userId: string, password: unknown) {
    if (typeof password !== 'string' || !password.trim()) throw new Error('DELETE_PASSWORD_REQUIRED');
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true, active: true } });
    if (!user?.active || !await bcrypt.compare(password, user.passwordHash)) throw new Error('DELETE_PASSWORD_INVALID');
  }

  async record(data: {
    action: string;
    resourceType: string;
    resourceId?: string | null;
    resourceName: string;
    changedFields?: string[];
    details?: Prisma.InputJsonValue;
    performedById?: string | null;
  }) {
    return prisma.auditLog.create({ data: { ...data, resourceId: data.resourceId || null, performedById: data.performedById || null } });
  }

  async list(query: { action?: string; resourceType?: string; search?: string }) {
    return prisma.auditLog.findMany({
      where: {
        ...(query.action ? { action: query.action } : {}),
        ...(query.resourceType ? { resourceType: query.resourceType } : {}),
        ...(query.search ? { OR: [
          { resourceName: { contains: query.search, mode: 'insensitive' } },
          { performedBy: { name: { contains: query.search, mode: 'insensitive' } } },
        ] } : {}),
      },
      include: { performedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
  }
}
