import { PrismaClient, UserPermission, UserRole } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

const prisma = new PrismaClient();

export const requirePermission = (
  permission: UserPermission,
  fallbackRoles: UserRole[] = ['ADMIN'],
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    const currentUser = authReq.user;

    if (!currentUser) {
      return res.status(401).json({
        error: 'Usuário não autenticado',
        code: 'NOT_AUTHENTICATED',
      });
    }

    if (currentUser.role === 'ADMIN' || fallbackRoles.includes(currentUser.role as UserRole)) {
      return next();
    }

    const grant = await prisma.userPermissionGrant.findUnique({
      where: {
        userId_permission: {
          userId: currentUser.userId,
          permission,
        },
      },
      select: { id: true },
    });

    if (grant) return next();

    return res.status(403).json({
      error: 'Acesso negado. Permissões insuficientes',
      code: 'INSUFFICIENT_PERMISSIONS',
      requiredPermission: permission,
    });
  };
};
