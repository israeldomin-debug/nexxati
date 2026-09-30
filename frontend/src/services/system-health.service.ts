import { api } from './api';

export interface SystemHealth {
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  checkedAt: string;
  responseTimeMs: number;
  uptimeSeconds: number;
  memory: { rssBytes: number; heapUsedBytes: number };
  database: { ok: boolean; latencyMs: number; migrations: number; error: string | null };
  disk: { totalBytes: number; freeBytes: number; usedPercent: number };
  uploads: { files: number; bytes: number };
  backup: { lastSuccessAt: string | null; lastFilename: string | null; lastSizeBytes: number | null; verified: boolean; destinationCopied: boolean; error: string | null; running: boolean; ageHours: number | null };
  agents: {
    total: number;
    online: number;
    currentVersion: string | null;
    items: Array<{
      id: string;
      agentName: string;
      computerName: string;
      lastSeenAt: string;
      online: boolean;
      minutesSinceLastSeen: number;
      agentVersion: string | null;
      versionCurrent: boolean;
      updateStatus: 'CURRENT' | 'DOWNLOADING' | 'INSTALLING' | 'FAILED' | null;
      updateTargetVersion: string | null;
      updateError: string | null;
      lastUpdateCheckAt: string | null;
    }>;
  };
  maintenance: { overdue: number; upcoming: number };
  warnings: string[];
}

export const systemHealthService = {
  async get(): Promise<SystemHealth> {
    const response = await api.get<{ health: SystemHealth }>('/system-health');
    const health = response.data.health;
    const currentVersion = health.agents.currentVersion;
    const now = Date.now();
    return {
      ...health,
      agents: {
        ...health.agents,
        currentVersion,
        items: health.agents.items.map((agent) => {
          const lastSeenTime = new Date(agent.lastSeenAt).getTime();
          const minutesSinceLastSeen = Number.isFinite(agent.minutesSinceLastSeen)
            ? agent.minutesSinceLastSeen
            : Math.max(0, Math.floor((now - lastSeenTime) / 60_000));
          const online = typeof agent.online === 'boolean' ? agent.online : minutesSinceLastSeen < 5;
          const versionCurrent = typeof agent.versionCurrent === 'boolean'
            ? agent.versionCurrent
            : Boolean(currentVersion && agent.agentVersion === currentVersion);
          return { ...agent, minutesSinceLastSeen, online, versionCurrent };
        }),
      },
    };
  },
};
