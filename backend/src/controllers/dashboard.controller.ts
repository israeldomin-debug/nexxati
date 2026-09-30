import { Request, Response } from 'express';
import { DashboardService } from '../services/dashboard.service';
import { AuthRequest } from '../middlewares/auth.middleware';

const dashboardService = new DashboardService();

export class DashboardController {
  /**
   * GET /api/dashboard/metrics
   * Retorna métricas do dashboard
   */
  async getMetrics(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      const userRole = authReq.user!.role;
      const userId = authReq.user!.userId;

      const metrics = await dashboardService.getMetrics(userRole, userId);

      return res.status(200).json(metrics);
    } catch (error) {
      console.error('Erro ao buscar métricas:', error);
      return res.status(500).json({
        error: 'Erro ao buscar métricas do dashboard',
        code: 'DASHBOARD_METRICS_ERROR',
      });
    }
  }

  /**
   * GET /api/dashboard/trend
   * Retorna tendência de tickets (últimos 7 dias)
   */
  async getTrend(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      const userRole = authReq.user!.role;
      const userId = authReq.user!.userId;

      const trend = await dashboardService.getTicketsTrend(userRole, userId);

      return res.status(200).json({ trend });
    } catch (error) {
      console.error('Erro ao buscar tendência:', error);
      return res.status(500).json({
        error: 'Erro ao buscar tendência de tickets',
        code: 'DASHBOARD_TREND_ERROR',
      });
    }
  }
}
