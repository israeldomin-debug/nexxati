import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type NotificationEventType = 'TICKET_CREATED' | 'TICKET_STATUS' | 'TICKET_COMMENT';

export interface NotificationEvent {
  id: string;
  type: NotificationEventType;
  title: string;
  message: string;
  occurredAt: Date;
  actorName: string;
  link?: string;
}

const statusLabels: Record<string, string> = {
  OPEN: 'Aberto',
  IN_ANALYSIS: 'Em Análise',
  IN_PROGRESS: 'Em Progresso',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
};

export class NotificationService {
  async recent(userId: string, role: 'USER' | 'ATTENDANT' | 'ADMIN', since?: Date, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 30);
    const sinceFilter = since ? { gt: since } : undefined;
    const userTicketScope = role === 'USER' ? { createdById: userId } : {};

    const [createdTickets, ticketHistory, comments] = await Promise.all([
      prisma.ticket.findMany({
        where: {
          ...userTicketScope,
          ...(sinceFilter ? { createdAt: sinceFilter } : {}),
        },
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, name: true } },
        },
      }),
      prisma.ticketHistory.findMany({
        where: {
          ...(sinceFilter ? { changedAt: sinceFilter } : {}),
          ticket: userTicketScope,
        },
        take,
        orderBy: { changedAt: 'desc' },
        include: {
          changedBy: { select: { id: true, name: true } },
          ticket: { select: { id: true, title: true } },
        },
      }),
      prisma.comment.findMany({
        where: {
          ...(sinceFilter ? { createdAt: sinceFilter } : {}),
          ticket: userTicketScope,
        },
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true } },
          ticket: { select: { id: true, title: true } },
        },
      }),
    ]);

    const events: NotificationEvent[] = [
      ...createdTickets.map((ticket) => ({
        id: `ticket-created:${ticket.id}:${ticket.createdAt.toISOString()}`,
        type: 'TICKET_CREATED' as const,
        title: 'Novo chamado',
        message: `${ticket.createdBy.name} abriu o chamado "${ticket.title}".`,
        occurredAt: ticket.createdAt,
        actorName: ticket.createdBy.name,
        link: `/tickets/${ticket.id}`,
      })),
      ...ticketHistory.map((history) => ({
        id: `ticket-status:${history.id}`,
        type: 'TICKET_STATUS' as const,
        title: 'Chamado atualizado',
        message: `${history.changedBy.name} alterou "${history.ticket.title}" para ${statusLabels[history.newStatus] || history.newStatus}.`,
        occurredAt: history.changedAt,
        actorName: history.changedBy.name,
        link: `/tickets/${history.ticket.id}`,
      })),
      ...comments.map((comment) => ({
        id: `ticket-comment:${comment.id}`,
        type: 'TICKET_COMMENT' as const,
        title: 'Novo comentário',
        message: `${comment.user.name} comentou no chamado "${comment.ticket.title}".`,
        occurredAt: comment.createdAt,
        actorName: comment.user.name,
        link: `/tickets/${comment.ticket.id}`,
      })),
    ];

    return events
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, take);
  }
}
