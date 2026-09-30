import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AccessoryService } from '../services/accessory.service';
import { reuseIdenticalUpload } from '../middlewares/upload';

const service = new AccessoryService();

const handleError = (res: Response, error: unknown) => {
  console.error('Erro em estoque:', error);
  if (error instanceof ZodError) return res.status(400).json({ error: 'Dados inválidos', details: error.flatten() });
  if (error instanceof Prisma.PrismaClientKnownRequestError) return res.status(409).json({ error: 'Não foi possível salvar este item de estoque' });
  if (error instanceof Error && error.message === 'Item de estoque não encontrado') return res.status(404).json({ error: error.message });
  if (error instanceof Error && error.message === 'MOVEMENT_NOT_FOUND') return res.status(404).json({ error: 'Movimentação não encontrada' });
  if (error instanceof Error && error.message === 'DELETE_PASSWORD_REQUIRED') return res.status(400).json({ error: 'Informe sua senha para cancelar a saída' });
  if (error instanceof Error && error.message === 'DELETE_PASSWORD_INVALID') return res.status(403).json({ error: 'Senha incorreta' });
  if (error instanceof Error && error.message === 'MOVEMENT_NOT_OUT') return res.status(400).json({ error: 'Somente saídas podem ser canceladas' });
  if (error instanceof Error && error.message === 'MOVEMENT_DISPOSAL') return res.status(400).json({ error: 'Saídas vinculadas a descarte devem ser tratadas na área de descartes' });
  if (error instanceof Error && error.message === 'MOVEMENT_ALREADY_CANCELED') return res.status(409).json({ error: 'Esta saída já foi cancelada' });
  return res.status(500).json({ error: 'Não foi possível concluir a operação com o item de estoque' });
};

export class AccessoryController {
  async list(req: Request, res: Response) {
    try { return res.json({ accessories: await service.findAll(String(req.query.search || ''), req.query.status) }); }
    catch (error) { return handleError(res, error); }
  }

  async movements(req: Request, res: Response) {
    try { return res.json({ movements: await service.findMovements(Number(req.query.limit || 50)) }); }
    catch (error) { return handleError(res, error); }
  }

  async findById(req: Request, res: Response) {
    try { return res.json({ accessory: await service.findById(req.params.id) }); }
    catch (error) { return handleError(res, error); }
  }

  async create(req: Request, res: Response) {
    try { return res.status(201).json({ accessory: await service.create(req.body) }); }
    catch (error) { return handleError(res, error); }
  }

  async update(req: Request, res: Response) {
    try { return res.json({ accessory: await service.update(req.params.id, req.body) }); }
    catch (error) { return handleError(res, error); }
  }

  async uploadImage(req: Request, res: Response) {
    try {
      if (!req.file) return res.status(400).json({ error: 'Envie uma imagem JPG, PNG ou GIF' });
      if (!req.file.mimetype.startsWith('image/')) return res.status(400).json({ error: 'Envie apenas imagem JPG, PNG ou GIF' });
      const reusableImages = await service.findImageFilenames();
      const filename = reuseIdenticalUpload(req.file, undefined, reusableImages);
      const accessory = await service.updateImage(req.params.id, `/uploads/${filename}`);
      return res.json({ accessory });
    } catch (error) { return handleError(res, error); }
  }

  async move(req: Request, res: Response) {
    try {
      const performedById = req.user!.id;
      return res.status(201).json(await service.move(req.params.id, req.body, performedById));
    } catch (error) { return handleError(res, error); }
  }

  async cancelMovement(req: Request, res: Response) {
    try {
      return res.json(await service.cancelMovement(req.params.movementId, req.body, req.user!.id));
    } catch (error) { return handleError(res, error); }
  }

  async updateMovement(req: Request, res: Response) {
    try {
      return res.json({ movement: await service.updateMovement(req.params.movementId, req.body, req.user!.id) });
    } catch (error) { return handleError(res, error); }
  }

  async transfer(req: Request, res: Response) {
    try { return res.json({ accessory: await service.transfer(req.params.id, req.body, req.user!.id) }); }
    catch (error) { return handleError(res, error); }
  }

  async delete(req: Request, res: Response) {
    try { await service.delete(req.params.id); return res.json({ message: 'Item movido para a lixeira com sucesso' }); }
    catch (error) { return handleError(res, error); }
  }

  async restore(req: Request, res: Response) {
    try { return res.json({ accessory: await service.restore(req.params.id, req.user!.id), message: 'Item restaurado com sucesso' }); }
    catch (error) { return handleError(res, error); }
  }
}
