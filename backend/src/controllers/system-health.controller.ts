import { Request, Response } from 'express';
import { SystemHealthService } from '../services/system-health.service';

const service = new SystemHealthService();

export class SystemHealthController {
  async get(_req: Request, res: Response) {
    try { return res.json({ health: await service.get() }); }
    catch (error) {
      console.error('Erro na saúde do sistema:', error);
      return res.status(500).json({ error: 'Não foi possível verificar a saúde do sistema' });
    }
  }
}
