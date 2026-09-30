import { Request, Response } from 'express';
import { LicenseService } from '../services/license.service';

const service = new LicenseService();

export class LicenseController {
  async options(_req: Request, res: Response) {
    try {
      return res.json(await service.options());
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Erro ao carregar opções de licenças' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const licenses = await service.list(req.query as any);
      return res.json({ licenses });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Erro ao listar licenças' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const license = await service.create(req.body, req.user!.id);
      return res.status(201).json({ license });
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Erro ao cadastrar licença' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const license = await service.update(req.params.id, req.body, req.user!.id);
      return res.json({ license });
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Erro ao atualizar licença' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      await service.delete(req.params.id);
      return res.status(204).send();
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Erro ao excluir licença' });
    }
  }
}
