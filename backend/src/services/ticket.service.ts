import { PrismaClient, TicketStatus } from '@prisma/client';
import { z } from 'zod';
import os from 'os';

const prisma = new PrismaClient();

const ticketCategories = [
  'TI',
  'FINANCEIRO',
  'COMPRAS',
  'MANUTENCAO_INDUSTRIAL',
  'DIRETORIA',
  'EXPEDICAO',
  'ENGENHARIA_DE_MINAS',
  'RECEPCAO',
  'PORTARIA',
  'RECURSOS_HUMANOS',
  'COMERCIAL',
  'SELECAO_E_RECRUTAMENTO',
  'MANUTENCAO_DE_AUTO',
] as const;

// Schemas de validação
export const createTicketSchema = z.object({
  title: z.string().min(5, 'Título deve ter no mínimo 5 caracteres'),
  description: z.string().min(10, 'Descrição deve ter no mínimo 10 caracteres'),
  category: z.enum(ticketCategories),
  priority: z.number().int().min(1).max(4).default(1),
  computerUser: z.string().trim().min(1, 'Informe o usuário logado no Windows').max(120),
  deviceHostname: z.string().trim().max(255).optional().nullable(),
  deviceIp: z.string().trim().max(64).optional().nullable(),
  sourceAgentId: z.string().uuid().optional().nullable(),
  assetId: z.string().uuid().optional().nullable(),
});

export const updateTicketSchema = z.object({
  title: z.string().min(5).optional(),
  description: z.string().min(10).optional(),
  category: z.enum(ticketCategories).optional(),
  priority: z.number().int().min(1).max(4).optional(),
  computerUser: z.string().trim().min(1, 'Informe o usuário logado no Windows').max(120).optional().nullable(),
  deviceHostname: z.string().trim().max(255).optional().nullable(),
  deviceIp: z.string().trim().max(64).optional().nullable(),
  sourceAgentId: z.string().uuid().optional().nullable(),
  assetId: z.string().uuid().optional().nullable(),
  status: z.enum(['OPEN', 'IN_ANALYSIS', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  assignedToId: z.string().uuid().nullable().optional(),
});

export const listTicketsSchema = z.object({
  view: z.enum(['ACTIVE', 'COMPLETED', 'ALL']).default('ACTIVE'),
  status: z.enum(['OPEN', 'IN_ANALYSIS', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  statusGroup: z.enum(['IN_PROGRESS']).optional(),
  category: z.enum(ticketCategories).optional(),
  assignedToMe: z.boolean().optional(),
  createdByMe: z.boolean().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(500).default(20),
});

export class TicketService {
  private dueAt(priority: number, from = new Date()) {
    const hours = ({ 1: 72, 2: 24, 3: 8, 4: 4 } as Record<number, number>)[priority] || 24;
    return new Date(from.getTime() + hours * 3_600_000);
  }
  async deviceContext(clientIp: string) {
    const normalizeIp = (value: string) => value.trim().replace(/^::ffff:/, '').replace(/^\[|\]$/g, '');
    const normalizedClientIp = normalizeIp(clientIp);
    const isLoopback = normalizedClientIp === '127.0.0.1' || normalizedClientIp === '::1';
    const agents = await prisma.remoteDiscoveryAgent.findMany({
      where: { lastSeenAt: { gte: new Date(Date.now() - 5 * 60_000) } },
      orderBy: { lastSeenAt: 'desc' },
    });
    const getIps = (agentInfo: unknown) => {
      if (!agentInfo || typeof agentInfo !== 'object' || Array.isArray(agentInfo)) return [] as string[];
      const info = agentInfo as Record<string, unknown>;
      const adapters = Array.isArray(info.networkAdapters) ? info.networkAdapters : [];
      return adapters.flatMap((adapter) => {
        if (!adapter || typeof adapter !== 'object' || Array.isArray(adapter)) return [];
        const ipAddresses = (adapter as Record<string, unknown>).ipAddresses;
        return Array.isArray(ipAddresses) ? ipAddresses.filter((ip): ip is string => typeof ip === 'string').map(normalizeIp) : [];
      });
    };
    const localHostname = os.hostname().toLowerCase();
    const agent = agents.find((item) => getIps(item.agentInfo).includes(normalizedClientIp))
      || (isLoopback ? agents.find((item) => item.computerName.toLowerCase() === localHostname) : undefined);
    if (!agent) return { found: false as const, clientIp: normalizedClientIp };
    const info = agent.agentInfo as Record<string, unknown>;
    const ips = getIps(agent.agentInfo);
    const deviceIp = ips.includes(normalizedClientIp) ? normalizedClientIp : ips.find((ip) => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && !ip.startsWith('127.')) || null;
    const loggedUser = typeof info.loggedUser === 'string' && info.loggedUser.trim() ? info.loggedUser.trim() : null;
    const asset = await prisma.asset.findFirst({
      where: { OR: [{ hostname: { equals: agent.computerName, mode: 'insensitive' } }, ...(deviceIp ? [{ ipAddress: deviceIp }] : [])] },
      select: { id: true, assetTag: true, name: true },
    });
    return { found: true as const, agentId: agent.id, hostname: agent.computerName, computerUser: loggedUser, deviceIp, asset, lastSeenAt: agent.lastSeenAt };
  }

  async resolutionMetrics(userId: string, userRole: string) {
    const tickets = await prisma.ticket.findMany({
      where: {
        status: TicketStatus.COMPLETED,
        ...(userRole === 'USER' ? { createdById: userId } : {}),
      },
      select: {
        createdAt: true,
        updatedAt: true,
        history: {
          where: { newStatus: TicketStatus.COMPLETED },
          orderBy: { changedAt: 'asc' },
          take: 1,
          select: { changedAt: true },
        },
      },
    });

    const durations = tickets
      .map((ticket) => Math.max(0, (ticket.history[0]?.changedAt || ticket.updatedAt).getTime() - ticket.createdAt.getTime()) / 3_600_000)
      .sort((a, b) => a - b);
    const average = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;
    const middle = Math.floor(durations.length / 2);
    const median = durations.length
      ? durations.length % 2 ? durations[middle] : (durations[middle - 1] + durations[middle]) / 2
      : 0;
    const round = (value: number) => Math.round(value * 10) / 10;

    return {
      completedCount: durations.length,
      averageHours: round(average),
      medianHours: round(median),
      fastestHours: round(durations[0] || 0),
    };
  }

  /**
   * Cria um novo ticket
   */
  async create(data: z.infer<typeof createTicketSchema>, userId: string) {
    const validated = createTicketSchema.parse(data);

    const ticket = await prisma.ticket.create({
      data: {
        title: validated.title,
        description: validated.description,
        category: validated.category,
        priority: validated.priority,
        computerUser: validated.computerUser,
        deviceHostname: validated.deviceHostname || null,
        deviceIp: validated.deviceIp || null,
        sourceAgentId: validated.sourceAgentId || null,
        assetId: validated.assetId || null,
        dueAt: this.dueAt(validated.priority),
        createdById: userId,
        status: 'OPEN',
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
          },
        },
        asset: { select: { id: true, name: true, assetTag: true, hostname: true, ipAddress: true } },
      },
    });

    return ticket;
  }

  /**
   * Lista tickets com filtros e paginação
   */
  async list(
    filters: z.infer<typeof listTicketsSchema>,
    userId: string,
    userRole: string
  ) {
    const validated = listTicketsSchema.parse(filters);
    const skip = (validated.page - 1) * validated.limit;

    const where: any = {};

    // Filtros básicos
    if (validated.statusGroup === 'IN_PROGRESS') where.status = { in: ['IN_ANALYSIS', 'IN_PROGRESS'] };
    else if (validated.status) where.status = validated.status;
    if (validated.category) where.category = validated.category;

    // Mantém chamados em atendimento e concluídos em visões separadas.
    if (!validated.status && !validated.statusGroup) {
      if (validated.view === 'ACTIVE') where.status = { notIn: ['COMPLETED', 'CANCELLED'] };
      if (validated.view === 'COMPLETED') where.status = 'COMPLETED';
      if (validated.view === 'ALL' && userRole !== 'ADMIN') where.status = { notIn: ['COMPLETED', 'CANCELLED'] };
    }

    // Filtros de atribuição
    if (validated.assignedToMe) where.assignedToId = userId;
    if (validated.createdByMe) where.createdById = userId;

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        skip,
        take: validated.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true, username: true },
          },
          assignedTo: {
            select: { id: true, name: true, email: true },
          },
          asset: { select: { id: true, name: true, assetTag: true, hostname: true, ipAddress: true } },
          _count: {
            select: { comments: true },
          },
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    const visibleTickets = userRole === 'USER'
      ? tickets.map((ticket) => ({
          ...ticket,
          title: `Chamado #${ticket.id.slice(0, 8)}`,
          description: '',
          computerUser: null,
          deviceHostname: null,
          deviceIp: null,
          sourceAgentId: null,
          attachments: [],
          createdById: '',
          assignedToId: null,
          createdBy: {
            id: '',
            name: 'Informação restrita',
            email: '',
            username: null,
          },
          assignedTo: null,
          _count: { comments: 0 },
        }))
      : tickets;

    return {
      tickets: visibleTickets,
      pagination: {
        page: validated.page,
        limit: validated.limit,
        total,
        totalPages: Math.ceil(total / validated.limit),
      },
    };
  }

  /**
   * Busca um ticket por ID
   */
  async findById(ticketId: string, userId: string, userRole: string) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true, username: true, role: true },
        },
        assignedTo: {
          select: { id: true, name: true, email: true, role: true },
        },
        asset: { select: { id: true, name: true, assetTag: true, hostname: true, ipAddress: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
            select: { id: true, name: true, email: true, username: true },
            },
          },
        },
        history: {
          orderBy: { changedAt: 'desc' },
          include: {
            changedBy: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!ticket) {
      throw new Error('TICKET_NOT_FOUND');
    }

    // Usuários comuns podem acompanhar a fila, mas não podem abrir detalhes de chamados.
    if (userRole === 'USER') {
      throw new Error('UNAUTHORIZED_ACCESS');
    }

    return ticket;
  }

  /**
   * Atualiza um ticket
   */
  async update(
    ticketId: string,
    data: z.infer<typeof updateTicketSchema>,
    userId: string,
    userRole: string
  ) {
    const validated = updateTicketSchema.parse(data);

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new Error('TICKET_NOT_FOUND');
    }

    // Usuários comuns podem acompanhar a fila, mas não podem editar chamados.
    if (userRole === 'USER') {
      throw new Error('UNAUTHORIZED_ACCESS');
    }

    // Se o status mudou, cria um registro no histórico
    if (validated.status && validated.status !== ticket.status) {
      await prisma.ticketHistory.create({
        data: {
          ticketId,
          oldStatus: ticket.status,
          newStatus: validated.status as TicketStatus,
          changedById: userId,
        },
      });
    }

    const updateData = {
      ...validated,
      ...(validated.priority && validated.priority !== ticket.priority ? { dueAt: this.dueAt(validated.priority, ticket.createdAt) } : {}),
      ...(validated.status === 'COMPLETED' && ticket.status !== 'COMPLETED' ? { resolvedAt: new Date(), closedAt: new Date() } : {}),
      ...(validated.status && validated.status !== 'COMPLETED' && ticket.status === 'COMPLETED' ? { resolvedAt: null, closedAt: null } : {}),
    };
    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: updateData,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
        asset: { select: { id: true, name: true, assetTag: true, hostname: true, ipAddress: true } },
      },
    });

    return updatedTicket;
  }

  /**
   * Deleta um ticket (apenas Admin)
   */
  async delete(ticketId: string) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new Error('TICKET_NOT_FOUND');
    }

    await prisma.ticket.delete({
      where: { id: ticketId },
    });

    return { message: 'Ticket deletado com sucesso' };
  }

  /**
   * Adiciona um comentário ao ticket
   */
  async addComment(ticketId: string, message: string, userId: string, userRole: string) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new Error('TICKET_NOT_FOUND');
    }

    // Usuários comuns podem acompanhar a fila, mas não podem comentar em chamados.
    if (userRole === 'USER') {
      throw new Error('UNAUTHORIZED_ACCESS');
    }

    const comment = await prisma.comment.create({
      data: {
        message,
        ticketId,
        userId,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!ticket.firstResponseAt) {
      await prisma.ticket.update({ where: { id: ticketId }, data: { firstResponseAt: new Date() } });
    }

    return comment;
  }
  
  /**
   * Adiciona um anexo ao ticket
   */
  async addAttachment(
    ticketId: string,
    filename: string,
    originalname: string,
    userId: string,
    userRole: string
  ) {
    // Verificar se ticket existe
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      throw new Error('Ticket não encontrado');
    }

    // Verificar permissão: criador, atribuído ou admin/atendente
    if (
      userRole === 'USER' ||
      ticket.createdById !== userId &&
      ticket.assignedToId !== userId &&
      userRole !== 'ADMIN' &&
      userRole !== 'ATTENDANT'
    ) {
      throw new Error('Você não tem permissão para adicionar anexos a este ticket');
    }

    // Atualizar ticket com novo anexo
    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        attachments: {
          push: filename,
        },
      },
    });

    return {
      filename,
      originalname,
      url: `/uploads/${filename}`,
    };
  }

  /**
   * Obtém caminho do anexo para download
   */
  async getAttachmentPath(ticketId: string, filename: string, userId: string, userRole: string) {
    // Verificar se ticket existe
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      throw new Error('Ticket não encontrado');
    }

    // Verificar permissão: criador, atribuído ou admin/atendente
    if (
      userRole === 'USER' ||
      ticket.createdById !== userId &&
      ticket.assignedToId !== userId &&
      userRole !== 'ADMIN' &&
      userRole !== 'ATTENDANT'
    ) {
      throw new Error('Você não tem permissão para acessar anexos deste ticket');
    }

    // Verificar se anexo existe
    if (!ticket.attachments.includes(filename)) {
      throw new Error('Anexo não encontrado');
    }

    // Verificar se arquivo existe fisicamente
    const path = require('path');
    const fs = require('fs');
    const filePath = path.join(__dirname, '../../uploads', filename);

    if (!fs.existsSync(filePath)) {
      throw new Error('Arquivo não encontrado no servidor');
    }

    return filePath;
  }

  /**
   * Remove um anexo do ticket
   */
  async deleteAttachment(ticketId: string, filename: string, userId: string, userRole: string) {
    // Verificar se ticket existe
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      throw new Error('Ticket não encontrado');
    }

    // Verificar permissão: criador ou admin/atendente
    if (userRole === 'USER' || (ticket.createdById !== userId && userRole !== 'ADMIN' && userRole !== 'ATTENDANT')) {
      throw new Error('Você não tem permissão para remover anexos deste ticket');
    }

    // Verificar se anexo existe
    if (!ticket.attachments.includes(filename)) {
      throw new Error('Anexo não encontrado');
    }

    // Remover anexo do array
    const updatedAttachments = ticket.attachments.filter((att) => att !== filename);

    // Atualizar ticket
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        attachments: updatedAttachments,
      },
    });

    // Deletar arquivo físico
    const { deleteFile } = require('../middlewares/upload');
    deleteFile(filename);
  }
}
