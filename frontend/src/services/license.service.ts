import { api } from './api';
import { Asset, Company, SoftwareLicense, SoftwareLicenseInput, Supplier } from '../types';

export const licenseService = {
  async list(params?: { search?: string; ownerCompanyId?: string }) {
    const response = await api.get<{ licenses: SoftwareLicense[] }>('/licenses', { params });
    return response.data.licenses;
  },
  async options() {
    const response = await api.get<{ companies: Company[]; assets: Asset[]; suppliers: Supplier[] }>('/licenses/options');
    return response.data;
  },
  async create(data: SoftwareLicenseInput) {
    const response = await api.post<{ license: SoftwareLicense }>('/licenses', data);
    return response.data.license;
  },
  async update(id: string, data: SoftwareLicenseInput) {
    const response = await api.patch<{ license: SoftwareLicense }>(`/licenses/${id}`, data);
    return response.data.license;
  },
  async delete(id: string, password: string) {
    await api.delete(`/licenses/${id}`, { data: { password } });
  },
};
