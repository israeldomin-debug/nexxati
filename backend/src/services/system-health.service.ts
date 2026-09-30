import fs from 'fs';
import path from 'path';
import { AssetStatus, PrismaClient } from '@prisma/client';
import { BackupService } from './backup.service';
import { AgentUpdateService } from './agent-update.service';

const prisma = new PrismaClient();
const backupService = new BackupService();
const agentUpdateService = new AgentUpdateService();
const uploadsDir = path.join(__dirname, '../../uploads');
const backendDir = path.join(__dirname, '../..');

const directoryStats = (directory: string) => {
  if (!fs.existsSync(directory)) return { files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile()) { files++; bytes += fs.statSync(entryPath).size; }
    }
  };
  visit(directory);
  return { files, bytes };
};

export class SystemHealthService {
  async get() {
    const startedAt = Date.now();
    let database = { ok: false, latencyMs: 0, migrations: 0, error: null as string | null };
    try {
      const databaseStartedAt = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      const migrations = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`;
      database = { ok: true, latencyMs: Date.now() - databaseStartedAt, migrations: Number(migrations[0]?.count || 0), error: null };
    } catch (error) {
      database = { ok: false, latencyMs: 0, migrations: 0, error: error instanceof Error ? error.message : 'Banco indisponível' };
    }

    const uploads = directoryStats(uploadsDir);
    const disk = fs.statfsSync(backendDir);
    const diskTotalBytes = Number(disk.blocks) * Number(disk.bsize);
    const diskFreeBytes = Number(disk.bavail) * Number(disk.bsize);
    const agentOnlineSince = new Date(Date.now() - 5 * 60_000);
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const inThirtyDays = new Date(today.getTime() + 30 * 86_400_000);
    const activeAsset = { status: { notIn: [AssetStatus.RETIRED, AssetStatus.DONOR] } };
    const [agentTotal, agentOnline, agents, maintenanceOverdue, maintenanceUpcoming] = await Promise.all([
      prisma.remoteDiscoveryAgent.count(),
      prisma.remoteDiscoveryAgent.count({ where: { lastSeenAt: { gte: agentOnlineSince } } }),
      prisma.remoteDiscoveryAgent.findMany({ orderBy: { lastSeenAt: 'desc' }, take: 20, select: { id: true, agentName: true, computerName: true, lastSeenAt: true, agentInfo: true } }),
      prisma.asset.count({ where: { ...activeAsset, nextMaintenanceAt: { lt: today } } }),
      prisma.asset.count({ where: { ...activeAsset, nextMaintenanceAt: { gte: today, lte: inThirtyDays } } }),
    ]);
    const backup = backupService.getAutomaticStatus();
    const backupAgeHours = backup.lastSuccessAt ? (Date.now() - new Date(backup.lastSuccessAt).getTime()) / 3_600_000 : null;
    const warnings: string[] = [];
    if (!database.ok) warnings.push('Banco de dados indisponível');
    if (!backup.lastSuccessAt) warnings.push('Backup automático ainda não executado');
    else if ((backupAgeHours || 0) > 26) warnings.push('Backup automático atrasado');
    if (!backup.verified && backup.lastSuccessAt) warnings.push('Último backup não foi verificado');
    if (diskFreeBytes / diskTotalBytes < 0.15) warnings.push('Espaço livre em disco abaixo de 15%');
    if (backup.error) warnings.push('Última tentativa de backup falhou');
    if (!process.env.VAULT_ENCRYPTION_KEY) warnings.push('Chave exclusiva do cofre não configurada');
    if (maintenanceOverdue) warnings.push(`${maintenanceOverdue} ativo(s) com manutenção preventiva vencida`);

    if (agentTotal > agentOnline) warnings.push(`${agentTotal - agentOnline} agente(s) sem comunicacao nos ultimos 5 minutos`);
    const currentAgentVersion = agentUpdateService.currentVersion();
    const agentItems = agents.map((agent) => {
      const info = agent.agentInfo && typeof agent.agentInfo === 'object' && !Array.isArray(agent.agentInfo)
        ? agent.agentInfo as Record<string, unknown>
        : {};
      const agentVersion = typeof info.agentVersion === 'string' ? info.agentVersion : null;
      const updateStatus = typeof info.updateStatus === 'string' ? info.updateStatus : null;
      const updateTargetVersion = typeof info.updateTargetVersion === 'string' ? info.updateTargetVersion : null;
      const updateError = typeof info.updateError === 'string' ? info.updateError : null;
      const lastUpdateCheckAt = typeof info.lastUpdateCheckAt === 'string' ? info.lastUpdateCheckAt : null;
      return {
        id: agent.id,
        agentName: agent.agentName,
        computerName: agent.computerName,
        lastSeenAt: agent.lastSeenAt,
        online: agent.lastSeenAt >= agentOnlineSince,
        minutesSinceLastSeen: Math.max(0, Math.floor((Date.now() - agent.lastSeenAt.getTime()) / 60_000)),
        agentVersion,
        versionCurrent: Boolean(currentAgentVersion && agentVersion === currentAgentVersion),
        updateStatus,
        updateTargetVersion,
        updateError,
        lastUpdateCheckAt,
      };
    });

    return {
      status: database.ok && !warnings.length ? 'HEALTHY' : database.ok ? 'WARNING' : 'CRITICAL',
      checkedAt: new Date().toISOString(),
      responseTimeMs: Date.now() - startedAt,
      uptimeSeconds: Math.round(process.uptime()),
      memory: { rssBytes: process.memoryUsage().rss, heapUsedBytes: process.memoryUsage().heapUsed },
      database,
      disk: { totalBytes: diskTotalBytes, freeBytes: diskFreeBytes, usedPercent: Math.round((1 - diskFreeBytes / diskTotalBytes) * 1000) / 10 },
      uploads,
      backup: { ...backup, ageHours: backupAgeHours },
      agents: { total: agentTotal, online: agentOnline, currentVersion: currentAgentVersion, items: agentItems },
      maintenance: { overdue: maintenanceOverdue, upcoming: maintenanceUpcoming },
      warnings,
    };
  }
}
