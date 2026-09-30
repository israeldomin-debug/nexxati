import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { PasswordVaultDeviceType, PasswordVaultEntryType, Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuditService } from './audit.service';

const prisma = new PrismaClient();
const auditService = new AuditService();

const nullableText = z.string().trim().max(500).optional().nullable().transform((value) => value || null);
const nullablePassword = z.string().optional().nullable().transform((value) => value || null);


function encryptionKey(secret: string) {
  return crypto.createHash('sha256').update(secret).digest();
}

function primaryEncryptionSecret() {
  const secret = process.env.VAULT_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error('VAULT_ENCRYPTION_KEY ou JWT_SECRET nao configurado');
  return secret;
}

function decryptionKeys() {
  return [...new Set([
    process.env.VAULT_ENCRYPTION_KEY,
    process.env.JWT_SECRET,

  ].filter((value): value is string => Boolean(value)))].map(encryptionKey);
}

export function encryptPassword(password: string | null | undefined) {
  if (!password) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(primaryEncryptionSecret()), iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptPassword(value: string | null | undefined) {
  if (!value) return '';
  if (value.split(':').length !== 3) return value;
  const [ivText, authTagText, encryptedText] = value.split(':');
  if (!ivText || !authTagText || !encryptedText) return '';
  for (const key of decryptionKeys()) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64'));
      decipher.setAuthTag(Buffer.from(authTagText, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64')), decipher.final()]).toString('utf8');
    } catch {
      // Tenta a proxima chave para preservar registros legados.
    }
  }
  return '';
}

const passwordVaultBaseSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do registro').max(120),
  entryType: z.nativeEnum(PasswordVaultEntryType).default(PasswordVaultEntryType.OTHER),
  deviceType: z.nativeEnum(PasswordVaultDeviceType).default(PasswordVaultDeviceType.OTHER),
  ipAddressId: z.string().uuid().optional().nullable(),
  assetId: z.string().uuid().optional().nullable(),
  host: nullableText,
  url: nullableText,
  port: z.coerce.number().int().min(1).max(65535).optional().nullable(),
  protocol: nullableText,
  username: nullableText,
  password: nullablePassword,
  adminUsername: nullableText,
  adminPassword: nullablePassword,
  userUsername: nullableText,
  userPassword: nullablePassword,
  internetUsername: nullableText,
  internetPassword: nullablePassword,
  p12Username: nullableText,
  p12Password: nullablePassword,
  emailUsername: nullableText,
  emailPassword: nullablePassword,
  notes: z.string().trim().max(3000).optional().nullable().transform((value) => value || null),
  active: z.boolean().default(true),
});

const hasAnyCredential = (value: z.infer<typeof passwordVaultBaseSchema>) => Boolean(
  value.username || value.password ||
  value.adminUsername || value.adminPassword ||
  value.userUsername || value.userPassword ||
  value.internetUsername || value.internetPassword ||
  value.p12Username || value.p12Password ||
  value.emailUsername || value.emailPassword,
);

export const passwordVaultSchema = passwordVaultBaseSchema.refine((value) => value.entryType === PasswordVaultEntryType.USER || hasAnyCredential(value), {
  message: 'Informe usuário e senha do equipamento',
  path: ['username'],
});

export const updatePasswordVaultSchema = passwordVaultBaseSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'Informe ao menos um campo para atualizar',
});

export const passwordVaultListSchema = z.object({
  search: z.string().trim().optional(),
  entryType: z.nativeEnum(PasswordVaultEntryType).optional(),
  deviceType: z.nativeEnum(PasswordVaultDeviceType).optional(),
  active: z.enum(['true', 'false']).optional(),
});

const include = {
  ipAddress: { select: { id: true, ipAddress: true, hostname: true, description: true } },
  asset: { select: { id: true, name: true, assetTag: true, ipAddress: true, hostname: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.PasswordVaultEntryInclude;

type PasswordVaultWithRelations = Prisma.PasswordVaultEntryGetPayload<{ include: typeof include }>;

function expose(entry: PasswordVaultWithRelations) {
  const {
    passwordEncrypted,
    adminPasswordEncrypted,
    userPasswordEncrypted,
    internetPasswordEncrypted,
    p12PasswordEncrypted,
    emailPasswordEncrypted,
    ...rest
  } = entry;

  return {
    ...rest,
    password: decryptPassword(passwordEncrypted),
    adminPassword: decryptPassword(adminPasswordEncrypted),
    userPassword: decryptPassword(userPasswordEncrypted),
    internetPassword: decryptPassword(internetPasswordEncrypted),
    p12Password: decryptPassword(p12PasswordEncrypted),
    emailPassword: decryptPassword(emailPasswordEncrypted),
  };
}

function summarize(entry: PasswordVaultWithRelations) {
  const {
    passwordEncrypted,
    adminPasswordEncrypted,
    userPasswordEncrypted,
    internetPasswordEncrypted,
    p12PasswordEncrypted,
    emailPasswordEncrypted,
    ...rest
  } = entry;

  return {
    ...rest,
    password: '',
    adminPassword: '',
    userPassword: '',
    internetPassword: '',
    p12Password: '',
    emailPassword: '',
    passwordConfigured: Boolean(passwordEncrypted),
    adminPasswordConfigured: Boolean(adminPasswordEncrypted),
    userPasswordConfigured: Boolean(userPasswordEncrypted),
    internetPasswordConfigured: Boolean(internetPasswordEncrypted),
    p12PasswordConfigured: Boolean(p12PasswordEncrypted),
    emailPasswordConfigured: Boolean(emailPasswordEncrypted),
  };
}

export class PasswordVaultService {
  private requestManagementPage(url: URL, authorization?: string) {
    return new Promise<{ status: number; body: string; contentType: string }>((resolve, reject) => {
      const client = url.protocol === 'https:' ? https : http;
      const request = client.request(url, {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
          'User-Agent': 'IDL-Ativos-Network-Inventory/1.0',
          ...(authorization ? { Authorization: authorization } : {}),
        },
        timeout: 5000,
        // Alguns firmwares TP-Link antigos enviam Content-Length junto com
        // Transfer-Encoding. Navegadores aceitam a resposta; o parser estrito
        // do Node a rejeita sem esta compatibilidade.
        insecureHTTPParser: true,
        ...(url.protocol === 'https:' ? { rejectUnauthorized: false } : {}),
      }, (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size <= 512_000) chunks.push(chunk);
        });
        response.on('end', () => resolve({
          status: response.statusCode || 0,
          body: Buffer.concat(chunks).toString('utf8'),
          contentType: String(response.headers['content-type'] || ''),
        }));
      });
      request.once('timeout', () => request.destroy(new Error('Tempo limite excedido')));
      request.once('error', reject);
      request.end();
    });
  }

  private requestManagementApi(url: URL, body: string, cookie?: string) {
    return new Promise<{ status: number; body: string; cookies: string[] }>((resolve, reject) => {
      const client = url.protocol === 'https:' ? https : http;
      const request = client.request(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Content-Length': Buffer.byteLength(body),
          Origin: `${url.protocol}//${url.host}`,
          Referer: `${url.protocol}//${url.host}/webpages/login.html`,
          'User-Agent': 'Mozilla/5.0 IDL-Ativos-Network-Inventory/1.0',
          'X-Requested-With': 'XMLHttpRequest',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        timeout: 7000,
        insecureHTTPParser: true,
        ...(url.protocol === 'https:' ? { rejectUnauthorized: false } : {}),
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve({
          status: response.statusCode || 0,
          body: Buffer.concat(chunks).toString('utf8'),
          cookies: response.headers['set-cookie'] || [],
        }));
      });
      request.once('timeout', () => request.destroy(new Error('Tempo limite excedido')));
      request.once('error', reject);
      request.end(body);
    });
  }

  private rsaNoPaddingEncrypt(value: string, modulusHex: string, exponentHex: string) {
    const modulus = Buffer.from(modulusHex, 'hex');
    const exponent = Buffer.from(exponentHex, 'hex');
    const plain = Buffer.from(value, 'utf8');
    if (plain.length > modulus.length) throw new Error('A senha é longa demais para o método de autenticação do equipamento');
    const padded = Buffer.alloc(modulus.length);
    plain.copy(padded, 0);
    const base64Url = (buffer: Buffer) => buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const publicKey = crypto.createPublicKey({
      key: { kty: 'RSA', n: base64Url(modulus), e: base64Url(exponent) },
      format: 'jwk',
    });
    return crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_NO_PADDING }, padded).toString('hex');
  }

  private findJsonValue(input: unknown, keys: string[]): string | null {
    const wanted = new Set(keys.map((key) => key.toLowerCase().replace(/[^a-z0-9]/g, '')));
    const visit = (value: unknown, depth: number): string | null => {
      if (!value || depth > 7 || typeof value !== 'object') return null;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (wanted.has(key.toLowerCase().replace(/[^a-z0-9]/g, '')) && ['string', 'number'].includes(typeof child)) {
          const text = String(child).trim();
          if (text) return text;
        }
      }
      for (const child of Object.values(value as Record<string, unknown>)) {
        const found = visit(child, depth + 1);
        if (found) return found;
      }
      return null;
    };
    return visit(input, 0);
  }

  private async inspectTpLinkOmada(host: string, scheme: string, username: string, password: string, withTimestamp: boolean) {
    const base = `${scheme}://${host}`;
    const post = (path: string, body: string, cookie?: string) => this.requestManagementApi(new URL(`${base}${path}`), body, cookie);
    const operationRead = 'operation=read';
    const jsonGet = 'data=%7B%22method%22%3A%22get%22%7D';

    const localeResponse = await post('/cgi-bin/luci/;stok=/locale?form=lang', operationRead);
    const localePayload = JSON.parse(localeResponse.body);
    const uptime = Number(localePayload?.result?.uptime);
    withTimestamp = withTimestamp || Number.isFinite(uptime);
    if (withTimestamp && !Number.isFinite(uptime)) throw new Error('O equipamento não forneceu o tempo necessário para autenticação');

    const keyResponse = await post('/cgi-bin/luci/;stok=/login?form=login', jsonGet);
    const keyPayload = JSON.parse(keyResponse.body);
    const keyParts = keyPayload?.result?.password;
    if (!Array.isArray(keyParts) || keyParts.length < 2) throw new Error('O Omada não forneceu a chave de autenticação');
    const passwordValue = withTimestamp ? `${password}_${uptime}` : password;
    const encryptedPassword = this.rsaNoPaddingEncrypt(passwordValue, String(keyParts[0]), String(keyParts[1]));
    const loginPayload = encodeURIComponent(JSON.stringify({ method: 'login', params: { username, password: encryptedPassword } }));
    const loginResponse = await post('/cgi-bin/luci/;stok=/login?form=login', `data=${loginPayload}`);
    const login = JSON.parse(loginResponse.body);
    if (String(login?.error_code) !== '0' || !login?.result?.stok) {
      throw new Error('A credencial cadastrada não foi aceita pelo roteador');
    }

    const stok = encodeURIComponent(String(login.result.stok));
    const cookie = [...keyResponse.cookies, ...loginResponse.cookies].map((item) => item.split(';')[0]).join('; ');
    const collectedPayloads: unknown[] = [];
    const endpoints = [
      '/admin/system?form=getproduct',
      '/admin/status?form=router',
      '/admin/status?form=all',
      '/admin/status?form=internet',
      '/admin/sys_status?form=all_usage',
      '/login?form=get_deviceInfo',
    ];
    for (const endpoint of endpoints) {
      try {
        const current = await post(`/cgi-bin/luci/;stok=${stok}${endpoint}`, jsonGet, cookie);
        const payload = JSON.parse(current.body);
        if (String(payload?.error_code) === '0') collectedPayloads.push(payload);
      } catch {
        // O conjunto de endpoints muda conforme o modelo e a versão do firmware.
      }
    }
    const status = { result: collectedPayloads };

    return {
      authenticated: true,
      manufacturer: /omada/i.test(String(localePayload?.result?.model_full_name || '')) ? 'TP-Link Omada' : 'TP-Link',
      model: localePayload?.result?.model || null,
      modelFullName: localePayload?.result?.model_full_name || null,
      firmware: this.findJsonValue(status, ['firmware', 'firmwareVersion', 'firmware_version', 'softwareVersion', 'software_version', 'sw_ver', 'softVersion']),
      serialNumber: this.findJsonValue(status, ['serialNumber', 'serial_number', 'serialNo', 'serial_no', 'sn']),
      macAddress: this.findJsonValue(status, ['macAddress', 'mac_address', 'lanMac', 'lan_mac', 'mac']),
      uptime: this.findJsonValue(status, ['uptime', 'systemUptime', 'sys_uptime']),
      status,
    };
  }

  async inspectNetworkDevice(id: string) {
    const entry = await prisma.passwordVaultEntry.findUnique({ where: { id }, include });
    if (!entry) throw new Error('Registro de senha não encontrado');
    if (entry.entryType !== PasswordVaultEntryType.NETWORK_DEVICE) throw new Error('Este registro não é de um dispositivo de rede');

    const host = (entry.host || entry.ipAddress?.ipAddress || entry.asset?.ipAddress || '').trim();
    if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) throw new Error('Vincule um endereço IPv4 ao registro antes de consultar');
    const octets = host.split('.').map(Number);
    if (octets.some((value) => value < 0 || value > 255)) throw new Error('O endereço IPv4 vinculado é inválido');

    const username = entry.username || entry.adminUsername || '';
    const password = decryptPassword(entry.passwordEncrypted || entry.adminPasswordEncrypted);
    const authorization = username && password ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` : undefined;
    const requestedScheme = String(entry.protocol || '').toLowerCase().includes('https') || String(entry.url || '').toLowerCase().startsWith('https:') ? 'https' : 'http';
    const schemes = [...new Set([requestedScheme, requestedScheme === 'https' ? 'http' : 'https'])];
    const paths = [...new Set([
      (() => { try { return entry.url ? new URL(entry.url).pathname || '/' : '/'; } catch { return '/'; } })(),
      '/',
      '/webpages/login.html',
    ])];

    let response: { status: number; body: string; contentType: string } | null = null;
    let managementUrl = '';
    for (const scheme of schemes) {
      for (const path of paths) {
        try {
          const port = entry.port && !([80, 443].includes(entry.port)) ? `:${entry.port}` : '';
          const url = new URL(`${scheme}://${host}${port}${path}`);
          const current = await this.requestManagementPage(url, authorization);
          if (current.status > 0 && current.status < 500) {
            response = current;
            managementUrl = url.toString();
            if (current.body) break;
          }
        } catch {
          // Tenta o próximo protocolo/caminho do equipamento.
        }
      }
      if (response?.body) break;
    }

    if (!response) throw new Error(`O equipamento ${host} não respondeu por HTTP ou HTTPS`);
    const body = response.body;
    const model = (
      body.match(/id=["']_app_model["'][^>]*value=["']([^"']+)/i)?.[1]
      || body.match(/value=["']([^"']+)["'][^>]*id=["']_app_model["']/i)?.[1]
      || body.match(/(?:model|modelName|model_name)["'\s:=]+([A-Z0-9][A-Z0-9._-]{2,30})/i)?.[1]
      || null
    );
    const title = body.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || null;
    const manufacturer = /omada/i.test(body) ? 'TP-Link Omada' : /tp-?link/i.test(body) ? 'TP-Link' : null;
    let firmware = body.match(/(?:firmware|software)["'\s:=]+(?:version["'\s:=]+)?([A-Z0-9][A-Z0-9._ -]{2,60})/i)?.[1]?.trim() || null;
    let serialNumber: string | null = null;
    let macAddress: string | null = null;
    let modelFullName: string | null = null;
    let authenticated = false;
    let authentication = /login\?form=login|form-login|cgi-bin\/luci/i.test(body) ? 'WEB_FORM' : authorization ? 'BASIC_ATTEMPTED' : 'NOT_REQUIRED';

    let authenticatedModel = model;
    if (username && password && /omada|tp-?link|login\?form=login|cgi-bin\/luci/i.test(body)) {
      const scheme = new URL(managementUrl).protocol.replace(':', '');
      const omada = await this.inspectTpLinkOmada(host, scheme, username, password, /withTimestamp\s*:\s*!0|withTimestamp\s*:\s*true/i.test(body));
      authenticated = omada.authenticated;
      authentication = 'AUTHENTICATED';
      authenticatedModel = omada.model || authenticatedModel;
      modelFullName = omada.modelFullName;
      firmware = omada.firmware || firmware;
      serialNumber = omada.serialNumber;
      macAddress = omada.macAddress;
    }

    return {
      entryId: entry.id,
      assetId: entry.assetId,
      host,
      reachable: true,
      status: response.status,
      managementUrl,
      manufacturer,
      model: authenticatedModel,
      modelFullName,
      firmware,
      serialNumber,
      macAddress,
      title: title && title.toLowerCase() !== 'opening...' ? title : null,
      credentialAvailable: Boolean(username && password),
      authenticated,
      authentication,
      message: authenticated
        ? 'Login realizado e informações administrativas consultadas no equipamento.'
        : authenticatedModel || manufacturer
        ? 'Equipamento identificado. Firmware e número de série dependem do que este firmware libera pela interface web.'
        : 'Equipamento acessível, mas a interface não publicou modelo ou firmware nesta consulta.',
    };
  }

  async options() {
    const [ipAddresses, assets] = await Promise.all([
      prisma.networkIpAddress.findMany({
        where: { active: true },
        orderBy: { ipAddress: 'asc' },
        select: { id: true, ipAddress: true, hostname: true, description: true, assetId: true },
      }),
      prisma.asset.findMany({
        orderBy: [{ assetTag: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, assetTag: true, type: true, category: true, ipAddress: true, hostname: true, assignedTo: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    return { ipAddresses, assets };
  }

  async findAll(filters: unknown) {
    const validated = passwordVaultListSchema.parse(filters);
    const where: Prisma.PasswordVaultEntryWhereInput = {};

    if (validated.entryType) where.entryType = validated.entryType;
    if (validated.deviceType) where.deviceType = validated.deviceType;
    if (validated.active) where.active = validated.active === 'true';
    if (validated.search) {
      where.OR = [
        { name: { contains: validated.search, mode: 'insensitive' } },
        { host: { contains: validated.search, mode: 'insensitive' } },
        { url: { contains: validated.search, mode: 'insensitive' } },
        { username: { contains: validated.search, mode: 'insensitive' } },
        { adminUsername: { contains: validated.search, mode: 'insensitive' } },
        { userUsername: { contains: validated.search, mode: 'insensitive' } },
        { internetUsername: { contains: validated.search, mode: 'insensitive' } },
        { p12Username: { contains: validated.search, mode: 'insensitive' } },
        { emailUsername: { contains: validated.search, mode: 'insensitive' } },
        { protocol: { contains: validated.search, mode: 'insensitive' } },
        { notes: { contains: validated.search, mode: 'insensitive' } },
        { ipAddress: { ipAddress: { contains: validated.search, mode: 'insensitive' } } },
        { asset: { name: { contains: validated.search, mode: 'insensitive' } } },
        { asset: { assetTag: { contains: validated.search, mode: 'insensitive' } } },
      ];
    }

    const entries = await prisma.passwordVaultEntry.findMany({
      where,
      include,
      orderBy: [{ active: 'desc' }, { entryType: 'asc' }, { deviceType: 'asc' }, { name: 'asc' }],
    });

    return entries.map(summarize);
  }

  async findById(id: string) {
    const entry = await prisma.passwordVaultEntry.findUnique({ where: { id }, include });
    if (!entry) throw new Error('Registro de senha não encontrado');
    return summarize(entry);
  }

  async reveal(id: string, performedById: string, password: unknown) {
    await auditService.verifyPassword(performedById, password);
    const entry = await prisma.passwordVaultEntry.findUnique({ where: { id }, include });
    if (!entry) throw new Error('Registro de senha não encontrado');
    await auditService.record({
      action: 'REVEAL_PASSWORD',
      resourceType: 'PASSWORD_VAULT',
      resourceId: entry.id,
      resourceName: entry.name,
      performedById,
      details: { revealedAt: new Date().toISOString() },
    });
    return expose(entry);
  }

  async create(input: unknown, createdById: string) {
    const data = passwordVaultSchema.parse(input);
    const entry = await prisma.passwordVaultEntry.create({
      data: {
        name: data.name,
        entryType: data.entryType,
        deviceType: data.deviceType,
        ipAddressId: data.ipAddressId || null,
        assetId: data.assetId || null,
        host: data.host,
        url: data.url,
        port: data.port || null,
        protocol: data.protocol,
        username: data.username,
        passwordEncrypted: encryptPassword(data.password),
        adminUsername: data.adminUsername,
        adminPasswordEncrypted: encryptPassword(data.adminPassword),
        userUsername: data.userUsername,
        userPasswordEncrypted: encryptPassword(data.userPassword),
        internetUsername: data.internetUsername,
        internetPasswordEncrypted: encryptPassword(data.internetPassword),
        p12Username: data.p12Username,
        p12PasswordEncrypted: encryptPassword(data.p12Password),
        emailUsername: data.emailUsername,
        emailPasswordEncrypted: encryptPassword(data.emailPassword),
        notes: data.notes,
        active: data.active,
        createdById,
      },
      include,
    });
    return summarize(entry);
  }

  async update(id: string, input: unknown) {
    await this.findById(id);
    const data = updatePasswordVaultSchema.parse(input);
    const updateData: Prisma.PasswordVaultEntryUpdateInput = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.entryType !== undefined) updateData.entryType = data.entryType;
    if (data.deviceType !== undefined) updateData.deviceType = data.deviceType;
    if (data.ipAddressId !== undefined) updateData.ipAddress = data.ipAddressId ? { connect: { id: data.ipAddressId } } : { disconnect: true };
    if (data.assetId !== undefined) updateData.asset = data.assetId ? { connect: { id: data.assetId } } : { disconnect: true };
    if (data.host !== undefined) updateData.host = data.host;
    if (data.url !== undefined) updateData.url = data.url;
    if (data.port !== undefined) updateData.port = data.port || null;
    if (data.protocol !== undefined) updateData.protocol = data.protocol;
    if (data.username !== undefined) updateData.username = data.username;
    if (data.password !== undefined) updateData.passwordEncrypted = encryptPassword(data.password);
    if (data.adminUsername !== undefined) updateData.adminUsername = data.adminUsername;
    if (data.adminPassword !== undefined) updateData.adminPasswordEncrypted = encryptPassword(data.adminPassword);
    if (data.userUsername !== undefined) updateData.userUsername = data.userUsername;
    if (data.userPassword !== undefined) updateData.userPasswordEncrypted = encryptPassword(data.userPassword);
    if (data.internetUsername !== undefined) updateData.internetUsername = data.internetUsername;
    if (data.internetPassword !== undefined) updateData.internetPasswordEncrypted = encryptPassword(data.internetPassword);
    if (data.p12Username !== undefined) updateData.p12Username = data.p12Username;
    if (data.p12Password !== undefined) updateData.p12PasswordEncrypted = encryptPassword(data.p12Password);
    if (data.emailUsername !== undefined) updateData.emailUsername = data.emailUsername;
    if (data.emailPassword !== undefined) updateData.emailPasswordEncrypted = encryptPassword(data.emailPassword);
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.active !== undefined) updateData.active = data.active;

    const entry = await prisma.passwordVaultEntry.update({ where: { id }, data: updateData, include });
    return summarize(entry);
  }

  async delete(id: string) {
    await this.findById(id);
    await prisma.passwordVaultEntry.delete({ where: { id } });
  }
}
