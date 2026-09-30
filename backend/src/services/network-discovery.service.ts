import { execFile, spawn } from 'child_process';
import crypto from 'crypto';
import dgram from 'dgram';
import { promisify } from 'util';
import { promises as dns } from 'dns';
import net from 'net';
import * as snmp from 'net-snmp';
import { AssetHistoryAction, AssetStatus, AssetType, DiscoveryIgnoreMode, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { decryptPassword, encryptPassword } from './password-vault.service';
import { DEEP_PORTS, fingerprintServices, mapLimited, ServiceEvidence } from './network-fingerprint.service';

const execFileAsync = promisify(execFile);
const prisma = new PrismaClient();

const ipv4 = z.string().trim().regex(/^(?:\d{1,3}\.){3}\d{1,3}$/).refine((value) => {
  const parts = value.split('.').map(Number);
  return parts.every((part) => part >= 0 && part <= 255);
}, 'IP inválido').refine((value) => {
  const [a, b] = value.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}, 'Somente endereços de rede privada são permitidos');

export const discoverySchema = z.object({
  targets: z.array(ipv4).min(1).max(256).transform((items) => [...new Set(items)]),
  mode: z.nativeEnum(DiscoveryIgnoreMode).optional().default(DiscoveryIgnoreMode.NETWORK),
  skipKnownIps: z.boolean().optional().default(true),
  networkSegmentId: z.string().uuid().optional().nullable(),
  scanDepth: z.enum(['standard', 'deep']).optional().default('standard'),
});

export const discoveryIgnoreSchema = z.object({
  ipAddress: ipv4,
  mode: z.nativeEnum(DiscoveryIgnoreMode),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const discoveryIgnoreListSchema = z.object({
  mode: z.nativeEnum(DiscoveryIgnoreMode),
});

export const importDevicesSchema = z.object({
  companyId: z.string().uuid().optional().nullable(),
  networkSegmentId: z.string().uuid().optional().nullable(),
  adminPassword: z.string().min(1).max(500).optional(),
  importMode: z.enum(['NETWORK', 'PRINTER']).optional().default('NETWORK'),
  devices: z.array(z.object({
    ipAddress: ipv4,
    hostname: z.string().trim().max(255).optional().nullable(),
    manufacturer: z.string().trim().max(255).optional().nullable(),
    model: z.string().trim().max(255).optional().nullable(),
    serialNumber: z.string().trim().max(255).optional().nullable(),
    firmware: z.string().trim().max(255).optional().nullable(),
    macAddress: z.string().trim().regex(/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/).optional().nullable(),
    online: z.boolean().optional().default(true),
    type: z.nativeEnum(AssetType).optional().default(AssetType.OTHER),
    openPorts: z.array(z.number().int().min(1).max(65535)).optional().default([]),
    source: z.string().trim().max(50).optional().default('NETWORK_SCAN'),
    operatingSystem: z.string().trim().max(255).optional().nullable(),
    osVersion: z.string().trim().max(100).optional().nullable(),
    osArchitecture: z.string().trim().max(100).optional().nullable(),
    processor: z.string().trim().max(255).optional().nullable(),
    cpuCores: z.number().int().min(0).optional().nullable(),
    cpuLogicalProcessors: z.number().int().min(0).optional().nullable(),
    memoryMb: z.number().int().min(0).optional().nullable(),
    diskGb: z.number().int().min(0).optional().nullable(),
    diskFreeGb: z.number().int().min(0).optional().nullable(),
    loggedUser: z.string().trim().max(255).optional().nullable(),
    domain: z.string().trim().max(255).optional().nullable(),
    workgroup: z.string().trim().max(255).optional().nullable(),
    systemType: z.string().trim().max(255).optional().nullable(),
    biosVersion: z.string().trim().max(255).optional().nullable(),
    biosReleaseDate: z.coerce.date().optional().nullable(),
    windowsInstallDate: z.coerce.date().optional().nullable(),
    lastBootAt: z.coerce.date().optional().nullable(),
    gateway: z.string().trim().max(255).optional().nullable(),
    windowsLicenseKey: z.string().trim().max(255).optional().nullable(),
    windowsProductKeyProtected: z.string().trim().max(1000).optional().nullable(),
    windowsLicenseStatus: z.string().trim().max(100).optional().nullable(),
    windowsProductKeyPartial: z.string().trim().max(20).optional().nullable(),
  })).min(1).max(500),
});

export const detailedInventorySchema = z.object({
  targets: z.array(ipv4).min(1).max(64).transform((items) => [...new Set(items)]),
  username: z.string().trim().max(200).optional().default(''),
  password: z.string().max(500).optional().default(''),
  companyId: z.string().uuid().optional().nullable(),
  networkSegmentId: z.string().uuid().optional().nullable(),
  skipKnownIps: z.boolean().optional().default(true),
}).refine((value) => !value.password || Boolean(value.username), {
  message: 'Informe o usuário para usar senha na coleta Windows',
  path: ['username'],
});

export const cctvInventorySchema = z.object({
  targets: z.array(ipv4).min(1).max(256).transform((items) => [...new Set(items)]),
  username: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(500),
  deviceType: z.nativeEnum(AssetType).refine((value) => value === AssetType.DVR_NVR || value === AssetType.CAMERA),
  companyId: z.string().uuid().optional().nullable(),
  networkSegmentId: z.string().uuid().optional().nullable(),
  skipKnownIps: z.boolean().optional().default(true),
});

export interface DiscoveredDevice {
  ipAddress: string;
  hostname: string | null;
  macAddress: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  firmware: string | null;
  online: boolean;
  responseTimeMs: number | null;
  source: string;
  type: AssetType;
  openPorts: number[];
  identificationNote?: string;
  manufacturerSource?: 'device' | 'mac' | 'ports' | null;
  serviceEvidence?: ServiceEvidence[];
  scannedPortCount?: number;
}

export const hasPingReply = (output: string) => /\bttl\s*[=:]\s*\d+/i.test(output);

const withTimeout = async <T>(promise: Promise<T>, milliseconds: number, fallback: T): Promise<T> => {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), milliseconds); }),
  ]).finally(() => clearTimeout(timer!));
};

const sanitizeHardwareText = (value: unknown): string | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const text = raw
    .replace(/\uFFFD/g, ' ')
    .replace(/[^\x20-\x7E\u00C0-\u00FF]/g, ' ')
    .replace(/\?{2,}/g, ' ')
    .replace(/\s*[-·]\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text && text !== '-' && !/^[\s-]+$/.test(text)) return text;

  return raw
    .replace(/\uFFFD/g, '')
    .replace(/\?{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255) || null;
};

const CLOCK_IDENTITY_PATTERN = /status\s+do\s+(?:rel[oó]gio|rep)|rel[oó]gio(?:\s+eletr[oô]nico)?(?:\s+de)?\s+ponto|\brep\b|registrador\s+eletr[oô]nico\s+de\s+ponto|time[\s_-]*clock|nr\.?\s+de\s+s[eé]rie\s+do\s+rep|vers[aã]o\s+do\s+rel[oó]gio|control\s*id|controlid|\bhenry\b|\bdimep\b|\btopdata\b|\bmadis\b|\bzkteco\b|\bidface\b|\bidclass\b|\bbioponto\b/i;
const TURNSTILE_IDENTITY_PATTERN = /\bcatraca\b|\bturnstile\b|\btorniquete\b/i;
const PRINTER_IDENTITY_PATTERN = /\bprinter\b|\bimpressora\b|\bhp\b|\bbrother\b|\bepson\b|\blexmark\b|\bkyocera\b|\bricoh\b|\bxerox\b|\bzebra\b|\bpantum\b|\bhewlett[ -]?packard\b|\bcanon\b/i;
const IP_PHONE_IDENTITY_PATTERN = /\btelefone\s*ip\b|\bip\s*phone\b|\bsip\s*(?:phone|telefone)?\b|\bvoip\b|\byealink\b|\bgrandstream\b|\bfanvil\b|\bpolycom\b|\baudiocodes\b|\bgxp\d{3,4}\b|\bgrp\d{3,4}\b|\bt\d{2}[a-z]?\b/i;
const VOIP_SERVER_IDENTITY_PATTERN = /\bservidor\s+(?:voip|sip)\b|\bvoip\s+server\b|\bpabx\b|\bpbx\b|\basterisk\b|\bfreepbx\b|\bissabel\b|\belastix\b|\b3cx\b|\bfusionpbx\b|\bfreeswitch\b|\bkamailio\b|\bopensips\b/i;
const GENERIC_HTTP_TITLE_PATTERN = /^(?:home|in[ií]cio|login|status|configuration|configura[cç][aã]o|web\s*(?:interface|server)|device|dispositivo|index|status\s+do\s+(?:rel[oó]gio|rep))$/i;

const validDetectedVersion = (value: string | null | undefined): string | null => {
  const clean = sanitizeHardwareText(value)?.slice(0, 255) || null;
  if (!clean || !/\d/.test(clean)) return null;
  if (/^(?:valor|value|vers[aã]o|version|firmware|modelo|model|status|nenhum|none|unknown)$/i.test(clean)) return null;
  return clean;
};

export const extractHttpHardwareFacts = (titleValue: string | null, textValue: string) => {
  const title = sanitizeHardwareText(titleValue);
  const text = sanitizeHardwareText(textValue) || '';
  const identity = `${title || ''} ${text}`.trim();
  const isTimeClock = CLOCK_IDENTITY_PATTERN.test(identity);
  const boardModel = isTimeClock
    ? sanitizeHardwareText(identity.match(/modelo\s+da\s+placa\s*[:=-]?\s*([A-Za-z0-9._/-]{2,80})/i)?.[1])
    : null;
  const clockFirmware = isTimeClock
    ? validDetectedVersion(identity.match(/vers[aã]o\s+do\s+rel[oó]gio\s*[:=-]?\s*([A-Za-z0-9._/-]{2,80})/i)?.[1])
    : null;
  const generalFirmware = validDetectedVersion(
    identity.match(/(?:firmware(?:\s+version)?|fw|version|vers[aã]o|ver\.?)\s*[:=_-]?\s*([A-Za-z0-9._/-]{2,80})/i)?.[1],
  );
  const clockSerial = isTimeClock
    ? sanitizeHardwareText(identity.match(/n(?:r|[uú]mero)\.?\s+de\s+s[eé]rie\s+do\s+rep\s*[:=-]?\s*([A-Za-z0-9._/-]{4,100})/i)?.[1])
    : null;
  const titleIsGeneric = !title || GENERIC_HTTP_TITLE_PATTERN.test(title);

  return {
    identity,
    isTimeClock,
    model: boardModel ? `Placa ${boardModel}` : titleIsGeneric ? null : title.slice(0, 255),
    firmware: clockFirmware || generalFirmware,
    serialNumber: clockSerial,
  };
};

export const inferCctvIdentity = (identity: string | null): AssetType | null => {
  const text = identity || '';
  const recorder = /\b(?:dvr|nvr|xvr|hvr)(?:\b|[-_]?\d)|\bmhdx\s*\d|\bgravador\b|\b(?:network|digital) video recorder\b|\bvideo recorder\b/i.test(text);
  const camera = /\b(?:ipc|ipcam|ipcamera|vip)(?:\b|[-_]?\d)|\bip camera\b|\bnetwork camera\b|\bc[âa]mera\b|\bcamera\b/i.test(text);
  if (recorder && camera) return null;
  return recorder ? AssetType.DVR_NVR : camera ? AssetType.CAMERA : null;
};

export const needsCctvUpdate = (existing: { type: AssetType; category: string; firmware: string | null }, incoming: { type: AssetType; category: string; firmware: string | null }, hardwareChanged: boolean) =>
  hardwareChanged || existing.type !== incoming.type || existing.category !== incoming.category || Boolean(incoming.firmware && incoming.firmware !== existing.firmware);

export const classifyNetworkDevice = (
  ipAddress: string,
  identity: string | null,
  manufacturer: string | null,
  ports: number[],
): AssetType => {
  const text = `${identity || ''} ${manufacturer || ''}`.toLowerCase();
  const has = (...values: number[]) => values.some((port) => ports.includes(port));
  const cctvType = inferCctvIdentity(identity);
  const looksLikeVoipServer = VOIP_SERVER_IDENTITY_PATTERN.test(text);

  if (TURNSTILE_IDENTITY_PATTERN.test(text)) return AssetType.TURNSTILE;
  if (CLOCK_IDENTITY_PATTERN.test(text)) return AssetType.TIME_CLOCK;
  if (looksLikeVoipServer) return AssetType.VOIP_SERVER;
  if (cctvType) return cctvType;
  if (PRINTER_IDENTITY_PATTERN.test(text)) return AssetType.PRINTER;
  if (/antena|antenna|nanostation|litebeam|powerbeam|airmax|rocket|cambium/.test(text)) return AssetType.ANTENNA;
  if (/access.?point|\bap\b|unifi|ubiquiti/.test(text)) return AssetType.ACCESS_POINT;
  if (/switch/.test(text) || (has(22, 23) && /cisco|aruba|hpe|tp.?link/.test(text))) return AssetType.SWITCH;
  if (/router|gateway|mikrotik|routeros/.test(text) || has(8291, 8728, 8729) || (ipAddress.endsWith('.1') && has(80, 443, 7547))) return AssetType.ROUTER;
  if (/firewall|fortinet|sophos|pfsense/.test(text)) return AssetType.FIREWALL;
  if (/ups|no.?break|nobreak|apc|sms.?legrand|nhs/.test(text)) return AssetType.UPS;
  if (/nas|storage|synology|qnap|freenas|truenas/.test(text)) return AssetType.SERVER;
  if (/\bihm\b|\bhmi\b|\bclp\b|\bplc\b|modbus|ethernet.?ip|profinet|profibus|siemens|simatic|schneider|rockwell|allen.?bradley|weintek|pro.?face|beckhoff|advantech|omron|moxa|phoenix.?contact|weg|automacao|automation/.test(text)) return AssetType.OTHER;
  if (IP_PHONE_IDENTITY_PATTERN.test(text)) return AssetType.IP_PHONE;
  if (/virtualbox|vmware|hyper-v|qemu|parallels/.test(text)) return AssetType.VIRTUAL_MACHINE;
  if (/notebook|laptop|\bnote[-_\s]?\w*|\bnb[-_\s]?\w*/.test(text)) return AssetType.NOTEBOOK;

  // Shared ports, vendor and subnet cannot distinguish camera from recorder.
  if (has(631) || [9100, 515, 631].filter((port) => ports.includes(port)).length >= 2) return AssetType.PRINTER;
  if (has(5038, 5080, 5160, 8088, 8089) || (has(5060, 5061) && ipAddress.endsWith('.254'))) return AssetType.VOIP_SERVER;
  if (has(5060, 5061)) return AssetType.IP_PHONE;
  if (has(102, 502, 1883, 2404, 4840, 9600, 20000, 44818, 47808)) return AssetType.OTHER;
  if (/server|servidor/.test(text)) return AssetType.SERVER;
  const windowsSignals = [135, 445, 3389].filter((port) => ports.includes(port)).length;
  if (windowsSignals >= 2) return AssetType.DESKTOP;
  return AssetType.OTHER;
};

export class NetworkDiscoveryService {
  private async findKnownIps(targets: string[], networkSegmentId?: string | null) {
    if (!targets.length) return new Set<string>();
    const [assets, registeredIps] = await Promise.all([
      prisma.asset.findMany({
        where: { ipAddress: { in: targets }, networkSegmentId: networkSegmentId || null },
        select: { ipAddress: true },
      }),
      prisma.networkIpAddress.findMany({
        where: { ipAddress: { in: targets }, networkSegmentId: networkSegmentId || null, active: true },
        select: { ipAddress: true },
      }),
    ]);
    return new Set([
      ...assets.map((item) => item.ipAddress).filter((ip): ip is string => Boolean(ip)),
      ...registeredIps.map((item) => item.ipAddress),
    ]);
  }

  private compactUpdateData<T extends Record<string, unknown>>(data: T) {
    return Object.fromEntries(Object.entries(data).filter(([, value]) => {
      if (value === undefined || value === null || value === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    }));
  }

  private comparable(value: unknown) {
    return value == null ? '' : String(value).trim().toLowerCase();
  }

  private hasHardwareChanges(existing: Record<string, unknown>, incoming: Record<string, unknown>) {
    const hardwareFields = ['serialNumber', 'macAddress', 'manufacturer', 'model', 'processor', 'memoryMb', 'diskGb'];
    return hardwareFields.some((field) => {
      const current = this.comparable(existing[field]);
      const detected = this.comparable(incoming[field]);
      return Boolean(detected) && current !== detected;
    });
  }

  private shouldApplyNetworkTypeCorrection(currentType: AssetType, detectedType: AssetType) {
    if (detectedType === AssetType.OTHER || detectedType === currentType) return false;
    if (currentType === AssetType.OTHER) return true;
    const serverCorrectionTargets: AssetType[] = [
      AssetType.IP_PHONE,
      AssetType.TIME_CLOCK,
      AssetType.VOIP_SERVER,
    ];
    return currentType === AssetType.SERVER && serverCorrectionTargets.includes(detectedType);
  }

  private statusFromNetworkPresence(currentStatus?: AssetStatus | null) {
    if (!currentStatus || currentStatus === AssetStatus.AVAILABLE) return AssetStatus.ASSIGNED;
    return undefined;
  }

  private async validateAdminPassword(password: string | undefined) {
    if (!password) return false;
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', active: true },
      select: { passwordHash: true },
    });
    for (const admin of admins) {
      if (await bcrypt.compare(password, admin.passwordHash)) return true;
    }
    throw new Error('Senha de administrador incorreta');
  }

  private assertCctvTypeMatches(requestedType: AssetType, collected: { model?: string | null; manufacturer?: string | null }) {
    const text = collected.model || '';
    const detectedType = this.inferCctvType(text);
    const looksLikeRecorder = detectedType === AssetType.DVR_NVR;
    const looksLikeCamera = detectedType === AssetType.CAMERA;

    if (requestedType === AssetType.CAMERA && looksLikeRecorder) {
      throw new Error('O dispositivo respondeu como DVR/NVR. Rode a coleta selecionando DVR / NVR e usando a credencial correta.');
    }
    if (requestedType === AssetType.DVR_NVR && looksLikeCamera && !looksLikeRecorder) {
      throw new Error('O dispositivo respondeu como câmera. Rode a coleta selecionando Câmera / ONVIF e usando a credencial correta.');
    }
  }

  private inferCctvType(text: string) {
    return inferCctvIdentity(text);
  }

  private md5(value: string) {
    return crypto.createHash('md5').update(value).digest('hex');
  }

  private parseDigestHeader(header: string) {
    const params: Record<string, string> = {};
    header.replace(/^Digest\s+/i, '').split(/,\s*/).forEach((part) => {
      const [key, ...rest] = part.split('=');
      if (!key || !rest.length) return;
      params[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
    });
    return params;
  }

  private buildDigestAuth(header: string, method: string, uri: string, username: string, password: string) {
    const params = this.parseDigestHeader(header);
    const realm = params.realm || '';
    const nonce = params.nonce || '';
    const qop = params.qop?.split(',')[0]?.trim();
    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');
    const ha1 = this.md5(`${username}:${realm}:${password}`);
    const ha2 = this.md5(`${method}:${uri}`);
    const response = qop
      ? this.md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
      : this.md5(`${ha1}:${nonce}:${ha2}`);
    const pieces = [
      `username="${username}"`,
      `realm="${realm}"`,
      `nonce="${nonce}"`,
      `uri="${uri}"`,
      `response="${response}"`,
    ];
    if (params.algorithm) pieces.push(`algorithm=${params.algorithm}`);
    if (params.opaque) pieces.push(`opaque="${params.opaque}"`);
    if (qop) pieces.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
    return `Digest ${pieces.join(', ')}`;
  }

  private buildOnvifEnvelope(username?: string, password?: string) {
    const security = username && password
      ? (() => {
          const nonce = crypto.randomBytes(16);
          const created = new Date().toISOString();
          const digest = crypto.createHash('sha1').update(Buffer.concat([nonce, Buffer.from(created), Buffer.from(password)])).digest('base64');
          return `<s:Header><Security s:mustUnderstand="1" xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><UsernameToken><Username>${username}</Username><Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</Password><Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonce.toString('base64')}</Nonce><Created xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">${created}</Created></UsernameToken></Security></s:Header>`;
        })()
      : '';

    return `<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">${security}<s:Body><GetDeviceInformation xmlns="http://www.onvif.org/ver10/device/wsdl"/></s:Body></s:Envelope>`;
  }

  private parseKeyValueBody(body: string) {
    const data: Record<string, string> = {};
    body.split(/\r?\n|;/).forEach((line) => {
      const normalizedLine = line.trim().replace(/^var\s+/i, '');
      const [key, ...rest] = normalizedLine.split('=');
      if (!key || !rest.length) return;
      data[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
    });
    return data;
  }

  private async fetchWithCameraAuth(ipAddress: string, path: string, username: string, password: string, port = 80) {
    const url = `http://${ipAddress}:${port}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
      let response = await fetch(url, { signal: controller.signal });
      const authHeader = response.headers.get('www-authenticate') || '';
      if (response.status === 401 && authHeader.toLowerCase().startsWith('digest')) {
        response = await fetch(url, {
          signal: controller.signal,
          headers: { Authorization: this.buildDigestAuth(authHeader, 'GET', path, username, password) },
        });
      } else if (response.status === 401) {
        const basic = Buffer.from(`${username}:${password}`).toString('base64');
        response = await fetch(url, { signal: controller.signal, headers: { Authorization: `Basic ${basic}` } });
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new Error('AUTH_FAILED');
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async collectIntelbrasDahua(ipAddress: string, username: string, password: string) {
    const ports = [80, 81, 82, 85, 88, 8000, 8001, 8008, 8080, 8081, 8088, 8090, 37777, 37778];
    for (const port of ports) {
      try {
        const body = await this.fetchWithCameraAuth(ipAddress, '/cgi-bin/magicBox.cgi?action=getSystemInfo', username, password, port);
        const info = this.parseKeyValueBody(body);
        const hasIdentity = info.vendor || info.Vendor || info.deviceType || info.DeviceType || info.hardwareVersion || info.serialNumber || info.SerialNo || info.sn || info.version || info.Version;
        if (!hasIdentity) continue;
        return {
          manufacturer: info.vendor || info.Vendor || 'Intelbras/Dahua',
          model: info.deviceType || info.DeviceType || info.hardwareVersion || null,
          serialNumber: this.normalizeSerialNumber(info.serialNumber || info.SerialNo || info.sn),
          firmware: info.updateSerial || info.version || info.Version || null,
          port,
        };
      } catch (error) {
        if (error instanceof Error && error.message === 'AUTH_FAILED') {
          throw new Error('Credenciais inválidas para o dispositivo CCTV');
        }
        // tenta próxima porta
      }
    }
    return null;
  }

  private async collectTopcamHiSilicon(ipAddress: string, username: string, password: string) {
    const ports = [80, 81, 82, 85, 88, 8000, 8001, 8008, 8080, 8081, 8088, 8090, 8899];
    const paths = [
      '/web/cgi-bin/hi3510/param.cgi?cmd=getserverinfo',
      '/cgi-bin/hi3510/param.cgi?cmd=getserverinfo',
      '/param.cgi?cmd=getserverinfo',
      '/web/cgi-bin/hi3510/param.cgi?cmd=getdeviceattr',
      '/cgi-bin/hi3510/param.cgi?cmd=getdeviceattr',
      '/param.cgi?cmd=getdeviceattr',
    ];

    for (const port of ports) {
      for (const path of paths) {
        try {
          const body = await this.fetchWithCameraAuth(ipAddress, path, username, password, port);
          const info = this.parseKeyValueBody(body);
          const text = `${body} ${Object.values(info).join(' ')}`.toLowerCase();
          if (!/topcam|hi3510|hi3516|ipcam|camera|onvif|devname|model|serial|firmware|softversion/.test(text)) continue;
          return {
            manufacturer: /topcam/.test(text) ? 'TopCam' : 'HiSilicon',
            model: info.model || info.Model || info.devname || info.DevName || info.productmodel || info.ProductModel || null,
            serialNumber: this.normalizeSerialNumber(info.serialno || info.SerialNo || info.serial || info.SerialNumber || info.sn),
            firmware: info.softversion || info.SoftVersion || info.firmware || info.Firmware || info.version || info.Version || null,
            port,
          };
        } catch (error) {
          if (error instanceof Error && error.message === 'AUTH_FAILED') {
            throw new Error('Credenciais invÃ¡lidas para a cÃ¢mera TopCam/HiSilicon');
          }
        }
      }
    }
    return null;
  }

  private async collectOnvif(ipAddress: string, username: string, password: string) {
    const ports = [80, 81, 82, 85, 88, 8000, 8001, 8008, 8080, 8081, 8088, 8090, 8899];
    const soapVariants = [
      this.buildOnvifEnvelope(username, password),
      this.buildOnvifEnvelope(),
    ];
    for (const port of ports) {
      const url = `http://${ipAddress}:${port}/onvif/device_service`;
      for (const soap of soapVariants) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500);
        try {
          const basic = Buffer.from(`${username}:${password}`).toString('base64');
          const response = await fetch(url, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/soap+xml', Authorization: `Basic ${basic}` },
            body: soap,
          });
          const text = await response.text();
          if ((response.status === 401 || response.status === 403) && !text.toLowerCase().includes('getdeviceinformationresponse')) {
            throw new Error('Credenciais inválidas para o dispositivo ONVIF');
          }
          if (!response.ok && !text) throw new Error(`HTTP ${response.status}`);
          const pick = (tag: string) => text.match(new RegExp(`<[^:>]*:?${tag}>([^<]+)<`, 'i'))?.[1]?.trim() || null;
          if (text.toLowerCase().includes('getdeviceinformationresponse')) {
            return {
              manufacturer: pick('Manufacturer'),
              model: pick('Model'),
              serialNumber: this.normalizeSerialNumber(pick('SerialNumber')),
              firmware: pick('FirmwareVersion'),
              port,
            };
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes('Credenciais inválidas')) throw error;
          // tenta próximo SOAP/porta
        } finally {
          clearTimeout(timeout);
        }
      }
    }
    return null;
  }

  private normalizeSerialNumber(value: unknown): string | null {
    const serial = String(value || '').trim();
    if (!serial) return null;

    const normalized = serial.toLowerCase();
    const invalidSerials = [
      '0',
      '00',
      '00000000',
      '123456789',
      'default string',
      'none',
      'null',
      'n/a',
      'na',
      'unknown',
      'system serial number',
      'to be filled by o.e.m.',
      'to be filled by oem',
      'not specified',
    ];

    if (invalidSerials.includes(normalized)) return null;
    if (/^0+$/.test(normalized)) return null;
    return serial.slice(0, 255);
  }

  private isPortOpen(ipAddress: string, port: number, timeout = 350): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.createConnection({ host: ipAddress, port });
      let settled = false;
      const finish = (open: boolean) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(open);
      };
      socket.setTimeout(timeout);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
    });
  }

  private classifyDevice(ipAddress: string, hostname: string | null, manufacturer: string | null, ports: number[]): AssetType {
    return classifyNetworkDevice(ipAddress, hostname, manufacturer, ports);
  }

  private manufacturerFromScan(type: AssetType, ports: number[]) {
    if (type === AssetType.DVR_NVR) return ports.some((port) => [37777, 37778, 34567].includes(port)) ? 'Intelbras/Dahua provável' : 'DVR / NVR provável';
    if (type === AssetType.CAMERA) return 'Câmera IP provável';
    if (type === AssetType.IP_PHONE) return 'Telefone IP provável';
    if (type === AssetType.VOIP_SERVER) return 'Servidor VoIP provável';
    return null;
  }

  private manufacturerFromMac(macAddress: string | null): string | null {
    const prefix = (macAddress || '').replace(/-/g, ':').toUpperCase().slice(0, 8);
    const virtualVendors: Record<string, string> = {
      // Interface embarcada; este prefixo não determina o modelo do equipamento.
      // https://www.jkmicro.com/picoFlash_man_v11.pdf
      '00:90:C2': 'JK microsystems, Inc.',
      'D0:94:66': 'Dell Inc.',
      '9C:45:63': 'Dimep',
      '00:17:61': 'Control iD',
      '00:1A:3F': 'Intelbras',
      '00:1B:11': 'Dahua',
      '3C:EF:8C': 'Dahua',
      '24:52:6A': 'Dahua',
      'BC:32:5F': 'Hikvision',
      'C0:56:E3': 'Hikvision',
      '44:19:B6': 'Hikvision',
      '18:68:CB': 'Hikvision',
      '00:0B:82': 'Grandstream',
      'C0:74:AD': 'Grandstream',
      '00:15:65': 'Yealink',
      '80:5E:C0': 'Yealink',
      '24:9A:D8': 'Yealink',
      '00:A8:59': 'Fanvil',
      '00:90:8F': 'AudioCodes',
      '00:04:F2': 'Poly',
      '64:16:7F': 'Poly',
      'F4:92:BF': 'Ubiquiti',
      '24:A4:3C': 'Ubiquiti',
      '44:D9:E7': 'Ubiquiti',
      '68:72:51': 'Ubiquiti',
      '78:8A:20': 'Ubiquiti',
      'B4:FB:E4': 'Ubiquiti',
      'DC:9F:DB': 'Ubiquiti',
      'E0:63:DA': 'Ubiquiti',
      'D4:CA:6D': 'MikroTik',
      '48:8F:5A': 'MikroTik',
      '64:D1:54': 'MikroTik',
      '74:4D:28': 'MikroTik',
      'E4:8D:8C': 'MikroTik',
      '30:B5:C2': 'TP-Link',
      '50:C7:BF': 'TP-Link',
      '54:AF:97': 'TP-Link',
      '98:DA:C4': 'TP-Link',
      'C4:E9:84': 'TP-Link',
      '00:04:96': 'Extreme Networks',
      '00:1A:A1': 'Aruba',
      '00:24:6C': 'Aruba',
      '6C:F3:7F': 'Aruba',
      '00:1B:2A': 'Cisco',
      '00:1D:45': 'Cisco',
      '00:26:0B': 'Cisco',
      '00:50:56': 'VMware',
      '00:80:77': 'Brother',
      '00:00:48': 'Epson',
      '00:17:C8': 'Kyocera',
      '00:07:4D': 'Zebra',
      '08:00:27': 'Oracle VirtualBox',
      '00:05:69': 'VMware',
      '00:0C:29': 'VMware',
      '00:1C:14': 'VMware',
      '00:15:5D': 'Microsoft Hyper-V',
      '52:54:00': 'QEMU/KVM',
      '00:1C:42': 'Parallels',
    };
    return virtualVendors[prefix] || null;
  }

  private categoryFromType(type: AssetType) {
    if (type === AssetType.DVR_NVR) return 'DVR / NVR';
    if (type === AssetType.CAMERA) return 'Câmera';
    if (type === AssetType.IP_PHONE) return 'Telefone IP';
    if (type === AssetType.VOIP_SERVER) return 'Servidor VoIP / PABX';
    if (type === AssetType.PRINTER) return 'Impressora';
    if (type === AssetType.ANTENNA) return 'Antena';
    if (type === AssetType.TIME_CLOCK) return 'Relógio de ponto';
    if (type === AssetType.TURNSTILE) return 'Catraca';
    if (type === AssetType.DESKTOP) return 'Desktop';
    if (type === AssetType.NOTEBOOK) return 'Notebook';
    if (type === AssetType.OTHER) return 'Dispositivo de rede';
    return type.replace(/_/g, ' ');
  }

  private async collectWindowsInventory(ipAddress: string, username: string, password: string) {
    if (process.platform !== 'win32') throw new Error('A coleta detalhada requer que o backend esteja executando no Windows');
    if (!(await this.isPortOpen(ipAddress, 135, 800))) {
      throw new Error('RPC/WMI indisponível: a porta TCP 135 está bloqueada ou a máquina não é Windows');
    }

    const script = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$VerbosePreference = 'SilentlyContinue'
$InformationPreference = 'SilentlyContinue'
if ([string]::IsNullOrEmpty($env:INVENTORY_PASSWORD)) {
  $secure = New-Object System.Security.SecureString
} else {
  $secure = ConvertTo-SecureString $env:INVENTORY_PASSWORD -AsPlainText -Force
}
$option = New-CimSessionOption -Protocol Dcom
$inputUser = $env:INVENTORY_USERNAME
$candidateUsers = [System.Collections.Generic.List[string]]::new()
$candidateUsers.Add($inputUser)
if ($inputUser.StartsWith('.\')) {
  $localUser = $inputUser.Substring(2)
  try {
    $remoteHost = ([System.Net.Dns]::GetHostEntry($env:INVENTORY_TARGET).HostName -split '\.')[0]
    if ($remoteHost) {
      $hostUser = "$remoteHost\$localUser"
      if (-not $candidateUsers.Contains($hostUser)) { $candidateUsers.Add($hostUser) }
    }
  } catch { }
}
$session = $null
$connectionErrors = [System.Collections.Generic.List[string]]::new()
foreach ($candidateUser in $candidateUsers) {
  try {
    $credential = New-Object System.Management.Automation.PSCredential($candidateUser, $secure)
    $session = New-CimSession -ComputerName $env:INVENTORY_TARGET -Credential $credential -SessionOption $option -OperationTimeoutSec 8
    break
  } catch {
    $connectionErrors.Add("$candidateUser => $($_.Exception.Message)")
  }
}
if (-not $session) {
  throw "Nenhuma credencial local abriu a sessão CIM. $($connectionErrors -join ' | ')"
}
try {
  $computer = Get-CimInstance -CimSession $session -ClassName Win32_ComputerSystem
  $os = Get-CimInstance -CimSession $session -ClassName Win32_OperatingSystem
  $cpu = Get-CimInstance -CimSession $session -ClassName Win32_Processor | Select-Object -First 1
  $bios = Get-CimInstance -CimSession $session -ClassName Win32_BIOS
  $enclosure = Get-CimInstance -CimSession $session -ClassName Win32_SystemEnclosure
  $disks = Get-CimInstance -CimSession $session -ClassName Win32_LogicalDisk -Filter "DriveType=3"
  $network = Get-CimInstance -CimSession $session -ClassName Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True" | Select-Object -First 1
  $license = Get-CimInstance -CimSession $session -ClassName SoftwareLicensingProduct -Filter "PartialProductKey IS NOT NULL" | Where-Object { $_.Name -like 'Windows*' } | Select-Object -First 1
  $windowsProductKey = $null
  try {
    $registryValue = Invoke-CimMethod -CimSession $session -Namespace root/default -ClassName StdRegProv -MethodName GetStringValue -Arguments @{
      hDefKey = [uint32]2147483650
      sSubKeyName = 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\SoftwareProtectionPlatform'
      sValueName = 'BackupProductKeyDefault'
    }
    if ($registryValue.ReturnValue -eq 0 -and $registryValue.sValue) {
      $windowsProductKey = $registryValue.sValue
    }
  } catch {
    $windowsProductKey = $null
  }
  [pscustomobject]@{
    hostname = $computer.Name
    manufacturer = $computer.Manufacturer
    model = $computer.Model
    loggedUser = $computer.UserName
    domain = $computer.Domain
    workgroup = $computer.Workgroup
    systemType = $computer.SystemType
    primaryOwnerName = $computer.PrimaryOwnerName
    memoryMb = [math]::Round($computer.TotalPhysicalMemory / 1MB)
    operatingSystem = $os.Caption
    osVersion = $os.Version
    osArchitecture = $os.OSArchitecture
    windowsInstallDate = if ($os.InstallDate) { $os.InstallDate.ToUniversalTime().ToString('o') } else { $null }
    lastBootAt = if ($os.LastBootUpTime) { $os.LastBootUpTime.ToUniversalTime().ToString('o') } else { $null }
    processor = $cpu.Name
    cpuCores = $cpu.NumberOfCores
    cpuLogicalProcessors = $cpu.NumberOfLogicalProcessors
    serialNumber = $bios.SerialNumber
    biosVersion = [string]::Join(' - ', (@($bios.SMBIOSBIOSVersion, $bios.Version) | Where-Object { $_ } | Select-Object -Unique))
    biosReleaseDate = if ($bios.ReleaseDate) { $bios.ReleaseDate.ToString('yyyy-MM-dd') } else { $null }
    chassisTypes = @($enclosure.ChassisTypes)
    diskGb = [math]::Round(($disks | Measure-Object -Property Size -Sum).Sum / 1GB)
    diskFreeGb = [math]::Round(($disks | Measure-Object -Property FreeSpace -Sum).Sum / 1GB)
    macAddress = $network.MACAddress
    licenseStatus = $license.LicenseStatus
    licensePartialKey = $license.PartialProductKey
    windowsProductKey = $windowsProductKey
  } | ConvertTo-Json -Compress
} finally {
  if ($session) { Remove-CimSession $session }
}`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');

    return new Promise<any>((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
        windowsHide: true,
        env: { ...process.env, INVENTORY_TARGET: ipAddress, INVENTORY_USERNAME: username, INVENTORY_PASSWORD: password },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error(`Tempo limite excedido ao conectar em ${ipAddress}`)); }, 25_000);
      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          const readableDetail = `${stderr}\n${stdout}`
            .replace(/<[^>]+>/g, ' ')
            .replace(/_x000D__x000A_/g, ' ')
            .replace(/_x[0-9A-Fa-f]{4}_/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          const detail = readableDetail.toLowerCase();
          if (detail.includes('0x8007052e') || detail.includes('logon failure') || detail.includes('user name or password is incorrect') || detail.includes('nome de usuário ou senha incorretos') || detail.includes('falha de logon')) return reject(new Error('Credencial recusada pelo Windows: confira a senha da conta local administrador'));
          if (detail.includes('access is denied') || detail.includes('acesso negado')) return reject(new Error('Acesso negado: confira usuário/senha e se a conta é administradora da máquina remota'));
          if (detail.includes('0x800706ba') || detail.includes('rpc server is unavailable') || detail.includes('servidor rpc não está disponível')) return reject(new Error('RPC indisponível: habilite WMI/DCOM e as regras de firewall da máquina'));
          const conciseDetail = readableDetail.slice(-600);
          return reject(new Error(`Falha WMI/CIM: ${conciseDetail || 'o Windows não informou o motivo da recusa'}`));
        }
        try { resolve(JSON.parse(stdout.trim())); }
        catch { reject(new Error('A máquina retornou dados em formato inesperado')); }
      });
    });
  }

  private async collectWindowsInventoryWithoutCredentials(ipAddress: string) {
    const device = await this.inspect(ipAddress);
    if (!device.online) throw new Error('O equipamento não respondeu ao ping nem às portas consultadas');

    const windowsPorts = device.openPorts.filter((port) => [135, 139, 445, 3389].includes(port));
    if (windowsPorts.length < 2) {
      throw new Error('Equipamento encontrado, mas sem indício suficiente de Windows. Informe os dados manualmente ou instale o agente');
    }

    return {
      hostname: device.hostname,
      manufacturer: null,
      model: null,
      serialNumber: null,
      macAddress: device.macAddress,
      operatingSystem: 'Windows (identificação limitada pela rede)',
      osVersion: null,
      osArchitecture: null,
      processor: null,
      cpuCores: null,
      cpuLogicalProcessors: null,
      memoryMb: null,
      diskGb: null,
      diskFreeGb: null,
      loggedUser: null,
      domain: null,
      workgroup: null,
      systemType: null,
      biosVersion: null,
      biosReleaseDate: null,
      windowsInstallDate: null,
      lastBootAt: null,
      chassisTypes: [],
      licenseStatus: null,
      licensePartialKey: null,
      windowsProductKey: null,
      openPorts: device.openPorts,
      limited: true,
    };
  }

  private printerManufacturer(text: string): string | null {
    const vendors: Array<[RegExp, string]> = [
      [/hewlett[ -]?packard|\bhp\b/i, 'HP'],
      [/brother/i, 'Brother'],
      [/epson|seiko epson/i, 'Epson'],
      [/canon/i, 'Canon'],
      [/lexmark/i, 'Lexmark'],
      [/xerox/i, 'Xerox'],
      [/kyocera/i, 'Kyocera'],
      [/ricoh/i, 'Ricoh'],
      [/samsung/i, 'Samsung'],
      [/zebra/i, 'Zebra'],
      [/pantum/i, 'Pantum'],
      [/oki/i, 'OKI'],
    ];
    return vendors.find(([pattern]) => pattern.test(text))?.[1] || null;
  }

  private deviceManufacturer(text: string): string | null {
    const printerVendor = this.printerManufacturer(text);
    if (printerVendor) return printerVendor;
    const vendors: Array<[RegExp, string]> = [
      [/control\s*id|controlid/i, 'Control iD'],
      [/henry/i, 'Henry'],
      [/dimep/i, 'Dimep'],
      [/topdata/i, 'Topdata'],
      [/madis/i, 'Madis'],
      [/zkteco/i, 'ZKTeco'],
      [/intelbras/i, 'Intelbras'],
      [/dahua/i, 'Dahua'],
      [/hikvision/i, 'Hikvision'],
      [/ubiquiti|unifi|airmax|nanostation|litebeam|powerbeam/i, 'Ubiquiti'],
      [/mikrotik|routeros/i, 'MikroTik'],
      [/tp[ -]?link/i, 'TP-Link'],
      [/fortinet|fortigate/i, 'Fortinet'],
      [/cisco/i, 'Cisco'],
      [/aruba/i, 'Aruba'],
      [/cambium/i, 'Cambium'],
      [/siemens|simatic/i, 'Siemens'],
      [/schneider/i, 'Schneider Electric'],
      [/rockwell|allen.?bradley/i, 'Rockwell Automation'],
      [/weintek/i, 'Weintek'],
      [/pro.?face/i, 'Pro-face'],
      [/beckhoff/i, 'Beckhoff'],
      [/advantech/i, 'Advantech'],
      [/omron/i, 'Omron'],
      [/moxa/i, 'Moxa'],
      [/phoenix.?contact/i, 'Phoenix Contact'],
      [/\bweg\b/i, 'WEG'],
      [/synology/i, 'Synology'],
      [/\bqnap\b/i, 'QNAP'],
      [/yealink/i, 'Yealink'],
      [/grandstream/i, 'Grandstream'],
      [/fanvil/i, 'Fanvil'],
      [/polycom|poly\b/i, 'Poly'],
      [/american power conversion|\bapc\b/i, 'APC'],
    ];
    return vendors.find(([pattern]) => pattern.test(text))?.[1] || null;
  }

  private async collectCredentiallessDeviceInfo(ipAddress: string, ports: number[], deepScan = false) {
    const querySnmp = (version: 0 | 1): Promise<{ identity: string; hostname: string | null; manufacturer: string | null; model: string | null; serialNumber: string | null; firmware: string | null } | null> => new Promise((resolve) => {
      const oids = ['1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.2.0', '1.3.6.1.2.1.1.5.0'];
      const session = snmp.createSession(ipAddress, 'public', { version, retries: deepScan ? 1 : 0, timeout: deepScan ? 2200 : 1300, transport: 'udp4' });
      session.get(oids, (error, varbinds) => {
        const values = new Map<string, string>();
        if (!error && varbinds) {
          for (const item of varbinds) {
            if (snmp.isVarbindError(item) || item.value == null) continue;
            const value = sanitizeHardwareText(Buffer.isBuffer(item.value) ? item.value.toString('utf8') : String(item.value));
            if (value) values.set(item.oid, value);
          }
        }
        session.close();
        const sysDescription = values.get(oids[0]) || null;
        const sysObjectId = values.get(oids[1]) || null;
        const hostname = values.get(oids[2]) || null;
        const identity = [sysDescription, hostname, sysObjectId].filter(Boolean).join(' | ');
        if (!identity) return resolve(null);
        resolve({
          identity,
          hostname,
          manufacturer: this.deviceManufacturer(identity),
          model: sysDescription?.slice(0, 255) || null,
          serialNumber: null,
          firmware: validDetectedVersion(identity.match(/(?:firmware|fw|version|versao|ver\.?)[\s:=_-]*([A-Za-z0-9._/-]{2,80})/i)?.[1]),
        });
      });
    });
    const snmpPromise = Promise.all([
      querySnmp(snmp.Version2c),
      querySnmp(snmp.Version1),
    ]).then((responses) => responses.filter(Boolean).sort((a, b) => (b?.identity.length || 0) - (a?.identity.length || 0))[0] || null);

    const httpPromise = (async () => {
      // Deep HTTP fingerprints are collected separately with bounded parallelism.
      if (deepScan) return null;
      const httpPorts = deepScan
        ? [80, 81, 82, 85, 88, 8000, 8001, 8008, 8080, 8081, 8088, 8090, 8899, 8999, 9000, 9001, 10000].filter((port) => ports.includes(port))
        : [80, 8000, 8080, 8081].filter((port) => ports.includes(port));
      const httpsPorts = deepScan
        ? [443, 5001, 7001, 7443, 8443, 9443].filter((port) => ports.includes(port))
        : [443, 8443].filter((port) => ports.includes(port));
      const urls = [
        ...httpPorts.map((port) => port === 80 ? `http://${ipAddress}` : `http://${ipAddress}:${port}`),
        ...httpsPorts.map((port) => port === 443 ? `https://${ipAddress}` : `https://${ipAddress}:${port}`),
      ];
      for (const url of urls) {
        const controller = new AbortController();
        // Interfaces embarcadas (especialmente relógios e automação) podem
        // responder devagar. Um prazo maior evita classificar só pelas portas.
        const timer = setTimeout(() => controller.abort(), deepScan ? 6500 : 3500);
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) continue;
          const html = (await response.text()).slice(0, 180_000);
          const title = sanitizeHardwareText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, ' '));
          const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').slice(0, 8000);
          const facts = extractHttpHardwareFacts(title, text);
          const identity = facts.identity;
          const manufacturer = this.deviceManufacturer(identity);
          const recognizable = manufacturer || facts.isTimeClock || /catraca|turnstile|antena|access.?point|switch|router|gateway|firewall|impressora|printer|camera|dvr|nvr|\bihm\b|\bhmi\b|\bplc\b|modbus|automacao|automation|telefone\s*ip|ip.?phone|\bsip\b|voip|pabx|pbx|asterisk|freepbx|issabel|elastix|yealink|grandstream|fanvil|polycom|nas|storage|ups|no.?break/i.test(identity);
          if (!recognizable) continue;
          return {
            identity,
            hostname: null,
            manufacturer,
            model: facts.model,
            serialNumber: facts.serialNumber,
            firmware: facts.firmware,
          };
        } catch { /* equipamento sem interface HTTP acessivel */ }
        finally { clearTimeout(timer); }
      }
      return null;
    })();

    const [snmpInfo, httpInfo] = await Promise.all([snmpPromise, httpPromise]);
    if (!snmpInfo && !httpInfo) return null;
    return {
      identity: [snmpInfo?.identity, httpInfo?.identity].filter(Boolean).join(' | '),
      hostname: snmpInfo?.hostname || null,
      manufacturer: snmpInfo?.manufacturer || httpInfo?.manufacturer || null,
      model: httpInfo?.model || snmpInfo?.model || null,
      serialNumber: httpInfo?.serialNumber || snmpInfo?.serialNumber || null,
      firmware: snmpInfo?.firmware || httpInfo?.firmware || null,
    };
  }

  private async collectPrinterSnmp(ipAddress: string) {
    const oids = [
      '1.3.6.1.2.1.1.1.0',
      '1.3.6.1.2.1.1.5.0',
      '1.3.6.1.2.1.25.3.2.1.3.1',
      '1.3.6.1.2.1.43.5.1.1.16.1',
      '1.3.6.1.2.1.43.5.1.1.17.1',
    ];
    const values = await new Promise<Map<string, string>>((resolve) => {
      const session = snmp.createSession(ipAddress, 'public', { version: 1, retries: 0, timeout: 1300, transport: 'udp4' });
      session.get(oids, (error, varbinds) => {
        const result = new Map<string, string>();
        if (!error && varbinds) {
          for (const varbind of varbinds) {
            if (snmp.isVarbindError(varbind) || varbind.value == null) continue;
            const value = Buffer.isBuffer(varbind.value) ? varbind.value.toString('utf8') : String(varbind.value);
            const clean = sanitizeHardwareText(value.replace(/\0/g, ''));
            if (clean) result.set(varbind.oid, clean);
          }
        }
        session.close();
        resolve(result);
      });
    });
    if (!values.size) return null;

    const sysDescription = values.get(oids[0]) || null;
    const sysName = values.get(oids[1]) || null;
    const deviceDescription = values.get(oids[2]) || null;
    const printerName = values.get(oids[3]) || null;
    const serialFromDescription = sysDescription?.match(/(?:^|,)\s*SN:([^,]+)/i)?.[1]?.trim() || null;
    const serialNumber = this.normalizeSerialNumber(values.get(oids[4]) || serialFromDescription);
    const identity = [printerName, deviceDescription, sysDescription, sysName].filter(Boolean).join(' | ');
    const firmware = identity.match(/(?:firmware|firmware version|fw|version|ver\.?)[\s:=_-]*([A-Za-z0-9._-]{2,40})/i)?.[1] || null;
    const productId = sysDescription?.match(/(?:^|,)\s*PID:([^,]+)/i)?.[1]?.trim() || null;
    const model = [productId, printerName, deviceDescription, sysDescription]
      .map((value) => sanitizeHardwareText(value))
      .find((value) => value && !/^(printer|impressora|unknown)$/i.test(value)) || null;

    return {
      hostname: sysName,
      manufacturer: this.printerManufacturer(identity),
      model: model?.slice(0, 255) || null,
      serialNumber,
      firmware: firmware?.slice(0, 255) || null,
    };
  }

  private async collectPrinterHttp(ipAddress: string, ports: number[]) {
    const bases = [
      ...(ports.includes(80) ? [`http://${ipAddress}`] : []),
      ...(ports.includes(443) ? [`https://${ipAddress}`] : []),
    ];
    const candidates = bases.flatMap((base) => [base, `${base}/info_configuration.html?tab=Home&menu=DevConfig`]);
    let detectedManufacturer: string | null = null;
    let detectedModel: string | null = null;
    let detectedFirmware: string | null = null;
    for (const url of candidates) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) continue;
        const html = (await response.text()).slice(0, 250_000);
        const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
        const title = sanitizeHardwareText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' '));
        const facts = extractHttpHardwareFacts(title, text.slice(0, 8000));
        const identity = facts.identity;
        const manufacturer = this.printerManufacturer(identity);
        // Uma página só entra na coleta de impressoras se houver evidência
        // explícita. Relógios podem mencionar sua impressora térmica interna.
        if (facts.isTimeClock || (!manufacturer && !PRINTER_IDENTITY_PATTERN.test(identity))) continue;
        detectedManufacturer = manufacturer || detectedManufacturer;
        detectedModel = facts.model || detectedModel;
        detectedFirmware = facts.firmware || detectedFirmware;
        if (detectedFirmware) return { manufacturer: detectedManufacturer, model: detectedModel, firmware: detectedFirmware };
      } catch { /* tenta a próxima interface web */ }
      finally { clearTimeout(timer); }
    }
    return detectedManufacturer || detectedModel || detectedFirmware
      ? { manufacturer: detectedManufacturer, model: detectedModel, firmware: detectedFirmware }
      : null;
  }

  private async collectPrinterInfo(ipAddress: string, ports: number[]) {
    const [snmpInfo, httpInfo] = await Promise.all([
      this.collectPrinterSnmp(ipAddress).catch(() => null),
      this.collectPrinterHttp(ipAddress, ports).catch(() => null),
    ]);
    if (!snmpInfo && !httpInfo) return null;
    return {
      hostname: snmpInfo?.hostname || null,
      manufacturer: snmpInfo?.manufacturer || httpInfo?.manufacturer || null,
      model: snmpInfo?.model || httpInfo?.model || null,
      serialNumber: snmpInfo?.serialNumber || null,
      firmware: snmpInfo?.firmware || httpInfo?.firmware || null,
    };
  }

  private async probeSipUdp(ipAddress: string): Promise<{ port: number; identity: string } | null> {
    const ports = [5060, 5080, 5160];
    const probes = ports.map((port) => new Promise<{ port: number; identity: string } | null>((resolve) => {
      const socket = dgram.createSocket('udp4');
      const branch = crypto.randomBytes(8).toString('hex');
      const callId = crypto.randomBytes(10).toString('hex');
      const payload = [
        `OPTIONS sip:${ipAddress} SIP/2.0`,
        `Via: SIP/2.0/UDP 0.0.0.0;branch=z9hG4bK${branch}`,
        'Max-Forwards: 70',
        `To: <sip:${ipAddress}>`,
        `From: <sip:nexxati@${ipAddress}>;tag=${branch}`,
        `Call-ID: ${callId}@nexxati`,
        'CSeq: 1 OPTIONS',
        'User-Agent: NEXXATI Discovery',
        'Content-Length: 0',
        '',
        '',
      ].join('\r\n');

      const finish = (value: { port: number; identity: string } | null) => {
        clearTimeout(timer);
        socket.removeAllListeners();
        try { socket.close(); } catch { /* socket already closed */ }
        resolve(value);
      };

      const timer = setTimeout(() => finish(null), 700);
      socket.once('error', () => finish(null));
      socket.once('message', (message) => {
        const response = message.toString('utf8');
        if (!/SIP\/2\.0|server:|user-agent:|asterisk|freepbx|issabel|elastix|3cx|yealink|grandstream|fanvil|polycom|pabx|pbx/i.test(response)) {
          finish(null);
          return;
        }
        const headerSummary = response
          .split(/\r?\n/)
          .filter((line) => /^(SIP\/2\.0|Server:|User-Agent:|Organization:|Allow:)/i.test(line.trim()))
          .join(' ');
        const identity = sanitizeHardwareText(headerSummary) || sanitizeHardwareText(response.slice(0, 600)) || `SIP UDP ${port}`;
        finish({ port, identity });
      });
      socket.send(Buffer.from(payload), port, ipAddress, (error) => {
        if (error) finish(null);
      });
    }));

    const results = await Promise.all(probes);
    return results.find((result): result is { port: number; identity: string } => Boolean(result)) || null;
  }

  private async collectNetbiosHostname(ipAddress: string): Promise<string | null> {
    if (process.platform !== 'win32') return null;
    try {
      const { stdout } = await execFileAsync('nbtstat', ['-A', ipAddress], { timeout: 2800, windowsHide: true, maxBuffer: 128_000 });
      const names = stdout
        .split(/\r?\n/)
        .map((line) => line.match(/^\s*([^\s<]{2,15})\s+<00>\s+UNIQUE/i)?.[1])
        .filter((name): name is string => typeof name === 'string' && !/^WORKGROUP$/i.test(name));
      return names[0] || null;
    } catch {
      return null;
    }
  }

  private async inspect(ipAddress: string, deepScan = false): Promise<DiscoveredDevice> {
    const startedAt = Date.now();
    const pingArgs = process.platform === 'win32'
      ? ['-4', '-n', '1', '-w', deepScan ? '1800' : '900', ipAddress]
      : ['-c', '1', '-W', deepScan ? '2' : '1', ipAddress];

    let pingOnline = false;
    try {
      const { stdout } = await execFileAsync('ping', pingArgs, { timeout: deepScan ? 2600 : 1500, windowsHide: true, maxBuffer: 128_000 });
      pingOnline = hasPingReply(stdout);
    } catch { pingOnline = false; }

    const standardProbePorts = [
      22, 23, 53, 80, 81, 82, 85, 88, 102, 135, 443, 445, 502, 515, 548, 554, 631,
      3000, 3001, 3570, 4000, 4001,
      1024, 5000, 5001, 7001, 7443, 8000, 8001, 8008, 8080, 8081, 8088, 8090,
      8291, 8443, 8554, 8899, 8999, 9000, 9001, 9100, 9600, 10000, 20000,
      1883, 2049, 2404, 3389, 4840, 5038, 5060, 5061, 5080, 5160, 8089, 34567, 37777, 37778, 44818, 47808,
    ];
    const deepProbePorts = [
      21, 25, 110, 139, 143, 389, 465, 587, 993, 995, 1720, 1935, 3306, 5432, 5900,
      6000, 6667, 7547, 8006, 8082, 8083, 8181, 8728, 8729, 8888, 9443, 9999, 10001,
    ];
    const probePorts = deepScan ? [...new Set([...standardProbePorts, ...deepProbePorts, ...DEEP_PORTS])] : standardProbePorts;
    const portStates = await mapLimited(probePorts, deepScan ? 48 : 32, async (port) => ({ port, open: await this.isPortOpen(ipAddress, port, deepScan ? 1100 : 750) }));
    if (deepScan) {
      const retry = portStates.filter((item) => !item.open && [22, 80, 443, 445, 502, 554, 3389, 9100].includes(item.port));
      await mapLimited(retry, 8, async (item) => { item.open = await this.isPortOpen(ipAddress, item.port, 2000); });
    }
    const tcpOpenPorts = portStates.filter((item) => item.open).map((item) => item.port);
    const sipUdpInfo = await this.probeSipUdp(ipAddress).catch(() => null);
    const openPorts = [...new Set([...tcpOpenPorts, ...(sipUdpInfo ? [sipUdpInfo.port] : [])])];
    // SNMP can identify hosts even when ICMP and all TCP ports are filtered.
    const deepInfo = deepScan ? await this.collectCredentiallessDeviceInfo(ipAddress, tcpOpenPorts, true).catch(() => null) : null;
    const online = pingOnline || openPorts.length > 0 || Boolean(deepInfo);

    if (!online) return { ipAddress, hostname: null, macAddress: null, manufacturer: null, model: null, serialNumber: null, firmware: null, online, responseTimeMs: null, source: 'NETWORK_SCAN', type: AssetType.OTHER, openPorts: [] };

    const dnsHostname = await withTimeout(
      dns.reverse(ipAddress).then((names) => names[0] || null).catch(() => null),
      deepScan ? 2200 : 1000,
      null,
    );
    const netbiosHostname = deepScan ? await this.collectNetbiosHostname(ipAddress) : null;
    const hostname = dnsHostname || netbiosHostname;

    let macAddress: string | null = null;
    try {
      const { stdout } = await execFileAsync('arp', ['-a', ipAddress], { timeout: 1200, windowsHide: true, maxBuffer: 128_000 });
      const match = stdout.match(/(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i);
      macAddress = match ? match[0].replace(/-/g, ':').toUpperCase() : null;
    } catch { macAddress = null; }

    // SNMP/HTTP também deve ser consultado quando as portas lembram Windows:
    // NAS, IHM, CLP e gateways podem expor 445/3389 e não são desktops.
    const credentiallessInfo = deepScan ? deepInfo : await this.collectCredentiallessDeviceInfo(ipAddress, openPorts, false).catch(() => null);
    const fingerprints = deepScan ? await fingerprintServices(ipAddress, tcpOpenPorts) : null;
    const serviceEvidence: ServiceEvidence[] = fingerprints?.evidence || [];
    if (deepInfo) serviceEvidence.push({ port: 161, transport: 'UDP', service: 'SNMP', confirmed: true, details: deepInfo.identity.slice(0, 600) });
    if (sipUdpInfo) serviceEvidence.push({ port: sipUdpInfo.port, transport: 'UDP', service: 'SIP', confirmed: true, details: sipUdpInfo.identity.slice(0, 600) });
    const serviceIdentity = serviceEvidence.filter((item) => item.confirmed).map((item) => item.details).join(' | ');
    const industrial = fingerprints?.industrial;
    const httpTitle = fingerprints?.httpTitles.find((title) => !GENERIC_HTTP_TITLE_PATTERN.test(title)) || null;
    const httpFacts = extractHttpHardwareFacts(httpTitle, fingerprints?.httpIdentity || '');
    const serviceManufacturer = industrial?.manufacturer || this.deviceManufacturer(`${serviceIdentity} ${httpFacts.identity}`);
    const macManufacturer = this.manufacturerFromMac(macAddress);
    const detectedManufacturer = credentiallessInfo?.manufacturer || serviceManufacturer || macManufacturer;
    const type = this.classifyDevice(ipAddress, [credentiallessInfo?.hostname, hostname, credentiallessInfo?.identity, sipUdpInfo?.identity, serviceIdentity, httpFacts.identity, industrial ? 'Modbus automation' : ''].filter(Boolean).join(' ') || null, detectedManufacturer || null, openPorts);
    const printerInfo = type === AssetType.PRINTER ? await this.collectPrinterInfo(ipAddress, openPorts) : null;
    const manufacturer = printerInfo?.manufacturer || detectedManufacturer || this.manufacturerFromScan(type, openPorts);
    return {
      ipAddress,
      hostname: printerInfo?.hostname || credentiallessInfo?.hostname || hostname,
      macAddress,
      manufacturer,
      manufacturerSource: printerInfo?.manufacturer || credentiallessInfo?.manufacturer || serviceManufacturer ? 'device' : macManufacturer ? 'mac' : manufacturer ? 'ports' : null,
      serviceEvidence,
      scannedPortCount: probePorts.length,
      identificationNote: [
        pingOnline ? 'Responde ao ping.' : 'Detectado por serviço de rede.',
        tcpOpenPorts.length ? `Portas TCP abertas: ${tcpOpenPorts.join(', ')}.` : `Nenhuma das ${probePorts.length} portas TCP consultadas respondeu; outras portas e serviços UDP podem existir.`,
        tcpOpenPorts.includes(502) && !industrial ? 'Porta 502: possível Modbus TCP (automação industrial); protocolo e modelo ainda não confirmados.' : '',
        !credentiallessInfo && !sipUdpInfo && !hostname && !serviceIdentity ? 'Sem nome ou identificação pelos protocolos consultados.' : '',
        macManufacturer && !credentiallessInfo?.manufacturer && !printerInfo?.manufacturer && !serviceManufacturer ? 'Fabricante inferido pelo MAC da interface; não confirma marca, modelo ou função do equipamento.' : '',
        fingerprints?.limited ? 'Identificação limitada aos primeiros 32 serviços para manter o tempo de busca controlado.' : '',
      ].filter(Boolean).join(' '),
      model: printerInfo?.model || industrial?.model || httpFacts.model || credentiallessInfo?.model || null,
      serialNumber: printerInfo?.serialNumber || httpFacts.serialNumber || credentiallessInfo?.serialNumber || null,
      firmware: printerInfo?.firmware || industrial?.firmware || httpFacts.firmware || credentiallessInfo?.firmware || null,
      online,
      responseTimeMs: Date.now() - startedAt,
      source: printerInfo
        ? 'NETWORK_SCAN_PRINTER_SNMP_HTTP'
        : type === AssetType.TIME_CLOCK && credentiallessInfo
          ? 'NETWORK_SCAN_CLOCK_HTTP'
          : credentiallessInfo
            ? deepScan ? 'NETWORK_SCAN_DEEP_SNMP_HTTP' : 'NETWORK_SCAN_SNMP_HTTP'
            : type === AssetType.CAMERA || type === AssetType.DVR_NVR || type === AssetType.IP_PHONE || type === AssetType.VOIP_SERVER
              ? 'NETWORK_SCAN_DEVICE_HINT'
              : deepScan ? 'NETWORK_SCAN_DEEP' : 'NETWORK_SCAN',
      type,
      openPorts,
    };
  }

  async discover(input: unknown) {
    const { targets, mode, skipKnownIps, networkSegmentId, scanDepth } = discoverySchema.parse(input);
    const ignored = await prisma.discoveryIgnoredIp.findMany({
      where: { mode, ipAddress: { in: targets } },
      orderBy: { ipAddress: 'asc' },
      select: { id: true, ipAddress: true, mode: true, reason: true, createdAt: true },
    });
    const ignoredIps = new Set(ignored.map((item) => item.ipAddress));
    const knownIps = skipKnownIps ? await this.findKnownIps(targets, networkSegmentId) : new Set<string>();
    const skippedKnown = targets.filter((target) => knownIps.has(target) && !ignoredIps.has(target));
    const scanTargets = targets.filter((target) => !ignoredIps.has(target) && !knownIps.has(target));
    const devices: DiscoveredDevice[] = [];
    const deepScan = scanDepth === 'deep';
    const concurrency = deepScan ? 4 : 12;
    let cursor = 0;

    const worker = async () => {
      while (cursor < scanTargets.length) {
        const target = scanTargets[cursor++];
        devices.push(await this.inspect(target, deepScan));
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, scanTargets.length) }, worker));
    devices.sort((a, b) => a.ipAddress.localeCompare(b.ipAddress, undefined, { numeric: true }));
    return { devices, ignored, scanned: scanTargets.length, skippedKnown: skippedKnown.length, online: devices.filter((device) => device.online).length };
  }

  async listIgnored(input: unknown) {
    const { mode } = discoveryIgnoreListSchema.parse(input);
    return prisma.discoveryIgnoredIp.findMany({
      where: { mode },
      orderBy: { ipAddress: 'asc' },
      select: { id: true, ipAddress: true, mode: true, reason: true, createdAt: true },
    });
  }

  async ignoreIp(input: unknown, performedById: string) {
    const data = discoveryIgnoreSchema.parse(input);
    return prisma.discoveryIgnoredIp.upsert({
      where: { ipAddress_mode: { ipAddress: data.ipAddress, mode: data.mode } },
      update: { reason: data.reason || null, createdById: performedById },
      create: { ipAddress: data.ipAddress, mode: data.mode, reason: data.reason || null, createdById: performedById },
      select: { id: true, ipAddress: true, mode: true, reason: true, createdAt: true },
    });
  }

  async unignoreIp(id: string) {
    await prisma.discoveryIgnoredIp.delete({ where: { id } });
  }

  async importDevices(input: unknown, performedById: string) {
    const { devices, companyId, networkSegmentId, adminPassword, importMode } = importDevicesSchema.parse(input);
    const adminAuthorized = await this.validateAdminPassword(adminPassword);
    const savedAssets = [];
    const failures: Array<{ ipAddress: string; error: string }> = [];
    const duplicates: Array<{ ipAddress: string; assetName: string; hardwareChanged: boolean }> = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const device of devices) {
      try {
        if (importMode === 'PRINTER' && device.type !== AssetType.PRINTER) {
          skipped++;
          continue;
        }

        const macAddress = device.macAddress?.replace(/-/g, ':').toUpperCase() || null;
        const existingByIp = await prisma.asset.findFirst({ where: { ipAddress: device.ipAddress, networkSegmentId: networkSegmentId || null } });
        const existingByMac = !existingByIp && macAddress
          ? await prisma.asset.findUnique({ where: { macAddress } })
          : null;
        const existing = existingByIp || existingByMac;
        const name = device.hostname || device.ipAddress;
        const type = device.type === AssetType.OTHER
          ? this.classifyDevice(device.ipAddress, device.hostname || null, device.manufacturer || null, device.openPorts)
          : device.type;

        if (existing) {
          const shouldCorrectNetworkType = this.shouldApplyNetworkTypeCorrection(existing.type, type);
          const shouldTrustRegisteredAgentType = device.source === 'REGISTERED_INTERNAL_AGENT' && device.type !== AssetType.OTHER && device.type !== existing.type;
          const detectedTypeForUpdate = shouldTrustRegisteredAgentType || shouldCorrectNetworkType ? type : undefined;
          const protectedComputerTypes: AssetType[] = [AssetType.DESKTOP, AssetType.NOTEBOOK, AssetType.SERVER, AssetType.VIRTUAL_MACHINE];
          if (importMode === 'PRINTER' && protectedComputerTypes.includes(existing.type)) {
            skipped++;
            continue;
          }

          const hardwareChanged = this.hasHardwareChanges(existing as unknown as Record<string, unknown>, {
            macAddress,
            manufacturer: device.manufacturer,
            model: device.model,
            serialNumber: device.serialNumber,
          });
          const telemetryData = this.compactUpdateData({
            type: detectedTypeForUpdate,
            category: detectedTypeForUpdate ? this.categoryFromType(detectedTypeForUpdate) : undefined,
            operatingSystem: device.operatingSystem || undefined,
            osVersion: device.osVersion || undefined,
            osArchitecture: device.osArchitecture || undefined,
            processor: device.processor || undefined,
            cpuCores: device.cpuCores ?? undefined,
            cpuLogicalProcessors: device.cpuLogicalProcessors ?? undefined,
            memoryMb: device.memoryMb ?? undefined,
            diskGb: device.diskGb ?? undefined,
            diskFreeGb: device.diskFreeGb ?? undefined,
            loggedUser: device.loggedUser || undefined,
            domain: device.domain || undefined,
            workgroup: device.workgroup || undefined,
            systemType: device.systemType || undefined,
            biosVersion: device.biosVersion || undefined,
            biosReleaseDate: device.biosReleaseDate || undefined,
            windowsInstallDate: device.windowsInstallDate || undefined,
            lastBootAt: device.lastBootAt || undefined,
            gateway: device.gateway || undefined,
            windowsLicenseKey: device.windowsProductKeyProtected || (device.windowsLicenseKey ? encryptPassword(device.windowsLicenseKey) : undefined),
            windowsLicenseStatus: device.windowsLicenseStatus || undefined,
            windowsProductKeyPartial: device.windowsProductKeyPartial || undefined,
            status: device.online ? this.statusFromNetworkPresence(existing.status) : undefined,
            lastSeenAt: device.online ? new Date() : undefined,
          });

          if (!hardwareChanged) {
            if (Object.keys(telemetryData).length) {
              savedAssets.push(await prisma.asset.update({ where: { id: existing.id }, data: telemetryData }));
              updated++;
            } else {
              skipped++;
            }
            continue;
          }

          if (!adminAuthorized) {
            if (shouldCorrectNetworkType) {
              savedAssets.push(await prisma.asset.update({
                where: { id: existing.id },
                data: {
                  ...this.compactUpdateData({
                    type,
                    category: this.categoryFromType(type),
                    openPorts: device.openPorts,
                    status: device.online ? this.statusFromNetworkPresence(existing.status) : undefined,
                    lastSeenAt: device.online ? new Date() : undefined,
                    discoverySource: existing.discoverySource || device.source,
                  }),
                  history: { create: { action: AssetHistoryAction.UPDATED, description: `Tipo corrigido pela descoberta de rede (${device.ipAddress})`, performedById } },
                },
              }));
              updated++;
              continue;
            }
            duplicates.push({ ipAddress: device.ipAddress, assetName: existing.name, hardwareChanged });
            continue;
          }

          const checkedAt = new Date();
          const updateData = this.compactUpdateData({
            macAddress,
            manufacturer: device.manufacturer || undefined,
            model: device.model || undefined,
            serialNumber: this.normalizeSerialNumber(device.serialNumber) || undefined,
            firmware: device.firmware || undefined,
            type: shouldCorrectNetworkType ? type : undefined,
            category: shouldCorrectNetworkType ? this.categoryFromType(type) : undefined,
            openPorts: device.openPorts,
            status: device.online ? this.statusFromNetworkPresence(existing.status) : undefined,
            lastSeenAt: device.online ? checkedAt : undefined,
            discoverySource: existing.discoverySource || device.source,
            ...telemetryData,
          });
          savedAssets.push(await prisma.asset.update({
            where: { id: existing.id },
            data: {
              ...updateData,
              history: { create: { action: AssetHistoryAction.UPDATED, description: `Hardware alterado e confirmado por administrador (${device.ipAddress})`, performedById } },
            },
          }));
          updated++;
          continue;
        }

        const suffix = (macAddress || device.ipAddress).replace(/[^A-Za-z0-9]/g, '').slice(-12).toUpperCase();
        savedAssets.push(await prisma.asset.create({
          data: {
            assetTag: `NET-${suffix}`,
            name,
            type,
            category: this.categoryFromType(type),
            status: this.statusFromNetworkPresence(),
            manufacturer: device.manufacturer || null,
            model: device.model || null,
            serialNumber: this.normalizeSerialNumber(device.serialNumber),
            firmware: device.firmware || null,
            companyId,
            networkSegmentId: networkSegmentId || null,
            ipAddress: device.ipAddress,
            macAddress,
            hostname: device.hostname || null,
            openPorts: device.openPorts,
            lastSeenAt: device.online ? new Date() : null,
            discoverySource: device.source,
            operatingSystem: device.operatingSystem || null,
            osVersion: device.osVersion || null,
            osArchitecture: device.osArchitecture || null,
            processor: device.processor || null,
            cpuCores: device.cpuCores ?? null,
            cpuLogicalProcessors: device.cpuLogicalProcessors ?? null,
            memoryMb: device.memoryMb ?? null,
            diskGb: device.diskGb ?? null,
            diskFreeGb: device.diskFreeGb ?? null,
            loggedUser: device.loggedUser || null,
            domain: device.domain || null,
            workgroup: device.workgroup || null,
            systemType: device.systemType || null,
            biosVersion: device.biosVersion || null,
            biosReleaseDate: device.biosReleaseDate || null,
            windowsInstallDate: device.windowsInstallDate || null,
            lastBootAt: device.lastBootAt || null,
            gateway: device.gateway || null,
            windowsLicenseKey: device.windowsProductKeyProtected || (device.windowsLicenseKey ? encryptPassword(device.windowsLicenseKey) : null),
            windowsLicenseStatus: device.windowsLicenseStatus || null,
            windowsProductKeyPartial: device.windowsProductKeyPartial || null,
            history: { create: { action: AssetHistoryAction.CREATED, description: `Importado da rede (${device.ipAddress})`, performedById } },
          },
        }));
        created++;
      } catch (error) {
        failures.push({ ipAddress: device.ipAddress, error: error instanceof Error ? error.message : 'Falha ao salvar' });
      }
    }

    const persisted = await prisma.asset.count({ where: { id: { in: savedAssets.map((asset) => asset.id) } } });
    return {
      imported: persisted,
      created,
      updated,
      skipped,
      failed: failures.length,
      failures,
      duplicates,
      assets: savedAssets.map((asset) => ({
        ...asset,
        windowsLicenseKey: asset.windowsLicenseKey ? decryptPassword(asset.windowsLicenseKey) : null,
      })),
    };
  }

  async detailedInventory(input: unknown, performedById: string) {
    const { targets, username, password, companyId, networkSegmentId, skipKnownIps } = detailedInventorySchema.parse(input);
    const authenticated = Boolean(username);
    const ignoredRecords = await prisma.discoveryIgnoredIp.findMany({ where: { mode: DiscoveryIgnoreMode.WINDOWS, ipAddress: { in: targets } }, select: { ipAddress: true } });
    const ignoredIps = new Set(ignoredRecords.map((item) => item.ipAddress));
    const knownIps = skipKnownIps ? await this.findKnownIps(targets, networkSegmentId) : new Set<string>();
    const skippedKnown = targets.filter((target) => knownIps.has(target) && !ignoredIps.has(target));
    const results: Array<{ ipAddress: string; success: boolean; ignored?: boolean; data?: any; error?: string }> = ignoredRecords.map((item) => ({ ipAddress: item.ipAddress, success: false, ignored: true, error: 'Ignorado na busca de computadores' }));

    for (const ipAddress of targets.filter((target) => !ignoredIps.has(target) && !knownIps.has(target))) {
      try {
        const data = authenticated
          ? await this.collectWindowsInventory(ipAddress, username, password)
          : await this.collectWindowsInventoryWithoutCredentials(ipAddress);
        const serialNumber = this.normalizeSerialNumber(data.serialNumber);
        const existingByIp = await prisma.asset.findFirst({ where: { ipAddress, networkSegmentId: networkSegmentId || null } });
        const existingBySerial = !existingByIp && serialNumber
          ? await prisma.asset.findFirst({ where: { serialNumber } })
          : null;
        const existing = existingByIp || existingBySerial;
        const chassisTypes = Array.isArray(data.chassisTypes) ? data.chassisTypes.map(Number) : [Number(data.chassisTypes || 0)];
        const isWindowsServer = /windows\s+server|server\s+standard|server\s+datacenter/i.test(`${data.operatingSystem || ''} ${data.systemType || ''}`);
        const detectedType = isWindowsServer
          ? AssetType.SERVER
          : chassisTypes.some((type: number) => [8, 9, 10, 14, 30, 31, 32].includes(type))
            ? AssetType.NOTEBOOK
            : AssetType.DESKTOP;
        const assetData = {
          name: data.hostname || ipAddress,
          type: detectedType,
          hostname: data.hostname || null,
          manufacturer: data.manufacturer || null,
          model: data.model || null,
          serialNumber,
          macAddress: data.macAddress ? String(data.macAddress).replace(/-/g, ':').toUpperCase() : null,
          operatingSystem: [data.operatingSystem, data.osArchitecture].filter(Boolean).join(' · ') || null,
          osVersion: data.osVersion || null,
          osArchitecture: data.osArchitecture || null,
          processor: data.processor || null,
          cpuCores: data.cpuCores || null,
          cpuLogicalProcessors: data.cpuLogicalProcessors || null,
          memoryMb: data.memoryMb || null,
          diskGb: data.diskGb || null,
          diskFreeGb: data.diskFreeGb || null,
          loggedUser: data.loggedUser || null,
          domain: data.domain || null,
          workgroup: data.workgroup || null,
          systemType: data.systemType || null,
          biosVersion: sanitizeHardwareText(data.biosVersion),
          biosReleaseDate: data.biosReleaseDate ? new Date(`${data.biosReleaseDate}T00:00:00.000Z`) : null,
          windowsInstallDate: data.windowsInstallDate ? new Date(data.windowsInstallDate) : null,
          lastBootAt: data.lastBootAt ? new Date(data.lastBootAt) : null,
          windowsLicenseKey: data.windowsProductKey ? encryptPassword(data.windowsProductKey) : null,
          windowsLicenseStatus: authenticated ? (Number(data.licenseStatus) === 1 ? 'LICENCIADO' : `STATUS_${Number(data.licenseStatus || 0)}`) : null,
          windowsProductKeyPartial: data.licensePartialKey || null,
          status: AssetStatus.ASSIGNED,
          lastSeenAt: new Date(),
          discoverySource: authenticated ? 'WINDOWS_CIM' : 'WINDOWS_NETWORK_LIMITED',
        };
        if (existing) {
          const hardwareChanged = this.hasHardwareChanges(existing as unknown as Record<string, unknown>, assetData);
          const { name: _detectedName, hostname: _detectedHostname, ...hardwareData } = assetData;
          const updateData = this.compactUpdateData({
            ...hardwareData,
            status: this.statusFromNetworkPresence(existing.status),
          });
          const inventoryChanged = Object.entries(updateData).some(([field, value]) => {
            if (field === 'lastSeenAt' || field === 'windowsLicenseKey') return false;
            return this.comparable((existing as unknown as Record<string, unknown>)[field]) !== this.comparable(value);
          });

          if (hardwareChanged || inventoryChanged) {
            await prisma.asset.update({
              where: { id: existing.id },
              data: {
                ...updateData,
                history: {
                  create: {
                    action: AssetHistoryAction.UPDATED,
                    description: hardwareChanged
                      ? (authenticated ? 'Hardware do inventário Windows atualizado; nome manual preservado' : 'Identificação limitada do Windows atualizada pela rede; nome manual preservado')
                      : (authenticated ? 'Inventário Windows atualizado; nome manual preservado' : 'Identificação limitada do Windows atualizada pela rede; nome manual preservado'),
                    performedById,
                  },
                },
              },
            });
          } else {
            await prisma.asset.update({
              where: { id: existing.id },
              data: {
                lastSeenAt: assetData.lastSeenAt,
                discoverySource: assetData.discoverySource,
              },
            });
          }
        } else {
          await prisma.asset.create({ data: { ...assetData, companyId: companyId || null, networkSegmentId: networkSegmentId || null, assetTag: `NET-${ipAddress.replace(/\./g, '')}`, ipAddress, category: 'Computador', status: AssetStatus.ASSIGNED, history: { create: { action: AssetHistoryAction.CREATED, description: authenticated ? 'Importado pelo inventário detalhado do Windows' : 'Importado pela identificação limitada do Windows sem credenciais', performedById } } } });
        }
        results.push({ ipAddress, success: true, data: { ...data, licenseStatus: Number(data.licenseStatus || 0) } });
      } catch (error) {
        results.push({ ipAddress, success: false, error: error instanceof Error ? error.message : 'Falha na coleta' });
      }
    }

    return { results, collected: results.filter((result) => result.success).length, failed: results.filter((result) => !result.success && !result.ignored).length, ignored: results.filter((result) => result.ignored).length, skippedKnown: skippedKnown.length };
  }

  async cctvInventory(input: unknown, performedById: string) {
    const { targets, username, password, deviceType, companyId, networkSegmentId, skipKnownIps } = cctvInventorySchema.parse(input);
    const knownIps = skipKnownIps ? await this.findKnownIps(targets, networkSegmentId) : new Set<string>();
    const scanTargets = targets.filter((target) => !knownIps.has(target));
    const results: Array<{ ipAddress: string; success: boolean; data?: any; error?: string }> = [];

    for (const ipAddress of scanTargets) {
      try {
        const probePorts = [80, 81, 82, 85, 88, 443, 554, 1024, 5000, 5001, 7001, 7443, 8000, 8001, 8008, 8080, 8081, 8088, 8090, 8554, 8899, 8999, 9000, 9001, 10000, 34567, 37777, 37778];
        const portStates = await Promise.all(probePorts.map(async (port) => ({ port, open: await this.isPortOpen(ipAddress, port, 900) })));
        const openPorts = portStates.filter((item) => item.open).map((item) => item.port);
        if (!openPorts.length) throw new Error('Nenhuma porta comum de câmera/DVR respondeu. Se a câmera estiver atrás da porta PoE interna do DVR, o backend precisa ter rota/acesso a essa rede.');

        const intelbras = deviceType === AssetType.DVR_NVR ? await this.collectIntelbrasDahua(ipAddress, username, password) : null;
        const onvif = deviceType === AssetType.CAMERA ? await this.collectOnvif(ipAddress, username, password) : null;
        const topcam = deviceType === AssetType.CAMERA && !onvif ? await this.collectTopcamHiSilicon(ipAddress, username, password) : null;
        const intelbrasCamera = deviceType === AssetType.CAMERA && !onvif && !topcam ? await this.collectIntelbrasDahua(ipAddress, username, password) : null;
        const collected = intelbras || onvif || topcam || intelbrasCamera;
        if (!collected) {
          throw new Error('Não foi possível autenticar ou identificar o dispositivo. Nada foi salvo para este IP.');
        }
        this.assertCctvTypeMatches(deviceType, collected);
        const serialNumber = this.normalizeSerialNumber(collected?.serialNumber);
        const existingByIp = await prisma.asset.findFirst({ where: { ipAddress, networkSegmentId: networkSegmentId || null } });
        const existingBySerial = !existingByIp && serialNumber
          ? await prisma.asset.findFirst({ where: { serialNumber } })
          : null;
        const existing = existingByIp || existingBySerial;
        const type = deviceType;
        const assetData = {
          name: collected?.model ? `${collected.model} (${ipAddress})` : ipAddress,
          type,
          category: this.categoryFromType(type),
          status: AssetStatus.ASSIGNED,
          manufacturer: collected?.manufacturer || (type === AssetType.DVR_NVR ? 'Intelbras' : null),
          model: collected?.model || null,
          serialNumber,
          ipAddress,
          firmware: collected?.firmware || null,
          openPorts,
          lastSeenAt: new Date(),
          discoverySource: 'CCTV_AUTH',
          notes: existing?.notes || null,
        };

        if (existing) {
          const hardwareChanged = this.hasHardwareChanges(existing as unknown as Record<string, unknown>, assetData);
          const statusUpdate = this.statusFromNetworkPresence(existing.status);
          if (needsCctvUpdate(existing, assetData, hardwareChanged)) {
            const { name: _detectedName, ...protectedAssetData } = assetData;
            const updateData = this.compactUpdateData({ ...protectedAssetData, status: statusUpdate, notes: undefined });
            await prisma.asset.update({
              where: { id: existing.id },
              data: { ...updateData, history: { create: { action: AssetHistoryAction.UPDATED, description: `Hardware CCTV atualizado; nome manual preservado (${ipAddress})`, performedById } } },
            });
          } else if (statusUpdate) {
            await prisma.asset.update({
              where: { id: existing.id },
              data: { status: statusUpdate, lastSeenAt: assetData.lastSeenAt, discoverySource: assetData.discoverySource },
            });
          }
        } else {
          const suffix = ipAddress.replace(/\./g, '');
          await prisma.asset.create({
            data: { ...assetData, companyId: companyId || null, networkSegmentId: networkSegmentId || null, assetTag: `CCTV-${suffix}`, history: { create: { action: AssetHistoryAction.CREATED, description: `Importado pelo inventário CCTV (${ipAddress})`, performedById } } },
          });
        }

        results.push({ ipAddress, success: true, data: { ...collected, openPorts, type } });
      } catch (error) {
        results.push({ ipAddress, success: false, error: error instanceof Error ? error.message : 'Falha na coleta CCTV' });
      }
    }

    return { results, collected: results.filter((result) => result.success).length, failed: results.filter((result) => !result.success).length, skippedKnown: targets.length - scanTargets.length };
  }
}
