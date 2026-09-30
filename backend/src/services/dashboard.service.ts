import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class DashboardService {
  private formatBytes(bytes: number) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value.toLocaleString('pt-BR', { maximumFractionDigits: value >= 10 ? 1 : 2 })} ${units[index]}`;
  }

  private async getDatabaseUsage(userRole: string) {
    if (userRole !== 'ADMIN') return null;

    const [databaseSize] = await prisma.$queryRaw<Array<{
      databaseName: string;
      sizeBytes: bigint;
      prettySize: string;
    }>>`
      SELECT
        current_database() AS "databaseName",
        pg_database_size(current_database()) AS "sizeBytes",
        pg_size_pretty(pg_database_size(current_database())) AS "prettySize"
    `;

    const tableSizes = await prisma.$queryRaw<Array<{
      tableName: string;
      sizeBytes: bigint;
      prettySize: string;
    }>>`
      SELECT
        relname AS "tableName",
        pg_total_relation_size(c.oid) AS "sizeBytes",
        pg_size_pretty(pg_total_relation_size(c.oid)) AS "prettySize"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
      LIMIT 5
    `;

    const sizeBytes = Number(databaseSize?.sizeBytes || 0);

    return {
      databaseName: databaseSize?.databaseName || 'Banco de dados',
      sizeBytes,
      prettySize: databaseSize?.prettySize || this.formatBytes(sizeBytes),
      topTables: tableSizes.map((table) => {
        const tableBytes = Number(table.sizeBytes || 0);
        return {
          tableName: table.tableName,
          sizeBytes: tableBytes,
          prettySize: table.prettySize || this.formatBytes(tableBytes),
        };
      }),
    };
  }
  /**
   * Retorna métricas gerais do sistema
   */
  async getMetrics(userRole: string, userId?: string) {
    const whereClause = userRole === 'USER' ? { createdById: userId } : {};
    const today = new Date();
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const licenseWarningLimitUtc = todayUtc + 60 * 86_400_000;
    const todayStart = new Date(todayUtc);
    const licenseWarningLimit = new Date(licenseWarningLimitUtc);

    const [
      openTickets,
      inProgressTickets,
      completedTickets,
      databaseUsage,
      totalAssets,
      networkIps,
      assetIps,
      totalLicenses,
      disposalQuantity,
      upcomingLicenses,
    ] = await Promise.all([
      prisma.ticket.count({ where: { ...whereClause, status: 'OPEN' } }),
      prisma.ticket.count({
        where: { ...whereClause, status: { in: ['IN_ANALYSIS', 'IN_PROGRESS'] } },
      }),
      prisma.ticket.count({ where: { ...whereClause, status: 'COMPLETED' } }),
      this.getDatabaseUsage(userRole),
      prisma.asset.count(),
      prisma.networkIpAddress.findMany({ where: { active: true }, select: { ipAddress: true, source: true } }),
      prisma.asset.findMany({ where: { ipAddress: { not: null } }, select: { ipAddress: true, discoverySource: true } }),
      prisma.softwareLicense.count(),
      prisma.disposalItem.aggregate({ _sum: { quantity: true } }),
      prisma.softwareLicense.findMany({
        where: {
          isPerpetual: false,
          expiresAt: {
            gte: todayStart,
            lte: licenseWarningLimit,
          },
        },
        select: {
          id: true,
          softwareName: true,
          version: true,
          expiresAt: true,
          seats: true,
          ownerCompany: { select: { id: true, name: true, code: true } },
        },
        orderBy: { expiresAt: 'asc' },
      }),
    ]);

    const detectedIps = new Set([
      ...networkIps.filter((item) => item.source === 'DISCOVERY').map((item) => item.ipAddress),
      ...assetIps.filter((item) => Boolean(item.discoverySource)).map((item) => item.ipAddress).filter(Boolean),
    ]).size;
    const manualIps = new Set([
      ...networkIps.filter((item) => item.source === 'MANUAL').map((item) => item.ipAddress),
      ...assetIps.filter((item) => !item.discoverySource).map((item) => item.ipAddress).filter(Boolean),
    ]).size;

    // Métricas de atendente (apenas para ATTENDANT e ADMIN)
    // Tempo médio de resolução (apenas tickets completados)

    // Converte para horas com uma casa decimal para nÃ£o esconder resoluÃ§Ãµes rÃ¡pidas.

    return {
      summary: {
        open: openTickets,
        inProgress: inProgressTickets,
        completed: completedTickets,
      },
      databaseUsage,
      inventory: {
        assets: totalAssets,
        detectedIps,
        manualIps,
        licenses: totalLicenses,
        disposalItems: disposalQuantity._sum.quantity || 0,
      },
      attention: {
        upcomingLicenses: upcomingLicenses.map((license) => {
          const expiresAt = license.expiresAt!;
          const expiresAtUtc = Date.UTC(expiresAt.getUTCFullYear(), expiresAt.getUTCMonth(), expiresAt.getUTCDate());
          return {
            ...license,
            expiresAt: expiresAt.toISOString(),
            daysUntilExpiration: Math.max(0, Math.ceil((expiresAtUtc - todayUtc) / 86_400_000)),
          };
        }),
      },
    };
  }

  /**
   * Retorna tickets por período (últimos 7 dias)
   */
  async getTicketsTrend(userRole: string, userId?: string) {
    const whereClause = userRole === 'USER' ? { createdById: userId } : {};
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const tickets = await prisma.ticket.findMany({
      where: {
        ...whereClause,
        createdAt: { gte: sevenDaysAgo },
      },
      select: {
        createdAt: true,
        status: true,
      },
    });

    // Agrupa por dia
    const trendData: Record<string, { date: string; count: number }> = {};

    tickets.forEach((ticket) => {
      const dateKey = ticket.createdAt.toISOString().split('T')[0];
      if (!trendData[dateKey]) {
        trendData[dateKey] = { date: dateKey, count: 0 };
      }
      trendData[dateKey].count++;
    });

    return Object.values(trendData).sort((a, b) => a.date.localeCompare(b.date));
  }
}
