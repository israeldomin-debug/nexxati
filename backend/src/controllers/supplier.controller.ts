import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { SupplierService } from '../services/supplier.service';

const service = new SupplierService();

const handleError = (res: Response, error: unknown) => {
  console.error('Erro em fornecedores:', error);
  if (error instanceof ZodError) return res.status(400).json({ error: 'Dados inválidos', details: error.flatten() });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return res.status(409).json({ error: 'CNPJ/CPF já cadastrado para outro fornecedor' });
  if (error instanceof Error) {
    if (error.message === 'Fornecedor não encontrado') return res.status(404).json({ error: error.message });
    if (error.message.includes('não pode ser excluído')) return res.status(409).json({ error: error.message });
  }
  return res.status(500).json({ error: 'Não foi possível concluir a operação com o fornecedor' });
};

export class SupplierController {
  async list(req: Request, res: Response) {
    try { return res.json({ suppliers: await service.findAll(String(req.query.search || '')) }); }
    catch (error) { return handleError(res, error); }
  }

  async findById(req: Request, res: Response) {
    try { return res.json({ supplier: await service.findById(req.params.id) }); }
    catch (error) { return handleError(res, error); }
  }

  async create(req: Request, res: Response) {
    try { return res.status(201).json({ supplier: await service.create(req.body) }); }
    catch (error) { return handleError(res, error); }
  }

  async update(req: Request, res: Response) {
    try { return res.json({ supplier: await service.update(req.params.id, req.body) }); }
    catch (error) { return handleError(res, error); }
  }

  async delete(req: Request, res: Response) {
    try { await service.delete(req.params.id); return res.json({ message: 'Fornecedor excluído com sucesso' }); }
    catch (error) { return handleError(res, error); }
  }
}
