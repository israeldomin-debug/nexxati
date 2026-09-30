import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { ZodError } from 'zod';
import fs from 'fs';
import path from 'path';
import { ManagementService } from '../services/management.service';
import { AgentUpdateService } from '../services/agent-update.service';

const service = new ManagementService();
const agentUpdateService = new AgentUpdateService();
const fail = (res: Response, error: unknown) => {
  console.error('Erro na central de gestão:', error);
  if (error instanceof ZodError) return res.status(400).json({ error: 'Confira os campos informados', details: error.flatten() });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return res.status(404).json({ error: 'Registro não encontrado' });
  return res.status(500).json({ error: 'Não foi possível concluir esta operação' });
};

export class ManagementController {
  overview = async (_req: Request, res: Response) => { try { res.json({ overview: await service.overview() }); } catch (e) { fail(res, e); } };
  agents = async (_req: Request, res: Response) => { try { res.json({ agents: await service.agents() }); } catch (e) { fail(res, e); } };
  downloadAgent = async (_req: Request, res: Response) => {
    const file = path.resolve(process.cwd(), '../agente-remoto-configurado-silencioso.zip');
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Pacote do agente ainda não foi gerado' });
    const version = agentUpdateService.currentVersion();
    return res.download(file, `IDL-Ativos-Agente-${version ? `v${version}` : 'atual'}.zip`);
  };
  deleteAgent = async (req: Request, res: Response) => { try { await service.deleteAgent(req.params.id, req.user!.id); res.json({ message: 'Agente removido' }); } catch (e) { fail(res, e); } };
  terms = async (_req: Request, res: Response) => { try { res.json({ terms: await service.terms() }); } catch (e) { fail(res, e); } };
  createTerm = async (req: Request, res: Response) => { try { res.status(201).json({ term: await service.createTerm(req.body, req.user!.id) }); } catch (e) { fail(res, e); } };
  signTerm = async (req: Request, res: Response) => { try { res.json({ term: await service.signTerm(req.params.id, req.body.signedByName, req.user!.id) }); } catch (e) { fail(res, e); } };
  maintenance = async (_req: Request, res: Response) => { try { res.json({ records: await service.maintenance() }); } catch (e) { fail(res, e); } };
  createMaintenance = async (req: Request, res: Response) => { try { res.status(201).json({ record: await service.createMaintenance(req.body, req.user!.id) }); } catch (e) { fail(res, e); } };
  updateMaintenance = async (req: Request, res: Response) => { try { res.json({ record: await service.updateMaintenance(req.params.id, req.body, req.user!.id) }); } catch (e) { fail(res, e); } };
  knowledge = async (req: Request, res: Response) => { try { res.json({ articles: await service.knowledge(String(req.query.search || '')) }); } catch (e) { fail(res, e); } };
  createArticle = async (req: Request, res: Response) => { try { res.status(201).json({ article: await service.createArticle(req.body, req.user!.id) }); } catch (e) { fail(res, e); } };
  updateArticle = async (req: Request, res: Response) => { try { res.json({ article: await service.updateArticle(req.params.id, req.body, req.user!.id) }); } catch (e) { fail(res, e); } };
  purchases = async (_req: Request, res: Response) => { try { res.json({ requests: await service.purchases() }); } catch (e) { fail(res, e); } };
  createPurchase = async (req: Request, res: Response) => { try { res.status(201).json({ request: await service.createPurchase(req.body, req.user!.id) }); } catch (e) { fail(res, e); } };
  generatePurchases = async (req: Request, res: Response) => { try { res.json(await service.generatePurchases(req.user!.id)); } catch (e) { fail(res, e); } };
  updatePurchase = async (req: Request, res: Response) => { try { res.json({ request: await service.updatePurchase(req.params.id, req.body, req.user!.id) }); } catch (e) { fail(res, e); } };
}
