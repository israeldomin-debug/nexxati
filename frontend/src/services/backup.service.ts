import { api } from './api';
import axios from 'axios';
import { branding } from '../config/branding';

export interface AutomaticBackupStatus {
  running: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastFilename: string | null;
  lastSizeBytes: number | null;
  verified: boolean;
  destinationCopied: boolean;
  error: string | null;
}

async function readBackupApiError(error: unknown) {
  if (!axios.isAxiosError(error)) return error;
  const data = error.response?.data;
  if (data instanceof Blob) {
    const text = await data.text();
    let message = text;
    try {
      const parsed = JSON.parse(text);
      message = parsed.error || parsed.message || text;
    } catch {
      message = text;
    }
    throw new Error(message || 'Erro ao comunicar com o servidor');
  }
  throw error;
}

export const backupService = {
  async automaticStatus(): Promise<AutomaticBackupStatus> {
    const response = await api.get<{ status: AutomaticBackupStatus }>('/backup/status');
    return response.data.status;
  },
  async runAutomatic(): Promise<AutomaticBackupStatus> {
    const response = await api.post<{ status: AutomaticBackupStatus }>('/backup/automatic/run');
    return response.data.status;
  },
  async downloadBackup() {
    try {
      const response = await api.get('/backup/download', { responseType: 'blob' });
      const disposition = response.headers['content-disposition'] || '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const slug = branding.appName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const filename = match?.[1] || `${slug}-backup-completo-${new Date().toISOString().slice(0, 10)}.hdfbackup`;
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      await readBackupApiError(error);
      throw error;
    }
  },

  async restoreBackup(file: File) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post<{ message: string }>('/backup/restore', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    } catch (error) {
      await readBackupApiError(error);
      throw error;
    }
  },
};
