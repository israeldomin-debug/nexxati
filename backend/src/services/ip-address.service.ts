import { IpAddressSource, PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

export const ipAddressInputSchema = z.object({
  ipAddress: z.string().trim().ip('Informe um IP válido'),
  networkSegmentId: z.string().uuid().optional().nullable(),
  hostname: z.string().trim().optional().nullable(),
  macAddress: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  assetId: z.string().uuid().optional().nullable(),
  active: z.boolean().default(true),
});

export const networkSegmentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  cidr: z.string().trim().regex(/^(?:\d{1,3}\.){3}\d{1,3}\/(?:[1-9]|[12]\d|3[0-2])$/, 'Informe a faixa em CIDR, por exemplo 192.168.1.0/24'),
  gateway: z.string().trim().ip('Informe um gateway válido').optional().nullable().or(z.literal('')).transform((value) => value || null),
  vlan: z.coerce.number().int().min(1).max(4094).optional().nullable(),
  location: z.string().trim().max(255).optional().nullable().transform((value) => value || null),
  companyId: z.string().uuid().optional().nullable(),
  active: z.boolean().default(true),
});

export const ipAddressListSchema = z.object({
  search: z.string().trim().optional(),
  source: z.nativeEnum(IpAddressSource).optional(),
  active: z.enum(['true', 'false']).optional(),
  networkSegmentId: z.string().uuid().optional(),
});

const ipv4Parts = (ipAddress: string | null | undefined) => {
  if (!ipAddress) return null;
  const parts = ipAddress.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts;
};

const subnet24 = (ipAddress: string | null | undefined) => {
  const parts = ipv4Parts(ipAddress);
  return parts ? `${parts[0]}.${parts[1]}.${parts[2]}` : null;
};

export class IpAddressService {
  private normalizeMac(macAddress?: string | null) {
    return macAddress?.trim() || null;
  }

  private generateFreeRecords(occupiedRecords: any[], search?: string) {
    const scopes = new Map<string, { segmentId: string | null; segment: any; subnet: string; occupied: Set<string>; reserved: Set<string> }>();
    for (const item of occupiedRecords) {
      const subnet = subnet24(item.ipAddress);
      if (!subnet) continue;
      const segmentId = item.networkSegmentId || null;
      const key = `${segmentId || 'NONE'}|${subnet}`;
      const scope = scopes.get(key) || { segmentId, segment: item.networkSegment || null, subnet, occupied: new Set<string>(), reserved: new Set<string>() };
      scope.occupied.add(item.ipAddress);
      scope.reserved.add(`${subnet}.1`);
      const gateway = item.gateway || item.networkSegment?.gateway;
      if (gateway && subnet24(gateway) === subnet) scope.reserved.add(gateway);
      scopes.set(key, scope);
    }
    const term = search?.trim().toLowerCase();
    const now = new Date();
    const freeRecords = [...scopes.values()].flatMap((scope) => Array.from({ length: 254 }, (_, index) => `${scope.subnet}.${index + 1}`)
      .filter((ipAddress) => !scope.occupied.has(ipAddress))
      .filter((ipAddress) => !scope.reserved.has(ipAddress))
      .filter((ipAddress) => !term || ipAddress.toLowerCase().includes(term))
      .map((ipAddress) => ({
        id: `free-${scope.segmentId || 'none'}-${ipAddress}`,
        ipAddress,
        networkSegmentId: scope.segmentId,
        networkSegment: scope.segment,
        hostname: null,
        macAddress: null,
        description: 'IP livre gerado pela faixa ocupada',
        source: 'FREE' as const,
        companyId: null,
        company: null,
        assetId: null,
        asset: null,
        lastSeenAt: null,
        active: false,
        createdAt: now,
        updatedAt: now,
        editable: false,
      })));

    return freeRecords.sort((a, b) => a.ipAddress.localeCompare(b.ipAddress, undefined, { numeric: true }));
  }

  private async syncAssetIp(data: z.infer<typeof ipAddressInputSchema>) {
    if (!data.assetId || !data.active) return;

    const asset = await prisma.asset.findUnique({
      where: { id: data.assetId },
      select: { id: true, name: true, assetTag: true, ipAddress: true },
    });

    if (!asset) throw new Error('Ativo não encontrado.');

    if (asset.ipAddress && asset.ipAddress !== data.ipAddress) {
      throw new Error(`Este ativo já possui o IP ${asset.ipAddress}. Remova ou ajuste o IP no ativo antes de vincular outro.`);
    }

    const duplicatedAsset = await prisma.asset.findFirst({
      where: { ipAddress: data.ipAddress, networkSegmentId: data.networkSegmentId || null, id: { not: data.assetId } },
      select: { name: true },
    });

    if (duplicatedAsset) {
      throw new Error(`IP já vinculado ao ativo ${duplicatedAsset.name}.`);
    }

    await prisma.asset.update({
      where: { id: data.assetId },
      data: {
        ipAddress: data.ipAddress,
        networkSegmentId: data.networkSegmentId || null,
        hostname: data.hostname || undefined,
        macAddress: this.normalizeMac(data.macAddress) || undefined,
        companyId: data.companyId || undefined,
      },
    });
  }

  async options() {
    const [assets, segments, companies] = await Promise.all([
      prisma.asset.findMany({ orderBy: [{ assetTag: 'asc' }, { name: 'asc' }], select: {
        id: true,
        name: true,
        assetTag: true,
        ipAddress: true,
        macAddress: true,
        hostname: true,
        companyId: true,
        networkSegmentId: true,
      } }),
      prisma.networkSegment.findMany({ where: { active: true }, include: { company: { select: { id: true, name: true, code: true } } }, orderBy: [{ company: { name: 'asc' } }, { name: 'asc' }] }),
      prisma.company.findMany({ where: { active: true }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } }),
    ]);

    return { assets, segments, companies };
  }

  async list(filters: z.infer<typeof ipAddressListSchema>): Promise<any[]> {
    const validated = ipAddressListSchema.parse(filters);
    if (validated.active === 'false') {
      const occupiedRecords: any[] = await this.list({ active: 'true' } as any);
      return this.generateFreeRecords(occupiedRecords, validated.search);
    }

    const manualWhere: any = {};
    const assetWhere: any = { ipAddress: { not: null } };

    if (validated.source) manualWhere.source = validated.source;
    if (validated.networkSegmentId) {
      manualWhere.networkSegmentId = validated.networkSegmentId;
      assetWhere.networkSegmentId = validated.networkSegmentId;
    }
    if (validated.active) manualWhere.active = validated.active === 'true';
    if (validated.search) {
      manualWhere.OR = [
        { ipAddress: { contains: validated.search, mode: 'insensitive' } },
        { hostname: { contains: validated.search, mode: 'insensitive' } },
        { macAddress: { contains: validated.search, mode: 'insensitive' } },
        { description: { contains: validated.search, mode: 'insensitive' } },
      ];
      assetWhere.OR = [
        { ipAddress: { contains: validated.search, mode: 'insensitive' } },
        { hostname: { contains: validated.search, mode: 'insensitive' } },
        { macAddress: { contains: validated.search, mode: 'insensitive' } },
        { name: { contains: validated.search, mode: 'insensitive' } },
        { assetTag: { contains: validated.search, mode: 'insensitive' } },
      ];
    }

    const includeAssets = !validated.source || validated.source === 'ASSET';

    const [manualIps, assetIps] = await Promise.all([
      prisma.networkIpAddress.findMany({
        where: manualWhere,
        include: { networkSegment: { include: { company: { select: { id: true, name: true, code: true } } } } },
        orderBy: { ipAddress: 'asc' },
      }),
      includeAssets
        ? prisma.asset.findMany({
            where: assetWhere,
            orderBy: { ipAddress: 'asc' },
            select: {
              id: true,
              name: true,
              assetTag: true,
              ipAddress: true,
              macAddress: true,
              hostname: true,
              gateway: true,
              networkSegmentId: true,
              networkSegment: { include: { company: { select: { id: true, name: true, code: true } } } },
              company: { select: { id: true, name: true, code: true } },
              lastSeenAt: true,
              updatedAt: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const assetRecords = assetIps.map((asset) => ({
      id: `asset-${asset.id}`,
      ipAddress: asset.ipAddress!,
      networkSegmentId: asset.networkSegmentId,
      networkSegment: asset.networkSegment,
      hostname: asset.hostname,
      macAddress: asset.macAddress,
      gateway: asset.gateway,
      description: asset.name,
      source: 'ASSET' as const,
      companyId: asset.company?.id || null,
      company: asset.company || null,
      assetId: asset.id,
      asset: { id: asset.id, name: asset.name, assetTag: asset.assetTag },
      lastSeenAt: asset.lastSeenAt,
      active: true,
      createdAt: asset.updatedAt,
      updatedAt: asset.updatedAt,
      editable: false,
    }));

    const manualRecords = manualIps.map((ip) => ({
      ...ip,
      company: null,
      asset: null,
      editable: true,
    }));

    const byIp = new Map<string, any>();
    for (const item of assetRecords) byIp.set(`${item.networkSegmentId || 'NONE'}|${item.ipAddress}`, item);
    for (const item of manualRecords) byIp.set(`${item.networkSegmentId || 'NONE'}|${item.ipAddress}`, item);

    return Array.from(byIp.values()).sort((a, b) => a.ipAddress.localeCompare(b.ipAddress, undefined, { numeric: true }));
  }

  async create(data: z.infer<typeof ipAddressInputSchema>) {
    const validated = ipAddressInputSchema.parse(data);
    await this.syncAssetIp(validated);
    return prisma.networkIpAddress.create({
      data: {
        ipAddress: validated.ipAddress,
        networkSegmentId: validated.networkSegmentId || null,
        hostname: validated.hostname || null,
        macAddress: this.normalizeMac(validated.macAddress),
        description: validated.description || null,
        companyId: validated.companyId || null,
        assetId: validated.assetId || null,
        active: validated.active,
        source: 'MANUAL',
      },
    });
  }

  async update(id: string, data: z.infer<typeof ipAddressInputSchema>) {
    const validated = ipAddressInputSchema.parse(data);
    await this.syncAssetIp(validated);
    return prisma.networkIpAddress.update({
      where: { id },
      data: {
        ipAddress: validated.ipAddress,
        networkSegmentId: validated.networkSegmentId || null,
        hostname: validated.hostname || null,
        macAddress: this.normalizeMac(validated.macAddress),
        description: validated.description || null,
        companyId: validated.companyId || null,
        assetId: validated.assetId || null,
        active: validated.active,
      },
    });
  }

  async delete(id: string) {
    await prisma.networkIpAddress.delete({ where: { id } });
  }

  async createSegment(input: unknown) {
    return prisma.networkSegment.create({ data: networkSegmentSchema.parse(input), include: { company: { select: { id: true, name: true, code: true } } } });
  }

  async updateSegment(id: string, input: unknown) {
    return prisma.networkSegment.update({ where: { id }, data: networkSegmentSchema.partial().parse(input), include: { company: { select: { id: true, name: true, code: true } } } });
  }

  async deleteSegment(id: string) {
    const used = await prisma.networkSegment.findUniqueOrThrow({ where: { id }, select: { _count: { select: { assets: true, ipAddresses: true } } } });
    if (used._count.assets || used._count.ipAddresses) return prisma.networkSegment.update({ where: { id }, data: { active: false } });
    return prisma.networkSegment.delete({ where: { id } });
  }
}
