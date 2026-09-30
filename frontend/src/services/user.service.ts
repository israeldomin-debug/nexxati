import { api } from './api';
import { User, UserPermission } from '../types';

export interface CreateUserData {
  name: string;
  username: string;
  email: string;
  password: string;
  role: 'USER' | 'ATTENDANT' | 'ADMIN';
  mustChangePassword?: boolean;
  permissions?: UserPermission[];
}

export interface UpdateUserData {
  name?: string;
  username?: string;
  email?: string;
  password?: string;
  role?: 'USER' | 'ATTENDANT' | 'ADMIN';
  active?: boolean;
  mustChangePassword?: boolean;
  permissions?: UserPermission[];
}

export interface ImportUsersPayload {
  users: Array<{
    name: string;
    username: string;
    email: string;
    password: string;
  }>;
  mustChangePassword: boolean;
}

export interface ImportUsersResult {
  total: number;
  createdCount: number;
  skippedCount: number;
  created: Array<{ id: string; name: string; username: string | null; email: string }>;
  skipped: Array<{ row: number; identifier: string; reason: string }>;
}

export const userService = {
  /**
   * Lista todos os usuários (admin/atendente)
   */
  async getAllUsers(): Promise<User[]> {
    const response = await api.get<{ users: User[] }>('/users');
    return response.data.users;
  },

  /**
   * Busca usuário por ID
   */
  async getUserById(id: string): Promise<User> {
    const response = await api.get<{ user: User }>(`/users/${id}`);
    return response.data.user;
  },

  async uploadAvatar(id: string, file: File): Promise<User> {
    const data = new FormData();
    data.append('file', file);
    const response = await api.post<{ user: User }>(`/users/${id}/avatar`, data);
    return response.data.user;
  },

  async selectAvatar(id: string, preset: 'ROBOT' | 'EMO' | 'NEXO' | 'PULSE' | 'BYTE'): Promise<User> {
    const response = await api.patch<{ user: User }>(`/users/${id}/avatar/preset`, { preset });
    return response.data.user;
  },

  async updateThemePreference(id: string, themePreference: User['themePreference']): Promise<User> {
    const response = await api.patch<{ user: User }>(`/users/${id}/preferences`, { themePreference });
    return response.data.user;
  },

  async updateAppearanceMode(id: string, appearanceMode: User['appearanceMode']): Promise<User> {
    const response = await api.patch<{ user: User }>(`/users/${id}/preferences`, { appearanceMode });
    return response.data.user;
  },

  /**
   * Cria novo usuário (admin apenas)
   */
  async create(data: CreateUserData): Promise<User> {
    const response = await api.post<{ user: User }>('/users', data);
    return response.data.user;
  },

  async importUsers(data: ImportUsersPayload): Promise<ImportUsersResult> {
    const response = await api.post<ImportUsersResult>('/users/import', data);
    return response.data;
  },

  /**
   * Atualiza usuário (admin apenas)
   */
  async update(id: string, data: UpdateUserData): Promise<User> {
    const response = await api.patch<{ user: User }>(`/users/${id}`, data);
    return response.data.user;
  },

  async resetPassword(id: string): Promise<{ user: User; temporaryPassword: string; message: string }> {
    const response = await api.post<{ user: User; temporaryPassword: string; message: string }>(`/users/${id}/reset-password`);
    return response.data;
  },

  /**
   * Deleta usuário (admin apenas)
   */
  async delete(id: string, password: string): Promise<void> {
    await api.delete(`/users/${id}`, { data: { password } });
  },
};
