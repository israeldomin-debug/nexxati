import { api } from './api';
import { Asset, NetworkIpAddress, PasswordVaultDeviceType, PasswordVaultEntry, PasswordVaultEntryType, PasswordVaultInput } from '../types';

export const passwordVaultService = {
  async list(params?: { search?: string; entryType?: PasswordVaultEntryType | ''; deviceType?: PasswordVaultDeviceType | ''; active?: string }) {
    const cleanParams = Object.fromEntries(Object.entries(params || {}).filter(([, value]) => value !== '' && value !== undefined));
    const response = await api.get<{ entries: PasswordVaultEntry[] }>('/password-vault', { params: cleanParams });
    return response.data.entries;
  },

  async options() {
    const response = await api.get<{
      ipAddresses: Array<Pick<NetworkIpAddress, 'id' | 'ipAddress' | 'hostname' | 'description' | 'assetId'>>;
      assets: Array<Pick<Asset, 'id' | 'name' | 'assetTag' | 'type' | 'category' | 'ipAddress' | 'hostname' | 'assignedTo'>>;
    }>('/password-vault/options');
    return response.data;
  },

  async create(data: PasswordVaultInput) {
    const response = await api.post<{ entry: PasswordVaultEntry }>('/password-vault', data);
    return response.data.entry;
  },

  async update(id: string, data: Partial<PasswordVaultInput>) {
    const response = await api.patch<{ entry: PasswordVaultEntry }>(`/password-vault/${id}`, data);
    return response.data.entry;
  },

  async inspect(id: string) {
    const response = await api.post<{ inspection: {
      entryId: string;
      assetId: string | null;
      host: string;
      reachable: boolean;
      status: number;
      managementUrl: string;
      manufacturer: string | null;
      model: string | null;
      modelFullName: string | null;
      firmware: string | null;
      serialNumber: string | null;
      macAddress: string | null;
      title: string | null;
      credentialAvailable: boolean;
      authenticated: boolean;
      authentication: 'AUTHENTICATED' | 'WEB_FORM' | 'BASIC_ATTEMPTED' | 'NOT_REQUIRED';
      message: string;
    } }>(`/password-vault/${id}/inspect`);
    return response.data.inspection;
  },

  async reveal(id: string, password: string) {
    const response = await api.post<{ entry: PasswordVaultEntry }>(`/password-vault/${id}/reveal`, { password });
    return response.data.entry;
  },

  async delete(id: string, password: string) {
    await api.delete(`/password-vault/${id}`, { data: { password } });
  },
};
