import { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import { AuthRequest } from '../middlewares/auth.middleware';
import { RemoteDiscoveryService } from '../services/remote-discovery.service';
import { AgentUpdateService } from '../services/agent-update.service';

const service = new RemoteDiscoveryService();
const updateService = new AgentUpdateService();

export const authenticateRemoteAgent = (req: Request, res: Response, next: NextFunction) => {
  const configured = process.env.REMOTE_AGENT_TOKEN || '';
  const provided = String(req.header('x-agent-token') || '');
  if (!configured || configured.length !== provided.length || !crypto.timingSafeEqual(Buffer.from(configured), Buffer.from(provided))) {
    return res.status(401).json({ error: 'Token do agente remoto inválido' });
  }
  next();
};

export class RemoteDiscoveryController {
  updateManifest(req: Request, res: Response) {
    try { return res.json({ update: updateService.manifest(String(req.query.currentVersion || '')) }); }
    catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : 'Não foi possível consultar a atualização' }); }
  }

  downloadUpdate(_req: Request, res: Response) {
    try {
      const release = updateService.executable();
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', String(release.size));
      res.setHeader('X-Agent-Version', release.version);
      res.setHeader('X-Agent-SHA256', release.sha256);
      return res.download(release.executablePath, release.fileName);
    } catch (error) {
      return res.status(404).json({ error: error instanceof Error ? error.message : 'Atualização não encontrada' });
    }
  }

  async heartbeat(req: Request, res: Response) {
    try { return res.json({ agent: await service.heartbeat(req.body) }); }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível registrar o agente' }); }
  }

  async listAgents(req: Request, res: Response) {
    try { return res.json({ agents: await service.listAgents() }); }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível listar os agentes' }); }
  }

  async create(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user!.userId;
      return res.status(201).json({ job: await service.createJob(req.body, userId) });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível iniciar a busca remota' });
    }
  }

  async get(req: Request, res: Response) {
    try { return res.json({ job: await service.getJob(req.params.id) }); }
    catch (error) { return res.status(404).json({ error: error instanceof Error ? error.message : 'Busca não encontrada' }); }
  }

  async next(req: Request, res: Response) {
    try { return res.json({ job: await service.claimNext(String(req.query.agentName || 'Agente remoto')) }); }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível obter a tarefa' }); }
  }

  async complete(req: Request, res: Response) {
    try { return res.json({ job: await service.complete(req.params.id, req.body) }); }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível enviar o resultado' }); }
  }
}
