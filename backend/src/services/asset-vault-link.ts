import { isIP } from 'net';

export function vaultEndpointHost(value?: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const input = value.trim();
    const url = new URL(input.includes('://') ? input : `http://${input}`);
    return url.hostname.toLowerCase().replace(/\.$/, '');
  } catch { return null; }
}

export function vaultEntryBelongsToAsset(
  asset: { id: string; ipAddress: string | null; hostname: string | null; networkSegmentId: string | null },
  entry: { assetId: string | null; host: string | null; url: string | null; ipAddress?: { ipAddress: string; networkSegmentId: string | null } | null },
): boolean {
  // An explicit association must never spill into another asset's details.
  if (entry.assetId) return entry.assetId === asset.id;
  if (entry.ipAddress) return entry.ipAddress.ipAddress === asset.ipAddress && entry.ipAddress.networkSegmentId === asset.networkSegmentId;
  const hosts = [vaultEndpointHost(entry.host), vaultEndpointHost(entry.url)].filter((host): host is string => Boolean(host));
  const ips = hosts.filter((host) => isIP(host));
  if (ips.length) return Boolean(asset.ipAddress) && ips.every((ip) => ip === asset.ipAddress);
  const hostname = asset.hostname?.trim().toLowerCase().replace(/\.$/, '');
  return Boolean(hostname) && hosts.length > 0 && hosts.every((host) => host === hostname);
}
