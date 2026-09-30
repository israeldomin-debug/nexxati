import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { DisposalService } from '../services/disposal.service';

const service = new DisposalService();

const handleError = (res: Response, error: unknown) => {
  console.error('Erro em descarte:', error);
  if (error instanceof ZodError) return res.status(400).json({ error: 'Dados inválidos', details: error.flatten() });
  if (error instanceof Prisma.PrismaClientKnownRequestError) return res.status(409).json({ error: 'Não foi possível salvar este descarte' });
  if (error instanceof Error) return res.status(400).json({ error: error.message });
  return res.status(500).json({ error: 'Não foi possível concluir a operação de descarte' });
};

export class DisposalController {
  async list(req: Request, res: Response) {
    try { return res.json({ disposals: await service.findAll(String(req.query.search || '')) }); }
    catch (error) { return handleError(res, error); }
  }

  async create(req: Request, res: Response) {
    try { return res.status(201).json({ disposal: await service.create(req.body, req.user!.id) }); }
    catch (error) { return handleError(res, error); }
  }

  async delete(req: Request, res: Response) {
    try { await service.delete(req.params.id); return res.json({ message: 'Registro de descarte excluído com sucesso' }); }
    catch (error) { return handleError(res, error); }
  }
}
