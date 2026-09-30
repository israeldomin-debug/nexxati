import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AuthRequest } from '../middlewares/auth.middleware';
import { AssetService } from '../services/asset.service';
import { InvoiceXmlService } from '../services/invoice-xml.service';

const assetService = new AssetService();
const invoiceXmlService = new InvoiceXmlService();

const handleAssetError = (res: Response, error: unknown) => {
  console.error('Erro em ativos:', error);

  if (error instanceof ZodError) {
    return res.status(400).json({ error: 'Dados inválidos', details: error.flatten() });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = Array.isArray(error.meta?.target) ? error.meta?.target.join(', ') : String(error.meta?.target || '');
    if (target.includes('ip_address')) {
      return res.status(409).json({ error: 'Já existe um ativo cadastrado com este IP' });
    }
    return res.status(409).json({ error: 'O número de série, MAC ou IP já está cadastrado' });
  }

  if (error instanceof Error) {
    if (error.message === 'DELETE_PASSWORD_INVALID') return res.status(403).json({ error: 'Senha incorreta' });
    if (error.message === 'DELETE_PASSWORD_REQUIRED') return res.status(400).json({ error: 'Senha obrigatÃ³ria' });
    if (error.message === 'DELETE_USER_INVALID') return res.status(401).json({ error: 'Usuario nao encontrado ou inativo' });
    if (error.message.startsWith('IP_DUPLICATE:')) {
      const [, ipAddress, name] = error.message.split(':');
      return res.status(409).json({ error: `Já existe um ativo cadastrado com o IP ${ipAddress}: ${name}` });
    }

    if (error.message === 'Ativo não encontrado') return res.status(404).json({ error: error.message });
    if (error.message.includes('não encontrado') || error.message.includes('não pode') || error.message.includes('não está') || error.message.includes('já está') || error.message.startsWith('Use a opção')) {
      return res.status(400).json({ error: error.message });
    }
  }

  return res.status(500).json({ error: 'Não foi possível concluir a operação com o ativo' });
};

export class AssetController {
  async parseInvoiceXml(req: Request, res: Response) {
    try {
      if (!req.file) return res.status(400).json({ error: 'Selecione o arquivo XML da NF-e' });
      return res.json({ invoice: await invoiceXmlService.parse(req.file) });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ error: error.message });
      return handleAssetError(res, error);
    }
  }

  async list(req: Request, res: Response) {
    try { return res.json(await assetService.findAll(req.query)); }
    catch (error) { return handleAssetError(res, error); }
  }

  async findById(req: Request, res: Response) {
    try { return res.json({ asset: await assetService.findById(req.params.id) }); }
    catch (error) { return handleAssetError(res, error); }
  }

  async revealWindowsLicense(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const licenseKey = await assetService.revealWindowsLicense(req.params.id, userId, req.body?.password);
      return res.json({ licenseKey });
    } catch (error) { return handleAssetError(res, error); }
  }

  async create(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user!.userId;
      return res.status(201).json({ asset: await assetService.create(req.body, userId) });
    } catch (error) { return handleAssetError(res, error); }
  }

  async update(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user!.userId;
      return res.json({ asset: await assetService.update(req.params.id, req.body, userId) });
    } catch (error) { return handleAssetError(res, error); }
  }

  async checkout(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user!.userId;
      return res.json({ asset: await assetService.checkout(req.params.id, req.body.assignedToId, userId) });
    } catch (error) { return handleAssetError(res, error); }
  }

  async checkin(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user!.userId;
      return res.json({ asset: await assetService.checkin(req.params.id, userId) });
    } catch (error) { return handleAssetError(res, error); }
  }

  async completeMaintenance(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user!.userId;
      return res.json({ asset: await assetService.completeMaintenance(req.params.id, req.body, userId) });
    } catch (error) { return handleAssetError(res, error); }
  }

  async makeDonor(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user!.userId;
      return res.json(await assetService.makeDonor(req.params.id, req.body, userId));
    } catch (error) { return handleAssetError(res, error); }
  }

  async syncAgentPeripherals(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user!.userId;
      return res.json(await assetService.syncAgentPeripherals(req.params.id, userId));
    } catch (error) { return handleAssetError(res, error); }
  }

  async maintenanceReport(req: Request, res: Response) {
    try { return res.json({ records: await assetService.maintenanceReport() }); }
    catch (error) { return handleAssetError(res, error); }
  }

  async delete(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user!.userId;
      await assetService.delete(req.params.id, userId, req.body);
      return res.json({ message: 'Ativo excluído com sucesso' });
    } catch (error) { return handleAssetError(res, error); }
  }
}
