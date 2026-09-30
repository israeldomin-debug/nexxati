import { api } from './api';
import {
  Ticket,
  TicketDetail,
  CreateTicketData,
  UpdateTicketData,
  TicketFilters,
  TicketListResponse,
  TicketResolutionMetrics,
  Comment,
} from '@/types';

export const ticketService = {
  async deviceContext(): Promise<{
    found: boolean;
    agentId?: string;
    hostname?: string;
    computerUser?: string | null;
    deviceIp?: string | null;
    lastSeenAt?: string;
    asset?: { id: string; assetTag: string; name: string } | null;
  }> {
    const response = await api.get<{ context: {
      found: boolean;
      agentId?: string;
      hostname?: string;
      computerUser?: string | null;
      deviceIp?: string | null;
      lastSeenAt?: string;
      asset?: { id: string; assetTag: string; name: string } | null;
    } }>('/tickets/device-context');
    return response.data.context;
  },

  async resolutionMetrics(): Promise<TicketResolutionMetrics> {
    const response = await api.get<{ metrics: TicketResolutionMetrics }>('/tickets/metrics/resolution');
    return response.data.metrics;
  },

  /**
   * Lista tickets com filtros
   */
  async list(filters?: TicketFilters): Promise<TicketListResponse> {
    const response = await api.get<TicketListResponse>('/tickets', { params: filters });
    return response.data;
  },

  /**
   * Busca ticket por ID
   */
  async getById(id: string): Promise<TicketDetail> {
    const response = await api.get<{ ticket: TicketDetail }>(`/tickets/${id}`);
    return response.data.ticket;
  },

  /**
   * Cria novo ticket
   */
  async create(data: CreateTicketData): Promise<Ticket> {
    const response = await api.post<{ ticket: Ticket }>('/tickets', data);
    return response.data.ticket;
  },

  /**
   * Atualiza ticket
   */
  async update(id: string, data: UpdateTicketData): Promise<Ticket> {
    const response = await api.patch<{ ticket: Ticket }>(`/tickets/${id}`, data);
    return response.data.ticket;
  },

  /**
   * Deleta ticket (Admin apenas)
   */
  async delete(id: string, password: string): Promise<void> {
    await api.delete(`/tickets/${id}`, { data: { password } });
  },

  /**
   * Adiciona comentário
   */
  async addComment(ticketId: string, message: string): Promise<Comment> {
    const response = await api.post<{ comment: Comment }>(`/tickets/${ticketId}/comments`, {
      message,
    });
    return response.data.comment;
  },

  /**
   * Faz upload de anexo (PDF)
   */
  async uploadAttachment(ticketId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post(`/tickets/${ticketId}/attachments`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Baixa um anexo
   */
  async downloadAttachment(ticketId: string, filename: string) {
    const response = await api.get(`/tickets/${ticketId}/attachments/${filename}`, {
      responseType: 'blob',
    });

    // Criar link de download
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  async getAttachmentObjectUrl(ticketId: string, filename: string): Promise<string> {
    const response = await api.get(`/tickets/${ticketId}/attachments/${filename}`, {
      responseType: 'blob',
    });

    return window.URL.createObjectURL(response.data);
  },

  /**
   * Deleta um anexo
   */
  async deleteAttachment(ticketId: string, filename: string) {
    const response = await api.delete(`/tickets/${ticketId}/attachments/${filename}`);
    return response.data;
  },
};
