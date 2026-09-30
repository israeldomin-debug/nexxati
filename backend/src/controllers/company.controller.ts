import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { CompanyService } from '../services/company.service';

const service = new CompanyService();

const handleError = (res: Response, error: unknown) => {
  console.error('Erro em empresas:', error);
  if (error instanceof ZodError) return res.status(400).json({ error: 'Dados inválidos', details: error.flatten() });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return res.status(409).json({ error: 'Código ou CNPJ já cadastrado' });
  if (error instanceof Error) {
    if (error.message === 'Empresa não encontrada') return res.status(404).json({ error: error.message });
    if (error.message.includes('não pode ser excluída')) return res.status(409).json({ error: error.message });
  }
  return res.status(500).json({ error: 'Não foi possível concluir a operação com a empresa' });
};

export class CompanyController {
  async list(req: Request, res: Response) {
    try { return res.json({ companies: await service.findAll(String(req.query.search || '')) }); }
    catch (error) { return handleError(res, error); }
  }
  async findById(req: Request, res: Response) {
    try { return res.json({ company: await service.findById(req.params.id) }); }
    catch (error) { return handleError(res, error); }
  }
  async create(req: Request, res: Response) {
    try { return res.status(201).json({ company: await service.create(req.body) }); }
    catch (error) { return handleError(res, error); }
  }
  async update(req: Request, res: Response) {
    try { return res.json({ company: await service.update(req.params.id, req.body) }); }
    catch (error) { return handleError(res, error); }
  }
  async delete(req: Request, res: Response) {
    try { await service.delete(req.params.id); return res.json({ message: 'Empresa excluída com sucesso' }); }
    catch (error) { return handleError(res, error); }
  }
}
