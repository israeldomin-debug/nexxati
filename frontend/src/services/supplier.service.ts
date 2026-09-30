import { api } from './api';
import { Supplier, SupplierInput } from '../types';

export const supplierService = {
  async list(search?: string) {
    const response = await api.get<{ suppliers: Supplier[] }>('/suppliers', {
      params: search ? { search } : undefined,
    });
    return response.data.suppliers;
  },

  async findById(id: string) {
    const response = await api.get<{ supplier: Supplier }>(`/suppliers/${id}`);
    return response.data.supplier;
  },

  async create(data: SupplierInput) {
    const response = await api.post<{ supplier: Supplier }>('/suppliers', data);
    return response.data.supplier;
  },

  async update(id: string, data: Partial<SupplierInput>) {
    const response = await api.patch<{ supplier: Supplier }>(`/suppliers/${id}`, data);
    return response.data.supplier;
  },

  async delete(id: string, password: string) {
    await api.delete(`/suppliers/${id}`, { data: { password } });
  },
};
