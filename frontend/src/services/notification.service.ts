import { api } from './api';
import { NotificationResponse } from '../types';

export const notificationService = {
  async recent(since?: string, limit = 20): Promise<NotificationResponse> {
    const response = await api.get<NotificationResponse>('/notifications/recent', {
      params: { since, limit },
    });
    return response.data;
  },
};
