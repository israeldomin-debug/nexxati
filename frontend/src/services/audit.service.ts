import { api } from './api';

export interface AuditEvent {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | string;
  resourceType: string;
  resourceId: string | null;
  resourceName: string;
  changedFields: string[];
  details: Record<string, unknown> | null;
  performedBy: { id: string; name: string; email: string } | null;
  createdAt: string;
}

export const auditService = {
  async list(params?: { action?: string; resourceType?: string; search?: string }) {
    const response = await api.get<{ events: AuditEvent[] }>('/audit', { params });
    return response.data.events;
  },
};
