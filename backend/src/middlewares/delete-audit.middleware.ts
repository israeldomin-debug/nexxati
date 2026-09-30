import { NextFunction, Response } from 'express';
import { AuthRequest } from './auth.middleware';
import { AuditService } from '../services/audit.service';
import { PrismaClient } from '@prisma/client';

const auditService = new AuditService();
const prisma = new PrismaClient();

const deletedResourceName = async (baseUrl: string, id?: string) => {
  if (!id) return null;
  if (baseUrl.endsWith('/assets')) return (await prisma.asset.findUnique({ where: { id }, select: { name: true } }))?.name;
  if (baseUrl.endsWith('/accessories')) return (await prisma.accessory.findUnique({ where: { id }, select: { name: true } }))?.name;
  if (baseUrl.endsWith('/licenses')) return (await prisma.softwareLicense.findUnique({ where: { id }, select: { softwareName: true } }))?.softwareName;
  if (baseUrl.endsWith('/ip-addresses')) return (await prisma.networkIpAddress.findUnique({ where: { id }, select: { ipAddress: true } }))?.ipAddress;
  if (baseUrl.endsWith('/password-vault')) return (await prisma.passwordVaultEntry.findUnique({ where: { id }, select: { name: true } }))?.name;
  if (baseUrl.endsWith('/companies')) return (await prisma.company.findUnique({ where: { id }, select: { name: true } }))?.name;
  if (baseUrl.endsWith('/suppliers')) return (await prisma.supplier.findUnique({ where: { id }, select: { name: true } }))?.name;
  if (baseUrl.endsWith('/users')) return (await prisma.user.findUnique({ where: { id }, select: { name: true } }))?.name;
  if (baseUrl.endsWith('/tickets')) return (await prisma.ticket.findUnique({ where: { id }, select: { title: true } }))?.title;
  if (baseUrl.endsWith('/disposals')) return (await prisma.disposalItem.findUnique({ where: { id }, select: { itemName: true } }))?.itemName;
  return null;
};

export const requireDeletePassword = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Usuário não autenticado' });
    await auditService.verifyPassword(userId, req.body?.password);
    res.locals.deletedResourceName = await deletedResourceName(req.baseUrl, req.params.id);

    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      void auditService.record({
        action: 'DELETE',
        resourceType: req.baseUrl.replace(/^\/api\//, '') || 'registro',
        resourceId: req.params.id || req.params.ticketId || req.params.sessionId || null,
        resourceName: res.locals.deletedResourceName || req.params.id || req.originalUrl,
        performedById: req.baseUrl.endsWith('/users') && req.params.id === userId ? null : userId,
        details: { method: req.method, path: req.originalUrl, performedByUserId: userId },
      }).catch((error) => console.error('Erro ao gravar auditoria de exclusão:', error));
    });
    return next();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'DELETE_PASSWORD_REQUIRED') return res.status(400).json({ error: 'Digite sua senha para excluir' });
    if (message === 'DELETE_PASSWORD_INVALID') return res.status(403).json({ error: 'Senha incorreta' });
    return res.status(500).json({ error: 'Não foi possível validar a exclusão' });
  }
};
