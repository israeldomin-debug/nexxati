import { api } from './api';
import { DashboardMetrics, TrendData } from '@/types';

export const dashboardService = {
  /**
   * Busca métricas do dashboard
   */
  async getMetrics(): Promise<DashboardMetrics> {
    const response = await api.get<DashboardMetrics>('/dashboard/metrics');
    return response.data;
  },

  /**
   * Busca tendência de tickets (últimos 7 dias)
   */
  async getTrend(): Promise<TrendData[]> {
    const response = await api.get<{ trend: TrendData[] }>('/dashboard/trend');
    return response.data.trend;
  },
};
