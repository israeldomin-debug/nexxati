import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthRequest } from '../middlewares/auth.middleware';
import { PasswordVaultService } from '../services/password-vault.service';

const service = new PasswordVaultService();

const handleError = (res: Response, error: unknown) => {
  console.error('Erro no banco de senhas:', error);
  if (error instanceof ZodError) return res.status(400).json({ error: 'Dados inválidos', details: error.flatten() });
  if (error instanceof Error && error.message.includes('não encontrado')) return res.status(404).json({ error: error.message });
  if (error instanceof Error && error.message === 'DELETE_PASSWORD_REQUIRED') return res.status(400).json({ error: 'Digite sua senha para visualizar a credencial' });
  if (error instanceof Error && error.message === 'DELETE_PASSWORD_INVALID') return res.status(403).json({ error: 'Senha incorreta' });
  return res.status(500).json({ error: 'Não foi possível concluir a operação no banco de senhas' });
};

export class PasswordVaultController {
  async options(_req: Request, res: Response) {
    try { return res.json(await service.options()); }
    catch (error) { return handleError(res, error); }
  }

  async list(req: Request, res: Response) {
    try { return res.json({ entries: await service.findAll(req.query) }); }
    catch (error) { return handleError(res, error); }
  }

  async findById(req: Request, res: Response) {
    try { return res.json({ entry: await service.findById(req.params.id) }); }
    catch (error) { return handleError(res, error); }
  }

  async reveal(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user!.userId;
      return res.json({ entry: await service.reveal(req.params.id, userId, req.body?.password) });
    } catch (error) { return handleError(res, error); }
  }

  async inspect(req: Request, res: Response) {
    try { return res.json({ inspection: await service.inspectNetworkDevice(req.params.id) }); }
    catch (error) { return handleError(res, error); }
  }

  async create(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user!.userId;
      return res.status(201).json({ entry: await service.create(req.body, userId) });
    } catch (error) { return handleError(res, error); }
  }

  async update(req: Request, res: Response) {
    try { return res.json({ entry: await service.update(req.params.id, req.body) }); }
    catch (error) { return handleError(res, error); }
  }

  async delete(req: Request, res: Response) {
    try {
      await service.delete(req.params.id);
      return res.json({ message: 'Registro de senha excluído com sucesso' });
    } catch (error) { return handleError(res, error); }
  }
}
