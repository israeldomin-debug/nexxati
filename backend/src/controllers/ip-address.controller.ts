import { Request, Response } from 'express';
import { IpAddressService } from '../services/ip-address.service';

const service = new IpAddressService();

export class IpAddressController {
  async options(_req: Request, res: Response) {
    try {
      return res.json(await service.options());
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Erro ao carregar opções de IPs' });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const ipAddresses = await service.list(req.query as any);
      return res.json({ ipAddresses });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Erro ao listar IPs' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const ipAddress = await service.create(req.body);
      return res.status(201).json({ ipAddress });
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Erro ao cadastrar IP' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const ipAddress = await service.update(req.params.id, req.body);
      return res.json({ ipAddress });
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Erro ao atualizar IP' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      await service.delete(req.params.id);
      return res.status(204).send();
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Erro ao excluir IP' });
    }
  }

  async createSegment(req: Request, res: Response) {
    try { return res.status(201).json({ segment: await service.createSegment(req.body) }); }
    catch (error: any) { return res.status(400).json({ error: error.message || 'Erro ao cadastrar faixa de rede' }); }
  }

  async updateSegment(req: Request, res: Response) {
    try { return res.json({ segment: await service.updateSegment(req.params.id, req.body) }); }
    catch (error: any) { return res.status(400).json({ error: error.message || 'Erro ao atualizar faixa de rede' }); }
  }

  async deleteSegment(req: Request, res: Response) {
    try { await service.deleteSegment(req.params.id); return res.status(204).send(); }
    catch (error: any) { return res.status(400).json({ error: error.message || 'Erro ao excluir faixa de rede' }); }
  }
}
