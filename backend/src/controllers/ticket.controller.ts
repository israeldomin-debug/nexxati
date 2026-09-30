import { Request, Response } from 'express';
import { TicketService } from '../services/ticket.service';
import { ZodError } from 'zod';
import { AuthRequest } from '../middlewares/auth.middleware';

const ticketService = new TicketService();

export class TicketController {
  async deviceContext(req: Request, res: Response) {
    try {
      const socketIp = String(req.socket.remoteAddress || req.ip || '');
      const normalizedSocketIp = socketIp.replace(/^::ffff:/, '');
      const forwarded = req.headers['x-forwarded-for'];
      const forwardedIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : Array.isArray(forwarded) ? forwarded[0] : '';
      const clientIp = (normalizedSocketIp === '127.0.0.1' || normalizedSocketIp === '::1') && forwardedIp ? forwardedIp : socketIp;
      return res.json({ context: await ticketService.deviceContext(clientIp) });
    } catch (error) {
      console.error('Erro ao identificar agente do chamado:', error);
      return res.status(200).json({ context: { found: false } });
    }
  }

  async resolutionMetrics(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      return res.json({ metrics: await ticketService.resolutionMetrics(authReq.user!.userId, authReq.user!.role) });
    } catch (error) {
      console.error('Erro ao calcular tempos dos chamados:', error);
      return res.status(500).json({ error: 'Erro ao calcular tempos dos chamados' });
    }
  }

  /**
   * POST /api/tickets
   * Cria um novo ticket
   */
  async create(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user!.userId;

      const ticket = await ticketService.create(req.body, userId);

      return res.status(201).json({
        message: 'Ticket criado com sucesso',
        ticket,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Dados inválidos',
          code: 'VALIDATION_ERROR',
          details: error.errors,
        });
      }

      console.error('Erro ao criar ticket:', error);
      return res.status(500).json({
        error: 'Erro ao criar ticket',
        code: 'CREATE_TICKET_ERROR',
      });
    }
  }

  /**
   * GET /api/tickets
   * Lista tickets com filtros
   */
  async list(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user!.userId;
      const userRole = authReq.user!.role;

      const filters = {
        view: req.query.view as any,
        status: req.query.status as any,
        statusGroup: req.query.statusGroup as any,
        category: req.query.category as any,
        assignedToMe: req.query.assignedToMe === 'true',
        createdByMe: req.query.createdByMe === 'true',
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      };

      const result = await ticketService.list(filters, userId, userRole);

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Parâmetros inválidos',
          code: 'VALIDATION_ERROR',
          details: error.errors,
        });
      }

      console.error('Erro ao listar tickets:', error);
      return res.status(500).json({
        error: 'Erro ao listar tickets',
        code: 'LIST_TICKETS_ERROR',
      });
    }
  }

  /**
   * GET /api/tickets/:id
   * Busca um ticket por ID
   */
  async findById(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user!.userId;
      const userRole = authReq.user!.role;
      const ticketId = req.params.id;

      const ticket = await ticketService.findById(ticketId, userId, userRole);

      return res.status(200).json({ ticket });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'TICKET_NOT_FOUND') {
          return res.status(404).json({
            error: 'Ticket não encontrado',
            code: 'TICKET_NOT_FOUND',
          });
        }

        if (error.message === 'UNAUTHORIZED_ACCESS') {
          return res.status(403).json({
            error: 'Acesso negado a este ticket',
            code: 'UNAUTHORIZED_ACCESS',
          });
        }
      }

      console.error('Erro ao buscar ticket:', error);
      return res.status(500).json({
        error: 'Erro ao buscar ticket',
        code: 'FIND_TICKET_ERROR',
      });
    }
  }

  /**
   * PATCH /api/tickets/:id
   * Atualiza um ticket
   */
  async update(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user!.userId;
      const userRole = authReq.user!.role;
      const ticketId = req.params.id;

      const ticket = await ticketService.update(ticketId, req.body, userId, userRole);

      return res.status(200).json({
        message: 'Ticket atualizado com sucesso',
        ticket,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Dados inválidos',
          code: 'VALIDATION_ERROR',
          details: error.errors,
        });
      }

      if (error instanceof Error) {
        if (error.message === 'TICKET_NOT_FOUND') {
          return res.status(404).json({
            error: 'Ticket não encontrado',
            code: 'TICKET_NOT_FOUND',
          });
        }

        if (error.message === 'UNAUTHORIZED_ACCESS') {
          return res.status(403).json({
            error: 'Acesso negado para editar este ticket',
            code: 'UNAUTHORIZED_ACCESS',
          });
        }
      }

      console.error('Erro ao atualizar ticket:', error);
      return res.status(500).json({
        error: 'Erro ao atualizar ticket',
        code: 'UPDATE_TICKET_ERROR',
      });
    }
  }

  /**
   * DELETE /api/tickets/:id
   * Deleta um ticket (apenas Admin)
   */
  async delete(req: Request, res: Response) {
    try {
      const ticketId = req.params.id;
      const result = await ticketService.delete(ticketId);

      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'TICKET_NOT_FOUND') {
        return res.status(404).json({
          error: 'Ticket não encontrado',
          code: 'TICKET_NOT_FOUND',
        });
      }

      console.error('Erro ao deletar ticket:', error);
      return res.status(500).json({
        error: 'Erro ao deletar ticket',
        code: 'DELETE_TICKET_ERROR',
      });
    }
  }

  /**
   * POST /api/tickets/:id/comments
   * Adiciona comentário ao ticket
   */
  async addComment(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user!.userId;
      const userRole = authReq.user!.role;
      const ticketId = req.params.id;
      const { message } = req.body;

      if (!message || message.trim().length < 1) {
        return res.status(400).json({
          error: 'Mensagem é obrigatória',
          code: 'MESSAGE_REQUIRED',
        });
      }

      const comment = await ticketService.addComment(ticketId, message, userId, userRole);

      return res.status(201).json({
        message: 'Comentário adicionado com sucesso',
        comment,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'TICKET_NOT_FOUND') {
          return res.status(404).json({
            error: 'Ticket não encontrado',
            code: 'TICKET_NOT_FOUND',
          });
        }

        if (error.message === 'UNAUTHORIZED_ACCESS') {
          return res.status(403).json({
            error: 'Acesso negado para comentar neste ticket',
            code: 'UNAUTHORIZED_ACCESS',
          });
        }
      }

      console.error('Erro ao adicionar comentário:', error);
      return res.status(500).json({
        error: 'Erro ao adicionar comentário',
        code: 'ADD_COMMENT_ERROR',
      });
    }
  }

  /**
   * Adiciona um anexo (PDF ou imagem) ao ticket
   */
  async addAttachment(req: Request, res: Response) {
    try {
      const { id: ticketId } = req.params;
      const { id: userId, role: userRole } = (req as any).user;

      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      const attachment = await ticketService.addAttachment(
        ticketId,
        req.file.filename,
        req.file.originalname,
        userId,
        userRole
      );

      return res.status(201).json({ attachment });
    } catch (error: any) {
      console.error('Erro ao adicionar anexo:', error);
      if (error.message.includes('não encontrado')) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('permissão')) {
        return res.status(403).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Erro ao adicionar anexo' });
    }
  }

  /**
   * Baixa um anexo do ticket
   */
  async downloadAttachment(req: Request, res: Response) {
    try {
      const { id: ticketId, filename } = req.params;
      const { id: userId, role: userRole } = (req as any).user;

      const filePath = await ticketService.getAttachmentPath(ticketId, filename, userId, userRole);

      // Enviar arquivo com nome original
      return res.download(filePath, filename);
    } catch (error: any) {
      if (error.message === 'Ticket não encontrado') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'Anexo não encontrado') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'Arquivo não encontrado no servidor') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('permissão')) {
        return res.status(403).json({ error: error.message });
      }
      console.error('Erro ao baixar anexo:', error);
      return res.status(500).json({ error: 'Erro ao baixar anexo' });
    }
  }

  /**
   * Remove um anexo do ticket
   */
  async deleteAttachment(req: Request, res: Response) {
    try {
      const { id: ticketId, filename } = req.params;
      const { id: userId, role: userRole } = (req as any).user;

      await ticketService.deleteAttachment(ticketId, filename, userId, userRole);
      return res.json({ message: 'Anexo removido com sucesso' });
    } catch (error: any) {
      console.error('Erro ao remover anexo:', error);
      if (error.message.includes('não encontrado')) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('permissão')) {
        return res.status(403).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Erro ao remover anexo' });
    }
  }
}
