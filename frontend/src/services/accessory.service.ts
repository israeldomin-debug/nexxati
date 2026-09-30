import { api } from './api';
import { Accessory, AccessoryInput, AccessoryMovement, AccessoryMovementInput } from '../types';

export const accessoryService = {
  async list(search?: string, status: 'ACTIVE' | 'TRASH' = 'ACTIVE'): Promise<Accessory[]> {
    const response = await api.get<{ accessories: Accessory[] }>('/accessories', { params: { ...(search ? { search } : {}), status } });
    return response.data.accessories;
  },

  async create(data: AccessoryInput): Promise<Accessory> {
    const response = await api.post<{ accessory: Accessory }>('/accessories', data);
    return response.data.accessory;
  },

  async update(id: string, data: Partial<AccessoryInput>): Promise<Accessory> {
    const response = await api.patch<{ accessory: Accessory }>(`/accessories/${id}`, data);
    return response.data.accessory;
  },

  async uploadImage(id: string, file: File): Promise<Accessory> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<{ accessory: Accessory }>(`/accessories/${id}/image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.accessory;
  },

  async delete(id: string, password: string): Promise<void> {
    await api.delete(`/accessories/${id}`, { data: { password } });
  },
  async restore(id: string): Promise<Accessory> {
    const response = await api.post<{ accessory: Accessory }>(`/accessories/${id}/restore`);
    return response.data.accessory;
  },
  async move(id: string, data: AccessoryMovementInput): Promise<{ accessory: Accessory; movement: AccessoryMovement }> {
    const response = await api.post<{ accessory: Accessory; movement: AccessoryMovement }>(`/accessories/${id}/movements`, data);
    return response.data;
  },
  async movements(limit = 50): Promise<AccessoryMovement[]> {
    const response = await api.get<{ movements: AccessoryMovement[] }>('/accessories/movements', { params: { limit } });
    return response.data.movements;
  },
  async cancelMovement(movementId: string, password: string, reason: string): Promise<{ accessory: Accessory; movement: AccessoryMovement }> {
    const response = await api.post<{ accessory: Accessory; movement: AccessoryMovement }>(`/accessories/movements/${movementId}/cancel`, { password, reason });
    return response.data;
  },
  async updateMovement(movementId: string, data: { reason?: string | null }): Promise<AccessoryMovement> {
    const response = await api.patch<{ movement: AccessoryMovement }>(`/accessories/movements/${movementId}`, data);
    return response.data.movement;
  },
  async transfer(id: string, data: { fromBalanceId: string; toCompanyId?: string | null; toLocation?: string | null; quantity: number }): Promise<Accessory> {
    const response = await api.post<{ accessory: Accessory }>(`/accessories/${id}/transfer`, data);
    return response.data.accessory;
  },
};
