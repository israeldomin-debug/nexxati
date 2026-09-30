import { api } from './api';
import { Asset, Company, IpAddressSource, NetworkIpAddress, NetworkIpAddressInput, NetworkSegment, NetworkSegmentInput } from '../types';

export const ipAddressService = {
  async list(params?: { search?: string; source?: IpAddressSource | ''; active?: string; networkSegmentId?: string }) {
    const cleanParams = Object.fromEntries(
      Object.entries(params || {}).filter(([, value]) => value !== '' && value !== undefined && value !== null),
    );
    const response = await api.get<{ ipAddresses: NetworkIpAddress[] }>('/ip-addresses', { params: cleanParams });
    return response.data.ipAddresses;
  },
  async options() {
    const response = await api.get<{ assets: Asset[]; segments: NetworkSegment[]; companies: Company[] }>('/ip-addresses/options');
    return response.data;
  },
  async create(data: NetworkIpAddressInput) {
    const response = await api.post<{ ipAddress: NetworkIpAddress }>('/ip-addresses', data);
    return response.data.ipAddress;
  },
  async update(id: string, data: NetworkIpAddressInput) {
    const response = await api.patch<{ ipAddress: NetworkIpAddress }>(`/ip-addresses/${id}`, data);
    return response.data.ipAddress;
  },
  async delete(id: string, password: string) {
    await api.delete(`/ip-addresses/${id}`, { data: { password } });
  },
  async createSegment(data: NetworkSegmentInput) {
    const response = await api.post<{ segment: NetworkSegment }>('/ip-addresses/segments', data);
    return response.data.segment;
  },
};
