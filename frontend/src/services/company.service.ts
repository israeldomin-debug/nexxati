import { api } from './api';
import { Company, CompanyInput } from '../types';

export const companyService = {
  async list(search?: string): Promise<Company[]> {
    const response = await api.get<{ companies: Company[] }>('/companies', { params: { search } });
    return response.data.companies;
  },
  async create(data: CompanyInput): Promise<Company> {
    const response = await api.post<{ company: Company }>('/companies', data);
    return response.data.company;
  },
  async update(id: string, data: Partial<CompanyInput>): Promise<Company> {
    const response = await api.patch<{ company: Company }>(`/companies/${id}`, data);
    return response.data.company;
  },
  async delete(id: string, password: string): Promise<void> {
    await api.delete(`/companies/${id}`, { data: { password } });
  },
};
