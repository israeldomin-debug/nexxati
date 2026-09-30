import { Request, Response } from 'express';
import { AuditService } from '../services/audit.service';

const service = new AuditService();

export class AuditController {
  async list(req: Request, res: Response) {
    try {
      return res.json({ events: await service.list(req.query as { action?: string; resourceType?: string; search?: string }) });
    } catch (error) {
      console.error('Erro ao listar auditoria:', error);
      return res.status(500).json({ error: 'Erro ao carregar auditoria' });
    }
  }
}
