import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthRequest } from '../middlewares/auth.middleware';
import { NetworkDiscoveryService } from '../services/network-discovery.service';

const service = new NetworkDiscoveryService();

const handleError = (res: Response, error: unknown) => {
  console.error('Erro na descoberta de rede:', error);
  if (error instanceof ZodError) return res.status(400).json({ error: 'Lista de dispositivos inválida', details: error.flatten() });
  if (error instanceof Error) return res.status(400).json({ error: error.message });
  return res.status(500).json({ error: 'Não foi possível concluir a descoberta de rede' });
};

export class NetworkDiscoveryController {
  async discover(req: Request, res: Response) {
    try { return res.json(await service.discover(req.body)); }
    catch (error) { return handleError(res, error); }
  }

  async importDevices(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user!.userId;
      return res.status(201).json(await service.importDevices(req.body, userId));
    } catch (error) { return handleError(res, error); }
  }

  async listIgnored(req: Request, res: Response) {
    try { return res.json({ ignored: await service.listIgnored(req.query) }); }
    catch (error) { return handleError(res, error); }
  }

  async ignoreIp(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user!.userId;
      return res.status(201).json({ ignored: await service.ignoreIp(req.body, userId) });
    } catch (error) { return handleError(res, error); }
  }

  async unignoreIp(req: Request, res: Response) {
    try {
      await service.unignoreIp(req.params.id);
      return res.status(204).send();
    } catch (error) { return handleError(res, error); }
  }

  async detailedInventory(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user!.userId;
      return res.json(await service.detailedInventory(req.body, userId));
    } catch (error) { return handleError(res, error); }
  }

  async cctvInventory(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user!.userId;
      return res.json(await service.cctvInventory(req.body, userId));
    } catch (error) { return handleError(res, error); }
  }
}
