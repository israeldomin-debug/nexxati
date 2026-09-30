import { api } from './api';
import { DisposalInput, DisposalItem } from '../types';

export const disposalService = {
  async list(search?: string): Promise<DisposalItem[]> {
    const response = await api.get<{ disposals: DisposalItem[] }>('/disposals', { params: search ? { search } : {} });
    return response.data.disposals;
  },

  async create(data: DisposalInput): Promise<DisposalItem> {
    const response = await api.post<{ disposal: DisposalItem }>('/disposals', data);
    return response.data.disposal;
  },

  async delete(id: string, password: string): Promise<void> {
    await api.delete(`/disposals/${id}`, { data: { password } });
  },
};
