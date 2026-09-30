import { Request, Response } from 'express';
import { NotificationService } from '../services/notification.service';

const service = new NotificationService();

export class NotificationController {
  async recent(req: Request, res: Response) {
    try {
      const since = typeof req.query.since === 'string' && req.query.since
        ? new Date(req.query.since)
        : undefined;

      const safeSince = since && !Number.isNaN(since.getTime()) ? since : undefined;
      const limit = Number(req.query.limit || 20);
      const events = await service.recent(req.user!.id, req.user!.role, safeSince, limit);

      return res.json({
        serverTime: new Date().toISOString(),
        events: events.map((event) => ({
          ...event,
          occurredAt: event.occurredAt.toISOString(),
        })),
      });
    } catch (error) {
      console.error('Erro ao buscar notificações:', error);
      return res.status(500).json({ error: 'Não foi possível buscar notificações' });
    }
  }
}
