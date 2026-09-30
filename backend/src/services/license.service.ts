import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const licenseAssetSelect = {
  id: true,
  name: true,
  assetTag: true,
  ipAddress: true,
  hostname: true,
  companyId: true,
  company: { select: { id: true, name: true, code: true } },
} as const;

const assignmentHistoryInclude = {
  asset: { select: licenseAssetSelect },
  performedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.SoftwareLicenseAssignmentHistoryInclude;

const normalizeSoftwareName = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const softwareMatchesLicense = (applicationName: string, licenseName: string, organizationNames: string[] = []) => {
  const application = normalizeSoftwareName(applicationName);
  const licensedSoftware = normalizeSoftwareName(licenseName);
  if (!application || !licensedSoftware || licensedSoftware.length < 4) return false;
  if (application.includes(licensedSoftware) || licensedSoftware.includes(application)) return true;

  const organizationTokens = organizationNames.flatMap((name) => normalizeSoftwareName(name).split(' '));
  const ignored = new Set(['software', 'licenca', 'license', 'assinatura', ...organizationTokens]);
  const tokens = licensedSoftware.split(' ').filter((token) => token.length >= 3 && !ignored.has(token));
  return tokens.length > 0 && tokens.every((token) => application.includes(token));
};

const companyBrand = (name: string | null | undefined) => {
  const ignored = new Set(['grupo', 'comercio', 'mineracoes', 'mineracao', 'industria', 'servicos', 'ltda', 'sa']);
  return normalizeSoftwareName(name || '').split(' ').find((token) => token.length >= 3 && !ignored.has(token)) || '';
};

const belongsToLicenseCompany = (
  assetCompany: { id: string; name: string; code: string } | null,
  ownerCompany: { id?: string | null; name?: string | null; code?: string | null } | null | undefined,
) => {
  if (!ownerCompany) return true;
  if (!assetCompany) return false;
  if (ownerCompany.id && assetCompany.id === ownerCompany.id) return true;
  const ownerBrand = companyBrand(ownerCompany.name);
  return Boolean(ownerBrand && ownerBrand === companyBrand(assetCompany.name));
};

const uniqueAssetIdsWithinLimit = (assetIds: string[], seats: number) => {
  const uniqueAssetIds = [...new Set(assetIds)];
  if (uniqueAssetIds.length > seats) {
    throw new Error(`A licença possui ${seats} posição(ões), mas ${uniqueAssetIds.length} ativos foram selecionados`);
  }
  return uniqueAssetIds;
};

const dateSchema = z.string().trim().optional().nullable().transform((value) => value || null);

export const licenseInputSchema = z.object({
  softwareName: z.string().trim().min(2, 'Informe o nome do software'),
  version: z.string().trim().optional().nullable(),
  ownerCompanyId: z.string().uuid().optional().nullable(),
  invoiceNumber: z.string().trim().optional().nullable(),
  licenseNumber: z.string().trim().min(2, 'Informe o número da licença'),
  supplierId: z.string().uuid().optional().nullable(),
  purchasedFrom: z.string().trim().optional().nullable(),
  purchaseDate: dateSchema,
  seats: z.number().int().positive().default(1),
  isPerpetual: z.boolean().default(false),
  expiresAt: dateSchema,
  notes: z.string().trim().optional().nullable(),
  assetIds: z.array(z.string().uuid()).default([]),
}).superRefine((value, context) => {
  if (!value.isPerpetual && !value.expiresAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'Informe a data de vencimento ou marque a licença como vitalícia' });
  }
});

export const licenseListSchema = z.object({
  search: z.string().trim().optional(),
  ownerCompanyId: z.string().uuid().optional(),
});

export class LicenseService {
  private async withAgentDetections<T extends Array<{ id: string; softwareName: string; seats: number; assets: any[]; ownerCompany?: { id?: string | null; name?: string | null; code?: string | null } | null }>>(licenses: T) {
    if (!licenses.length) return licenses;

    const [agents, assets] = await Promise.all([
      prisma.remoteDiscoveryAgent.findMany({
        select: { computerName: true, lastSeenAt: true, agentInfo: true },
      }),
      prisma.asset.findMany({ select: licenseAssetSelect }),
    ]);

    const byComputerName = new Map<string, (typeof assets)[number]>();
    const byIp = new Map<string, (typeof assets)[number]>();
    for (const asset of assets) {
      for (const value of [asset.hostname, asset.name]) {
        if (value) byComputerName.set(value.trim().toLowerCase(), asset);
      }
      if (asset.ipAddress) byIp.set(asset.ipAddress.trim(), asset);
    }

    const detections = new Map<string, Map<string, { applicationName: string; applicationVersion: string | null; lastSeenAt: Date }>>();
    for (const agent of agents) {
      const info = agent.agentInfo && typeof agent.agentInfo === 'object' && !Array.isArray(agent.agentInfo)
        ? agent.agentInfo as Record<string, unknown>
        : {};
      const applications = Array.isArray(info.installedApplications)
        ? info.installedApplications.flatMap((item) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
            const record = item as Record<string, unknown>;
            const name = typeof record.name === 'string' ? record.name.trim() : '';
            if (!name) return [];
            return [{ name, version: typeof record.version === 'string' ? record.version.trim() || null : null }];
          })
        : [];
      if (!applications.length) continue;

      let asset = byComputerName.get(agent.computerName.trim().toLowerCase());
      if (!asset && Array.isArray(info.networkAdapters)) {
        const ips = info.networkAdapters.flatMap((adapter) => {
          if (!adapter || typeof adapter !== 'object' || Array.isArray(adapter)) return [];
          const addresses = (adapter as Record<string, unknown>).ipAddresses;
          return Array.isArray(addresses) ? addresses.filter((ip): ip is string => typeof ip === 'string') : [];
        });
        asset = ips.map((ip) => byIp.get(ip)).find(Boolean);
      }
      if (!asset) continue;

      for (const license of licenses) {
        if (!belongsToLicenseCompany(asset.company, license.ownerCompany)) continue;
        const matchingApplications = applications.filter((item) => softwareMatchesLicense(item.name, license.softwareName, [license.ownerCompany?.name || '', license.ownerCompany?.code || '']));
        const licensedName = normalizeSoftwareName(license.softwareName);
        const application = matchingApplications.find((item) => {
          const applicationName = normalizeSoftwareName(item.name);
          return !(applicationName.includes('network agent') && !licensedName.includes('network agent'));
        });
        if (!application) continue;
        const byAsset = detections.get(license.id) || new Map();
        byAsset.set(asset.id, {
          applicationName: application.name,
          applicationVersion: application.version,
          lastSeenAt: agent.lastSeenAt,
        });
        detections.set(license.id, byAsset);
      }
    }

    return licenses.map((license) => {
      const detectedForLicense = detections.get(license.id) || new Map();
      const mergedAssets = license.assets.map((link) => {
        const detected = detectedForLicense.get(link.assetId);
        if (detected) detectedForLicense.delete(link.assetId);
        return {
          ...link,
          source: detected ? 'MANUAL_AND_AGENT' : 'MANUAL',
          detectedByAgent: Boolean(detected),
          detectedApplicationName: detected?.applicationName || null,
          detectedApplicationVersion: detected?.applicationVersion || null,
          lastDetectedAt: detected?.lastSeenAt || null,
        };
      });

      for (const [assetId, detected] of detectedForLicense) {
        const asset = assets.find((item) => item.id === assetId);
        if (!asset) continue;
        mergedAssets.push({
          id: `agent-${license.id}-${assetId}`,
          licenseId: license.id,
          assetId,
          createdAt: detected.lastSeenAt,
          asset,
          source: 'AGENT',
          detectedByAgent: true,
          detectedApplicationName: detected.applicationName,
          detectedApplicationVersion: detected.applicationVersion,
          lastDetectedAt: detected.lastSeenAt,
        });
      }

      const used = mergedAssets.length;
      return {
        ...license,
        assets: mergedAssets,
        usage: {
          used,
          available: Math.max(license.seats - used, 0),
          exceeded: Math.max(used - license.seats, 0),
          detectedByAgent: mergedAssets.filter((item) => item.detectedByAgent).length,
        },
      };
    }) as unknown as T;
  }

  private async assertEffectiveSeatLimit(softwareName: string, ownerCompanyId: string | null, assetIds: string[], seats: number) {
    const ownerCompany = ownerCompanyId
      ? await prisma.company.findUnique({ where: { id: ownerCompanyId }, select: { id: true, name: true, code: true } })
      : null;
    const [inventory] = await this.withAgentDetections([{
      id: 'capacity-validation',
      softwareName,
      seats,
      assets: [],
      ownerCompany,
    }]);
    const detectedAssetIds = inventory.assets.map((link: any) => link.assetId as string);
    const effectiveUsage = new Set([...assetIds, ...detectedAssetIds]).size;
    if (effectiveUsage > seats) {
      throw new Error(`A licença possui ${seats} posição(ões), mas existem ${effectiveUsage} instalações ou vínculos`);
    }
  }

  async options() {
    const [companies, assets, suppliers] = await Promise.all([
      prisma.company.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true },
      }),
      prisma.asset.findMany({
        orderBy: [{ assetTag: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          assetTag: true,
          ipAddress: true,
          hostname: true,
          serialNumber: true,
          manufacturer: true,
          model: true,
          companyId: true,
          company: { select: { id: true, name: true, code: true } },
          windowsLicenseKey: true,
          windowsProductKeyPartial: true,
          softwareLicenses: {
            select: {
              licenseId: true,
              license: { select: { id: true, softwareName: true, version: true } },
            },
          },
        },
      }),
      prisma.supplier.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, taxId: true, active: true },
      }),
    ]);

    return {
      companies,
      assets: assets.map((asset) => ({ ...asset, windowsLicenseKey: null })),
      suppliers,
    };
  }

  async list(filters: z.infer<typeof licenseListSchema>) {
    const validated = licenseListSchema.parse(filters);
    const where: any = {};

    if (validated.ownerCompanyId) where.ownerCompanyId = validated.ownerCompanyId;
    if (validated.search) {
      where.OR = [
        { softwareName: { contains: validated.search, mode: 'insensitive' } },
        { version: { contains: validated.search, mode: 'insensitive' } },
        { invoiceNumber: { contains: validated.search, mode: 'insensitive' } },
        { licenseNumber: { contains: validated.search, mode: 'insensitive' } },
        { purchasedFrom: { contains: validated.search, mode: 'insensitive' } },
        { supplier: { name: { contains: validated.search, mode: 'insensitive' } } },
      ];
    }

    const licenses = await prisma.softwareLicense.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        ownerCompany: { select: { id: true, name: true, code: true } },
        supplier: { select: { id: true, name: true, taxId: true } },
        assets: {
          include: {
            asset: { select: licenseAssetSelect },
          },
        },
        assignmentHistory: { include: assignmentHistoryInclude, orderBy: { createdAt: 'desc' }, take: 200 },
      },
    });
    return this.withAgentDetections(licenses);
  }

  async create(data: z.infer<typeof licenseInputSchema>, performedById: string) {
    const validated = licenseInputSchema.parse(data);
    const assetIds = uniqueAssetIdsWithinLimit(validated.assetIds, validated.seats);
    await this.assertEffectiveSeatLimit(validated.softwareName, validated.ownerCompanyId || null, assetIds, validated.seats);

    return prisma.$transaction(async (tx) => tx.softwareLicense.create({
      data: {
        softwareName: validated.softwareName,
        version: validated.version || null,
        ownerCompanyId: validated.ownerCompanyId || null,
        invoiceNumber: validated.invoiceNumber || null,
        licenseNumber: validated.licenseNumber,
        supplierId: validated.supplierId || null,
        purchasedFrom: validated.purchasedFrom || null,
        purchaseDate: validated.purchaseDate ? new Date(`${validated.purchaseDate}T00:00:00.000Z`) : null,
        seats: validated.seats,
        isPerpetual: validated.isPerpetual,
        expiresAt: validated.isPerpetual ? null : new Date(`${validated.expiresAt}T00:00:00.000Z`),
        notes: validated.notes || null,
        assets: {
          create: assetIds.map((assetId) => ({ assetId })),
        },
        assignmentHistory: {
          create: assetIds.map((assetId) => ({ assetId, action: 'ASSIGNED', source: 'MANUAL', performedById })),
        },
      },
      include: {
        ownerCompany: { select: { id: true, name: true, code: true } },
        supplier: { select: { id: true, name: true, taxId: true } },
        assets: { include: { asset: { select: { id: true, name: true, assetTag: true, ipAddress: true, hostname: true } } } },
        assignmentHistory: { include: assignmentHistoryInclude, orderBy: { createdAt: 'desc' } },
      },
    }));
  }

  async update(id: string, data: z.infer<typeof licenseInputSchema>, performedById: string) {
    const validated = licenseInputSchema.parse(data);
    const assetIds = uniqueAssetIdsWithinLimit(validated.assetIds, validated.seats);
    await this.assertEffectiveSeatLimit(validated.softwareName, validated.ownerCompanyId || null, assetIds, validated.seats);

    return prisma.$transaction(async (tx) => {
      const current = await tx.softwareLicense.findUniqueOrThrow({ where: { id }, select: { assets: { select: { assetId: true } } } });
      const previousIds = new Set(current.assets.map((item) => item.assetId));
      const nextIds = new Set(assetIds);
      const assigned = assetIds.filter((assetId) => !previousIds.has(assetId));
      const unassigned = [...previousIds].filter((assetId) => !nextIds.has(assetId));
      return tx.softwareLicense.update({
        where: { id },
        data: {
        softwareName: validated.softwareName,
        version: validated.version || null,
        ownerCompanyId: validated.ownerCompanyId || null,
        invoiceNumber: validated.invoiceNumber || null,
        licenseNumber: validated.licenseNumber,
        supplierId: validated.supplierId || null,
        purchasedFrom: validated.purchasedFrom || null,
        purchaseDate: validated.purchaseDate ? new Date(`${validated.purchaseDate}T00:00:00.000Z`) : null,
        seats: validated.seats,
        isPerpetual: validated.isPerpetual,
        expiresAt: validated.isPerpetual ? null : new Date(`${validated.expiresAt}T00:00:00.000Z`),
        notes: validated.notes || null,
        assets: {
          deleteMany: {},
          create: assetIds.map((assetId) => ({ assetId })),
        },
        assignmentHistory: {
          create: [
            ...assigned.map((assetId) => ({ assetId, action: 'ASSIGNED' as const, source: 'MANUAL', performedById })),
            ...unassigned.map((assetId) => ({ assetId, action: 'UNASSIGNED' as const, source: 'MANUAL', performedById })),
          ],
        },
      },
      include: {
        ownerCompany: { select: { id: true, name: true, code: true } },
        supplier: { select: { id: true, name: true, taxId: true } },
        assets: { include: { asset: { select: { id: true, name: true, assetTag: true, ipAddress: true, hostname: true } } } },
        assignmentHistory: { include: assignmentHistoryInclude, orderBy: { createdAt: 'desc' }, take: 200 },
      },
      });
    });
  }

  async delete(id: string) {
    await prisma.softwareLicense.delete({ where: { id } });
  }
}
